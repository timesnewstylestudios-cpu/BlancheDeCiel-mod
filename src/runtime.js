/* SPDX-License-Identifier: GPL-3.0-or-later */

import { stageOf } from './model.js';
import { applyBdl, extractBdl } from './bdl.js';
import { evaluateJob, jobKey } from './jobs.js';
import { toPseudo } from './decompile.js';

export function toNumber(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : 0;
}

export function truthy(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return text !== '' && text !== '0' && text !== 'false';
  }
  return Boolean(value);
}

export function snap(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e8) / 1e8;
  return rounded === 0 ? 0 : rounded;
}

export function wrap360(degrees) {
  const wrapped = snap(degrees) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function numericLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value));
  return false;
}

function compare(left, right) {
  if (numericLike(left) && numericLike(right)) return toNumber(left) - toNumber(right);
  const a = String(left).toLowerCase();
  const b = String(right).toLowerCase();
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const noopAudio = {
  tone() {},
  beginRecord() { return Promise.resolve(); },
  endRecord() { return Promise.resolve(); },
  playRecording() { return Promise.resolve(); },
  playUrl() { return Promise.resolve(); },
  fft() { return 0; },
  volume() { return 0; },
};

const noopGrid = {
  share() {},
  fetch() { return Promise.resolve(null); },
  publishJob() {},
  peerCount() { return 0; },
};

export function createRuntime(project, services = {}) {
  const threads = [];
  let timerOrigin = 0;
  let running = false;
  const audio = { ...noopAudio, ...(services.audio || {}) };
  const grid = { ...noopGrid, ...(services.grid || {}) };
  const input = services.input || { mouse: { x: 0, y: 0, down: false }, keys: new Set() };
  const now = () => (services.now ? services.now() : Date.now());
  const ask = services.ask || (async () => '');
  const ai = services.ai || (async () => { throw new Error('no-ai'); });
  const extensions = services.extensions || { get() { return null; } };
  const bluetooth = services.bluetooth || { available() { return false; }, ping() { return Promise.resolve({ ok: false, reason: 'unavailable' }); } };
  const lang = () => {
    if (typeof services.lang === 'function') return services.lang() || 'de';
    return services.lang || 'de';
  };
  const writeLog = (message) => {
    project.log.push(String(message));
    if (project.log.length > 100) project.log.shift();
    if (services.log) services.log(String(message));
  };

  function stage() {
    return stageOf(project);
  }

  function spriteById(id) {
    return project.sprites.find((sprite) => sprite.id === id) || null;
  }

  function readVar(sprite, name) {
    if (Object.prototype.hasOwnProperty.call(sprite.variables, name)) return sprite.variables[name];
    const stageSprite = stage();
    if (stageSprite && stageSprite !== sprite && Object.prototype.hasOwnProperty.call(stageSprite.variables, name)) {
      return stageSprite.variables[name];
    }
    return 0;
  }

  function writeVar(sprite, name, value) {
    const stageSprite = stage();
    if (Object.prototype.hasOwnProperty.call(sprite.variables, name)) sprite.variables[name] = value;
    else if (stageSprite && Object.prototype.hasOwnProperty.call(stageSprite.variables, name)) stageSprite.variables[name] = value;
    else sprite.variables[name] = value;
  }

  function listOf(sprite, name, create) {
    if (Object.prototype.hasOwnProperty.call(sprite.lists, name)) return sprite.lists[name];
    const stageSprite = stage();
    if (stageSprite && Object.prototype.hasOwnProperty.call(stageSprite.lists, name)) return stageSprite.lists[name];
    if (!create) return null;
    sprite.lists[name] = [];
    return sprite.lists[name];
  }

  function evalExpr(expr, sprite) {
    if (!expr) return 0;
    if (expr.kind === 'num') return expr.value;
    if (expr.kind === 'str') return expr.value;
    if (expr.kind === 'var') return readVar(sprite, expr.name);
    if (expr.kind === 'block') return evalReporter(expr, sprite);
    return 0;
  }

  function callExtension(sprite, id, opcode, values) {
    const ext = extensions.get(id);
    if (!ext || typeof ext.instance[opcode] !== 'function') {
      writeLog(`Erweiterung ${id}.${opcode} fehlt`);
      return 0;
    }
    const names = ext.argNames[opcode] || [];
    const args = {};
    names.forEach((name, index) => { args[name] = values[index]; });
    return ext.instance[opcode](args, { target: sprite, sprite });
  }

  function evalReporter(expr, sprite) {
    const values = () => expr.args.map((arg) => evalExpr(arg, sprite));
    const v = values();
    switch (expr.opcode) {
      case 'x': return sprite.x;
      case 'y': return sprite.y;
      case 'dir': return sprite.dir;
      case 'size': return sprite.size;
      case 'timer': return Math.max(0, (now() - timerOrigin) / 1000);
      case 'mousex': return input.mouse.x;
      case 'mousey': return input.mouse.y;
      case 'answer': return project.answer || '';
      case 'add': return toNumber(v[0]) + toNumber(v[1]);
      case 'sub': return toNumber(v[0]) - toNumber(v[1]);
      case 'mul': return toNumber(v[0]) * toNumber(v[1]);
      case 'div': return toNumber(v[1]) === 0 ? Infinity : toNumber(v[0]) / toNumber(v[1]);
      case 'mod': {
        const mod = toNumber(v[1]);
        if (mod === 0) return NaN;
        return ((toNumber(v[0]) % mod) + mod) % mod;
      }
      case 'round': return Math.round(toNumber(v[0]));
      case 'rand': return randomBetween(toNumber(v[0]), toNumber(v[1]));
      case 'join': return `${v[0] ?? ''}${v[1] ?? ''}`;
      case 'strlen': return String(v[0] ?? '').length;
      case 'letter': {
        const text = String(v[1] ?? '');
        const index = Math.floor(toNumber(v[0])) - 1;
        return text[index] || '';
      }
      case 'gt': return compare(v[0], v[1]) > 0;
      case 'lt': return compare(v[0], v[1]) < 0;
      case 'eq': return compare(v[0], v[1]) === 0;
      case 'and': return truthy(v[0]) && truthy(v[1]);
      case 'or': return truthy(v[0]) || truthy(v[1]);
      case 'not': return !truthy(v[0]);
      case 'var': return readVar(sprite, String(v[0] ?? ''));
      case 'item': {
        const list = listOf(sprite, String(v[1] ?? ''), false);
        if (!list) return '';
        return list[Math.floor(toNumber(v[0])) - 1] ?? '';
      }
      case 'len': return (listOf(sprite, String(v[0] ?? ''), false) || []).length;
      case 'has': {
        const list = listOf(sprite, String(v[0] ?? ''), false) || [];
        return list.map(String).includes(String(v[1] ?? ''));
      }
      case 'keydown': return input.keys.has(String(v[0] ?? '').toLowerCase());
      case 'mousedown': return !!input.mouse.down;
      case 'volume': return toNumber(audio.volume());
      case 'fft': return toNumber(audio.fft(Math.floor(toNumber(v[0]))));
      case 'cell': {
        const rows = project.tables[String(v[0] ?? '')] || [];
        const row = rows[Math.floor(toNumber(v[1])) - 1] || [];
        return row[Math.floor(toNumber(v[2])) - 1] ?? '';
      }
      case 'jobresult': return project.jobResults[jobKey(String(v[0] ?? ''), String(v[1] ?? ''), toNumber(v[2]))] ?? '';
      case 'peers': return grid.peerCount();
      case 'bt': return bluetooth.available() ? 1 : 0;
      case 'ext': return callExtension(sprite, String(v[0] ?? ''), String(v[1] ?? ''), v.slice(2));
      default:
        writeLog(`Unbekannter Reporter ${expr.opcode}`);
        return 0;
    }
  }

  function relocate(sprite, x, y) {
    if (sprite.penDown && (sprite.x !== x || sprite.y !== y)) {
      project.drawOps.push({
        op: 'line', x1: sprite.x, y1: sprite.y, x2: x, y2: y,
        color: sprite.penColor, size: sprite.penSize, layer: sprite.layer,
      });
      if (project.drawOps.length > 8000) project.drawOps.splice(0, project.drawOps.length - 8000);
    }
sprite.x = snap(x);
  sprite.y = snap(y);
}

  function settle(thread, key, factory) {
    if (!thread.async) thread.async = {};
    if (!thread.async[key]) {
      let settled = null;
      Promise.resolve().then(factory).then(
        (value) => { settled = { ok: true, value }; },
        (error) => { settled = { ok: false, error }; },
      );
      thread.async[key] = () => settled;
      return { retry: 30 };
    }
    const settled = thread.async[key]();
    if (!settled) return { retry: 30 };
    delete thread.async[key];
    return settled;
  }

  function procBody(sprite, name) {
    const own = [...sprite.scripts].reverse().find((script) => script.proc === name);
    if (own) return own.blocks;
    const stageSprite = stage();
    const shared = stageSprite && [...stageSprite.scripts].reverse().find((script) => script.proc === name);
    return shared ? shared.blocks : null;
  }

  function launch(sprite, blocks, ip) {
    if (threads.length > 200) return;
    threads.push({ spriteId: sprite.id, frames: [{ blocks, ip, mode: 'seq' }], waitUntil: 0, async: {} });
    running = true;
  }

  function hatText(sprite, hat) {
    return String(evalExpr(hat.args?.[0], sprite));
  }

  function startHats(opcode, predicate) {
    for (const sprite of project.sprites) {
      for (const script of sprite.scripts) {
        if (script.proc) continue;
        const hat = script.blocks[0];
        if (hat && hat.opcode === opcode && (!predicate || predicate(sprite, hat))) launch(sprite, script.blocks, 1);
      }
    }
  }

  const commands = {
    move(thread, block, sprite) {
      const steps = toNumber(evalExpr(block.args[0], sprite));
      const radians = sprite.dir * Math.PI / 180;
      relocate(sprite, sprite.x + Math.sin(radians) * steps, sprite.y + Math.cos(radians) * steps);
    },
    turn(thread, block, sprite) { sprite.dir = wrap360(sprite.dir + toNumber(evalExpr(block.args[0], sprite))); },
    turnl(thread, block, sprite) { sprite.dir = wrap360(sprite.dir - toNumber(evalExpr(block.args[0], sprite))); },
    goto(thread, block, sprite) {
      relocate(sprite, toNumber(evalExpr(block.args[0], sprite)), toNumber(evalExpr(block.args[1], sprite)));
    },
    setx(thread, block, sprite) { relocate(sprite, toNumber(evalExpr(block.args[0], sprite)), sprite.y); },
    changex(thread, block, sprite) { relocate(sprite, sprite.x + toNumber(evalExpr(block.args[0], sprite)), sprite.y); },
    sety(thread, block, sprite) { relocate(sprite, sprite.x, toNumber(evalExpr(block.args[0], sprite))); },
    changey(thread, block, sprite) { relocate(sprite, sprite.x, sprite.y + toNumber(evalExpr(block.args[0], sprite))); },
    point(thread, block, sprite) { sprite.dir = wrap360(toNumber(evalExpr(block.args[0], sprite))); },
    say(thread, block, sprite) { return speak(sprite, block, false); },
    think(thread, block, sprite) { return speak(sprite, block, true); },
    show(thread, block, sprite) { sprite.visible = true; },
    hide(thread, block, sprite) { sprite.visible = false; },
    setsize(thread, block, sprite) { sprite.size = toNumber(evalExpr(block.args[0], sprite)); },
    changesize(thread, block, sprite) { sprite.size += toNumber(evalExpr(block.args[0], sprite)); },
    wait(thread, block, sprite) {
      return { wait: Math.max(0, toNumber(evalExpr(block.args[0], sprite)) * 1000) };
    },
    repeat(thread, block) {
      const times = Math.max(0, Math.floor(toNumber(evalExpr(block.args[0], spriteById(thread.spriteId)))));
      thread.frames.push({ blocks: block.body || [], ip: 0, mode: 'repeat', remaining: times });
    },
    forever(thread, block) {
      thread.frames.push({ blocks: block.body || [], ip: 0, mode: 'forever' });
    },
    if(thread, block, sprite) {
      const yes = truthy(evalExpr(block.args[0], sprite));
      thread.frames.push({ blocks: (yes ? block.body : block.elseBody) || [], ip: 0, mode: 'seq' });
    },
    repeatuntil(thread, block) {
      thread.frames.push({ blocks: block.body || [], ip: 0, mode: 'until', cond: block.args[0] });
    },
    call(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      const body = procBody(sprite, name);
      if (!body) {
        writeLog(`Unbekannter Block ${name}`);
        return;
      }
      if (thread.frames.length > 40) {
        writeLog('Rekursion zu tief');
        return;
      }
      thread.frames.push({ blocks: body, ip: 0, mode: 'seq' });
    },
    broadcast(thread, block, sprite) {
      const message = String(evalExpr(block.args[0], sprite));
      startHats('whenreceive', (owner, hat) => hatText(owner, hat) === message);
    },
    ask(thread, block, sprite) {
      const question = String(evalExpr(block.args[0], sprite));
      sprite.bubble = { text: question, think: false, until: Infinity };
      const settled = settle(thread, 'ask', () => ask(question));
      if (settled.retry) return settled;
      project.answer = settled.ok ? String(settled.value ?? '') : '';
      sprite.bubble = null;
      return undefined;
    },
    resettimer() { timerOrigin = now(); },
    set(thread, block, sprite) {
      writeVar(sprite, String(evalExpr(block.args[0], sprite)), evalExpr(block.args[1], sprite));
    },
    change(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      writeVar(sprite, name, toNumber(readVar(sprite, name)) + toNumber(evalExpr(block.args[1], sprite)));
    },
    push(thread, block, sprite) {
      const item = evalExpr(block.args[0], sprite);
      const list = listOf(sprite, String(evalExpr(block.args[1], sprite)), true);
      list.push(item);
    },
    remove(thread, block, sprite) {
      const list = listOf(sprite, String(evalExpr(block.args[1], sprite)), false);
      if (!list) return;
      const index = Math.floor(toNumber(evalExpr(block.args[0], sprite))) - 1;
      if (index >= 0 && index < list.length) list.splice(index, 1);
    },
    clearlist(thread, block, sprite) {
      const list = listOf(sprite, String(evalExpr(block.args[0], sprite)), true);
      list.splice(0, list.length);
    },
    pendown(thread, block, sprite) { sprite.penDown = true; },
    penup(thread, block, sprite) { sprite.penDown = false; },
    penclear() { project.drawOps.push({ op: 'penclear' }); },
    pencolor(thread, block, sprite) { sprite.penColor = String(evalExpr(block.args[0], sprite)); },
    pensize(thread, block, sprite) { sprite.penSize = Math.max(1, toNumber(evalExpr(block.args[0], sprite))); },
    stamp(thread, block, sprite) {
      project.drawOps.push({
        op: 'stamp', x: sprite.x, y: sprite.y, dir: sprite.dir, size: sprite.size,
        color: sprite.penColor, name: sprite.name,
      });
    },
    tone(thread, block, sprite) {
      const frequency = toNumber(evalExpr(block.args[0], sprite));
      const seconds = Math.max(0, toNumber(evalExpr(block.args[1], sprite)));
      audio.tone(sprite.wave, frequency, seconds, sprite.adsr, { type: sprite.filterType, freq: sprite.filterFreq });
      return { wait: seconds * 1000 };
    },
    note(thread, block, sprite) {
      const midi = toNumber(evalExpr(block.args[0], sprite));
      const beats = Math.max(0, toNumber(evalExpr(block.args[1], sprite)));
      const seconds = beats * (60 / (project.tempo || 120));
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      audio.tone(sprite.wave, frequency, seconds, sprite.adsr, { type: sprite.filterType, freq: sprite.filterFreq });
      return { wait: seconds * 1000 };
    },
    wave(thread, block, sprite) { sprite.wave = String(evalExpr(block.args[0], sprite)); },
    filter(thread, block, sprite) {
      sprite.filterType = String(evalExpr(block.args[0], sprite));
      sprite.filterFreq = toNumber(evalExpr(block.args[1], sprite));
    },
    adsr(thread, block, sprite) {
      sprite.adsr = {
        a: toNumber(evalExpr(block.args[0], sprite)),
        d: toNumber(evalExpr(block.args[1], sprite)),
        s: toNumber(evalExpr(block.args[2], sprite)),
        r: toNumber(evalExpr(block.args[3], sprite)),
      };
    },
    recstart(thread) {
      const settled = settle(thread, 'rec', () => audio.beginRecord());
      if (settled.retry) return settled;
      if (!settled.ok) writeLog(settled.error?.message || 'Aufnahme nicht verfügbar');
      return undefined;
    },
    recstop(thread) {
      const settled = settle(thread, 'recstop', () => audio.endRecord());
      if (settled.retry) return settled;
      if (!settled.ok) writeLog(settled.error?.message || 'Aufnahme nicht verfügbar');
      return undefined;
    },
    recplay(thread) {
      const settled = settle(thread, 'recplay', () => audio.playRecording());
      if (settled.retry) return settled;
      return undefined;
    },
    playsnd(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      const sound = [...(sprite.sounds || []), ...(stage()?.sounds || [])].find((item) => item.name === name);
      if (!sound) {
        writeLog(`Klang ${name} fehlt`);
        return;
      }
      const settled = settle(thread, `snd:${name}`, () => audio.playUrl(sound.dataUrl));
      if (settled.retry) return settled;
      return undefined;
    },
    rect(thread, block, sprite) { drawShape(sprite, 'rect', block); },
    oval(thread, block, sprite) { drawShape(sprite, 'oval', block); },
    line(thread, block, sprite) {
      project.drawOps.push({
        op: 'line',
        x1: toNumber(evalExpr(block.args[0], sprite)),
        y1: toNumber(evalExpr(block.args[1], sprite)),
        x2: toNumber(evalExpr(block.args[2], sprite)),
        y2: toNumber(evalExpr(block.args[3], sprite)),
        color: sprite.penColor,
        size: sprite.penSize,
        layer: sprite.layer,
      });
    },
    gfxclear() { project.drawOps.push({ op: 'gfxclear' }); },
    layer(thread, block, sprite) { sprite.layer = String(evalExpr(block.args[0], sprite)); },
    shader(thread, block, sprite) { project.shader = String(evalExpr(block.args[0], sprite)); },
    box3d(thread, block, sprite) {
      project.boxes.push({
        x: toNumber(evalExpr(block.args[0], sprite)),
        y: toNumber(evalExpr(block.args[1], sprite)),
        z: toNumber(evalExpr(block.args[2], sprite)),
        size: toNumber(evalExpr(block.args[3], sprite)),
        color: sprite.penColor,
      });
    },
    cam(thread, block, sprite) {
      project.camera.x = toNumber(evalExpr(block.args[0], sprite));
      project.camera.y = toNumber(evalExpr(block.args[1], sprite));
      project.camera.z = toNumber(evalExpr(block.args[2], sprite));
    },
    rot3d(thread, block, sprite) {
      project.camera.yaw = toNumber(evalExpr(block.args[0], sprite));
      project.camera.pitch = toNumber(evalExpr(block.args[1], sprite));
    },
    clear3d() { project.boxes = []; },
    row(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      const cells = block.args.slice(1).map((arg) => evalExpr(arg, sprite));
      if (!project.tables[name]) project.tables[name] = [];
      project.tables[name].push(cells);
    },
    setcell(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      const rowIndex = Math.floor(toNumber(evalExpr(block.args[1], sprite))) - 1;
      const colIndex = Math.floor(toNumber(evalExpr(block.args[2], sprite))) - 1;
      const value = evalExpr(block.args[3], sprite);
      if (!project.tables[name]) project.tables[name] = [];
      while (project.tables[name].length <= rowIndex) project.tables[name].push([]);
      const row = project.tables[name][rowIndex];
      while (row.length <= colIndex) row.push('');
      row[colIndex] = value;
    },
    share(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      grid.share(name, project.tables[name] || []);
    },
    fetch(thread, block, sprite) {
      const name = String(evalExpr(block.args[0], sprite));
      const settled = settle(thread, `fetch:${name}`, () => grid.fetch(name));
      if (settled.retry) return settled;
      if (settled.ok && settled.value) project.tables[name] = settled.value;
      return undefined;
    },
    job(thread, block, sprite) {
      const op = String(evalExpr(block.args[0], sprite));
      const name = String(evalExpr(block.args[1], sprite));
      const column = toNumber(evalExpr(block.args[2], sprite));
      const rows = project.tables[name] || [];
      const result = evaluateJob(rows, op, column);
      project.jobResults[jobKey(op, name, column)] = result;
      project.jobLog.push({ op, name, column, result, at: now() });
      if (project.jobLog.length > 40) project.jobLog.shift();
      grid.publishJob({ op, name, column, rows });
    },
    log(thread, block, sprite) { writeLog(evalExpr(block.args[0], sprite)); },
    decomp(thread, block, sprite) {
      writeVar(sprite, 'Analyse', toPseudo(project, sprite, lang()));
    },
    aiprompt(thread, block, sprite) {
      if (!project.aiBlocksEnabled) {
        writeLog(lang() === 'en' ? 'AI blocks are off' : 'KI-Blöcke sind aus');
        return;
      }
      const request = String(evalExpr(block.args[0], sprite));
      const settled = settle(thread, 'ai', () => ai(request));
      if (settled.retry) return settled;
      if (!settled.ok) {
        writeLog(settled.error?.message || 'KI-Fehler');
        return;
      }
      const applied = applyBdl(project, extractBdl(settled.value));
      if (!applied.ok) writeLog(applied.errors.map((error) => error.code).join(', '));
      else threads.forEach((item) => { item.done = true; });
      return undefined;
    },
    comment() {},
    ext(thread, block, sprite) {
      const id = String(evalExpr(block.args[0], sprite));
      const opcode = String(evalExpr(block.args[1], sprite));
      const values = block.args.slice(2).map((arg) => evalExpr(arg, sprite));
      const result = callExtension(sprite, id, opcode, values);
      if (result && typeof result.then === 'function') {
        const settled = settle(thread, `ext:${id}:${opcode}`, () => result);
        if (settled.retry) return settled;
      }
      return undefined;
    },
    btping(thread, block, sprite) {
      const settled = settle(thread, 'bt', () => bluetooth.ping());
      if (settled.retry) return settled;
      const info = settled.ok ? settled.value : { ok: false, reason: 'unavailable' };
      const text = info.ok ? (info.name || 'ok') : (info.reason || 'unavailable');
      writeVar(sprite, 'Bluetooth', text);
      writeLog(text);
      return undefined;
    },
  };

  function drawShape(sprite, op, block) {
    project.drawOps.push({
      op,
      x: toNumber(evalExpr(block.args[0], sprite)),
      y: toNumber(evalExpr(block.args[1], sprite)),
      w: toNumber(evalExpr(block.args[2], sprite)),
      h: toNumber(evalExpr(block.args[3], sprite)),
      color: sprite.penColor,
      size: sprite.penSize,
      layer: sprite.layer,
    });
  }

  function speak(sprite, block, think) {
    const text = String(evalExpr(block.args[0], sprite));
    const seconds = block.args[1] != null ? toNumber(evalExpr(block.args[1], sprite)) : null;
    sprite.bubble = {
      text,
      think,
      until: seconds == null ? Infinity : now() + seconds * 1000,
    };
    if (seconds != null) return { wait: Math.max(0, seconds * 1000) };
    return undefined;
  }

  function stepThread(thread, clock) {
    const sprite = spriteById(thread.spriteId);
    if (!sprite) {
      thread.done = true;
      return 'done';
    }
    const frame = thread.frames[thread.frames.length - 1];
    if (!frame) {
      thread.done = true;
      return 'done';
    }
    if (frame.mode === 'until' && frame.ip === 0 && truthy(evalExpr(frame.cond, sprite))) {
      thread.frames.pop();
      return 'ok';
    }
    if (frame.mode === 'repeat' && frame.ip === 0) {
      if (frame.remaining <= 0) {
        thread.frames.pop();
        return 'ok';
      }
      frame.remaining -= 1;
    }
    if (frame.ip >= frame.blocks.length) {
      if (frame.mode === 'forever') {
        frame.ip = 0;
        return 'yield';
      }
      if (frame.mode === 'repeat' || frame.mode === 'until') {
        frame.ip = 0;
        return frame.mode === 'until' ? 'yield' : 'ok';
      }
      thread.frames.pop();
      return 'ok';
    }
    const block = frame.blocks[frame.ip];
    if (!block || String(block.opcode).startsWith('when')) {
      frame.ip += 1;
      return 'ok';
    }
    const handler = commands[block.opcode];
    if (!handler) {
      writeLog(`Unbekannter Befehl ${block.opcode}`);
      frame.ip += 1;
      return 'ok';
    }
    const result = handler(thread, block, sprite);
    if (result && result.retry) {
      thread.waitUntil = clock + result.retry;
      return 'wait';
    }
    frame.ip += 1;
    if (result && result.wait) {
      thread.waitUntil = clock + result.wait;
      return 'wait';
    }
    return 'ok';
  }

  function step() {
    const clock = now();
    let steps = 0;
    for (let index = 0; index < threads.length && steps < 2000; index += 1) {
      const thread = threads[index];
      let local = 0;
      while (local < 300 && steps < 2000 && !thread.done && thread.waitUntil <= clock) {
        const action = stepThread(thread, clock);
        local += 1;
        steps += 1;
        if (action === 'yield' || action === 'wait' || action === 'done') break;
      }
    }
    for (let index = threads.length - 1; index >= 0; index -= 1) {
      if (threads[index].done) threads.splice(index, 1);
    }
    running = threads.some((thread) => !thread.done);
  }

  return {
    commands: Object.keys(commands),
    start() {
      threads.splice(0, threads.length);
      for (const sprite of project.sprites) sprite.bubble = null;
      timerOrigin = now();
      running = false;
      startHats('whenflag');
      for (const sprite of project.sprites) {
        for (const script of sprite.scripts) {
          if (script.proc) continue;
          const hat = script.blocks[0];
          if (hat && String(hat.opcode).startsWith('ext.')) launch(sprite, script.blocks, 0);
        }
      }
    },
    stop() {
      threads.splice(0, threads.length);
      running = false;
      for (const sprite of project.sprites) sprite.bubble = null;
      if (audio.stopAll) audio.stopAll();
    },
    step,
    isRunning() { return running; },
    clickSprite(sprite) { startHats('whenclick', (owner) => owner.id === sprite.id); },
    keydown(key) {
      const name = String(key).toLowerCase();
      input.keys.add(name);
      startHats('whenkey', (sprite, hat) => hatText(sprite, hat).toLowerCase() === name);
    },
    keyup(key) { input.keys.delete(String(key).toLowerCase()); },
    evalExpr,
  };
}

function randomBetween(from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (Number.isInteger(from) && Number.isInteger(to)) return lo + Math.floor(Math.random() * (hi - lo + 1));
  return lo + Math.random() * (hi - lo);
}
