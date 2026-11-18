// ===================================================================
//  Kernels CSG: Manifold (WASM, rápido) y JSCAD (JS puro, respaldo)
// ===================================================================
export const FN = 28;

export function manifoldKernel(wasm) {
  const { Manifold } = wasm;
  let pool = [];
  const T = (o) => { pool.push(o); return o; };
  return {
    name: 'manifold',
    cube: (s) => T(Manifold.cube(s, false)),
    cyl: (h, d1, d2 = d1, fn = FN) => T(Manifold.cylinder(h, d1 / 2, d2 / 2, d1 < 7 ? Math.max(16, fn - 8) : fn, false)),
    prism: (pts, h) => T(Manifold.extrude([ccw(pts)], h)),
    hull: (arr) => T(Manifold.hull(arr)),
    union: (arr) => arr.length === 1 ? arr[0] : T(Manifold.union(arr)),
    diff: (a, arr) => T(Manifold.difference([a, ...arr])),
    inter: (a, b) => T(a.intersect(b)),
    tr: (s, v) => T(s.translate(v)),
    rot: (s, v) => T(s.rotate(v)),
    mir: (s, n) => T(s.mirror(n)),
    bbox: (s) => { const b = s.boundingBox(); return { min: [...b.min], max: [...b.max] }; },
    isEmpty: (s) => s.isEmpty(),
    mesh: (s) => {
      const m = s.getMesh();
      const np = m.numProp, vp = m.vertProperties, nv = vp.length / np;
      const pos = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) { pos[3 * i] = vp[np * i]; pos[3 * i + 1] = vp[np * i + 1]; pos[3 * i + 2] = vp[np * i + 2]; }
      return { pos, idx: new Uint32Array(m.triVerts) };
    },
    clear: () => { for (const o of pool) { try { o.delete(); } catch (e) {} } pool = []; },
  };
}

export function jscadKernel(J) {
  const { primitives: Pr, booleans: B, transforms: Tr, hulls: Hu, extrusions: Ex, measurements: Me, geometries: Ge } = J;
  const d2r = Math.PI / 180;
  return {
    name: 'jscad',
    cube: (s) => Pr.cuboid({ size: s, center: [s[0] / 2, s[1] / 2, s[2] / 2] }),
    cyl: (h, d1, d2 = d1, fn = FN) => Pr.cylinderElliptic({ height: h, startRadius: [d1 / 2, d1 / 2], endRadius: [Math.max(d2, 0.01) / 2, Math.max(d2, 0.01) / 2], segments: d1 < 7 ? 16 : 24, center: [0, 0, h / 2] }),
    prism: (pts, h) => Ex.extrudeLinear({ height: h }, Pr.polygon({ points: ccw(pts) })),
    hull: (arr) => Hu.hull(...arr),
    union: (arr) => arr.length === 1 ? arr[0] : B.union(...arr),
    diff: (a, arr) => B.subtract(a, ...arr),
    inter: (a, b) => B.intersect(a, b),
    tr: (s, v) => Tr.translate(v, s),
    rot: (s, v) => Tr.rotateZ(v[2] * d2r, Tr.rotateY(v[1] * d2r, Tr.rotateX(v[0] * d2r, s))),
    mir: (s, n) => Tr.mirror({ normal: n }, s),
    bbox: (s) => { const b = Me.measureBoundingBox(s); return { min: [...b[0]], max: [...b[1]] }; },
    isEmpty: (s) => Ge.geom3.toPolygons(s).length === 0,
    mesh: (s) => {
      const polys = Ge.geom3.toPolygons(s);
      const out = [];
      for (const p of polys) { const v = p.vertices; for (let i = 1; i < v.length - 1; i++) out.push(...v[0], ...v[i], ...v[i + 1]); }
      const pos = new Float32Array(out);
      const idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i;
      return { pos, idx };
    },
    clear: () => {},
  };
}

function ccw(pts) {
  let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a < 0 ? [...pts].reverse() : pts;
}

// ---- utilidades de malla ---------------------------------------------------
export function eulerMatrix(r) { // OpenSCAD: X, luego Y, luego Z  => R = Rz*Ry*Rx
  const [a, b, c] = r.map(x => x * Math.PI / 180);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const Rx = [1, 0, 0, 0, ca, -sa, 0, sa, ca], Ry = [cb, 0, sb, 0, 1, 0, -sb, 0, cb], Rz = [cc, -sc, 0, sc, cc, 0, 0, 0, 1];
  const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j]; return C; };
  return mul(Rz, mul(Ry, Rx)).map(v => Math.abs(v) < 1e-12 ? 0 : v);
}

export function transformPos(pos, R) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    out[i] = R[0] * x + R[1] * y + R[2] * z; out[i + 1] = R[3] * x + R[4] * y + R[5] * z; out[i + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  return out;
}

export function boundsOf(pos) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

export function volumeOf(pos, idx) {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return Math.abs(v / 6);
}

// Malla en orientación de impresión, apoyada en z=0 y centrada en la cama
export function printMesh(mesh, rot, bed) {
  const p = transformPos(mesh.pos, eulerMatrix(rot));
  const b = boundsOf(p);
  let swap = false;
  if (bed && !(b.size[0] <= bed[0] && b.size[1] <= bed[1]) && (b.size[1] <= bed[0] && b.size[0] <= bed[1])) swap = true;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const ox = bed ? bed[0] / 2 : 0, oy = bed ? bed[1] / 2 : 0;
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i] - cx, y = p[i + 1] - cy;
    if (swap) { const t = x; x = -y; y = t; }
    p[i] = x + ox; p[i + 1] = y + oy; p[i + 2] -= b.min[2];
  }
  return { pos: p, idx: mesh.idx, size: swap ? [b.size[1], b.size[0], b.size[2]] : b.size };
}

export function stlBinary(mesh, name = 'pieza') {
  const n = mesh.idx.length / 3;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  const head = `Configurador home lab - ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  const P = mesh.pos, I = mesh.idx;
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const q of [a, b, c]) { dv.setFloat32(o, P[q], true); dv.setFloat32(o + 4, P[q + 1], true); dv.setFloat32(o + 8, P[q + 2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}
