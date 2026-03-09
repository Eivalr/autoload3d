/* =============================================
   AutoLoad 3D Planner — Application Logic
   ============================================= */

'use strict';

// ─── STATE ───────────────────────────────────────
const state = {
  items: [],        // raw cargo input items
  results: null,    // packed containers
  activeContainer: 0,
  threeScene: null,
  threeRenderer: null,
  threeCamera: null,
  threeControls: null,
  wireframe: false,
  meshes: [],
  animFrame: null,
};

// ─── CONTAINER DEFINITIONS (internal cm) ─────────
const CONTAINERS = [
  { id: '20GP',  name: "20' General Purpose",  L: 589, W: 235, H: 239, maxPayload: 21700 },
  { id: '40GP',  name: "40' General Purpose",  L: 1203, W: 235, H: 239, maxPayload: 26500 },
  { id: '40HC',  name: "40' High Cube",         L: 1203, W: 235, H: 269, maxPayload: 26470 },
  { id: '45HC',  name: "45' High Cube",         L: 1357, W: 235, H: 269, maxPayload: 27600 },
];

// Floor load limit kg/m² (safety)
const FLOOR_LOAD_KG_M2 = 3000;

// ─── COLOR PALETTE FOR SHIPMENTS ─────────────────
const SHIPMENT_COLORS = [
  0x4fa8ff, 0x3ddc97, 0xf5c842, 0xff5f6d, 0xb48aff,
  0xff9d5c, 0x5ce8e8, 0xff79c6, 0x8be9fd, 0x50fa7b,
  0xffb86c, 0xff5555, 0xbd93f9, 0xf1fa8c, 0x6be5fd,
];
const shipmentColorMap = {};
let colorIdx = 0;
function getShipmentColor(shipmentId) {
  if (!shipmentColorMap[shipmentId]) {
    shipmentColorMap[shipmentId] = SHIPMENT_COLORS[colorIdx % SHIPMENT_COLORS.length];
    colorIdx++;
  }
  return shipmentColorMap[shipmentId];
}
function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// ─── UI UTILITIES ─────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('section-' + name);
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
  const nb = document.getElementById('nav-' + name);
  if (nb) nb.classList.add('active');
}

function notify(msg, type = '') {
  const n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3500);
}

