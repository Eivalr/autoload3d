/* =============================================
   algorithms.js
   LAFF · DBLF · Layer Builder
   ============================================= */

'use strict';

function getOrientations(item) {
  const { l, w, h, rotatable } = item;
  if (!rotatable) return [{ il: l, iw: w, ih: h }];
  const raw = [[l,w,h],[l,h,w],[w,l,h],[w,h,l],[h,l,w],[h,w,l]];
  const seen = new Set();
  return raw.filter(([a,b,c]) => { const k=[a,b,c].sort().join(','); if(seen.has(k)) return false; seen.add(k); return true; }).map(([il,iw,ih]) => ({il,iw,ih}));
}

function categoryAllowsStack(topCat, baseCat) {
  const rules = { pallet:['pallet'], crate:['pallet','crate'], box:['pallet','crate','box'], barrel:[], custom:['pallet','crate','box','custom'] };
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
    if (x < p.x+p.il && x+il > p.x && z < p.z+p.iw && z+iw > p.z) maxY = Math.max(maxY, p.y+p.ih);
  }
  return maxY;
}

function getItemsAtSurface(x, y, z, il, iw, placed) {
  return placed.filter(p => x<p.x+p.il && x+il>p.x && z<p.z+p.iw && z+iw>p.z && Math.abs((p.y+p.ih)-y)<2);
}

function fitsInEquipment(eq, x, y, z, il, iw, ih) {
  if (x<0||y<0||z<0) return false;
  if (x+il>eq.L||y+ih>eq.H||z+iw>eq.W) return false;
  if (eq.contourPoints) return fitsInULDContour(eq, x, y, z, il, iw, ih);
  return true;
}

// Stacking-aware placement score: heavily favour placing on top of existing items
function placementScore(x, y, z, item, itemsBelow) {
  let score = y * 100000 + z * 1000 + x;
  if (item && item.stackable && itemsBelow && itemsBelow.length > 0 && y > 1) score -= 80000;
  return score;
}

function computeWeightMetrics(placed, eq) {
  if (placed.length === 0) return { cogX:0, cogY:0, cogZ:0, balanced:true };
  let sumW=0, sumWX=0, sumWY=0, sumWZ=0;
  for (const p of placed) {
    const w=p.item.weight; sumW+=w;
    sumWX+=w*(p.x+p.il/2); sumWY+=w*(p.y+p.ih/2); sumWZ+=w*(p.z+p.iw/2);
  }
  const cogX=sumWX/sumW, cogY=sumWY/sumW, cogZ=sumWZ/sumW;
  return { cogX, cogY, cogZ, balanced: Math.abs(cogX-eq.L/2)/eq.L<0.25 && Math.abs(cogZ-eq.W/2)/eq.W<0.25, sumW };
}

function computeAxleLoads(placed, eq) {
  if (!eq.axles) return null;
  const axleLoads = eq.axles.map(a => ({...a, load:0}));
  for (const p of placed) {
    const itemCogX = p.x+p.il/2, w=p.item.weight;
    let assigned = false;
    for (let i=0; i<axleLoads.length-1; i++) {
      const a1=axleLoads[i], a2=axleLoads[i+1];
      if (itemCogX>=a1.pos && itemCogX<=a2.pos) {
        const t=(itemCogX-a1.pos)/(a2.pos-a1.pos);
        a1.load+=w*(1-t); a2.load+=w*t; assigned=true; break;
      }
    }
    if (!assigned) {
      if (itemCogX<axleLoads[0].pos) axleLoads[0].load+=w;
      else axleLoads[axleLoads.length-1].load+=w;
    }
  }
  return axleLoads;
}

function sortItemsForLoading(items) {
  return [...items].sort((a,b) => {
    if (b.stackPriority!==a.stackPriority) return b.stackPriority-a.stackPriority;
    if (b.weight!==a.weight) return b.weight-a.weight;
    return (b.l*b.w)-(a.l*a.w);
  });
}

