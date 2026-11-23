/* SPDX-License-Identifier: GPL-3.0-or-later */

import { cloneData, createProject } from './model.js';

const SETTINGS_KEY = 'bdc.settings.v1';
const PROJECT_KEY = 'bdc.project.v1';
const NODE_KEY = 'bdc.nodeId';

export const defaultSettings = {
  lang: 'de',
  apiKey: '',
  model: 'grok-4.7',
  baseUrl: 'https://api.x.ai/v1',
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaultSettings, ...stored, apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '' };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  const next = {
    lang: settings.lang === 'en' ? 'en' : 'de',
    apiKey: settings.apiKey || '',
    model: settings.model || defaultSettings.model,
    baseUrl: settings.baseUrl || defaultSettings.baseUrl,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function loadNodeId(makeId) {
  let id = localStorage.getItem(NODE_KEY);
  if (!id || id.length < 32) {
    id = makeId();
    localStorage.setItem(NODE_KEY, id);
  }
  return id;
}

function slim(project) {
  const copy = cloneData(project);
  const raw = JSON.stringify(copy);
  if (raw.length < 1500000) return raw;
  for (const sprite of copy.sprites) {
    sprite.costume = null;
    sprite.sounds = [];
  }
  if (copy.drawOps?.length > 2000) copy.drawOps = copy.drawOps.slice(-2000);
  return JSON.stringify(copy);
}

export function createSession() {
  let project = createProject();
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
    if (stored?.sprites) project = stored;
  } catch { /* keep the sample */ }
  const history = [];
  const future = [];
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); };
  const persist = () => {
    try { localStorage.setItem(PROJECT_KEY, slim(project)); } catch { /* quota */ }
  };
  const adopt = (next) => {
    for (const key of Object.keys(project)) delete project[key];
    Object.assign(project, next);
  };
  const checkpoint = () => {
    history.push(JSON.stringify(project));
    if (history.length > 40) history.shift();
    future.length = 0;
  };
  return {
    get project() { return project; },
    checkpoint,
    pushUndo(json) {
      history.push(json);
      if (history.length > 40) history.shift();
      future.length = 0;
    },
    update(mutator) {
      checkpoint();
      mutator(project);
      persist();
      emit();
    },
    replace(next) {
      checkpoint();
      adopt(next);
      persist();
      emit();
    },
    touch() {
      persist();
      emit();
    },
    undo() {
      if (!history.length) return;
      future.push(JSON.stringify(project));
      adopt(JSON.parse(history.pop()));
      persist();
      emit();
    },
    redo() {
      if (!future.length) return;
      history.push(JSON.stringify(project));
      adopt(JSON.parse(future.pop()));
      persist();
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
