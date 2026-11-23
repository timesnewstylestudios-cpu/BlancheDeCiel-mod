/* SPDX-License-Identifier: GPL-3.0-or-later */

export const STAGE_W = 480;
export const STAGE_H = 360;

export function scratchToCanvas(x, y, width = STAGE_W, height = STAGE_H) {
  return { x: width / 2 + x, y: height / 2 - y };
}

export function canvasToScratch(px, py, width = STAGE_W, height = STAGE_H) {
  return { x: px - width / 2, y: height / 2 - py };
}

export function projectPoint(point, camera, width = STAGE_W, height = STAGE_H) {
  const yaw = (camera.yaw || 0) * Math.PI / 180;
  const pitch = (camera.pitch || 0) * Math.PI / 180;
  let x = point.x - camera.x;
  let y = point.y - camera.y;
  let z = point.z - camera.z;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x1 = cosYaw * x - sinYaw * z;
  const z1 = sinYaw * x + cosYaw * z;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const y2 = cosPitch * y - sinPitch * z1;
  const z2 = sinPitch * y + cosPitch * z1;
  const depth = -z2;
  if (depth < 1) return null;
  const focal = 420;
  return {
    x: width / 2 + (x1 * focal) / depth,
    y: height / 2 - (y2 * focal) / depth,
    depth,
  };
}

const FACES = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
];

function boxCorners(box) {
  const h = (box.size || 40) / 2;
  const signs = [-1, 1];
  const corners = [];
  for (const z of signs) for (const y of signs) for (const x of signs) {
    corners.push({ x: box.x + x * h, y: box.y + y * h, z: box.z + z * h });
  }
  return corners;
}

