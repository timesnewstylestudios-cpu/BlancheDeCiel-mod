import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the editor has one tool list and no login or key field', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.equal(ui.includes('api-key'), false);
  assert.equal(ui.includes('data-x-login'), false);
  assert.equal(ui.includes('x-client'), false);
  assert.equal(ui.includes("querySelector('#tool-tabs').innerHTML = ''"), true);
  assert.equal((ui.match(/id="server-url"/g) || []).length, 1);
  assert.equal((ui.match(/id="tracker"/g) || []).length, 1);
  const config = readFileSync(new URL('../public/config.json', import.meta.url), 'utf8');
  assert.equal(config.includes('xClientId'), false);
  assert.equal(config.includes('proxyUrl'), false);
});
