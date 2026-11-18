// ===================================================================
//  Geometría paramétrica del mini-rack (port del rack10_homelab.scad)
//  Ejes: X ancho (0 = lateral izq.), Y fondo (0 = frente), Z alto. mm.
// ===================================================================
export const U = 44.45;

export const MODULE_TYPES = {
  storage: { name: 'Almacenamiento + ventilador 80 mm', short: 'Almacenamiento', minU: 3, fixedU: false, tray: true },
  compute: { name: 'Placa base vertical + fuente SFX', short: 'Cómputo', minU: 6, fixedU: false, tray: true },
  mini:    { name: 'Mini PC en bandeja', short: 'Mini PC', minU: 1, fixedU: false, tray: true },
  router:  { name: 'Router / switch en bandeja', short: 'Router', minU: 1, fixedU: false, tray: true },
  shelf:   { name: 'Bandeja genérica', short: 'Bandeja', minU: 1, fixedU: false, tray: true },
  patch:   { name: 'Patch panel keystone', short: 'Patch panel', minU: 1, fixedU: true, tray: false },
  blank:   { name: 'Tapa ventilada', short: 'Tapa', minU: 1, fixedU: false, tray: false },
};

export function defaultModule(type) {
  switch (type) {
    case 'storage': return { type, u: 3, hdd: 3, ssd: 2 };
    case 'compute': return { type, u: 6, ssd: 6, button: true };
    case 'mini':    return { type, u: 2, dev: [177, 175, 34], label: 'Mini PC' };
    case 'router':  return { type, u: 2, dev: [220, 160, 40], label: 'Router' };
    case 'shelf':   return { type, u: 2, dev: [150, 150, 40], label: 'Equipo' };
    case 'patch':   return { type, u: 1, keystones: 8 };
    case 'blank':   return { type, u: 1 };
  }
}

export function defaultConfig() {
  return {
    std: '10', depth: 250, extraU: 0, wall: 3, faceT: 4,
    bed: [256, 256, 256], bedPreset: 'x1c',
    showDevices: true, showRails: true, fans: [],
    modules: [ // de abajo arriba
      defaultModule('storage'), defaultModule('compute'),
      { ...defaultModule('mini'), label: 'HP EliteDesk 800 Mini' },
      { ...defaultModule('router'), label: 'Router Digi' },
      defaultModule('patch'),
    ],
  };
}

export function derive(cfg) {
  const is19 = cfg.std === '19';
  const W = is19 ? 482.6 : 254;
  const OPEN = is19 ? 450.85 : 222.25;
  const HOLE_X = (W - (is19 ? 465.1 : 236.525)) / 2;
  const D = cfg.depth;
  const NU = cfg.modules.reduce((s, m) => s + m.u, 0) + (cfg.extraU || 0);
  const RF = 15.8, RS = 20, RT = 2, SQ = 9.5, WALL = cfg.wall || 3, PLATE_T = 8, POCKET = 3, TOL = 0.3;
  const FL_W = (W - OPEN) / 2;
  const CB_X0 = RT + WALL + 0.3, CB_Y0 = 9;
  const CB = [RF - CB_X0, 26, 30];
  const Z0 = PLATE_T - POCKET;
  return { is19, W, OPEN, HOLE_X, D, NU, RF, RS, RT, SQ, WALL, PLATE_T, POCKET, TOL, FL_W, CB_X0, CB_Y0, CB, Z0,
    BOLT_Y: 15, M6_D: 6.6, HOLE_Z: [6.35, 22.225, 38.1], FT: cfg.faceT || 4, TRAY_Z: 4,
    uz: (u) => Z0 + (u - 1) * U, H: Z0 + NU * U - POCKET + PLATE_T };
}

const MB = [244, 244];
const MB_HOLES = [[35,10],[79,10],[236.5,27],[12,165],[79,165],[236.5,165],[79,230],[238,228]];
const SFX = [125, 100, 63.5];
const HDD_MOD = [112, 165, 34], SSD_MOD = [80, 110, 15];
const STANDOFF = 8, MB_Z0 = 10;

// ------------------------------------------------------------------
//  Ayudas sobre el kernel K
// ------------------------------------------------------------------
function H(K) {
  const box = (x, y, z, sx, sy, sz) => K.tr(K.cube([sx, sy, sz]), [x, y, z]);
  const cylZ = (x, y, z, d, h, d2) => K.tr(K.cyl(h, d, d2 ?? d), [x, y, z]);
  const cylX = (x, y, z, d, h) => K.tr(K.rot(K.cyl(h, d, d), [0, 90, 0]), [x, y, z]);   // de x hacia +X
  const cylY = (x, y, z, d, h) => K.tr(K.rot(K.cyl(h, d, d), [-90, 0, 0]), [x, y, z]);  // de y hacia +Y
  const U_ = (arr) => K.union(arr.filter(Boolean));
  const diff = (a, arr) => { const c = arr.filter(Boolean); return c.length ? K.diff(a, c) : a; };
  const atCorners = (s, W, D) => U_([s, K.tr(K.mir(s, [1, 0, 0]), [W, 0, 0]), K.tr(K.mir(s, [0, 1, 0]), [0, D, 0]),
    K.tr(K.mir(K.mir(s, [1, 0, 0]), [0, 1, 0]), [W, D, 0])]);
  return { box, cylZ, cylX, cylY, U: U_, diff, atCorners };
}