// ─── LAFF ─────────────────────────────────────────
function packLAFF(items, eq) {
  const sorted = sortItemsForLoading(items);
  const placed = [], unplaced = [];

  function getCandidates() {
    if (placed.length===0) return [{x:0,y:0,z:0}];
    const pts = new Set(['0,0,0']);
    for (const p of placed) {
      if (p.x+p.il<eq.L) pts.add(`${p.x+p.il},0,${p.z}`);
      if (p.y+p.ih<eq.H) pts.add(`${p.x},${p.y+p.ih},${p.z}`);
      if (p.z+p.iw<eq.W) pts.add(`${p.x},0,${p.z+p.iw}`);
    }
    return [...pts].map(s => { const [x,y,z]=s.split(',').map(Number); return {x,y,z}; });
  }

  for (const item of sorted) {
    const orients=getOrientations(item);
    let best=null, bestScore=Infinity;
    for (const {x,z} of getCandidates()) {
      for (const {il,iw,ih} of orients) {
        const y=getFloorLevel(x,z,il,iw,placed);
        if (!fitsInEquipment(eq,x,y,z,il,iw,ih)) continue;
        const below=getItemsAtSurface(x,y,z,il,iw,placed);
        if (!canStackOn(item,below.map(b=>b.item))) continue;
        const s=placementScore(x,y,z,item,below);
        if (s<bestScore) { bestScore=s; best={x,y,z,il,iw,ih}; }
      }
    }
    if (best) placed.push({item, seq:placed.length+1, ...best});
    else unplaced.push(item);
  }
  return {placed, unplaced, algorithm:'LAFF'};
}

// ─── DBLF ─────────────────────────────────────────
function packDBLF(items, eq) {
  const sorted=sortItemsForLoading(items), placed=[], unplaced=[];
  const GRID=10, gW=Math.ceil(eq.L/GRID), gD=Math.ceil(eq.W/GRID);
  const hmap=new Float32Array(gW*gD);

  function getFloorFromGrid(x,z,il,iw) {
    let maxH=0;
    for (let gx=Math.floor(x/GRID);gx<Math.ceil((x+il)/GRID);gx++)
      for (let gz=Math.floor(z/GRID);gz<Math.ceil((z+iw)/GRID);gz++)
        maxH=Math.max(maxH,hmap[Math.min(gz,gD-1)*gW+Math.min(gx,gW-1)]||0);
    return maxH;
  }
  function markGrid(x,z,il,iw,h) {
    for (let gx=Math.floor(x/GRID);gx<Math.ceil((x+il)/GRID);gx++)
      for (let gz=Math.floor(z/GRID);gz<Math.ceil((z+iw)/GRID);gz++) {
        const gi=Math.min(gz,gD-1)*gW+Math.min(gx,gW-1);
        hmap[gi]=Math.max(hmap[gi],h);
      }
  }

  for (const item of sorted) {
    const orients=getOrientations(item);
    let best=null, bestScore=Infinity;
    for (let gz=0;gz<gD;gz++) for (let gx=0;gx<gW;gx++) {
      const x=gx*GRID, z=gz*GRID;
      for (const {il,iw,ih} of orients) {
        const y=getFloorFromGrid(x,z,il,iw);
        if (!fitsInEquipment(eq,x,y,z,il,iw,ih)) continue;
        const below=getItemsAtSurface(x,y,z,il,iw,placed);
        if (!canStackOn(item,below.map(b=>b.item))) continue;
        const stackBonus=(item.stackable&&below.length>0&&y>1)?-80000:0;
        const s=y*1e8+z*1e4+x+stackBonus;
        if (s<bestScore) { bestScore=s; best={x,y,z,il,iw,ih}; }
      }
    }
    if (best) { placed.push({item,seq:placed.length+1,...best}); markGrid(best.x,best.z,best.il,best.iw,best.y+best.ih); }
    else unplaced.push(item);
  }
  return {placed, unplaced, algorithm:'DBLF'};
}

