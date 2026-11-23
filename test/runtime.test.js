import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, emptyProject } from '../src/model.js';
import { applyBdl } from '../src/bdl.js';
import { createRuntime } from '../src/runtime.js';
import { COMMAND_OPCODES, REPORTER_OPCODES } from '../src/catalog.js';

test('the square returns to the origin facing right', () => {
  const project = createProject();
  let now = 0;
  const runtime = createRuntime(project, { now: () => now });
  runtime.start();
  runtime.step();
  const figur = project.sprites.find((sprite) => sprite.name === 'Figur');
  assert.equal(figur.x, 0);
  assert.equal(figur.y, 0);
  assert.equal(figur.dir, 90);
  assert.ok(project.drawOps.some((op) => op.op === 'line'));
  assert.equal(runtime.isRunning(), true);
  now = 3000;
  runtime.step();
  assert.equal(runtime.isRunning(), false);
});

test('repeat and change update a variable', () => {
  const project = emptyProject();
  applyBdl(project, `
sprite Figur
var n 0
clear-scripts
script 1 1
  when flag
  repeat 4
    change n 2
  end
end
`);
  let now = 0;
  const runtime = createRuntime(project, { now: () => now });
  runtime.start();
  runtime.step();
  assert.equal(project.sprites[0].variables.n, 8);
});

test('broadcast starts a receiver', () => {
  const project = emptyProject();
  applyBdl(project, `
sprite Figur
var hit 0
clear-scripts
script 1 1
  when flag
  broadcast ping
end
script 20 20
  when receive ping
  set hit 1
end
`);
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(project.sprites[0].variables.hit, 1);
});

test('job sums a table column', () => {
  const project = emptyProject();
  applyBdl(project, `
tables-reset
cleartable mess
table mess 10
table mess 20
table mess 30
sprite Figur
clear-scripts
script 1 1
  when flag
  job sum mess 1
  say (jobresult sum mess 1) 1
end
`);
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(project.jobResults['sum:mess:1'], 60);
});

test('every catalog opcode is implemented', () => {
  const project = createProject();
  const runtime = createRuntime(project);
  for (const opcode of COMMAND_OPCODES) assert.ok(runtime.commands.includes(opcode), opcode);
  for (const opcode of REPORTER_OPCODES) {
    const value = runtime.evalExpr({ kind: 'block', opcode, args: [] }, project.sprites[1]);
    assert.notEqual(value, undefined);
  }
});
