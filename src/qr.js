/* SPDX-License-Identifier: GPL-3.0-or-later
 * QR Code, version 2, error correction L. Enough for a short room code.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function generator(length) {
  let poly = [1];
  for (let i = 0; i < length; i += 1) {
    const next = Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

const ECC_GEN = generator(10);

function ecc(data) {
  const result = new Uint8Array(data.length + 10);
  result.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const factor = result[i];
    if (!factor) continue;
    for (let j = 0; j < ECC_GEN.length; j += 1) result[i + j] ^= mul(ECC_GEN[j], factor);
  }
  return result.slice(data.length);
}

function bytesOf(text) {
  return new TextEncoder().encode(String(text));
}

function dataCodewords(text) {
  const raw = bytesOf(text);
  if (raw.length > 32) {
    const error = new Error('qr-too-long');
    error.code = 'qr-too-long';
    throw error;
  }
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(raw.length, 8);
  for (const byte of raw) push(byte, 8);
  for (let i = 0; i < 4 && bits.length < 34 * 8; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[i + bit];
    out.push(byte);
  }
  for (let pad = 0; out.length < 34; pad += 1) out.push(pad % 2 ? 0x11 : 0xec);
  return Uint8Array.from(out);
}

const SIZE = 25;

function emptyMatrix() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function setFinder(matrix, x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
      const edge = dx === -1 || dy === -1 || dx === 7 || dy === 7;
      const outer = dx === 0 || dy === 0 || dx === 6 || dy === 6;
      const inner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      matrix[yy][xx] = edge ? 0 : (outer || inner ? 1 : 0);
    }
  }
}

function reserve(matrix) {
  setFinder(matrix, 0, 0);
  setFinder(matrix, SIZE - 7, 0);
  setFinder(matrix, 0, SIZE - 7);
  for (let i = 0; i < SIZE; i += 1) {
    if (matrix[6][i] == null) matrix[6][i] = i % 2 === 0 ? 1 : 0;
    if (matrix[i][6] == null) matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }
  const align = 18;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      matrix[align + dy][align + dx] = dark ? 1 : 0;
    }
  }
  matrix[SIZE - 8][8] = 1;
  for (let i = 0; i < 9; i += 1) {
    if (matrix[8][i] == null) matrix[8][i] = 0;
    if (matrix[i][8] == null) matrix[i][8] = 0;
    if (matrix[8][SIZE - 1 - i] == null) matrix[8][SIZE - 1 - i] = 0;
    if (matrix[SIZE - 1 - i][8] == null) matrix[SIZE - 1 - i][8] = 0;
  }
}

function placeData(matrix, codewords) {
  const bits = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >>> i) & 1);
  }
  let bit = 0;
  let upward = true;
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    const rows = upward ? [...Array(SIZE).keys()].reverse() : [...Array(SIZE).keys()];
    for (const row of rows) {
      for (const dx of [0, -1]) {
        const x = col + dx;
        if (matrix[row][x] == null) {
          matrix[row][x] = bits[bit] || 0;
          bit += 1;
        }
      }
    }
    upward = !upward;
  }
}

function applyMask(matrix) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if ((x + y) % 2 === 0 && isData(x, y)) matrix[y][x] ^= 1;
    }
  }
}

function isData(x, y) {
  const finder = (x < 9 && y < 9) || (x > SIZE - 9 && y < 9) || (x < 9 && y > SIZE - 9);
  const timing = x === 6 || y === 6;
  const align = x >= 16 && x <= 20 && y >= 16 && y <= 20;
  const format = (x === 8 && (y < 9 || y > SIZE - 9)) || (y === 8 && (x < 9 || x > SIZE - 9));
  return !finder && !timing && !align && !format && !(x === 8 && y === SIZE - 8);
}

function formatBits() {
  // ECC level L (01) and mask 0, already XOR-masked with 0x5412. Standard value.
  return '111011111000100';
}

function writeFormat(matrix) {
  const bits = formatBits();
  const positionsA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const positionsB = [];
  for (let i = 0; i < 7; i += 1) positionsB.push([SIZE - 1 - i, 8]);
  positionsB.push([8, SIZE - 8]);
  for (let i = 0; i < 7; i += 1) positionsB.push([8, SIZE - 7 + i]);
  bits.split('').forEach((bit, index) => {
    matrix[positionsA[index][1]][positionsA[index][0]] = Number(bit);
    const [x, y] = positionsB[index];
    matrix[y][x] = Number(bit);
  });
}

export function encodeQr(text) {
  const data = dataCodewords(text);
  const parity = ecc(data);
  const codewords = new Uint8Array(data.length + parity.length);
  codewords.set(data);
  codewords.set(parity, data.length);
  const matrix = emptyMatrix();
  reserve(matrix);
  placeData(matrix, codewords);
  applyMask(matrix);
  writeFormat(matrix);
  return matrix.map((row) => row.map((cell) => (cell ? 1 : 0)));
}

export function qrSvg(text, scale = 4) {
  const matrix = encodeQr(text);
  const size = (matrix.length + 8) * scale;
  let rects = '';
  matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) rects += `<rect x="${(x + 4) * scale}" y="${(y + 4) * scale}" width="${scale}" height="${scale}"/>`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${rects.replaceAll('<rect', '<rect fill="#16324f"')}</svg>`;
}
