/* =============================================
   app.js — Main application controller
   ============================================= */

'use strict';

const AppState = { items: [], results: null, chosenAlgo: null, theme: 'dark', viewers: {} };

function toggleTheme() {
  AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', AppState.theme);
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.textContent = AppState.theme === 'dark' ? '◐' : '●';
  });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b => {
    const t = b.textContent.toLowerCase();
    if ((name === 'input' && t.includes('input')) ||
        (name === 'results' && t.includes('result')) ||
        (name === 'guided' && t.includes('guided')) ||
        (name === 'about' && t.includes('how'))) b.classList.add('active');
  });
  if (name === 'guided') renderGuidedPage();
}

function genRef() {
  const d = new Date();
  document.getElementById('masterRef').value = `MLD-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
}

// ── CARGO ──────────────────────────────────────
function addItem() {
  const shp = document.getElementById('ci-shp').value.trim();
  const desc = document.getElementById('ci-desc').value.trim() || 'Cargo';
  const l = parseFloat(document.getElementById('ci-l').value);
  const w = parseFloat(document.getElementById('ci-w').value);
  const h = parseFloat(document.getElementById('ci-h').value);
  const weight = parseFloat(document.getElementById('ci-wt').value);
  const qty = parseInt(document.getElementById('ci-qty').value) || 1;
  const maxload = parseFloat(document.getElementById('ci-maxload').value) || 99999;
  const cat = document.getElementById('ci-cat').value;
  const prio = parseInt(document.getElementById('ci-prio').value);
  const stack = document.getElementById('ci-stack').checked;
  const rot = document.getElementById('ci-rot').checked;
  if (!shp) { toast('Shipment ID required.', 'error'); return; }
  if (isNaN(l)||l<=0||isNaN(w)||w<=0||isNaN(h)||h<=0) { toast('Enter valid dimensions.', 'error'); return; }
  if (isNaN(weight)||weight<=0) { toast('Enter valid weight.', 'error'); return; }
  for (let i = 0; i < qty; i++) {
    AppState.items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      shipment: shp, desc, l, w, h, weight,
      maxLoadOnTop: maxload, category: cat,
      stackPriority: prio, stackable: stack, rotatable: rot
    });
  }
  renderItemList();
  ['ci-shp','ci-desc','ci-l','ci-w','ci-h','ci-wt','ci-maxload'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ci-qty').value = '1';
  toast(`Added ${qty} item(s) · ${shp}`, 'success');
}

function deleteItem(id) { AppState.items = AppState.items.filter(i => i.id !== id); renderItemList(); }
function clearItems() { if (!AppState.items.length) return; if (!confirm('Clear all cargo items?')) return; AppState.items = []; renderItemList(); }

// ── CARGO TABLE (Pier2Pier style) ─────────────
function renderItemList() {
  const el = document.getElementById('cargoTable');
  const bdg = document.getElementById('itemBadge');
  bdg.textContent = AppState.items.length;

  if (!AppState.items.length) {
    el.innerHTML = `<div class="empty-msg"><div class="empty-ico">&#9638;</div><p>No items yet. Fill in the form above and click Add Item.</p></div>`;
    return;
  }

  // Group by shipment for totals
  const totals = { qty: AppState.items.length, weight: 0, cbm: 0 };
  AppState.items.forEach(it => { totals.weight += it.weight; totals.cbm += (it.l*it.w*it.h)/1e6; });

  el.innerHTML = `
    <div class="citbl-wrap">
      <table class="citbl">
        <thead>
          <tr>
            <th>Color</th>
            <th>Shipment ID</th>
            <th>Description</th>
            <th>L (cm)</th>
            <th>W (cm)</th>
            <th>H (cm)</th>
            <th>Weight (kg)</th>
            <th>Vol (m³)</th>
            <th>Stackable</th>
            <th>Rotatable</th>
            <th>Priority</th>
            <th>Category</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${AppState.items.map((item, idx) => {
            const col = Viewer.hexCSS(Viewer.getColor(item.shipment));
            const cbm = ((item.l * item.w * item.h) / 1e6).toFixed(3);
            return `<tr class="${idx % 2 === 0 ? 'citbl-even' : ''}">
              <td><span class="citbl-dot" style="background:${col}"></span></td>
              <td class="citbl-shp" style="color:${col}">${item.shipment}</td>
              <td>${item.desc}</td>
              <td class="citbl-num">${item.l}</td>
              <td class="citbl-num">${item.w}</td>
              <td class="citbl-num">${item.h}</td>
              <td class="citbl-num">${item.weight}</td>
              <td class="citbl-num">${cbm}</td>
              <td class="citbl-ctr">${item.stackable ? '<span class="citbl-yes">Y</span>' : '<span class="citbl-no">N</span>'}</td>
              <td class="citbl-ctr">${item.rotatable ? '<span class="citbl-yes">Y</span>' : '<span class="citbl-no">N</span>'}</td>
              <td class="citbl-ctr"><span class="citbl-badge">P${item.stackPriority}</span></td>
              <td class="citbl-ctr"><span class="citbl-badge">${item.category}</span></td>
              <td><button class="del-btn" onclick="deleteItem('${item.id}')" title="Remove">&#10005;</button></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="citbl-foot">
            <td colspan="2"></td>
            <td><strong>TOTAL</strong></td>
            <td colspan="4"></td>
            <td class="citbl-num"><strong>${totals.weight.toFixed(1)} kg</strong></td>
            <td class="citbl-num"><strong>${totals.cbm.toFixed(3)} m³</strong></td>
            <td colspan="4"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ── CSV ────────────────────────────────────────
