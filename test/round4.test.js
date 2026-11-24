import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMatrix, encodeMatrix, errorMetrics, joinChunks, splitChunks } from '../src/weights.js';
import { addLayer, createNet, exportNet, importNet, predict, trainStep } from '../src/nn.js';
import { createLocalModel } from '../src/localnet.js';
import { createMachine } from '../src/vunix.js';
import { createRoom } from '../proxy/src/room.js';
import { applyBdl } from '../src/bdl.js';
import { createRuntime } from '../src/runtime.js';
import { emptyProject } from '../src/model.js';

test('rank-1 seeds round-trip and residuals shrink the error', () => {
  const exact = [[1, 2, 3], [2, 4, 6], [3, 6, 9]];
  const packed = encodeMatrix(exact, { rank: 1, residualCount: 0 });
  const back = decodeMatrix(packed);
  assert.equal(errorMetrics(exact, back).mse, 0);
  const eye = [[1, 0], [0, 1]];
  const rough = decodeMatrix(encodeMatrix(eye, { rank: 1, residualCount: 0 }));
  const fixed = decodeMatrix(encodeMatrix(eye, { rank: 1, residualCount: 4 }));
  assert.ok(errorMetrics(eye, fixed).mse < errorMetrics(eye, rough).mse);
  const wide = Array.from({ length: 16 }, (_, i) => Array.from({ length: 16 }, (_, j) => ((i + 1) * (j + 1)) / 20));
  const compact = JSON.stringify(encodeMatrix(wide, { rank: 1, residualCount: 8 }));
  assert.ok(compact.length < JSON.stringify(wide).length);
  const parts = splitChunks(compact, 100);
  assert.equal(joinChunks(parts), compact);
});

test('a dense layer learns a constant and the other layers stay finite', () => {
  const net = createNet('t');
  addLayer(net, { type: 'dense', input: 1, units: 1, activation: 'linear' });
  net.layers[0].w[0][0] = 0;
  net.layers[0].b[0] = 0;
  net.lr = 1;
  const step = trainStep(net, [0], [1]);
  assert.equal(net.layers[0].b[0], 1);
  assert.equal(step.after, 0);
  const conv = createNet('c');
  addLayer(conv, { type: 'conv1d', input: 3, units: 1, kernel: 2, activation: 'linear' });
  conv.layers[0].w[0] = [1, 1];
  conv.layers[0].b[0] = 0;
  assert.deepEqual(predict(conv, [1, 2, 3]), [3, 5]);
  const look = createNet('a');
  addLayer(look, { type: 'attention', input: 3, units: 3 });
  const weights = predict(look, [1, 0, 0]);
  const sum = weights.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6);
  const saved = importNet(exportNet(net));
  assert.equal(predict(saved, [0])[0], 1);
  net.optimizer = 'adam';
  trainStep(net, [0], [1]);
  assert.ok(Number.isFinite(net.layers[0].b[0]));
});

test('the local net learns a correction and suggests BDL', () => {
  const model = createLocalModel();
  for (let index = 0; index < 4; index += 1) model.train('move', 'say');
  assert.equal(model.predict('move'), 'say');
  const text = model.suggest({ sprites: [{ isStage: false, scripts: [{ blocks: [{ opcode: 'move' }] }] }] });
  assert.match(text, /say "Hallo"/);
  for (let index = 0; index < 8; index += 1) model.observe('say "Hallo" 1', 'pendown');
  assert.equal(model.predict('move'), 'pendown');
  const copy = createLocalModel();
  copy.importPack(model.exportPack());
  assert.equal(copy.predict('move'), 'pendown');
});

test('the sandbox shell never leaves its files', () => {
  const machine = createMachine();
  assert.equal(machine.exec('echo hallo | grep h').out, 'hallo');
  machine.exec('echo a > /tmp/x');
  assert.equal(machine.exec('cat /tmp/x').out, 'a');
  assert.match(machine.exec('audit').out, /schreibbar/);
  assert.match(machine.exec('cat /home/gast/geheim/marke.txt').out, /bdc\{nur-sandbox\}/);
  assert.equal(machine.exec('owncheck').code, 1);
  const note = machine.exec('owncheck ich-bin-berechtigt').out;
  assert.match(note, /Sandbox/);
  assert.match(note, /nicht enthalten/);
  assert.equal(machine.exec('cd /home/gast').code, 0);
  assert.equal(machine.exec('pwd').out, '/home/gast');
});

test('a meeting room starts the first peer and keeps chunks', () => {
  const room = createRoom();
  assert.equal(room.join('a').length, 0);
  const started = room.join('b');
  assert.equal(started[0].to, 'a');
  assert.equal(started[0].msg.t, 'start');
  const relay = room.relay('a', { t: 'signal', kind: 'offer', sdp: 'x' });
  assert.equal(relay[0].to, 'b');
  assert.equal(room.putChunk('job', 0, 2, 'aa'), false);
  assert.equal(room.putChunk('job', 1, 2, 'bb'), true);
  assert.equal(room.getTask('job').chunks.join(''), 'aabb');
});

test('procedures return values and a small tape loop runs', () => {
  const project = emptyProject();
  const fact = applyBdl(project, `
sprite Figur
clear-scripts
define fact n
  if (lt $n 2)
    return 1
  end
  call fact (sub $n 1)
  return (mul $n (result))
end
script 10 10
  when flag
  call fact 4
end
`);
  assert.equal(fact.ok, true, JSON.stringify(fact.errors));
  const runtime = createRuntime(project, { now: () => 0 });
  runtime.start();
  runtime.step();
  assert.equal(project.sprites[0].variables.Ergebnis, 24);

  const tape = emptyProject();
  const program = applyBdl(tape, `
sprite Rechner
var ip 1
var dp 1
var op 0
list code 1 1 1
list tape 0
clear-scripts
script 10 10
  when flag
  repeat 3
    set op (item $ip code)
    if (eq $op 1)
      setitem $dp tape (add (item $dp tape) 1)
    end
    change ip 1
  end
end
`);
  assert.equal(program.ok, true, JSON.stringify(program.errors));
  const loop = createRuntime(tape, { now: () => 0 });
  loop.start();
  loop.step();
  assert.equal(tape.sprites[0].lists.tape[0], 3);

  const counter = emptyProject();
  applyBdl(counter, `
sprite Figur
var n 0
clear-scripts
script 10 10
  when flag
  repeatuntil (gt $n 3)
    change n 1
  end
end
`);
  const steps = createRuntime(counter, { now: () => 0 });
  steps.start();
  for (let index = 0; index < 6; index += 1) steps.step();
  assert.equal(counter.sprites[0].variables.n, 4);
});