// ------------------------------------------------------------------
//  Piezas (en coordenadas de montaje)
// ------------------------------------------------------------------
function sideWall(K, g, nu) {
  const { box, cylX, cylZ, U: un, diff, } = H(K);
  const { RT, WALL, D, BOLT_Y } = g;
  const h = nu * U;
  const base = un([box(RT, 4, 0, WALL, D - 8, h), box(RT, 38, 0, 8, D - 76, 6), box(RT, 38, h - 6, 8, D - 76, 6)]);
  const cuts = [];
  const n = Math.floor((h - 36) / 12);
  for (let i = 0; i < n; i++) {
    const z = 18 + i * 12 + 2.5;
    cuts.push(K.hull([cylX(RT - 2, 63, z, 5, WALL + 4), cylX(RT - 2, D - 63, z, 5, WALL + 4)]));
  }
  const zs = [15, h - 15];
  for (let k = 1; k <= nu - 1; k += 2) zs.push(k * U);
  for (const y of [BOLT_Y, D - BOLT_Y]) for (const z of zs) cuts.push(cylX(RT - 1, y, z, 4.4, WALL + 2));
  for (const y of [D / 3, 2 * D / 3]) for (const z of [-1, h - 10]) cuts.push(cylZ(RT + 4, y, z, 6.3, 11));
  return { solid: diff(base, cuts), m4: 2 * zs.length };
}

function cornerBlock(K, g) {
  const { box, cylX, cylZ, diff } = H(K);
  const { CB_X0, CB_Y0, CB, BOLT_Y } = g;
  return diff(box(CB_X0, CB_Y0, 0, ...CB), [cylX(CB_X0 - 1, BOLT_Y, 15, 5.6, 9), cylZ(CB_X0 + CB[0] / 2, CB_Y0 + 19, -1, 5.6, 9)]);
}

function plateFull(K, g, top) {
  const { box, cylZ, U: un, diff, atCorners } = H(K);
  const { W, D, RF, RT, RS, WALL, TOL, POCKET, PLATE_T, CB_X0, CB_Y0, CB } = g;
  const zc = top ? -1 : PLATE_T - POCKET;
  const cuts = [];
  cuts.push(atCorners(un([box(-0.01, -0.01, zc, RF + TOL, RT + TOL, POCKET + 1), box(-0.01, -0.01, zc, RT + TOL, RS + TOL, POCKET + 1)]), W, D));
  for (const x of [0, W - RT - WALL - TOL]) cuts.push(box(x, 3.5, zc, RT + WALL + TOL, D - 7, POCKET + 1));
  const cx = CB_X0 + CB[0] / 2, cy = CB_Y0 + 19;
  cuts.push(atCorners(un([cylZ(cx, cy, -1, 4.5, PLATE_T + 2),
    top ? cylZ(cx, cy, PLATE_T - 1.4, 4.5, 2.5, 9) : cylZ(cx, cy, -0.01, 9, 2.5, 4.5)]), W, D));
  if (!top) for (const x of [28, W - 28]) for (const y of [40, D - 40]) cuts.push(cylZ(x, y, -1, 5.6, 7));
  const rows = Math.max(0, Math.floor((D - 85) / 20) + 1);
  const len = W / 2 - 60;
  for (const x0 of [35, W / 2 + 25]) for (let i = 0; i < rows; i++)
    cuts.push(K.hull([cylZ(x0, 35 + i * 20, -1, 8, PLATE_T + 2), cylZ(x0 + len, 35 + i * 20, -1, 8, PLATE_T + 2)]));
  cuts.push(box(W / 2 - 40, D - 40, -1, 80, 25, PLATE_T + 2));
  return diff(box(0, 0, 0, W, D, PLATE_T), cuts);
}

function foot(K) {
  const { cylZ, diff } = H(K);
  return diff(cylZ(0, 0, 0, 30, 12, 24), [cylZ(0, 0, -1, 4.5, 20), cylZ(0, 0, -1, 9, 8)]);
}

// Frontal genérico con orejas (cara delantera en y = -t)
function facePlate(K, g, nu, opts = {}) {
  const { box, cylY, U: un, diff } = H(K);
  const { W, OPEN, FL_W, TOL, HOLE_X, HOLE_Z, M6_D, TRAY_Z } = g;
  const t = g.FT;
  const h = nu * U - 0.8;
  const body = un([box(0, -t, 0, W, t, h), box(FL_W + TOL, 0, 0, OPEN - 2 * TOL, 6, 4), box(FL_W + TOL, 0, h - 4, OPEN - 2 * TOL, 6, 4)]);
  const cuts = [];
  for (let u = 0; u < nu; u++) for (const hz of HOLE_Z) for (const x of [HOLE_X, W - HOLE_X])
    cuts.push(K.hull([cylY(x - 1.5, -t - 1, u * U + hz, M6_D, t + 2), cylY(x + 1.5, -t - 1, u * U + hz, M6_D, t + 2)]));
  if (opts.trayHoles) for (const x of trayTabX(g)) cuts.push(cylY(x, -t - 1, TRAY_Z + 8, 3.4, t + 8));
  if (opts.window) {
    const [ww, wh] = opts.window;
    cuts.push(box((W - ww) / 2, -t - 1, (h - wh) / 2, ww, t + 2, wh));
  }
  if (opts.extra) cuts.push(...opts.extra(h, t));
  return { solid: diff(body, cuts), h };
}

