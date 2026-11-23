/* SPDX-License-Identifier: GPL-3.0-or-later */

import { projectToBdl } from './bdl.js';
import { createSprite, emptyProject, num, str } from './model.js';

function lex(source) {
  const tokens = [];
  let i = 0;
  const s = source;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (s.startsWith('//', i)) {
      const next = s.indexOf('\n', i);
      i = next < 0 ? s.length : next;
      continue;
    }
    if (s.startsWith('/*', i)) {
      const next = s.indexOf('*/', i + 2);
      i = next < 0 ? s.length : next + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      while (j < s.length && s[j] !== quote) {
        if (s[j] === '\\' && j + 1 < s.length) { value += s[j + 1]; j += 2; continue; }
        value += s[j];
        j += 1;
      }
      if (j >= s.length) throw new Error('string');
      tokens.push({ type: 'str', value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      const match = s.slice(i).match(/^\d*\.?\d+/);
      tokens.push({ type: 'num', value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const match = s.slice(i).match(/^[A-Za-z_$][\w$]*/);
      tokens.push({ type: 'id', value: match[0] });
      i += match[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '++', '--', '===', '!=='].includes(two) || s.startsWith('===', i) || s.startsWith('!==', i)) {
      const op = s.startsWith('===', i) ? '===' : s.startsWith('!==', i) ? '!==' : two;
      tokens.push({ type: 'op', value: op });
      i += op.length;
      continue;
    }
    tokens.push({ type: 'op', value: ch });
    i += 1;
  }
  return tokens;
}

function parseJs(source) {
  const tokens = lex(source);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const eat = (value) => {
    const token = peek();
    if (!token || token.value !== value) throw new Error(`expected ${value}`);
    return next();
  };

  function parseBlock() {
    eat('{');
    const body = [];
    while (peek() && peek().value !== '}') body.push(parseStmt());
    eat('}');
    return body;
  }

  function parseStmt() {
    const token = peek();
    if (!token) throw new Error('end');
    if (token.value === ';') { next(); return { type: 'empty' }; }
    if (token.value === '{') return { type: 'block', body: parseBlock() };
    if (token.value === 'function') {
      next();
      const name = next().value;
      eat('('); eat(')');
      return { type: 'fn', name, body: parseBlock() };
    }
    if (token.value === 'if') {
      next(); eat('(');
      const test = parseExpr();
      eat(')');
      const then = parseStmt();
      let alt = null;
      if (peek() && peek().value === 'else') { next(); alt = parseStmt(); }
      return { type: 'if', test, then, alt };
    }
    if (token.value === 'while') {
      next(); eat('(');
      const test = parseExpr();
      eat(')');
      return { type: 'while', test, body: parseStmt() };
    }
    if (token.value === 'for') {
      next(); eat('(');
      const init = parseSimple();
      eat(';');
      const test = parseExpr();
      eat(';');
      const update = parseSimple();
      eat(')');
      return { type: 'for', init, test, update, body: parseStmt() };
    }
    if (token.value === 'return') {
      next();
      const value = peek() && peek().value !== ';' ? parseExpr() : null;
      if (peek() && peek().value === ';') next();
      return { type: 'return', value };
    }
    const simple = parseSimple();
    if (peek() && peek().value === ';') next();
    return simple;
  }

  function parseSimple() {
    const token = peek();
    if (token && (token.value === 'let' || token.value === 'const' || token.value === 'var')) {
      next();
      const name = next().value;
      eat('=');
      return { type: 'decl', name, value: parseExpr() };
    }
    const expr = parseExpr();
    if (peek() && ['=', '+=', '-='].includes(peek().value)) {
      const op = next().value;
      return { type: 'assign', name: expr.name, op, value: parseExpr() };
    }
    if (peek() && peek().value === '++') {
      next();
      return { type: 'assign', name: expr.name, op: '+=', value: { type: 'num', value: 1 } };
    }
    return { type: 'expr', expr };
  }

  function parseExpr() { return parseOr(); }
  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().value === '||') { next(); left = { type: 'bin', op: '||', left, right: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseEq();
    while (peek() && peek().value === '&&') { next(); left = { type: 'bin', op: '&&', left, right: parseEq() }; }
    return left;
  }
  function parseEq() {
    let left = parseRel();
    while (peek() && ['==', '!=', '===', '!=='].includes(peek().value)) {
      const op = next().value;
      left = { type: 'bin', op: op.startsWith('!') ? '!=' : '==', left, right: parseRel() };
    }
    return left;
  }
  function parseRel() {
    let left = parseAdd();
    while (peek() && ['<', '>', '<=', '>='].includes(peek().value)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (peek() && ['+', '-'].includes(peek().value)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: parseMul() };
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (peek() && ['*', '/', '%'].includes(peek().value)) {
      const op = next().value;
      left = { type: 'bin', op, left, right: parseUnary() };
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().value === '!') { next(); return { type: 'not', expr: parseUnary() }; }
    if (peek() && peek().value === '-') { next(); return { type: 'neg', expr: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const token = next();
    if (!token) throw new Error('expr');
    if (token.type === 'num') return { type: 'num', value: token.value };
    if (token.type === 'str') return { type: 'str', value: token.value };
    if (token.type === 'id') {
      if (peek() && peek().value === '(') {
        next();
        const args = [];
        if (!peek() || peek().value !== ')') {
          args.push(parseExpr());
          while (peek() && peek().value === ',') { next(); args.push(parseExpr()); }
        }
        eat(')');
        if (peek() && peek().value === '.') {
          /* console.log is parsed as member before call — handled below if id path */
        }
        return { type: 'call', name: token.value, args };
      }
      if (peek() && peek().value === '.') {
        const object = token.value;
        next();
        const method = next().value;
        eat('(');
        const args = [];
        if (!peek() || peek().value !== ')') {
          args.push(parseExpr());
          while (peek() && peek().value === ',') { next(); args.push(parseExpr()); }
        }
        eat(')');
        return { type: 'method', object, method, args };
      }
      return { type: 'id', name: token.value };
    }
    if (token.value === '(') {
      const expr = parseExpr();
      eat(')');
      return expr;
    }
    throw new Error('expr');
  }

  const body = [];
  while (i < tokens.length) body.push(parseStmt());
  return body;
}

function exprToBdl(expr) {
  if (!expr) return { kind: 'num', value: 0 };
  if (expr.type === 'num') return num(expr.value);
  if (expr.type === 'str') return str(expr.value);
  if (expr.type === 'id') return { kind: 'var', name: expr.name };
  if (expr.type === 'neg') return { kind: 'block', opcode: 'sub', args: [num(0), exprToBdl(expr.expr)] };
  if (expr.type === 'not') return { kind: 'block', opcode: 'not', args: [exprToBdl(expr.expr)] };
  if (expr.type === 'bin') {
    const map = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '>': 'gt', '<': 'lt', '>=': 'lt', '<=': 'gt', '==': 'eq', '!=': 'eq', '&&': 'and', '||': 'or' };
    const opcode = map[expr.op] || 'eq';
    const node = { kind: 'block', opcode, args: [exprToBdl(expr.left), exprToBdl(expr.right)] };
    if (expr.op === '!=') return { kind: 'block', opcode: 'not', args: [node] };
    if (expr.op === '>=') return { kind: 'block', opcode: 'not', args: [{ kind: 'block', opcode: 'lt', args: node.args }] };
    if (expr.op === '<=') return { kind: 'block', opcode: 'not', args: [{ kind: 'block', opcode: 'gt', args: node.args }] };
    return node;
  }
  if (expr.type === 'method' && expr.object === 'console' && expr.method === 'log') {
    return null;
  }
  return str('…');
}

function lowerStmt(stmt, out) {
  if (!stmt || stmt.type === 'empty') return;
  if (stmt.type === 'block') { stmt.body.forEach((item) => lowerStmt(item, out)); return; }
  if (stmt.type === 'fn') {
    const body = [];
    stmt.body.forEach((item) => lowerStmt(item, body));
    out.push({ kind: 'fn', name: stmt.name, body });
    return;
  }
  if (stmt.type === 'decl') {
    out.push({ opcode: 'set', args: [str(stmt.name), exprToBdl(stmt.value)] });
    return;
  }
  if (stmt.type === 'assign' && stmt.op === '=') {
    out.push({ opcode: 'set', args: [str(stmt.name), exprToBdl(stmt.value)] });
    return;
  }
  if (stmt.type === 'assign' && stmt.op === '+=') {
    out.push({ opcode: 'change', args: [str(stmt.name), exprToBdl(stmt.value)] });
    return;
  }
  if (stmt.type === 'if') {
    const body = [];
    lowerStmt(stmt.then, body);
    const elseBody = [];
    if (stmt.alt) lowerStmt(stmt.alt, elseBody);
    out.push({ opcode: 'if', args: [exprToBdl(stmt.test)], body, elseBody });
    return;
  }
  if (stmt.type === 'while') {
    const body = [];
    lowerStmt(stmt.body, body);
    out.push({ opcode: 'repeatuntil', args: [{ kind: 'block', opcode: 'not', args: [exprToBdl(stmt.test)] }], body, elseBody: null });
    return;
  }
  if (stmt.type === 'for') {
    const count = forCount(stmt);
    if (stmt.init) lowerStmt(stmt.init, out);
    const body = [];
    lowerStmt(stmt.body, body);
    if (count == null) out.push({ opcode: 'comment', args: [str('for')] });
    else out.push({ opcode: 'repeat', args: [num(count)], body, elseBody: null });
    return;
  }
  if (stmt.type === 'return') {
    out.push({ opcode: 'comment', args: [str('return')] });
    return;
  }
  if (stmt.type === 'expr' && stmt.expr?.type === 'method' && stmt.expr.object === 'console') {
    const arg = stmt.expr.args[0];
    out.push({ opcode: 'say', args: [exprToBdl(arg) || str(''), num(1)] });
    return;
  }
  if (stmt.type === 'expr' && stmt.expr?.type === 'call') {
    out.push({ opcode: 'call', args: [str(stmt.expr.name)] });
  }
}

function forCount(stmt) {
  const initZero = stmt.init && (stmt.init.type === 'decl' || stmt.init.type === 'assign') && stmt.init.value?.type === 'num' && stmt.init.value.value === 0;
  const test = stmt.test;
  const step = stmt.update && stmt.update.type === 'assign' && stmt.update.op === '+=' && stmt.update.value?.type === 'num' && stmt.update.value.value === 1;
  if (!initZero || !step || !test || test.type !== 'bin' || test.op !== '<' || test.right?.type !== 'num') return null;
  return test.right.value;
}

function numbered(source) {
  return source.split(/\r?\n/).map((line, index) => `${index + 1}  ${line}`).join('\n');
}

export function decompileJs(source) {
  const warnings = [];
  try {
    const ast = parseJs(source);
    const flat = [];
    ast.forEach((stmt) => lowerStmt(stmt, flat));
    const project = emptyProject();
    const sprite = createSprite('Import');
    const calls = [];
    for (const item of flat) {
      if (item.kind === 'fn') {
        sprite.scripts.push({ id: item.name, x: 40, y: 40, proc: item.name, blocks: item.body });
        calls.push({ opcode: 'call', args: [str(item.name)], body: null, elseBody: null });
      }
    }
    const loose = flat.filter((item) => item.kind !== 'fn');
    sprite.scripts.push({
      id: 'main',
      x: 48,
      y: 48,
      proc: null,
      blocks: [
        { opcode: 'whenflag', args: [], body: null, elseBody: null },
        ...loose,
        ...calls,
      ],
    });
    project.sprites = [sprite];
    const bdl = projectToBdl(project, { full: false });
    const pseudo = [
      'JavaScript → Pseudocode',
      ...flat.map((item) => (item.kind === 'fn' ? `function ${item.name}` : item.opcode)),
    ].join('\n');
    if (!flat.length) warnings.push('empty');
    return { bdl, pseudo, warnings, ok: true };
  } catch (error) {
    warnings.push(error.message || 'parse');
    return { bdl: '', pseudo: numbered(source), warnings, ok: false };
  }
}
