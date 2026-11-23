import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketIndex, keyId, KBuckets, xorCompare } from '../src/kad.js';
import { createGridNode, createLinkedTransports } from '../src/grid.js';
import { evaluateJob, reduceParts, splitRows } from '../src/jobs.js';

test('bucket index is zero for ids that differ in the top bit', () => {
  const selfId = `${'0'.repeat(40)}`;
  const other = `8${'0'.repeat(39)}`;
  assert.equal(bucketIndex(selfId, other), 0);
  assert.equal(xorCompare(selfId, `1${'0'.repeat(39)}`, other) < 0, true);
});

test('k-buckets keep the k newest ids in a bucket', () => {
  const selfId = '0'.repeat(40);
  const buckets = new KBuckets(selfId, 2);
  buckets.seen(`8${'1'.repeat(39)}`);
  buckets.seen(`8${'2'.repeat(39)}`);
  buckets.seen(`8${'3'.repeat(39)}`);
  const stored = buckets.buckets[0];
  assert.equal(stored.length, 2);
  assert.equal(stored.includes(`8${'1'.repeat(39)}`), false);
});

test('a line of peers replicates a table and answers a lookup', async () => {
  const ids = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
  const mesh = createLinkedTransports(ids);
  const nodes = {};
  for (const id of ids) nodes[id] = createGridNode(mesh.transports[id]);
  mesh.connect(ids[0], ids[1]);
  mesh.connect(ids[1], ids[2]);
  nodes[ids[0]].receive({ t: 'ping', from: ids[1] });
  nodes[ids[1]].receive({ t: 'ping', from: ids[0] });
  nodes[ids[1]].receive({ t: 'ping', from: ids[2] });
  nodes[ids[2]].receive({ t: 'ping', from: ids[1] });
  nodes[ids[0]].share('mess', [[10], [20]]);
  assert.deepEqual(nodes[ids[2]].local('table:mess'), [[10], [20]]);
  nodes[ids[0]].putLocal('table:secret', [[7]]);
  const found = await nodes[ids[2]].fetch('secret');
  assert.deepEqual(found, [[7]]);
  assert.equal(keyId('table:mess').length, 40);
});

test('distributed chunks reduce to the full sum', () => {
  const rows = [[1], [2], [3], [4]];
  const parts = splitRows(rows, 2).map((chunk) => evaluateJob(chunk, 'sum', 1));
  assert.equal(reduceParts('sum', parts), evaluateJob(rows, 'sum', 1));
});