function ventRows(K, g, h, t, x0, len, opts = {}) {
  const { cylY } = H(K);
  const pitch = opts.pitch || 14, m = opts.margin || 16, d = opts.d || 6;
  const out = [];
  const n = Math.max(0, Math.floor((h - 2 * m) / pitch) + 1);
  const z0 = (h - (n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) out.push(K.hull([cylY(x0, -t - 1, z0 + i * pitch, d, t + 2), cylY(x0 + len, -t - 1, z0 + i * pitch, d, t + 2)]));
  return out;
}

function trayTabX(g) {
  return g.is19 ? [60, g.W / 2, g.W - 60] : [60, g.W - 60];
}

function tray(K, g, lip = 15) {
  const { box, cylY, U: un, diff } = H(K);
  const { FL_W, TOL, OPEN, W, D } = g;
  const parts = [box(FL_W + TOL, 0, 0, OPEN - 2 * TOL, D, 3)];
  for (const x of [FL_W + TOL, W - FL_W - TOL - 3]) parts.push(box(x, 0, 0, 3, D, lip));
  const tx = trayTabX(g);
  for (const y of [0, D - 6]) for (const x of tx) parts.push(box(x - 8, y, 0, 16, 6, 14));
  const cuts = [];
  for (const y of [-1, D - 7]) for (const x of tx) cuts.push(cylY(x, y, 8, 3.2, 9));
  const rows = Math.max(0, Math.floor((D - 50) / 21) + 1);
  for (let i = 0; i < rows; i++)
    cuts.push(K.hull([box(FL_W + 30 - 3.5, 25 + i * 21 - 3.5, -1, 7, 7, 5), box(FL_W + OPEN - 30 - 3.5, 25 + i * 21 - 3.5, -1, 7, 7, 5)]));
  return diff(un(parts), cuts);
}

function stops(K, g, sz, y0 = 30) {
  const { box, U: un } = H(K);
  const x0 = (g.W - sz[0]) / 2;
  const L = Math.min(30, sz[1] / 2 - 2);
  return un([[x0 - 6, y0], [x0 + sz[0] + 1, y0], [x0 - 6, y0 + sz[1] - L], [x0 + sz[0] + 1, y0 + sz[1] - L]]
    .map(p => box(p[0], p[1], 0, 5, L, 12)));
}

function mbPlate(K, g) {
  const { box, cylX, cylZ, U: un, diff } = H(K);
  const { D } = g;
  const ph = MB[0] + 8;
  const my = (p) => D - 2 - 3 - p[1], mz = (p) => MB_Z0 + p[0];
  const parts = [box(0, 0, 0, 4, D - 2, ph), box(0, 0, 0, 30, D - 2, 4)];
  for (const p of MB_HOLES) parts.push(cylX(0, my(p), mz(p), 9, 4 + STANDOFF));
  for (const y of [40, D / 2, D - 45]) parts.push(K.tr(K.rot(K.prism([[0, 0], [11, 0], [0, 9]], 4), [90, 0, 0]), [0, y, 0]));
  const cuts = [];
  for (const p of MB_HOLES) cuts.push(cylX(-1, my(p), mz(p), 4.2, 20));
  cuts.push(box(-1, D - 145, 150, 6, 90, 85));
  for (const y of [45, D / 2 + 25, D - 50]) cuts.push(cylZ(18, y, -1, 3.4, 6));
  return diff(un(parts), cuts);
}

function sfxCradle(K, g) {
  const { box, U: un, diff } = H(K);
  const x0 = g.W - g.FL_W - 8 - SFX[2];
  const body = un([box(x0 - 4, 8, 0, SFX[2] + 8, SFX[1] + 8, 20), box(x0 - 4, 8, 0, 4, SFX[1] + 8, 60)]);
  const cuts = [box(x0, 12, 3, SFX[2] + 0.6, SFX[1] + 0.6, 30)];
  for (const z of [30, 45]) { cuts.push(box(x0 - 6, 20, z, 8, 20, 4)); cuts.push(box(x0 - 6, SFX[1] - 20, z, 8, 20, 4)); }
  return diff(body, cuts);
}

// ------------------------------------------------------------------
//  Corte con colas de milano (puzzle) para piezas que no caben en la cama
// ------------------------------------------------------------------
const AX = { x: 0, y: 1, z: 2 };
const TAB_ROT = { 'x,y': [0, 0, 0], 'x,z': [90, 0, 0], 'y,x': [0, 0, 90], 'y,z': [90, 0, 90], 'z,y': [0, -90, 0], 'z,x': [90, -90, 0] };

function tabSolid(K, cut, inn, c, v, tab, grow) {
  const { neck, head, depth } = tab;
  const pts = [[-2, -neck / 2 - grow], [depth + grow, -head / 2 - grow], [depth + grow, head / 2 + grow], [-2, neck / 2 + grow]];
  let s = K.tr(K.prism(pts, 4000), [0, 0, -2000]);
  s = K.rot(s, TAB_ROT[cut + ',' + inn]);
  const t = [0, 0, 0]; t[AX[cut]] = c; t[AX[inn]] = v;
  return K.tr(s, t);
}

export function puzzleSplit(K, solid, cut, cuts, inn, tabPos, tab = { neck: 9, head: 15, depth: 9 }, tol = 0.25) {
  const pieces = [];
  const BIG = 1e4;
  for (let i = 0; i <= cuts.length; i++) {
    const lo = i === 0 ? -BIG : cuts[i - 1], hi = i === cuts.length ? BIG : cuts[i];
    const sz = [2 * BIG, 2 * BIG, 2 * BIG], o = [-BIG, -BIG, -BIG];
    sz[AX[cut]] = hi - lo; o[AX[cut]] = lo;
    let region = K.tr(K.cube(sz), o);
    if (i < cuts.length) region = K.union([region, ...tabPos.map(v => tabSolid(K, cut, inn, hi, v, tab, 0))]);
    let p = K.inter(solid, region);
    if (i > 0) p = K.diff(p, tabPos.map(v => tabSolid(K, cut, inn, lo, v, tab, tol)));
    pieces.push(p);
  }
  return pieces;
}

export function fitsRect(a, b, bed) { return (a <= bed[0] && b <= bed[1]) || (a <= bed[1] && b <= bed[0]); }

// Elige nº de trozos (na x nb) mínimo para que quepa en la cama
export function planSplit(eA, eB, bed, tabDepth = 9) {
  let best = null;
  for (let na = 1; na <= 6; na++) for (let nb = 1; nb <= 6; nb++) {
    const sa = eA / na + (na > 1 ? tabDepth : 0), sb = eB / nb + (nb > 1 ? tabDepth : 0);
    if (fitsRect(sa, sb, bed) && (!best || na * nb < best.na * best.nb)) best = { na, nb };
  }
  return best || { na: 6, nb: 6, fail: true };
}

// ------------------------------------------------------------------
//  Lista de piezas para una configuración
// ------------------------------------------------------------------
//  Cada pieza: { id, name, group, color, sig, qty, build(K) -> solid,
//    print: { rot:[..] }, plane: [a,b] | null, inst: [{t:[..], s:[..]}] }
export const COLORS = { frame: '#e0782c', frame2: '#f0a868', face: '#f3b27a', tray: '#e9893c', acc: '#c65f1a', metal: '#9aa1a8' };

export function wallSegments(cfg, g) {
  const bed = cfg.bed;
  let maxU = 1;
  for (let n = 1; n <= 30; n++) {
    let ok = false;
    for (let na = 1; na <= 4 && !ok; na++) ok = fitsRect((g.D - 8) / na + (na > 1 ? 9 : 0), n * U, bed);
    if (ok) maxU = n; else break;
  }
  const k = Math.ceil(g.NU / maxU);
  const base = Math.floor(g.NU / k), rem = g.NU % k;
  const segs = []; for (let i = 0; i < k; i++) segs.push(base + (i < rem ? 1 : 0));
  return segs;
}

export function moduleLayout(cfg) {
  let u = 1;
  return cfg.modules.map((m, i) => { const r = { m, i, u0: u }; u += m.u; return r; });
}

export function deviceWarnings(cfg, g) {
  const w = [];
  for (const { m, u0 } of moduleLayout(cfg)) {
    const tag = `U${u0}${m.u > 1 ? '–' + (u0 + m.u - 1) : ''} ${MODULE_TYPES[m.type].short}`;
    if (m.dev) {
      const [dw, dd, dh] = m.dev;
      if (dw > g.OPEN - 2 * g.TOL - 6) w.push(`${tag}: ${dw} mm de ancho no cabe entre los laterales de la bandeja (máx. ${Math.floor(g.OPEN - 2 * g.TOL - 6)} mm). Mide el equipo o usa el estándar de 19".`);
      if (dd > g.D - 20) w.push(`${tag}: ${dd} mm de fondo supera el fondo útil (${g.D - 20} mm). Aumenta el fondo del rack.`);
      if (dh > m.u * U - g.TRAY_Z - 3 - 5) w.push(`${tag}: ${dh} mm de alto necesita al menos ${Math.ceil((dh + g.TRAY_Z + 8) / U)}U.`);
    }
    if (m.type === 'compute') {
      if (m.u * U < MB[0] + 8 + g.TRAY_Z + 3 + 2) w.push(`${tag}: la placa micro-ATX vertical necesita 6U.`);
      if (g.D < 250) w.push(`${tag}: la placa de 244 mm necesita un fondo de al menos 250 mm.`);
    }
    if (m.type === 'storage' && g.D < HDD_MOD[1] + 50) w.push(`${tag}: los módulos de disco de 3,5" necesitan ~${HDD_MOD[1] + 50} mm de fondo.`);
  }
  return w;
}

export function buildPartList(cfg) {
  const g = derive(cfg);
  const P = [];
  const gsig = [cfg.std, g.D, g.WALL, g.FT].join('|');
  const { W, D, Z0, NU, POCKET, PLATE_T } = g;

  // --- Estructura -------------------------------------------------
  const segs = wallSegments(cfg, g);
  const segZ = []; { let z = Z0; for (const s of segs) { segZ.push(z); z += s * U; } }
  const uniq = [...new Set(segs)];
  for (const nu of uniq) {
    const zs = segs.map((s, i) => s === nu ? segZ[i] : null).filter(z => z !== null);
    P.push({ id: `pared_${nu}u_izq`, name: `Pared lateral ${nu}U izquierda`, group: 'Estructura', color: COLORS.frame,
      sig: `wall|${gsig}|${nu}|L`, build: K => sideWall(K, g, nu).solid, print: [0, -90, 0], plane: ['y', 'z'],
      inst: zs.map(z => ({ t: [0, 0, z] })), fan: { surf: 'left', n: 'x', n0: g.RT, th: g.WALL, hb: nu * U } });
    P.push({ id: `pared_${nu}u_der`, name: `Pared lateral ${nu}U derecha`, group: 'Estructura', color: COLORS.frame,
      sig: `wall|${gsig}|${nu}|R`, build: K => K.mir(sideWall(K, g, nu).solid, [1, 0, 0]), print: [0, 90, 0], plane: ['y', 'z'],
      inst: zs.map(z => ({ t: [W, 0, z] })), fan: { surf: 'right', n: 'x', n0: -g.RT - g.WALL, th: g.WALL, hb: nu * U } });
  }
  const cornerInst = [];
  for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = mx < 0 ? W : 0, ty = my < 0 ? D : 0;
    cornerInst.push({ t: [tx, ty, PLATE_T], s: [mx, my, 1] });
    cornerInst.push({ t: [tx, ty, Z0 + NU * U - POCKET], s: [mx, my, -1] });
  }
  P.push({ id: 'bloque_esquina', name: 'Bloque de esquina', group: 'Estructura', color: COLORS.acc, sig: `cb|${gsig}`,
    build: K => cornerBlock(K, g), print: [0, 0, 0], plane: null, inst: cornerInst });
  P.push({ id: 'tapa_inferior', name: 'Tapa inferior', group: 'Estructura', color: COLORS.acc, sig: `pb|${gsig}`,
    build: K => plateFull(K, g, false), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, 0] }], explode: [0, 0, -1], fan: { surf: 'bottom', n: 'z', n0: 0, th: PLATE_T } });
  P.push({ id: 'tapa_superior', name: 'Tapa superior', group: 'Estructura', color: COLORS.acc, sig: `pt|${gsig}`,
    build: K => plateFull(K, g, true), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, Z0 + NU * U - POCKET] }], explode: [0, 0, 1], fan: { surf: 'top', n: 'z', n0: 0, th: PLATE_T } });
  P.push({ id: 'pata', name: 'Pata', group: 'Estructura', color: '#3a3a3a', sig: 'foot', build: K => foot(K), print: [0, 0, 0], plane: null,
    inst: [[28, 40], [W - 28, 40], [28, D - 40], [W - 28, D - 40]].map(([x, y]) => ({ t: [x, y, -12] })), explode: [0, 0, -1.5] });

  // --- Módulos ------------------------------------------------------
  const maxFaceU = Math.max(1, Math.floor((Math.max(cfg.bed[0], cfg.bed[1]) + 0.8) / U));
  const rearAgg = new Map();
  for (const { m, i, u0 } of moduleLayout(cfg)) {
    const z = g.uz(u0);
    const T = MODULE_TYPES[m.type];
    const grp = `U${u0}${m.u > 1 ? '–' + (u0 + m.u - 1) : ''} · ${T.short}`;
    const key = `m${i}_${m.type}`;
    const face = (optsFn, name, extraSig) => P.push({ id: `${key}_frontal`, name, group: grp, color: COLORS.face,
      sig: `face|${gsig}|${m.u}|${extraSig}`, build: K => facePlate(K, g, m.u, optsFn(K)).solid, print: [90, 0, 0], plane: ['x', 'z'],
      inst: [{ t: [0, 0, z] }], explode: [0, -1, 0], fan: { surf: 'front', n: 'y', n0: -g.FT, th: g.FT, hb: m.u * U - 0.8 } });
    const trayPart = (lip = 15) => P.push({ id: `${key}_bandeja`, name: 'Bandeja', group: grp, color: COLORS.tray,
      sig: `tray|${gsig}|${lip}`, build: K => tray(K, g, lip), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, z + g.TRAY_Z] }] });
    if (T.tray) {
      // traseras en tramos imprimibles
      let left = m.u, zz = z;
      while (left > 0) {
        const n = Math.min(left, maxFaceU, left > maxFaceU && left - maxFaceU < 2 ? Math.ceil(left / 2) : 99);
        const k = `trasera_${n}u`;
        if (!rearAgg.has(k)) rearAgg.set(k, { n, inst: [] });
        rearAgg.get(k).inst.push({ t: [0, D, zz], s: [1, -1, 1] });
        left -= n; zz += n * U;
      }
    }
    if (m.type === 'storage') {
      face(K => ({ trayHoles: true, extra: (h, t) => storageCuts(g, h, t, K) }), 'Frontal almacenamiento (ventilador 80 mm)', 'st');
      trayPart();
    } else if (m.type === 'compute') {
      face(K => ({ trayHoles: true, extra: (h, t) => computeCuts(g, h, t, m.button, K) }), 'Frontal cómputo (rejilla + pulsador)', 'cp' + (m.button ? 'b' : ''));
      trayPart(10);
      P.push({ id: `${key}_placa_montaje`, name: 'Placa de montaje de la placa base', group: grp, color: COLORS.acc,
        sig: `mb|${gsig}`, build: K => mbPlate(K, g), print: [0, -90, 0], plane: ['y', 'z'],
        inst: [{ t: [g.FL_W + g.TOL + 3, 0, z + g.TRAY_Z + 3] }] });
      P.push({ id: `${key}_cuna_sfx`, name: 'Cuna fuente SFX', group: grp, color: COLORS.acc, sig: `sfx|${gsig}`,
        build: K => sfxCradle(K, g), print: [0, 0, 0], plane: null, inst: [{ t: [0, 0, z + g.TRAY_Z + 3] }] });
    } else if (m.type === 'mini' || m.type === 'router' || m.type === 'shelf') {
      const faceH = m.u * U - 0.8;
      const win = [Math.min(m.dev[0] + 13, g.OPEN - 12), Math.max(10, Math.min(m.dev[2] + 26, faceH - 22))];
      face(() => ({ trayHoles: true, window: win }), `Frontal con ventana ${Math.round(win[0])}×${Math.round(win[1])}`, `w${win.join('x')}`);
      trayPart();
      if (m.type === 'mini' || m.type === 'shelf') {
        const y0 = Math.max(10, Math.min(30, D - m.dev[1] - 12));
        P.push({ id: `${key}_topes`, name: `Topes para ${m.label || 'equipo'}`, group: grp, color: COLORS.acc,
          sig: `stops|${gsig}|${m.dev.join('x')}|${y0}`, build: K => stops(K, g, m.dev, y0), print: [0, 0, 0], plane: null,
          inst: [{ t: [0, 0, z + g.TRAY_Z + 3] }] });
      }
    } else if (m.type === 'patch') {
      const n = Math.max(1, Math.min(m.keystones || 8, Math.floor((g.OPEN - 10) / 25)));
      face(K => ({ extra: (h, t) => keystoneCuts(K, g, h, t, n) }), `Patch panel ${n} keystones`, `ks${n}`);
    } else if (m.type === 'blank') {
      face(K => ({ extra: (h, t) => ventRows(K, g, h, t, 40, g.W - 80, { margin: 12 }) }), `Tapa ventilada ${m.u}U`, 'blank');
    }
  }
  for (const [k, r] of rearAgg) {
    P.push({ id: k, name: `Trasera ${r.n}U (paso de cables)`, group: 'Traseras', color: COLORS.face, sig: `rear|${gsig}|${r.n}`,
      build: K => facePlate(K, g, r.n, { trayHoles: true, window: [g.OPEN - 30, r.n * U - 22] }).solid, print: [90, 0, 0], plane: ['x', 'z'],
      inst: r.inst, explode: [0, 1, 0], fan: { surf: 'rear', n: 'y', n0: -g.FT, th: g.FT, hb: r.n * U - 0.8 } });
  }
  return { parts: applyFans(P, cfg, g), g, segs };
}

