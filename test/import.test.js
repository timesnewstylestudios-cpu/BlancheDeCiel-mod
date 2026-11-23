import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { decompileJs } from '../src/jsparse.js';
import { analyzeBytes, analyzeText, extractEmbeddedZip } from '../src/importfile.js';
import { applyBdl } from '../src/bdl.js';
import { emptyProject } from '../src/model.js';
import { buildAiMessages } from '../src/prompt.js';
import { createProject } from '../src/model.js';
import { projectPoint } from '../src/paint.js';

const SOURCE = `
function treppe() {
  let x = -120;
  for (let i = 0; i < 5; i++) {
    x = x + 40;
    console.log(x);
  }
}
`;

test('javascript lowers a counted loop into repeat and say', () => {
  const result = decompileJs(SOURCE);
  assert.equal(result.ok, true, result.warnings.join(','));
  assert.match(result.bdl, /repeat 5/);
  assert.match(result.bdl, /define treppe/);
  assert.match(result.bdl, /say/);
  const project = emptyProject();
  assert.equal(applyBdl(project, result.bdl).ok, true);
});

test('html with an embedded zip becomes a project', () => {
  const json = JSON.stringify({
    targets: [{
      isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
      costumes: [], sounds: [],
    }],
  });
  const bytes = zipSync({ 'project.json': strToU8(json) });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const html = `<html><script>var projectData = "${btoa(binary)}";</script></html>`;
  const found = extractEmbeddedZip(html);
  assert.ok(found);
  const analysis = analyzeText('pack.html', html);
  assert.equal(analysis.kind, 'project');
  assert.equal(analysis.project.sprites[0].isStage, true);
  const fromBytes = analyzeBytes('demo.sb3', bytes);
  assert.equal(fromBytes.kind, 'project');
});

test('the AI prompt is a short BDL summary', () => {
  const messages = buildAiMessages(createProject(), 'male ein Quadrat');
  assert.match(messages.system, /when flag/);
  assert.match(messages.user, /sprite Figur/);
  assert.equal(messages.user.includes('"blocks"'), false);
  assert.ok(messages.estimate < 4000);
});

test('a centered 3D point projects near the stage center', () => {
  const point = projectPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 280, yaw: 0, pitch: 0 });
  assert.ok(Math.abs(point.x - 240) < 1);
  assert.ok(Math.abs(point.y - 180) < 1);
});
