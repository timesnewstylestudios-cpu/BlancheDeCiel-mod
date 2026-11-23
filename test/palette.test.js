import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE, CATEGORY_ORDER } from '../src/palette.js';
import { BLOCKS } from '../src/catalog.js';
import { docTokens } from '../src/bdl.js';

test('core colours match the vendored PenguinMod palette', () => {
  const source = readFileSync('vendor/penguinmod-blocks/core/colours.js', 'utf8');
  const grab = (name) => {
    const match = source.match(new RegExp(`"${name}"\\s*:\\s*\\{[\\s\\S]*?"primary":\\s*"(#[0-9A-Fa-f]+)"`));
    assert.ok(match, name);
    return match[1].toLowerCase();
  };
  assert.equal(PALETTE.motion.c1.toLowerCase(), grab('motion'));
  assert.equal(PALETTE.looks.c1.toLowerCase(), grab('looks'));
  assert.equal(PALETTE.sound.c1.toLowerCase(), grab('sounds'));
  assert.equal(PALETTE.control.c1.toLowerCase(), grab('control'));
  assert.equal(PALETTE.events.c1.toLowerCase(), grab('event'));
  assert.equal(PALETTE.sensing.c1.toLowerCase(), grab('sensing'));
  assert.equal(PALETTE.operators.c1.toLowerCase(), grab('operators'));
  assert.equal(PALETTE.variables.c1.toLowerCase(), grab('data'));
  assert.equal(PALETTE.lists.c1.toLowerCase(), grab('data_lists'));
  assert.equal(PALETTE.myblocks.c1.toLowerCase(), grab('more'));
  assert.equal(PALETTE.pen.c1.toLowerCase(), grab('pen'));
});

test('every block uses a known category and both languages', () => {
  const opcodes = new Set();
  for (const entry of BLOCKS) {
    assert.ok(PALETTE[entry.cat], entry.opcode);
    assert.equal(opcodes.has(entry.opcode), false, entry.opcode);
    opcodes.add(entry.opcode);
    assert.ok(entry.de && entry.en);
    assert.ok(['hat', 'command', 'c', 'celse', 'reporter', 'boolean'].includes(entry.type));
  }
  for (const id of CATEGORY_ORDER) assert.ok(PALETTE[id].c1 && PALETTE[id].c2 && PALETTE[id].c3);
});

test('the DSL document names every token', () => {
  const doc = readFileSync('docs/bdl.md', 'utf8');
  for (const token of docTokens()) {
    assert.ok(doc.includes(`\`${token}\``), token);
  }
});