function storageCuts(g, h, t, K) {
  if (!K) return [];
  const { cylY, U: un } = H(K);
  const cx = g.W - g.FL_W - 62, cz = h / 2;
  const out = [];
  const fc = fanCut(K, 80, t);
  out.push(K.tr(K.rot(fc, [-90, 0, 0]), [cx, -t, cz]));
  out.push(...ventRows(K, g, h, t, 34, Math.max(20, cx - 34 - 60), { pitch: 16, margin: 20 }));
  return out;
}

function computeCuts(g, h, t, button, K) {
  if (!K) return [];
  const { cylY } = H(K);
  const out = ventRows(K, g, h, t, 40, Math.min(150, g.W - 140), { pitch: 14, margin: 22 });
  if (button) {
    const bx = g.W - g.FL_W - 36;
    out.push(cylY(bx, -t - 1, h - 40, 16.2, t + 2));
    out.push(cylY(bx, -t - 1, h - 65, 5.2, t + 2));
  }
  return out;
}

function keystoneCuts(K, g, h, t, n) {
  const { box } = H(K);
  const out = [];
  for (let i = 0; i < n; i++) out.push(box(g.W / 2 - (n - 1) / 2 * 25 + i * 25 - 7.45, -t - 1, (h - 16.5) / 2, 14.9, t + 2, 16.5));
  return out;
}

