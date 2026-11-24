/* SPDX-License-Identifier: GPL-3.0-or-later
 * Dense matvec. WebGPU when the browser has it, else WebGL2 for short rows, else the CPU.
 */

export function chooseBackend(flags = {}) {
  if (flags.webgpu) return 'webgpu';
  if (flags.webgl) return 'webgl';
  return 'cpu';
}

export function gemmCpu(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, weight, index) => sum + weight * (vector[index] || 0), 0));
}

export function detectBackend() {
  const webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  let webgl = false;
  if (typeof document !== 'undefined') {
    try { webgl = !!document.createElement('canvas').getContext('webgl2'); } catch { webgl = false; }
  }
  return chooseBackend({ webgpu, webgl });
}

export function gemmWebgl(gl, matrix, vector) {
  if (!gl || matrix.length > 32 || vector.length > 32 || !gl.getExtension('EXT_color_buffer_float')) return null;
  const rows = matrix.length;
  const cols = vector.length;
  const vs = `attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
  const fs = `precision highp float; uniform float uW[${rows * cols}]; uniform float uX[${cols}];
    void main(){
      int row = int(gl_FragCoord.x);
      float sum = 0.0;
      for (int c = 0; c < ${cols}; c++) sum += uW[row * ${cols} + c] * uX[c];
      gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
    }`;
  const program = compile(gl, vs, fs);
  if (!program) return null;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, rows, 1, 0, gl.RED, gl.FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
  gl.useProgram(program);
  gl.viewport(0, 0, rows, 1);
  const flat = new Float32Array(rows * cols);
  matrix.forEach((row, r) => row.forEach((value, c) => { flat[r * cols + c] = value; }));
  gl.uniform1fv(gl.getUniformLocation(program, 'uW'), flat);
  gl.uniform1fv(gl.getUniformLocation(program, 'uX'), new Float32Array(vector));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const pixels = new Float32Array(rows);
  gl.readPixels(0, 0, rows, 1, gl.RED, gl.FLOAT, pixels);
  return Array.from(pixels);
}

function compile(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

async function gemmWebgpu(matrix, vector) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const rows = matrix.length;
  const cols = vector.length;
  const shader = `
    @group(0) @binding(0) var<storage, read> input: array<f32>;
    @group(0) @binding(1) var<storage, read> weights: array<f32>;
    @group(0) @binding(2) var<storage, read_write> output: array<f32>;
    @compute @workgroup_size(1)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      let row = id.x;
      let n = arrayLength(&input);
      var sum = 0.0;
      for (var c: u32 = 0u; c < n; c++) { sum += weights[row * n + c] * input[c]; }
      output[row] = sum;
    }`;
  const module = device.createShaderModule({ code: shader });
  const flat = new Float32Array(rows * cols);
  matrix.forEach((row, r) => row.forEach((value, c) => { flat[r * cols + c] = value; }));
  const inBuf = buffer(device, new Float32Array(vector), GPUBufferUsage.STORAGE);
  const wBuf = buffer(device, flat, GPUBufferUsage.STORAGE);
  const outBuf = buffer(device, new Float32Array(rows), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  const readBuf = device.createBuffer({ size: rows * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const bind = device.createBindGroupLayout({
    entries: [0, 1, 2].map((binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 2 ? 'storage' : 'read-only-storage' } })),
  });
  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bind] }),
    compute: { module, entryPoint: 'main' },
  });
  const group = device.createBindGroup({ layout: bind, entries: [
    { binding: 0, resource: { buffer: inBuf } },
    { binding: 1, resource: { buffer: wBuf } },
    { binding: 2, resource: { buffer: outBuf } },
  ] });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(rows);
  pass.end();
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, rows * 4);
  device.queue.submit([encoder.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  const out = Array.from(new Float32Array(readBuf.getMappedRange()));
  readBuf.unmap();
  return out;
}

function buffer(device, data, usage) {
  const buf = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

export async function gemm(matrix, vector) {
  const backend = detectBackend();
  if (backend === 'webgpu') {
    try {
      const out = await gemmWebgpu(matrix, vector);
      if (out) return out;
    } catch { /* CPU */ }
  }
  if (backend === 'webgl' && typeof document !== 'undefined') {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const out = gemmWebgl(gl, matrix, vector);
      if (out) return out;
    } catch { /* CPU */ }
  }
  return gemmCpu(matrix, vector);
}

export function iceServers(settings = {}) {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (settings.turnUrl) {
    const turn = { urls: settings.turnUrl };
    if (settings.turnUser) turn.username = settings.turnUser;
    if (settings.turnCred) turn.credential = settings.turnCred;
    servers.push(turn);
  }
  return servers;
}
