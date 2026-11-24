/* SPDX-License-Identifier: GPL-3.0-or-later
 * Networks on the CPU. Dense layers train by backprop.
 * LSTM runs a real multi-step cell. Attention is one head over a short sequence.
 * Vectors stay at or below 128. Accelerated matmul lives in accel.js.
 */

import { decodeMatrix, encodeMatrix } from './weights.js';

const MAX = 128;

function clampCount(value) {
  const number = Math.max(1, Math.floor(Number(value) || 1));
  return Math.min(MAX, number);
}

function zeros(n) {
  return Array.from({ length: n }, () => 0);
}

function rand(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    return ((state >>> 8) / 16777216) * 0.2 - 0.1;
  };
}

export function createNet(name = 'netz') {
  return { name, layers: [], loss: 'mse', optimizer: 'sgd', lr: 0.05, step: 0 };
}

export function addLayer(net, spec) {
  const type = spec.type || 'dense';
  const units = clampCount(spec.units || spec.out || 1);
  const activation = spec.activation || (type === 'dense' ? 'relu' : 'linear');
  const previous = net.layers[net.layers.length - 1];
  const input = clampCount(spec.input || previous?.units || units);
  const next = rand((net.layers.length + 1) * 997 + units * 13);
  const layer = { type, units, input, activation, kernel: clampCount(spec.kernel || 2) };
  if (type === 'dense') {
    layer.w = Array.from({ length: units }, () => Array.from({ length: input }, () => next()));
    layer.b = zeros(units);
  } else if (type === 'conv1d' || type === 'conv2d') {
    const k = layer.kernel * (type === 'conv2d' ? layer.kernel : 1);
    layer.w = [Array.from({ length: k }, () => next())];
    layer.b = [0];
    layer.units = 1;
  } else if (type === 'attention') {
    layer.units = input;
    layer.dim = clampCount(spec.dim || 1);
    layer.w = [zeros(1)];
    layer.b = [0];
  } else if (type === 'lstm') {
    layer.h = zeros(units);
    layer.c = zeros(units);
    layer.gates = {};
    for (const name of ['i', 'f', 'o', 'g']) {
      layer.gates[name] = {
        w: Array.from({ length: units }, () => Array.from({ length: input }, () => next() * 0.1)),
        u: Array.from({ length: units }, () => Array.from({ length: units }, () => next() * 0.1)),
        b: zeros(units),
      };
    }
    layer.w = [zeros(1)];
    layer.b = [0];
  } else {
    layer.w = Array.from({ length: units }, () => Array.from({ length: input + units }, () => next()));
    layer.b = zeros(units);
    layer.h = zeros(units);
    layer.c = zeros(units);
  }
  layer.adam = { t: 0 };
  net.layers.push(layer);
  return layer;
}

function activate(name, value) {
  if (name === 'relu') return value > 0 ? value : 0;
  if (name === 'sigmoid') return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, value))));
  if (name === 'tanh') return Math.tanh(value);
  return value;
}

function activateGrad(name, value, out) {
  if (name === 'relu') return value > 0 ? 1 : 0;
  if (name === 'sigmoid') return out * (1 - out);
  if (name === 'tanh') return 1 - out * out;
  return 1;
}

function denseForward(layer, input) {
  const z = layer.b.map((bias, row) => bias + layer.w[row].reduce((sum, weight, col) => sum + weight * (input[col] || 0), 0));
  return { z, out: z.map((value) => activate(layer.activation, value)), input: input.slice() };
}

function conv1dForward(layer, input) {
  const kernel = layer.w[0];
  const out = [];
  const width = Math.max(0, input.length - kernel.length + 1);
  for (let index = 0; index < width; index += 1) {
    let sum = layer.b[0] || 0;
    for (let k = 0; k < kernel.length; k += 1) sum += kernel[k] * input[index + k];
    out.push(activate(layer.activation, sum));
  }
  return { out, input: input.slice() };
}

function conv2dForward(layer, input) {
  const side = Math.max(1, Math.round(Math.sqrt(input.length)));
  const k = layer.kernel;
  const kernel = layer.w[0];
  const out = [];
  for (let y = 0; y <= side - k; y += 1) {
    for (let x = 0; x <= side - k; x += 1) {
      let sum = layer.b[0] || 0;
      let cursor = 0;
      for (let ky = 0; ky < k; ky += 1) {
        for (let kx = 0; kx < k; kx += 1) {
          sum += kernel[cursor] * (input[(y + ky) * side + (x + kx)] || 0);
          cursor += 1;
        }
      }
      out.push(activate(layer.activation, sum));
    }
  }
  return { out, input: input.slice() };
}

