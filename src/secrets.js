/* SPDX-License-Identifier: GPL-3.0-or-later
 * Settings live in localStorage. Old xAI keys and X tokens are dropped and never written back.
 */

const SECRET = ['apiKey', 'rememberKey', 'xToken', 'xUser', 'xClientId', 'model', 'baseUrl', 'proxyUrl', 'aiMode'];

export function splitSettings(settings) {
  const disk = { ...settings };
  for (const key of SECRET) delete disk[key];
  return { disk, session: {} };
}

export function mergeSettings(defaults, disk) {
  const stored = { ...(disk || {}) };
  for (const key of SECRET) delete stored[key];
  return { ...defaults, ...stored };
}