function generateMasterRef() {
  const d = new Date();
  const ref = `MLD-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
  document.getElementById('masterRef').value = ref;
}

// ─── CARGO ITEM MANAGEMENT ────────────────────────
function addCargoItem() {
  const shipment = document.getElementById('ci-shipment').value.trim();
  const desc     = document.getElementById('ci-desc').value.trim();
  const l        = parseFloat(document.getElementById('ci-l').value);
  const w        = parseFloat(document.getElementById('ci-w').value);
  const h        = parseFloat(document.getElementById('ci-h').value);
  const weight   = parseFloat(document.getElementById('ci-weight').value);
  const qty      = parseInt(document.getElementById('ci-qty').value) || 1;
  const maxload  = parseFloat(document.getElementById('ci-maxload').value) || 99999;
  const category = document.getElementById('ci-category').value;
  const stackPri = parseInt(document.getElementById('ci-stackpriority').value);
  const stackable= document.getElementById('ci-stackable').checked;
  const rotatable= document.getElementById('ci-rotatable').checked;

  if (!shipment) { notify('Shipment ID is required.', 'error'); return; }
  if (isNaN(l)||isNaN(w)||isNaN(h)||l<=0||w<=0||h<=0) { notify('Enter valid dimensions.', 'error'); return; }
  if (isNaN(weight)||weight<=0) { notify('Enter valid weight.', 'error'); return; }

  for (let q = 0; q < qty; q++) {
    state.items.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2),
      shipment: shipment || 'DEFAULT',
      desc: desc || 'Cargo',
      l, w, h,
      weight,
      maxLoadOnTop: maxload,
      category,
      stackPriority: stackPri,
      stackable,
      rotatable,
    });
  }

  renderCargoList();
  // Clear form
  ['ci-shipment','ci-desc','ci-l','ci-w','ci-h','ci-weight','ci-maxload'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ci-qty').value = '1';
  notify(`Added ${qty} item(s) — Shipment: ${shipment}`, 'success');
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  renderCargoList();
}

function clearAllItems() {
  if (state.items.length === 0) return;
  state.items = [];
  renderCargoList();
  resetResults();
}

function renderCargoList() {
  const el = document.getElementById('cargoTable');
  const countEl = document.getElementById('itemCount');
  countEl.textContent = `${state.items.length} item${state.items.length !== 1 ? 's' : ''}`;

  if (state.items.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">▦</div><p>No cargo items added yet.<br/>Start by adding items on the left.</p></div>`;
    return;
  }

  el.innerHTML = state.items.map(item => {
    const color = hexToCSS(getShipmentColor(item.shipment));
    const cbm = ((item.l * item.w * item.h) / 1000000).toFixed(3);
    return `
      <div class="cargo-row">
        <div class="cargo-row-info">
          <div class="cargo-row-name">
            <span class="color-dot" style="background:${color}"></span>
            ${item.desc}
          </div>
          <div class="cargo-row-shipment">SHP: ${item.shipment}</div>
          <div class="cargo-row-dims">${item.l}×${item.w}×${item.h} cm · ${item.weight} kg · ${cbm} CBM</div>
          <div class="cargo-row-flags">
            ${item.stackable ? '<span class="flag flag-stack">Stackable</span>' : '<span class="flag flag-nostack">No Stack</span>'}
            ${item.rotatable ? '<span class="flag flag-rotate">Rotatable</span>' : ''}
            <span class="flag flag-prio">P${item.stackPriority}</span>
            <span class="flag flag-prio">${item.category}</span>
          </div>
        </div>
        <button class="cargo-row-delete" onclick="deleteItem('${item.id}')">✕</button>
      </div>
    `;
  }).join('');
}

