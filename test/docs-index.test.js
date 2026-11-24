import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function markdownFiles(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) markdownFiles(full, root, out);
    else if (name.endsWith('.md')) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

test('To-do.md names every markdown file', () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const index = readFileSync(path.join(root, 'To-do.md'), 'utf8');
  for (const file of markdownFiles(root, root)) {
    assert.ok(index.includes(`\`${file}\``), file);
  }
});
