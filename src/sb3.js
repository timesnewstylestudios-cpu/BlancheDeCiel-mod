/* SPDX-License-Identifier: GPL-3.0-or-later */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { md5 } from './hash.js';
import { block, createSprite, emptyProject, num, str, uid } from './model.js';

const PNG_1X1 = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
), (char) => char.charCodeAt(0));

const COMMANDS = {
  motion_movesteps: ['move', ['STEPS']],
  motion_turnright: ['turn', ['DEGREES']],
  motion_turnleft: ['turnl', ['DEGREES']],
  motion_gotoxy: ['goto', ['X', 'Y']],
  motion_setx: ['setx', ['X']],
  motion_changexby: ['changex', ['DX']],
  motion_sety: ['sety', ['Y']],
  motion_changeyby: ['changey', ['DY']],
  motion_pointindirection: ['point', ['DIRECTION']],
  motion_xposition: ['x', []],
  motion_yposition: ['y', []],
  motion_direction: ['dir', []],
  looks_sayforsecs: ['say', ['MESSAGE', 'SECS']],
  looks_say: ['say', ['MESSAGE']],
  looks_thinkforsecs: ['think', ['MESSAGE', 'SECS']],
  looks_think: ['think', ['MESSAGE']],
  looks_show: ['show', []],
  looks_hide: ['hide', []],
  looks_setsizeto: ['setsize', ['SIZE']],
  looks_changesizeby: ['changesize', ['CHANGE']],
  looks_size: ['size', []],
  event_whenflagclicked: ['whenflag', []],
  event_whenkeypressed: ['whenkey', []],
  event_whenthisspriteclicked: ['whenclick', []],
  event_whenbroadcastreceived: ['whenreceive', []],
  event_broadcast: ['broadcast', ['BROADCAST_INPUT']],
  event_broadcastandwait: ['broadcast', ['BROADCAST_INPUT']],
  control_wait: ['wait', ['DURATION']],
  control_repeat: ['repeat', ['TIMES']],
  control_forever: ['forever', []],
  control_if: ['if', ['CONDITION']],
  control_if_else: ['if', ['CONDITION']],
  control_repeat_until: ['repeatuntil', ['CONDITION']],
  sensing_askandwait: ['ask', ['QUESTION']],
  sensing_answer: ['answer', []],
  sensing_timer: ['timer', []],
  sensing_resettimer: ['resettimer', []],
  sensing_mousex: ['mousex', []],
  sensing_mousey: ['mousey', []],
  sensing_mousedown: ['mousedown', []],
  sensing_keypressed: ['keydown', ['KEY_OPTION']],
  operator_add: ['add', ['NUM1', 'NUM2']],
  operator_subtract: ['sub', ['NUM1', 'NUM2']],
  operator_multiply: ['mul', ['NUM1', 'NUM2']],
  operator_divide: ['div', ['NUM1', 'NUM2']],
  operator_mod: ['mod', ['NUM1', 'NUM2']],
  operator_round: ['round', ['NUM']],
  operator_random: ['rand', ['FROM', 'TO']],
  operator_join: ['join', ['STRING1', 'STRING2']],
  operator_length: ['strlen', ['STRING']],
  operator_letter_of: ['letter', ['LETTER', 'STRING']],
  operator_gt: ['gt', ['OPERAND1', 'OPERAND2']],
  operator_lt: ['lt', ['OPERAND1', 'OPERAND2']],
  operator_equals: ['eq', ['OPERAND1', 'OPERAND2']],
  operator_and: ['and', ['OPERAND1', 'OPERAND2']],
  operator_or: ['or', ['OPERAND1', 'OPERAND2']],
  operator_not: ['not', ['OPERAND']],
  pen_penDown: ['pendown', []],
  pen_penUp: ['penup', []],
  pen_clear: ['penclear', []],
  pen_setPenColorToColor: ['pencolor', ['COLOR']],
  pen_setPenSizeTo: ['pensize', ['SIZE']],
  pen_stamp: ['stamp', []],
};

