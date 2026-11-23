/* SPDX-License-Identifier: GPL-3.0-or-later */

export function jobKey(op, table, column) {
  return `${op}:${table}:${column}`;
}

export function evaluateJob(rows, op, column) {
  const index = Math.max(0, Math.floor(Number(column)) - 1);
  const values = (rows || []).map((row) => {
    const cell = Array.isArray(row) ? row[index] : row;
    const number = Number(cell);
    return Number.isFinite(number) ? number : 0;
  });
  if (op === 'count') return values.length;
  if (!values.length) return 0;
  if (op === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  return 0;
}

export function splitRows(rows, chunks) {
  const list = rows || [];
  const parts = Math.max(1, chunks | 0);
  if (!list.length) return [[]];
  const size = Math.ceil(list.length / parts);
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

export function reduceParts(op, parts) {
  const nums = (parts || []).map(Number).filter((value) => Number.isFinite(value));
  if (!nums.length) return 0;
  if (op === 'min') return Math.min(...nums);
  if (op === 'max') return Math.max(...nums);
  return nums.reduce((sum, value) => sum + value, 0);
}
