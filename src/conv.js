/* SPDX-License-Identifier: GPL-3.0-or-later
 * Valid convolution. The CPU result is the reference. WebGPU is used when the page has it.
 */

export function conv1d(input, kernel) {
  const out = [];
  const width = input.length - kernel.length + 1;
  for (let index = 0; index < width; index += 1) {
    let sum = 0;
    for (let k = 0; k < kernel.length; k += 1) sum += input[index + k] * kernel[k];
    out.push(sum);
  }
  return out;
}

export function conv2d(input, side, kernel, k) {
  const outSide = side - k + 1;
  const out = [];
  for (let y = 0; y < outSide; y += 1) {
    for (let x = 0; x < outSide; x += 1) {
      let sum = 0;
      let cursor = 0;
      for (let ky = 0; ky < k; ky += 1) {
        for (let kx = 0; kx < k; kx += 1) {
          sum += input[(y + ky) * side + (x + kx)] * kernel[cursor];
          cursor += 1;
        }
      }
      out.push(sum);
    }
  }
  return out;
}

export function conv3d(input, side, kernel, k) {
  const outSide = side - k + 1;
  const plane = side * side;
  const out = [];
  for (let z = 0; z < outSide; z += 1) {
    for (let y = 0; y < outSide; y += 1) {
      for (let x = 0; x < outSide; x += 1) {
        let sum = 0;
        let cursor = 0;
        for (let kz = 0; kz < k; kz += 1) {
          for (let ky = 0; ky < k; ky += 1) {
            for (let kx = 0; kx < k; kx += 1) {
              const at = (z + kz) * plane + (y + ky) * side + (x + kx);
              sum += input[at] * kernel[cursor];
              cursor += 1;
            }
          }
        }
        out.push(sum);
      }
    }
  }
  return out;
}

async function convWebgpu(rank, input, side, kernel, k) {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const outSide = side - k + 1;
  const count = outSide ** rank;
  const shader = `
    @group(0) @binding(0) var<storage, read> input: array<f32>;
    @group(0) @binding(1) var<storage, read> kernel: array<f32>;
    @group(0) @binding(2) var<storage, read_write> output: array<f32>;
    struct P { side: u32, k: u32, outSide: u32, rank: u32 }
    @group(0) @binding(3) var<uniform> p: P;
    @compute @workgroup_size(1)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      let n = id.x;
      let os = p.outSide;
      var x = n % os;
      var y = (n / os) % os;
      var z = n / (os * os);
      var sum = 0.0;
      var cursor = 0u;
let kzN = select(1u, p.k, p.rank == 3u);
      let kyN = select(1u, p.k, p.rank > 1u);
      for (var kz: u32 = 0u; kz < kzN; kz++) {
          for (var ky: u32 = 0u; ky < kyN; ky++) {
            for (var kx: u32 = 0u; kx < p.k; kx++) {
              let ix = (z + kz) * p.side * p.side + (y + ky) * p.side + (x + kx);
              sum += input[ix] * kernel[cursor];
              cursor++;
            }
          }
        }
      output[n] = sum;
    }`;
  const module = device.createShaderModule({ code: shader });
  const params = new Uint32Array([side, k, outSide, rank]);
  const inBuf = device.createBuffer({ size: input.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const kBuf = device.createBuffer({ size: Math.max(4, kernel.length * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const outBuf = device.createBuffer({ size: Math.max(4, count * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const pBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const read = device.createBuffer({ size: Math.max(4, count * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  device.queue.writeBuffer(inBuf, 0, new Float32Array(input));
  device.queue.writeBuffer(kBuf, 0, new Float32Array(kernel));
  device.queue.writeBuffer(pBuf, 0, params);
  const bind = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bind] }),
    compute: { module, entryPoint: 'main' },
  });
  const group = device.createBindGroup({
    layout: bind,
    entries: [
      { binding: 0, resource: { buffer: inBuf } },
      { binding: 1, resource: { buffer: kBuf } },
      { binding: 2, resource: { buffer: outBuf } },
      { binding: 3, resource: { buffer: pBuf } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(count);
  pass.end();
  encoder.copyBufferToBuffer(outBuf, 0, read, 0, Math.max(4, count * 4));
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(read.getMappedRange()).slice(0, count));
  read.unmap();
  return values;
}

export async function convolve(rank, input, side, kernel, k) {
  try {
    const gpu = await convWebgpu(rank, input, side, kernel, k);
    if (gpu) return gpu;
  } catch { /* CPU is the reference */ }
  if (rank === 1) return conv1d(input, kernel);
  if (rank === 3) return conv3d(input, side, kernel, k);
  return conv2d(input, side, kernel, k);
}
