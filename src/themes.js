/* SPDX-License-Identifier: GPL-3.0-or-later */

import { PALETTE } from './palette.js';

export const THEMES = {
  light: { de: 'Hell', en: 'Light' },
  dark: { de: 'Dunkel', en: 'Dark' },
  contrast: { de: 'Kontrast', en: 'High contrast' },
  sea: { de: 'Meer', en: 'Sea' },
  dusk: { de: 'Dämmerung', en: 'Dusk' },
};

function shift(hex, amount) {
  const num = Number.parseInt(hex.slice(1), 16);
  const mix = (shiftBy) => {
    const channel = (num >> shiftBy) & 255;
    return Math.max(0, Math.min(255, Math.round(channel + amount)));
  };
  return `#${[mix(16), mix(8), mix(0)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function paintFor(theme, category) {
  const base = PALETTE[category] || { c1: '#777777', c2: '#555555', c3: '#333333', de: category, en: category };
  if (theme === 'dark') return { ...base, c1: shift(base.c1, 28), c2: shift(base.c2, 10) };
  if (theme === 'dusk') return { ...base, c1: shift(base.c1, 12), c3: '#3a2418' };
  if (theme === 'contrast') return { ...base, c2: '#000000', c3: '#000000' };
  if (theme === 'sea') return { ...base, c1: shift(base.c1, 8) };
  return base;
}

export function clampSize(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function clampZoom(value) {
  return clampSize(value, 0.6, 2.2);
}
