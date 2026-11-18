// Hand-written WebGL renderer: one shader program, per-vertex colors, a
// warm directional sun, camera-relative distance fog, and glow for lit
// windows, lamps and beacons. Static city geometry uploads once; cars,
// people and effects are re-emitted every frame into a dynamic buffer.
// No libraries, no textures.

const FLOATS_PER_VERTEX = 10;

const VERTEX_SHADER = [
  'attribute vec3 aPosition;',
  'attribute vec3 aColor;',
  'attribute vec3 aNormal;',
  'attribute float aGlow;',
  'uniform mat4 uViewProj;',
  'varying vec3 vColor;',
  'varying vec3 vNormal;',
  'varying float vGlow;',
  'varying vec3 vWorld;',
  'void main() {',
  '  vColor = aColor;',
  '  vNormal = aNormal;',
  '  vGlow = aGlow;',
  '  vWorld = aPosition;',
  '  gl_Position = uViewProj * vec4(aPosition, 1.0);',
  '}',
].join('\n');

const FRAGMENT_SHADER = [
  'precision mediump float;',
  'uniform vec3 uSunDir;',
  'uniform vec3 uFogColor;',
  'uniform vec3 uCameraPos;',
  'uniform float uTime;',
  'varying vec3 vColor;',
  'varying vec3 vNormal;',
  'varying float vGlow;',
  'varying vec3 vWorld;',
  'void main() {',
  '  float diff = max(dot(normalize(vNormal), uSunDir), 0.0);',
  '  vec3 lit = vColor * (0.52 + 0.48 * diff) + vColor * vGlow * 0.85;',
  '  if (vGlow > 0.55 && vGlow < 0.65) {',
  '    lit += 0.05 * sin(uTime * 1.6 + vWorld.x * 0.15 + vWorld.z * 0.11);',
  '  }',
  '  float fogStart = 160.0;',
  '  float fogEnd = 520.0;',
  '  float dist = distance(vWorld, uCameraPos);',
  '  float fog = clamp((dist - fogStart) / (fogEnd - fogStart), 0.0, 0.8);',
  '  gl_FragColor = vec4(mix(lit, uFogColor, fog), 1.0);',
  '}',
].join('\n');

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error('Shader failed: ' + gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program failed: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

// Emit one axis-aligned box rotated around Y into the vertex array.
export function emitBox(verts, spec) {
  const hx = spec.sx / 2;
  const hy = spec.sy / 2;
  const hz = spec.sz / 2;
  const c = Math.cos(spec.ry || 0);
  const s = Math.sin(spec.ry || 0);
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const world = corners.map(([lx, ly, lz]) => [
    spec.x + lx * c + lz * s,
    spec.y + ly,
    spec.z - lx * s + lz * c,
  ]);
  const faces = [
    { idx: [0, 1, 2, 0, 2, 3], n: [0, 0, -1] },
    { idx: [5, 4, 7, 5, 7, 6], n: [0, 0, 1] },
    { idx: [4, 0, 3, 4, 3, 7], n: [-1, 0, 0] },
    { idx: [1, 5, 6, 1, 6, 2], n: [1, 0, 0] },
    { idx: [3, 2, 6, 3, 6, 7], n: [0, 1, 0] },
    { idx: [4, 5, 1, 4, 1, 0], n: [0, -1, 0] },
  ];
  const glow = spec.glow || 0;
  const col = spec.color;
  for (const face of faces) {
    const nx = face.n[0] * c + face.n[2] * s;
    const nz = -face.n[0] * s + face.n[2] * c;
    for (const vi of face.idx) {
      const p = world[vi];
      verts.push(p[0], p[1], p[2], col[0], col[1], col[2], nx, face.n[1], nz, glow);
    }
  }
}

export function emitGroundQuad(verts, quad) {
  const hx = quad.sx / 2;
  const hz = quad.sz / 2;
  const y = quad.y || 0;
  const col = quad.color;
  const glow = quad.glow || 0;
  const pts = [
    [quad.x - hx, y, quad.z - hz],
    [quad.x + hx, y, quad.z - hz],
    [quad.x + hx, y, quad.z + hz],
    [quad.x - hx, y, quad.z + hz],
  ];
  const order = [0, 1, 2, 0, 2, 3];
  for (const vi of order) {
    const p = pts[vi];
    verts.push(p[0], p[1], p[2], col[0], col[1], col[2], 0, 1, 0, glow);
  }
}

export function emitWallQuad(verts, quad) {
  const hw = quad.w / 2;
  const hh = quad.h / 2;
  const col = quad.color;
  const glow = quad.glow || 0;
  let pts;
  let normal;
  if (quad.facing === 'north') {
    pts = [[quad.x + hw, quad.y - hh, quad.z], [quad.x - hw, quad.y - hh, quad.z], [quad.x - hw, quad.y + hh, quad.z], [quad.x + hw, quad.y + hh, quad.z]];
    normal = [0, 0, -1];
  } else {
    pts = [[quad.x - hw, quad.y - hh, quad.z], [quad.x + hw, quad.y - hh, quad.z], [quad.x + hw, quad.y + hh, quad.z], [quad.x - hw, quad.y + hh, quad.z]];
    normal = [0, 0, 1];
  }
  const order = [0, 1, 2, 0, 2, 3];
  for (const vi of order) {
    const p = pts[vi];
    verts.push(p[0], p[1], p[2], col[0], col[1], col[2], normal[0], normal[1], normal[2], glow);
  }
}

// A vertical quad that always faces the camera (sun, beacon glow, markers).
export function emitBillboard(verts, x, y, z, size, color, glow, cameraYaw) {
  const right = [Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)];
  const hw = size / 2;
  const hh = size / 2;
  const pts = [
    [x - right[0] * hw, y - hh, z - right[2] * hw],
    [x + right[0] * hw, y - hh, z + right[2] * hw],
    [x + right[0] * hw, y + hh, z + right[2] * hw],
    [x - right[0] * hw, y + hh, z - right[2] * hw],
  ];
  const normal = [-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)];
  const order = [0, 1, 2, 0, 2, 3];
  for (const vi of order) {
    const p = pts[vi];
    verts.push(p[0], p[1], p[2], color[0], color[1], color[2], normal[0], normal[1], normal[2], glow);
  }
}

