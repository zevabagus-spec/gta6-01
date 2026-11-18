// Solara Bay — hand-written WebGL renderer. One shader pair, lambert sun
// light plus distance fog, warm sunset sky. Geometry is built from boxes:
// a Mesh is a flat list of triangles with a baked vertex colour and normal.
// The static city is a single Mesh drawn in one call; cars, people and props
// are small Meshes drawn with a model matrix. No engine, no library.
import { mat4Identity, mat4Perspective, mat4LookAt } from './math3d.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 view = uView * world;
  vDepth = -view.z;
  vColor = aColor;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * view;
}`;
const FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDepth;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uGlow;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uSunDir), 0.0);
  float shade = 0.5 + 0.5 * diff;
  vec3 col = vColor * shade + vec3(uGlow);
  float f = clamp((vDepth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}`;

// One face of a box: two triangles, one outward normal, one colour.
function pushFace(list, corners, normal, color) {
  const [a, b, c, d] = corners;
  list.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) list.nor.push(...normal);
  for (let i = 0; i < 6; i++) list.col.push(...color);
}

// Add an axis-aligned box centred at (cx, cy, cz) to a triangle list.
// topColor tints the roof / top face so buildings read at a glance.
export function pushBox(list, cx, cy, cz, sx, sy, sz, color, topColor) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const top = topColor || color;
  pushFace(list, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], top);
  pushFace(list, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], color);
  pushFace(list, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], color);
  pushFace(list, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], color);
  pushFace(list, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], color);
  pushFace(list, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], color);
}
// A flat quad lying on the ground (roads, sidewalks, water, plazas).
export function pushFlat(list, cx, cz, sx, sz, y, color) {
  pushFace(list,
    [[cx - sx / 2, y, cz + sz / 2], [cx + sx / 2, y, cz + sz / 2], [cx + sx / 2, y, cz - sz / 2], [cx - sx / 2, y, cz - sz / 2]],
    [0, 1, 0], color);
}
export function newTriList() { return { pos: [], nor: [], col: [] }; }
export function triCount(list) { return list.pos.length / 3; }

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    this.ok = !!this.gl;
    if (!this.ok) return;
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAG); gl.compileShader(fs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      this.ok = false; this.error = 'shader compile failed'; return;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.ok = false; this.error = 'shader link failed'; return; }
    gl.useProgram(prog);
    this.prog = prog;
    this.uProj = gl.getUniformLocation(prog, 'uProj');
    this.uView = gl.getUniformLocation(prog, 'uView');
    this.uModel = gl.getUniformLocation(prog, 'uModel');
    this.uSunDir = gl.getUniformLocation(prog, 'uSunDir');
    this.uFogColor = gl.getUniformLocation(prog, 'uFogColor');
    this.uFogRange = gl.getUniformLocation(prog, 'uFogRange');
    this.uGlow = gl.getUniformLocation(prog, 'uGlow');
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.aNormal = gl.getAttribLocation(prog, 'aNormal');
    this.aColor = gl.getAttribLocation(prog, 'aColor');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.meshes = [];
  }

  // Upload a triangle list once; returns a mesh handle for later draw calls.
  makeMesh(list) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    const n = list.pos.length / 3;
    const data = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      data.set(list.pos.slice(i * 3, i * 3 + 3), i * 9);
      data.set(list.nor.slice(i * 3, i * 3 + 3), i * 9 + 3);
      data.set(list.col.slice(i * 3, i * 3 + 3), i * 9 + 6);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const mesh = { buf, count: n };
    this.meshes.push(mesh);
    return mesh;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / Math.max(1, h);
  }

  // Begin a frame: sky colour, sun, fog, camera. Returns nothing; draw after.
  beginFrame(camera) {
    const gl = this.gl;
    this.resize();
    gl.clearColor(0.98, 0.72, 0.45, 1.0); // warm late-afternoon sky
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mat4Perspective(1.05, this.aspect || 1.6, 0.1, 900);
    const view = mat4LookAt(camera.eye, camera.target, [0, 1, 0]);
    gl.uniformMatrix4fv(this.uProj, false, new Float32Array(proj));
    gl.uniformMatrix4fv(this.uView, false, new Float32Array(view));
    // Sun low in the west so long shadows and warm faces read in screenshots.
    gl.uniform3fv(this.uSunDir, new Float32Array([0.55, 0.62, 0.35]));
    gl.uniform3fv(this.uFogColor, new Float32Array([0.98, 0.72, 0.45]));
    gl.uniform2fv(this.uFogRange, new Float32Array([120, 520]));
    gl.uniform1f(this.uGlow, 0.0);
  }

  drawMesh(mesh, model, glow) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uModel, false, new Float32Array(model));
    gl.uniform1f(this.uGlow, glow || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(this.aColor);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  drawStatic(mesh) { this.drawMesh(mesh, mat4Identity(), 0); }
}