// Maquetas para la vista (no se imprimen): cajas [x,y,z,sx,sy,sz,color,etiqueta]
export function mockups(cfg, g) {
  const out = [];
  for (const { m, u0 } of moduleLayout(cfg)) {
    const z = g.uz(u0) + g.TRAY_Z + 3;
    if (m.dev) {
      const y0 = m.type === 'router' ? Math.max(10, Math.min(50, g.D - m.dev[1] - 12)) : Math.max(10, Math.min(30, g.D - m.dev[1] - 12));
      const col = m.type === 'router' ? '#eeeeec' : m.type === 'mini' ? '#3b3e44' : '#6c7a89';
      out.push([(g.W - m.dev[0]) / 2, y0, z, ...m.dev, col, m.label]);
    }
    if (m.type === 'storage') {
      for (let i = 0; i < (m.hdd || 0); i++) out.push([30, 40, z + i * HDD_MOD[2], HDD_MOD[0], HDD_MOD[1], HDD_MOD[2] - 1, '#3a7fc4', 'HDD 3,5"']);
      for (let i = 0; i < (m.ssd || 0); i++) out.push([g.W - g.FL_W - 95, 120, z + i * SSD_MOD[2], SSD_MOD[0], SSD_MOD[1], SSD_MOD[2] - 0.8, '#8a63c9', 'SSD 2,5"']);
      out.push([g.W - g.FL_W - 102, 4, g.uz(u0) + (m.u * U - 80) / 2, 80, 25, 80, '#222222', 'Ventilador 80 mm']);
    }
    if (m.type === 'compute') {
      const bx = g.FL_W + g.TOL + 3 + 4 + STANDOFF;
      out.push([bx, g.D - 3 - MB[1], z + MB_Z0, 1.6, MB[1], MB[0], '#2f6b3a', 'Placa HP IPM17-002']);
      out.push([bx + 1.6, g.D - 3 - 48 - 96, z + MB_Z0 + 132, 52, 96, 96, '#555555', 'Disipador']);
      out.push([g.W - g.FL_W - 8 - SFX[2], 12, z + 3, SFX[2], SFX[1], SFX[0], '#5a5f66', 'Fuente SFX']);
      for (let i = 0; i < (m.ssd || 0); i++) out.push([g.W - g.FL_W - 8 - SSD_MOD[0], 130, z + i * SSD_MOD[2], SSD_MOD[0], SSD_MOD[1], SSD_MOD[2] - 0.8, '#8a63c9', 'SSD 2,5"']);
    }
  }
  return out;
}

