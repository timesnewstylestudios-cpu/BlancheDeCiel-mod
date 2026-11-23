/* SPDX-License-Identifier: GPL-3.0-or-later
 * Optional WebRTC signaling through a WebTorrent-style tracker.
 * The editor stays serverless until a tracker URL is saved in settings.
 */

function binaryHash(text) {
  let hex = '';
  let hash = 2166136261;
  const source = `bdc:${text}`;
  for (let round = 0; round < 5; round += 1) {
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i) + round * 13;
      hash = Math.imul(hash, 16777619);
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0');
  }
  let out = '';
  for (let i = 0; i < 40; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

export function trackerPayload(room, peerId, extra) {
  return {
    action: 'announce',
    info_hash: binaryHash(room),
    peer_id: binaryHash(peerId).slice(0, 20),
    numwant: 1,
    uploaded: 0,
    downloaded: 0,
    left: 1,
    ...extra,
  };
}

export function connectTracker({ url, room, peerId, onSignal, createOffer, acceptOffer, acceptAnswer }) {
  const socket = new WebSocket(url);
  const offers = new Map();
  let closed = false;
  const send = (extra) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(trackerPayload(room, peerId, extra)));
  };
  const announce = async () => {
    const offerId = Math.random().toString(36).slice(2, 10);
    const sdp = await createOffer();
    offers.set(offerId, sdp);
    send({ offers: [{ offer_id: offerId, offer: { type: 'offer', sdp } }] });
  };
  socket.addEventListener('open', () => { announce().catch((error) => onSignal({ type: 'error', error })); });
  socket.addEventListener('message', async (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.offer?.sdp && message.offer_id && message.peer_id !== trackerPayload(room, peerId).peer_id) {
      const answer = await acceptOffer(message.offer.sdp);
      send({
        to_peer_id: message.peer_id,
        offer_id: message.offer_id,
        answer: { type: 'answer', sdp: answer },
      });
      onSignal({ type: 'answer-sent' });
    } else if (message.answer?.sdp && message.offer_id && offers.has(message.offer_id)) {
      await acceptAnswer(message.answer.sdp);
      offers.delete(message.offer_id);
      onSignal({ type: 'connected' });
    }
  });
  socket.addEventListener('error', () => onSignal({ type: 'error', error: new Error('tracker') }));
  const timer = setInterval(() => { if (!closed) announce().catch(() => {}); }, 20000);
  return {
    close() {
      closed = true;
      clearInterval(timer);
      socket.close();
    },
  };
}
