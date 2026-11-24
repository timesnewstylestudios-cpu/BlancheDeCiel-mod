/* SPDX-License-Identifier: GPL-3.0-or-later */

import { createGridNode } from './grid.js';
import { connectTracker } from './signal.js';
import { createLink, webrtcAvailable } from './webrtc.js';

export function startBrowserGrid(nodeId, iceServers = () => undefined) {
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

  function openLink() {
    return createLink(watch, iceServers() || [{ urls: 'stun:stun.l.google.com:19302' }]);
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
      const link = openLink();
      links.push(link);
      return link.offer();
    },
    async acceptOffer(sdp) {
      const link = openLink();
      links.push(link);
      return link.answer(sdp);
    },
    async acceptAnswer(sdp) {
      const link = links[links.length - 1];
      if (!link) throw new Error('no-offer');
      await link.accept(sdp);
    },
    joinMeet(url, room) {
      if (!webrtcAvailable()) throw new Error('webrtc-missing');
      const wsUrl = `${String(url).replace(/^http/, 'ws').replace(/\/$/, '')}/meet?room=${encodeURIComponent(room || 'himmel')}`;
      let ws;
      try { ws = new WebSocket(wsUrl); } catch { return this.pollMeet(url, room); }
      const link = openLink();
      links.push(link);
      let opened = false;
      const giveUp = setTimeout(() => {
        if (!opened) {
          try { ws.close(); } catch { /* already closed */ }
          this.pollMeet(url, room);
        }
      }, 1500);
      ws.onopen = () => { opened = true; clearTimeout(giveUp); };
      ws.onmessage = async (event) => {
        let msg = {};
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.t === 'start') {
          const sdp = await link.offer();
          ws.send(JSON.stringify({ t: 'signal', kind: 'offer', sdp }));
        } else if (msg.t === 'signal' && msg.kind === 'offer') {
          const sdp = await link.answer(msg.sdp);
          ws.send(JSON.stringify({ t: 'signal', kind: 'answer', sdp }));
          ws.close();
        } else if (msg.t === 'signal' && msg.kind === 'answer') {
          await link.accept(msg.sdp);
          ws.close();
        }
      };
      return ws;
    },
    pollMeet(url, room) {
      const link = openLink();
      links.push(link);
      const root = String(url).replace(/\/$/, '');
      const roomName = room || 'himmel';
      let after = 0;
      let offered = false;
      const send = (msg) => fetch(`${root}/poll?room=${encodeURIComponent(roomName)}&id=${encodeURIComponent(nodeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...msg, id: nodeId }),
      }).catch(() => {});
      const timer = setInterval(async () => {
        try {
          const response = await fetch(`${root}/poll?room=${encodeURIComponent(roomName)}&id=${encodeURIComponent(nodeId)}&after=${after}`);
          const body = await response.json();
          for (const msg of body.msgs || []) {
            after = Math.max(after, msg.at || 0);
            if (msg.t === 'hello' && !offered) {
              offered = true;
              const sdp = await link.offer();
              send({ t: 'signal', kind: 'offer', sdp });
            } else if (msg.t === 'signal' && msg.kind === 'offer') {
              const sdp = await link.answer(msg.sdp);
              send({ t: 'signal', kind: 'answer', sdp });
            } else if (msg.t === 'signal' && msg.kind === 'answer') {
              await link.accept(msg.sdp);
              clearInterval(timer);
            }
          }
        } catch { /* the meeting point can be down */ }
      }, 1000);
      send({ t: 'hello' });
      return { close() { clearInterval(timer); } };
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
