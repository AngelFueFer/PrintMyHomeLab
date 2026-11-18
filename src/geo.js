// ===================================================================
//  Geometría paramétrica del mini-rack v2
//  Raíles de esquina + tapas independientes (diseño 2D) + baldas libres
//  Ejes: X ancho (0 = lateral izq.), Y fondo (0 = frente), Z alto. mm.
// ===================================================================
export const U = 44.45;

export const SIDES = { front: 'Frontal', rear: 'Trasera', left: 'Lateral izquierdo', right: 'Lateral derecho', top: 'Tapa superior' };
export const SIDE_SHORT = { front: 'Frontal', rear: 'Trasera', left: 'Lat. izq.', right: 'Lat. der.', top: 'Superior' };

export const TEMPLATES = {
  lisa: 'Lisa',
  ranuras: 'Ranuras',
  panal: 'Panal hexagonal',
  agujeros: 'Rejilla de agujeros',
  ventilador: 'Ventilador centrado',
  vent_ranuras: 'Ventilador + ranuras',
  ventana: 'Ventana / paso de cables',
  patch: 'Patch panel (keystone)',
};

export const SHAPE_TYPES = {
  fan: 'Ventilador', circle: 'Agujero redondo', rect: 'Rectángulo', slot: 'Ranura',
  slots: 'Zona de ranuras', hex: 'Zona de panal', holes: 'Rejilla de agujeros', keystone: 'Keystones',
};

export const SHELF_TYPES = {
  bandeja: { name: 'Bandeja genérica', short: 'Bandeja' },
  mini: { name: 'Mini PC con topes', short: 'Mini PC' },
  router: { name: 'Router / switch', short: 'Router' },
  discos: { name: 'Discos 3,5″ y 2,5″', short: 'Discos' },
  placa: { name: 'Placa base vertical + fuente SFX', short: 'Placa base' },
};

export const FAN_SIZES = { 40: 32, 60: 50, 80: 71.5, 92: 82.5, 120: 105, 140: 124.5 };

let _n = 0;
export const uid = () => Math.random().toString(36).slice(2, 6) + (_n++).toString(36);
const r05 = (v) => Math.round(v * 2) / 2;

export function defaultShelf(type, u) {
  const s = { id: uid(), u, type };
  if (type === 'bandeja') Object.assign(s, { dev: [150, 150, 40], label: 'Equipo' });
  if (type === 'mini') Object.assign(s, { dev: [177, 175, 34], label: 'Mini PC' });
  if (type === 'router') Object.assign(s, { dev: [220, 160, 40], label: 'Router' });
  if (type === 'discos') Object.assign(s, { hdd: 3, ssd: 2 });
  if (type === 'placa') Object.assign(s, { ssd: 4 });
  return s;
}

export function defaultConfig() {
  const cfg = {
    v: 2, std: '10', depth: 250, NU: 14, wall: 3, faceT: 4, rails: 'metal',
    bed: [250, 220, 256], bedPreset: 'mine', bedMargin: 2,
    showDevices: true, showRails: true,
    shelves: [
      defaultShelf('discos', 1), defaultShelf('placa', 4),
      { ...defaultShelf('mini', 10), label: 'HP EliteDesk 800 Mini' },
      { ...defaultShelf('router', 12), label: 'Router Digi' },
    ],
    panels: [],
  };
  cfg.panels = defaultPanels(cfg);
  return cfg;
}

export function makePanel(cfg, side, u0, nu, tpl) {
  const p = { id: uid(), side, u0, nu, tpl, auto: true, shapes: [] };
  p.shapes = templateShapes(tpl, p, derive(cfg));
  return p;
}

export function defaultPanels(cfg) {
  const g = derive(cfg);
  const P = [];
  const ranges = g.NU === 14
    ? [[1, 3, 'vent_ranuras'], [4, 3, 'ranuras'], [7, 3, 'ranuras'], [10, 2, 'ventana'], [12, 2, 'ventana'], [14, 1, 'patch']]
    : chunks(g.NU, 3).map(([u0, n]) => [u0, n, 'ranuras']);
  for (const [u0, n, t] of ranges) P.push(makePanel(cfg, 'front', u0, n, t));
  for (const [u0, n] of ranges) P.push(makePanel(cfg, 'rear', u0, n, 'ventana'));
  const ecfg = { ...cfg, bed: [cfg.bed[0] - 2 * (cfg.bedMargin || 0), cfg.bed[1] - 2 * (cfg.bedMargin || 0), cfg.bed[2]] };
  let u = 1;
  for (const n of wallSegments(ecfg, g)) {
    P.push(makePanel(cfg, 'left', u, n, 'ranuras'));
    P.push(makePanel(cfg, 'right', u, n, 'ranuras'));
    u += n;
  }
  P.push(makePanel(cfg, 'top', 1, 1, 'ranuras'));
  return P;
}
function chunks(N, k) { const out = []; let u = 1; while (u <= N) { const n = Math.min(k, N - u + 1); out.push([u, n]); u += n; } return out; }