// ─── LAYER BUILDER ────────────────────────────────
function packLayerBuilder(items, eq) {
  const sorted=sortItemsForLoading(items), placed=[], unplaced=[];
  const layers=buildLayers(sorted.map(i=>i.h), eq.H);
  let currentY=0, remaining=[...sorted];

  for (const layerH of layers) {
    if (currentY+layerH>eq.H) break;
    const {fit,leftover}=fillLayer(remaining,eq,currentY,layerH,placed);
    fit.forEach(p=>placed.push({...p,seq:placed.length+1}));
    remaining=leftover;
    if (fit.length>0) currentY+=layerH;
    if (remaining.length===0) break;
  }

  for (const item of remaining) {
    const orients=getOrientations(item);
    let best=null, bestScore=Infinity;
    for (let x=0;x<=eq.L-1;x+=10) for (let z=0;z<=eq.W-1;z+=10) {
      for (const {il,iw,ih} of orients) {
        const y=getFloorLevel(x,z,il,iw,placed);
        if (!fitsInEquipment(eq,x,y,z,il,iw,ih)) continue;
        const below=getItemsAtSurface(x,y,z,il,iw,placed);
        if (!canStackOn(item,below.map(b=>b.item))) continue;
        const s=placementScore(x,y,z,item,below);
        if (s<bestScore) { bestScore=s; best={x,y,z,il,iw,ih}; }
      }
    }
    if (best) placed.push({item,seq:placed.length+1,...best});
    else unplaced.push(item);
  }
  return {placed, unplaced, algorithm:'Layer Builder'};
}

function buildLayers(heights, maxH) {
  const sorted=[...new Set(heights)].sort((a,b)=>b-a);
  const layers=[]; let remaining=maxH;
  for (const h of sorted) { if (h<=remaining) { layers.push(h); remaining-=h; } if (remaining<=0) break; }
  if (layers.length===0) layers.push(maxH);
  return layers;
}

function fillLayer(items, eq, baseY, layerH, alreadyPlaced) {
  const fit=[], leftover=[];
  let curX=0;
  const layerItems=items.filter(i=>getOrientations(i).some(o=>o.ih<=layerH));
  const skip=items.filter(i=>!layerItems.includes(i));
  for (const item of layerItems) {
    const orients=getOrientations(item).filter(o=>o.ih<=layerH);
    let placed=false;
    for (const {il,iw,ih} of orients) {
      if (curX+il>eq.L) continue;
      for (let z=0;z+iw<=eq.W;z+=1) {
        const y=getFloorLevel(curX,z,il,iw,[...alreadyPlaced,...fit]);
        if (y>baseY+0.5) continue;
        if (!fitsInEquipment(eq,curX,baseY,z,il,iw,ih)) continue;
        const below=getItemsAtSurface(curX,baseY,z,il,iw,[...alreadyPlaced,...fit]);
        if (!canStackOn(item,below.map(b=>b.item))) continue;
        fit.push({item,x:curX,y:baseY,z,il,iw,ih}); curX+=il; placed=true; break;
      }
      if (placed) break;
    }
    if (!placed) leftover.push(item);
  }
  return {fit, leftover:[...skip,...leftover]};
}

function packWithAlgorithm(items, eq, algoFn) {
  const containers=[]; let remaining=[...items], num=1;
  while (remaining.length>0 && num<=20) {
    const result=algoFn(remaining,eq);
    if (result.placed.length===0) break;
    const loadedWeight=result.placed.reduce((s,p)=>s+p.item.weight,0);
    const loadedCBM=result.placed.reduce((s,p)=>s+(p.il*p.iw*p.ih)/1e6,0);
    const containerCBM=(eq.L*eq.W*eq.H)/1e6;
    containers.push({
      num, eq, placed:result.placed, loadedWeight, loadedCBM, containerCBM,
      utilization:(loadedCBM/containerCBM*100).toFixed(1),
      weightMetrics:computeWeightMetrics(result.placed,eq),
      axleLoads:computeAxleLoads(result.placed,eq),
    });
    remaining=result.unplaced; num++;
  }
  return {
    algorithm:algoFn.algoName||'Unknown', containers, unplaced:remaining,
    totalContainers:containers.length,
    avgUtilization:containers.length>0?(containers.reduce((s,c)=>s+parseFloat(c.utilization),0)/containers.length).toFixed(1):0,
  };
}

packLAFF.algoName='LAFF';
packDBLF.algoName='DBLF';
packLayerBuilder.algoName='Layer Builder';

function runAllAlgorithms(items, eq) {
  return [packWithAlgorithm(items,eq,packLAFF), packWithAlgorithm(items,eq,packDBLF), packWithAlgorithm(items,eq,packLayerBuilder)];
}
