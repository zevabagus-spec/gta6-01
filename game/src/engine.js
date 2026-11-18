// Hand-written WebGL renderer: one unit cube, one lambert shader with
// distance fog, immediate-mode box drawing. No library, no textures,
// no external assets — colour and light carry the whole look.

import { matCompose, matLookAt, matMultiply, matPerspective } from './math3d.js';
import { FOG_COLOR, SKY_HORIZON, SKY_TOP, SUN_DIR } from './config.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uSun;
uniform vec3 uFog;
uniform vec3 uCam;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uSun)), 0.0);
  float light = 0.55 + 0.45 * diff;
  vec3 col = uColor * light;
  float d = distance(vWorld, uCam);
  float fog = clamp((d - 90.0) / 220.0, 0.0, 0.75);
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}`;

// Unit cube centred at the origin, 1 wide, with outward normals.
const CUBE_POS = [
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
  -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
  0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
  -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
];
const CUBE_NORM = [
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
];
const CUBE_IDX = [
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.available = false;
    this.drawCalls = 0;
    try {
      const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true })
        || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
      if (!gl) return;
      this.gl = gl;
      const vs = this.compile(gl.VERTEX_SHADER, VERT);
      const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return;
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      this.program = program;
      gl.useProgram(program);
      this.uMVP = gl.getUniformLocation(program, 'uMVP');
      this.uModel = gl.getUniformLocation(program, 'uModel');
      this.uColor = gl.getUniformLocation(program, 'uColor');
      this.uSun = gl.getUniformLocation(program, 'uSun');
      this.uFog = gl.getUniformLocation(program, 'uFog');
      this.uCam = gl.getUniformLocation(program, 'uCam');
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CUBE_POS), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      const normBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CUBE_NORM), gl.STATIC_DRAW);
      const normLoc = gl.getAttribLocation(program, 'aNormal');
      gl.enableVertexAttribArray(normLoc);
      gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
      const idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(CUBE_IDX), gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      this.available = true;
    } catch (err) {
      this.available = false;
    }
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return shader;
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1);
    const w = Math.floor(this.canvas.clientWidth * ratio);
    const h = Math.floor(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  beginFrame(eye, target) {
    const gl = this.gl;
    if (!gl) return;
    this.drawCalls = 0;
    const top = SKY_TOP;
    const horizon = SKY_HORIZON;
    gl.clearColor(
      (top[0] + horizon[0]) / 2,
      (top[1] + horizon[1]) / 2,
      (top[2] + horizon[2]) / 2,
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = matPerspective(1.05, aspect, 0.1, 600);
    const view = matLookAt(eye, target, [0, 1, 0]);
    this.viewProj = matMultiply(proj, view);
    this.eye = eye;
    gl.uniform3fv(this.uSun, SUN_DIR);
    gl.uniform3fv(this.uFog, FOG_COLOR);
    gl.uniform3fv(this.uCam, eye);
  }

  drawBox(x, y, z, rotY, sx, sy, sz, color) {
    const gl = this.gl;
    if (!gl) return;
    const model = matCompose(x, y, z, rotY, sx, sy, sz);
    gl.uniformMatrix4fv(this.uModel, false, new Float32Array(model));
    gl.uniformMatrix4fv(this.uMVP, false, new Float32Array(matMultiply(this.viewProj, model)));
    gl.uniform3fv(this.uColor, color);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    this.drawCalls++;
  }

  // A flat box whose centre sits at ground height y=0.
  drawSlab(x, z, w, d, h, color) {
    this.drawBox(x, h / 2, z, 0, w, h, d, color);
  }
}