function rnnForward(layer, input) {
  const z = layer.w.map((row, index) => {
    let sum = layer.b[index] || 0;
    for (let col = 0; col < layer.input; col += 1) sum += row[col] * (input[col] || 0);
    for (let col = 0; col < layer.units; col += 1) sum += row[layer.input + col] * (layer.h[col] || 0);
    return sum;
  });
  const out = z.map((value) => Math.tanh(value));
  layer.h = out.slice();
  return { out, input: input.slice() };
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, value))));
}

function mixGate(gate, input, hidden) {
  return gate.b.map((bias, unit) => {
    let sum = bias;
    for (let col = 0; col < input.length; col += 1) sum += (gate.w[unit][col] || 0) * (input[col] || 0);
    for (let col = 0; col < hidden.length; col += 1) sum += (gate.u[unit][col] || 0) * (hidden[col] || 0);
    return sum;
  });
}

function lstmStep(layer, input) {
  const i = mixGate(layer.gates.i, input, layer.h).map(sigmoid);
  const f = mixGate(layer.gates.f, input, layer.h).map(sigmoid);
  const o = mixGate(layer.gates.o, input, layer.h).map(sigmoid);
  const g = mixGate(layer.gates.g, input, layer.h).map((value) => Math.tanh(value));
  const next = [];
  for (let unit = 0; unit < layer.units; unit += 1) {
    layer.c[unit] = f[unit] * (layer.c[unit] || 0) + i[unit] * g[unit];
    next.push(o[unit] * Math.tanh(layer.c[unit]));
  }
  layer.h = next;
  return next.slice();
}

function lstmForward(layer, input) {
  const width = Math.max(1, layer.input || 1);
  const steps = Math.max(1, Math.floor(input.length / width));
  let last = layer.h.slice();
  for (let step = 0; step < steps; step += 1) last = lstmStep(layer, input.slice(step * width, (step + 1) * width));
  return { out: last, input: input.slice() };
}

