/* SPDX-License-Identifier: GPL-3.0-or-later
 * Move stacks of blocks: detach from a script, insert before/after, or into a C-slot.
 */

export function listAt(script, route) {
  const parts = String(route ?? '').split('.').filter((part) => part !== '');
  let list = script.blocks;
  for (let index = 0; index < parts.length - 1; index += 2) {
    const block = list?.[Number(parts[index])];
    if (!block) return { list: null, index: -1 };
    list = parts[index + 1] === 'e' ? block.elseBody : block.body;
  }
  return { list, index: Number(parts[parts.length - 1] ?? 0) };
}

export function takeStack(script, route) {
  const { list, index } = listAt(script, route);
  if (!list || index < 0 || index >= list.length) return [];
  return list.splice(index);
}

export function placeStack(script, route, stack, where = 'after') {
  if (!stack?.length) return false;
  const { list, index } = listAt(script, route);
  if (!list || index < 0 || index >= list.length) return false;
  const block = list[index];
  if (where === 'into') {
    if (!block.body) block.body = [];
    block.body.unshift(...stack);
    return true;
  }
  if (where === 'else') {
    if (!block.elseBody) block.elseBody = [];
    block.elseBody.unshift(...stack);
    return true;
  }
  const at = where === 'before' ? index : index + 1;
  list.splice(at, 0, ...stack);
  return true;
}

export function sameBranch(source, target) {
  if (!source || !target) return false;
  return source === target || target.startsWith(`${source}.`);
}

export function tidyScripts(scripts) {
  let y = 20;
  for (const script of scripts) {
    script.x = 20;
    script.y = y;
    const depth = JSON.stringify(script.blocks || []).length;
    y += 72 + Math.min(640, Math.ceil(depth / 8));
  }
  return y;
}

export function dropScripts(scripts) {
  for (let index = scripts.length - 1; index >= 0; index -= 1) {
    const script = scripts[index];
    if (!script.proc && !(script.blocks || []).length) scripts.splice(index, 1);
  }
}