export function derive(cfg) {
  const is19 = cfg.std === '19';
  const W = is19 ? 482.6 : 254;
  const OPEN = is19 ? 450.85 : 222.25;
  const HOLE_X = (W - (is19 ? 465.1 : 236.525)) / 2;
  const D = cfg.depth;
  const NU = Math.max(1, Math.round(cfg.NU || 1));
  const printed = cfg.rails === 'print';
  const RF = 15.8, RS = 20, RT = printed ? 5 : 2, SQ = 9.5, WALL = cfg.wall || 3, PLATE_T = 8, POCKET = 3, TOL = 0.3;
  const FL_W = (W - OPEN) / 2;
  const CB_X0 = RT + WALL + 0.3, CB_Y0 = 9;
  const CB = [RF - CB_X0, 26, 30];
  const Z0 = PLATE_T - POCKET;
  return { is19, W, OPEN, HOLE_X, D, NU, RF, RS, RT, SQ, WALL, PLATE_T, POCKET, TOL, FL_W, CB_X0, CB_Y0, CB, Z0, printed,
    BOLT_Y: 15, M6_D: 6.6, HOLE_Z: [6.35, 22.225, 38.1], FT: cfg.faceT || 4, TRAY_Z: 4,
    uz: (u) => Z0 + (u - 1) * U, H: Z0 + NU * U - POCKET + PLATE_T, TOPZ: Z0 + NU * U - POCKET };
}

const MB = [244, 244];
const MB_HOLES = [[35,10],[79,10],[236.5,27],[12,165],[79,165],[236.5,165],[79,230],[238,228]];
const SFX = [125, 100, 63.5];
const HDD_MOD = [112, 165, 34], SSD_MOD = [80, 110, 15];
const STANDOFF = 8, MB_Z0 = 10;

// ------------------------------------------------------------------
//  Tapas: medidas, zona útil y plantillas (coordenadas 2D a,b vistas desde fuera)
// ------------------------------------------------------------------
export function panelDims(p, g) {
  if (p.side === 'front' || p.side === 'rear') return { Lw: g.W, Lh: p.nu * U - 0.8 };
  if (p.side === 'left' || p.side === 'right') return { Lw: g.D, Lh: p.nu * U };
  return { Lw: g.W, Lh: g.D };
}
export function safeArea(p, g) {
  const { Lw, Lh } = panelDims(p, g);
  if (p.side === 'front' || p.side === 'rear') return { a0: g.FL_W + 4, a1: Lw - g.FL_W - 4, b0: 5, b1: Lh - 5 };
  if (p.side === 'left' || p.side === 'right') return { a0: g.RS + g.RT + 6, a1: Lw - g.RS - g.RT - 6, b0: 8, b1: Lh - 8 };
  const m = g.RT + g.WALL + 20;
  return { a0: m, a1: Lw - m, b0: 45, b1: Lh - 45 };
}

export function templateShapes(tpl, p, g) {
  const { a0, a1, b0, b1 } = safeArea(p, g);
  const w = a1 - a0, h = b1 - b0, cx = r05((a0 + a1) / 2), cy = r05((b0 + b1) / 2);
  if (w < 12 || h < 8) return [];
  const fitFan = (maxd) => [140, 120, 92, 80, 60, 40].find(s => s + 2 <= maxd);
  switch (tpl) {
    case 'ranuras': return [{ t: 'slots', x: cx, y: cy, w: r05(w - 8), h: r05(h - 2), sw: 6, pitch: 13, dir: 'h' }];
    case 'panal': return [{ t: 'hex', x: cx, y: cy, w: r05(w - 4), h: r05(h - 2), cell: 10, web: 2.4 }];
    case 'agujeros': return [{ t: 'holes', x: cx, y: cy, w: r05(w - 4), h: r05(h - 2), d: 5, pitch: 8 }];
    case 'ventilador': { const s = fitFan(Math.min(w, h)); return s ? [{ t: 'fan', x: cx, y: cy, s }] : []; }
    case 'vent_ranuras': {
      const s = fitFan(Math.min(w * 0.55, h));
      if (!s) return templateShapes('ranuras', p, g);
      const fx = r05(a1 - s / 2 - 6);
      const out = [{ t: 'fan', x: fx, y: cy, s }];
      const sw = fx - s / 2 - 10 - a0;
      if (sw > 20) out.push({ t: 'slots', x: r05(a0 + 2 + sw / 2), y: cy, w: r05(sw), h: r05(h - 2), sw: 6, pitch: 13, dir: 'h' });
      return out;
    }
    case 'ventana': return [{ t: 'rect', x: cx, y: cy, w: r05(w - 10), h: r05(Math.max(6, h - 6)), r: 4 }];
    case 'patch': { const n = Math.max(1, Math.min(8, Math.floor((w - 10) / 25))); return h >= 18 ? [{ t: 'keystone', x: cx, y: cy, n }] : []; }
    default: return [];
  }
}

