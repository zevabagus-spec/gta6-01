// Minimal 4x4 matrix math for the chase camera. Matrices are Float32Array(16)
// in column-major order, matching WebGL uniforms. Only what the game needs:
// perspective, look-at, multiply, and a Y-rotation helper for box corners.
export function identityMatrix() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function perspectiveMatrix(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAtMatrix(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (len < 1e-6) {
    // Eye looks straight along the up vector: fall back to a fixed axis.
    xx = 1; xy = 0; xz = 0;
    len = 1;
  }
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  // The view rotation is the transpose of the camera orientation: the
  // matrix rows are the camera axes, so in column-major storage the axes
  // go down the columns transposed (row 0 = x axis, row 1 = y axis,
  // row 2 = z axis). Storing the axes as columns instead mirrors the
  // pitch whenever the camera yaws away from due south.
  const m = new Float32Array(16);
  m[0] = xx; m[4] = xy; m[8] = xz;
  m[1] = yx; m[5] = yy; m[9] = yz;
  m[2] = zx; m[6] = zy; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

// Rotate a local (x, z) offset by a heading around Y. Heading 0 faces -Z.
export function rotateOffsetY(lx, lz, heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [lx * c + lz * s, -lx * s + lz * c];
}

export function normalize2D(x, z) {
  const len = Math.sqrt(x * x + z * z);
  if (len < 1e-6) return [0, 0];
  return [x / len, z / len];
}