// ─── CSV HANDLING ─────────────────────────────────
function downloadCSVTemplate() {
  const headers = 'shipment,description,length_cm,width_cm,height_cm,weight_kg,quantity,max_load_on_top_kg,category,stack_priority,stackable,rotatable';
  const example = 'SHP-001,Electronics Box,60,40,40,25,10,100,box,2,true,true';
  const blob = new Blob([headers + '\n' + example], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'autoload_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function handleCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    if (lines.length < 2) { notify('CSV is empty.', 'error'); return; }
    const rows = lines.slice(1);
    let added = 0;
    rows.forEach((row, idx) => {
      const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 7) return;
      const [shipment, desc, l, w, h, weight, qty, maxload, category, stackPri, stackable, rotatable] = cols;
      const qtyN = parseInt(qty) || 1;
      for (let q = 0; q < qtyN; q++) {
        state.items.push({
          id: Date.now() + '-' + Math.random().toString(36).slice(2),
          shipment: shipment || 'DEFAULT',
          desc: desc || 'Cargo',
          l: parseFloat(l)||10, w: parseFloat(w)||10, h: parseFloat(h)||10,
          weight: parseFloat(weight)||1,
          maxLoadOnTop: parseFloat(maxload)||99999,
          category: category || 'box',
          stackPriority: parseInt(stackPri)||2,
          stackable: stackable?.toLowerCase() !== 'false',
          rotatable: rotatable?.toLowerCase() !== 'false',
        });
        added++;
      }
    });
    renderCargoList();
    notify(`Loaded ${added} items from CSV.`, 'success');
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ─── BIN PACKING ENGINE ───────────────────────────

/**
 * Get all valid orientations for an item (respecting rotation flag)
 */
function getOrientations(item) {
  const { l, w, h, rotatable } = item;
  if (!rotatable) return [{ l, w, h }];
  // All 6 orientations
  const orients = [
    { l, w, h }, { l, w: h, h: w },
    { l: w, w: l, h }, { l: w, w: h, h: l },
    { l: h, w: l, h: w }, { l: h, w, h: l },
  ];
  // Deduplicate
  const seen = new Set();
  return orients.filter(o => {
    const key = `${o.l},${o.w},${o.h}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Check if item can be placed on given surface items (stacking rules)
 */
function canStackOn(topItem, bottomItems) {
  if (!topItem.stackable && bottomItems.length > 0) return false;
  for (const base of bottomItems) {
    // Priority check: can't put heavier/stronger base types on weaker
    if (topItem.stackPriority > base.stackPriority) return false;
    // Crush limit
    if (topItem.weight > base.maxLoadOnTop) return false;
    // Category rules
    if (!categoryAllowsStack(topItem.category, base.category)) return false;
  }
  return true;
}

function categoryAllowsStack(topCat, baseCat) {
  const rules = {
    pallet:  ['pallet'],
    crate:   ['pallet', 'crate'],
    box:     ['pallet', 'crate', 'box'],
    barrel:  [],         // barrels can't be stacked
    custom:  ['pallet', 'crate', 'box', 'custom'],
  };
  return (rules[topCat] || []).includes(baseCat);
}

/**
 * 3D Bin Packing — guillotine-based with realistic stacking
 * Returns array of { item, x, y, z, l, w, h } placements
 */
function packContainer(items, container) {
  // Sort: heaviest first, then largest footprint, then strongest base
  const sorted = [...items].sort((a, b) => {
    if (b.stackPriority !== a.stackPriority) return b.stackPriority - a.stackPriority;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return (b.l * b.w) - (a.l * a.w);
  });

  const { L, W, H } = container;
  const placed = []; // { item, x, y, z, il, iw, ih }
  const unplaced = [];

  // Space-filling using extreme points method
  // Extreme points start at origin
  let extremePoints = [{ x: 0, y: 0, z: 0 }];

  for (const item of sorted) {
    const orients = getOrientations(item);
    let bestPlacement = null;
    let bestScore = Infinity;

    for (const orient of orients) {
      const { l: il, w: iw, h: ih } = orient;
      if (il > L || iw > W || ih > H) continue;

      for (const ep of extremePoints) {
        const { x, y, z } = ep;
        if (x + il > L || z + iw > W) continue;

        // Find actual y (floor level at this x,z position)
        const supportY = getFloorLevel(x, y, z, il, iw, placed, H);
        if (supportY < 0) continue;
        if (supportY + ih > H) continue;

        // Check weight on top of what's below
        const itemsBelow = getItemsAt(x, supportY - 0.01, z, il, iw, placed);
        if (!canStackOn(item, itemsBelow.map(p => p.item))) continue;

        // Check floor load
        const floorArea = (il * iw) / 10000; // cm² to m²
        if (item.weight / floorArea > FLOOR_LOAD_KG_M2 && supportY === 0) { /* warn but allow */ }

        // Score: prefer lower y (floor first), then lower x, z
        const score = supportY * 1000 + x + z;
        if (score < bestScore) {
          bestScore = score;
          bestPlacement = { x, y: supportY, z, il, iw, ih };
        }
      }
    }

    if (bestPlacement) {
      placed.push({ item, ...bestPlacement });
      // Update extreme points
      extremePoints = updateExtremePoints(extremePoints, bestPlacement, L, W, H);
    } else {
      unplaced.push(item);
    }
  }

  return { placed, unplaced };
}

function getFloorLevel(x, y, z, il, iw, placed, H) {
  // Find highest y where this item footprint rests on
  let maxY = 0;
  for (const p of placed) {
    const px = p.x, py = p.y, pz = p.z;
    const pl = p.il, pw = p.iw, ph = p.ih;
    // Check overlap in x-z plane
    if (x < px + pl && x + il > px && z < pz + pw && z + iw > pz) {
      const topY = py + ph;
      if (topY > maxY) maxY = topY;
    }
  }
  return maxY;
}

function getItemsAt(x, y, z, il, iw, placed) {
  return placed.filter(p => {
    return (x < p.x + p.il && x + il > p.x &&
            z < p.z + p.iw && z + iw > p.z &&
            Math.abs((p.y + p.ih) - y) < 1);
  });
}

function updateExtremePoints(eps, placement, L, W, H) {
  const { x, y, z, il, iw, ih } = placement;
  const newPoints = [
    { x: x + il, y, z },
    { x, y: y + ih, z },
    { x, y, z: z + iw },
  ];
  const combined = [...eps, ...newPoints].filter(p =>
    p.x < L && p.y < H && p.z < W
  );
  // Deduplicate
  const seen = new Set();
  return combined.filter(p => {
    const key = `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Main calculation: select best container, pack, overflow to additional
 */
function calculateLoadPlan(items) {
  if (items.length === 0) return null;

  // Calculate total CBM and weight
  const totalCBM = items.reduce((s, i) => s + (i.l * i.w * i.h) / 1e6, 0);
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);

  // Select smallest container that fits total CBM (with 5% buffer) and weight
  let selectedContainer = null;
  for (const c of CONTAINERS) {
    const containerCBM = (c.L * c.W * c.H) / 1e6;
    if (containerCBM >= totalCBM * 0.95 && c.maxPayload >= totalWeight) {
      selectedContainer = c;
      break;
    }
  }
  // Default to largest if still none
  if (!selectedContainer) selectedContainer = CONTAINERS[CONTAINERS.length - 1];

  // Pack items into containers
  const containers = [];
  let remaining = [...items];
  let containerNum = 1;

  while (remaining.length > 0) {
    const result = packContainer(remaining, selectedContainer);
    const containerCBM = (selectedContainer.L * selectedContainer.W * selectedContainer.H) / 1e6;
    const loadedWeight = result.placed.reduce((s, p) => s + p.item.weight, 0);
    const loadedCBM = result.placed.reduce((s, p) => s + (p.il * p.iw * p.ih) / 1e6, 0);

    containers.push({
      num: containerNum++,
      containerDef: selectedContainer,
      placed: result.placed,
      unplacedInRound: result.unplaced,
      loadedWeight,
      loadedCBM,
      containerCBM,
      utilization: (loadedCBM / containerCBM * 100).toFixed(1),
    });

    if (result.unplaced.length === 0) break;
    if (result.placed.length === 0) {
      // Nothing was placed — items physically too large even for largest container
      break;
    }
    remaining = result.unplaced;
  }

  return {
    masterRef: document.getElementById('masterRef').value || 'AUTOREF-' + Date.now(),
    totalCBM,
    totalWeight,
    containers,
    selectedContainer,
  };
}

// ─── RUN CALCULATION ──────────────────────────────
function runCalculation() {
  if (state.items.length === 0) { notify('Add cargo items first.', 'error'); return; }

  const canvas = document.getElementById('threeCanvas');
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">Computing load plan…</div>';
  canvas.style.position = 'relative';
  canvas.appendChild(overlay);

  setTimeout(() => {
    try {
      state.results = calculateLoadPlan(state.items);
      state.activeContainer = 0;
      renderSummary();
      initThree();
      renderContainer(0);
      document.getElementById('viewerWrap').style.display = 'flex';
      document.getElementById('summaryActions').style.display = 'block';
      document.getElementById('summaryContent').classList.remove('summary-empty');
    } catch(e) {
      notify('Calculation error: ' + e.message, 'error');
      console.error(e);
    } finally {
      overlay.remove();
    }
  }, 100);
}

function resetResults() {
  state.results = null;
  document.getElementById('viewerWrap').style.display = 'none';
  document.getElementById('summaryContent').innerHTML = `<div class="summary-empty"><div class="empty-icon">◫</div><p>Run a calculation to see the load summary here.</p></div>`;
  document.getElementById('summaryActions').style.display = 'none';
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  if (state.threeRenderer) {
    state.threeRenderer.dispose();
    state.threeRenderer = null;
  }
}

// ─── SUMMARY RENDERING ────────────────────────────
function renderSummary() {
  const r = state.results;
  if (!r) return;

  let html = `<div class="summary-content">`;
  html += `<div class="summary-master">◈ MASTER: ${r.masterRef}</div>`;

  r.containers.forEach((c, idx) => {
    const utilNum = parseFloat(c.utilization);
    const utilColor = utilNum > 85 ? '#3ddc97' : utilNum > 50 ? '#f5c842' : '#4fa8ff';

    // Group by shipment
    const shipmentMap = {};
    c.placed.forEach(p => {
      const sid = p.item.shipment;
      if (!shipmentMap[sid]) shipmentMap[sid] = { count: 0, weight: 0, cbm: 0 };
      shipmentMap[sid].count++;
      shipmentMap[sid].weight += p.item.weight;
      shipmentMap[sid].cbm += (p.il * p.iw * p.ih) / 1e6;
    });

    html += `
      <div class="summary-container-block">
        <div class="summary-container-title">
          Container ${c.num}
          <span class="summary-container-type">${c.containerDef.name}</span>
        </div>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-value">${c.loadedWeight.toFixed(0)} kg</div>
            <div class="metric-label">Total Weight</div>
          </div>
          <div class="metric">
            <div class="metric-value">${c.loadedCBM.toFixed(2)} m³</div>
            <div class="metric-label">Total CBM</div>
          </div>
          <div class="metric">
            <div class="metric-value">${c.placed.length}</div>
            <div class="metric-label">Items Loaded</div>
          </div>
          <div class="metric">
            <div class="metric-value" style="color:${utilColor}">${c.utilization}%</div>
            <div class="metric-label">Utilization</div>
          </div>
        </div>
        <div class="util-bar">
          <div class="util-fill" style="width:${Math.min(utilNum,100)}%;background:${utilColor}"></div>
        </div>
        <div class="shipment-list">
          ${Object.entries(shipmentMap).map(([sid, data]) => {
            const color = hexToCSS(getShipmentColor(sid));
            return `<div class="shipment-row">
              <span class="shipment-id"><span class="color-dot" style="background:${color}"></span>${sid}</span>
              <span class="shipment-stats">${data.count} pcs · ${data.weight.toFixed(0)}kg · ${data.cbm.toFixed(2)}m³</span>
            </div>`;
          }).join('')}
        </div>
        ${c.loadedWeight > c.containerDef.maxPayload * 0.95 ?
          `<div class="warning-tag">⚠ Near weight limit: ${c.loadedWeight.toFixed(0)}kg / ${c.containerDef.maxPayload}kg</div>` : ''}
      </div>
    `;
  });

  // Grand totals
  html += `
    <div class="summary-totals">
      <div class="summary-totals-title">Grand Total</div>
      <div class="metric-grid">
        <div class="metric">
          <div class="metric-value">${r.totalWeight.toFixed(0)} kg</div>
          <div class="metric-label">Total Weight</div>
        </div>
        <div class="metric">
          <div class="metric-value">${r.totalCBM.toFixed(2)} m³</div>
          <div class="metric-label">Total CBM</div>
        </div>
        <div class="metric">
          <div class="metric-value">${r.containers.length}</div>
          <div class="metric-label">Containers</div>
        </div>
        <div class="metric">
          <div class="metric-value">${r.selectedContainer.id}</div>
          <div class="metric-label">Equip. Type</div>
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById('summaryContent').innerHTML = html;

  // Container tabs
  const tabs = document.getElementById('containerTabs');
  tabs.innerHTML = r.containers.map((c, i) => `
    <button class="tab-btn ${i === state.activeContainer ? 'active' : ''}" onclick="switchContainer(${i})">
      CTR ${c.num}
    </button>
  `).join('');
}

function switchContainer(idx) {
  state.activeContainer = idx;
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  renderContainer(idx);
}

// ─── THREE.JS VISUALIZATION ───────────────────────
function initThree() {
  const canvasEl = document.getElementById('threeCanvas');
  canvasEl.innerHTML = '';

  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  if (state.threeRenderer) state.threeRenderer.dispose();

  const W = canvasEl.clientWidth || 800;
  const H = canvasEl.clientHeight || 500;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x13161c);

  // Camera
  const camera = new THREE.PerspectiveCamera(45, W / H, 1, 50000);
  camera.position.set(1200, 900, 1200);
  camera.lookAt(0, 0, 0);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  canvasEl.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(1000, 2000, 1000);
  dirLight.castShadow = true;
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0x4080ff, 0.3);
  fillLight.position.set(-1000, 500, -500);
  scene.add(fillLight);

  // Grid
  const grid = new THREE.GridHelper(6000, 30, 0x242835, 0x1a1e27);
  grid.position.y = -5;
  scene.add(grid);

  // Orbit controls (manual)
  setupOrbitControls(camera, renderer.domElement);

  state.threeScene = scene;
  state.threeCamera = camera;
  state.threeRenderer = renderer;
  state.meshes = [];

  // Animate
  function animate() {
    state.animFrame = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // Resize observer
  const ro = new ResizeObserver(() => {
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
  ro.observe(canvasEl);
}

function renderContainer(idx) {
  const r = state.results;
  if (!r) return;

  const scene = state.threeScene;
  // Remove old meshes
  state.meshes.forEach(m => scene.remove(m));
  state.meshes = [];

  const c = r.containers[idx];
  const { L, W, H } = c.containerDef;

  // Center offset
  const ox = -L / 2, oy = 0, oz = -W / 2;

  // Container shell (wireframe box)
  const cGeo = new THREE.BoxGeometry(L, H, W);
  const cMat = new THREE.MeshBasicMaterial({ color: 0x3a4060, wireframe: true, transparent: true, opacity: 0.4 });
  const cMesh = new THREE.Mesh(cGeo, cMat);
  cMesh.position.set(ox + L/2, oy + H/2, oz + W/2);
  scene.add(cMesh);
  state.meshes.push(cMesh);

  // Container floor
  const floorGeo = new THREE.PlaneGeometry(L, W);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1e27, transparent: true, opacity: 0.6 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ox + L/2, 0.5, oz + W/2);
  scene.add(floor);
  state.meshes.push(floor);

  // Place items
  c.placed.forEach(p => {
    const color = getShipmentColor(p.item.shipment);
    const geo = new THREE.BoxGeometry(p.il - 2, p.ih - 2, p.iw - 2);
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: state.wireframe ? 0 : 0.82,
      wireframe: state.wireframe,
      roughness: 0.7,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      ox + p.x + p.il / 2,
      oy + p.y + p.ih / 2,
      oz + p.z + p.iw / 2
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { item: p.item, placement: p };

    // Edge outline
    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.il - 1, p.ih - 1, p.iw - 1));
    const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    mesh.add(edges);

    scene.add(mesh);
    state.meshes.push(mesh);
  });

  // Camera reset for this container
  const cx = 0, cy = H * 0.6, cz = Math.max(L, W) * 1.8;
  state.threeCamera.position.set(cx + cz * 0.6, cy, cz * 0.9);
  state.threeCamera.lookAt(0, H / 2, 0);

  // Legend
  renderLegend(c);

  // Tooltip on hover
  setupTooltip(r.containers[idx]);
}

function renderLegend(c) {
  const legend = document.getElementById('viewerLegend');
  const shipments = [...new Set(c.placed.map(p => p.item.shipment))];
  legend.innerHTML = shipments.map(sid => {
    const color = hexToCSS(getShipmentColor(sid));
    return `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div>${sid}</div>`;
  }).join('');
}

// ─── ORBIT CONTROLS (manual) ─────────────────────
function setupOrbitControls(camera, domEl) {
  let isDragging = false, isRightDrag = false;
  let prevMouse = { x: 0, y: 0 };
  let spherical = { theta: Math.PI / 4, phi: Math.PI / 3, r: 2200 };
  let target = new THREE.Vector3(0, 200, 0);

  function updateCamera() {
    camera.position.set(
      target.x + spherical.r * Math.sin(spherical.phi) * Math.sin(spherical.theta),
      target.y + spherical.r * Math.cos(spherical.phi),
      target.z + spherical.r * Math.sin(spherical.phi) * Math.cos(spherical.theta)
    );
    camera.lookAt(target);
  }
  updateCamera();

  domEl.addEventListener('mousedown', e => {
    isDragging = true;
    isRightDrag = e.button === 2;
    prevMouse = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  domEl.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    prevMouse = { x: e.clientX, y: e.clientY };
    if (isRightDrag) {
      target.x -= dx * 1.2;
      target.y += dy * 1.2;
    } else {
      spherical.theta -= dx * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.005));
    }
    updateCamera();
  });
  window.addEventListener('mouseup', () => isDragging = false);
  domEl.addEventListener('wheel', e => {
    spherical.r = Math.max(200, Math.min(8000, spherical.r + e.deltaY * 1.5));
    updateCamera();
    e.preventDefault();
  }, { passive: false });

  // Touch
  let lastTouch = null;
  domEl.addEventListener('touchstart', e => {
    if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });
  domEl.addEventListener('touchmove', e => {
    if (!lastTouch) return;
    const dx = e.touches[0].clientX - lastTouch.x;
    const dy = e.touches[0].clientY - lastTouch.y;
    spherical.theta -= dx * 0.005;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.005));
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    updateCamera();
    e.preventDefault();
  }, { passive: false });

  // Store for reset
  domEl._resetCamera = () => {
    spherical = { theta: Math.PI / 4, phi: Math.PI / 3, r: 2200 };
    target.set(0, 200, 0);
    updateCamera();
  };
}

function resetCamera() {
  const canvas = document.getElementById('threeCanvas');
  const domEl = canvas.querySelector('canvas');
  if (domEl && domEl._resetCamera) domEl._resetCamera();
}

function toggleWireframe() {
  state.wireframe = !state.wireframe;
  state.meshes.forEach(m => {
    if (m.material && m.userData.item) {
      m.material.wireframe = state.wireframe;
      m.material.opacity = state.wireframe ? 1 : 0.82;
    }
  });
}

// ─── TOOLTIP HANDLING ─────────────────────────────
function setupTooltip(container) {
  const canvas = document.getElementById('threeCanvas');
  const tooltip = document.getElementById('tooltip');
  const raycaster = new THREE.Raycaster();

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, state.threeCamera);
    const hits = raycaster.intersectObjects(state.meshes.filter(m => m.userData.item));
    if (hits.length > 0) {
      const { item, placement } = hits[0].object.userData;
      const cbm = ((placement.il * placement.iw * placement.ih) / 1e6).toFixed(3);
      tooltip.innerHTML = `
        <strong>${item.desc}</strong><br>
        Shipment: ${item.shipment}<br>
        ${item.l}×${item.w}×${item.h} cm · ${item.weight} kg<br>
        CBM: ${cbm} m³<br>
        Category: ${item.category} · P${item.stackPriority}
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });
  canvas.addEventListener('mouseleave', () => tooltip.style.display = 'none');
}

// ─── EXPORTS ──────────────────────────────────────
function exportPNG() {
  if (!state.threeRenderer) { notify('Run a calculation first.', 'error'); return; }
  state.threeRenderer.render(state.threeScene, state.threeCamera);
  const dataURL = state.threeRenderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `AutoLoad3D_${state.results?.masterRef || 'plan'}.png`;
  a.click();
  notify('3D snapshot exported.', 'success');
}

function exportPDF() {
  if (!state.results) { notify('Run a calculation first.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const r = state.results;
  const pageW = 210, margin = 18;
  let y = margin;

  // Header
  doc.setFillColor(13, 15, 18);
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(245, 200, 66);
  doc.text('AutoLoad 3D Planner', margin, y + 8);
  doc.setFontSize(10);
  doc.setTextColor(138, 144, 168);
  doc.text('Load Plan Report', margin, y + 16);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y + 22);
  y = 50;

  // Master ref
  doc.setFontSize(11);
  doc.setTextColor(245, 200, 66);
  doc.setFont('helvetica', 'bold');
  doc.text(`Master Reference: ${r.masterRef}`, margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setTextColor(100, 110, 140);
  doc.setFont('helvetica', 'normal');
  doc.text(`Equipment Type: ${r.selectedContainer.name}  |  Total Containers: ${r.containers.length}  |  Total Weight: ${r.totalWeight.toFixed(0)} kg  |  Total CBM: ${r.totalCBM.toFixed(3)} m³`, margin, y);
  y += 10;

  // Line
  doc.setDrawColor(36, 40, 53);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Per container
  r.containers.forEach((c, idx) => {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(232, 234, 240);
    doc.text(`Container ${c.num} — ${c.containerDef.name}`, margin, y);
    y += 6;

    // Metrics
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(138, 144, 168);
    doc.text(`Items: ${c.placed.length}  |  Weight: ${c.loadedWeight.toFixed(0)} kg / ${c.containerDef.maxPayload} kg  |  CBM: ${c.loadedCBM.toFixed(3)} m³ / ${c.containerCBM.toFixed(3)} m³  |  Utilization: ${c.utilization}%`, margin, y);
    y += 7;

    // Shipment breakdown table header
    doc.setFillColor(26, 30, 39);
    doc.rect(margin, y - 1, pageW - margin * 2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(83, 88, 112);
    doc.text('SHIPMENT ID', margin + 2, y + 3.5);
    doc.text('ITEMS', margin + 50, y + 3.5);
    doc.text('WEIGHT (kg)', margin + 70, y + 3.5);
    doc.text('CBM (m³)', margin + 105, y + 3.5);
    doc.text('DESCRIPTION SAMPLE', margin + 135, y + 3.5);
    y += 8;

    // Group by shipment
    const shipmentMap = {};
    c.placed.forEach(p => {
      const sid = p.item.shipment;
      if (!shipmentMap[sid]) shipmentMap[sid] = { count: 0, weight: 0, cbm: 0, descs: new Set() };
      shipmentMap[sid].count++;
      shipmentMap[sid].weight += p.item.weight;
      shipmentMap[sid].cbm += (p.il * p.iw * p.ih) / 1e6;
      shipmentMap[sid].descs.add(p.item.desc);
    });

    Object.entries(shipmentMap).forEach(([sid, data]) => {
      if (y > 265) { doc.addPage(); y = margin; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 204, 218);
      doc.text(sid, margin + 2, y);
      doc.text(String(data.count), margin + 52, y);
      doc.text(data.weight.toFixed(1), margin + 72, y);
      doc.text(data.cbm.toFixed(3), margin + 107, y);
      doc.text([...data.descs].slice(0,2).join(', ').substring(0,30), margin + 137, y);
      y += 5.5;
    });

    y += 6;
    doc.setDrawColor(36, 40, 53);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  });

  // Item detail table
  if (y > 230) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(245, 200, 66);
  doc.text('Full Item List', margin, y);
  y += 8;

  doc.setFillColor(26, 30, 39);
  doc.rect(margin, y - 1, pageW - margin * 2, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(83, 88, 112);
  ['SHIPMENT', 'DESCRIPTION', 'L×W×H (cm)', 'WT (kg)', 'CTR', 'STACK', 'ROT'].forEach((h, i) => {
    const xPos = [margin+2, margin+28, margin+70, margin+108, margin+128, margin+143, margin+155];
    doc.text(h, xPos[i], y + 3.5);
  });
  y += 8;

  r.containers.forEach(c => {
    c.placed.forEach(p => {
      if (y > 270) { doc.addPage(); y = margin + 4; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(190, 194, 210);
      doc.text(p.item.shipment.substring(0,12), margin + 2, y);
      doc.text(p.item.desc.substring(0,18), margin + 28, y);
      doc.text(`${p.item.l}×${p.item.w}×${p.item.h}`, margin + 70, y);
      doc.text(p.item.weight.toFixed(1), margin + 108, y);
      doc.text(String(c.num), margin + 132, y);
      doc.text(p.item.stackable ? 'Y' : 'N', margin + 147, y);
      doc.text(p.item.rotatable ? 'Y' : 'N', margin + 159, y);
      y += 5;
    });
  });

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(83, 88, 112);
    doc.text(`AutoLoad 3D Planner · Page ${i} of ${totalPages}`, margin, 292);
  }

  doc.save(`AutoLoad3D_${r.masterRef}.pdf`);
  notify('PDF report downloaded.', 'success');
}

// ─── INIT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  generateMasterRef();
  renderCargoList();
});