// Primitivas 2D de una forma (se usan para dibujar el SVG y para el CSG)
//  {k:'c',x,y,d} círculo · {k:'r',x,y,w,h,r} rectángulo redondeado centrado · {k:'p',pts} polígono · {k:'f',x,y,s} ventilador
export function prims(s) {
  switch (s.t) {
    case 'circle': return [{ k: 'c', x: s.x, y: s.y, d: s.d }];
    case 'rect': return [{ k: 'r', x: s.x, y: s.y, w: s.w, h: s.h, r: Math.max(0, Math.min(s.r || 0, s.w / 2, s.h / 2)) }];
    case 'slot': return [{ k: 'r', x: s.x, y: s.y, w: s.w, h: s.h, r: Math.min(s.w, s.h) / 2 }];
    case 'slots': {
      const out = [], vert = s.dir === 'v', L = vert ? s.w : s.h, pitch = Math.max(s.sw + 1.2, s.pitch);
      const n = Math.max(0, Math.floor((L - s.sw) / pitch) + 1), off = (n - 1) * pitch / 2;
      for (let i = 0; i < n; i++) {
        const o = -off + i * pitch;
        out.push(vert ? { k: 'r', x: s.x + o, y: s.y, w: s.sw, h: s.h, r: s.sw / 2 } : { k: 'r', x: s.x, y: s.y + o, w: s.w, h: s.sw, r: s.sw / 2 });
      }
      return out;
    }
    case 'holes': {
      const out = [], pitch = Math.max(s.d + 1.2, s.pitch);
      const nx = Math.max(0, Math.floor((s.w - s.d) / pitch) + 1), ny = Math.max(0, Math.floor((s.h - s.d) / pitch) + 1);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
        out.push({ k: 'c', x: s.x + (i - (nx - 1) / 2) * pitch, y: s.y + (j - (ny - 1) / 2) * pitch, d: s.d });
      return out;
    }
    case 'hex': {
      const out = [], cell = Math.max(3, s.cell), R = cell / Math.sqrt(3), p = cell + Math.max(1, s.web), dy = p * Math.sqrt(3) / 2;
      const nj = Math.ceil(s.h / dy) + 1, ni = Math.ceil(s.w / p) + 1;
      for (let j = -nj; j <= nj; j++) {
        const y = s.y + j * dy, off = (Math.abs(j) % 2) ? p / 2 : 0;
        if (Math.abs(y - s.y) + R > s.h / 2) continue;
        for (let i = -ni; i <= ni; i++) {
          const x = s.x + i * p + off;
          if (Math.abs(x - s.x) + cell / 2 > s.w / 2) continue;
          const pts = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; pts.push([x + R * Math.cos(a), y + R * Math.sin(a)]); }
          out.push({ k: 'p', pts });
        }
      }
      return out;
    }
    case 'fan': return [{ k: 'f', x: s.x, y: s.y, s: s.s }];
    case 'keystone': {
      const out = []; for (let i = 0; i < s.n; i++) out.push({ k: 'r', x: s.x + (i - (s.n - 1) / 2) * 25, y: s.y, w: 14.9, h: 16.5, r: 0 });
      return out;
    }
  }
  return [];
}
export function shapeSize(s) {
  if (s.t === 'fan') return [s.s, s.s];
  if (s.t === 'circle') return [s.d, s.d];
  if (s.t === 'keystone') return [(s.n - 1) * 25 + 14.9, 16.5];
  return [s.w, s.h];
}
export function defaultShape(t, p, g) {
  const sa = safeArea(p, g), cx = r05((sa.a0 + sa.a1) / 2), cy = r05((sa.b0 + sa.b1) / 2);
  const w = sa.a1 - sa.a0, h = sa.b1 - sa.b0, mw = Math.min(w, 120), mh = Math.min(h, 80);
  switch (t) {
    case 'fan': { const s = [120, 92, 80, 60, 40].find(z => z + 2 <= Math.min(w, h)) || 40; return { t, x: cx, y: cy, s }; }
    case 'circle': return { t, x: cx, y: cy, d: Math.min(20, h - 2) };
    case 'rect': return { t, x: cx, y: cy, w: r05(mw * 0.6), h: r05(mh * 0.6), r: 3 };
    case 'slot': return { t, x: cx, y: cy, w: r05(mw * 0.6), h: 8 };
    case 'slots': return { t, x: cx, y: cy, w: r05(mw), h: r05(mh), sw: 6, pitch: 13, dir: 'h' };
    case 'hex': return { t, x: cx, y: cy, w: r05(mw), h: r05(mh), cell: 10, web: 2.4 };
    case 'holes': return { t, x: cx, y: cy, w: r05(mw), h: r05(mh), d: 5, pitch: 8 };
    case 'keystone': return { t, x: cx, y: cy, n: Math.max(1, Math.min(4, Math.floor((w - 10) / 25))) };
  }
}

// Ajusta el centro de un ventilador a la zona útil; null si no cabe
export function fitFan(p, g, S, a, b) {
  const sa = safeArea(p, g), m = S / 2 + 1;
  if (sa.a1 - sa.a0 < 2 * m || sa.b1 - sa.b0 < 2 * m) return null;
  return { t: 'fan', s: S, x: r05(Math.min(sa.a1 - m, Math.max(sa.a0 + m, a))), y: r05(Math.min(sa.b1 - m, Math.max(sa.b0 + m, b))) };
}

// Paso entre coordenadas de tapa (a,b) y de montaje. o = distancia hacia dentro.
export function panelToWorld(p, a, b, g, o = 0) {
  const zb = g.uz(p.u0);
  switch (p.side) {
    case 'front': return { c: [a, -g.FT + o, zb + b], n: 'y' };
    case 'rear': return { c: [g.W - a, g.D + g.FT - o, zb + b], n: 'y' };
    case 'left': return { c: [g.RT + o, g.D - a, zb + b], n: 'x' };
    case 'right': return { c: [g.W - g.RT - o, a, zb + b], n: 'x' };
    case 'top': return { c: [a, b, g.TOPZ + g.PLATE_T - o], n: 'z' };
  }
}
export function worldToPanel(p, pt, g) {
  const zb = g.uz(p.u0);
  switch (p.side) {
    case 'front': return [pt.x, pt.z - zb];
    case 'rear': return [g.W - pt.x, pt.z - zb];
    case 'left': return [g.D - pt.y, pt.z - zb];
    case 'right': return [pt.y, pt.z - zb];
    case 'top': return [pt.x, pt.y];
  }
}
export function fanPoses(cfg, g) {
  const out = [];
  for (const p of cfg.panels || []) for (const s of p.shapes) if (s.t === 'fan') out.push({ ...panelToWorld(p, s.x, s.y, g, 12.5 + (p.side === 'top' ? g.PLATE_T : p.side === 'left' || p.side === 'right' ? g.WALL : g.FT)), s: s.s });
  return out;
}

