// ===================================================================
//  Interfaz: estado, visor 3D, lista de piezas y descargas
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
const STORE = 'rack-config-v1';
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

let cfg = load();
let K = null;
const cache = new Map();          // sig|bed -> { pieces, split }
let current = { parts: [], g: null, results: new Map() };
let selected = null;              // { partId, pieceIdx }
let viewMode = 'asm';
let runToken = 0;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.modules) {
      // configuraciones guardadas antes de existir el margen: pasar a "mis impresoras"
      if (s.bedMargin === undefined) { s.bed = [250, 220, 256]; s.bedPreset = 'mine'; s.bedMargin = 2; }
      return { ...defaultConfig(), ...s };
    }
  } catch (e) {}
  return defaultConfig();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) {} }

// ------------------------------------------------------------------ UI
function initControls() {
  const sel = $('addType');
  for (const [k, t] of Object.entries(MODULE_TYPES)) sel.add(new Option(t.name, k));
  sel.value = 'shelf';
  const ps = $('preset');
  for (const [k, p] of Object.entries(PRESETS)) ps.add(new Option(p.name, k));

  $('std').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cfg.std = b.dataset.v; changed(); });
  $('view').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setView(b.dataset.v); });
  const num = (id, key, lo, hi) => $(id).addEventListener('change', e => { const v = clamp(+e.target.value, lo, hi); if (!isNaN(v)) { cfg[key] = v; changed(); } });
  num('bedM', 'bedMargin', 0, 20);
  num('depth', 'depth', 180, 450); num('extraU', 'extraU', 0, 12); num('wall', 'wall', 2.4, 5); num('faceT', 'faceT', 3, 6);
  $('depthR').addEventListener('input', e => { $('depth').value = e.target.value; });
  $('depthR').addEventListener('change', e => { cfg.depth = +e.target.value; changed(); });
  ps.addEventListener('change', e => { cfg.bedPreset = e.target.value; const p = PRESETS[cfg.bedPreset]; if (p.bed) cfg.bed = [...p.bed]; changed(); });
  ['bedX', 'bedY', 'bedZ'].forEach((id, i) => $(id).addEventListener('change', e => { const v = clamp(+e.target.value, 100, 600); if (!isNaN(v)) { cfg.bed[i] = v; cfg.bedPreset = 'custom'; changed(); } }));
  $('showDevices').addEventListener('change', e => { cfg.showDevices = e.target.checked; save(); rebuildScene(); });
  $('showRails').addEventListener('change', e => { cfg.showRails = e.target.checked; save(); rebuildScene(); });
  $('addBtn').addEventListener('click', () => { cfg.modules.push(defaultModule($('addType').value)); changed(); });
  $('reset').addEventListener('click', () => { cfg = defaultConfig(); selected = null; changed(); });
  $('dlAll').addEventListener('click', downloadAll);
  $('dlSel').addEventListener('click', downloadSelected);

  const stack = $('stack');
  stack.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = +b.closest('.mod').dataset.i, act = b.dataset.act, M = cfg.modules;
    if (act === 'up' && i < M.length - 1) [M[i], M[i + 1]] = [M[i + 1], M[i]];
    if (act === 'down' && i > 0) [M[i], M[i - 1]] = [M[i - 1], M[i]];
    if (act === 'del') M.splice(i, 1);
    changed();
  });
  stack.addEventListener('change', e => {
    const el = e.target, mod = el.closest('.mod'); if (!mod) return;
    const m = cfg.modules[+mod.dataset.i], f = el.dataset.f;
    if (f === 'label') m.label = el.value.slice(0, 40);
    else if (f === 'button') m.button = el.checked;
    else if (f.startsWith('dev')) { const v = clamp(+el.value, 10, 600); if (!isNaN(v)) m.dev[+f[3]] = v; }
    else { const v = Math.round(+el.value); if (!isNaN(v)) m[f] = clamp(v, +el.min, +el.max); }
    changed();
  });
}
function effBed() { const m = +(cfg.bedMargin ?? 0) || 0; return [cfg.bed[0] - 2 * m, cfg.bed[1] - 2 * m, cfg.bed[2]]; }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function renderControls() {
  const g = derive(cfg);
  $('std').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === cfg.std)));
  $('view').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === viewMode)));
  $('depth').value = cfg.depth; $('depthR').value = cfg.depth; $('extraU').value = cfg.extraU; $('wall').value = cfg.wall; $('faceT').value = cfg.faceT;
  $('preset').value = cfg.bedPreset in PRESETS ? cfg.bedPreset : 'custom';
  $('bedM').value = cfg.bedMargin ?? 0;
  const eb = effBed(); $('bedEff').textContent = `Zona útil para las piezas: ${fmt(eb[0])} × ${fmt(eb[1])} × ${fmt(eb[2])} mm`;
  $('bedX').value = cfg.bed[0]; $('bedY').value = cfg.bed[1]; $('bedZ').value = cfg.bed[2];
  $('showDevices').checked = cfg.showDevices !== false; $('showRails').checked = cfg.showRails !== false;
  const outerD = g.D + 2 * g.FT, outerH = g.H + 12;
  $('dims').innerHTML = `<span><b>${g.NU}U</b> de raíl</span><span>ancho <b>${fmt(g.W, 1)}</b></span><span>fondo <b>${fmt(outerD)}</b></span><span>alto <b>${fmt(outerH)}</b> mm</span>`;

  const lay = moduleLayout(cfg);
  let html = '';
  if (cfg.extraU > 0) html += `<div class="free-u">U${g.NU - cfg.extraU + 1}–${g.NU} · ${cfg.extraU}U libres</div>`;
  for (let k = lay.length - 1; k >= 0; k--) {
    const { m, i, u0 } = lay[k], T = MODULE_TYPES[m.type];
    const range = m.u > 1 ? `U${u0}–${u0 + m.u - 1}` : `U${u0}`;
    const uMax = m.type === 'patch' ? 1 : m.type === 'compute' ? 8 : 8;
    let rows = '';
    if (m.type !== 'patch') rows += `<label>Alto <input type="number" data-f="u" min="${T.minU}" max="${uMax}" value="${m.u}"> U</label>`;
    if (m.type === 'storage') rows += `<label>HDD 3,5″ <input type="number" data-f="hdd" min="0" max="4" value="${m.hdd}"></label><label>SSD 2,5″ <input type="number" data-f="ssd" min="0" max="8" value="${m.ssd}"></label>`;
    if (m.type === 'compute') rows += `<label>SSD 2,5″ <input type="number" data-f="ssd" min="0" max="8" value="${m.ssd}"></label><label><input type="checkbox" data-f="button" ${m.button ? 'checked' : ''}> Pulsador + LED</label>`;
    if (m.type === 'patch') rows += `<label>Keystones <input type="number" data-f="keystones" min="1" max="${Math.floor((g.OPEN - 10) / 25)}" value="${m.keystones}"></label>`;
    let extra = '';
    if (m.dev) extra = `<div class="row"><input type="text" data-f="label" value="${esc(m.label || '')}" aria-label="Nombre del equipo" placeholder="Nombre del equipo"></div>
      <div class="row"><span>Equipo (mm)</span><label>an <input type="number" data-f="dev0" min="10" max="600" value="${m.dev[0]}"></label><label>fo <input type="number" data-f="dev1" min="10" max="600" value="${m.dev[1]}"></label><label>al <input type="number" data-f="dev2" min="5" max="400" value="${m.dev[2]}"></label></div>`;
    if (m.type === 'compute') extra = `<div class="row free">Placa micro-ATX 244×244 en vertical (HP IPM17-002), fuente SFX.</div>`;
    html += `<div class="mod" data-i="${i}"><div class="u">${range}<span>${m.u}U</span></div><div class="body">
      <div class="top"><strong title="${esc(T.name)}">${esc(m.label && m.dev ? m.label : T.name)}</strong>
        <button type="button" class="icon" data-act="up" aria-label="Subir" ${i === cfg.modules.length - 1 ? 'disabled' : ''}>▲</button>
        <button type="button" class="icon" data-act="down" aria-label="Bajar" ${i === 0 ? 'disabled' : ''}>▼</button>
        <button type="button" class="icon" data-act="del" aria-label="Quitar">✕</button></div>
      ${rows ? `<div class="row">${rows}</div>` : ''}${extra}</div></div>`;
  }
  if (!cfg.modules.length) html += `<div class="free-u">Sin módulos. Añade uno abajo.</div>`;
  $('stack').innerHTML = html;

  renderFans();
  const w = deviceWarnings(cfg, g);
  if (g.NU !== 14) w.unshift(`El rack mide ${g.NU}U. Tus raíles son de 14U: córtalos a ${fmt(g.NU * U, 1)} mm o usa raíles de ${g.NU}U.`);
  if (cfg.std === '19') w.push('En 19″ casi todas las piezas grandes se parten en trozos. Revisa la lista de impresión.');
  $('warnSec').hidden = true;
  $('warns').innerHTML = w.map(t => `<div class="warn">${esc(t)}</div>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let debounce = 0;
function changed() {
  save(); renderControls();
  clearTimeout(debounce); debounce = setTimeout(regenerate, 180);
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
  let done = 0; const t0 = performance.now();
  for (const p of parts) { const r = cache.get(p.sig + '|' + bedKey); if (r) current.results.set(p.id, r); }
  rebuildScene(); renderParts();
  setStatus(todo.length ? `Generando 0/${todo.length}…` : 'Listo', todo.length ? 0 : 1);
  for (const p of todo) {
    await new Promise(r => setTimeout(r, 0));
    if (token !== runToken) return;
    let r;
    try { r = generatePart(K, p, ecfg.bed); } catch (e) { console.error(p.id, e); r = { pieces: [], error: String(e) }; }
    cache.set(p.sig + '|' + bedKey, r);
    current.results.set(p.id, r);
    done++;
    setStatus(`Generando ${done}/${todo.length}…`, done / todo.length);
    addPartToScene(p);
    if (done % 4 === 0) renderParts();
  }
  if (token !== runToken) return;
  if (cache.size > 400) { const keep = new Set(parts.map(p => p.sig + '|' + bedKey)); for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k); }
  renderParts();
  setStatus(`Listo · ${todo.length ? fmt((performance.now() - t0) / 1000, 1) + ' s · ' : ''}motor ${K.name === 'manifold' ? 'Manifold' : 'JSCAD'}`, 1);
  if (viewMode === 'bed') showBed();
}
function setStatus(t, f) { $('status').textContent = t; $('barI').style.width = (f * 100).toFixed(0) + '%'; $('status').parentElement.hidden = t.startsWith('Listo'); }

// ------------------------------------------------------------------ lista
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
  $('sum').innerHTML = `<b>${prints}</b> impresiones de <b>${models}</b> modelos · <b>≈ ${fmt(grams / 1000, 2)} kg</b> de filamento (PLA/PETG, 4 perímetros, 25 % relleno)${bad ? ` · <b style="color:var(--bad)">${bad} no caben</b>` : ''}`;
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
  const box = $('selBox');
  const p = selected && current.parts.find(x => x.id === partId);
  const pc = p && current.results.get(p.id)?.pieces[pieceIdx];
  if (false) {
    box.innerHTML = `${esc(p.name)} ${pc.label ? `<span class="sub">${pc.label}</span>` : ''} · <b>${p.inst.length}×</b> · <b>${pc.size.map(v => fmt(v)).join('×')}</b> mm`;
  } else box.hidden = true;
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
function explodeOffset(p, inst) {
  if (viewMode !== 'exp') return [0, 0, 0];
  const g = current.g, e = p.explode || [0, 0, 0];
  const o = [e[0] * 90, e[1] * 140, e[2] * 90];
  if (p.id.startsWith('pared_')) o[0] = p.id.includes('_izq') ? -110 : 110;
  if (p.id === 'bloque_esquina') o[0] = (inst.s && inst.s[0] < 0) ? 50 : -50;
  if (p.id.startsWith('pared_') || /^m\d|^trasera/.test(p.id)) o[2] += (inst.t[2] - g.Z0) / (g.NU * U) * 160;
  const top = p.id.startsWith('tapa_superior');
  if (top || (p.id === 'bloque_esquina' && inst.s && inst.s[2] < 0)) o[2] += 160 + (top ? 90 : 40);
  return o;
}
function addPartToScene(p) {
  const r = current.results.get(p.id); if (!r) return;
  for (const old of partGroup.children.filter(o => o.userData.partId === p.id)) partGroup.remove(old);
  r.pieces.forEach((pc, k) => {
    const geo = geomFor(pc);
    for (const inst of p.inst) {
      const m = new THREE.Mesh(geo, mat(p.color));
      const o = explodeOffset(p, inst);
      // con varios trozos, separa un poco en despiece para ver las uniones
      const cut = r.pieces.length > 1 && viewMode === 'exp' ? k * 6 : 0;
      m.position.set(inst.t[0] + o[0] + cut, inst.t[1] + o[1] + cut * 0.3, inst.t[2] + o[2] + cut * 0.3);
      if (inst.s) m.scale.set(...inst.s);
      m.userData = { partId: p.id, pieceIdx: k, inst };
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
    const ez = viewMode === 'exp' ? (z - g.Z0) / (g.NU * U) * 160 : 0;
    m.position.set(x + sx / 2, y + sy / 2, z + sz / 2 + ez); mockGroup.add(m);
  }
  for (const f of cfg.fans || []) fanGroup.add(fanMock(f, g));
  if (cfg.showRails !== false) {
    const L = g.NU * U, mm = mat('#a7adb4', { metalness: 0.55, roughness: 0.35 });
    for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const grp = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(g.RF, g.RT, L), mm); a.position.set(g.RF / 2, g.RT / 2, L / 2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(g.RT, g.RS, L), mm); b.position.set(g.RT / 2, g.RS / 2, L / 2);
      grp.add(a, b); grp.scale.set(mx, my, 1); grp.position.set(mx < 0 ? g.W : 0, my < 0 ? g.D : 0, g.Z0);
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
  const [bx, by] = cfg.bed, c = themeColors();
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
// selección con clic
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
let moveQueued = null;
renderer.domElement.addEventListener('pointermove', e => {
  if (!fanMode || e.buttons) return;
  if (!moveQueued) requestAnimationFrame(() => { const ev = moveQueued; moveQueued = null; showGhost(pick(ev)); });
  moveQueued = e;
});
renderer.domElement.addEventListener('pointerleave', () => ghostGroup.clear());

// ------------------------------------------------------------------ ventiladores
let fanMode = false, fanSize = 80;
const SURF_AB = { y: (p) => [p.x, p.z], x: (p) => [p.y, p.z], z: (p) => [p.x, p.y] };
function fanFromHit(hit) {
  if (!hit) return { err: null };
  const p = current.parts.find(x => x.id === hit.object.userData.partId);
  if (!p || !p.fan) return { err: 'Los ventiladores van en frontales, traseras, paredes laterales o tapas.' };
  const [a, b] = SURF_AB[p.fan.n](hit.point);
  const near = (cfg.fans || []).findIndex(f => f.surf === p.fan.surf && Math.hypot(f.a - a, f.b - b) < f.s / 2);
  if (near >= 0) return { remove: near, f: cfg.fans[near] };
  const f = snapFan(p, hit.object.userData.inst, current.g, fanSize, a, b);
  if (!f) return { err: `Un ventilador de ${fanSize} mm no cabe en esta pieza. Prueba uno más pequeño.` };
  const clash = (cfg.fans || []).find(o => o.surf === f.surf && Math.hypot(o.a - f.a, o.b - f.b) < (o.s + f.s) / 2 + 4);
  return { f, clash };
}
function placeFan(hit) {
  const r = fanFromHit(hit);
  if (r.err) { toast(r.err); return; }
  if (!r.f) return;
  cfg.fans = cfg.fans || [];
  if (r.remove !== undefined) { cfg.fans.splice(r.remove, 1); toast(`Ventilador de ${r.f.s} mm quitado`); }
  else if (r.clash) { toast('Se solapa con otro ventilador. Haz clic sobre él para quitarlo.'); return; }
  else { cfg.fans.push(r.f); toast(`Ventilador de ${r.f.s} mm en ${SURF_NAMES[r.f.surf]}`); }
  ghostGroup.clear(); changed();
}
function surfPose(f, g, out = 0) {
  const top = g.Z0 + g.NU * U - g.POCKET;
  switch (f.surf) {
    case 'front': return { c: [f.a, -g.FT - out, f.b], n: 'y' };
    case 'rear': return { c: [f.a, g.D + g.FT + out, f.b], n: 'y' };
    case 'left': return { c: [g.RT - out, f.a, f.b], n: 'x' };
    case 'right': return { c: [g.W - g.RT + out, f.a, f.b], n: 'x' };
    case 'top': return { c: [f.a, f.b, top + g.PLATE_T + out], n: 'z' };
    case 'bottom': return { c: [f.a, f.b, -out], n: 'z' };
  }
}
function orient(obj, n) { if (n === 'y') obj.rotation.set(0, 0, 0); else if (n === 'x') obj.rotation.set(0, 0, Math.PI / 2); else obj.rotation.set(Math.PI / 2, 0, 0); }
function fanMock(f, g) {
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(f.s, 25, f.s), mat('#26292d', { roughness: 0.7 }));
  const blades = new THREE.Mesh(new THREE.CylinderGeometry(f.s / 2 - 2, f.s / 2 - 2, 26, 32), mat('#3a3f45', { roughness: 0.6 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(f.s * 0.2, f.s * 0.2, 27, 24), mat('#4a6fa5', { roughness: 0.5 }));
  grp.add(frame, blades, hub);
  const p = fanPose(f, g); orient(grp, p.n); grp.position.set(...p.c);
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
  const p = surfPose(f, current.g, 1.5); orient(grp, p.n); grp.position.set(...p.c);
  ghostGroup.add(grp);
}
function setFanMode(on) {
  fanMode = on;
  $('fanBtn').setAttribute('aria-pressed', String(on));
  viewer.classList.toggle('placing', on);
  $('hint').textContent = on ? `Clic en un frontal, trasera, lateral o tapa para poner un ventilador de ${fanSize} mm · clic sobre uno para quitarlo · Esc para terminar`
    : 'Arrastra para girar · rueda o pellizco para zoom · clic en una pieza para seleccionarla';
  ghostGroup.clear(); renderer.domElement.style.cursor = on ? 'crosshair' : '';
  if (on && viewMode !== 'asm') setView('asm');
  if (on) select(null);
}
function renderFans() {
  const fans = cfg.fans || [];
  $('fanList').innerHTML = fans.length ? fans.map((f, i) => `<div class="fanrow"><span class="pill cut">${f.s} mm</span><span>${SURF_NAMES[f.surf]} · ${fanWhere(f)}</span><button type="button" class="icon" data-del="${i}" aria-label="Quitar ventilador">✕</button></div>`).join('')
    : '<div class="free-u">Sin ventiladores extra. Pulsa «Ventilador» en el visor y haz clic donde lo quieras.</div>';
  $('fanClear').hidden = fans.length < 2;
}
function fanWhere(f) {
  const g = current.g || derive(cfg);
  if (f.surf === 'top' || f.surf === 'bottom') return `x ${fmt(f.a)} · y ${fmt(f.b)} mm`;
  const u = Math.floor((f.b - g.Z0) / U) + 1;
  return `U${Math.max(1, Math.min(g.NU, u))} · ${f.surf === 'front' || f.surf === 'rear' ? 'x ' + fmt(f.a) : 'fondo ' + fmt(f.a)} mm`;
}
$('fanBtn').addEventListener('click', () => setFanMode(!fanMode));
$('fanSize').addEventListener('change', e => { fanSize = +e.target.value; if (fanMode) setFanMode(true); });
$('fanList').addEventListener('click', e => { const b = e.target.closest('button[data-del]'); if (!b) return; cfg.fans.splice(+b.dataset.del, 1); changed(); });
$('fanClear').addEventListener('click', () => { cfg.fans = []; changed(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && fanMode) setFanMode(false); });
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

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
  lines.push('CONFIGURADOR RACK HOME LAB', '='.repeat(40), '');
  lines.push(`Rack ${cfg.std}" · ${g.NU}U · ancho ${fmt(g.W, 1)} mm · fondo ${g.D} mm · alto total ≈ ${fmt(g.H + 12)} mm`);
  lines.push(`Cama de impresión: ${cfg.bed.join(' × ')} mm (zona útil ${effBed().join(' × ')} mm, margen ${cfg.bedMargin ?? 0} mm)`, '');
  lines.push('MÓDULOS (de abajo arriba)');
  for (const { m, u0 } of moduleLayout(cfg)) lines.push(`  U${u0}${m.u > 1 ? '-' + (u0 + m.u - 1) : ''}  ${MODULE_TYPES[m.type].name}${m.label && m.dev ? ' · ' + m.label + ' ' + m.dev.join('×') + ' mm' : ''}`);
  lines.push('', 'PIEZAS (el nombre de archivo termina en __xN = imprimir N copias)');
  for (const row of pieceRows()) if (row.pc) lines.push(`  ${row.p.inst.length} × ${row.pc.id}.stl  (${row.pc.size.map(v => fmt(v)).join(' × ')} mm)${row.pc.fits ? '' : '  ¡NO CABE EN LA CAMA!'}`);
  lines.push('', 'TORNILLERÍA');
  for (const [t, n] of hardware(cfg, g, current.parts)) lines.push(`  ${n} × ${t}`);
  lines.push('', 'NOTAS',
    '  - Los STL ya vienen orientados para imprimir (cara plana abajo).',
    '  - Las piezas partidas encajan con colas de milano: limpia, prueba en seco y pega con CA o epoxi.',
    '  - PETG o ASA si el rack va a estar caliente; PLA vale para un armario ventilado.',
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
  if (window.claude?.use) {   // dentro de claude.ai solo se permite .zip
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
initControls();
renderControls();
applyTheme();
resize();
current = { ...buildPartList({ ...cfg, bed: effBed() }), results: new Map() };
rebuildScene(); renderParts();
initKernel().then(k => { K = k; regenerate(); }).catch(e => {
  console.error(e); setStatus('No se pudo cargar el motor 3D', 0);
  $('sum').innerHTML = '<span class="err">No se pudo cargar el motor de geometría. Recarga la página o ábrela en Chrome, Edge o Firefox.</span>';
});
