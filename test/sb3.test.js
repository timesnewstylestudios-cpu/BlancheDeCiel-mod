import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { createProject } from '../src/model.js';
import { createRuntime } from '../src/runtime.js';
import { exportSb3, projectFromZip } from '../src/sb3.js';
import { md5 } from '../src/hash.js';

test('md5 matches known vectors', () => {
  assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5('a'), '0cc175b9c0f1b6a831c399e269772661');
  assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
});

test('sb3 export of the sample keeps the square and runs', () => {
  const bytes = exportSb3(createProject());
  const warnings = [];
  const project = projectFromZip(bytes, warnings);
  const figur = project.sprites.find((sprite) => sprite.name === 'Figur');
  const opcodes = JSON.stringify(figur.scripts);
  assert.match(opcodes, /whenflag/);
  assert.match(opcodes, /move/);
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(figur.x, 0);
  assert.equal(figur.y, 0);
});

test('a hand-written project.json moves ten steps', () => {
  const projectJson = {
    targets: [{
      isStage: false,
      name: 'Figur',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {
        a: {
          opcode: 'event_whenflagclicked', next: 'b', parent: null, inputs: {}, fields: {},
          topLevel: true, x: 20, y: 20,
        },
        b: {
          opcode: 'motion_movesteps', next: null, parent: 'a',
          inputs: { STEPS: [1, [4, '10']] }, fields: {}, topLevel: false,
        },
      },
      costumes: [],
      sounds: [],
      x: 0, y: 0, size: 100, direction: 90, visible: true,
    }],
    meta: { semver: '3.0.0' },
  };
  const bytes = zipSync({ 'project.json': strToU8(JSON.stringify(projectJson)) });
  const project = projectFromZip(bytes, []);
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(project.sprites[0].x, 10);
  const unzipped = unzipSync(bytes);
  assert.match(strFromU8(unzipped['project.json']), /motion_movesteps/);
});