// Ajusta tapas y baldas tras cambiar medidas (recorta rangos, regenera plantillas no editadas)
export function syncConfig(cfg) {
  const g = derive(cfg);
  cfg.panels = (cfg.panels || []).filter(p => SIDES[p.side] && (p.side === 'top' || p.u0 <= g.NU));
  for (const p of cfg.panels) {
    if (p.side === 'top') { p.u0 = 1; p.nu = 1; }
    else { p.u0 = Math.max(1, Math.min(g.NU, Math.round(p.u0))); p.nu = Math.max(1, Math.min(g.NU - p.u0 + 1, Math.round(p.nu))); }
    if (p.auto) p.shapes = templateShapes(p.tpl, p, g);
  }
  cfg.shelves = (cfg.shelves || []).filter(s => SHELF_TYPES[s.type]);
  for (const s of cfg.shelves) s.u = Math.max(1, Math.min(g.NU, Math.round(s.u)));
  return cfg;
}
// Tapas que se pisan en el mismo lado
export function panelClashes(cfg) {
  const bad = new Set();
  const ps = cfg.panels || [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.side !== b.side) continue;
    if (a.side === 'top' || (a.u0 < b.u0 + b.nu && b.u0 < a.u0 + a.nu)) { bad.add(a.id); bad.add(b.id); }
  }
  return bad;
}
export function firstFree(cfg, side) {
  const g = derive(cfg);
  if (side === 'top') return (cfg.panels || []).some(p => p.side === 'top') ? null : { u0: 1, nu: 1 };
  const used = new Array(g.NU + 2).fill(false);
  for (const p of cfg.panels || []) if (p.side === side) for (let u = p.u0; u < p.u0 + p.nu; u++) used[u] = true;
  for (let u = 1; u <= g.NU; u++) if (!used[u]) { let n = 0; while (u + n <= g.NU && !used[u + n] && n < 3) n++; return { u0: u, nu: n }; }
  return null;
}
export function shelfSpan(s, g) {
  if (s.type === 'placa') return 6;
  if (s.type === 'discos') return Math.max(1, Math.ceil(((s.hdd || 0) * HDD_MOD[2] + 14) / U));
  return Math.max(1, Math.ceil(((s.dev ? s.dev[2] : 30) + g.TRAY_Z + 9) / U));
}

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

// Sólido de recorte de un diseño en coordenadas de tapa (a→X, b→Y, grosor Z de -30 a 30)
function designSolid(K, shapes, sa, flipW) {
  const { cylZ, box } = H(K);
  const fx = (x) => flipW ? flipW - x : x;
  const parts = [], fans = [], keep = [];
  for (const s of shapes || []) for (const q of prims(s)) {
    if (q.k === 'c') parts.push(cylZ(fx(q.x), q.y, -30, q.d, 60));
    else if (q.k === 'r') {
      if (q.r < 0.3) parts.push(box(fx(q.x) - q.w / 2, q.y - q.h / 2, -30, q.w, q.h, 60));
      else {
        const dx = Math.max(0, q.w / 2 - q.r), dy = Math.max(0, q.h / 2 - q.r);
        const pts = dx < 0.01 && dy < 0.01 ? [[0, 0]] : dx < 0.01 ? [[0, -dy], [0, dy]] : dy < 0.01 ? [[-dx, 0], [dx, 0]] : [[-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]];
        const cs = pts.map(([ox, oy]) => cylZ(fx(q.x) + ox, q.y + oy, -30, 2 * q.r, 60));
        parts.push(cs.length === 1 ? cs[0] : K.hull(cs));
      }
    } else if (q.k === 'p') parts.push(K.tr(K.prism(q.pts.map(([x, y]) => [fx(x), y]), 60), [0, 0, -30]));
    else if (q.k === 'f') { fans.push(K.tr(fanCut(K, q.s, 60), [fx(q.x), q.y, -31])); keep.push(box(fx(q.x) - q.s / 2 - 2, q.y - q.s / 2 - 2, -35, q.s + 4, q.s + 4, 70)); }
  }
  if (!parts.length && !fans.length) return null;
  // bajo un ventilador no se recorta nada más: queda su marco macizo para los tornillos
  let all = parts.length ? K.union(parts) : null;
  if (all && keep.length) all = K.diff(all, keep);
  if (fans.length) all = all ? K.union([all, ...fans]) : K.union(fans);
  return K.inter(all, box(sa.a0, sa.b0, -40, sa.a1 - sa.a0, sa.b1 - sa.b0, 80));
}

// Rejilla de ventilador en el plano XY, centrada en el origen, z de -1 a th+1
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

