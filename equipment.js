/* =============================================
   equipment.js — All equipment definitions
   ULD contoured geometry, containers, trucks
   ============================================= */

'use strict';

const ULD_DEFS = {
  LD1: {
    name: 'LD-1 (AKE)', type: 'uld', L: 156, W: 153, H: 163, maxPayload: 1588,
    contourPoints: [{y:0,hw:78},{y:100,hw:78},{y:125,hw:65},{y:145,hw:50},{y:163,hw:35}],
    asymmetric: true, straightSideHW: 78,
    contourSide: [{y:0,x:78},{y:100,x:78},{y:125,x:52},{y:145,x:30},{y:163,x:10}],
    color3d: 0x4fa8ff,
  },
  LD3: {
    name: 'LD-3 (AKH)', type: 'uld', L: 201, W: 153, H: 163, maxPayload: 1588,
    contourPoints: [{y:0,hw:100},{y:96,hw:100},{y:120,hw:88},{y:140,hw:68},{y:163,hw:45}],
    asymmetric: false, color3d: 0x3ddc97,
  },
  LD7: {
    name: 'LD-7 (AKE)', type: 'uld', L: 317, W: 224, H: 163, maxPayload: 4626,
    contourPoints: [{y:0,hw:112},{y:100,hw:112},{y:130,hw:95},{y:150,hw:72},{y:163,hw:55}],
    asymmetric: false, color3d: 0xf5c842,
  },
  LD11: {
    name: 'LD-11 (AKE)', type: 'uld', L: 307, W: 244, H: 163, maxPayload: 6804,
    contourPoints: [{y:0,hw:122},{y:96,hw:122},{y:120,hw:108},{y:145,hw:85},{y:163,hw:60}],
    asymmetric: false, color3d: 0xb48aff,
  },
  PMC: {
    name: 'PMC Pallet (P6P)', type: 'uld', L: 317, W: 244, H: 163, maxPayload: 11340,
    contourPoints: [{y:0,hw:122},{y:80,hw:122},{y:120,hw:105},{y:150,hw:82},{y:163,hw:60}],
    asymmetric: false, isPallet: true, color3d: 0xff9d5c,
  },
};

const SEA_DEFS = {
  '20GP': { name:"20' General Purpose", type:'sea', L:589,  W:235, H:239, maxPayload:21700, color3d:0x4fa8ff },
  '40GP': { name:"40' General Purpose", type:'sea', L:1203, W:235, H:239, maxPayload:26500, color3d:0x3ddc97 },
  '40HC': { name:"40' High Cube",       type:'sea', L:1203, W:235, H:269, maxPayload:26470, color3d:0xf5c842 },
  '45HC': { name:"45' High Cube",       type:'sea', L:1357, W:235, H:269, maxPayload:27600, color3d:0xb48aff },
};

const TRUCK_DEFS = {
  '53FT': { name:"53' Trailer", type:'truck', L:1603, W:250, H:274, maxPayload:22680, axles:[{name:'Steer',pos:120,maxLoad:5900},{name:'Drive',pos:1380,maxLoad:15400},{name:'Trailer',pos:1520,maxLoad:15400}], color3d:0xff5f6d },
  '48FT': { name:"48' Trailer", type:'truck', L:1463, W:250, H:274, maxPayload:21000, axles:[{name:'Steer',pos:120,maxLoad:5900},{name:'Drive',pos:1240,maxLoad:15400},{name:'Trailer',pos:1380,maxLoad:15400}], color3d:0xff9d5c },
  '40FT': { name:"40' Trailer", type:'truck', L:1220, W:250, H:274, maxPayload:19000, axles:[{name:'Steer',pos:120,maxLoad:5900},{name:'Drive',pos:1000,maxLoad:15400},{name:'Trailer',pos:1120,maxLoad:15400}], color3d:0x5ce8e8 },
};

let currentEquipType = 'air';

