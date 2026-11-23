import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBdl, extractBdl, parseBdl, projectToBdl } from '../src/bdl.js';
import { comparable, createProject, emptyProject } from '../src/model.js';

test('default project round-trips through BDL', () => {
  const project = createProject();
  const text = projectToBdl(project);
  const again = emptyProject();
  const applied = applyBdl(again, text);
  assert.equal(applied.ok, true, JSON.stringify(applied.errors));
  assert.deepEqual(comparable(again), comparable(project));
  const twice = applyBdl(again, text);
  assert.equal(twice.ok, true);
  assert.deepEqual(comparable(again), comparable(project));
});

test('quoted names and variables round-trip', () => {
  const source = `
sprite Figur
var "meine punkte" 3
clear-scripts
script 10 12
  when flag
  set "meine punkte" (add $"meine punkte" 1)
  say "end" 1
end
`;
  const project = emptyProject();
  assert.equal(applyBdl(project, source).ok, true);
  const sprite = project.sprites.find((item) => item.name === 'Figur');
  assert.equal(sprite.variables['meine punkte'], 3);
  const text = projectToBdl(project, { full: false });
  const copy = emptyProject();
  assert.equal(applyBdl(copy, text).ok, true);
  const sprite2 = copy.sprites.find((item) => item.name === 'Figur');
  assert.equal(sprite2.variables['meine punkte'], 3);
  assert.equal(sprite2.scripts[0].blocks[1].opcode, 'set');
});

test('edit replaces a block and rejects a bad index without mutating', () => {
  const project = createProject();
  const before = comparable(project);
  const bad = applyBdl(project, 'sprite Figur\nedit 1\n  replace 80 move 5\nend\n');
  assert.equal(bad.ok, false);
  assert.deepEqual(comparable(project), before);
  const good = applyBdl(project, 'sprite Figur\nedit 1\n  replace 2 move 5\nend\n');
  assert.equal(good.ok, true);
  const figur = project.sprites.find((item) => item.name === 'Figur');
  const replaced = figur.scripts.find((script) => !script.proc).blocks[1];
  assert.equal(replaced.opcode, 'move');
  assert.equal(replaced.args[0].value, 5);
});

test('parser reports a code for an unknown command', () => {
  const parsed = parseBdl('sprite Figur\nscript 1 1\n  when flag\n  fly 1\nend\n');
  assert.equal(parsed.errors.some((error) => error.code === 'unknown-opcode'), true);
});

test('extracts a fenced answer', () => {
  const text = 'Here:\n```bdl\nsprite Figur\nend\n```\nthanks';
  assert.match(extractBdl(text), /^sprite Figur/);
});
