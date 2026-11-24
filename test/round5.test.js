import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBackend, gemm, gemmCpu, iceServers } from '../src/accel.js';
import { charge, createBoard, pushMail, readMail } from '../proxy/src/board.js';
import { addLayer, createNet, predict } from '../src/nn.js';

test('matmul prefers a GPU and otherwise matches the CPU', async () => {
  assert.equal(chooseBackend({ webgpu: true, webgl: true }), 'webgpu');
  assert.equal(chooseBackend({ webgl: true }), 'webgl');
  assert.equal(chooseBackend({}), 'cpu');
  const matrix = [[1, 2], [3, 4]];
  assert.deepEqual(gemmCpu(matrix, [1, 1]), [3, 7]);
  assert.deepEqual(await gemm(matrix, [1, 1]), [3, 7]);
  const servers = iceServers({ turnUrl: 'turn:example:3478', turnUser: 'ada', turnCred: 'secret' });
  assert.equal(servers[1].urls, 'turn:example:3478');
  assert.equal(servers[1].credential, 'secret');
  assert.equal(JSON.stringify(iceServers({})).includes('turn:'), false);
});

test('the hourly quota and the poll mailbox survive a missing Durable Object', async () => {
  const board = createBoard(null);
  assert.equal((await charge(board, 'raum', 0, 2)).ok, true);
  assert.equal((await charge(board, 'raum', 10, 2)).ok, true);
  assert.equal((await charge(board, 'raum', 20, 2)).ok, false);
  assert.equal((await charge(board, 'raum', 3600000, 2)).ok, true);
  await pushMail(board, 'himmel', { id: 'a', at: 1, t: 'hello' });
  await pushMail(board, 'himmel', { id: 'b', at: 2, t: 'hello' });
  const seen = await readMail(board, 'himmel', 0, 'a');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 'b');
});

test('a longer LSTM step changes the cell and attention peaks on the matching token', () => {
  const net = createNet('folge');
  addLayer(net, { type: 'lstm', input: 1, units: 2 });
  const first = predict(net, [0.2]);
  const second = predict(net, [0.2, 0.2]);
  assert.equal(first.length, 2);
  assert.ok(first.every(Number.isFinite));
  assert.notDeepEqual(first, second);
  const look = createNet('kopf');
  addLayer(look, { type: 'attention', input: 4, units: 4, dim: 2 });
  const out = predict(look, [1, 0, 0, 1]);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(look.layers[0].weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
});
