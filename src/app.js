// ===================================================================
//  Interfaz v2: raíles, tapas con diseño 2D, baldas, visor 3D y descargas
// ===================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PRESETS = {
  mine: { name: 'Mis impresoras: X1C + Core One (cabe en las dos)', bed: [250, 220, 256] },
  x1c: { name: 'Bambu Lab X1C / P1S / P2S', bed: [256, 256, 256] },
  a1: { name: 'Bambu Lab A1', bed: [256, 256, 256] },
  a1mini: { name: 'Bambu Lab A1 mini', bed: [180, 180, 180] },
  core1: { name: 'Prusa Core One', bed: [250, 220, 270] },
  mk4: { name: 'Prusa MK4S', bed: [250, 210, 220] },
  ender3: { name: 'Creality Ender-3 V3', bed: [220, 220, 250] },
  k1max: { name: 'Creality K1 Max', bed: [300, 300, 300] },
  custom: { name: 'Personalizada', bed: null },
};
const STORE = 'rack-config-v2';
const SIDE_ORDER = ['front', 'rear', 'left', 'right', 'top'];
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let cfg = load();
let K = null;
const cache = new Map();
let current = { parts: [], g: null, results: new Map() };
let selected = null;
let viewMode = 'asm';
let runToken = 0;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.v === 2 && Array.isArray(s.panels)) return syncConfig({ ...defaultConfig(), ...s });
  } catch (e) {}
  return defaultConfig();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) {} }
function effBed() { const m = +(cfg.bedMargin ?? 0) || 0; return [cfg.bed[0] - 2 * m, cfg.bed[1] - 2 * m, cfg.bed[2]]; }

// ------------------------------------------------------------------ UI lateral
function initControls() {
  const ps = $('preset');
  for (const [k, p] of Object.entries(PRESETS)) ps.add(new Option(p.name, k));
  for (const s of SIDE_ORDER) $('addSide').add(new Option(SIDES[s], s));
  for (const [k, t] of Object.entries(SHELF_TYPES)) $('addShelfType').add(new Option(t.name, k));

  $('std').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cfg.std = b.dataset.v; changed(true); });
  $('rails').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cfg.rails = b.dataset.v; changed(true); });
  $('view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setView(b.dataset.v); });
  const num = (id, key, lo, hi, round) => $(id).addEventListener('change', e => { let v = +e.target.value; if (isNaN(v)) return; v = clamp(round ? Math.round(v) : v, lo, hi); cfg[key] = v; changed(true); });
  num('bedM', 'bedMargin', 0, 20); num('depth', 'depth', 180, 450); num('NU', 'NU', 1, 42, true); num('wall', 'wall', 2.4, 5); num('faceT', 'faceT', 3, 6);
  $('depthR').addEventListener('input', e => { $('depth').value = e.target.value; });
  $('depthR').addEventListener('change', e => { cfg.depth = +e.target.value; changed(true); });
  ps.addEventListener('change', e => { cfg.bedPreset = e.target.value; const p = PRESETS[cfg.bedPreset]; if (p.bed) cfg.bed = [...p.bed]; changed(); });
  ['bedX', 'bedY', 'bedZ'].forEach((id, i) => $(id).addEventListener('change', e => { const v = clamp(+e.target.value, 100, 600); if (!isNaN(v)) { cfg.bed[i] = v; cfg.bedPreset = 'custom'; changed(); } }));
  $('showDevices').addEventListener('change', e => { cfg.showDevices = e.target.checked; save(); rebuildScene(); });
  $('showRails').addEventListener('change', e => { cfg.showRails = e.target.checked; save(); rebuildScene(); });
  $('reset').addEventListener('click', () => { cfg = defaultConfig(); selected = null; changed(); });
  $('dlAll').addEventListener('click', downloadAll);
  $('dlSel').addEventListener('click', downloadSelected);

  $('addPanel').addEventListener('click', () => {
    const side = $('addSide').value, fr = firstFree(cfg, side);
    if (!fr) { toast(side === 'top' ? 'Ya hay una tapa superior.' : `El ${SIDES[side].toLowerCase()} ya está cubierto. Acorta una tapa para hacer hueco.`); return; }
    cfg.panels.push(makePanel(cfg, side, fr.u0, fr.nu, side === 'top' || side === 'left' || side === 'right' ? 'ranuras' : 'lisa'));
    changed();
  });
  $('addShelf').addEventListener('click', () => {
    const g = derive(cfg);
    let u = 1; for (const s of cfg.shelves) u = Math.max(u, s.u + shelfSpan(s, g));
    if (u > g.NU) u = g.NU;
    cfg.shelves.push(defaultShelf($('addShelfType').value, u));
    changed();
  });

  const pl = $('panelList');
  pl.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.closest('[data-pid]').dataset.pid, i = cfg.panels.findIndex(p => p.id === id);
    if (b.dataset.act === 'del') { cfg.panels.splice(i, 1); changed(); }
    if (b.dataset.act === 'edit') openEditor(id);
  });
  pl.addEventListener('change', e => {
    const el = e.target, row = el.closest('[data-pid]'); if (!row) return;
    const p = cfg.panels.find(x => x.id === row.dataset.pid), f = el.dataset.f;
    if (f === 'tpl') { p.tpl = el.value; p.auto = true; }
    else { const v = Math.round(+el.value); if (!isNaN(v)) p[f] = v; }
    changed(true);
  });
  const sl = $('shelfList');
  sl.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = cfg.shelves.findIndex(s => s.id === b.closest('[data-sid]').dataset.sid);
    if (b.dataset.act === 'del') { cfg.shelves.splice(i, 1); changed(); }
  });
  sl.addEventListener('change', e => {
    const el = e.target, row = el.closest('[data-sid]'); if (!row) return;
    const s = cfg.shelves.find(x => x.id === row.dataset.sid), f = el.dataset.f;
    if (f === 'label') s.label = el.value.slice(0, 40);
    else if (f.startsWith('dev')) { const v = clamp(+el.value, 10, 600); if (!isNaN(v)) s.dev[+f[3]] = v; }
    else { const v = Math.round(+el.value); if (!isNaN(v)) s[f] = clamp(v, +el.min, +el.max); }
    changed(true);
  });
}