// ------------------------------------------------------------------
//  Piezas (en coordenadas de montaje)
// ------------------------------------------------------------------
function sideBoltZ(nu) { const z = []; for (let k = 0; k < nu; k++) if (k % 2 === 0 || k === nu - 1) z.push((k + 0.5) * U); return z; }

function sidePanel(K, g, p, flip) {
  const { box, cylX, cylZ, U: un, diff } = H(K);
  const { RT, WALL, D, BOLT_Y } = g;
  const h = p.nu * U;
  const base = un([box(RT, 4, 0, WALL, D - 8, h), box(RT, 38, 0, 8, D - 76, 6), box(RT, 38, h - 6, 8, D - 76, 6)]);
  const cuts = [];
  for (const y of [BOLT_Y, D - BOLT_Y]) for (const z of sideBoltZ(p.nu)) cuts.push(cylX(RT - 1, y, z, 4.4, WALL + 2));
  for (const y of [D / 3, 2 * D / 3]) for (const z of [-1, h - 10]) cuts.push(cylZ(RT + 4, y, z, 6.3, 11));
  const d = designSolid(K, p.shapes, safeArea(p, g), flip ? D : 0);
  if (d) cuts.push(K.tr(K.rot(d, [90, 0, 90]), [RT + WALL / 2, 0, 0]));
  return diff(base, cuts);
}

function cornerBlock(K, g) {
  const { box, cylX, cylZ, diff } = H(K);
  const { CB_X0, CB_Y0, CB, BOLT_Y } = g;
  const hz = g.Z0 + U / 2 - g.PLATE_T;   // coincide con el agujero de la primera U de la pared
  return diff(box(CB_X0, CB_Y0, 0, ...CB), [cylX(CB_X0 - 1, BOLT_Y, hz, 5.6, 9), cylZ(CB_X0 + CB[0] / 2, CB_Y0 + 19, -1, 5.6, 9)]);
}

function plateFull(K, g, top, design) {
  const { box, cylZ, U: un, diff, atCorners } = H(K);
  const { W, D, RF, RT, RS, WALL, TOL, POCKET, PLATE_T, CB_X0, CB_Y0, CB } = g;
  const zc = top ? -1 : PLATE_T - POCKET;
  const cuts = [];
  cuts.push(atCorners(un([box(-0.01, -0.01, zc, RF + TOL, RT + TOL, POCKET + 1), box(-0.01, -0.01, zc, RT + TOL, RS + TOL, POCKET + 1)]), W, D));
  for (const x of [0, W - RT - WALL - TOL]) cuts.push(box(x, 3.5, zc, RT + WALL + TOL, D - 7, POCKET + 1));
  const cx = CB_X0 + CB[0] / 2, cy = CB_Y0 + 19;
  cuts.push(atCorners(un([cylZ(cx, cy, -1, 4.5, PLATE_T + 2),
    top ? cylZ(cx, cy, PLATE_T - 1.4, 4.5, 2.5, 9) : cylZ(cx, cy, -0.01, 9, 2.5, 4.5)]), W, D));
  if (!top) {
    for (const x of [28, W - 28]) for (const y of [40, D - 40]) cuts.push(cylZ(x, y, -1, 5.6, 7));
    const rows = Math.max(0, Math.floor((D - 85) / 20) + 1);
    const len = W / 2 - 60;
    for (const x0 of [35, W / 2 + 25]) for (let i = 0; i < rows; i++)
      cuts.push(K.hull([cylZ(x0, 35 + i * 20, -1, 8, PLATE_T + 2), cylZ(x0 + len, 35 + i * 20, -1, 8, PLATE_T + 2)]));
    cuts.push(box(W / 2 - 40, D - 40, -1, 80, 25, PLATE_T + 2));
  }
  if (design) cuts.push(K.tr(design, [0, 0, PLATE_T / 2]));
  return diff(box(0, 0, 0, W, D, PLATE_T), cuts);
}

function foot(K) {
  const { cylZ, diff } = H(K);
  return diff(cylZ(0, 0, 0, 30, 12, 24), [cylZ(0, 0, -1, 4.5, 20), cylZ(0, 0, -1, 9, 8)]);
}

// Tapa frontal/trasera con orejas (cara exterior en y = -t)
function facePlate(K, g, nu, opts = {}) {
  const { box, cylY, U: un, diff } = H(K);
  const { W, OPEN, FL_W, TOL, HOLE_X, HOLE_Z, M6_D } = g;
  const t = g.FT;
  const h = nu * U - 0.8;
  const body = un([box(0, -t, 0, W, t, h), box(FL_W + TOL, 0, 0, OPEN - 2 * TOL, 6, 4), box(FL_W + TOL, 0, h - 4, OPEN - 2 * TOL, 6, 4)]);
  const cuts = [];
  for (let u = 0; u < nu; u++) for (const hz of HOLE_Z) for (const x of [HOLE_X, W - HOLE_X])
    cuts.push(K.hull([cylY(x - 1.5, -t - 1, u * U + hz, M6_D, t + 2), cylY(x + 1.5, -t - 1, u * U + hz, M6_D, t + 2)]));
  for (const z of opts.trayZ || []) for (const x of trayTabX(g)) cuts.push(cylY(x, -t - 1, z, 3.4, t + 8));
  if (opts.extra) cuts.push(...opts.extra);
  return diff(body, cuts);
}

function trayTabX(g) { return g.is19 ? [60, g.W / 2, g.W - 60] : [60, g.W - 60]; }

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

