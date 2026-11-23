/* SPDX-License-Identifier: GPL-3.0-or-later */

export function createAudio() {
  let ctx = null;
  let master = null;
  let filter = null;
  let analyser = null;
  let media = null;
  let recorder = null;
  let chunks = [];
  let recording = null;
  const active = new Set();

  function context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio fehlt');
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18000;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(filter);
      filter.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(type, frequency, seconds, adsr = {}, filterSpec = {}) {
    const audio = context();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(type) ? type : 'sine';
    osc.frequency.value = Math.max(1, Number(frequency) || 440);
    filter.type = filterSpec.type || 'lowpass';
    filter.frequency.value = Math.max(20, Number(filterSpec.freq) || 18000);
    const t = audio.currentTime;
    const dur = Math.max(0.01, Number(seconds) || 0.2);
    const a = Math.max(0, adsr.a ?? 0.02);
    const d = Math.max(0, adsr.d ?? 0.08);
    const s = Math.max(0, Math.min(1, adsr.s ?? 0.7));
    const r = Math.max(0.01, adsr.r ?? 0.12);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.8, t + Math.max(0.01, a));
    gain.gain.linearRampToValueAtTime(0.8 * s, t + Math.max(0.02, a + d));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + r + 0.02);
    active.add(osc);
    osc.onended = () => active.delete(osc);
  }

  async function beginRecord() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofon nicht verfügbar');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    media = stream;
    chunks = [];
    const Recorder = globalThis.MediaRecorder;
    if (!Recorder) throw new Error('MediaRecorder fehlt');
    recorder = new Recorder(stream);
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.start();
  }

  function endRecord() {
    return new Promise((resolve, reject) => {
      if (!recorder) {
        resolve();
        return;
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          recording = blob;
          media?.getTracks().forEach((track) => track.stop());
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      recorder.stop();
    });
  }

  async function playRecording() {
    if (!recording) return;
    const url = URL.createObjectURL(recording);
    try {
      await playUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function playUrl(url) {
    const audio = context();
    return fetch(url).then((response) => response.arrayBuffer()).then((buffer) => new Promise((resolve, reject) => {
      audio.decodeAudioData(buffer.slice(0), (decoded) => {
        const source = audio.createBufferSource();
        source.buffer = decoded;
        source.connect(master);
        source.onended = () => resolve();
        source.start();
        active.add(source);
      }, reject);
    }));
  }

  function spectrum() {
    if (!analyser) return new Uint8Array(128);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  return {
    context,
    tone,
    beginRecord,
    endRecord,
    playRecording,
    playUrl,
    fft(band) {
      const data = spectrum();
      const index = Math.max(0, (Number(band) || 1) - 1);
      return data[index] || 0;
    },
    volume() {
      const data = spectrum();
      if (!data.length) return 0;
      let sum = 0;
      for (const value of data) sum += value;
      return Math.round(sum / data.length);
    },
    stopAll() {
      for (const node of active) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      active.clear();
    },
  };
}