function renderControls() {
  const g = derive(cfg);
  const pressed = (id, v) => $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  pressed('std', cfg.std); pressed('view', viewMode); pressed('rails', cfg.rails);
  $('depth').value = cfg.depth; $('depthR').value = cfg.depth; $('NU').value = cfg.NU; $('wall').value = cfg.wall; $('faceT').value = cfg.faceT;
  $('preset').value = cfg.bedPreset in PRESETS ? cfg.bedPreset : 'custom';
  $('bedM').value = cfg.bedMargin ?? 0;
  const eb = effBed(); $('bedEff').textContent = `Zona útil para las piezas: ${fmt(eb[0])} × ${fmt(eb[1])} × ${fmt(eb[2])} mm`;
  $('bedX').value = cfg.bed[0]; $('bedY').value = cfg.bed[1]; $('bedZ').value = cfg.bed[2];
  $('showDevices').checked = cfg.showDevices !== false; $('showRails').checked = cfg.showRails !== false;
  $('dims').innerHTML = `<span><b>${g.NU}U</b></span><span>ancho <b>${fmt(g.W, 1)}</b></span><span>fondo <b>${fmt(g.D + 2 * g.FT)}</b></span><span>alto <b>${fmt(g.H + 12)}</b> mm</span>`;

  // raíles
  const railMm = fmt(g.NU * U, 1);
  if (cfg.rails === 'metal') {
    $('railInfo').innerHTML = `<p>4 raíles en L de <b>${g.NU}U (${railMm} mm)</b>, ala frontal de 15,8 mm y lateral de 20 mm, agujero cuadrado para tuerca enjaulada M6. Si son más largos, córtalos a ${railMm} mm.</p>
      <p class="sub">Dónde comprarlos:</p><ul class="links">${RAIL_SHOPS.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join('')}</ul>`;
  } else {
    const segs = railSegments({ ...cfg, bed: effBed() }, g);
    $('railInfo').innerHTML = `<p>Se imprimen 4 raíles en L de 5 mm de grosor, en ${segs.length} tramo${segs.length > 1 ? 's' : ''} (${segs.map(n => n + 'U').join(' + ')}) unidos con espigas de 3 mm. Llevan insertos roscados M5 para las tapas y M4 para los laterales.</p>
      <p class="sub">Imprime en PETG o ASA con 5 perímetros. Para un rack cargado, mejor raíles metálicos.</p>`;
  }

  // tapas
  const clash = panelClashes(cfg);
  const cover = {};
  for (const s of SIDE_ORDER) cover[s] = 0;
  for (const p of cfg.panels) cover[p.side] += p.side === 'top' ? 1 : p.nu;
  let html = '';
  for (const side of SIDE_ORDER) {
    const list = cfg.panels.filter(p => p.side === side).sort((a, b) => b.u0 - a.u0);
    const need = side === 'top' ? 1 : g.NU;
    html += `<div class="pgroup"><div class="pghead">${SIDES[side]}<span>${side === 'top' ? (list.length ? '' : 'sin tapa') : `${Math.min(cover[side], need)}/${need}U cubiertas`}</span></div>`;
    for (const p of list) {
      const tplOpts = Object.entries(TEMPLATES).filter(([k]) => k !== 'patch' || side === 'front' || side === 'rear')
        .map(([k, n]) => `<option value="${k}"${p.auto && p.tpl === k ? ' selected' : ''}>${n}</option>`).join('') + (p.auto ? '' : '<option value="" selected>Diseño propio</option>');
      const range = side === 'top' ? '' : `<label>U <input type="number" data-f="u0" min="1" max="${g.NU}" value="${p.u0}" aria-label="Primera U"></label><label>alto <input type="number" data-f="nu" min="1" max="${g.NU}" value="${p.nu}" aria-label="Alto en U"></label>`;
      html += `<div class="prow${clash.has(p.id) ? ' clash' : ''}" data-pid="${p.id}">
        <div class="prev" aria-hidden="true">${miniSvg(p, g)}</div>
        <div class="pbody"><div class="top"><strong>${esc(panelLabel(p))}</strong>
          <button type="button" class="btn sm" data-act="edit">Diseñar</button>
          <button type="button" class="icon" data-act="del" aria-label="Quitar tapa">✕</button></div>
          <div class="row">${range}<select data-f="tpl" aria-label="Plantilla">${tplOpts}</select></div>
          ${clash.has(p.id) ? '<div class="row bad">Se pisa con otra tapa del mismo lado</div>' : ''}</div></div>`;
    }
    html += '</div>';
  }
  $('panelList').innerHTML = html;

  // baldas
  let sh = '';
  const shelves = [...cfg.shelves].sort((a, b) => b.u - a.u);
  for (const s of shelves) {
    const span = shelfSpan(s, g), T = SHELF_TYPES[s.type];
    let rows = `<label>en U <input type="number" data-f="u" min="1" max="${g.NU}" value="${s.u}"></label><span class="sub">ocupa ${span}U</span>`;
    if (s.type === 'discos') rows += `<label>HDD <input type="number" data-f="hdd" min="0" max="4" value="${s.hdd}"></label><label>SSD <input type="number" data-f="ssd" min="0" max="8" value="${s.ssd}"></label>`;
    if (s.type === 'placa') rows += `<label>SSD <input type="number" data-f="ssd" min="0" max="8" value="${s.ssd}"></label>`;
    let extra = '';
    if (s.dev) extra = `<div class="row"><input type="text" data-f="label" value="${esc(s.label || '')}" aria-label="Nombre del equipo" placeholder="Nombre del equipo"></div>
      <div class="row"><span>Equipo (mm)</span><label>an <input type="number" data-f="dev0" min="10" max="600" value="${s.dev[0]}"></label><label>fo <input type="number" data-f="dev1" min="10" max="600" value="${s.dev[1]}"></label><label>al <input type="number" data-f="dev2" min="5" max="400" value="${s.dev[2]}"></label></div>`;
    const covered = cfg.panels.some(p => p.side === 'front' && s.u >= p.u0 && s.u < p.u0 + p.nu) && cfg.panels.some(p => p.side === 'rear' && s.u >= p.u0 && s.u < p.u0 + p.nu);
    sh += `<div class="mod" data-sid="${s.id}"><div class="u">U${s.u}<span>${span}U</span></div><div class="body">
      <div class="top"><strong>${esc(s.dev && s.label ? s.label : T.name)}</strong><button type="button" class="icon" data-act="del" aria-label="Quitar balda">✕</button></div>
      <div class="row">${rows}</div>${extra}
      ${covered ? '' : '<div class="row bad">Falta tapa frontal o trasera en esta U para atornillar la bandeja</div>'}</div></div>`;
  }
  if (!shelves.length) sh = '<div class="free-u">Sin baldas. Añade una abajo.</div>';
  $('shelfList').innerHTML = sh;
}

