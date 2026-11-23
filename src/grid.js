/* SPDX-License-Identifier: GPL-3.0-or-later */

import { KBuckets, keyId } from './kad.js';

export function createGridNode(transport) {
  const buckets = new KBuckets(transport.id);
  const store = new Map();
  const peers = new Set();
  const pending = new Map();
  let jobHandler = () => {};

  function remember(from) {
    if (!from || from === transport.id) return;
    peers.add(from);
    buckets.seen(from);
  }

  function send(to, message) {
    if (!to || to === transport.id) return;
    transport.send(to, { ...message, from: transport.id });
  }

  function handle(message) {
    if (!message || message.from === transport.id) return;
    remember(message.from);
    if (message.t === 'ping') {
      send(message.from, { t: 'pong' });
      return;
    }
    if (message.t === 'pong') return;
    if (message.t === 'store') {
      store.set(message.key, message.value);
      const visited = new Set(message.visited || []);
      if (visited.has(transport.id)) return;
      visited.add(transport.id);
      const ttl = (message.ttl ?? 3) - 1;
      if (ttl < 0) return;
      const next = buckets.closest(keyId(message.key), 3)
        .filter((peer) => peer !== message.from && !visited.has(peer));
      for (const peer of next) {
        send(peer, { t: 'store', key: message.key, value: message.value, ttl, visited: [...visited] });
      }
      return;
    }
    if (message.t === 'find') {
      const back = message.back || [];
      if (store.has(message.key)) {
        replyFound(back, message.key, store.get(message.key));
        return;
      }
      const seen = new Set([...(message.visited || []), transport.id, ...back]);
      if ((message.ttl ?? 4) <= 0) return;
      const next = buckets.closest(keyId(message.key), 4).find((peer) => !seen.has(peer));
      if (!next) return;
      send(next, {
        t: 'find',
        key: message.key,
        ttl: (message.ttl ?? 4) - 1,
        back: [...back, transport.id],
        visited: [...seen],
      });
      return;
    }
    if (message.t === 'found') {
      const back = message.back || [];
      if (!back.length) {
        store.set(message.key, message.value);
        const waiter = pending.get(message.key);
        if (waiter) {
          pending.delete(message.key);
          waiter(message.value);
        }
        return;
      }
      send(back[back.length - 1], {
        t: 'found',
        key: message.key,
        value: message.value,
        back: back.slice(0, -1),
      });
      return;
    }
    if (message.t === 'job') jobHandler(message.info || {}, message.from);
  }

  function replyFound(back, key, value) {
    if (!back.length) return;
    send(back[back.length - 1], { t: 'found', key, value, back: back.slice(0, -1) });
  }

  transport.on(handle);

  return {
    id: transport.id,
    peers() { return [...peers]; },
    local(key) { return store.has(key) ? store.get(key) : undefined; },
    putLocal(key, value) { store.set(key, value); },
    share(name, rows) {
      const key = `table:${name}`;
      store.set(key, rows);
      for (const peer of peers) send(peer, { t: 'store', key, value: rows, ttl: 4, visited: [transport.id] });
    },
    fetch(name) {
      const key = `table:${name}`;
      if (store.has(key)) return Promise.resolve(store.get(key));
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(key);
          resolve(store.has(key) ? store.get(key) : null);
        }, 800);
        pending.set(key, (value) => {
          clearTimeout(timer);
          resolve(value);
        });
        const target = buckets.closest(keyId(key), 3)[0];
        if (!target) {
          clearTimeout(timer);
          pending.delete(key);
          resolve(null);
          return;
        }
        send(target, { t: 'find', key, ttl: 6, back: [transport.id], visited: [transport.id] });
      });
    },
    publishJob(info) {
      for (const peer of peers) send(peer, { t: 'job', info });
    },
    onJob(fn) { jobHandler = fn || (() => {}); },
    peerCount() { return peers.size; },
    receive(message) { handle(message); },
  };
}

export function createLinkedTransports(ids) {
  const transports = {};
  for (const id of ids) {
    transports[id] = {
      id,
      neighbors: new Set(),
      handler: null,
      send(to, message) {
        if (this.neighbors.has(to) && transports[to].handler) transports[to].handler(message);
      },
      on(fn) { this.handler = fn; },
    };
  }
  return {
    transports,
    connect(left, right) {
      transports[left].neighbors.add(right);
      transports[right].neighbors.add(left);
    },
  };
}