function dlTemplate() {
  const h = 'shipment,description,length_cm,width_cm,height_cm,weight_kg,quantity,max_load_on_top_kg,category,stack_priority,stackable,rotatable';
  const ex = [
    'SHP-001,Box of Electronics,60,40,40,25,10,100,box,2,true,true',
    'SHP-001,Heavy Crate,120,80,100,200,2,50,crate,3,true,false',
    'SHP-002,Fragile Glass,50,50,60,10,5,0,box,1,false,false',
  ].join('\n');
  const blob = new Blob([h + '\n' + ex], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'autoload_cargo_template.csv';
  a.click();
  toast('CSV template downloaded.', 'success');
}

function loadCSV(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const lines = ev.target.result.split('\n').filter(l => l.trim()).slice(1);
    let n = 0;
    lines.forEach(row => {
      const c = row.split(',').map(s => s.trim().replace(/^"|"$/g,''));
      if (c.length < 6) return;
      const [shp,desc,l,w,h,wt,qty,maxload,cat,prio,stack,rot] = c;
      const q = parseInt(qty) || 1;
      for (let i = 0; i < q; i++) {
        AppState.items.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          shipment: shp||'DEFAULT', desc: desc||'Cargo',
          l: parseFloat(l)||10, w: parseFloat(w)||10, h: parseFloat(h)||10,
          weight: parseFloat(wt)||1, maxLoadOnTop: parseFloat(maxload)||99999,
          category: cat||'box', stackPriority: parseInt(prio)||2,
          stackable: stack?.toLowerCase() !== 'false',
          rotatable: rot?.toLowerCase() !== 'false'
        }); n++;
      }
    });
    renderItemList(); toast(`Loaded ${n} items from CSV.`, 'success'); e.target.value = '';
  };
  r.readAsText(f);
}