const EXPORT_OPCODE = {
  move: 'motion_movesteps',
  turn: 'motion_turnright',
  turnl: 'motion_turnleft',
  goto: 'motion_gotoxy',
  setx: 'motion_setx',
  changex: 'motion_changexby',
  sety: 'motion_sety',
  changey: 'motion_changeyby',
  point: 'motion_pointindirection',
  x: 'motion_xposition',
  y: 'motion_yposition',
  dir: 'motion_direction',
  say: 'looks_sayforsecs',
  think: 'looks_thinkforsecs',
  show: 'looks_show',
  hide: 'looks_hide',
  setsize: 'looks_setsizeto',
  changesize: 'looks_changesizeby',
  size: 'looks_size',
  whenflag: 'event_whenflagclicked',
  whenkey: 'event_whenkeypressed',
  whenclick: 'event_whenthisspriteclicked',
  whenreceive: 'event_whenbroadcastreceived',
  broadcast: 'event_broadcast',
  wait: 'control_wait',
  repeat: 'control_repeat',
  forever: 'control_forever',
  if: 'control_if_else',
  repeatuntil: 'control_repeat_until',
  ask: 'sensing_askandwait',
  answer: 'sensing_answer',
  timer: 'sensing_timer',
  resettimer: 'sensing_resettimer',
  mousex: 'sensing_mousex',
  mousey: 'sensing_mousey',
  mousedown: 'sensing_mousedown',
  keydown: 'sensing_keypressed',
  add: 'operator_add',
  sub: 'operator_subtract',
  mul: 'operator_multiply',
  div: 'operator_divide',
  mod: 'operator_mod',
  round: 'operator_round',
  rand: 'operator_random',
  join: 'operator_join',
  strlen: 'operator_length',
  letter: 'operator_letter_of',
  gt: 'operator_gt',
  lt: 'operator_lt',
  eq: 'operator_equals',
  and: 'operator_and',
  or: 'operator_or',
  not: 'operator_not',
  set: 'data_setvariableto',
  change: 'data_changevariableby',
  var: 'data_variable',
  push: 'data_addtolist',
  remove: 'data_deleteoflist',
  clearlist: 'data_deletealloflist',
  item: 'data_itemoflist',
  len: 'data_lengthoflist',
  has: 'data_listcontainsitem',
  pendown: 'pen_penDown',
  penup: 'pen_penUp',
  penclear: 'pen_clear',
  pencolor: 'pen_setPenColorToColor',
  pensize: 'pen_setPenSizeTo',
  stamp: 'pen_stamp',
};

const INPUT_NAMES = {};
for (const [scratch, spec] of Object.entries(COMMANDS)) INPUT_NAMES[spec[0]] = spec[1];

function shadowToExpr(shadow, names) {
  if (!Array.isArray(shadow)) return { kind: 'num', value: 0 };
  const kind = shadow[0];
  if (kind === 12) return { kind: 'var', name: names.variables[shadow[2]] || String(shadow[1]) };
  if (kind === 13) return { kind: 'str', value: names.lists[shadow[2]] || String(shadow[1]) };
  if (kind === 11) return { kind: 'str', value: String(shadow[1]) };
  if ([4, 5, 6, 7, 8].includes(kind)) {
    const number = Number(shadow[1]);
    return Number.isFinite(number) ? { kind: 'num', value: number } : { kind: 'str', value: String(shadow[1]) };
  }
  return { kind: 'str', value: shadow[1] != null ? String(shadow[1]) : '' };
}

function fieldText(block, names) {
  if (block.fields?.KEY_OPTION) return { kind: 'str', value: String(block.fields.KEY_OPTION[0]) };
  if (block.fields?.BROADCAST_OPTION) return { kind: 'str', value: String(block.fields.BROADCAST_OPTION[0]) };
  if (block.fields?.VARIABLE) return { kind: 'str', value: String(block.fields.VARIABLE[0]) };
  if (block.fields?.LIST) return { kind: 'str', value: String(block.fields.LIST[0]) };
  return null;
}

