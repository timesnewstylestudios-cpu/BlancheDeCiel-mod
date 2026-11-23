import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { applyBdl } from '../src/bdl.js';
import { addBackpackItem, removeBackpackItem } from '../src/backpack.js';
import { linkPaths } from '../src/bluetooth.js';
import { decompileJs } from '../src/jsparse.js';
import { emptyProject } from '../src/model.js';
import { encodeQr } from '../src/qr.js';
import { createRuntime } from '../src/runtime.js';
import { projectFromZip } from '../src/sb3.js';
import { trackerPayload } from '../src/signal.js';

function run(source) {
  const project = emptyProject();
  const applied = applyBdl(project, source);
  assert.equal(applied.ok, true, JSON.stringify(applied.errors));
  let now = 0;
  const runtime = createRuntime(project, { now: () => now });
  runtime.start();
  runtime.step();
  now = 5000;
  runtime.step();
  return project;
}

test('a procedure parameter changes the sprite and warp finishes a loop', () => {
  const project = run(`
sprite Figur
var n 0
clear-scripts
define addn steps
  change n $steps
end
define warp fast
  forever
    change n 1
    if (gt $n 20)
      stop this
    end
  end
end
script 1 1
  when flag
  call addn 5
end
`);
  assert.equal(project.sprites[0].variables.n, 5);
  const warp = run(`
sprite Figur
var n 0
clear-scripts
define warp fast
  forever
    change n 1
    if (gt $n 20)
      stop this
    end
  end
end
script 1 1
  when flag
  call fast
end
`);
  assert.ok(warp.sprites[0].variables.n > 20);
});

test('clones start and can delete themselves', () => {
  const created = run(`
sprite Figur
var n 0
clear-scripts
script 1 1
  when flag
  clone myself
end
script 20 20
  when clone
  change n 1
end
`);
  const clones = created.sprites.filter((sprite) => sprite.isClone);
  assert.equal(clones.length, 1);
  assert.equal(clones[0].variables.n, 1);
  assert.equal(created.sprites.find((sprite) => !sprite.isClone).variables.n, 0);
  const gone = run(`
sprite Figur
clear-scripts
script 1 1
  when flag
  clone myself
end
script 20 20
  when clone
  deleteclone
end
`);
  assert.equal(gone.sprites.filter((sprite) => sprite.isClone).length, 0);
});

test('javascript import covers params, else-if, arrays and for-of', () => {
  const result = decompileJs(`
function greet(name) {
  if (name) {
    console.log(name);
  } else if (name) {
    console.log("nein");
  }
}
let values = [1, 2];
let point = { x: 3 };
for (const item of values) {
  console.log(item);
}
`);
  assert.equal(result.ok, true, result.warnings.join(','));
  assert.match(result.bdl, /define greet name/);
  assert.match(result.bdl, /else/);
  assert.match(result.bdl, /clearlist values/);
  assert.match(result.bdl, /forof|repeat|item/s);
  assert.match(result.bdl, /point\.x/);
});

test('sb3 procedures and clones become runnable blocks', () => {
  const projectJson = {
    targets: [{
      isStage: false,
      name: 'Figur',
      variables: { v1: ['n', 0] },
      lists: {},
      broadcasts: {},
      blocks: {
        a: {
          opcode: 'procedures_definition', next: 'c', parent: null, inputs: { custom_block: [1, 'b'] },
          fields: {}, topLevel: true, x: 10, y: 10,
        },
        b: {
          opcode: 'procedures_prototype', next: null, parent: 'a', inputs: {}, fields: {}, shadow: true, topLevel: false,
          mutation: { proccode: 'tanz %n', argumentids: '["arg0"]', argumentnames: '["steps"]', warp: 'true' },
        },
        c: {
          opcode: 'data_changevariableby', next: null, parent: 'a',
          inputs: { VALUE: [3, 'd', [4, '1']] },
          fields: { VARIABLE: ['n', 'v1'] }, topLevel: false,
        },
        d: {
          opcode: 'argument_reporter_string_number', next: null, parent: 'c', inputs: {},
          fields: { VALUE: ['steps', null] }, topLevel: false,
        },
        e: {
          opcode: 'event_whenflagclicked', next: 'f', parent: null, inputs: {}, fields: {},
          topLevel: true, x: 10, y: 80,
        },
        f: {
          opcode: 'procedures_call', next: 'g', parent: 'e',
          inputs: { arg0: [1, [4, '4']] }, fields: {}, topLevel: false,
          mutation: { proccode: 'tanz %n', argumentids: '["arg0"]', warp: 'true' },
        },
        g: {
          opcode: 'control_create_clone_of', next: null, parent: 'f', inputs: {},
          fields: { CLONE_OPTION: ['_myself_', null] }, topLevel: false,
        },
        h: {
          opcode: 'control_start_as_clone', next: 'i', parent: null, inputs: {}, fields: {},
          topLevel: true, x: 10, y: 160,
        },
        i: {
          opcode: 'control_delete_this_clone', next: null, parent: 'h', inputs: {}, fields: {}, topLevel: false,
        },
      },
      costumes: [],
      sounds: [],
      x: 0, y: 0, size: 100, direction: 90, visible: true,
    }],
  };
  const bytes = zipSync({ 'project.json': strToU8(JSON.stringify(projectJson)) });
  const project = projectFromZip(bytes, []);
  const proc = project.sprites[0].scripts.find((script) => script.proc);
  assert.equal(proc.proc, 'tanz %n');
  assert.deepEqual(proc.params, ['steps']);
  assert.equal(proc.warp, true);
  let now = 0;
  const runtime = createRuntime(project, { now: () => now });
  runtime.start();
  runtime.step();
  now = 1000;
  runtime.step();
  assert.equal(project.sprites.find((sprite) => !sprite.isClone).variables.n, 4);
  assert.equal(project.sprites.filter((sprite) => sprite.isClone).length, 0);
});

test('qr room codes are stable matrices and backpack items can be removed', () => {
  const matrix = encodeQr('bdc:himmel');
  assert.equal(matrix.length, 25);
  assert.equal(matrix[3][3], 1);
  assert.deepEqual(matrix, encodeQr('bdc:himmel'));
  const kept = removeBackpackItem(addBackpackItem([], { type: 'script', name: 'a', script: { blocks: [] } }), 'missing');
  assert.equal(kept.length, 1);
  assert.equal(removeBackpackItem(kept, kept[0].id).length, 0);
});

test('bluetooth probes notice a native bridge before web bluetooth', () => {
  const paths = linkPaths({
    BlancheBridge: { requestDevice() { return { name: 'handy' }; } },
    navigator: {},
  });
  assert.equal(paths.bridge, true);
  assert.equal(paths.webBluetooth, false);
  const payload = trackerPayload('himmel', 'peer');
  assert.equal(payload.info_hash.length, 20);
  assert.equal(payload.action, 'announce');
});
