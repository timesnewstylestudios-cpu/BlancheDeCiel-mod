/* SPDX-License-Identifier: GPL-3.0-or-later */

export function parseHex(value) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(value || '').trim());
  if (!match) return null;
  const num = Number.parseInt(match[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function nearColor(left, right, tolerance = 36) {
  if (!left || !right) return false;
  return Math.abs(left.r - right.r) <= tolerance
    && Math.abs(left.g - right.g) <= tolerance
    && Math.abs(left.b - right.b) <= tolerance;
}

export function hueToHex(hue) {
  const turn = (((Number(hue) % 100) + 100) % 100) / 100;
  const h = turn * 6;
  const sector = Math.floor(h);
  const frac = h - sector;
  const q = 1 - frac;
  const map = [
    [1, frac, 0],
    [q, 1, 0],
    [0, 1, frac],
    [0, q, 1],
    [frac, 0, 1],
    [1, 0, q],
  ][sector % 6];
  const byte = (channel) => Math.round(channel * 255).toString(16).padStart(2, '0');
  return `#${byte(map[0])}${byte(map[1])}${byte(map[2])}`;
}
