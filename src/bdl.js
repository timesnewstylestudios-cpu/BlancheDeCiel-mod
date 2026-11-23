/* SPDX-License-Identifier: GPL-3.0-or-later
 * BDL — BlancheDeCiel description language. Compact text the editor and the model share.
 */

import { specByOpcode, COMMAND_OPCODES, REPORTER_OPCODES } from './catalog.js';
import { cloneData, ensureSprite, runnableScripts, uid } from './model.js';

const FILE_ONLY = new Set([
  'title', 'tempo', 'tables-reset', 'cleartable', 'table', 'sprite',
  'pos', 'dir', 'shown', 'scale', 'pen', 'var', 'list', 'clear-scripts',
  'define', 'script', 'edit', 'delscript', 'end', 'else',
]);

const STRUCTURE = new Set(['repeat', 'forever', 'if', 'repeatuntil']);

export const KEYWORDS = [
  'sprite', 'pos', 'dir', 'shown', 'scale', 'pen', 'var', 'list', 'script', 'end', 'else',
  'define', 'clear-scripts', 'cleartable', 'table', 'tables-reset', 'edit', 'replace', 'insert',
  'delete', 'delscript', 'title', 'tempo', 'when', 'flag', 'key', 'click', 'receive',
];

function commandArity(opcode) {
  if (opcode === 'ext') return { min: 2, max: 16 };
  const spec = specByOpcode(opcode);
  if (!spec || !['command', 'c', 'celse'].includes(spec.type)) return null;
  const args = spec.args || [];
  const optional = args.filter((arg) => arg.optional).length;
  return {
    min: args.length - optional,
    max: opcode === 'row' ? 32 : args.length,
  };
}

const COMMAND_SET = new Set([...COMMAND_OPCODES, 'ext']);

export function docTokens() {
  return [...new Set([
    ...KEYWORDS,
    ...COMMAND_OPCODES,
    'ext',
    ...REPORTER_OPCODES,
  ])];
}

function codeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readString(source, index) {
  let cursor = index + 1;
  let value = '';
  while (cursor < source.length && source[cursor] !== '"') {
    if (source[cursor] === '\\' && cursor + 1 < source.length) {
      const next = source[cursor + 1];
      value += next === 'n' ? '\n' : next;
      cursor += 2;
      continue;
    }
    value += source[cursor];
    cursor += 1;
  }
  if (cursor >= source.length) throw codeError('unclosed-string');
  return { value, index: cursor + 1 };
}