export function hardware(cfg, g, parts) {
  const faces = parts.filter(p => /_frontal$|^trasera_/.test(p.id)).reduce((s, p) => s + p.inst.length, 0);
  const trays = parts.filter(p => /_bandeja$/.test(p.id)).length;
  const tabs = trayTabX(g).length;
  const walls = wallSegments(cfg, g);
  let wallBolts = 0;
  for (const nu of walls) { let n = 2; for (let k = 1; k <= nu - 1; k += 2) n++; wallBolts += 2 * 2 * n; }
  const compute = cfg.modules.filter(m => m.type === 'compute').length;
  return [
    [`Raíles de rack metálicos de ${g.NU}U (perfil en L, agujero cuadrado)`, 4],
    ['Tuercas enjauladas M6 + tornillos M6×12 (4 por frontal/trasera)', faces * 4],
    ['Tornillos M4×10 pared–raíl (taladrar ala del raíl a 4,5 mm)', wallBolts],
    ['Insertos roscados M4 (bloques de esquina y patas)', 8 * 2 + 4],
    ['Tornillos M4×16 avellanados tapa–bloque', 8],
    ['Tornillos M4×20 para patas', 4],
    ['Tornillos M3×10 + tuerca, bandeja–frontal/trasera', trays * tabs * 2],
    ['Espigas de 6×20 mm entre tramos de pared', Math.max(0, walls.length - 1) * 2 * 2],
    ...Object.entries((cfg.fans || []).reduce((o, f) => (o[f.s] = (o[f.s] || 0) + 1, o), {})).map(([sz, n]) => [`Ventilador de ${sz} mm (+4 tornillos de ventilador o M${sz <= 40 ? 3 : 4})`, n]),
    ...(compute ? [['Insertos M3 + tornillos M3×8 para la placa base', 8 * compute], ['Tornillos M3×10 placa de montaje–bandeja', 3 * compute]] : []),
  ];
}