export function drawFloor(ctx, camera) {
  ctx.save();
  ctx.strokeStyle = 'rgba(22,50,79,0.25)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i += 1) {
    const a = projectPoint({ x: i * 40, y: -80, z: -160 }, camera);
    const b = projectPoint({ x: i * 40, y: -80, z: 160 }, camera);
    const c = projectPoint({ x: -160, y: -80, z: i * 40 }, camera);
    const d = projectPoint({ x: 160, y: -80, z: i * 40 }, camera);
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSpheres(ctx, spheres, camera) {
  const drawn = [];
  for (const sphere of spheres || []) {
    const center = projectPoint(sphere, camera);
    const edge = projectPoint({ x: sphere.x + (sphere.size || 20) / 2, y: sphere.y, z: sphere.z }, camera);
    if (!center || !edge) continue;
    drawn.push({ center, radius: Math.max(2, Math.hypot(edge.x - center.x, edge.y - center.y)), depth: center.depth, color: sphere.color || '#2E86AB' });
  }
  drawn.sort((a, b) => b.depth - a.depth);
  for (const sphere of drawn) {
    const gradient = ctx.createRadialGradient(
      sphere.center.x - sphere.radius * 0.3,
      sphere.center.y - sphere.radius * 0.3,
      sphere.radius * 0.2,
      sphere.center.x,
      sphere.center.y,
      sphere.radius,
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, sphere.color);
    gradient.addColorStop(1, '#16324f');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sphere.center.x, sphere.center.y, sphere.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawBoxes(ctx, boxes, camera) {
  const faces = [];
  for (const box of boxes || []) {
    const corners = boxCorners(box).map((corner) => projectPoint(corner, camera));
    if (corners.some((corner) => !corner)) continue;
    FACES.forEach((indices, faceIndex) => {
      const pts = indices.map((index) => corners[index]);
      const depth = pts.reduce((sum, point) => sum + point.depth, 0) / pts.length;
      faces.push({ pts, depth, color: box.color || '#2E86AB', shade: 0.55 + (faceIndex % 3) * 0.15 });
    });
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) {
    ctx.beginPath();
    face.pts.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fillStyle = shade(face.color, face.shade);
    ctx.fill();
  }
}

function shade(hex, amount) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!match) return hex || '#2E86AB';
  const num = parseInt(match[1], 16);
  const mix = (shift) => Math.max(0, Math.min(255, Math.round(((num >> shift) & 255) * amount)));
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

export function replayDrawOps(pen, gfx, ops) {
  pen.clearRect(0, 0, STAGE_W, STAGE_H);
  gfx.clearRect(0, 0, STAGE_W, STAGE_H);
  for (const op of ops || []) {
    if (op.op === 'penclear') {
      pen.clearRect(0, 0, STAGE_W, STAGE_H);
      continue;
    }
    if (op.op === 'gfxclear') {
      gfx.clearRect(0, 0, STAGE_W, STAGE_H);
      continue;
    }
    const target = op.op === 'line' || op.op === 'stamp' ? pen : gfx;
    drawOp(target, op);
  }
}

function drawOp(ctx, op) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = op.color || '#0FBD8C';
  ctx.fillStyle = op.color || '#0FBD8C';
  ctx.lineWidth = op.size || 2;
  if (op.op === 'line') {
    const a = scratchToCanvas(op.x1, op.y1);
    const b = scratchToCanvas(op.x2, op.y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (op.op === 'rect') {
    const p = scratchToCanvas(op.x, op.y);
    ctx.fillRect(p.x, p.y - op.h, op.w, op.h);
  } else if (op.op === 'oval') {
    const p = scratchToCanvas(op.x, op.y);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.abs(op.w) / 2, Math.abs(op.h) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (op.op === 'stamp') {
    const p = scratchToCanvas(op.x, op.y);
    ctx.translate(p.x, p.y);
    ctx.rotate((op.dir || 0) * Math.PI / 180);
    const r = 12 * ((op.size || 100) / 100);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, r);
    ctx.lineTo(-r * 0.7, r);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
  }
  ctx.restore();
}

export function applyShader2d(image, preset, time) {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data);
  if (preset === 'invert') {
    for (let i = 0; i < data.length; i += 4) {
      out[i] = 255 - data[i];
      out[i + 1] = 255 - data[i + 1];
      out[i + 2] = 255 - data[i + 2];
    }
  } else if (preset === 'pixel') {
    const size = 8;
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        const i = (y * width + x) * 4;
        for (let yy = 0; yy < size && y + yy < height; yy += 1) {
          for (let xx = 0; xx < size && x + xx < width; xx += 1) {
            const j = ((y + yy) * width + (x + xx)) * 4;
            out[j] = data[i];
            out[j + 1] = data[i + 1];
            out[j + 2] = data[i + 2];
            out[j + 3] = data[i + 3];
          }
        }
      }
    }
  } else if (preset === 'gray' || preset === 'sepia' || preset === 'edge') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (preset === 'gray') {
        const y = r * 0.299 + g * 0.587 + b * 0.114;
        out[i] = out[i + 1] = out[i + 2] = y;
      } else if (preset === 'sepia') {
        out[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        out[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        out[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      } else {
        const x = (i / 4) % width;
        const y = Math.floor(i / 4 / width);
        const j = (Math.min(height - 1, y + 1) * width + Math.min(width - 1, x + 1)) * 4;
        const edge = Math.abs(data[i] - data[j]) + Math.abs(g - data[j + 1]);
        out[i] = out[i + 1] = out[i + 2] = edge;
      }
      out[i + 3] = data[i + 3];
    }
  } else if (preset === 'vignette' || preset === 'wave') {
    const cx = width / 2;
    const cy = height / 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const srcX = preset === 'wave' ? Math.max(0, Math.min(width - 1, Math.round(x + Math.sin(y / 12 + time) * 6))) : x;
        const i = (y * width + x) * 4;
        const s = (y * width + srcX) * 4;
        let r = data[s];
        let g = data[s + 1];
        let b = data[s + 2];
        if (preset === 'vignette') {
          const dx = (x - cx) / cx;
          const dy = (y - cy) / cy;
          const v = Math.max(0, 1 - (dx * dx + dy * dy) * 0.85);
          r *= v; g *= v; b *= v;
        }
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = data[s + 3];
      }
    }
  }
  return out;
}