// ── CALCULATE ──────────────────────────────────
function runAll() {
  if (!AppState.items.length) { toast('Add items first.', 'error'); return; }
  const btn = document.getElementById('calcBtn');
  btn.disabled = true; btn.querySelector('span').textContent = 'Calculating...';

  setTimeout(() => {
    try {
      let eq, autoResult = null;
      if (currentEquipType === 'auto') {
        autoResult = autoCalculateEquipment(AppState.items);
        if (!autoResult) { toast('Could not determine equipment.', 'error'); return; }
        eq = autoResult.eq;
      } else {
        eq = getSelectedEquipment();
        if (!eq) { toast('Select equipment first.', 'error'); return; }
        const tooBig = AppState.items.filter(i => i.l > eq.L || i.w > eq.W || i.h > eq.H);
        if (tooBig.length > 0) toast(`${tooBig.length} item(s) exceed equipment dimensions.`, 'error');
      }

      AppState.results = runAllAlgorithms(AppState.items, eq);
      AppState.autoEquipResult = autoResult;
      AppState.chosenAlgo = null;
      document.getElementById('nav-results').style.display = '';
      document.getElementById('nav-guided').style.display = '';
      showPage('results');

      // Auto-select best algorithm by utilization
      const bestIdx = AppState.results.reduce((b, r, i) =>
        parseFloat(r.containers[0]?.utilization||0) > parseFloat(AppState.results[b].containers[0]?.utilization||0) ? i : b, 0);

      renderAlgoSwitcher(AppState.results, eq, autoResult, bestIdx);
      chooseAlgorithm(bestIdx, true);

    } catch(err) {
      toast('Calculation error: ' + err.message, 'error'); console.error(err);
    } finally {
      btn.disabled = false; btn.querySelector('span').textContent = 'Calculate Load Plan';
    }
  }, 80);
}

// ── ALGORITHM SWITCHER (compact, always visible) ──
function renderAlgoSwitcher(results, eq, autoResult, bestIdx) {
  document.getElementById('resultsMain').style.display = 'block';

  const desc = {
    'LAFF': 'First fit by area',
    'DBLF': 'Depth-first height map',
    'Layer Builder': 'Height layer grouping',
  };

  document.getElementById('algoSwitcherCards').innerHTML = results.map((r, idx) => {
    const c1 = r.containers[0];
    const util = c1 ? c1.utilization : 0;
    const un = parseFloat(util);
    const uc = un > 85 ? 'var(--green)' : un > 60 ? 'var(--accent)' : 'var(--blue)';
    const isBest = bestIdx === idx;
    return `<button class="algo-pill ${isBest ? 'algo-pill-best' : ''}" id="algo-pill-${idx}" onclick="chooseAlgorithm(${idx}, false)">
      <span class="algo-pill-name">${r.algorithm}</span>
      <span class="algo-pill-util" style="color:${uc}">${util}%</span>
      <span class="algo-pill-ctrs">${r.totalContainers} CTR</span>
      ${isBest ? '<span class="algo-pill-star">★ Best</span>' : ''}
    </button>`;
  }).join('');
}

function toggleAlgoPicker() {
  const sw = document.getElementById('algoSwitcherBar');
  sw.style.display = sw.style.display === 'none' ? 'flex' : 'none';
}

// ── CHOOSE ALGORITHM ───────────────────────────
function chooseAlgorithm(idx, isAuto) {
  AppState.chosenAlgo = AppState.results[idx];
  AppState.activeAlgoIdx = idx;

  // Update pill states
  document.querySelectorAll('.algo-pill').forEach((pill, i) => {
    pill.classList.toggle('algo-pill-active', i === idx);
  });

  const r = AppState.chosenAlgo;
  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  document.getElementById('resultsMasterBadge').textContent = masterRef;
  document.getElementById('resultsAlgoBadge').textContent = r.algorithm;
  const autoBadge = document.getElementById('resultsAutoBadge');
  autoBadge.style.display = isAuto ? '' : 'none';

  const grid = document.getElementById('viewersGrid');
  grid.innerHTML = '';
  AppState.viewers = {};

  r.containers.forEach((c, i) => {
    const mountId = `mount-${i}`;
    const legendId = `legend-${i}`;
    const block = document.createElement('div');
    block.className = 'viewer-block';
    block.innerHTML = `
      <div class="viewer-block-header">
        <div>
          <div class="viewer-block-title">Container ${c.num} &mdash; ${c.eq.name}</div>
          <div class="viewer-block-meta">${c.placed.length} items &middot; ${c.loadedWeight.toFixed(0)} kg &middot; ${c.loadedCBM.toFixed(2)} m&#179; &middot; ${c.utilization}% utilized</div>
        </div>
        <div class="viewer-controls">
          <button class="tbtn" onclick="resetCam(${i})">Reset</button>
          <button class="tbtn" onclick="toggleWF(${i})">Wireframe</button>
          <button class="tbtn" onclick="toggleExp(${i})">Explode</button>
          <button class="tbtn" onclick="snapshotOne(${i})">PNG</button>
        </div>
      </div>
      <div class="three-mount" id="${mountId}" style="height:420px;min-height:420px;display:block;"></div>
      <div class="viewer-legend" id="${legendId}"></div>
      <div class="viewer-hint">Drag to rotate &middot; Scroll to zoom &middot; Right-click to pan &middot; Hover for details</div>
    `;
    grid.appendChild(block);

    const mountEl = document.getElementById(mountId);
    const v = Viewer.createInstance(mountEl, legendId);
    AppState.viewers[i] = v;
    v.renderContainer(c, c.eq);
  });

  renderSummary();
  renderLoadingTable();
}