// Miniatura del diseño de una tapa
function miniSvg(p, g) {
  const { Lw, Lh } = panelDims(p, g);
  const s = 46 / Math.max(Lw, Lh);
  const w = Lw * s, h = Lh * s;
  let body = '';
  for (const sh of p.shapes) for (const q of prims(sh)) body += primSvg(q, Lh);
  return `<svg viewBox="0 0 ${Lw} ${Lh}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"><rect width="${Lw}" height="${Lh}" class="pf"/><g class="pc">${body}</g></svg>`;
}
function primSvg(q, Lh, cls = '') {
  const Y = (y) => (Lh - y).toFixed(2);
  if (q.k === 'c') return `<circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d / 2}"${cls}/>`;
  if (q.k === 'r') return `<rect x="${(q.x - q.w / 2).toFixed(2)}" y="${Y(q.y + q.h / 2)}" width="${q.w}" height="${q.h}" rx="${q.r}"${cls}/>`;
  if (q.k === 'p') return `<polygon points="${q.pts.map(([x, y]) => x.toFixed(2) + ',' + Y(y)).join(' ')}"${cls}/>`;
  if (q.k === 'f') {
    const hs = (FAN_SIZES[q.s] || q.s * 0.85) / 2, r = q.s / 2 - 1;
    let o = `<rect x="${q.x - q.s / 2 - 2}" y="${Y(q.y + q.s / 2 + 2)}" width="${q.s + 4}" height="${q.s + 4}" class="fanbg"/><circle cx="${q.x}" cy="${Y(q.y)}" r="${r}"${cls} class="fanring"/>`;
    for (let k = Math.min(7, q.s * 0.11) + 3; k + 3 <= q.s / 2 - 2.5; k += 7) o += `<circle cx="${q.x}" cy="${Y(q.y)}" r="${k + 2}" class="fanline"/>`;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) o += `<circle cx="${q.x + sx * hs}" cy="${Y(q.y + sy * hs)}" r="2.2"${cls}/>`;
    return o;
  }
  return '';
}

let debounce = 0;
function changed(sync) {
  if (sync) syncConfig(cfg);
  save(); renderControls();
  if (ed) renderEditor();
  clearTimeout(debounce); debounce = setTimeout(regenerate, 220);
}

// ------------------------------------------------------------------ motor
async function initKernel() {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/manifold-3d@3.3.2/manifold.js');
    const bin = Uint8Array.from(atob(window.__MANIFOLD_WASM_B64), c => c.charCodeAt(0));
    const wasm = await mod.default({ wasmBinary: bin });
    wasm.setup();
    return manifoldKernel(wasm);
  } catch (e) {
    console.warn('Manifold no disponible, uso JSCAD', e);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@jscad/modeling@2.12.5/dist/jscad-modeling.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return jscadKernel(window.jscadModeling);
  }
}

async function regenerate() {
  if (!K) return;
  const token = ++runToken;
  const ecfg = { ...cfg, bed: effBed() };
  const { parts, g } = buildPartList(ecfg);
  current = { parts, g, results: new Map() };
  const bedKey = ecfg.bed.join('x');
  const todo = parts.filter(p => !cache.has(p.sig + '|' + bedKey));
  for (const p of parts) { const r = cache.get(p.sig + '|' + bedKey); if (r) current.results.set(p.id, r); }
  if (selected && !parts.some(p => p.id === selected.partId)) selected = null;
  rebuildScene(); renderParts();
  let done = 0;
  for (const p of todo) {
    await new Promise(r => setTimeout(r, 0));
    if (token !== runToken) return;
    let r;
    try { r = generatePart(K, p, ecfg.bed); } catch (e) { console.error(p.id, e); r = { pieces: [], error: String(e) }; }
    cache.set(p.sig + '|' + bedKey, r);
    current.results.set(p.id, r);
    addPartToScene(p);
    if (++done % 4 === 0) renderParts();
  }
  if (token !== runToken) return;
  if (cache.size > 400) { const keep = new Set(parts.map(p => p.sig + '|' + bedKey)); for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k); }
  renderParts();
  if (viewMode === 'bed') showBed();
}

// ------------------------------------------------------------------ lista de piezas
function pieceRows() {
  const rows = [];
  for (const p of current.parts) {
    const r = current.results.get(p.id);
    if (!r) { rows.push({ p, pending: true }); continue; }
    r.pieces.forEach((pc, idx) => rows.push({ p, pc, idx }));
  }
  return rows;
}
function renderParts() {
  const rows = pieceRows();
  let html = '', grp = null, prints = 0, grams = 0, models = 0, bad = 0;
  for (const row of rows) {
    const { p, pc, idx } = row;
    if (p.group !== grp) { grp = p.group; html += `<tr class="grp"><td colspan="5">${esc(grp)}</td></tr>`; }
    if (row.pending) { html += `<tr><td><span class="sw" style="background:${p.color}"></span>${esc(p.name)}</td><td class="num">${p.inst.length}</td><td class="num sub">…</td><td></td><td></td></tr>`; continue; }
    const q = p.inst.length, g = pc.volume / 1000 * 1.24 * 0.45;
    prints += q; grams += g * q; models++; if (!pc.fits) bad++;
    const on = selected && selected.partId === p.id && selected.pieceIdx === idx;
    const st = !pc.fits ? '<span class="pill bad">no cabe</span>' : pc.label ? `<span class="pill cut">${pc.label}</span>` : '<span class="pill ok">cabe</span>';
    html += `<tr class="piece${on ? ' on' : ''}" data-p="${p.id}" data-k="${idx}"><td><span class="sw" style="background:${p.color}"></span>${esc(p.name)}</td>
      <td class="num">${q}</td><td class="num">${pc.size.map(v => fmt(v)).join(' × ')}</td><td>${st}</td><td class="num">${fmt(g * q)}</td></tr>`;
  }
  $('tbody').innerHTML = html;
  const pending = rows.some(r => r.pending);
  $('sum').innerHTML = pending ? `Generando piezas… <b>${rows.filter(r => !r.pending).length}</b>` : `<b>${prints}</b> impresiones de <b>${models}</b> modelos · <b>≈ ${fmt(grams / 1000, 2)} kg</b> de filamento${bad ? ` · <b style="color:var(--bad)">${bad} no caben</b>` : ''}`;
  $('dlAll').disabled = pending || !models;
  $('dlSel').disabled = pending || !selected;
  $('hwul').innerHTML = hardware(cfg, current.g, current.parts).map(([t, n]) => `<li><b>${n}×</b> ${esc(t)}</li>`).join('');
}
$('tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr.piece'); if (!tr) return;
  select(tr.dataset.p, +tr.dataset.k);
});
function select(partId, pieceIdx) {
  selected = partId ? { partId, pieceIdx } : null;
  renderParts(); highlight();
  if (viewMode === 'bed') showBed();
}