export function importProjectJson(json, files = {}, warnings = []) {
  const project = emptyProject();
  const targets = Array.isArray(json?.targets) ? json.targets : [];
  if (!targets.length) warnings.push('no-targets');
  for (const target of targets) {
    const sprite = createSprite(target.name || (target.isStage ? 'Bühne' : 'Figur'), { isStage: !!target.isStage });
    sprite.x = Number(target.x) || 0;
    sprite.y = Number(target.y) || 0;
    sprite.dir = Number(target.direction) || 90;
    sprite.size = Number(target.size) || 100;
    sprite.visible = target.visible !== false;
    const names = { variables: {}, lists: {} };
    for (const [id, tuple] of Object.entries(target.variables || {})) {
      sprite.variables[tuple[0]] = tuple[1];
      names.variables[id] = tuple[0];
    }
    for (const [id, tuple] of Object.entries(target.lists || {})) {
      sprite.lists[tuple[0]] = Array.isArray(tuple[1]) ? tuple[1].slice() : [];
      names.lists[id] = tuple[0];
    }
    const blocks = target.blocks || {};
    const readInput = (input) => {
      if (!input) return { kind: 'num', value: 0 };
      const slot = input[0];
      if ((slot === 2 || slot === 3) && typeof input[1] === 'string' && blocks[input[1]]) {
        return blockToExpr(blocks[input[1]]);
      }
      return shadowToExpr(slot === 1 ? input[1] : input[2], names);
    };
    const blockToExpr = (sb) => {
      if (sb.opcode === 'data_variable') return { kind: 'var', name: sb.fields?.VARIABLE?.[0] || 'var' };
      if (sb.opcode === 'data_itemoflist') {
        return { kind: 'block', opcode: 'item', args: [readInput(sb.inputs?.INDEX), { kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }] };
      }
      if (sb.opcode === 'data_lengthoflist') {
        return { kind: 'block', opcode: 'len', args: [{ kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }] };
      }
      if (sb.opcode === 'data_listcontainsitem') {
        return { kind: 'block', opcode: 'has', args: [{ kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }, readInput(sb.inputs?.ITEM)] };
      }
      const mapped = COMMANDS[sb.opcode];
      if (!mapped) return { kind: 'str', value: sb.opcode };
      const [opcode, inputs] = mapped;
      const args = inputs.map((name) => readInput(sb.inputs?.[name]));
      if (sb.fields?.LIST) args.push({ kind: 'str', value: String(sb.fields.LIST[0]) });
      if (opcode === 'keydown' && !args.length) {
        const field = fieldText(sb, names);
        if (field) args.push(field);
      }
      return { kind: 'block', opcode, args };
    };
    const convert = (sb) => {
      if (sb.opcode === 'data_setvariableto' || sb.opcode === 'data_changevariableby') {
        return block(sb.opcode === 'data_setvariableto' ? 'set' : 'change', [
          { kind: 'str', value: sb.fields?.VARIABLE?.[0] || 'var' },
          readInput(sb.inputs?.VALUE),
        ]);
      }
      if (sb.opcode === 'data_addtolist') {
        return block('push', [readInput(sb.inputs?.ITEM), { kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }]);
      }
      if (sb.opcode === 'data_deleteoflist') {
        return block('remove', [readInput(sb.inputs?.INDEX), { kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }]);
      }
      if (sb.opcode === 'data_deletealloflist') {
        return block('clearlist', [{ kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }]);
      }
      if (sb.opcode === 'data_itemoflist') {
        return block('item', [readInput(sb.inputs?.INDEX), { kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }]);
      }
      if (sb.opcode === 'data_lengthoflist') return block('len', [{ kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }]);
      if (sb.opcode === 'data_listcontainsitem') {
        return block('has', [{ kind: 'str', value: sb.fields?.LIST?.[0] || 'liste' }, readInput(sb.inputs?.ITEM)]);
      }
      const mapped = COMMANDS[sb.opcode];
      if (!mapped) {
        warnings.push(sb.opcode || 'unknown');
        return block('comment', [str(sb.opcode || 'unknown')]);
      }
      const [opcode, inputs] = mapped;
      const args = inputs.map((name) => readInput(sb.inputs?.[name]));
      if ((opcode === 'whenkey' || opcode === 'keydown') && sb.fields?.KEY_OPTION) {
        args.push({ kind: 'str', value: String(sb.fields.KEY_OPTION[0]) });
      }
      if ((opcode === 'whenreceive' || opcode === 'broadcast') && sb.fields?.BROADCAST_OPTION && !args.length) {
        args.push({ kind: 'str', value: String(sb.fields.BROADCAST_OPTION[0]) });
      }
      const body = sb.inputs?.SUBSTACK ? chain(sb.inputs.SUBSTACK[1]) : null;
      const elseBody = sb.inputs?.SUBSTACK2 ? chain(sb.inputs.SUBSTACK2[1]) : null;
      const made = block(opcode, args, {
        body: opcode === 'repeat' || opcode === 'forever' || opcode === 'if' || opcode === 'repeatuntil' ? (body || []) : null,
        elseBody: opcode === 'if' ? (elseBody || []) : null,
      });
      return made;
    };
    const chain = (start) => {
      const out = [];
      const seen = new Set();
      let id = start;
      while (id && blocks[id] && !seen.has(id)) {
        seen.add(id);
        out.push(convert(blocks[id]));
        id = blocks[id].next;
      }
      return out;
    };
    for (const [id, sb] of Object.entries(blocks)) {
      if (!sb || !sb.topLevel || sb.parent) continue;
      sprite.scripts.push({
        id: uid(),
        x: Number(sb.x) || 48,
        y: Number(sb.y) || 48,
        proc: null,
        blocks: chain(id),
      });
    }
    const costume = (target.costumes || [])[target.currentCostume || 0];
    if (costume?.assetId && costume.md5ext && files[costume.md5ext] && files[costume.md5ext].length < 400000) {
      const mime = costume.dataFormat === 'svg' ? 'image/svg+xml' : `image/${costume.dataFormat || 'png'}`;
      sprite.costume = `data:${mime};base64,${bytesToBase64(files[costume.md5ext])}`;
      sprite.costumeName = costume.name || '';
    }
    project.sprites.push(sprite);
  }
  if (!project.sprites.some((sprite) => sprite.isStage) && project.sprites[0]) project.sprites[0].isStage = true;
  return project;
}

