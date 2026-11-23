/* SPDX-License-Identifier: GPL-3.0-or-later */

import { createGridNode } from './grid.js';
import { connectTracker } from './signal.js';
import { createLink, webrtcAvailable } from './webrtc.js';

export function startBrowserGrid(nodeId) {
  const channels = new Set();
  let bc = null;
  const transport = {
    id: nodeId,
    handler: null,
    send(to, message) {
      const packet = { ...message, to };
      if (bc) {
        try { bc.postMessage(packet); } catch { /* detached */ }
      }
      const raw = JSON.stringify(packet);
      for (const channel of channels) {
        if (channel.readyState === 'open') {
          try { channel.send(raw); } catch { channels.delete(channel); }
        }
      }
    },
    on(fn) { this.handler = fn; },
  };

  const accept = (msg) => {
    if (!msg || msg.from === nodeId) return;
    if (msg.to && msg.to !== nodeId && msg.to !== '*') return;
    transport.handler?.(msg);
  };

  try {
    bc = new BroadcastChannel('blanche-de-ciel');
    bc.onmessage = (event) => accept(event.data);
  } catch {
    bc = null;
  }

  const node = createGridNode(transport);
  const ping = () => {
    if (bc) {
      try { bc.postMessage({ t: 'ping', from: nodeId, to: '*' }); } catch { /* ignore */ }
    }
  };
  ping();
  const timer = setInterval(ping, 2500);
  const links = [];

  function watch(channel) {
    channels.add(channel);
    channel.onmessage = (event) => {
      let msg = event.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { return; }
      }
      accept(msg);
    };
    channel.onclose = () => channels.delete(channel);
    if (channel.readyState === 'open') channel.send(JSON.stringify({ t: 'ping', from: nodeId, to: '*' }));
    else channel.onopen = () => channel.send(JSON.stringify({ t: 'ping', from: nodeId, to: '*' }));
  }

  return {
    node,
    tabLink: !!bc,
    webrtc: webrtcAvailable(),
    stop() {
      clearInterval(timer);
      bc?.close();
    },
    async makeOffer() {
      const link = createLink(watch);
      links.push(link);
      return link.offer();
    },
    async acceptOffer(sdp) {
      const link = createLink(watch);
      links.push(link);
      return link.answer(sdp);
    },
    async acceptAnswer(sdp) {
      const link = links[links.length - 1];
      if (!link) throw new Error('no-offer');
      await link.accept(sdp);
    },
    joinRoom(url, room, onStatus) {
      this.roomLink?.close();
      this.roomLink = connectTracker({
        url,
        room,
        peerId: nodeId,
        onSignal: (event) => onStatus?.(event),
        createOffer: () => this.makeOffer(),
        acceptOffer: (sdp) => this.acceptOffer(sdp),
        acceptAnswer: (sdp) => this.acceptAnswer(sdp),
      });
    },
    leaveRoom() {
      this.roomLink?.close();
      this.roomLink = null;
    },
  };
}
