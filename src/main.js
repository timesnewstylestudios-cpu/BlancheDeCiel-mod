/* SPDX-License-Identifier: GPL-3.0-or-later */

import './styles.css';
import { createSession, loadNodeId, loadSettings, saveSettings } from './session.js';
import { createRuntime } from './runtime.js';
import { createAudio } from './audio.js';
import { createExtensionHost } from './extensions.js';
import { startBrowserGrid } from './browsergrid.js';
import { gemm, iceServers } from './accel.js';
import { randomId } from './kad.js';
import { mount } from './ui.js';
import { bluetoothAvailable, bluetoothPing } from './bluetooth.js';
import { evaluateJob } from './jobs.js';
import { browserStore, createLocalModel } from './localnet.js';
import { createHost } from './vunix.js';

const settings = loadSettings();
document.documentElement.lang = settings.lang;
document.documentElement.dataset.theme = settings.theme || 'light';
try {
  const configUrl = new URL('config.json', window.location.href);
  const config = await fetch(configUrl).then((response) => (response.ok ? response.json() : {}));
  if (config.serverUrl && !settings.serverUrl) settings.serverUrl = config.serverUrl;
  if (config.coordinatorUrl && !settings.coordinatorUrl) settings.coordinatorUrl = config.coordinatorUrl;
} catch { /* optional public config */ }
const session = createSession();
const bridge = { ask: async () => '' };
const input = { mouse: { x: 0, y: 0, down: false }, keys: new Set() };
const audio = createAudio();
const extensions = createExtensionHost();
const gridApi = startBrowserGrid(loadNodeId(randomId), () => iceServers(settings));

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
  userName: () => 'Gast',
  local,
  persistLocal,
  shell: (line) => unix.exec(line),
  accel: gemm,
  lang: () => settings.lang,
  extensions,
  bluetooth: { available: bluetoothAvailable, ping: bluetoothPing },
  grid: {
    share: (name, rows) => gridApi.node.share(name, rows),
    fetch: (name) => gridApi.node.fetch(name),
    publishJob: (info) => gridApi.node.publishJob(info),
    peerCount: () => gridApi.node.peerCount(),
  },
  ai: async () => local.suggest(session.project),
});

mount(document.querySelector('#app'), {
  session, runtime, settings, saveSettings, gridApi, audio, extensions, bridge, input, local, persistLocal,
  shell: (line) => unix.exec(line),
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

window.BlancheDeCiel = { session, runtime, grid: gridApi, extensions };