export function tokenize(line) {
  const source = line.trim();
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === ' ' || ch === '\t') {
      index += 1;
      continue;
    }
    if (ch === '#') {
      const match = source.slice(index).match(/^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/);
      if (match && tokens.length) {
        tokens.push({ type: 'color', value: match[0] });
        index += match[0].length;
        continue;
      }
      break;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: ch, value: ch });
      index += 1;
      continue;
    }
    if (ch === '"') {
      const read = readString(source, index);
      tokens.push({ type: 'str', value: read.value });
      index = read.index;
      continue;
    }
    if (ch === '$') {
      index += 1;
      if (source[index] === '"') {
        const read = readString(source, index);
        tokens.push({ type: 'var', value: read.value });
        index = read.index;
        continue;
      }
      const match = source.slice(index).match(/^[^\s()"$#]+/);
      if (!match) throw codeError('bad-expr');
      tokens.push({ type: 'var', value: match[0] });
      index += match[0].length;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9') || (ch === '.' && source[index + 1] >= '0' && source[index + 1] <= '9')) {
      const match = source.slice(index).match(/^-?(?:\d+\.\d+|\d+|\.\d+)/);
      if (match && (ch !== '-' || match[0].length > 1)) {
        tokens.push({ type: 'num', value: Number(match[0]) });
        index += match[0].length;
        continue;
      }
    }
    const word = source.slice(index).match(/^[^\s()"$#]+/);
    if (!word) throw codeError('bad-token');
    tokens.push({ type: 'word', value: word[0] });
    index += word[0].length;
  }
  return tokens;
}

function parseExprs(tokens) {
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];
  function parseExpr() {
    const token = next();
    if (!token) throw codeError('bad-expr');
    if (token.type === 'num') return { kind: 'num', value: token.value };
    if (token.type === 'str' || token.type === 'word' || token.type === 'color') {
      return { kind: 'str', value: token.value };
    }
    if (token.type === 'var') return { kind: 'var', name: token.value };
    if (token.type === '(') {
      const first = peek();
      if (!first) throw codeError('bad-expr');
      if (first.type !== 'word') {
        const inner = parseExpr();
        const close = next();
        if (!close || close.type !== ')') throw codeError('bad-expr');
        return inner;
      }
      const opcode = next().value;
      const args = [];
      while (peek() && peek().type !== ')') args.push(parseExpr());
      const close = next();
      if (!close || close.type !== ')') throw codeError('bad-expr');
      return { kind: 'block', opcode, args };
    }
    throw codeError('bad-expr');
  }
  const exprs = [];
  while (index < tokens.length) exprs.push(parseExpr());
  return exprs;
}

function asNumber(expr, fallback = 0) {
  if (!expr) return fallback;
  if (expr.kind === 'num') return expr.value;
  if (expr.kind === 'str' && expr.value.trim() !== '' && Number.isFinite(Number(expr.value))) return Number(expr.value);
  return fallback;
}

function asText(expr) {
  if (!expr) return '';
  if (expr.kind === 'str' || expr.kind === 'num') return String(expr.value);
  if (expr.kind === 'var') return expr.name;
  return '';
}

function constEval(expr) {
  if (!expr) return 0;
  if (expr.kind === 'num') return expr.value;
  if (expr.kind === 'str') return expr.value;
  if (expr.kind === 'var') throw codeError('const-var');
  if (expr.kind === 'block') {
    const args = expr.args.map(constEval);
    const [a, b] = args;
    const numA = Number(a);
    const numB = Number(b);
    switch (expr.opcode) {
      case 'add': return numA + numB;
      case 'sub': return numA - numB;
      case 'mul': return numA * numB;
      case 'div': return numB === 0 ? Infinity : numA / numB;
      case 'mod': return numB === 0 ? NaN : ((numA % numB) + numB) % numB;
      case 'round': return Math.round(numA);
      case 'join': return `${a}${b}`;
      default: throw codeError('const-op');
    }
  }
  throw codeError('const-op');
}

function makeBlock(opcode, args, extra = {}) {
  return {
    opcode,
    args,
    body: extra.body ?? null,
    elseBody: extra.elseBody ?? null,
  };
}

function parseWhen(tokens) {
  const kind = tokens[1] && (tokens[1].type === 'word' || tokens[1].type === 'str') ? tokens[1].value : '';
  if (kind === 'flag' && tokens.length === 2) return makeBlock('whenflag', []);
  if (kind === 'click' && tokens.length === 2) return makeBlock('whenclick', []);
  if (kind === 'key') {
    const exprs = parseExprs(tokens.slice(2));
    if (exprs.length !== 1) throw codeError('arity');
    return makeBlock('whenkey', exprs);
  }
  if (kind === 'receive') {
    const exprs = parseExprs(tokens.slice(2));
    if (exprs.length !== 1) throw codeError('arity');
    return makeBlock('whenreceive', exprs);
  }
  throw codeError('arity');
}

function parseFlatCommand(tokens) {
  if (!tokens.length || tokens[0].type !== 'word') throw codeError('edit-command');
  const opcode = tokens[0].value;
  if (opcode === 'when') return parseWhen(tokens);
  if (STRUCTURE.has(opcode)) {
    const arity = commandArity(opcode);
    const exprs = opcode === 'forever' ? [] : parseExprs(tokens.slice(1));
    if (arity && (exprs.length < arity.min || exprs.length > arity.max)) throw codeError('arity');
    return makeBlock(opcode, exprs, {
      body: [],
      elseBody: opcode === 'if' ? [] : null,
    });
  }
  const arity = commandArity(opcode);
  if (!arity) throw codeError('unknown-opcode');
  const exprs = parseExprs(tokens.slice(1));
  if (exprs.length < arity.min || exprs.length > arity.max) throw codeError('arity');
  return makeBlock(opcode, exprs);
}

export function extractBdl(text) {
  if (!text) return '';
  const fence = String(text).match(/```(?:bdl|text)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : String(text)).trim();
}

export function parseBdl(source) {
  const errors = [];
  const file = {
    title: null,
    tempo: null,
    shader: null,
    camera: null,
    rotation: null,
    reset3d: false,
    boxes: [],
    resetTables: false,
    tableClears: [],
    tableRows: [],
    sprites: [],
    errors,
  };
  let sprite = null;
  const stack = [];
  const lines = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');

  const fail = (line, error) => {
    errors.push({ line, code: error.code || 'bad-token' });
  };

  const inside = () => stack.length > 0;
  const frame = () => stack[stack.length - 1];
  const currentList = () => {
    if (!stack.length) return null;
    const top = frame();
    if (top.type === 'c') return top.slot === 'else' ? top.block.elseBody : top.block.body;
    if (top.type === 'script' || top.type === 'define') return top.blocks;
    return null;
  };

  lines.forEach((raw, index) => {
    const line = index + 1;
    let tokens;
    try {
      tokens = tokenize(raw);
    } catch (error) {
      fail(line, error);
      return;
    }
    if (!tokens.length) return;
    if (tokens[0].type !== 'word') {
      fail(line, codeError('bad-token'));
      return;
    }
    const op = tokens[0].value;
    try {
      if (op === 'end') {
        if (!stack.length) fail(line, codeError('end-without-start'));
        else stack.pop();
        return;
      }
      if (op === 'else') {
        const top = frame();
        if (!top || top.type !== 'c' || top.block.opcode !== 'if') fail(line, codeError('else-without-if'));
        else top.slot = 'else';
        return;
      }
      if (inside() && frame().type === 'edit') {
        if (op !== 'replace' && op !== 'insert' && op !== 'delete') throw codeError('edit-command');
        if (!tokens[1] || tokens[1].type !== 'num') throw codeError('index');
        const at = tokens[1].value;
        if (op === 'delete') {
          frame().ops.push({ op, index: at });
          return;
        }
        frame().ops.push({ op, index: at, block: parseFlatCommand(tokens.slice(2)) });
        return;
      }
      if (!inside() && op === 'title') {
        const exprs = parseExprs(tokens.slice(1));
        if (exprs.length !== 1) throw codeError('arity');
        file.title = asText(exprs[0]);
        return;
      }
      if (!inside() && op === 'tempo') {
        const exprs = parseExprs(tokens.slice(1));
        if (exprs.length !== 1) throw codeError('arity');
        file.tempo = asNumber(exprs[0], 120);
        return;
      }
      if (!inside() && op === 'tables-reset') {
        file.resetTables = true;
        return;
      }
      if (!inside() && op === 'cleartable') {
        const exprs = parseExprs(tokens.slice(1));
        if (exprs.length !== 1) throw codeError('arity');
        file.tableClears.push(asText(exprs[0]));
        return;
      }
      if (!inside() && op === 'table') {
        const exprs = parseExprs(tokens.slice(1));
        if (exprs.length < 1) throw codeError('arity');
        file.tableRows.push({ name: asText(exprs[0]), cells: exprs.slice(1).map(constEval) });
        return;
      }
      if (!inside() && (op === 'shader' || op === 'cam' || op === 'rot3d' || op === 'box3d' || op === 'clear3d')) {
        const exprs = op === 'clear3d' ? [] : parseExprs(tokens.slice(1));
        if (op === 'shader') {
          if (exprs.length !== 1) throw codeError('arity');
          file.shader = asText(exprs[0]);
        } else if (op === 'cam') {
          if (exprs.length !== 3) throw codeError('arity');
          file.camera = { x: asNumber(exprs[0]), y: asNumber(exprs[1]), z: asNumber(exprs[2]) };
        } else if (op === 'rot3d') {
          if (exprs.length !== 2) throw codeError('arity');
          file.rotation = { yaw: asNumber(exprs[0]), pitch: asNumber(exprs[1]) };
        } else if (op === 'box3d') {
          if (exprs.length !== 4) throw codeError('arity');
          file.boxes.push({
            x: asNumber(exprs[0]),
            y: asNumber(exprs[1]),
            z: asNumber(exprs[2]),
            size: asNumber(exprs[3]),
            color: '#2E86AB',
          });
        } else file.reset3d = true;
        return;
      }
      if (!inside() && op === 'sprite') {
        const exprs = parseExprs(tokens.slice(1));
        if (exprs.length !== 1) throw codeError('arity');
        sprite = {
          name: asText(exprs[0]),
          pos: null,
          dir: null,
          shown: null,
          scale: null,
          pen: null,
          vars: [],
          lists: [],
          clear: false,
          delscripts: [],
          defines: [],
          scripts: [],
          edits: [],
        };
        file.sprites.push(sprite);
        return;
      }
      if (!sprite) throw codeError('need-sprite');
      if (!inside() && ['pos', 'dir', 'shown', 'scale', 'pen', 'var', 'list', 'clear-scripts', 'delscript', 'define', 'script', 'edit'].includes(op)) {
        const exprs = ['clear-scripts'].includes(op) ? [] : parseExprs(tokens.slice(1));
        if (op === 'pos') {
          if (exprs.length !== 2) throw codeError('arity');
          sprite.pos = { x: asNumber(exprs[0]), y: asNumber(exprs[1]) };
        } else if (op === 'dir') {
          if (exprs.length !== 1) throw codeError('arity');
          sprite.dir = asNumber(exprs[0], 90);
        } else if (op === 'shown') {
          if (exprs.length !== 1) throw codeError('arity');
          sprite.shown = asNumber(exprs[0], 1) !== 0;
        } else if (op === 'scale') {
          if (exprs.length !== 1) throw codeError('arity');
          sprite.scale = asNumber(exprs[0], 100);
        } else if (op === 'pen') {
          if (exprs.length !== 2) throw codeError('arity');
          sprite.pen = { color: asText(exprs[0]), size: asNumber(exprs[1], 1) };
        } else if (op === 'var') {
          if (exprs.length !== 2) throw codeError('arity');
          sprite.vars.push({ name: asText(exprs[0]), value: constEval(exprs[1]) });
        } else if (op === 'list') {
          if (exprs.length < 1) throw codeError('arity');
          sprite.lists.push({ name: asText(exprs[0]), items: exprs.slice(1).map(constEval) });
        } else if (op === 'clear-scripts') sprite.clear = true;
        else if (op === 'delscript') {
          if (exprs.length !== 1) throw codeError('arity');
          sprite.delscripts.push(asNumber(exprs[0], 0));
        } else if (op === 'define') {
          if (exprs.length !== 1) throw codeError('arity');
          const blocks = [];
          sprite.defines.push({ name: asText(exprs[0]), blocks });
          stack.push({ type: 'define', blocks });
        } else if (op === 'script') {
          if (exprs.length !== 2) throw codeError('arity');
          const blocks = [];
          sprite.scripts.push({ x: asNumber(exprs[0]), y: asNumber(exprs[1]), blocks });
          stack.push({ type: 'script', blocks });
        } else if (op === 'edit') {
          if (exprs.length !== 1) throw codeError('arity');
          const ops = [];
          sprite.edits.push({ index: asNumber(exprs[0], 0), ops });
          stack.push({ type: 'edit', ops });
        }
        return;
      }
      if (STRUCTURE.has(op)) {
        const arity = commandArity(op);
        const exprs = op === 'forever' ? [] : parseExprs(tokens.slice(1));
        if (exprs.length < arity.min || exprs.length > arity.max) throw codeError('arity');
        const block = makeBlock(op, exprs, { body: [], elseBody: op === 'if' ? [] : null });
        const list = currentList();
        if (!list) throw codeError('need-script');
        list.push(block);
        stack.push({ type: 'c', block, slot: 'body' });
        return;
      }
      if (op === 'when') {
        const list = currentList();
        if (!list) throw codeError('need-script');
        list.push(parseWhen(tokens));
        return;
      }
      if (FILE_ONLY.has(op)) throw codeError('need-script');
      const arity = commandArity(op);
      if (!arity || !COMMAND_SET.has(op)) throw codeError('unknown-opcode');
      const exprs = parseExprs(tokens.slice(1));
      if (exprs.length < arity.min || exprs.length > arity.max) throw codeError('arity');
      const list = currentList();
      if (!list) throw codeError('need-script');
      list.push(makeBlock(op, exprs));
    } catch (error) {
      fail(line, error);
    }
  });
  if (stack.length) errors.push({ line: lines.length || 1, code: 'unclosed-block' });
  return file;
}

function materialize(block) {
  return {
    id: uid(),
    opcode: block.opcode,
    args: block.args || [],
    body: block.body ? block.body.map(materialize) : null,
    elseBody: block.elseBody ? block.elseBody.map(materialize) : null,
  };
}

function placeFlat(list, op, index, block) {
  const at = Math.max(0, Math.floor(index) - 1);
  if (op === 'delete') {
    if (at < 0 || at >= list.length) return false;
    list.splice(at, 1);
    return true;
  }
  if (op === 'replace') {
    if (at < 0 || at >= list.length) return false;
    list.splice(at, 1, materialize(block));
    return true;
  }
  if (at > list.length) return false;
  list.splice(at, 0, materialize(block));
  return true;
}

export function applyBdl(project, parsed) {
  const file = typeof parsed === 'string' ? parseBdl(extractBdl(parsed)) : parsed;
  if (file.errors.length) return { ok: false, errors: file.errors };
  const draft = cloneData(project);
  const applied = applyParsed(draft, file);
  if (!applied.ok) return applied;
  for (const key of Object.keys(project)) delete project[key];
  Object.assign(project, draft);
  return { ok: true, errors: [] };
}

function applyParsed(project, file) {
  if (file.title != null) project.name = file.title;
  if (file.tempo != null) project.tempo = file.tempo || 120;
  if (file.shader != null) project.shader = file.shader;
  if (file.reset3d) project.boxes = [];
  if (file.camera) {
    project.camera.x = file.camera.x;
    project.camera.y = file.camera.y;
    project.camera.z = file.camera.z;
  }
  if (file.rotation) {
    project.camera.yaw = file.rotation.yaw;
    project.camera.pitch = file.rotation.pitch;
  }
  for (const box of file.boxes) project.boxes.push({ ...box });
  if (file.resetTables) project.tables = {};
  for (const name of file.tableClears) project.tables[name] = [];
  for (const row of file.tableRows) {
    if (!project.tables[row.name]) project.tables[row.name] = [];
    project.tables[row.name].push(row.cells);
  }
  for (const entry of file.sprites) {
    const sprite = ensureSprite(project, entry.name);
    if (entry.pos) {
      sprite.x = entry.pos.x;
      sprite.y = entry.pos.y;
    }
    if (entry.dir != null) sprite.dir = entry.dir;
    if (entry.shown != null) sprite.visible = entry.shown;
    if (entry.scale != null) sprite.size = entry.scale;
    if (entry.pen) {
      sprite.penColor = entry.pen.color;
      sprite.penSize = entry.pen.size;
    }
    for (const variable of entry.vars) sprite.variables[variable.name] = variable.value;
    for (const list of entry.lists) sprite.lists[list.name] = list.items.slice();
    if (entry.clear) sprite.scripts = [];
    for (const index of entry.delscripts) {
      const runnable = runnableScripts(sprite);
      const target = runnable[index - 1];
      if (target) sprite.scripts = sprite.scripts.filter((script) => script !== target);
    }
    for (const define of entry.defines) {
      sprite.scripts = sprite.scripts.filter((script) => script.proc !== define.name);
      sprite.scripts.push({
        id: uid(),
        x: 36,
        y: 36 + sprite.scripts.length * 16,
        proc: define.name,
        blocks: define.blocks.map(materialize),
      });
    }
    for (const script of entry.scripts) {
      sprite.scripts.push({
        id: uid(),
        x: script.x,
        y: script.y,
        proc: null,
        blocks: script.blocks.map(materialize),
      });
    }
    for (const edit of entry.edits) {
      const runnable = runnableScripts(sprite);
      const script = runnable[edit.index - 1];
      if (!script) return { ok: false, errors: [{ line: 0, code: 'index' }] };
      for (const step of edit.ops) {
        if (!placeFlat(script.blocks, step.op, step.index, step.block)) {
          return { ok: false, errors: [{ line: 0, code: 'index' }] };
        }
      }
    }
  }
  return { ok: true, errors: [] };
}

const RESERVED = new Set([
  ...KEYWORDS,
  ...COMMAND_OPCODES,
  'ext',
  ...REPORTER_OPCODES,
]);

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  if (Object.is(value, -0)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10000) / 10000);
}

function formatWord(value) {
  const text = String(value);
  if (text === '') return '""';
  if (/^-?(?:\d+\.\d+|\d+|\.\d+)$/.test(text)) return JSON.stringify(text);
  if (RESERVED.has(text) || /[\s()"$#]/.test(text)) return JSON.stringify(text);
  return text;
}

export function formatExpr(expr) {
  if (!expr) return '0';
  if (expr.kind === 'num') return formatNumber(expr.value);
  if (expr.kind === 'str') return formatWord(expr.value);
  if (expr.kind === 'var') {
    const name = expr.name;
    if (/[\s()"$#]/.test(name) || name === '') return `$"${String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    return `$${name}`;
  }
  if (expr.kind === 'block') {
    if (expr.opcode === 'var' && expr.args.length === 1 && expr.args[0].kind === 'str') {
      return formatExpr({ kind: 'var', name: expr.args[0].value });
    }
    const args = (expr.args || []).map(formatExpr).join(' ');
    return args ? `(${expr.opcode} ${args})` : `(${expr.opcode})`;
  }
  return '0';
}

function formatLiteral(value) {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return formatWord(value);
}

function emitBlock(block, indent, lines, budget) {
  if (budget.left <= 0) {
    lines.push(`${'  '.repeat(indent)}comment …`);
    budget.left -= 1;
    return;
  }
  budget.left -= 1;
  const pad = '  '.repeat(indent);
  if (block.opcode === 'whenflag') {
    lines.push(`${pad}when flag`);
    return;
  }
  if (block.opcode === 'whenkey') {
    lines.push(`${pad}when key ${formatExpr(block.args[0])}`);
    return;
  }
  if (block.opcode === 'whenclick') {
    lines.push(`${pad}when click`);
    return;
  }
  if (block.opcode === 'whenreceive') {
    lines.push(`${pad}when receive ${formatExpr(block.args[0])}`);
    return;
  }
  if (block.opcode === 'forever' || block.opcode === 'repeat' || block.opcode === 'repeatuntil' || block.opcode === 'if') {
    if (block.opcode === 'forever') lines.push(`${pad}forever`);
    else lines.push(`${pad}${block.opcode} ${formatExpr(block.args[0])}`);
    emitBlocks(block.body || [], indent + 1, lines, budget);
    if (block.opcode === 'if' && block.elseBody && block.elseBody.length) {
      lines.push(`${pad}else`);
      emitBlocks(block.elseBody, indent + 1, lines, budget);
    }
    lines.push(`${pad}end`);
    return;
  }
  const args = (block.args || []).map(formatExpr).join(' ');
  lines.push(`${pad}${block.opcode}${args ? ` ${args}` : ''}`);
}

function emitBlocks(blocks, indent, lines, budget) {
  for (const block of blocks) emitBlock(block, indent, lines, budget);
}

export function projectToBdl(project, options = {}) {
  const full = options.full !== false;
  const lines = [];
  const budget = { left: options.maxBlocks ?? 100000 };
  if (full) {
    lines.push(`title ${formatWord(project.name || 'Projekt')}`);
    lines.push(`tempo ${formatNumber(project.tempo || 120)}`);
    lines.push(`shader ${formatWord(project.shader || 'none')}`);
    lines.push(`cam ${formatNumber(project.camera?.x || 0)} ${formatNumber(project.camera?.y || 0)} ${formatNumber(project.camera?.z || 280)}`);
    lines.push(`rot3d ${formatNumber(project.camera?.yaw ?? 30)} ${formatNumber(project.camera?.pitch ?? 20)}`);
    lines.push('clear3d');
    for (const box of project.boxes || []) {
      lines.push(`box3d ${formatNumber(box.x)} ${formatNumber(box.y)} ${formatNumber(box.z)} ${formatNumber(box.size)}`);
    }
    lines.push('tables-reset');
    for (const [name, rows] of Object.entries(project.tables || {})) {
      lines.push(`cleartable ${formatWord(name)}`);
      for (const row of rows) {
        const cells = (row || []).map(formatLiteral).join(' ');
        lines.push(`table ${formatWord(name)}${cells ? ` ${cells}` : ''}`);
      }
    }
  }
  for (const sprite of project.sprites) {
    lines.push(`sprite ${formatWord(sprite.name)}`);
    lines.push(`pos ${formatNumber(sprite.x)} ${formatNumber(sprite.y)}`);
    lines.push(`dir ${formatNumber(sprite.dir)}`);
    lines.push(`scale ${formatNumber(sprite.size)}`);
    lines.push(`shown ${sprite.visible ? 1 : 0}`);
    lines.push(`pen ${formatWord(sprite.penColor)} ${formatNumber(sprite.penSize)}`);
    for (const [name, value] of Object.entries(sprite.variables || {})) {
      lines.push(`var ${formatWord(name)} ${formatLiteral(value)}`);
    }
    for (const [name, items] of Object.entries(sprite.lists || {})) {
      const tail = (items || []).map(formatLiteral).join(' ');
      lines.push(`list ${formatWord(name)}${tail ? ` ${tail}` : ''}`);
    }
    lines.push('clear-scripts');
    for (const script of sprite.scripts.filter((item) => item.proc)) {
      lines.push(`define ${formatWord(script.proc)}`);
      emitBlocks(script.blocks, 1, lines, budget);
      lines.push('end');
    }
    for (const script of sprite.scripts.filter((item) => !item.proc)) {
      lines.push(`script ${formatNumber(script.x)} ${formatNumber(script.y)}`);
      emitBlocks(script.blocks, 1, lines, budget);
      lines.push('end');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function errorText(error, lang) {
  const de = {
    'unclosed-string': 'Zeichenkette nicht geschlossen',
    'bad-token': 'Zeichen nicht erkannt',
    'bad-expr': 'Ausdruck unvollständig',
    'end-without-start': 'end ohne passenden Anfang',
    'else-without-if': 'else ohne falls',
    'need-sprite': 'Zuerst eine Figur mit sprite angeben',
    'need-script': 'Dieser Befehl steht außerhalb eines Skripts',
    'unknown-opcode': 'Unbekannter Befehl',
    arity: 'Anzahl der Argumente passt nicht',
    'unclosed-block': 'Ein Skript oder Block ist nicht mit end geschlossen',
    'const-var': 'Startwerte dürfen keine Variablen lesen',
    'const-op': 'Dieser Startwert lässt sich nicht ausrechnen',
    'edit-command': 'In edit sind nur replace, insert und delete erlaubt',
    index: 'Skript- oder Blockindex außerhalb des Bereichs',
  };
  const en = {
    'unclosed-string': 'Unclosed string',
    'bad-token': 'Unrecognized token',
    'bad-expr': 'Incomplete expression',
    'end-without-start': 'end without a matching start',
    'else-without-if': 'else without if',
    'need-sprite': 'Name a sprite with sprite first',
    'need-script': 'This command is outside a script',
    'unknown-opcode': 'Unknown command',
    arity: 'Wrong number of arguments',
    'unclosed-block': 'A script or block is missing end',
    'const-var': 'Initial values cannot read variables',
    'const-op': 'This initial value cannot be computed',
    'edit-command': 'Inside edit, only replace, insert and delete are allowed',
    index: 'Script or block index is out of range',
  };
  const table = lang === 'en' ? en : de;
  const label = table[error.code] || error.code;
  return error.line ? `${label} (${lang === 'en' ? 'line' : 'Zeile'} ${error.line})` : label;
}
