/* SPDX-License-Identifier: GPL-3.0-or-later
 * The xAI key stays in sessionStorage unless the user opts in to remembering it.
 * An X login token is never written to localStorage.
 */

export function splitSettings(settings) {
  const disk = { ...settings };
  delete disk.xToken;
  delete disk.xUser;
  if (!settings.rememberKey) delete disk.apiKey;
  else disk.apiKey = settings.apiKey || '';
  return {
    disk,
    session: {
      apiKey: settings.rememberKey ? '' : (settings.apiKey || ''),
      xToken: settings.xToken || '',
      xUser: settings.xUser || '',
    },
  };
}

export function mergeSettings(defaults, disk, session) {
  const stored = disk ? { ...disk } : {};
  if (stored.apiKey && stored.rememberKey === undefined) stored.rememberKey = true;
  const merged = { ...defaults, ...stored, apiKey: '', xToken: '', xUser: '' };
  if (stored.rememberKey && stored.apiKey) merged.apiKey = stored.apiKey;
  else if (session?.apiKey) merged.apiKey = session.apiKey;
  if (session?.xToken) merged.xToken = session.xToken;
  if (session?.xUser) merged.xUser = session.xUser;
  return merged;
}
