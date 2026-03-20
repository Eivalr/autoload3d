/* =============================================
   algorithms.js
   LAFF · DBLF · Layer Builder
   ============================================= */

'use strict';

// ─── SHARED UTILITIES ─────────────────────────────

function getOrientations(item) {
  const { l, w, h, rotatable } = item;
  if (!rotatable) return [{ il: l, iw: w, ih: h }];
  const raw = [
    [l, w, h], [l, h, w],
    [w, l, h], [w, h, l],
    [h, l, w], [h, w, l],
  ];
  const seen = new Set();
  return raw.filter(([a,b,c]) => {
    const k = [a,b,c].sort().join(',');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).map(([il,iw,ih]) => ({ il, iw, ih }));
}

function categoryAllowsStack(topCat, baseCat) {
  const rules = {
    pallet:  ['pallet'],
    crate:   ['pallet','crate'],
    box:     ['pallet','crate','box'],
    barrel:  [],
    custom:  ['pallet','crate','box','custom'],
  };
  return (rules[topCat]||[]).includes(baseCat);
}

function canStackOn(topItem, itemsBelow) {
  if (!topItem.stackable && itemsBelow.length > 0) return false;
  for (const base of itemsBelow) {
    if (topItem.stackPriority > base.stackPriority) return false;
    if (topItem.weight > base.maxLoadOnTop) return false;
    if (!categoryAllowsStack(topItem.category, base.category)) return false;
  }
  return true;
}

function getFloorLevel(x, z, il, iw, placed) {
  let maxY = 0;
  for (const p of placed) {
    const ox = x < p.x + p.il && x + il > p.x;
    const oz = z < p.z + p.iw && z + iw > p.z;
    if (ox && oz) maxY = Math.max(maxY, p.y + p.ih);
  }
  return maxY;
}

function getItemsAtSurface(x, y, z, il, iw, placed) {
  return placed.filter(p =>
    x < p.x + p.il && x + il > p.x &&
    z < p.z + p.iw && z + iw > p.z &&
    Math.abs((p.y + p.ih) - y) < 2
  );
}

function fitsInEquipment(eq, x, y, z, il, iw, ih) {
  if (x < 0 || y < 0 || z < 0) return false;
  if (x + il > eq.L || y + ih > eq.H || z + iw > eq.W) return false;
  // ULD contour check
  if (eq.contourPoints) {
    return fitsInULDContour(eq, x, y, z, il, iw, ih);
  }
  return true;
}

// Score placement (lower = better)
function placementScore(x, y, z) {
  return y * 100000 + z * 1000 + x;
}

// Compute weight distribution metrics
function computeWeightMetrics(placed, eq) {
  if (placed.length === 0) return { cogX: 0, cogY: 0, cogZ: 0, balanced: true };
  let sumW = 0, sumWX = 0, sumWY = 0, sumWZ = 0;
  for (const p of placed) {
    const w = p.item.weight;
    sumW += w;
    sumWX += w * (p.x + p.il / 2);
    sumWY += w * (p.y + p.ih / 2);
    sumWZ += w * (p.z + p.iw / 2);
  }
  const cogX = sumWX / sumW;
  const cogY = sumWY / sumW;
  const cogZ = sumWZ / sumW;
  // Check balance: COG should be within 20% of center in each axis
  const balX = Math.abs(cogX - eq.L / 2) / eq.L < 0.25;
  const balZ = Math.abs(cogZ - eq.W / 2) / eq.W < 0.25;
  return { cogX, cogY, cogZ, balanced: balX && balZ, sumW };
}

// Compute axle loads for trucks
function computeAxleLoads(placed, eq) {
  if (!eq.axles) return null;
  const axleLoads = eq.axles.map(a => ({ ...a, load: 0 }));
  for (const p of placed) {
    const itemCogX = p.x + p.il / 2;
    const w = p.item.weight;
    // Distribute item weight to nearest two axles
    for (let i = 0; i < axleLoads.length - 1; i++) {
      const a1 = axleLoads[i], a2 = axleLoads[i + 1];
      if (itemCogX >= a1.pos && itemCogX <= a2.pos) {
        const span = a2.pos - a1.pos;
        const t = (itemCogX - a1.pos) / span;
        a1.load += w * (1 - t);
        a2.load += w * t;
        break;
      } else if (itemCogX < axleLoads[0].pos) {
        axleLoads[0].load += w;
        break;
      } else if (itemCogX > axleLoads[axleLoads.length-1].pos) {
        axleLoads[axleLoads.length-1].load += w;
        break;
      }
    }
  }
  return axleLoads;
}

// Sort items for realistic loading
function sortItemsForLoading(items) {
  return [...items].sort((a, b) => {
    if (b.stackPriority !== a.stackPriority) return b.stackPriority - a.stackPriority;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return (b.l * b.w) - (a.l * a.w);
  });
}

// ─── ALGORITHM 1: LAFF (Largest Area First Fit) ───
// Places items sorted by base area, finds first fitting position
// scanning from back-bottom-left

function packLAFF(items, eq) {
  const sorted = sortItemsForLoading(items);
  const placed = [];
  const unplaced = [];

  // Generate candidate positions
  function getCandidates() {
    if (placed.length === 0) return [{ x: 0, y: 0, z: 0 }];
    const pts = new Set();
    pts.add('0,0,0');
    for (const p of placed) {
      const nx = p.x + p.il;
      const ny = p.y + p.ih;
      const nz = p.z + p.iw;
      if (nx < eq.L) pts.add(`${nx},0,${p.z}`);
      if (ny < eq.H) pts.add(`${p.x},${ny},${p.z}`);
      if (nz < eq.W) pts.add(`${p.x},0,${nz}`);
    }
    return [...pts].map(s => { const [x,y,z] = s.split(',').map(Number); return {x,y,z}; });
  }

  for (const item of sorted) {
    const orients = getOrientations(item);
    let best = null;
    let bestScore = Infinity;

    const candidates = getCandidates();

    for (const { x, y: cy, z } of candidates) {
      for (const { il, iw, ih } of orients) {
        const y = getFloorLevel(x, z, il, iw, placed);
        if (!fitsInEquipment(eq, x, y, z, il, iw, ih)) continue;
        const below = getItemsAtSurface(x, y, z, il, iw, placed);
        if (!canStackOn(item, below.map(b => b.item))) continue;
        const s = placementScore(x, y, z);
        if (s < bestScore) { bestScore = s; best = { x, y, z, il, iw, ih }; }
      }
    }

    if (best) placed.push({ item, seq: placed.length + 1, ...best });
    else unplaced.push(item);
  }

  return { placed, unplaced, algorithm: 'LAFF' };
}

// ─── ALGORITHM 2: DBLF (Deepest Bottom Left Fill) ─
// Scans column by column (depth-first), fills from bottom

function packDBLF(items, eq) {
  const sorted = sortItemsForLoading(items);
  const placed = [];
  const unplaced = [];

  // Height map: grid of max heights at each (x,z) cell (10cm resolution)
  const GRID = 10;
  const gW = Math.ceil(eq.L / GRID);
  const gD = Math.ceil(eq.W / GRID);
  const hmap = new Float32Array(gW * gD); // all zeros

  function getHeight(gx, gz) { return hmap[gz * gW + gx] || 0; }
  function setHeight(gx, gz, h) { hmap[gz * gW + gx] = h; }

  function getFloorFromGrid(x, z, il, iw) {
    const gx0 = Math.floor(x / GRID), gx1 = Math.ceil((x + il) / GRID);
    const gz0 = Math.floor(z / GRID), gz1 = Math.ceil((z + iw) / GRID);
    let maxH = 0;
    for (let gx = gx0; gx < gx1; gx++)
      for (let gz = gz0; gz < gz1; gz++)
        maxH = Math.max(maxH, getHeight(Math.min(gx, gW-1), Math.min(gz, gD-1)));
    return maxH;
  }

  function markGrid(x, z, il, iw, h) {
    const gx0 = Math.floor(x / GRID), gx1 = Math.ceil((x + il) / GRID);
    const gz0 = Math.floor(z / GRID), gz1 = Math.ceil((z + iw) / GRID);
    for (let gx = gx0; gx < gx1; gx++)
      for (let gz = gz0; gz < gz1; gz++) {
        const gi = Math.min(gz, gD-1) * gW + Math.min(gx, gW-1);
        hmap[gi] = Math.max(hmap[gi], h);
      }
  }

  // Scan positions: step by GRID
  for (const item of sorted) {
    const orients = getOrientations(item);
    let best = null;
    let bestScore = Infinity;

    for (let gz = 0; gz < gD; gz++) {
      for (let gx = 0; gx < gW; gx++) {
        const x = gx * GRID, z = gz * GRID;
        for (const { il, iw, ih } of orients) {
          const y = getFloorFromGrid(x, z, il, iw);
          if (!fitsInEquipment(eq, x, y, z, il, iw, ih)) continue;
          const below = getItemsAtSurface(x, y, z, il, iw, placed);
          if (!canStackOn(item, below.map(b => b.item))) continue;
          // DBLF prefers: lowest y, then smallest z (depth), then smallest x
          const s = y * 1e8 + z * 1e4 + x;
          if (s < bestScore) { bestScore = s; best = { x, y, z, il, iw, ih }; }
        }
      }
    }

    if (best) {
      placed.push({ item, seq: placed.length + 1, ...best });
      markGrid(best.x, best.z, best.il, best.iw, best.y + best.ih);
    } else unplaced.push(item);
  }

  return { placed, unplaced, algorithm: 'DBLF' };
}

// ─── ALGORITHM 3: LAYER BUILDER ───────────────────
// Groups items into horizontal layers by height, fills each layer

function packLayerBuilder(items, eq) {
  const sorted = sortItemsForLoading(items);
  const placed = [];
  const unplaced = [];

  // Determine layer heights by clustering item heights
  const heights = sorted.map(i => i.h);
  const layers = buildLayers(heights, eq.H);

  let currentY = 0;
  let remaining = [...sorted];

  for (const layerH of layers) {
    if (currentY + layerH > eq.H) break;
    const { fit, leftover } = fillLayer(remaining, eq, currentY, layerH, placed);
    fit.forEach(p => placed.push({ ...p, seq: placed.length + 1 }));
    remaining = leftover;
    if (fit.length > 0) currentY += layerH;
    if (remaining.length === 0) break;
  }

  // Try to fit remaining in any gap
  for (const item of remaining) {
    const orients = getOrientations(item);
    let best = null;
    let bestScore = Infinity;
    for (let x = 0; x <= eq.L - 1; x += 10) {
      for (let z = 0; z <= eq.W - 1; z += 10) {
        for (const { il, iw, ih } of orients) {
          const y = getFloorLevel(x, z, il, iw, placed);
          if (!fitsInEquipment(eq, x, y, z, il, iw, ih)) continue;
          const below = getItemsAtSurface(x, y, z, il, iw, placed);
          if (!canStackOn(item, below.map(b => b.item))) continue;
          const s = placementScore(x, y, z);
          if (s < bestScore) { bestScore = s; best = { x, y, z, il, iw, ih }; }
        }
      }
    }
    if (best) placed.push({ item, seq: placed.length + 1, ...best });
    else unplaced.push(item);
  }

  return { placed, unplaced, algorithm: 'Layer Builder' };
}

function buildLayers(heights, maxH) {
  // Cluster heights into bands of similar sizes
  const sorted = [...new Set(heights)].sort((a, b) => b - a);
  const layers = [];
  let remaining = maxH;
  for (const h of sorted) {
    if (h <= remaining) { layers.push(h); remaining -= h; }
    if (remaining <= 0) break;
  }
  if (layers.length === 0) layers.push(maxH);
  return layers;
}

function fillLayer(items, eq, baseY, layerH, alreadyPlaced) {
  const fit = [];
  const leftover = [];
  // Strip pack within the layer
  let curX = 0;

  // Sort by width desc for strip packing
  const layerItems = items.filter(i => {
    const orients = getOrientations(i);
    return orients.some(o => o.ih <= layerH);
  });
  const skip = items.filter(i => !layerItems.includes(i));

  for (const item of layerItems) {
    const orients = getOrientations(item).filter(o => o.ih <= layerH);
    let placed = false;
    for (const { il, iw, ih } of orients) {
      if (curX + il > eq.L) continue;
      // Find z position
      for (let z = 0; z + iw <= eq.W; z += 1) {
        const y = getFloorLevel(curX, z, il, iw, [...alreadyPlaced, ...fit]);
        if (y > baseY + 0.5) continue; // only place at this layer level
        if (!fitsInEquipment(eq, curX, baseY, z, il, iw, ih)) continue;
        const below = getItemsAtSurface(curX, baseY, z, il, iw, [...alreadyPlaced, ...fit]);
        if (!canStackOn(item, below.map(b => b.item))) continue;
        fit.push({ item, x: curX, y: baseY, z, il, iw, ih });
        curX += il;
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) leftover.push(item);
  }

  return { fit, leftover: [...skip, ...leftover] };
}

// ─── MULTI-CONTAINER RUNNER ───────────────────────
function packWithAlgorithm(items, eq, algoFn) {
  const containers = [];
  let remaining = [...items];
  let num = 1;
  const maxContainers = 20;

  while (remaining.length > 0 && num <= maxContainers) {
    const result = algoFn(remaining, eq);
    if (result.placed.length === 0) {
      // Nothing fits — items too large
      break;
    }
    const loadedWeight = result.placed.reduce((s, p) => s + p.item.weight, 0);
    const loadedCBM = result.placed.reduce((s, p) => s + (p.il * p.iw * p.ih) / 1e6, 0);
    const containerCBM = (eq.L * eq.W * eq.H) / 1e6;
    const wm = computeWeightMetrics(result.placed, eq);
    const axleLoads = computeAxleLoads(result.placed, eq);

    containers.push({
      num,
      eq,
      placed: result.placed,
      loadedWeight,
      loadedCBM,
      containerCBM,
      utilization: (loadedCBM / containerCBM * 100).toFixed(1),
      weightMetrics: wm,
      axleLoads,
    });

    remaining = result.unplaced;
    num++;
  }

  // Anything still remaining goes in a note
  return {
    algorithm: algoFn.algoName || 'Unknown',
    containers,
    unplaced: remaining,
    totalContainers: containers.length,
    avgUtilization: containers.length > 0
      ? (containers.reduce((s, c) => s + parseFloat(c.utilization), 0) / containers.length).toFixed(1)
      : 0,
  };
}

// Tag algo names
packLAFF.algoName = 'LAFF';
packDBLF.algoName = 'DBLF';
packLayerBuilder.algoName = 'Layer Builder';

// ─── RUN ALL THREE ────────────────────────────────
function runAllAlgorithms(items, eq) {
  return [
    packWithAlgorithm(items, eq, packLAFF),
    packWithAlgorithm(items, eq, packDBLF),
    packWithAlgorithm(items, eq, packLayerBuilder),
  ];
}
