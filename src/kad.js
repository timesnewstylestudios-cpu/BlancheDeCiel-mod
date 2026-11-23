/* SPDX-License-Identifier: GPL-3.0-or-later */

export function randomId() {
  const bytes = new Uint8Array(20);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function xorCompare(target, left, right) {
  const size = Math.min(target.length, left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const leftDistance = parseInt(target[index], 16) ^ parseInt(left[index], 16);
    const rightDistance = parseInt(target[index], 16) ^ parseInt(right[index], 16);
    if (leftDistance !== rightDistance) return leftDistance < rightDistance ? -1 : 1;
  }
  return 0;
}

export function bucketIndex(selfId, otherId) {
  if (!selfId || selfId === otherId) return -1;
  const size = Math.min(selfId.length, otherId.length);
  for (let index = 0; index < size; index += 1) {
    const mixed = parseInt(selfId[index], 16) ^ parseInt(otherId[index], 16);
    if (mixed) return index * 4 + (Math.clz32(mixed) - 28);
  }
  return -1;
}

/** Map an arbitrary table key into the 160-bit id space used by the buckets. */
export function keyId(key) {
  let hex = '';
  let hash = 2166136261;
  const text = String(key);
  for (let round = 0; round < 5; round += 1) {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index) + round * 17;
      hash = Math.imul(hash, 16777619);
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return hex.slice(0, 40);
}

export class KBuckets {
  constructor(selfId, k = 8) {
    this.selfId = selfId;
    this.k = k;
    this.buckets = Array.from({ length: 160 }, () => []);
  }

  seen(id) {
    if (!id || id === this.selfId) return;
    const index = bucketIndex(this.selfId, id);
    if (index < 0 || index >= this.buckets.length) return;
    const bucket = this.buckets[index];
    const at = bucket.indexOf(id);
    if (at >= 0) bucket.splice(at, 1);
    bucket.push(id);
    if (bucket.length > this.k) bucket.shift();
  }

  closest(target, count) {
    const all = this.buckets.flat();
    all.sort((left, right) => xorCompare(target, left, right));
    return all.slice(0, count);
  }
}