// Raíl impreso en L (tramo de nu U). Ala frontal (x) con insertos M5, ala lateral (y) con insertos M4, espigas de 3 mm en los extremos.
function railSeg(K, g, nu) {
  const { box, cylX, cylY, cylZ, U: un, diff } = H(K);
  const { RF, RT, RS, HOLE_X, HOLE_Z, BOLT_Y } = g;
  const L = nu * U;
  const cuts = [];
  for (let u = 0; u < nu; u++) {
    for (const hz of HOLE_Z) cuts.push(cylY(HOLE_X, -1, u * U + hz, 6.4, RT + 2));
    cuts.push(cylX(-1, BOLT_Y, (u + 0.5) * U, 5.6, RT + 2));
  }
  for (const z of [-1, L - 7]) { cuts.push(cylZ(RF - 2.3, RT / 2, z, 3.2, 8)); cuts.push(cylZ(RT / 2, RS - 4, z, 3.2, 8)); }
  return diff(un([box(0, 0, 0, RF, RT, L), box(0, 0, 0, RT, RS, L)]), cuts);
}
export function railSegments(cfg, g) {
  const maxU = Math.max(1, Math.floor((Math.max(cfg.bed[0], cfg.bed[1]) - 2) / U));
  const k = Math.ceil(g.NU / maxU);
  const base = Math.floor(g.NU / k), rem = g.NU % k;
  const segs = []; for (let i = 0; i < k; i++) segs.push(base + (i < rem ? 1 : 0));
  return segs;
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

export function planSplit(eA, eB, bed, tabDepth = 9) {
  let best = null;
  for (let na = 1; na <= 6; na++) for (let nb = 1; nb <= 6; nb++) {
    const sa = eA / na + (na > 1 ? tabDepth : 0), sb = eB / nb + (nb > 1 ? tabDepth : 0);
    if (fitsRect(sa, sb, bed) && (!best || na * nb < best.na * best.nb)) best = { na, nb };
  }
  return best || { na: 6, nb: 6, fail: true };
}

// Tramos de pared lateral que caben en la cama (para las tapas laterales por defecto)
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

// ------------------------------------------------------------------
//  Lista de piezas
// ------------------------------------------------------------------
//  Cada pieza: { id, name, group, color, sig, build(K) -> solid, print, plane, inst: [{t, s}], panelId?, explode }
export const COLORS = { frame: '#e0782c', panel: '#f3b27a', side: '#e9893c', tray: '#e9893c', acc: '#c65f1a', rail: '#d06a24' };

export function panelLabel(p) {
  if (p.side === 'top') return SIDES.top;
  return `${SIDE_SHORT[p.side]} U${p.u0}${p.nu > 1 ? '–' + (p.u0 + p.nu - 1) : ''}`;
}
function designName(p) {
  if (!p.shapes.length) return 'lisa';
  if (p.auto) return TEMPLATES[p.tpl].toLowerCase();
  const fans = p.shapes.filter(s => s.t === 'fan').map(s => s.s);
  return 'diseño propio' + (fans.length ? ` · vent. ${fans.join('+')} mm` : '');
}

export function buildPartList(cfg) {
  const g = derive(cfg);
  const P = [];
  const gsig = [cfg.std, g.D, g.WALL, g.FT, g.RT].join('|');
  const { W, D, Z0, NU, PLATE_T } = g;
  const shelves = (cfg.shelves || []).filter(s => s.u <= NU);

  // --- Estructura -------------------------------------------------
  const cornerInst = [];
  for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = mx < 0 ? W : 0, ty = my < 0 ? D : 0;
    cornerInst.push({ t: [tx, ty, PLATE_T], s: [mx, my, 1] });
    cornerInst.push({ t: [tx, ty, g.TOPZ], s: [mx, my, -1] });
  }
  P.push({ id: 'bloque_esquina', name: 'Bloque de esquina', group: 'Estructura', color: COLORS.acc, sig: `cb|${gsig}`,
    build: K => cornerBlock(K, g), print: [0, 0, 0], plane: null, inst: cornerInst });
  P.push({ id: 'base', name: 'Base', group: 'Estructura', color: COLORS.acc, sig: `pb|${gsig}`,
    build: K => plateFull(K, g, false), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, 0] }], explode: [0, 0, -1] });
  P.push({ id: 'pata', name: 'Pata', group: 'Estructura', color: '#3a3a3a', sig: 'foot', build: K => foot(K), print: [0, 0, 0], plane: null,
    inst: [[28, 40], [W - 28, 40], [28, D - 40], [W - 28, D - 40]].map(([x, y]) => ({ t: [x, y, -12] })), explode: [0, 0, -1.5] });
  if (!cfg.panels.some(p => p.side === 'top'))
    P.push({ id: 'tapa_superior_lisa', name: 'Tapa superior (estructura)', group: 'Estructura', color: COLORS.acc, sig: `pt|${gsig}`,
      build: K => plateFull(K, g, true), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, g.TOPZ] }], explode: [0, 0, 1] });

  if (g.printed) {
    const segs = railSegments(cfg, g);
    let z = Z0; const at = new Map();
    for (const n of segs) { if (!at.has(n)) at.set(n, []); at.get(n).push(z); z += n * U; }
    for (const [n, zs] of at) {
      const inst = [];
      for (const z0 of zs) for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) inst.push({ t: [mx < 0 ? W : 0, my < 0 ? D : 0, z0], s: [mx, my, 1] });
      P.push({ id: `rail_${n}u`, name: `Raíl en L impreso, tramo ${n}U`, group: 'Raíles impresos', color: COLORS.rail, sig: `rail|${gsig}|${n}`,
        build: K => railSeg(K, g, n), print: [0, 90, 0], plane: null, inst, explode: [0, 0, 0], rail: true });
    }
  }

  // --- Tapas -------------------------------------------------------
  const GROUP = { front: 'Tapas frontales', rear: 'Tapas traseras', left: 'Laterales', right: 'Laterales', top: 'Tapa superior' };
  for (const p of cfg.panels) {
    const sa = safeArea(p, g), dsig = JSON.stringify(p.shapes);
    const base = { group: GROUP[p.side], panelId: p.id, side: p.side, name: `${panelLabel(p)} · ${designName(p)}` };
    if (p.side === 'front' || p.side === 'rear') {
      const trayZ = shelves.filter(s => s.u >= p.u0 && s.u < p.u0 + p.nu).map(s => (s.u - p.u0) * U + g.TRAY_Z + 8);
      const flip = p.side === 'rear' ? W : 0;
      P.push({ ...base, id: `${p.side === 'front' ? 'frontal' : 'trasera'}_${p.id}`, color: COLORS.panel,
        sig: `face|${gsig}|${p.nu}|${trayZ.join(',')}|${flip}|${dsig}`,
        build: K => { const d = designSolid(K, p.shapes, sa, flip); return facePlate(K, g, p.nu, { trayZ, extra: d ? [K.tr(K.rot(d, [90, 0, 0]), [0, -g.FT / 2, 0])] : [] }); },
        print: [90, 0, 0], plane: ['x', 'z'],
        inst: [p.side === 'front' ? { t: [0, 0, g.uz(p.u0)] } : { t: [0, D, g.uz(p.u0)], s: [1, -1, 1] }],
        explode: [0, p.side === 'front' ? -1 : 1, 0] });
    } else if (p.side === 'left' || p.side === 'right') {
      const L = p.side === 'left';
      P.push({ ...base, id: `lateral_${L ? 'izq' : 'der'}_${p.id}`, color: COLORS.side,
        sig: `side|${gsig}|${p.nu}|${L}|${dsig}`,
        build: K => L ? sidePanel(K, g, p, true) : K.mir(sidePanel(K, g, p, false), [1, 0, 0]),
        print: L ? [0, -90, 0] : [0, 90, 0], plane: ['y', 'z'],
        inst: [{ t: [L ? 0 : W, 0, g.uz(p.u0)] }], explode: [L ? -1 : 1, 0, 0] });
    } else {
      P.push({ ...base, id: `superior_${p.id}`, color: COLORS.acc, sig: `top|${gsig}|${dsig}`,
        build: K => plateFull(K, g, true, designSolid(K, p.shapes, sa, 0)),
        print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, g.TOPZ] }], explode: [0, 0, 1] });
    }
  }

  // --- Baldas ------------------------------------------------------
  for (const s of shelves) {
    const z = g.uz(s.u) + g.TRAY_Z;
    const grp = `Balda U${s.u} · ${s.label && s.dev ? s.label : SHELF_TYPES[s.type].short}`;
    const key = `balda_${s.id}`;
    const lip = s.type === 'placa' ? 10 : 15;
    P.push({ id: `${key}_bandeja`, name: 'Bandeja', group: grp, color: COLORS.tray, sig: `tray|${gsig}|${lip}`,
      build: K => tray(K, g, lip), print: [0, 0, 0], plane: ['x', 'y'], inst: [{ t: [0, 0, z] }], shelfId: s.id });
    if ((s.type === 'mini' || s.type === 'bandeja') && s.dev) {
      const y0 = Math.max(10, Math.min(30, D - s.dev[1] - 12));
      P.push({ id: `${key}_topes`, name: `Topes para ${s.label || 'equipo'}`, group: grp, color: COLORS.acc,
        sig: `stops|${gsig}|${s.dev.join('x')}|${y0}`, build: K => stops(K, g, s.dev, y0), print: [0, 0, 0], plane: null,
        inst: [{ t: [0, 0, z + 3] }], shelfId: s.id });
    }
    if (s.type === 'placa') {
      P.push({ id: `${key}_placa_montaje`, name: 'Placa de montaje de la placa base', group: grp, color: COLORS.acc,
        sig: `mb|${gsig}`, build: K => mbPlate(K, g), print: [0, -90, 0], plane: ['y', 'z'],
        inst: [{ t: [g.FL_W + g.TOL + 3, 0, z + 3] }], shelfId: s.id });
      P.push({ id: `${key}_cuna_sfx`, name: 'Cuna fuente SFX', group: grp, color: COLORS.acc, sig: `sfx|${gsig}`,
        build: K => sfxCradle(K, g), print: [0, 0, 0], plane: null, inst: [{ t: [0, 0, z + 3] }], shelfId: s.id });
    }
  }
  return { parts: P, g };
}

