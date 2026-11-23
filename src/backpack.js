/* SPDX-License-Identifier: GPL-3.0-or-later */

import { cloneData, uid } from './model.js';

const KEY = 'bdc.backpack.v1';

export function addBackpackItem(items, item) {
  const next = [...(items || []), { id: uid(), at: Date.now(), ...cloneData(item) }];
  return next.slice(-40);
}

export function removeBackpackItem(items, id) {
  return (items || []).filter((item) => item.id !== id);
}

export function loadBackpack() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveBackpack(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items || []));
  } catch { /* quota */ }
}