function bytesToBase64(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function projectFromZip(bytes, warnings = []) {
  const files = unzipSync(bytes);
  const entry = Object.keys(files).find((name) => name.replace(/\\/g, '/').endsWith('project.json'));
  if (!entry) {
    warnings.push('no-project-json');
    return null;
  }
  const json = JSON.parse(strFromU8(files[entry]));
  return importProjectJson(json, files, warnings);
}

let exportCounter = 0;
function nextExportId() {
  exportCounter += 1;
  return `b${exportCounter.toString(16)}`;
}

function ensureId(map, name, kind, initial) {
  for (const [id, tuple] of Object.entries(map)) if (tuple[0] === name) return id;
  const id = `${kind}${Object.keys(map).length + 1}`;
  map[id] = kind === 'l' ? [name, initial || []] : [name, initial ?? 0];
  return id;
}

export function exportProjectJson(project) {
  exportCounter = 0;
  const targets = project.sprites.map((sprite) => {
    const variables = {};
    const lists = {};
    for (const [name, value] of Object.entries(sprite.variables || {})) ensureId(variables, name, 'v', value);
    for (const [name, items] of Object.entries(sprite.lists || {})) ensureId(lists, name, 'l', items);
    const blocks = {};
    const emitExpr = (expr, parent) => {
      if (!expr || expr.kind === 'num') return [1, [4, String(expr?.value ?? 0)]];
      if (expr.kind === 'str') return [1, [10, expr.value]];
      if (expr.kind === 'var') {
        const id = ensureId(variables, expr.name, 'v', 0);
        const blockId = nextExportId();
        blocks[blockId] = {
          opcode: 'data_variable', next: null, parent, inputs: {},
          fields: { VARIABLE: [expr.name, id] }, shadow: false, topLevel: false,
        };
        return [3, blockId, [10, '']];
      }
      if (expr.kind === 'block') {
        const blockId = emitBlock(exprToBlock(expr), parent, null);
        return [2, blockId];
      }
      return [1, [10, '']];
    };
    const exprToBlock = (expr) => ({
      opcode: expr.opcode,
      args: expr.args || [],
      body: null,
      elseBody: null,
    });
    const emitBlock = (node, parent, next) => {
      const id = nextExportId();
      const scratch = EXPORT_OPCODE[node.opcode] || 'procedures_call';
      const inputs = {};
      const fields = {};
      const names = INPUT_NAMES[node.opcode] || [];
      if (node.opcode === 'set' || node.opcode === 'change') {
        const varName = node.args[0]?.value || 'var';
        const varId = ensureId(variables, varName, 'v', 0);
        fields.VARIABLE = [varName, varId];
        inputs.VALUE = emitExpr(node.args[1], id);
      } else if (node.opcode === 'var') {
        const varName = node.args[0]?.value || node.args[0]?.name || 'var';
        fields.VARIABLE = [varName, ensureId(variables, varName, 'v', 0)];
      } else if (['push', 'remove', 'clearlist', 'item', 'len', 'has'].includes(node.opcode)) {
        const listName = node.opcode === 'has' ? node.args[0]?.value : node.args[node.args.length - 1]?.value;
        fields.LIST = [listName || 'liste', ensureId(lists, listName || 'liste', 'l', [])];
        if (node.opcode === 'push') inputs.ITEM = emitExpr(node.args[0], id);
        if (node.opcode === 'remove' || node.opcode === 'item') inputs.INDEX = emitExpr(node.args[0], id);
        if (node.opcode === 'has') inputs.ITEM = emitExpr(node.args[1], id);
      } else if (node.opcode === 'whenkey' || node.opcode === 'keydown') {
        fields.KEY_OPTION = [node.args[0]?.value || 'space', null];
      } else if (node.opcode === 'whenreceive') {
        fields.BROADCAST_OPTION = [node.args[0]?.value || 'Nachricht', 'bcast'];
      } else if (node.opcode === 'broadcast') {
        fields.BROADCAST_OPTION = [node.args[0]?.kind === 'str' ? node.args[0].value : 'Nachricht', 'bcast'];
        inputs.BROADCAST_INPUT = emitExpr(node.args[0], id);
      } else {
        names.forEach((name, index) => {
          if (node.args[index]) inputs[name] = emitExpr(node.args[index], id);
        });
      }
      let bodyId = null;
      if (node.body && node.body.length) {
        bodyId = emitChain(node.body, id);
        inputs.SUBSTACK = [2, bodyId];
      }
      if (node.elseBody && node.elseBody.length) {
        const elseId = emitChain(node.elseBody, id);
        inputs.SUBSTACK2 = [2, elseId];
      }
      blocks[id] = {
        opcode: scratch,
        next,
        parent,
        inputs,
        fields,
        shadow: false,
        topLevel: false,
      };
      return id;
    };
    const emitChain = (list, parent) => {
      let first = null;
      let previous = null;
      for (const node of list) {
        const id = emitBlock(node, parent, null);
        if (!first) first = id;
        if (previous) blocks[previous].next = id;
        blocks[id].parent = previous ? previous : parent;
        previous = id;
      }
      return first;
    };
    for (const script of sprite.scripts) {
      if (script.proc || !script.blocks?.length) continue;
      const top = emitChain(script.blocks, null);
      if (top && blocks[top]) {
        blocks[top].topLevel = true;
        blocks[top].parent = null;
        blocks[top].x = script.x || 48;
        blocks[top].y = script.y || 48;
      }
    }
    const assetId = md5(PNG_1X1);
    return {
      isStage: !!sprite.isStage,
      name: sprite.name,
      variables,
      lists,
      broadcasts: {},
      blocks,
      comments: {},
      currentCostume: 0,
      costumes: [{
        name: sprite.isStage ? 'Hintergrund' : 'Kostüm',
        dataFormat: 'png',
        assetId,
        md5ext: `${assetId}.png`,
        rotationCenterX: sprite.isStage ? 240 : 1,
        rotationCenterY: sprite.isStage ? 180 : 1,
      }],
      sounds: [],
      volume: 100,
      layerOrder: sprite.isStage ? 0 : 1,
      tempo: project.tempo || 120,
      visible: sprite.visible !== false,
      x: sprite.x || 0,
      y: sprite.y || 0,
      size: sprite.size || 100,
      direction: sprite.dir || 90,
      draggable: true,
      rotationStyle: 'all around',
    };
  });
  return {
    targets,
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: 'blanche-de-ciel', agent: 'BlancheDeCiel' },
  };
}

export function exportSb3(project) {
  const json = exportProjectJson(project);
  const files = { 'project.json': strToU8(JSON.stringify(json)) };
  const assetId = md5(PNG_1X1);
  files[`${assetId}.png`] = PNG_1X1;
  return zipSync(files);
}

export function looksLikeZip(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
