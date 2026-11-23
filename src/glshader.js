/* SPDX-License-Identifier: GPL-3.0-or-later */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform int uMode;
void main() {
  vec2 uv = vUv;
  if (uMode == 4) uv.x += sin(uv.y * 24.0 + uTime) * 0.015;
  vec4 color = texture2D(uTex, uv);
  if (uMode == 1) color.rgb = 1.0 - color.rgb;
  if (uMode == 2) {
    vec2 grid = floor(uv * 60.0) / 60.0;
    color = texture2D(uTex, grid);
  }
  if (uMode == 3) {
    float v = smoothstep(0.95, 0.25, distance(uv, vec2(0.5)));
    color.rgb *= v;
  }
  if (uMode == 5) {
    float g = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = vec3(g);
  }
  if (uMode == 6) {
    float r = dot(color.rgb, vec3(0.393, 0.769, 0.189));
    float g = dot(color.rgb, vec3(0.349, 0.686, 0.168));
    float b = dot(color.rgb, vec3(0.272, 0.534, 0.131));
    color.rgb = vec3(r, g, b);
  }
  if (uMode == 7) {
    vec2 px = vec2(1.0 / 480.0, 1.0 / 360.0);
    float l = dot(texture2D(uTex, uv - px).rgb, vec3(0.3));
    float r = dot(texture2D(uTex, uv + px).rgb, vec3(0.3));
    float e = abs(r - l);
    color.rgb = vec3(e);
  }
  gl_FragColor = color;
}`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    return item;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const modes = { invert: 1, pixel: 2, vignette: 3, wave: 4, gray: 5, sepia: 6, edge: 7 };
  return {
    draw(source, preset, time) {
      const mode = modes[preset];
      if (!mode) return false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const loc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);
      gl.uniform1i(gl.getUniformLocation(program, 'uMode'), mode);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
  };
}