function softmax(scores) {
  const peak = Math.max(...scores, 0);
  const exps = scores.map((value) => Math.exp(value - peak));
  const sum = exps.reduce((total, value) => total + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function attentionForward(layer, input) {
  const dim = Math.max(1, layer.dim || 1);
  const seq = Math.max(1, Math.floor(input.length / dim));
  const tokens = [];
  for (let index = 0; index < seq; index += 1) tokens.push(input.slice(index * dim, (index + 1) * dim));
  const query = tokens[tokens.length - 1];
  const scores = tokens.map((token) => token.reduce((sum, value, index) => sum + value * (query[index] || 0), 0) / Math.sqrt(dim));
  const weights = softmax(scores);
  layer.weights = weights;
  const out = Array.from({ length: dim }, (_, col) => weights.reduce((sum, weight, index) => sum + weight * (tokens[index][col] || 0), 0));
  return { out, weights, input: input.slice() };
}

function forwardLayer(layer, input) {
  if (layer.type === 'dense') return denseForward(layer, input);
  if (layer.type === 'conv1d') return conv1dForward(layer, input);
  if (layer.type === 'conv2d') return conv2dForward(layer, input);
  if (layer.type === 'lstm') return lstmForward(layer, input);
  if (layer.type === 'attention') return attentionForward(layer, input);
  return rnnForward(layer, input);
}

export function predict(net, input) {
  let current = input.map(Number);
  for (const layer of net.layers) current = forwardLayer(layer, current).out;
  return current;
}

function lossOf(out, target) {
  const n = Math.max(out.length, target.length, 1);
  let square = 0;
  for (let index = 0; index < n; index += 1) {
    const diff = (out[index] || 0) - (target[index] || 0);
    square += diff * diff;
  }
  return square / n;
}

function flatten(layer) {
  const values = [];
  const write = [];
  if (layer.w) {
    layer.w.forEach((row, r) => row.forEach((value, c) => {
      values.push(value);
      write.push((next) => { layer.w[r][c] = next; });
    }));
  }
  (layer.b || []).forEach((value, index) => {
    values.push(value);
    write.push((next) => { layer.b[index] = next; });
  });
  return { values, write };
}

function applyOptimizer(layer, grads, lr, optimizer) {
  if (!layer.adam?.m) layer.adam = { t: layer.adam?.t || 0, m: [], v: [] };
  layer.adam.t += 1;
  grads.forEach((grad, index) => {
    if (optimizer === 'adam') {
      const b1 = 0.9;
      const b2 = 0.999;
      layer.adam.m[index] = b1 * (layer.adam.m[index] || 0) + (1 - b1) * grad;
      layer.adam.v[index] = b2 * (layer.adam.v[index] || 0) + (1 - b2) * grad * grad;
      const m = layer.adam.m[index] / (1 - b1 ** layer.adam.t);
      const v = layer.adam.v[index] / (1 - b2 ** layer.adam.t);
      grads[index] = m / (Math.sqrt(v) + 1e-8);
    }
  });
  return grads.map((grad) => lr * grad);
}

function trainDense(layer, cache, gradOut, net) {
  const local = cache.z.map((value, index) => gradOut[index] * activateGrad(layer.activation, value, cache.out[index]));
  const inputGrad = zeros(cache.input.length);
  const flatGrad = [];
  layer.w.forEach((row, r) => {
    row.forEach((weight, c) => {
      flatGrad.push(local[r] * (cache.input[c] || 0));
      inputGrad[c] += local[r] * weight;
    });
  });
  local.forEach((value) => flatGrad.push(value));
  const steps = applyOptimizer(layer, flatGrad, net.lr, net.optimizer);
  const { write } = flatten(layer);
  write.forEach((set, index) => {
    const current = index < layer.w.length * layer.w[0].length
      ? layer.w[Math.floor(index / layer.w[0].length)][index % layer.w[0].length]
      : layer.b[index - layer.w.length * layer.w[0].length];
    set(current - (steps[index] || 0));
  });
  return inputGrad;
}

function trainNumeric(net, layer, input, target) {
  const { values, write } = flatten(layer);
  const eps = 1e-3;
  const grads = values.map((value, index) => {
    write[index](value + eps);
    const up = lossOf(predict(net, input), target);
    write[index](value - eps);
    const down = lossOf(predict(net, input), target);
    write[index](value);
    return (up - down) / (2 * eps);
  });
  const steps = applyOptimizer(layer, grads, net.lr, net.optimizer);
  values.forEach((value, index) => write[index](value - steps[index]));
}

export function trainStep(net, input, target) {
  const caches = [];
  let current = input.map(Number);
  for (const layer of net.layers) {
    const cache = forwardLayer(layer, current);
    caches.push(cache);
    current = cache.out;
  }
  const before = lossOf(current, target);
  const denseOnly = net.layers.every((layer) => layer.type === 'dense');
  if (denseOnly) {
    let grad = current.map((value, index) => value - (target[index] || 0));
    for (let index = net.layers.length - 1; index >= 0; index -= 1) {
      grad = trainDense(net.layers[index], caches[index], grad, net);
    }
  } else {
    for (const layer of net.layers) trainNumeric(net, layer, input, target);
  }
  net.step += 1;
  return { before, after: lossOf(predict(net, input), target) };
}

export function exportNet(net) {
  return {
    kind: 'bdc-net-1',
    name: net.name,
    loss: net.loss,
    optimizer: net.optimizer,
    lr: net.lr,
    layers: net.layers.map((layer) => ({
      type: layer.type,
      units: layer.units,
      input: layer.input,
      activation: layer.activation,
      kernel: layer.kernel,
      dim: layer.dim,
      gates: layer.gates || null,
      b: layer.b || [],
      w: (layer.w || []).map((row) => encodeMatrix([row], { rank: 1, residualCount: row.length })),
    })),
  };
}

export function importNet(pack) {
  const net = createNet(pack.name || 'netz');
  net.loss = pack.loss || 'mse';
  net.optimizer = pack.optimizer || 'sgd';
  net.lr = pack.lr ?? 0.05;
  for (const layer of pack.layers || []) {
    addLayer(net, layer);
    const made = net.layers[net.layers.length - 1];
    made.b = (layer.b || []).slice();
    made.w = (layer.w || []).map((row) => decodeMatrix(row)[0]);
    if (layer.gates) made.gates = layer.gates;
    if (layer.dim) made.dim = layer.dim;
  }
  return net;
}

export function parseNumbers(text) {
  return String(text ?? '').split(/[^0-9.eE+-]+/).filter(Boolean).map(Number).filter((value) => Number.isFinite(value));
}
