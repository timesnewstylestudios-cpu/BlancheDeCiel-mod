/* SPDX-License-Identifier: GPL-3.0-or-later */

import { STAGE_H, STAGE_W, applyShader2d, drawBoxes, drawFloor, drawSpheres, replayDrawOps, scratchToCanvas, canvasToScratch } from './paint.js';
import { createGL } from './glshader.js';
import { alphaOverlap, boundsOverlap, colorHitsColor, maskHitsColor } from './hit.js';
import { parseHex } from './color.js';

const images = new Map();
let drawnOps = -1;

function costume(sprite) {
  if (!sprite.costume) return null;
  let image = images.get(sprite.costume);
  if (!image) {
    image = new Image();
    image.src = sprite.costume;
    images.set(sprite.costume, image);
  }
  return image;
}

function drawBody(ctx, sprite, selected) {
  const point = scratchToCanvas(sprite.x, sprite.y);
  const scale = (sprite.size || 100) / 100;
  ctx.save();
  ctx.globalAlpha = 1 - Math.min(100, Math.max(0, sprite.effects?.ghost || 0)) / 100;
  ctx.translate(point.x, point.y);
  ctx.rotate((sprite.dir || 0) * Math.PI / 180);
  const image = costume(sprite);
  if (image && image.complete && image.naturalWidth) {
    const w = 72 * scale;
    const h = 72 * scale;
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
  } else {
    ctx.scale(scale, scale);
    ctx.fillStyle = '#4C97FF';
    ctx.strokeStyle = selected ? '#16324F' : '#1d4e89';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(18, 20);
    ctx.lineTo(-18, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSprite(ctx, sprite, selected) {
  const point = scratchToCanvas(sprite.x, sprite.y);
  const scale = (sprite.size || 100) / 100;
  drawBody(ctx, sprite, selected);
  ctx.fillStyle = '#16324F';
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sprite.name, point.x, point.y + 34 * scale + 14);
  if (sprite.bubble && (sprite.bubble.until == null || sprite.bubble.until > Date.now())) {
    const text = String(sprite.bubble.text ?? '');
    ctx.font = '600 14px sans-serif';
    const width = Math.min(200, Math.max(48, ctx.measureText(text).width + 20));
    const bx = Math.min(STAGE_W - width - 8, Math.max(8, point.x - width / 2));
    const by = Math.max(8, point.y - 70);
    ctx.fillStyle = sprite.bubble.think ? '#e7e2f5' : '#ffffff';
    ctx.strokeStyle = '#16324F';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, width, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#16324F';
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 42), bx + width / 2, by + 23);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createStageView(root) {
  root.innerHTML = `
    <div class="stage-frame">
      <canvas class="stage-layer" id="pen" width="${STAGE_W}" height="${STAGE_H}"></canvas>
      <canvas class="stage-layer" id="gfx" width="${STAGE_W}" height="${STAGE_H}"></canvas>
      <canvas class="stage-layer" id="view" width="${STAGE_W}" height="${STAGE_H}"></canvas>
      <canvas class="stage-layer gl" id="gl" width="${STAGE_W}" height="${STAGE_H}"></canvas>
    </div>
    <div class="hud" id="hud"></div>`;
  const pen = root.querySelector('#pen');
  const gfx = root.querySelector('#gfx');
  const view = root.querySelector('#view');
  const glCanvas = root.querySelector('#gl');
  const hud = root.querySelector('#hud');
  const gl = createGL(glCanvas);
  let drag = null;

  function paint(project, selectedId, now) {
    const v = view.getContext('2d');
    const p = pen.getContext('2d');
    const g = gfx.getContext('2d');
    v.fillStyle = '#d7eef8';
    v.fillRect(0, 0, STAGE_W, STAGE_H);
    const ops = project.drawOps || [];
    if (ops.length !== drawnOps) {
      replayDrawOps(p, g, ops);
      drawnOps = ops.length;
    }
    v.drawImage(pen, 0, 0);
    v.drawImage(gfx, 0, 0);
    const camera = project.camera || { x: 0, y: 0, z: 280, yaw: 30, pitch: 20 };
    if ((project.boxes || []).length || (project.spheres || []).length) drawFloor(v, camera);
    drawBoxes(v, project.boxes, camera);
    drawSpheres(v, project.spheres, camera);
    const ordered = project.sprites.filter((sprite) => !sprite.isStage && sprite.visible !== false)
      .slice()
      .sort((a, b) => (a.layerOrder || 1) - (b.layerOrder || 1));
    for (const sprite of ordered) drawSprite(v, sprite, sprite.id === selectedId);
    if (project.shader && project.shader !== 'none') {
      const shaded = gl && gl.draw(view, project.shader, now / 1000);
      glCanvas.style.visibility = shaded ? 'visible' : 'hidden';
      if (!shaded) {
        const image = v.getImageData(0, 0, STAGE_W, STAGE_H);
        image.data.set(applyShader2d(image, project.shader, now / 1000));
        v.putImageData(image, 0, 0);
      }
    } else {
      glCanvas.style.visibility = 'hidden';
    }
    const lines = [];
    for (const sprite of project.sprites) {
      for (const [name, value] of Object.entries(sprite.variables || {})) lines.push(`${name}: ${value}`);
    }
    hud.textContent = lines.join('   ');
  }

  function localScratch(event) {
    const rect = view.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * STAGE_W;
    const py = ((event.clientY - rect.top) / rect.height) * STAGE_H;
    return canvasToScratch(px, py);
  }

  function pixelsOf(sprite) {
    const canvas = document.createElement('canvas');
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    drawBody(ctx, sprite, false);
    const image = ctx.getImageData(0, 0, STAGE_W, STAGE_H);
    return { w: STAGE_W, h: STAGE_H, data: image.data };
  }

  function backdropPixels() {
    const canvas = document.createElement('canvas');
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#d7eef8';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.drawImage(pen, 0, 0);
    ctx.drawImage(gfx, 0, 0);
    const image = ctx.getImageData(0, 0, STAGE_W, STAGE_H);
    return { w: STAGE_W, h: STAGE_H, data: image.data };
  }

  function boxOf(sprite) {
    const scale = (sprite.size || 100) / 100;
    const point = scratchToCanvas(sprite.x, sprite.y);
    const w = 56 * scale;
    const h = 64 * scale;
    return { x: point.x - w / 2, y: point.y - h / 2, w, h };
  }

  return {
    view,
    overlap(left, right) {
      if (!boundsOverlap(boxOf(left), boxOf(right))) return false;
      return alphaOverlap(pixelsOf(left), pixelsOf(right), 0, 0);
    },
    touchColor(sprite, hex) {
      return maskHitsColor(pixelsOf(sprite), backdropPixels(), 0, 0, parseHex(hex), 36);
    },
    colorTouch(sprite, mine, other) {
      return colorHitsColor(pixelsOf(sprite), backdropPixels(), 0, 0, parseHex(mine), parseHex(other), 36);
    },
    sample(scratchX, scratchY) {
      const point = scratchToCanvas(scratchX, scratchY);
      const pixel = view.getContext('2d').getImageData(
        Math.max(0, Math.min(STAGE_W - 1, Math.round(point.x))),
        Math.max(0, Math.min(STAGE_H - 1, Math.round(point.y))),
        1,
        1,
      ).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2] };
    },
    paint,
    localScratch,
    pointerDown(event, project) {
      const at = localScratch(event);
      const sprites = [...project.sprites].reverse();
      const hit = sprites.find((sprite) => {
        if (sprite.isStage || sprite.visible === false) return false;
        const dx = sprite.x - at.x;
        const dy = sprite.y - at.y;
        const radius = 28 * ((sprite.size || 100) / 100);
        return dx * dx + dy * dy < radius * radius;
      });
      if (!hit) return null;
      drag = { id: hit.id, dx: hit.x - at.x, dy: hit.y - at.y };
      return hit;
    },
    pointerMove(event, project) {
      const at = localScratch(event);
      project.answer = project.answer;
      if (!drag) return at;
      const sprite = project.sprites.find((item) => item.id === drag.id);
      if (sprite) {
        sprite.x = at.x + drag.dx;
        sprite.y = at.y + drag.dy;
      }
      return at;
    },
    pointerUp() { drag = null; },
  };
}