// ------------------------------------------------------------------ 3D
const viewer = $('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
viewer.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 5, 20000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-400, -700, 900); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(600, 500, 300); scene.add(fill);
const root = new THREE.Group(); scene.add(root);
const partGroup = new THREE.Group(), mockGroup = new THREE.Group(), railGroup = new THREE.Group(), floorGroup = new THREE.Group();
const fanGroup = new THREE.Group(), ghostGroup = new THREE.Group();
root.add(partGroup, mockGroup, railGroup, floorGroup, fanGroup, ghostGroup);
const bedGroup = new THREE.Group(); scene.add(bedGroup);
const geomCache = new WeakMap();
let framedFor = '';

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return { view: cs.getPropertyValue('--view').trim() || '#e4e7ea', line: cs.getPropertyValue('--line').trim() || '#ccc', accent: cs.getPropertyValue('--accent').trim() };
}
function applyTheme() { const c = themeColors(); scene.background = new THREE.Color(c.view); rebuildFloor(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function geomFor(pc) {
  let geo = geomCache.get(pc);
  if (!geo) {
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.BufferAttribute(pc.mesh.pos, 3));
    g0.setIndex(new THREE.BufferAttribute(pc.mesh.idx, 1));
    geo = g0.toNonIndexed(); geo.computeVertexNormals(); g0.dispose();
    geomCache.set(pc, geo);
  }
  return geo;
}
const matCache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...opts }));
  return matCache.get(k);
}
function zSpread(z) { const g = current.g; return (z - g.Z0) / (g.NU * U) * 160; }
function explodeOffset(p, inst) {
  if (viewMode !== 'exp') return [0, 0, 0];
  const zf = zSpread(inst.t[2]);
  if (p.rail) return [(inst.s[0] < 0 ? 1 : -1) * 40, (inst.s[1] < 0 ? 1 : -1) * 40, zf + 20 * (inst.t[2] > current.g.Z0 + 1)];
  switch (p.side) {
    case 'front': return [0, -140, zf];
    case 'rear': return [0, 140, zf];
    case 'left': return [-110, 0, zf];
    case 'right': return [110, 0, zf];
    case 'top': return [0, 0, 250];
  }
  if (p.id === 'bloque_esquina') return [(inst.s && inst.s[0] < 0) ? 50 : -50, 0, inst.s && inst.s[2] < 0 ? 200 : 0];
  if (p.shelfId) return [0, 0, zf];
  if (p.id === 'base') return [0, 0, -90];
  if (p.id === 'pata') return [0, 0, -135];
  if (p.id.startsWith('tapa_superior')) return [0, 0, 250];
  return [0, 0, 0];
}
function addPartToScene(p) {
  const r = current.results.get(p.id); if (!r) return;
  for (const old of partGroup.children.filter(o => o.userData.partId === p.id)) partGroup.remove(old);
  r.pieces.forEach((pc, k) => {
    const geo = geomFor(pc);
    for (const inst of p.inst) {
      const m = new THREE.Mesh(geo, mat(p.color));
      const o = explodeOffset(p, inst);
      const cut = r.pieces.length > 1 && viewMode === 'exp' ? k * 6 : 0;
      m.position.set(inst.t[0] + o[0] + cut, inst.t[1] + o[1] + cut * 0.3, inst.t[2] + o[2] + cut * 0.3);
      if (inst.s) m.scale.set(...inst.s);
      m.userData = { partId: p.id, pieceIdx: k, inst, panelId: p.panelId };
      partGroup.add(m);
    }
  });
  highlight();
}
function rebuildScene() {
  partGroup.clear(); mockGroup.clear(); railGroup.clear(); fanGroup.clear();
  const g = current.g; if (!g) return;
  for (const p of current.parts) addPartToScene(p);
  if (cfg.showDevices !== false) for (const [x, y, z, sx, sy, sz, col] of mockups(cfg, g)) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(col, { transparent: true, opacity: 0.88, roughness: 0.5 }));
    m.position.set(x + sx / 2, y + sy / 2, z + sz / 2 + (viewMode === 'exp' ? zSpread(z) : 0)); mockGroup.add(m);
  }
  if (viewMode !== 'exp') for (const f of fanPoses(cfg, g)) fanGroup.add(fanMock(f));
  if (cfg.showRails !== false && !g.printed) {
    const L = g.NU * U, mm = mat('#a7adb4', { metalness: 0.55, roughness: 0.35 });
    for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const grp = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(g.RF, g.RT, L), mm); a.position.set(g.RF / 2, g.RT / 2, L / 2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(g.RT, g.RS, L), mm); b.position.set(g.RT / 2, g.RS / 2, L / 2);
      grp.add(a, b); grp.scale.set(mx, my, 1); grp.position.set(mx < 0 ? g.W : 0, my < 0 ? g.D : 0, g.Z0);
      if (viewMode === 'exp') grp.position.x += (mx < 0 ? 1 : -1) * 40, grp.position.y += (my < 0 ? 1 : -1) * 40;
      railGroup.add(grp);
    }
  }
  rebuildFloor();
  const key = `${cfg.std}|${g.D}|${g.NU}|${viewMode}`;
  if (framedFor !== key && viewMode !== 'bed') { frameAssembly(); framedFor = key; }
}
function rebuildFloor() {
  floorGroup.clear();
  const g = current.g; if (!g) return;
  const c = themeColors();
  const size = Math.ceil(Math.max(g.W, g.D) * 3 / 100) * 100;
  const grid = new THREE.GridHelper(size, size / 50, new THREE.Color(c.line), new THREE.Color(c.line));
  grid.rotation.x = Math.PI / 2; grid.position.set(g.W / 2, g.D / 2, -12.5);
  floorGroup.add(grid);
}
function frameAssembly() {
  const g = current.g; if (!g) return;
  const h = g.H, cx = g.W / 2, cy = g.D / 2, cz = h / 2;
  const dist = (Math.max(h, g.W) * 1.5 + 120) * (viewMode === 'exp' ? 1.45 : 1);
  camera.position.set(cx - dist * 0.55, cy - dist * 0.85, cz + dist * 0.35);
  controls.target.set(cx, cy, cz * 0.95); controls.update();
}
function highlight() {
  const has = !!selected;
  for (const m of partGroup.children) {
    const on = has && m.userData.partId === selected.partId && m.userData.pieceIdx === selected.pieceIdx;
    const p = current.parts.find(x => x.id === m.userData.partId);
    if (!p) continue;
    m.material = on ? mat(themeColors().accent || '#d2601a', { emissive: '#5a2000', emissiveIntensity: 0.35 }) : has ? mat(p.color, { transparent: true, opacity: 0.28, depthWrite: false }) : mat(p.color);
  }
}
function showBed() {
  bedGroup.clear();
  root.visible = viewMode !== 'bed';
  if (viewMode !== 'bed') return;
  const [bx, by] = cfg.bed;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(bx, by, 2), mat('#2b2f35', { roughness: 0.8 }));
  plate.position.set(bx / 2, by / 2, -1); bedGroup.add(plate);
  const grid = new THREE.GridHelper(Math.max(bx, by), Math.round(Math.max(bx, by) / 20), 0x555b63, 0x3d4249);
  grid.rotation.x = Math.PI / 2; grid.position.set(bx / 2, by / 2, 0.05); grid.scale.set(bx / Math.max(bx, by), by / Math.max(bx, by), 1); bedGroup.add(grid);
  const m = +(cfg.bedMargin ?? 0) || 0;
  if (m > 0) {
    const pts = [[m, m], [bx - m, m], [bx - m, by - m], [m, by - m], [m, m]].map(([x, y]) => new THREE.Vector3(x, y, 0.3));
    bedGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf0b04a })));
  }
  const sel = selected || firstPiece();
  if (sel) {
    const p = current.parts.find(x => x.id === sel.partId);
    const pc = p && current.results.get(p.id)?.pieces[sel.pieceIdx];
    if (pc) {
      const pm = printMesh(pc.mesh, p.print, cfg.bed);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pm.pos, 3)); geo.setIndex(new THREE.BufferAttribute(pm.idx, 1));
      const ng = geo.toNonIndexed(); ng.computeVertexNormals();
      bedGroup.add(new THREE.Mesh(ng, mat(pc.fits ? p.color : '#d0453a')));
      if (!selected) { selected = sel; renderParts(); }
    }
  }
  const d = Math.max(bx, by) * 1.6;
  camera.position.set(bx / 2 - d * 0.45, by / 2 - d * 0.75, d * 0.75);
  controls.target.set(bx / 2, by / 2, 10); controls.update();
}
function firstPiece() { for (const p of current.parts) { const r = current.results.get(p.id); if (r && r.pieces.length) return { partId: p.id, pieceIdx: 0 }; } return null; }
function setView(v) {
  viewMode = v; renderControls();
  if (v === 'bed') { showBed(); return; }
  bedGroup.clear(); root.visible = true; framedFor = ''; rebuildScene();
}
// clic: seleccionar · doble clic en una tapa: abrir su diseño · modo ventilador: poner/quitar
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(partGroup.children, false)[0] || null;
}
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || viewMode === 'bed') return;
  const hit = pick(e);
  if (fanMode) { placeFan(hit); return; }
  if (hit) select(hit.object.userData.partId, hit.object.userData.pieceIdx); else select(null);
});
renderer.domElement.addEventListener('dblclick', e => {
  if (fanMode || viewMode === 'bed') return;
  const hit = pick(e);
  if (hit && hit.object.userData.panelId) openEditor(hit.object.userData.panelId);
});
let moveQueued = null;
renderer.domElement.addEventListener('pointermove', e => {
  if (!fanMode || e.buttons) return;
  if (!moveQueued) requestAnimationFrame(() => { const ev = moveQueued; moveQueued = null; showGhost(pick(ev)); });
  moveQueued = e;
});
renderer.domElement.addEventListener('pointerleave', () => ghostGroup.clear());

