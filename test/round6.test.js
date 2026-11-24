import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBdl, projectToBdl } from '../src/bdl.js';
import { emptyProject } from '../src/model.js';
import { createRuntime } from '../src/runtime.js';
import { addLayer, createNet, predict, projectionGrad, trainStep } from '../src/nn.js';
import { chargeStorage } from '../proxy/src/quota.js';
import { mintTurn } from '../proxy/src/turn.js';
import { createHmac } from 'node:crypto';

test('clearscene wipes drawings, solids and bubbles, and the German alias works', () => {
  const project = emptyProject();
  project.sprites.push({ name: 'Figur', bubble: { text: 'Hallo' }, isStage: false, variables: {}, lists: {}, scripts: [] });
  project.boxes.push({ x: 1, y: 2, z: 3, size: 4 });
  project.drawOps.push({ op: 'stamp' });
  project.drawOps = [{ op: 'stamp' }];
  const applied = applyBdl(project, 'szeneleeren\nbox3d 0 0 0 10\n');
  assert.equal(applied.ok, true, JSON.stringify(applied.errors));
  assert.equal(project.drawOps.length, 0);
  assert.equal(project.sprites[0].bubble, null);
  assert.equal(project.boxes.length, 1);
  assert.match(projectToBdl(project), /clearscene/);
  const live = emptyProject();
  live.sprites.push({ id: 'a', name: 'Figur', bubble: { text: 'x' }, variables: {}, lists: {}, scripts: [{ id: 's', proc: null, blocks: [] }], isStage: false, x: 0, y: 0, dir: 90, size: 100 });
  live.spheres.push({ x: 1, y: 1, z: 1, size: 2 });
  const engine = createRuntime(live, { now: () => 0 });
  engine.start();
  live.sprites[0].scripts[0].blocks = [{ opcode: 'whenflag' }, { opcode: 'clearscene', args: [] }];
  engine.start();
  engine.step();
  assert.equal(live.spheres.length, 0);
  assert.equal(live.sprites[0].bubble, null);
});

test('stacked LSTM and multi-head attention, with an analytic projection gradient', () => {
  const deep = createNet('tief');
  addLayer(deep, { type: 'lstm', input: 1, units: 2, stack: 2 });
  assert.equal(deep.layers[0].cells.length, 2);
  const once = predict(deep, [0.4]);
  const twice = predict(deep, [0.4, 0.4]);
  assert.equal(once.length, 2);
  assert.notDeepEqual(once, twice);
  const heads = createNet('koepfe');
  addLayer(heads, { type: 'attention', input: 4, units: 4, dim: 4, heads: 2 });
  heads.layers[0].proj = [[1, 0], [0, 1], [0, 0], [0, 0]];
  const out = predict(heads, [1, 0, 0, 1, 0, 1, 1, 0]);
  assert.equal(out.length, 4);
  const concat = heads.layers[0].concat;
  const target = [0, 0, 0, 0];
  const analytic = projectionGrad(concat, out, target)[0][0];
  const eps = 1e-4;
  const loss = (values) => values.reduce((sum, value, index) => sum + 0.5 * (value - (target[index] || 0)) ** 2, 0);
  const base = loss(out);
  heads.layers[0].proj[0][0] += eps;
  const up = loss(predict(heads, [1, 0, 0, 1, 0, 1, 1, 0]));
  heads.layers[0].proj[0][0] -= eps;
  const numeric = (up - base) / eps;
  assert.ok(Math.abs(numeric - analytic) < 1e-3, `${numeric} vs ${analytic}`);
  const pool = createNet('pool');
  addLayer(pool, { type: 'pool', input: 4, units: 2 });
  assert.deepEqual(predict(pool, [1, 4, 2, 3]), [4, 3]);
  const norm = createNet('norm');
  addLayer(norm, { type: 'norm', input: 2, units: 2 });
  const centered = predict(norm, [1, 3]);
  assert.ok(Math.abs(centered[0] + centered[1]) < 1e-6);
  const step = trainStep(deep, [0.2], [0, 0]);
  assert.ok(Number.isFinite(step.after));
});

test('the shared quota counter and coturn credentials', async () => {
  const mem = new Map();
  const storage = {
    async get(key) { return mem.has(key) ? mem.get(key) : null; },
    async put(key, value) { mem.set(key, value); },
  };
  assert.equal((await chargeStorage(storage, 'himmel', 0, 1)).ok, true);
  assert.equal((await chargeStorage(storage, 'himmel', 10, 1)).ok, false);
  assert.equal((await chargeStorage(storage, 'himmel', 3600000, 1)).ok, true);
  const secret = 'test-secret';
  const minted = await mintTurn({
    secret,
    urls: 'turn:example:3478',
    ttl: 60,
    now: 1_700_000_000_000,
    hmac: async (key, message) => createHmac('sha1', key).update(message).digest('base64'),
  });
  assert.equal(minted.username, String(1_700_000_000 + 60));
  assert.equal(minted.credential, createHmac('sha1', secret).update(minted.username).digest('base64'));
  assert.equal(minted.urls, 'turn:example:3478');
});