export function buildStaticVertices(city) {
  const verts = [];
  for (const quad of city.ground) emitGroundQuad(verts, quad);
  for (const spec of city.boxes) emitBox(verts, spec);
  for (const quad of city.windowQuads) emitWallQuad(verts, quad);
  // Sky ring: tall gradient quads far outside the city.
  const R = 420;
  const skyTop = [0.35, 0.55, 0.85];
  const skyBottom = [1.0, 0.72, 0.48];
  const ring = [
    [-R, -R, R, -R], [R, -R, R, R], [R, R, -R, R], [-R, R, -R, -R],
  ];
  for (const [x0, z0, x1, z1] of ring) {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(mx, mz) || 1;
    const nx = -mx / len;
    const nz = -mz / len;
    const pts = [
      [x0, -5, z0, skyBottom], [x1, -5, z1, skyBottom],
      [x1, 190, z1, skyTop], [x0, 190, z0, skyTop],
    ];
    const order = [0, 1, 2, 0, 2, 3];
    for (const vi of order) {
      const p = pts[vi];
      verts.push(p[0], p[1], p[2], p[3][0], p[3][1], p[3][2], nx, 0, nz, 0.35);
    }
  }
  return new Float32Array(verts);
}

export function createRenderer(canvas, callbacks) {
  let gl = null;
  let program = null;
  let staticBuffer = null;
  let dynamicBuffer = null;
  let staticCount = 0;
  let locations = null;
  let lost = false;
  let staticVerts = null;
  const dynamicCapacity = 600000;
  const dynamicArray = new Float32Array(dynamicCapacity);

  function initGL() {
    gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true })
      || canvas.getContext('experimental-webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    program = createProgram(gl);
    locations = {
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aColor: gl.getAttribLocation(program, 'aColor'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      aGlow: gl.getAttribLocation(program, 'aGlow'),
      uViewProj: gl.getUniformLocation(program, 'uViewProj'),
      uSunDir: gl.getUniformLocation(program, 'uSunDir'),
      uFogColor: gl.getUniformLocation(program, 'uFogColor'),
      uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
      uTime: gl.getUniformLocation(program, 'uTime'),
    };
    staticBuffer = gl.createBuffer();
    dynamicBuffer = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.98, 0.70, 0.45, 1.0);
    if (staticVerts) uploadStatic();
    return true;
  }

  function uploadStatic() {
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, staticVerts, gl.STATIC_DRAW);
    staticCount = staticVerts.length / FLOATS_PER_VERTEX;
  }

  function bindAttribs() {
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(locations.aPosition);
    gl.vertexAttribPointer(locations.aPosition, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(locations.aColor);
    gl.vertexAttribPointer(locations.aColor, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(locations.aNormal);
    gl.vertexAttribPointer(locations.aNormal, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(locations.aGlow);
    gl.vertexAttribPointer(locations.aGlow, 1, gl.FLOAT, false, stride, 36);
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    if (callbacks && callbacks.onContextLost) callbacks.onContextLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    initGL();
    if (callbacks && callbacks.onContextRestored) callbacks.onContextRestored();
  });

  const ready = initGL();

  return {
    ready,
    isLost() { return lost; },
    setStaticGeometry(verts) {
      staticVerts = verts;
      if (gl && !lost) uploadStatic();
    },
    resize(width, height) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (gl) gl.viewport(0, 0, width, height);
    },
    renderFrame(viewProj, timeSeconds, dynamicSpecs, cameraPos) {
      if (!gl || lost) return;
      const verts = [];
      for (const spec of dynamicSpecs.boxes) emitBox(verts, spec);
      for (const quad of dynamicSpecs.groundQuads) emitGroundQuad(verts, quad);
      for (const quad of dynamicSpecs.wallQuads) emitWallQuad(verts, quad);
      for (const bb of dynamicSpecs.billboards) {
        emitBillboard(verts, bb.x, bb.y, bb.z, bb.size, bb.color, bb.glow, dynamicSpecs.cameraYaw);
      }
      const count = Math.min(verts.length, dynamicCapacity);
      if (verts.length > dynamicCapacity) verts.length = dynamicCapacity;
      dynamicArray.set(verts);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(locations.uViewProj, false, viewProj);
      gl.uniform3f(locations.uSunDir, 0.45, 0.75, 0.35);
      gl.uniform3f(locations.uFogColor, 0.98, 0.70, 0.45);
      gl.uniform3f(locations.uCameraPos, cameraPos[0], cameraPos[1], cameraPos[2]);
      gl.uniform1f(locations.uTime, timeSeconds);
      gl.bindBuffer(gl.ARRAY_BUFFER, staticBuffer);
      bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, staticCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynamicBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, dynamicArray.subarray(0, count), gl.DYNAMIC_DRAW);
      bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, count / FLOATS_PER_VERTEX);
    },
  };
}
