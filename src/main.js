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
import { chatComplete } from './client.js';

const settings = loadSettings();
document.documentElement.lang = settings.lang;
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

const runtime = createRuntime(session.project, {
  audio,
  input,
  ask: (question) => bridge.ask(question),
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
    if (!settings.apiKey) throw new Error(settings.lang === 'en' ? 'Missing API key' : 'API-Schlüssel fehlt');
    const messages = buildAiMessages(session.project, request);
    const result = await chatComplete({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      system: messages.system,
      user: messages.user,
    });
    return result.content;
  },
});

mount(document.querySelector('#app'), {
  session, runtime, settings, saveSettings, gridApi, audio, extensions, bridge, input,
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

window.BlancheDeCiel = { session, runtime, grid: gridApi, extensions };
