// ===================================================================
//  Genera las piezas (con corte automático) y sus mallas
// ===================================================================
import { puzzleSplit, planSplit, fitsRect } from './geo.js';
import { printMesh, volumeOf } from './kernel.js';

const AXI = { x: 0, y: 1, z: 2 };
function evenCuts(a0, a1, n) { const c = []; for (let k = 1; k < n; k++) c.push(a0 + (a1 - a0) * k / n); return c; }
function tabPositions(b0, b1) {
  const L = b1 - b0;
  if (L < 40) return [(b0 + b1) / 2];
  const n = Math.max(2, Math.round(L / 55));
  const m = Math.min(14, L / 6);
  const out = []; for (let k = 0; k < n; k++) out.push(b0 + m + (L - 2 * m) * k / (n - 1));
  return out;
}

export function generatePart(K, part, bed) {
  try {
    const solid = part.build(K);
    let pieces = [solid];
    let plan = { na: 1, nb: 1 };
    if (part.plane) {
      const bb = K.bbox(solid);
      const [a, b] = part.plane;
      const eA = bb.max[AXI[a]] - bb.min[AXI[a]], eB = bb.max[AXI[b]] - bb.min[AXI[b]];
      plan = planSplit(eA, eB, bed);
      if (plan.na > 1) pieces = puzzleSplit(K, solid, a, evenCuts(bb.min[AXI[a]], bb.max[AXI[a]], plan.na), b, tabPositions(bb.min[AXI[b]], bb.max[AXI[b]]));
      if (plan.nb > 1) {
        const next = [];
        for (const p of pieces) {
          const pb = K.bbox(p);
          next.push(...puzzleSplit(K, p, b, evenCuts(bb.min[AXI[b]], bb.max[AXI[b]], plan.nb), a, tabPositions(pb.min[AXI[a]] + 10, pb.max[AXI[a]] - 10)));
        }
        pieces = next;
      }
    }
    const out = [];
    pieces.forEach((p, i) => {
      if (K.isEmpty(p)) return;
      const mesh = K.mesh(p);
      const pm = printMesh(mesh, part.print, bed);
      const s = pm.size;
      out.push({
        id: pieces.length > 1 ? `${part.id}_${i + 1}de${pieces.length}` : part.id,
        label: pieces.length > 1 ? `trozo ${i + 1}/${pieces.length}` : '',
        mesh, size: s, fits: fitsRect(s[0], s[1], bed) && s[2] <= bed[2], volume: volumeOf(mesh.pos, mesh.idx),
      });
    });
    return { pieces: out, split: plan.na * plan.nb > 1, plan };
  } finally {
    K.clear();
  }
}
