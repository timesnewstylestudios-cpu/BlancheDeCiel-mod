/* SPDX-License-Identifier: GPL-3.0-or-later
 * Pixel tests on RGBA buffers. Callers draw the costume with its rotation and size first.
 */

export function boundsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function near(data, index, color, tolerance) {
  if (!color) return false;
  return Math.abs(data[index] - color.r) <= tolerance
    && Math.abs(data[index + 1] - color.g) <= tolerance
    && Math.abs(data[index + 2] - color.b) <= tolerance;
}

export function alphaOverlap(left, right, ox, oy) {
  if (!boundsOverlap(
    { x: 0, y: 0, w: left.w, h: left.h },
    { x: ox, y: oy, w: right.w, h: right.h },
  )) return false;
  for (let y = 0; y < left.h; y += 1) {
    for (let x = 0; x < left.w; x += 1) {
      const rx = x - ox;
      const ry = y - oy;
      if (rx < 0 || ry < 0 || rx >= right.w || ry >= right.h) continue;
      const ai = (y * left.w + x) * 4 + 3;
      const bi = (ry * right.w + rx) * 4 + 3;
      if (left.data[ai] > 20 && right.data[bi] > 20) return true;
    }
  }
  return false;
}

export function maskHitsColor(mask, stage, ox, oy, color, tolerance = 36) {
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      const mi = (y * mask.w + x) * 4;
      if (mask.data[mi + 3] < 20) continue;
      const sx = x + ox;
      const sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= stage.w || sy >= stage.h) continue;
      if (near(stage.data, (sy * stage.w + sx) * 4, color, tolerance)) return true;
    }
  }
  return false;
}

export function colorHitsColor(mask, stage, ox, oy, mine, other, tolerance = 36) {
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      const mi = (y * mask.w + x) * 4;
      if (mask.data[mi + 3] < 20 || !near(mask.data, mi, mine, tolerance)) continue;
      for (const [dx, dy] of around) {
        const sx = x + ox + dx;
        const sy = y + oy + dy;
        if (sx < 0 || sy < 0 || sx >= stage.w || sy >= stage.h) continue;
        if (near(stage.data, (sy * stage.w + sx) * 4, other, tolerance)) return true;
      }
    }
  }
  return false;
}
