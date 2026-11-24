/* SPDX-License-Identifier: GPL-3.0-or-later
 * A tiny next-block model: bigram counts plus a one-hidden-layer net.
 * It suggests BDL. Accepting or correcting a suggestion is the training signal.
 */

import { decodeMatrix, encodeMatrix } from './weights.js';

export const VOCAB = ['move', 'turn', 'say', 'repeat', 'wait', 'set', 'change', 'pendown', 'broadcast', 'if', 'forever'];

const LINES = {
  move: 'move 10',
  turn: 'turn 15',
  say: 'say "Hallo" 1',
  repeat: 'repeat 4',
  wait: 'wait 1',
  set: 'set punkte 1',
  change: 'change punkte 1',
  pendown: 'pendown',
  broadcast: 'broadcast ping',
  if: 'if (gt (x) 0)',
  forever: 'forever',
};

const HIDDEN = 8;

function zeros(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function blank() {
  return {
    bigram: {},
    w1: zeros(HIDDEN, VOCAB.length),
    b1: Array.from({ length: HIDDEN }, () => 0),
    w2: zeros(VOCAB.length, HIDDEN),
    b2: Array.from({ length: VOCAB.length }, () => 0),
  };
}

function indexOf(opcode) {
  const index = VOCAB.indexOf(opcode);
  return index >= 0 ? index : 0;
}

function softmax(values) {
  const peak = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - peak));
  const sum = exps.reduce((total, value) => total + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function forward(state, prev) {
  const input = Array.from({ length: VOCAB.length }, (_, index) => (index === indexOf(prev) ? 1 : 0));
  const hidden = state.b1.map((bias, row) => {
    const raw = bias + state.w1[row].reduce((sum, weight, col) => sum + weight * input[col], 0);
    return raw > 0 ? raw : 0;
  });
  const logits = state.b2.map((bias, row) => bias + state.w2[row].reduce((sum, weight, col) => sum + weight * hidden[col], 0));
  return { input, hidden, logits, probs: softmax(logits) };
}

function trainPair(state, prev, next) {
  if (!VOCAB.includes(next)) return;
  const key = `${VOCAB.includes(prev) ? prev : 'move'}|${next}`;
  state.bigram[key] = (state.bigram[key] || 0) + 1;
  const pass = forward(state, prev);
  const target = indexOf(next);
  const grad = pass.probs.slice();
  grad[target] -= 1;
  const lr = 0.2;
  for (let row = 0; row < VOCAB.length; row += 1) {
    for (let col = 0; col < HIDDEN; col += 1) state.w2[row][col] -= lr * grad[row] * pass.hidden[col];
    state.b2[row] -= lr * grad[row];
  }
}

export function createLocalModel() {
  const state = blank();
  return {
    state,
    suggest(project) {
      return suggestBdl(state, project);
    },
    observe(suggested, applied) {
      const fromApplied = opcodesOf(applied);
      const seq = fromApplied.length ? fromApplied : opcodesOf(suggested);
      let prev = 'move';
      for (const opcode of seq) {
        trainPair(state, prev, opcode);
        prev = opcode;
      }
    },
    learnBlocks(blocks) {
      let prev = 'move';
      for (const opcode of walk(blocks)) {
        trainPair(state, prev, opcode);
        prev = opcode;
      }
    },
    train(prev, next) { trainPair(state, prev, next); },
    predict(prev) { return predictOpcode(state, prev); },
    exportPack() { return exportLocal(state); },
    importPack(pack) { importLocal(state, pack); },
  };
}

function predictOpcode(state, prev) {
  const counts = VOCAB.map((opcode) => state.bigram[`${prev}|${opcode}`] || 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const net = forward(state, prev).probs;
  let best = 0;
  let score = -1;
  VOCAB.forEach((opcode, index) => {
    const mixed = (total ? counts[index] / total : 0) * 0.7 + net[index] * 0.3;
    if (mixed > score) {
      score = mixed;
      best = index;
    }
  });
  return total || state.w2.some((row) => row.some((value) => value !== 0)) ? VOCAB[best] : 'say';
}

function lastOpcode(project) {
  const sprite = project?.sprites?.find((item) => !item.isStage) || project?.sprites?.[0];
  const blocks = sprite?.scripts?.flatMap((script) => script.blocks || []) || [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (VOCAB.includes(blocks[index].opcode)) return blocks[index].opcode;
  }
  return 'move';
}

function closer(opcode) {
  if (opcode === 'repeat' || opcode === 'forever' || opcode === 'if') return '\n    move 10\n  end';
  return '';
}

export function suggestBdl(state, project) {
  const sprite = project?.sprites?.find((item) => !item.isStage) || project?.sprites?.[0];
  const name = sprite?.name || 'Figur';
  const quoted = /[\s"]/.test(name) ? `"${name.replaceAll('"', '')}"` : name;
  const next = predictOpcode(state, lastOpcode(project));
  return `sprite ${quoted}\nscript 48 48\n  when flag\n  ${LINES[next]}${closer(next)}\nend\n`;
}

export function opcodesOf(text) {
  return String(text || '').split(/[^a-z0-9]+/i).filter((word) => VOCAB.includes(word));
}

function walk(blocks, out = []) {
  for (const block of blocks || []) {
    if (VOCAB.includes(block.opcode)) out.push(block.opcode);
    walk(block.body, out);
    walk(block.elseBody, out);
  }
  return out;
}

export function exportLocal(state) {
  return {
    kind: 'bdc-local-1',
    bigram: state.bigram,
    b1: state.b1,
    b2: state.b2,
    w1: state.w1.map((row) => encodeMatrix([row], { rank: 1, residualCount: row.length })),
    w2: state.w2.map((row) => encodeMatrix([row], { rank: 1, residualCount: row.length })),
  };
}

export function importLocal(state, pack) {
  if (!pack || pack.kind !== 'bdc-local-1') return;
  state.bigram = { ...(pack.bigram || {}) };
  state.b1 = (pack.b1 || []).slice();
  state.b2 = (pack.b2 || []).slice();
  state.w1 = (pack.w1 || []).map((row) => decodeMatrix(row)[0]);
  state.w2 = (pack.w2 || []).map((row) => decodeMatrix(row)[0]);
}

const memory = new Map();

export function memoryStore() {
  return {
    async get(key) { return memory.has(key) ? memory.get(key) : null; },
    async set(key, value) { memory.set(key, value); },
  };
}

export function browserStore(name = 'bdc-localnet') {
  if (typeof indexedDB === 'undefined') return memoryStore();
  const open = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async get(key) {
      const db = await open;
      return new Promise((resolve) => {
        const tx = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        tx.onsuccess = () => resolve(tx.result ?? null);
        tx.onerror = () => resolve(null);
      });
    },
    async set(key, value) {
      const db = await open;
      return new Promise((resolve) => {
        const tx = db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
        tx.onsuccess = () => resolve();
        tx.onerror = () => resolve();
      });
    },
  };
}
