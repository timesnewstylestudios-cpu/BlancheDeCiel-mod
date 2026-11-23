/* SPDX-License-Identifier: GPL-3.0-or-later */

import { specByOpcode } from './catalog.js';

function textOf(expr, lang) {
  if (!expr) return '0';
  if (expr.kind === 'num') return String(expr.value);
  if (expr.kind === 'str') return expr.value;
  if (expr.kind === 'var') return expr.name;
  if (expr.kind === 'block') {
    if (expr.opcode === 'var' && expr.args[0]) return textOf(expr.args[0], lang);
    const spec = specByOpcode(expr.opcode);
    const args = (expr.args || []).map((arg) => textOf(arg, lang));
    if (spec) return specLabel(spec, lang, args);
    return `${expr.opcode}(${args.join(', ')})`;
  }
  return '0';
}

function specLabel(spec, lang, args) {
  return fill(lang === 'en' ? spec.en : spec.de, args);
}

function fill(template, args) {
  return template.replace(/%(\d+)/g, (_, index) => args[Number(index) - 1] ?? '');
}

function emit(blocks, indent, lines, lang) {
  const pad = '  '.repeat(indent);
  for (const block of blocks || []) {
    const spec = specByOpcode(block.opcode);
    const args = (block.args || []).map((expr) => textOf(expr, lang));
    if (block.opcode === 'if') {
      lines.push(`${pad}${spec ? specLabel(spec, lang, args) : 'if'}`);
      emit(block.body, indent + 1, lines, lang);
      if (block.elseBody && block.elseBody.length) {
        lines.push(`${pad}${lang === 'en' ? 'else' : 'sonst'}`);
        emit(block.elseBody, indent + 1, lines, lang);
      }
      continue;
    }
    if (block.body) {
      lines.push(`${pad}${spec ? specLabel(spec, lang, args) : block.opcode}`);
      emit(block.body, indent + 1, lines, lang);
      continue;
    }
    lines.push(`${pad}${spec ? specLabel(spec, lang, args) : block.opcode}`);
  }
}

export function toPseudo(project, sprite, lang = 'de') {
  const lines = [];
  const where = lang === 'en' ? 'at' : 'bei';
  lines.push(`${sprite.name} ${where} (${sprite.x}, ${sprite.y})`);
  for (const [name, value] of Object.entries(sprite.variables || {})) lines.push(`${name} = ${value}`);
  for (const [name, items] of Object.entries(sprite.lists || {})) lines.push(`${name} = [${items.join(', ')}]`);
  for (const script of sprite.scripts) {
    if (script.proc) {
      lines.push(lang === 'en' ? `define ${script.proc}:` : `definiere ${script.proc}:`);
      emit(script.blocks, 1, lines, lang);
    } else {
      emit(script.blocks, 0, lines, lang);
    }
  }
  return lines.join('\n');
}

export function projectPseudo(project, lang = 'de') {
  return project.sprites.map((sprite) => toPseudo(project, sprite, lang)).join('\n\n');
}
