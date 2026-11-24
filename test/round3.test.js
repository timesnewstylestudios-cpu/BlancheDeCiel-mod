import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hueToHex, nearColor, parseHex } from '../src/color.js';
import { takeToken } from '../proxy/src/limit.js';
import { mergeSettings, splitSettings } from '../src/secrets.js';
import { clampZoom, paintFor, THEMES } from '../src/themes.js';
import { emptyProject } from '../src/model.js';
import { applyBdl } from '../src/bdl.js';
import { createRuntime } from '../src/runtime.js';

test('old keys and login tokens are not stored', () => {
  const parts = splitSettings({ apiKey: 'secret', xToken: 'x', serverUrl: 'https://example.test', lang: 'de' });
  assert.equal(parts.disk.apiKey, undefined);
  assert.equal(parts.disk.xToken, undefined);
  assert.equal(parts.disk.serverUrl, 'https://example.test');
  assert.deepEqual(parts.session, {});
  const merged = mergeSettings({ serverUrl: '', lang: 'de' }, { apiKey: 'legacy', xClientId: 'abc', serverUrl: 'https://peer.test' });
  assert.equal(merged.apiKey, undefined);
  assert.equal(merged.xClientId, undefined);
  assert.equal(merged.serverUrl, 'https://peer.test');
  const worker = readFileSync(new URL('../proxy/src/worker.js', import.meta.url), 'utf8');
  assert.equal(worker.includes('api.x.ai'), false);
  assert.equal(worker.includes('oauth'), false);
});

test('rate limit and color helpers', () => {
  const buckets = new Map();
  assert.equal(takeToken(buckets, 'ada', 0, 2, 1000).ok, true);
  assert.equal(takeToken(buckets, 'ada', 10, 2, 1000).ok, true);
  assert.equal(takeToken(buckets, 'ada', 20, 2, 1000).ok, false);
  assert.equal(takeToken(buckets, 'ada', 1000, 2, 1000).ok, true);
  assert.equal(hueToHex(0), '#ff0000');
  assert.equal(nearColor(parseHex('#ff0000'), parseHex('#ff1010'), 20), true);
  assert.equal(nearColor(parseHex('#ff0000'), parseHex('#00ff00'), 20), false);
});

test('themes stay named and zoom stays in range', () => {
  for (const id of Object.keys(THEMES)) {
    assert.ok(THEMES[id].de && THEMES[id].en);
    assert.match(paintFor(id, 'motion').c1, /^#[0-9a-fA-F]{6}$/);
  }
  assert.equal(clampZoom(9), 2.2);
  assert.equal(clampZoom(0), 0.6);
});

test('touching color is false without a stage sample, and broadcast-wait finishes', () => {
  const project = emptyProject();
  const applied = applyBdl(project, `
sprite Figur
var hit 0
clear-scripts
script 1 1
  when flag
  broadcastwait ping
end
script 20 20
  when receive ping
  set hit 1
end
`);
  assert.equal(applied.ok, true, JSON.stringify(applied.errors));
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(project.sprites[0].variables.hit, 1);
  const touching = runtime.evalExpr({ kind: 'block', opcode: 'touchcolor', args: [{ kind: 'str', value: '#ff0000' }] }, project.sprites[0]);
  assert.equal(touching, false);
});
