/* SPDX-License-Identifier: GPL-3.0-or-later */

import { COMMAND_OPCODES, REPORTER_OPCODES } from './catalog.js';
import { projectToBdl } from './bdl.js';

export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

export function buildAiMessages(project, request) {
  const summary = projectToBdl(project, { maxBlocks: 70 });
  const system = [
    'You edit BlancheDeCiel block projects.',
    'Reply with one ```bdl fenced block and no other text.',
    'Stage coordinates: origin at center, x to the right, y up, x from -240 to 240, y from -180 to 180.',
    'Direction 0 faces up and 90 faces right. Clockwise turn increases direction.',
    `Commands: ${COMMAND_OPCODES.join(' ')} ext`,
    'Hats: when flag | when key <name> | when click | when receive <name>',
    `Reporters are parenthesized prefix calls: ${REPORTER_OPCODES.join(' ')}`,
    'Examples: move 10 | say "Hi" 2 | set punkte (add $punkte 1) | if (gt (x) 200)',
    'Open a stack with script <x> <y> or define <name>. Close every script, define, repeat, forever, if and repeatuntil with end.',
    'else belongs to the nearest if. Indentation is optional.',
    'Names with spaces or reserved words must be quoted.',
    'Omit tables-reset, clear3d and clear-scripts unless the user wants that state replaced.',
    'List columns and rows are 1-based. Table rows in a script use: row <table> <value>...',
    'Do not invent opcodes.',
  ].join('\n');
  const user = `PROJECT\n${summary}\nREQUEST\n${String(request || '').slice(0, 2000)}`;
  return { system, user, estimate: estimateTokens(system) + estimateTokens(user) };
}