// ------------------------------------------------------------------
//  Ventiladores colocados por el usuario (cfg.fans)
//  fan = { surf: front|rear|left|right|top|bottom, a, b, s }
//  front/rear: a = x, b = z · left/right: a = y, b = z · top/bottom: a = x, b = y   (coords de montaje)
// ------------------------------------------------------------------
export const FAN_SIZES = { 40: 32, 60: 50, 80: 71.5, 92: 82.5, 120: 105, 140: 124.5 };
export const SURF_NAMES = { front: 'frontal', rear: 'trasera', left: 'lateral izq.', right: 'lateral der.', top: 'tapa superior', bottom: 'tapa inferior' };

// Rejilla en el plano XY (normal +Z), centrada en el origen, z de -1 a th+1
function fanCut(K, S, th) {
  const { cylZ, box } = H(K);
  const hs = FAN_SIZES[S] || S * 0.85;
  const rings = [];
  const rMax = S / 2 - 2.5;
  rings.push(cylZ(0, 0, -1, Math.min(14, S * 0.22), th + 2));
  for (let r = Math.min(7, S * 0.11) + 3; r + 3 <= rMax; r += 7) rings.push(K.diff(cylZ(0, 0, -1, 2 * (r + 4), th + 2), [cylZ(0, 0, -2, 2 * r, th + 4)]));
  const spokes = [box(-1.6, -S, -3, 3.2, 2 * S, th + 6), box(-S, -1.6, -3, 2 * S, 3.2, th + 6)];
  const grill = K.diff(K.union(rings), spokes);
  const holes = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) holes.push(cylZ(sx * hs / 2, sy * hs / 2, -1, S <= 40 ? 3.4 : 4.4, th + 2));
  return K.union([grill, ...holes]);
}
function fanPad(K, S, th) { return K.tr(K.cube([S + 6, S + 6, th]), [-S / 2 - 3, -S / 2 - 3, 0]); }
function placeOnSurf(K, s, fr, la, lb) {
  if (fr.n === 'y') return K.tr(K.rot(s, [-90, 0, 0]), [la, fr.n0, lb]);
  if (fr.n === 'x') return K.tr(K.rot(s, [0, 90, 0]), [fr.n0, la, lb]);
  return K.tr(s, [la, lb, fr.n0]);
}
function fanLocal(f, inst, fr) {
  if (fr.n === 'y') return [f.a - inst.t[0], f.b - inst.t[2]];
  if (fr.n === 'x') return [f.a - inst.t[1], f.b - inst.t[2]];
  return [f.a, f.b];
}
// Zona donde puede ir el centro de un ventilador de tamaño S en una superficie (coords locales de la pieza)
export function fanBounds(fr, g, S) {
  const m = S / 2 + 3;
  if (fr.n === 'y') return { a: [g.FL_W + m + 1, g.W - g.FL_W - m - 1], b: [m, fr.hb - m] };
  if (fr.n === 'x') return { a: [g.RS + 2 + m, g.D - g.RS - 2 - m], b: [6 + m, fr.hb - 6 - m] };
  return { a: [g.RF + 3 + m, g.W - g.RF - 3 - m], b: [g.RS + 3 + m, g.D - g.RS - 3 - m] };
}
// Ajusta un punto de clic (coords de montaje) a una posición válida; null si no cabe
export function snapFan(part, inst, g, S, a, b) {
  const fr = part.fan; if (!fr) return null;
  const bd = fanBounds(fr, g, S);
  if (bd.a[0] > bd.a[1] || bd.b[0] > bd.b[1]) return null;
  const [la, lb] = fanLocal({ a, b }, inst, fr);
  const ca = Math.min(bd.a[1], Math.max(bd.a[0], la)), cb = Math.min(bd.b[1], Math.max(bd.b[0], lb));
  const off = fr.n === 'y' ? [inst.t[0], inst.t[2]] : fr.n === 'x' ? [inst.t[1], inst.t[2]] : [0, 0];
  return { surf: fr.surf, a: Math.round((ca + off[0]) * 2) / 2, b: Math.round((cb + off[1]) * 2) / 2, s: S };
}
// Posición 3D (centro y normal) de un ventilador para la maqueta
export function fanPose(f, g) {
  const top = g.Z0 + g.NU * U - g.POCKET;
  switch (f.surf) {
    case 'front': return { c: [f.a, 12.5, f.b], n: 'y' };
    case 'rear': return { c: [f.a, g.D - 12.5, f.b], n: 'y' };
    case 'left': return { c: [g.RT + g.WALL + 12.5, f.a, f.b], n: 'x' };
    case 'right': return { c: [g.W - g.RT - g.WALL - 12.5, f.a, f.b], n: 'x' };
    case 'top': return { c: [f.a, f.b, top - 12.5], n: 'z' };
    case 'bottom': return { c: [f.a, f.b, g.PLATE_T + 12.5], n: 'z' };
  }
}

