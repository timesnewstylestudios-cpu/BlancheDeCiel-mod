/* SPDX-License-Identifier: GPL-3.0-or-later */

function iceReady(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 4000);
  });
}

export function webrtcAvailable() {
  return typeof RTCPeerConnection === 'function';
}

export function createLink(onChannel) {
  if (!webrtcAvailable()) throw new Error('webrtc-missing');
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  let channel = null;
  const attach = (next) => {
    channel = next;
    channel.onopen = () => onChannel(channel);
  };
  pc.ondatachannel = (event) => attach(event.channel);
  return {
    pc,
    async offer() {
      attach(pc.createDataChannel('bdc'));
      const description = await pc.createOffer();
      await pc.setLocalDescription(description);
      await iceReady(pc);
      return pc.localDescription.sdp;
    },
    async answer(sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const description = await pc.createAnswer();
      await pc.setLocalDescription(description);
      await iceReady(pc);
      return pc.localDescription.sdp;
    },
    async accept(sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp });
    },
  };
}
