import test from 'node:test';
import assert from 'node:assert/strict';
import { placeStack, sameBranch, takeStack, tidyScripts } from '../src/stack.js';
import { conv1d, conv2d, conv3d, convolve } from '../src/conv.js';
import { alphaOverlap, boundsOverlap, colorHitsColor, maskHitsColor } from '../src/hit.js';

test('a stack detaches and snaps into a C-slot', () => {
  const script = {
    blocks: [
      { opcode: 'whenflag' },
      { opcode: 'repeat', body: [], elseBody: null },
      { opcode: 'say' },
      { opcode: 'wait' },
    ],
  };
  const stack = takeStack(script, '2');
  assert.deepEqual(stack.map((block) => block.opcode), ['say', 'wait']);
  assert.equal(script.blocks.length, 2);
  assert.equal(placeStack(script, '1', stack, 'into'), true);
  assert.deepEqual(script.blocks[1].body.map((block) => block.opcode), ['say', 'wait']);
  assert.equal(sameBranch('1', '1.b.0'), true);
  assert.equal(sameBranch('1', '0'), false);
  const sprites = [{ blocks: [{ opcode: 'a' }, { opcode: 'b' }] }, { blocks: [{ opcode: 'c' }] }];
  tidyScripts(sprites);
  assert.ok(sprites[1].y > sprites[0].y);
});

test('convolution matches across ranks and the async path', async () => {
  assert.deepEqual(conv1d([1, 2, 3, 4], [1, 1]), [3, 5, 7]);
  const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(conv2d(grid, 3, [1, 0, 0, 1], 2), [6, 8, 12, 14]);
  const cube = Array.from({ length: 8 }, () => 1);
  assert.deepEqual(conv3d(cube, 2, [2], 1), [2, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(await convolve(1, [1, 2, 3], 3, [1, 1], 2), conv1d([1, 2, 3], [1, 1]));
  assert.deepEqual(await convolve(2, grid, 3, [1, 0, 0, 1], 2), conv2d(grid, 3, [1, 0, 0, 1], 2));
});

test('costume pixels hit a color, another costume, and a second color', () => {
  const mask = { w: 2, h: 1, data: Uint8ClampedArray.from([10, 20, 30, 255, 0, 0, 0, 0]) };
  const stage = { w: 2, h: 2, data: Uint8ClampedArray.from([
    10, 20, 30, 255, 0, 0, 0, 255,
    255, 0, 0, 255, 0, 0, 0, 255,
  ]) };
  const other = { w: 2, h: 1, data: Uint8ClampedArray.from([0, 0, 0, 0, 1, 1, 1, 255]) };
  assert.equal(boundsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 3, y: 3, w: 1, h: 1 }), false);
  assert.equal(boundsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }), true);
  assert.equal(alphaOverlap(mask, other, 0, 0), false);
  assert.equal(alphaOverlap(mask, { w: 2, h: 1, data: Uint8ClampedArray.from([9, 9, 9, 255, 0, 0, 0, 0]) }, 0, 0), true);
  assert.equal(maskHitsColor(mask, stage, 0, 0, { r: 10, g: 20, b: 30 }, 0), true);
  assert.equal(colorHitsColor(mask, stage, 0, 0, { r: 10, g: 20, b: 30 }, { r: 255, g: 0, b: 0 }, 0), true);
});