// Maquetas para la vista (no se imprimen): cajas [x,y,z,sx,sy,sz,color,etiqueta]
export function mockups(cfg, g) {
  const out = [];
  for (const s of cfg.shelves || []) {
    if (s.u > g.NU) continue;
    const z = g.uz(s.u) + g.TRAY_Z + 3;
    if (s.dev) {
      const y0 = s.type === 'router' ? Math.max(10, Math.min(50, g.D - s.dev[1] - 12)) : Math.max(10, Math.min(30, g.D - s.dev[1] - 12));
      const col = s.type === 'router' ? '#eeeeec' : s.type === 'mini' ? '#3b3e44' : '#6c7a89';
      out.push([(g.W - s.dev[0]) / 2, y0, z, ...s.dev, col, s.label]);
    }
    if (s.type === 'discos') {
      for (let i = 0; i < (s.hdd || 0); i++) out.push([30, 40, z + i * HDD_MOD[2], HDD_MOD[0], HDD_MOD[1], HDD_MOD[2] - 1, '#3a7fc4', 'HDD 3,5"']);
      for (let i = 0; i < (s.ssd || 0); i++) out.push([g.W - g.FL_W - 95, 120, z + i * SSD_MOD[2], SSD_MOD[0], SSD_MOD[1], SSD_MOD[2] - 0.8, '#8a63c9', 'SSD 2,5"']);
    }
    if (s.type === 'placa') {
      const bx = g.FL_W + g.TOL + 3 + 4 + STANDOFF;
      out.push([bx, g.D - 3 - MB[1], z + MB_Z0, 1.6, MB[1], MB[0], '#2f6b3a', 'Placa base']);
      out.push([bx + 1.6, g.D - 3 - 48 - 96, z + MB_Z0 + 132, 52, 96, 96, '#555555', 'Disipador']);
      out.push([g.W - g.FL_W - 8 - SFX[2], 12, z, SFX[2], SFX[1], SFX[0], '#5a5f66', 'Fuente SFX']);
      for (let i = 0; i < (s.ssd || 0); i++) out.push([g.W - g.FL_W - 8 - SSD_MOD[0], 130, z + i * SSD_MOD[2], SSD_MOD[0], SSD_MOD[1], SSD_MOD[2] - 0.8, '#8a63c9', 'SSD 2,5"']);
    }
  }
  return out;
}