function resetCam(i) { if (AppState.viewers[i]) AppState.viewers[i].resetCamera(); }
function toggleWF(i) { if (AppState.viewers[i]) AppState.viewers[i].toggleWireframe(); }
function toggleExp(i) { if (AppState.viewers[i]) AppState.viewers[i].toggleExplode(); }
function snapshotOne(i) {
  if (!AppState.viewers[i]) return;
  AppState.viewers[i].exportPNG(`AutoLoad3D_CTR${i+1}.png`);
  toast('Snapshot saved.', 'success');
}
function doExportAllPNG() {
  Object.entries(AppState.viewers).forEach(([i, v]) => {
    setTimeout(() => v.exportPNG(`AutoLoad3D_CTR${parseInt(i)+1}.png`), i * 600);
  });
  toast('Exporting snapshots...', 'success');
}

// ── SUMMARY ────────────────────────────────────
function renderSummary() {
  const r = AppState.chosenAlgo; if (!r) return;
  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  const totalW = r.containers.reduce((s,c)=>s+c.loadedWeight,0);
  const totalCBM = r.containers.reduce((s,c)=>s+c.loadedCBM,0);
  let html = `<div class="sum-header"><div class="sum-header-title">Load Summary</div></div><div class="sum-body">`;
  html += `<div class="sum-master">${masterRef}</div>`;
  html += `<div class="sum-algo-tag">Algorithm: <strong>${r.algorithm}</strong></div>`;
  r.containers.forEach(c => {
    const util = parseFloat(c.utilization);
    const uc = util>85?'var(--green)':util>55?'var(--accent)':'var(--blue)';
    const sm = {};
    c.placed.forEach(p=>{const s=p.item.shipment;if(!sm[s])sm[s]={count:0,weight:0,cbm:0};sm[s].count++;sm[s].weight+=p.item.weight;sm[s].cbm+=(p.il*p.iw*p.ih)/1e6;});
    html += `<div class="sum-block">
      <div class="sum-ctr-title">Container ${c.num} <span class="sum-eq">${c.eq.name}</span></div>
      <div class="metric-g">
        <div class="met"><div class="mv">${c.loadedWeight.toFixed(0)}<span class="mu">kg</span></div><div class="ml">Weight</div></div>
        <div class="met"><div class="mv">${c.loadedCBM.toFixed(2)}<span class="mu">m³</span></div><div class="ml">CBM</div></div>
        <div class="met"><div class="mv">${c.placed.length}</div><div class="ml">Items</div></div>
        <div class="met"><div class="mv" style="color:${uc}">${c.utilization}<span class="mu">%</span></div><div class="ml">Utilization</div></div>
      </div>
      <div class="util-bar"><div class="util-fill" style="width:${Math.min(util,100)}%;background:${uc}"></div></div>
      ${c.weightMetrics?`<div class="wm-row"><span>COG</span><span class="wm-val ${c.weightMetrics.balanced?'ok':'warn'}">${c.weightMetrics.balanced?'OK':'Review'}</span></div>`:''}
      ${c.axleLoads?renderAxleLoads(c.axleLoads):''}
      <div class="shp-list">${Object.entries(sm).map(([sid,d])=>`
        <div class="shp-row">
          <span class="shp-id"><span class="cdot" style="background:${Viewer.hexCSS(Viewer.getColor(sid))}"></span>${sid}</span>
          <span class="shp-stats">${d.count}pcs &middot; ${d.weight.toFixed(0)}kg &middot; ${d.cbm.toFixed(2)}m³</span>
        </div>`).join('')}
      </div>
      ${c.loadedWeight>c.eq.maxPayload*0.95?`<div class="warn-tag">&#9888; Near weight limit</div>`:''}
    </div>`;
  });
  html += `<div class="sum-totals"><div class="sum-tot-title">Grand Total</div><div class="metric-g">
    <div class="met"><div class="mv">${totalW.toFixed(0)}<span class="mu">kg</span></div><div class="ml">Weight</div></div>
    <div class="met"><div class="mv">${totalCBM.toFixed(2)}<span class="mu">m³</span></div><div class="ml">CBM</div></div>
    <div class="met"><div class="mv">${r.totalContainers}</div><div class="ml">Containers</div></div>
    <div class="met"><div class="mv">${r.avgUtilization}<span class="mu">%</span></div><div class="ml">Avg Util</div></div>
  </div></div></div>`;
  document.getElementById('resultsSummary').innerHTML = html;
}

function renderAxleLoads(al) {
  return `<div class="axle-block"><div class="axle-title">Axle Loads</div>${al.map(a=>`<div class="axle-row"><span class="axle-name">${a.name}</span><div class="axle-bar-wrap"><div class="axle-bar" style="width:${Math.min(a.load/a.maxLoad*100,100).toFixed(0)}%;background:${a.load>a.maxLoad?'var(--red)':'var(--green)'}"></div></div><span class="axle-val ${a.load>a.maxLoad?'over':''}">${a.load.toFixed(0)}/${a.maxLoad}kg</span></div>`).join('')}</div>`;
}

// ── FULL LOADING TABLE ─────────────────────────
function renderLoadingTable() {
  const r = AppState.chosenAlgo; if (!r) return;
  const el = document.getElementById('loadingTableWrap'); if (!el) return;
  let allRows = [];
  r.containers.forEach(c => {
    c.placed.forEach(p => {
      const rotated = p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;
      allRows.push({ seq:p.seq, ctr:c.num, shipment:p.item.shipment, desc:p.item.desc,
        l:p.il, w:p.iw, h:p.ih, weight:p.item.weight,
        x:p.x.toFixed(0), y:p.y.toFixed(0), z:p.z.toFixed(0),
        rotated:rotated?'Y':'N', stackable:p.item.stackable?'Y':'N', category:p.item.category });
    });
  });
  el.innerHTML = `
    <div class="ltable-header">
      <span class="area-title">Full Loading List <span class="badge">${allRows.length} items</span></span>
      <div style="display:flex;gap:8px;">
        <button class="tbtn" onclick="copyLoadingTable()">&#8691; Copy Table</button>
        <button class="tbtn" onclick="exportLoadingCSV()">&#8595; Export CSV</button>
      </div>
    </div>
    <div class="ltable-scroll">
      <table class="ltable" id="loadingTable">
        <thead><tr>
          <th>#</th><th>CTR</th><th>Shipment</th><th>Description</th>
          <th>L cm</th><th>W cm</th><th>H cm</th><th>Weight kg</th>
          <th>Pos X</th><th>Pos Y</th><th>Pos Z</th>
          <th>Rotated</th><th>Stackable</th><th>Category</th>
        </tr></thead>
        <tbody>${allRows.map(row => `<tr>
          <td>${row.seq}</td><td>${row.ctr}</td>
          <td><span class="shp-chip" style="border-color:${Viewer.hexCSS(Viewer.getColor(row.shipment))};color:${Viewer.hexCSS(Viewer.getColor(row.shipment))}">${row.shipment}</span></td>
          <td>${row.desc}</td>
          <td>${row.l}</td><td>${row.w}</td><td>${row.h}</td><td>${row.weight}</td>
          <td>${row.x}</td><td>${row.y}</td><td>${row.z}</td>
          <td>${row.rotated}</td><td>${row.stackable}</td><td>${row.category}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function copyLoadingTable() {
  const table = document.getElementById('loadingTable'); if (!table) return;
  const rows = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim()).join('\t')).join('\n');
  navigator.clipboard.writeText(rows).then(() => toast('Table copied to clipboard.', 'success'));
}

function exportLoadingCSV() {
  const r = AppState.chosenAlgo; if (!r) return;
  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  const header = 'seq,container,shipment,description,length_cm,width_cm,height_cm,weight_kg,pos_x,pos_y,pos_z,rotated,stackable,category';
  const rows = [];
  r.containers.forEach(c => {
    c.placed.forEach(p => {
      const rotated = p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;
      rows.push([p.seq,c.num,p.item.shipment,p.item.desc,p.il,p.iw,p.ih,p.item.weight,
        p.x.toFixed(0),p.y.toFixed(0),p.z.toFixed(0),rotated?'Y':'N',p.item.stackable?'Y':'N',p.item.category].join(','));
    });
  });
  const blob = new Blob([header+'\n'+rows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `AutoLoad3D_${masterRef}_LoadingList.csv`; a.click();
  toast('Loading list CSV exported.', 'success');
}

// ── GUIDED LOADING ─────────────────────────────
function renderGuidedPage() {
  const r = AppState.chosenAlgo, el = document.getElementById('guidedContent');
  if (!r) { el.innerHTML = `<div class="empty-msg"><p>Run a load calculation first.</p></div>`; return; }
  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  let html = `<div class="guided-meta">
    <div class="gm-item"><span class="gm-lbl">Master Ref</span><span class="gm-val">${masterRef}</span></div>
    <div class="gm-item"><span class="gm-lbl">Algorithm</span><span class="gm-val">${r.algorithm}</span></div>
    <div class="gm-item"><span class="gm-lbl">Containers</span><span class="gm-val">${r.totalContainers}</span></div>
    <div class="gm-item"><span class="gm-lbl">Date</span><span class="gm-val">${new Date().toLocaleDateString()}</span></div>
  </div>`;
  r.containers.forEach(c => {
    const eq = c.eq;
    const totalW = c.placed.reduce((s,p)=>s+p.item.weight,0);
    const totalCBM = c.placed.reduce((s,p)=>s+(p.il*p.iw*p.ih)/1e6,0);
    html += `<div class="guided-container">
      <div class="gc-header">
        <div class="gc-title">Container ${c.num} &mdash; ${eq.name}</div>
        <div class="gc-stats">${c.placed.length} items &middot; ${totalW.toFixed(0)} kg &middot; ${totalCBM.toFixed(2)} m&#179; &middot; ${c.utilization}% utilized</div>
      </div>
      <div class="loading-sequence">
        <table class="seq-table">
          <thead><tr><th>#</th><th>Shipment</th><th>Description</th><th>Dimensions (cm)</th><th>Weight (kg)</th><th>Position (x,y,z)</th><th>Rotation</th><th>Stack</th></tr></thead>
          <tbody>${c.placed.map(p=>{
            const rotated=p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;
            const col=Viewer.hexCSS(Viewer.getColor(p.item.shipment));
            return `<tr>
              <td class="seq-num">${p.seq}</td>
              <td><span class="shp-chip" style="border-color:${col};color:${col}">${p.item.shipment}</span></td>
              <td>${p.item.desc}</td>
              <td class="mono">${p.il}x${p.iw}x${p.ih}</td>
              <td class="mono">${p.item.weight}</td>
              <td class="mono">${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}</td>
              <td class="mono">${rotated?'<span class="rot-yes">Rotated</span>':'Standard'}</td>
              <td>${p.item.stackable?'Y':'-'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${c.weightMetrics?`<div class="gc-cog">COG: X=${c.weightMetrics.cogX.toFixed(0)}cm Y=${c.weightMetrics.cogY.toFixed(0)}cm Z=${c.weightMetrics.cogZ.toFixed(0)}cm &mdash; <span class="${c.weightMetrics.balanced?'ok-tag':'warn-tag2'}">${c.weightMetrics.balanced?'Balanced':'Review'}</span></div>`:''}
    </div>`;
  });
  el.innerHTML = html;
}

function printGuided() { window.print(); }

// ── PDF EXPORT ─────────────────────────────────
function doExportPDF() {
  if (!AppState.chosenAlgo) { toast('Run calculation first.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const r = AppState.chosenAlgo;
  const masterRef = document.getElementById('masterRef').value || 'AUTO';
  const M = 18, PW = 210; let y = M;

  doc.setFillColor(13,15,18); doc.rect(0,0,PW,44,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(245,200,66);
  doc.text('AutoLoad 3D Planner', M, y+8);
  doc.setFontSize(10); doc.setTextColor(180,185,200); doc.setFont('helvetica','normal');
  doc.text(`Algorithm: ${r.algorithm}`, M, y+17);
  doc.text(`Generated: ${new Date().toLocaleString()}`, M, y+23); y=52;
  doc.setFillColor(30,35,50); doc.rect(M,y-2,PW-M*2,10,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(245,200,66);
  doc.text(`Master Reference: ${masterRef}`, M+3, y+5); y+=14;
  const totW=r.containers.reduce((s,c)=>s+c.loadedWeight,0);
  const totCBM=r.containers.reduce((s,c)=>s+c.loadedCBM,0);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(150,160,180);
  doc.text(`Equipment: ${r.containers[0]?.eq?.name}   Containers: ${r.totalContainers}   Weight: ${totW.toFixed(0)}kg   CBM: ${totCBM.toFixed(3)}m³   Avg Util: ${r.avgUtilization}%`, M, y);
  y+=10; doc.setDrawColor(50,60,80); doc.setLineWidth(0.4); doc.line(M,y,PW-M,y); y+=8;

  r.containers.forEach(c => {
    if(y>240){doc.addPage();y=M;}
    doc.setFillColor(25,30,42); doc.rect(M,y-1,PW-M*2,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(232,234,240);
    doc.text(`Container ${c.num}  -  ${c.eq.name}`, M+3, y+5); y+=10;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(150,160,180);
    doc.text(`${c.placed.length} items  |  ${c.loadedWeight.toFixed(0)}/${c.eq.maxPayload}kg  |  ${c.loadedCBM.toFixed(3)}/${c.containerCBM.toFixed(3)}m³  |  ${c.utilization}%`, M, y); y+=5;
    if(c.weightMetrics){const cog=c.weightMetrics;doc.text(`COG: X=${cog.cogX.toFixed(0)}cm Y=${cog.cogY.toFixed(0)}cm Z=${cog.cogZ.toFixed(0)}cm | ${cog.balanced?'Balanced':'REVIEW'}`,M,y);y+=5;}
    y+=3;
    doc.setFillColor(35,42,58); doc.rect(M,y-1,PW-M*2,6,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,110,140);
    const sh=['SHIPMENT ID','PIECES','WEIGHT','VOLUME','DESCRIPTIONS'];
    const sx=[M+2,M+44,M+68,M+98,M+122];
    sh.forEach((h,i)=>doc.text(h,sx[i],y+3.5)); y+=8;
    const sm={};
    c.placed.forEach(p=>{const s=p.item.shipment;if(!sm[s])sm[s]={count:0,weight:0,cbm:0,descs:new Set()};sm[s].count++;sm[s].weight+=p.item.weight;sm[s].cbm+=(p.il*p.iw*p.ih)/1e6;sm[s].descs.add(p.item.desc);});
    Object.entries(sm).forEach(([sid,d])=>{if(y>268){doc.addPage();y=M;}doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(210,215,230);doc.text(sid,sx[0],y);doc.text(String(d.count),sx[1],y);doc.text(d.weight.toFixed(0)+'kg',sx[2],y);doc.text(d.cbm.toFixed(3)+'m³',sx[3],y);doc.text([...d.descs].slice(0,2).join(', ').substring(0,30),sx[4],y);y+=5.5;});
    y+=6; doc.setDrawColor(40,50,65); doc.line(M,y,PW-M,y); y+=8;
  });

  // Step-by-step loading sequence
  doc.addPage(); y=M;
  doc.setFillColor(13,15,18); doc.rect(0,0,PW,30,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(245,200,66);
  doc.text('Loading Sequence  -  Step by Step', M, y+10);
  doc.setFontSize(9); doc.setTextColor(150,160,180); doc.setFont('helvetica','normal');
  doc.text(`Ref: ${masterRef}  |  Algorithm: ${r.algorithm}  |  Total: ${r.containers.reduce((s,c)=>s+c.placed.length,0)} items`, M, y+18);
  y=36;
  doc.setFillColor(20,28,45); doc.rect(M,y,PW-M*2,12,'F');
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(140,150,180);
  doc.text('Place items in sequence order (#). Coordinates are in cm from the front-left-bottom corner of the container.', M+3, y+7); y+=16;

  r.containers.forEach(c => {
    if(y>255){doc.addPage();y=M;}
    doc.setFillColor(40,50,70); doc.rect(M,y,PW-M*2,9,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(245,200,66);
    doc.text(`CONTAINER ${c.num}  -  ${c.eq.name}`, M+3, y+6);
    doc.setFontSize(8); doc.setTextColor(180,190,210);
    doc.text(`${c.placed.length} items  |  ${c.eq.L}x${c.eq.W}x${c.eq.H} cm  |  ${c.utilization}% utilized`, PW-M-3, y+6, {align:'right'}); y+=11;
    doc.setFillColor(28,35,50); doc.rect(M,y,PW-M*2,6,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(90,100,130);
    const cols=['#','SHIPMENT','DESCRIPTION','L x W x H','WT(kg)','POS x,y,z','ROT','STACK'];
    const cx=[M+2,M+10,M+32,M+80,M+112,M+127,M+158,M+167];
    cols.forEach((h,i)=>doc.text(h,cx[i],y+3.8)); y+=7;
    c.placed.forEach((p,ri)=>{
      if(y>274){doc.addPage();y=M;doc.setFillColor(40,50,70);doc.rect(M,y,PW-M*2,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(245,200,66);doc.text(`CONTAINER ${c.num} continued...`,M+3,y+5);y+=9;doc.setFillColor(28,35,50);doc.rect(M,y,PW-M*2,6,'F');doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(90,100,130);cols.forEach((h,i)=>doc.text(h,cx[i],y+3.8));y+=7;}
      const rotated=p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;
      if(ri%2===0){doc.setFillColor(18,22,32);doc.rect(M,y-0.5,PW-M*2,5.5,'F');}
      doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(245,200,66);doc.text(String(p.seq),cx[0],y+3.5);
      doc.setFont('helvetica','normal');doc.setFontSize(7.8);doc.setTextColor(200,210,225);
      doc.text(p.item.shipment.substring(0,10),cx[1],y+3.5);
      doc.text(p.item.desc.substring(0,18),cx[2],y+3.5);
      doc.text(`${p.il}x${p.iw}x${p.ih}`,cx[3],y+3.5);
      doc.text(p.item.weight.toFixed(0),cx[4],y+3.5);
      doc.text(`${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`,cx[5],y+3.5);
      doc.setTextColor(rotated?255:150,rotated?180:210,rotated?80:225);
      doc.text(rotated?'YES':'-',cx[6],y+3.5);
      doc.setTextColor(200,210,225);doc.text(p.item.stackable?'Y':'-',cx[7],y+3.5);y+=5.5;
    });
    if(y>268){doc.addPage();y=M;}
    doc.setFillColor(25,32,45);doc.rect(M,y,PW-M*2,6,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(150,180,220);
    doc.text(`Container ${c.num} total: ${c.placed.length} items | ${c.loadedWeight.toFixed(0)}kg | ${c.loadedCBM.toFixed(3)}m³ | ${c.utilization}%`, M+3, y+4); y+=10;
  });

  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(80,90,110);doc.text(`AutoLoad 3D  |  ${r.algorithm}  |  ${masterRef}  |  Page ${i}/${pages}`,M,292);doc.text(new Date().toLocaleDateString(),PW-M,292,{align:'right'});}
  doc.save(`AutoLoad3D_${masterRef}.pdf`);
  toast('PDF downloaded.', 'success');
}

function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
}

// Init called by auth.js → onAuthReady()
document.addEventListener('DOMContentLoaded', () => {
  genRef(); updateEquipPreview();
});