function applyFans(P, cfg, g) {
  const fans = cfg.fans || [];
  if (!fans.length) return P;
  const out = [];
  for (const p of P) {
    if (!p.fan) { out.push(p); continue; }
    const fr = p.fan, groups = new Map();
    for (const inst of p.inst) {
      const list = [];
      for (const f of fans) {
        if (f.surf !== fr.surf) continue;
        const [la, lb] = fanLocal(f, inst, fr);
        const bd = fanBounds(fr, g, f.s);
        if (la >= bd.a[0] - 0.6 && la <= bd.a[1] + 0.6 && lb >= bd.b[0] - 0.6 && lb <= bd.b[1] + 0.6) list.push([+la.toFixed(1), +lb.toFixed(1), f.s]);
      }
      const k = JSON.stringify(list);
      if (!groups.has(k)) groups.set(k, { list, inst: [] });
      groups.get(k).inst.push(inst);
    }
    let n = 0;
    for (const { list, inst } of groups.values()) {
      if (!list.length) { out.push({ ...p, inst }); continue; }
      n++;
      const base = p.build;
      out.push({ ...p, inst, id: `${p.id}_vent${groups.size > 1 || n > 1 ? n : ''}`, name: `${p.name} · ${list.length} vent. ${list.map(l => l[2]).join('+')} mm`,
        sig: p.sig + '|fans' + JSON.stringify(list), fans: list,
        build: K => {
          const s = base(K);
          const pads = list.map(([la, lb, S]) => placeOnSurf(K, fanPad(K, S, fr.th), fr, la, lb));
          const cuts = list.map(([la, lb, S]) => placeOnSurf(K, fanCut(K, S, fr.th), fr, la, lb));
          return K.diff(K.union([s, ...pads]), cuts);
        } });
    }
  }
  return out;
}
