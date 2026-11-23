/* SPDX-License-Identifier: GPL-3.0-or-later */

function svgUrl(body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const COSTUME_LIBRARY = [
  { name: 'Dreieck', dataUrl: svgUrl('<polygon points="40,8 72,70 8,70" fill="#4C97FF"/>') },
  { name: 'Kreis', dataUrl: svgUrl('<circle cx="40" cy="40" r="28" fill="#9966FF"/>') },
  { name: 'Stern', dataUrl: svgUrl('<polygon points="40,6 49,30 74,30 54,46 62,72 40,56 18,72 26,46 6,30 31,30" fill="#FFBF00"/>') },
  { name: 'Herz', dataUrl: svgUrl('<path d="M40 68 L14 42 C4 30 12 14 28 18 C34 20 38 26 40 32 C42 26 46 20 52 18 C68 14 76 30 66 42 Z" fill="#E4572E"/>') },
  { name: 'Quadrat', dataUrl: svgUrl('<rect x="16" y="16" width="48" height="48" rx="6" fill="#0FBD8C"/>') },
];

export function toneWav(frequency, seconds = 0.35) {
  const rate = 8000;
  const count = Math.max(1, Math.floor(rate * seconds));
  const header = 44;
  const buffer = new Uint8Array(header + count * 2);
  const view = new DataView(buffer.buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) buffer[offset + i] = text.charCodeAt(i); };
  write(0, 'RIFF');
  view.setUint32(4, buffer.length - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i += 1) {
    const env = Math.min(1, i / 120, (count - i) / 300);
    const sample = Math.sin((2 * Math.PI * frequency * i) / rate) * 0.35 * env;
    view.setInt16(header + i * 2, sample * 32767, true);
  }
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export const SOUND_LIBRARY = [
  { name: 'C4', dataUrl: toneWav(261.63) },
  { name: 'E4', dataUrl: toneWav(329.63) },
  { name: 'G4', dataUrl: toneWav(392) },
  { name: 'C5', dataUrl: toneWav(523.25, 0.5) },
];

export function blankCostume(name = 'Zeichnung') {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return { name, dataUrl: COSTUME_LIBRARY[0].dataUrl };
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 80, 80);
  return { name, dataUrl: canvas.toDataURL('image/png') };
}
