/* SPDX-License-Identifier: GPL-3.0-or-later
 * Compact weight packages: rank-k seeds from a row/column outer product,
 * optional PRNG seed, and sparse int16 residuals for the points that still matter.
 */

export function float16Bits(value) {
  const buffer = new ArrayBuffer(4);
  const f32 = new Float32Array(buffer);
  const u32 = new Uint32Array(buffer);
  f32[0] = Number.isFinite(value) ? value : 0;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  const fraction = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    const shifted = (fraction | 0x800000) >> (1 - exponent);
    return sign | (shifted >> 13);
  }
  if (exponent >= 31) return sign | 0x7c00;
  return sign | (exponent << 10) | (fraction >> 13);
}

export function float16Value(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * (fraction / 1024) * 2 ** -14;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function zeros(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function copy(matrix) {
  return matrix.map((row) => row.slice());
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prngMatrix(seed, rows, cols) {
  const next = mulberry32(seed);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (next() * 2 - 1) * 0.5));
}

function rank1(residual) {
  const rows = residual.length;
  const cols = residual[0].length;
  let bi = 0;
  let bj = 0;
  let best = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const abs = Math.abs(residual[i][j]);
      if (abs > best) {
        best = abs;
        bi = i;
        bj = j;
      }
    }
  }
  const pivot = residual[bi][bj] || 1;
  const u = residual.map((row) => row[bj]);
  const v = residual[bi].slice();
  const approx = zeros(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) approx[i][j] = (u[i] * v[j]) / pivot;
  }
  return { u, v, pivot, approx };
}

function subtract(residual, approx) {
  for (let i = 0; i < residual.length; i += 1) {
    for (let j = 0; j < residual[0].length; j += 1) residual[i][j] -= approx[i][j];
  }
}

function quantizeVector(values) {
  return values.map((value) => float16Bits(value));
}

export function encodeMatrix(matrix, options = {}) {
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  if (!rows || !cols) throw new Error('empty-matrix');
  const mode = options.mode === 'prng' ? 'prng' : 'factors';
  const rank = mode === 'prng' ? 0 : Math.max(0, Math.min(options.rank ?? 1, rows, cols));
  const residualCount = Math.max(0, options.residualCount ?? Math.min(16, rows * cols));
  const seed = mode === 'prng' ? (options.seed >>> 0) : 0;
  const residual = mode === 'prng' ? copy(matrix) : copy(matrix);
  if (mode === 'prng') {
    const base = prngMatrix(seed, rows, cols);
    subtract(residual, base);
  }
  const factors = [];
  for (let index = 0; index < rank; index += 1) {
    const factor = rank1(residual);
    factors.push({
      u: quantizeVector(factor.u),
      v: quantizeVector(factor.v),
      pivot: float16Bits(factor.pivot),
    });
    const rebuilt = rank1FromBits(factor.u.map(float16Bits), factor.v.map(float16Bits), float16Bits(factor.pivot), rows, cols);
    subtract(residual, rebuilt.approx);
  }
  const cells = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) cells.push({ i, j, value: residual[i][j] });
  }
  cells.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const kept = cells.slice(0, residualCount).filter((cell) => cell.value !== 0);
  const peak = kept.reduce((max, cell) => Math.max(max, Math.abs(cell.value)), 0);
  const scale = peak > 0 ? peak / 32767 : 1;
  return {
    kind: 'bdc-weights-1',
    rows,
    cols,
    mode,
    seed,
    factors,
    residual: {
      scale,
      i: kept.map((cell) => cell.i),
      j: kept.map((cell) => cell.j),
      v: kept.map((cell) => Math.max(-32767, Math.min(32767, Math.round(cell.value / scale)))),
    },
  };
}

function rank1FromBits(uBits, vBits, pivotBits, rows, cols) {
  const u = uBits.map(float16Value);
  const v = vBits.map(float16Value);
  const pivot = float16Value(pivotBits) || 1;
  const approx = zeros(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) approx[i][j] = (u[i] * v[j]) / pivot;
  }
  return { approx };
}

export function decodeMatrix(pack) {
  const rows = pack.rows;
  const cols = pack.cols;
  const matrix = pack.mode === 'prng' ? prngMatrix(pack.seed >>> 0, rows, cols) : zeros(rows, cols);
  for (const factor of pack.factors || []) {
    const rebuilt = rank1FromBits(factor.u, factor.v, factor.pivot, rows, cols);
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) matrix[i][j] += rebuilt.approx[i][j];
    }
  }
  const residual = pack.residual || { scale: 1, i: [], j: [], v: [] };
  for (let index = 0; index < residual.v.length; index += 1) {
    const i = residual.i[index];
    const j = residual.j[index];
    matrix[i][j] += residual.v[index] * residual.scale;
  }
  return matrix;
}

export function errorMetrics(original, decoded) {
  let square = 0;
  let maxAbs = 0;
  let energy = 0;
  let count = 0;
  for (let i = 0; i < original.length; i += 1) {
    for (let j = 0; j < original[0].length; j += 1) {
      const diff = original[i][j] - decoded[i][j];
      square += diff * diff;
      energy += original[i][j] * original[i][j];
      maxAbs = Math.max(maxAbs, Math.abs(diff));
      count += 1;
    }
  }
  return {
    mse: count ? square / count : 0,
    maxAbs,
    relative: energy > 0 ? Math.sqrt(square) / Math.sqrt(energy) : 0,
  };
}

export function splitChunks(text, size = 16000) {
  const chunks = [];
  const source = String(text);
  const step = Math.max(1, size);
  for (let index = 0; index < source.length; index += step) chunks.push(source.slice(index, index + step));
  if (!chunks.length) chunks.push('');
  return { total: chunks.length, chunks };
}

export function joinChunks(task) {
  if (!task || !Array.isArray(task.chunks)) return null;
  if (task.chunks.filter((chunk) => chunk != null).length < task.total) return null;
  return task.chunks.join('');
}