export const RAIL_SHOPS = [
  { name: 'Penn Elcom R0883-2mm (raíl doble 14U, agujero cuadrado, 2 mm)', url: 'https://penn-elcom.com/mx/14u-full-hole-double-rack-rail-with-square-holes-2mm-thick-r0883-2mm-14' },
  { name: 'Hammond CLSR (raíl de montaje con agujero cuadrado, varias alturas)', url: 'https://www.hammfg.com/product/clsr' },
  { name: 'DeskPi RackMate T1 / T2 (rack metálico de 10″ completo)', url: 'https://deskpi.com/products/deskpi-rackmate-t1-2' },
];

export function hardware(cfg, g, parts) {
  const fr = cfg.panels.filter(p => p.side === 'front' || p.side === 'rear');
  const ears = fr.length * 4;
  const sideBolts = cfg.panels.filter(p => p.side === 'left' || p.side === 'right').reduce((s, p) => s + 2 * sideBoltZ(p.nu).length, 0);
  const shelves = (cfg.shelves || []).filter(s => s.u <= g.NU);
  const tabs = trayTabX(g).length;
  const fans = {};
  for (const p of cfg.panels) for (const s of p.shapes) if (s.t === 'fan') fans[s.s] = (fans[s.s] || 0) + 1;
  const ks = cfg.panels.reduce((n, p) => n + p.shapes.filter(s => s.t === 'keystone').reduce((m, s) => m + s.n, 0), 0);
  const out = [];
  if (g.printed) {
    const segs = railSegments(cfg, g);
    out.push([`Insertos roscados M5 (Ø6,4) en los raíles impresos, uno por tornillo de tapa`, ears]);
    out.push(['Tornillos M5×12 para las tapas frontales y traseras', ears]);
    out.push(['Insertos roscados M4 (Ø5,6) en el ala lateral de los raíles', sideBolts]);
    if (segs.length > 1) out.push(['Espigas de acero de 3×16 mm entre tramos de raíl', (segs.length - 1) * 4 * 2]);
  } else {
    out.push([`Raíles metálicos de ${g.NU}U (${String((g.NU * U).toFixed(1)).replace('.', ',')} mm), perfil en L, agujero cuadrado`, 4]);
    out.push(['Tuercas enjauladas M6 + tornillos M6×12 para las tapas frontales y traseras', ears]);
    out.push(['Taladros de 4,5 mm en el ala lateral del raíl para los laterales', sideBolts]);
  }
  out.push(['Tornillos M4×10 + tuerca, lateral–raíl', sideBolts]);
  out.push(['Insertos roscados M4 (bloques de esquina y patas)', 8 * 2 + 4]);
  out.push(['Tornillos M4×16 avellanados tapa–bloque', 8]);
  out.push(['Tornillos M4×20 para patas', 4]);
  if (shelves.length) out.push(['Tornillos M3×10 + tuerca, bandeja–tapa', shelves.length * tabs * 2]);
  for (const [sz, n] of Object.entries(fans)) out.push([`Ventilador de ${sz} mm (+4 tornillos de ventilador)`, n]);
  if (ks) out.push(['Conectores keystone RJ45', ks]);
  const placas = shelves.filter(s => s.type === 'placa').length;
  if (placas) { out.push(['Insertos M3 + tornillos M3×8 para la placa base', 8 * placas]); out.push(['Tornillos M3×10 placa de montaje–bandeja', 3 * placas]); }
  return out;
}