function setEquipType(type, btn) {
  currentEquipType = type;
  document.querySelectorAll('.equip-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.equip-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('equip-' + type).classList.add('active');
  updateEquipPreview();
}

function getSelectedEquipment() {
  if (currentEquipType === 'auto') return null;
  if (currentEquipType === 'custom') {
    return { id:'CUSTOM', name:'Custom Equipment', type:'custom', color3d:0x8a90a8,
      L:parseFloat(document.getElementById('custom-l').value)||600,
      W:parseFloat(document.getElementById('custom-w').value)||240,
      H:parseFloat(document.getElementById('custom-h').value)||240,
      maxPayload:parseFloat(document.getElementById('custom-payload').value)||20000 };
  }
  if (currentEquipType === 'air')   { const id=document.getElementById('uld-select').value;   return {id,...ULD_DEFS[id]}; }
  if (currentEquipType === 'sea')   { const id=document.getElementById('sea-select').value;   return {id,...SEA_DEFS[id]}; }
  if (currentEquipType === 'truck') { const id=document.getElementById('truck-select').value; return {id,...TRUCK_DEFS[id]}; }
}

function updateEquipPreview() {
  if (currentEquipType === 'auto') {
    document.getElementById('equipPreview').innerHTML = `<div class="equip-preview-inner"><span class="prev-dim" style="color:var(--accent)">⚡ System will determine optimal equipment</span></div>`;
    return;
  }
  const eq = getSelectedEquipment();
  if (!eq) return;
  const cbm = ((eq.L*eq.W*eq.H)/1e6).toFixed(2);
  document.getElementById('equipPreview').innerHTML = `<div class="equip-preview-inner"><span class="prev-dim">${eq.L} × ${eq.W} × ${eq.H} cm</span><span class="prev-sep">·</span><span class="prev-cbm">${cbm} m³</span><span class="prev-sep">·</span><span class="prev-payload">Max ${eq.maxPayload.toLocaleString()} kg</span></div>`;
}

// ─── AUTO-CALCULATE EQUIPMENT ─────────────────────
function autoCalculateEquipment(items) {
  const mode = document.getElementById('auto-mode')?.value || 'sea';
  let candidates = [];
  if (mode==='sea'||mode==='all')   candidates=candidates.concat(Object.entries(SEA_DEFS).map(([id,def])=>({id,...def})));
  if (mode==='air'||mode==='all')   candidates=candidates.concat(Object.entries(ULD_DEFS).map(([id,def])=>({id,...def})));
  if (mode==='truck'||mode==='all') candidates=candidates.concat(Object.entries(TRUCK_DEFS).map(([id,def])=>({id,...def})));

  const totalWeight=items.reduce((s,i)=>s+i.weight,0);
  const totalCBM=items.reduce((s,i)=>s+(i.l*i.w*i.h)/1e6,0);
  let bestResult=null, bestScore=Infinity;

  for (const eq of candidates) {
    const eqCBM=(eq.L*eq.W*eq.H)/1e6;
    const unitsNeeded=Math.ceil(totalCBM/(eqCBM*0.75));
    const estUtil=Math.min(totalCBM/(eqCBM*unitsNeeded),1.0);
    const score=unitsNeeded*1000-estUtil*100+(eqCBM*unitsNeeded-totalCBM);
    if (score<bestScore && totalWeight<=eq.maxPayload*unitsNeeded) {
      bestScore=score;
      bestResult={eq, unitsNeeded, estUtil:(estUtil*100).toFixed(1)};
    }
  }
  return bestResult;
}

// ─── ULD CONTOUR HELPERS ──────────────────────────
function getULDHalfWidthAtHeight(uldDef, y) {
  if (!uldDef.contourPoints) return uldDef.W/2;
  const pts=uldDef.contourPoints;
  if (y<=pts[0].y) return pts[0].hw;
  if (y>=pts[pts.length-1].y) return pts[pts.length-1].hw;
  for (let i=0;i<pts.length-1;i++) {
    if (y>=pts[i].y&&y<=pts[i+1].y) {
      const t=(y-pts[i].y)/(pts[i+1].y-pts[i].y);
      return pts[i].hw+t*(pts[i+1].hw-pts[i].hw);
    }
  }
  return uldDef.W/2;
}

function fitsInULDContour(uldDef, x, y, z, il, iw, ih) {
  if (!uldDef.contourPoints) return true;
  for (const chy of [y, y+ih]) {
    const hw=getULDHalfWidthAtHeight(uldDef,chy), centerZ=uldDef.W/2;
    if (Math.max(Math.abs(z-centerZ),Math.abs(z+iw-centerZ))>hw) return false;
  }
  return true;
}

function buildULDContourGeometry(uldDef) {
  if (!uldDef.contourPoints) return [new THREE.BoxGeometry(uldDef.L,uldDef.H,uldDef.W)];
  const pts=uldDef.contourPoints, shape=new THREE.Shape();
  if (!uldDef.asymmetric) {
    shape.moveTo(-pts[0].hw,pts[0].y);
    pts.forEach(p=>shape.lineTo(p.hw,p.y));
    for (let i=pts.length-1;i>=0;i--) shape.lineTo(-pts[i].hw,pts[i].y);
  } else {
    shape.moveTo(-pts[0].hw,pts[0].y);
    pts.forEach(p=>shape.lineTo(p.hw,p.y));
    const cs=uldDef.contourSide;
    for (let i=cs.length-1;i>=0;i--) shape.lineTo(-uldDef.straightSideHW,cs[i].y);
  }
  shape.closePath();
  try { return [new THREE.ExtrudeGeometry(shape,{depth:uldDef.L,bevelEnabled:false})]; }
  catch(e) { return [new THREE.BoxGeometry(uldDef.L,uldDef.H,uldDef.W)]; }
}