// ------------------------------------------------------------------ ventiladores en 3D
let fanMode = false, fanSize = 80;
function fanFromHit(hit) {
  if (!hit) return {};
  const pid = hit.object.userData.panelId;
  const p = pid && cfg.panels.find(x => x.id === pid);
  if (!p) return { err: 'Los ventiladores van en las tapas: frontales, traseras, laterales o superior.' };
  const [a, b] = worldToPanel(p, hit.point, current.g);
  const near = p.shapes.findIndex(s => s.t === 'fan' && Math.hypot(s.x - a, s.y - b) < s.s / 2);
  if (near >= 0) return { p, remove: near, f: p.shapes[near] };
  const f = fitFan(p, current.g, fanSize, a, b);
  if (!f) return { err: `Un ventilador de ${fanSize} mm no cabe en esta tapa. Prueba uno más pequeño.` };
  const clash = p.shapes.some(s => s.t === 'fan' && Math.hypot(s.x - f.x, s.y - f.y) < (s.s + f.s) / 2 + 4);
  return { p, f, clash };
}
function placeFan(hit) {
  const r = fanFromHit(hit);
  if (r.err) { toast(r.err); return; }
  if (!r.f) return;
  if (r.remove !== undefined) { r.p.shapes.splice(r.remove, 1); toast(`Ventilador de ${r.f.s} mm quitado`); }
  else if (r.clash) { toast('Se solapa con otro ventilador. Haz clic sobre él para quitarlo.'); return; }
  else {
    // el ventilador sustituye a lo que hubiera debajo de él en la plantilla
    r.p.shapes.push(r.f); toast(`Ventilador de ${r.f.s} mm en ${panelLabel(r.p)}`);
  }
  r.p.auto = false;
  ghostGroup.clear(); changed();
}
function orient(obj, n) { if (n === 'y') obj.rotation.set(0, 0, 0); else if (n === 'x') obj.rotation.set(0, 0, Math.PI / 2); else obj.rotation.set(Math.PI / 2, 0, 0); }
function fanMock(f) {
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(f.s, 25, f.s), mat('#26292d', { roughness: 0.7 }));
  const blades = new THREE.Mesh(new THREE.CylinderGeometry(f.s / 2 - 2, f.s / 2 - 2, 26, 32), mat('#3a3f45', { roughness: 0.6 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(f.s * 0.2, f.s * 0.2, 27, 24), mat('#4a6fa5', { roughness: 0.5 }));
  grp.add(frame, blades, hub);
  orient(grp, f.n); grp.position.set(...f.c);
  return grp;
}
function showGhost(hit) {
  ghostGroup.clear();
  const r = fanFromHit(hit);
  const f = r.f; if (!f) { renderer.domElement.style.cursor = hit ? 'not-allowed' : 'crosshair'; return; }
  renderer.domElement.style.cursor = r.clash ? 'not-allowed' : 'crosshair';
  const col = r.remove !== undefined || r.clash ? '#e5383b' : '#1f7ae0';
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(f.s / 2, f.s / 2, 3, 40, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
  const disc = new THREE.Mesh(new THREE.BoxGeometry(f.s + 6, 1.2, f.s + 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthTest: false }));
  const grp = new THREE.Group(); grp.add(ring, disc); grp.renderOrder = 5; ring.renderOrder = 5; disc.renderOrder = 5;
  const p = panelToWorld(r.p, f.x, f.y, current.g, -1.5); orient(grp, p.n); grp.position.set(...p.c);
  ghostGroup.add(grp);
}
const HINT = 'Arrastra para girar · rueda o pellizco para zoom · doble clic en una tapa para diseñarla';
function setFanMode(on) {
  fanMode = on;
  $('fanBtn').setAttribute('aria-pressed', String(on));
  viewer.classList.toggle('placing', on);
  $('hint').textContent = on ? `Clic en una tapa para poner un ventilador de ${fanSize} mm · clic sobre uno para quitarlo · Esc para terminar` : HINT;
  ghostGroup.clear(); renderer.domElement.style.cursor = on ? 'crosshair' : '';
  if (on && viewMode !== 'asm') setView('asm');
  if (on) select(null);
}
$('fanBtn').addEventListener('click', () => setFanMode(!fanMode));
$('fanSize').addEventListener('change', e => { fanSize = +e.target.value; if (fanMode) setFanMode(true); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && fanMode) setFanMode(false); });
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ------------------------------------------------------------------ editor 2D de tapas
let ed = null;   // { pid, sel }
const FIELDS = {
  fan: [['s', 'Tamaño', 'fan']], circle: [['d', 'Diámetro']], rect: [['w', 'Ancho'], ['h', 'Alto'], ['r', 'Radio esquina']],
  slot: [['w', 'Largo'], ['h', 'Ancho']], slots: [['w', 'Ancho zona'], ['h', 'Alto zona'], ['sw', 'Ancho ranura'], ['pitch', 'Paso'], ['dir', 'Dirección', 'dir']],
  hex: [['w', 'Ancho zona'], ['h', 'Alto zona'], ['cell', 'Hexágono'], ['web', 'Nervio']],
  holes: [['w', 'Ancho zona'], ['h', 'Alto zona'], ['d', 'Diámetro'], ['pitch', 'Paso']], keystone: [['n', 'Cantidad', 'int']],
};
function edPanel() { return ed && cfg.panels.find(p => p.id === ed.pid); }
function openEditor(pid) {
  if (fanMode) setFanMode(false);
  ed = { pid, sel: -1 };
  $('editor').hidden = false; document.body.classList.add('modal');
  renderEditor();
  $('edDone').focus();
}
function closeEditor() { ed = null; $('editor').hidden = true; document.body.classList.remove('modal'); }
function edChanged() { const p = edPanel(); p.auto = false; save(); renderEditor(); renderControls(); clearTimeout(debounce); debounce = setTimeout(regenerate, 500); }
function renderEditor() {
  const p = edPanel(); if (!p) { closeEditor(); return; }
  const g = derive(cfg), { Lw, Lh } = panelDims(p, g), sa = safeArea(p, g);
  $('edTitle').textContent = panelLabel(p);
  $('edSize').textContent = `${fmt(Lw, 1)} × ${fmt(Lh, 1)} mm · vista desde fuera`;
  const tsel = $('edTpl');
  tsel.innerHTML = '<option value="">Elegir plantilla…</option>' + Object.entries(TEMPLATES).filter(([k]) => k !== 'patch' || p.side === 'front' || p.side === 'rear').map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  const Y = (y) => Lh - y;
  let ctx = `<rect x="0" y="0" width="${Lw}" height="${Lh}" class="pf"/>`;
  if (p.side === 'front' || p.side === 'rear') {
    ctx += `<rect x="0" y="0" width="${g.FL_W}" height="${Lh}" class="zone"/><rect x="${Lw - g.FL_W}" y="0" width="${g.FL_W}" height="${Lh}" class="zone"/>`;
    for (let u = 0; u < p.nu; u++) for (const hz of g.HOLE_Z) for (const x of [g.HOLE_X, Lw - g.HOLE_X]) ctx += `<rect x="${x - 4.8}" y="${Y(u * U + hz) - 3.3}" width="9.6" height="6.6" rx="3.3" class="hole"/>`;
    for (const s of cfg.shelves) if (s.u >= p.u0 && s.u < p.u0 + p.nu) for (const x of (g.is19 ? [60, g.W / 2, g.W - 60] : [60, g.W - 60])) ctx += `<circle cx="${x}" cy="${Y((s.u - p.u0) * U + g.TRAY_Z + 8)}" r="1.7" class="hole"/>`;
  } else if (p.side === 'left' || p.side === 'right') {
    const z = g.RS + g.RT;
    ctx += `<rect x="0" y="0" width="${z}" height="${Lh}" class="zone"/><rect x="${Lw - z}" y="0" width="${z}" height="${Lh}" class="zone"/>`;
    for (let k = 0; k < p.nu; k++) if (k % 2 === 0 || k === p.nu - 1) for (const a of [g.BOLT_Y, Lw - g.BOLT_Y]) ctx += `<circle cx="${a}" cy="${Y((k + 0.5) * U)}" r="2.2" class="hole"/>`;
  } else {
    const m = g.RT + g.WALL;
    ctx += `<rect x="0" y="0" width="${m}" height="${Lh}" class="zone"/><rect x="${Lw - m}" y="0" width="${m}" height="${Lh}" class="zone"/>`;
    for (const x of [g.CB_X0 + g.CB[0] / 2, Lw - g.CB_X0 - g.CB[0] / 2]) for (const y of [g.CB_Y0 + 19, Lh - g.CB_Y0 - 19]) ctx += `<circle cx="${x}" cy="${Y(y)}" r="2.25" class="hole"/>`;
    ctx += `<text x="${Lw / 2}" y="${Lh + 14}" class="lbl">frente</text>`;
  }
  ctx += `<rect x="${sa.a0}" y="${Y(sa.b1)}" width="${sa.a1 - sa.a0}" height="${sa.b1 - sa.b0}" class="safe"/>`;
  let shapes = '';
  p.shapes.forEach((s, i) => {
    const [w, h] = shapeSize(s);
    let inner = ''; for (const q of prims(s)) inner += primSvg(q, Lh);
    shapes += `<g class="shp${i === ed.sel ? ' on' : ''}" data-i="${i}">${inner}<rect class="hit" x="${s.x - w / 2 - 1}" y="${Y(s.y + h / 2) - 1}" width="${w + 2}" height="${h + 2}"/></g>`;
  });
  const pad = 18;
  $('edSvg').setAttribute('viewBox', `${-pad} ${-pad} ${Lw + 2 * pad} ${Lh + 2 * pad + (p.side === 'top' ? 6 : 0)}`);
  $('edSvg').innerHTML = `<g class="ctx">${ctx}</g><g class="pc">${shapes}</g>`;
  // propiedades
  const s = p.shapes[ed.sel];
  let ph = '';
  if (s) {
    ph += `<div class="edhead">${SHAPE_TYPES[s.t]}</div>`;
    const field = ([k, label, kind]) => {
      if (kind === 'fan') return `<label>${label}<select data-k="${k}">${Object.keys(FAN_SIZES).map(z => `<option value="${z}"${+z === s.s ? ' selected' : ''}>${z} mm</option>`).join('')}</select></label>`;
      if (kind === 'dir') return `<label>${label}<select data-k="${k}"><option value="h"${s.dir !== 'v' ? ' selected' : ''}>Horizontales</option><option value="v"${s.dir === 'v' ? ' selected' : ''}>Verticales</option></select></label>`;
      return `<label>${label}<input type="number" data-k="${k}" step="${kind === 'int' ? 1 : 0.5}" min="${kind === 'int' ? 1 : 0}" value="${s[k]}"></label>`;
    };
    ph += [['x', 'Centro a'], ['y', 'Centro b']].map(f => field(f)).join('') + FIELDS[s.t].map(field).join('');
    ph += `<div class="edbtns"><button type="button" class="btn" data-ed="dup">Duplicar</button><button type="button" class="btn" data-ed="del">Borrar</button></div>`;
  } else {
    ph = `<div class="edhead">Diseño</div><p class="sub">${p.shapes.length ? `${p.shapes.length} forma${p.shapes.length > 1 ? 's' : ''}. ` : 'Tapa lisa. '}Añade formas arriba o elige una plantilla. Arrastra para mover, haz clic para editar medidas.</p><p class="sub">La línea discontinua marca la zona útil: lo que salga de ella se recorta para no tocar orejas, raíles ni tornillos.</p>`;
  }
  $('edProps').innerHTML = ph;
}
$('edAdd').addEventListener('click', e => {
  const b = e.target.closest('button[data-t]'); if (!b) return;
  const p = edPanel(), s = defaultShape(b.dataset.t, p, derive(cfg));
  p.shapes.push(s); ed.sel = p.shapes.length - 1; edChanged();
});
$('edTpl').addEventListener('change', e => {
  const v = e.target.value; if (!v) return;
  const p = edPanel(); p.tpl = v; p.shapes = templateShapes(v, p, derive(cfg)); ed.sel = -1;
  edChanged(); p.auto = true; save(); renderControls();
});
$('edClear').addEventListener('click', () => { const p = edPanel(); p.shapes = []; ed.sel = -1; edChanged(); });
$('edDone').addEventListener('click', () => { closeEditor(); changed(); });
$('editor').addEventListener('click', e => { if (e.target === $('editor')) { closeEditor(); changed(); } });
$('edProps').addEventListener('change', e => {
  const el = e.target, k = el.dataset.k; if (!k) return;
  const p = edPanel(), s = p.shapes[ed.sel]; if (!s) return;
  if (k === 'dir') s.dir = el.value;
  else { let v = +el.value; if (isNaN(v)) return; if (k === 'n') v = clamp(Math.round(v), 1, 24); if (k === 's') { const f = fitFan(p, derive(cfg), v, s.x, s.y); if (!f) { toast(`Un ventilador de ${v} mm no cabe en esta tapa.`); renderEditor(); return; } Object.assign(s, f); } else s[k] = Math.max(k === 'x' || k === 'y' || k === 'r' ? -1e4 : 1, v); }
  edChanged();
});
$('edProps').addEventListener('click', e => {
  const b = e.target.closest('button[data-ed]'); if (!b) return;
  const p = edPanel(), s = p.shapes[ed.sel]; if (!s) return;
  if (b.dataset.ed === 'del') { p.shapes.splice(ed.sel, 1); ed.sel = -1; }
  if (b.dataset.ed === 'dup') { const c = { ...s, x: s.x + 10, y: s.y }; p.shapes.push(c); ed.sel = p.shapes.length - 1; }
  edChanged();
});
let drag = null;
function svgPoint(e) {
  const svg = $('edSvg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
$('edSvg').addEventListener('pointerdown', e => {
  const gEl = e.target.closest('g.shp');
  if (!gEl) { if (ed.sel !== -1) { ed.sel = -1; renderEditor(); } return; }
  const i = +gEl.dataset.i, p = edPanel(), s = p.shapes[i];
  ed.sel = i; renderEditor();
  const el = $('edSvg').querySelector(`g.shp[data-i="${i}"]`);
  drag = { i, start: svgPoint(e), x0: s.x, y0: s.y, el, moved: false };
  $('edSvg').setPointerCapture(e.pointerId);
});
$('edSvg').addEventListener('pointermove', e => {
  if (!drag) return;
  const q = svgPoint(e), dx = q.x - drag.start.x, dy = q.y - drag.start.y;
  if (Math.hypot(dx, dy) > 0.5) drag.moved = true;
  drag.el.setAttribute('transform', `translate(${Math.round(dx * 2) / 2} ${Math.round(dy * 2) / 2})`);
  drag.dx = Math.round(dx * 2) / 2; drag.dy = Math.round(dy * 2) / 2;
});
$('edSvg').addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.moved) return;
  const p = edPanel(), s = p.shapes[d.i];
  s.x = d.x0 + (d.dx || 0); s.y = d.y0 - (d.dy || 0);
  if (s.t === 'fan') { const f = fitFan(p, derive(cfg), s.s, s.x, s.y); if (f) Object.assign(s, f); }
  edChanged();
});
window.addEventListener('keydown', e => {
  if (!ed) return;
  if (e.key === 'Escape') { closeEditor(); changed(); return; }
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const p = edPanel(), s = p && p.shapes[ed.sel]; if (!s) return;
  const st = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
  if (mv) { s.x += mv[0]; s.y += mv[1]; e.preventDefault(); edChanged(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { p.shapes.splice(ed.sel, 1); ed.sel = -1; e.preventDefault(); edChanged(); }
});

// ------------------------------------------------------------------ descargas
function fileBase(p, pc) { return `${pc.id}__x${p.inst.length}`; }
async function offer(filename, blob) {
  let dl = null;
  try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data: blob }); toast('Descarga lista'); }
    catch (e) { toast(e && e.code === 'declined' ? 'Descarga cancelada' : 'No se pudo descargar aquí. Abre la página en el navegador.'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function readme() {
  const g = current.g, lines = [];
  lines.push('PRINTMYHOMELAB · RACK', '='.repeat(40), '');
  lines.push(`Rack ${cfg.std}" · ${g.NU}U · ancho ${fmt(g.W, 1)} mm · fondo ${g.D} mm · alto total ≈ ${fmt(g.H + 12)} mm`);
  lines.push(`Raíles: ${cfg.rails === 'metal' ? `metálicos comprados, 4 × ${g.NU}U (${fmt(g.NU * U, 1)} mm)` : 'impresos en L (ver piezas «Raíl»)'}`);
  lines.push(`Cama de impresión: ${cfg.bed.join(' × ')} mm (zona útil ${effBed().join(' × ')} mm, margen ${cfg.bedMargin ?? 0} mm)`, '');
  lines.push('TAPAS');
  for (const side of SIDE_ORDER) for (const p of cfg.panels.filter(x => x.side === side).sort((a, b) => a.u0 - b.u0))
    lines.push(`  ${panelLabel(p)} · ${p.auto ? TEMPLATES[p.tpl] : 'diseño propio'} · ${p.shapes.length} formas`);
  lines.push('', 'BALDAS (de abajo arriba)');
  for (const s of [...cfg.shelves].sort((a, b) => a.u - b.u)) lines.push(`  U${s.u}  ${SHELF_TYPES[s.type].name}${s.dev ? ' · ' + (s.label || '') + ' ' + s.dev.join('×') + ' mm' : ''}`);
  lines.push('', 'PIEZAS (el nombre de archivo termina en __xN = imprimir N copias)');
  for (const row of pieceRows()) if (row.pc) lines.push(`  ${row.p.inst.length} × ${row.pc.id}.stl  (${row.pc.size.map(v => fmt(v)).join(' × ')} mm)${row.pc.fits ? '' : '  ¡NO CABE EN LA CAMA!'}`);
  lines.push('', 'TORNILLERÍA');
  for (const [t, n] of hardware(cfg, g, current.parts)) lines.push(`  ${n} × ${t}`);
  if (cfg.rails === 'metal') { lines.push('', 'DÓNDE COMPRAR RAÍLES'); for (const s of RAIL_SHOPS) lines.push(`  ${s.name}: ${s.url}`); }
  lines.push('', 'NOTAS',
    '  - Los STL ya vienen orientados para imprimir (cara exterior abajo en las tapas).',
    '  - Las piezas partidas encajan con colas de milano: limpia, prueba en seco y pega con CA o epoxi.',
    '  - PETG o ASA si el rack va a estar caliente; PLA vale para un armario ventilado.',
    '  - Las bandejas se atornillan con M3 a la tapa frontal y a la trasera de su U.',
    '  - Medidas de equipos aproximadas: mide router, mini PC y agujeros de la placa antes de imprimir.');
  return lines.join('\n');
}
async function downloadAll() {
  const btn = $('dlAll'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Empaquetando…';
  try {
    const zip = new JSZip();
    const dir = zip.folder('stl');
    for (const row of pieceRows()) if (row.pc) dir.file(fileBase(row.p, row.pc) + '.stl', stlBinary(printMesh(row.pc.mesh, row.p.print, cfg.bed), row.pc.id));
    zip.file('LEEME.txt', readme());
    zip.file('configuracion.json', JSON.stringify(cfg, null, 2));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await offer(`rack-homelab-${current.g.NU}U-${cfg.std}in.zip`, blob);
  } finally { btn.textContent = old; btn.disabled = false; }
}
async function downloadSelected() {
  if (!selected) return;
  const p = current.parts.find(x => x.id === selected.partId);
  const pc = p && current.results.get(p.id)?.pieces[selected.pieceIdx];
  if (!pc) return;
  const stl = stlBinary(printMesh(pc.mesh, p.print, cfg.bed), pc.id);
  if (window.claude?.use) {
    const zip = new JSZip(); zip.file(fileBase(p, pc) + '.stl', stl);
    await offer(fileBase(p, pc) + '.zip', await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }));
  } else await offer(fileBase(p, pc) + '.stl', new Blob([stl], { type: 'model/stl' }));
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

// ------------------------------------------------------------------ arranque
function setFold(folded) {
  document.querySelector('.main').classList.toggle('folded', folded);
  $('fold').setAttribute('aria-expanded', String(!folded));
  try { localStorage.setItem('rack-parts-folded', folded ? '1' : '0'); } catch (e) {}
}
$('fold').addEventListener('click', () => setFold($('fold').getAttribute('aria-expanded') === 'true'));
try { if (localStorage.getItem('rack-parts-folded') === '1') setFold(true); } catch (e) {}
$('hint').textContent = HINT;
initControls();
renderControls();
applyTheme();
resize();
current = { ...buildPartList({ ...cfg, bed: effBed() }), results: new Map() };
rebuildScene(); renderParts();
initKernel().then(k => { K = k; regenerate(); }).catch(e => {
  console.error(e);
  $('sum').innerHTML = '<span class="err">No se pudo cargar el motor de geometría. Recarga la página o ábrela en Chrome, Edge o Firefox.</span>';
});
