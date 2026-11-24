/* SPDX-License-Identifier: GPL-3.0-or-later */

import './styles.css';
import { createSession, loadNodeId, loadSettings, saveSettings } from './session.js';
import { createRuntime } from './runtime.js';
import { createAudio } from './audio.js';
import { createExtensionHost } from './extensions.js';
import { startBrowserGrid } from './browsergrid.js';
import { randomId } from './kad.js';
import { mount } from './ui.js';
import { bluetoothAvailable, bluetoothPing } from './bluetooth.js';
import { evaluateJob } from './jobs.js';
import { buildAiMessages } from './prompt.js';
import { chatComplete, chatViaProxy } from './client.js';
import { finishLogin } from './oauth.js';
import { browserStore, createLocalModel } from './localnet.js';
import { createHost } from './vunix.js';

const settings = loadSettings();
document.documentElement.lang = settings.lang;
document.documentElement.dataset.theme = settings.theme || 'light';
try {
  const configUrl = new URL('config.json', window.location.href);
  const config = await fetch(configUrl).then((response) => (response.ok ? response.json() : {}));
  if (config.serverUrl && !settings.serverUrl) settings.serverUrl = config.serverUrl;
  if (config.proxyUrl && !settings.proxyUrl) settings.proxyUrl = config.proxyUrl;
  if (config.coordinatorUrl && !settings.coordinatorUrl) settings.coordinatorUrl = config.coordinatorUrl;
  if (settings.serverUrl && !settings.proxyUrl) settings.proxyUrl = settings.serverUrl;
  if (config.xClientId && !settings.xClientId) settings.xClientId = config.xClientId;
} catch { /* optional public config */ }
try {
  await finishLogin(settings);
  saveSettings(settings);
} catch { /* login callback can fail without blocking the editor */ }
const session = createSession();
const bridge = { ask: async () => '' };
const input = { mouse: { x: 0, y: 0, down: false }, keys: new Set() };
const audio = createAudio();
const extensions = createExtensionHost();
const gridApi = startBrowserGrid(loadNodeId(randomId));

gridApi.node.onJob((info, from) => {
  const result = evaluateJob(info.rows || [], info.op, info.column);
  session.project.jobLog.push({ from, op: info.op, name: info.name, column: info.column, result, at: Date.now() });
  if (session.project.jobLog.length > 40) session.project.jobLog.shift();
});

const local = createLocalModel();
const localStore = browserStore();
localStore.get('model').then((pack) => { if (pack) local.importPack(pack); }).catch(() => {});
const unix = createHost();
const persistLocal = () => localStore.set('model', local.exportPack());

const runtime = createRuntime(session.project, {
  audio,
  input,
  ask: (question) => bridge.ask(question),
  sample: (x, y) => (bridge.sample ? bridge.sample(x, y) : null),
  userName: () => settings.xUser || 'Gast',
  local,
  persistLocal,
  shell: (line) => unix.exec(line),
  lang: () => settings.lang,
  extensions,
  bluetooth: { available: bluetoothAvailable, ping: bluetoothPing },
  grid: {
    share: (name, rows) => gridApi.node.share(name, rows),
    fetch: (name) => gridApi.node.fetch(name),
    publishJob: (info) => gridApi.node.publishJob(info),
    peerCount: () => gridApi.node.peerCount(),
  },
  ai: async (request) => {
    const messages = buildAiMessages(session.project, request);
    const result = await sendChat(messages.system, messages.user);
    return result.content;
  },
});

async function sendChat(system, user) {
  if (settings.aiMode === 'local') return { content: local.suggest(session.project) };
  const server = settings.serverUrl || settings.proxyUrl;
  if (settings.aiMode !== 'key' && server && settings.xToken) {
    return chatViaProxy({
      proxyUrl: server,
      xToken: settings.xToken,
      model: settings.model,
      system,
      user,
    });
  }
  if (settings.apiKey && (settings.aiMode === 'key' || !server)) {
    return chatComplete({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      system,
      user,
    });
  }
  throw new Error(settings.lang === 'en'
    ? 'Log in with X or use the local net'
    : 'Melde dich mit X an oder nutze das lokale Netz');
}

mount(document.querySelector('#app'), {
  session, runtime, settings, saveSettings, gridApi, audio, extensions, bridge, input, sendChat, local, persistLocal,
  shell: (line) => unix.exec(line),
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

window.BlancheDeCiel = { session, runtime, grid: gridApi, extensions };
