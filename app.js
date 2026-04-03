/* =============================================
   app.js — Main application controller
   ============================================= */

'use strict';

const AppState = {
  items: [], results: null, chosenAlgo: null, activeContainer: 0, theme: 'dark',
};

function toggleTheme() {
  AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', AppState.theme);
  document.querySelector('.theme-icon').textContent = AppState.theme === 'dark' ? '◐' : '●';
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.style.display = 'block';
  const nb = [...document.querySelectorAll('.nav-btn')].find(b => b.textContent.toLowerCase().includes(name.replace('-',' ')));
  if (nb) nb.classList.add('active');
  if (name === 'guided') renderGuidedPage();
}

function genRef() {
  const d = new Date();
  document.getElementById('masterRef').value = `MLD-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
}

function addItem() {
  const shp=document.getElementById('ci-shp').value.trim();
  const desc=document.getElementById('ci-desc').value.trim()||'Cargo';
  const l=parseFloat(document.getElementById('ci-l').value);
  const w=parseFloat(document.getElementById('ci-w').value);
  const h=parseFloat(document.getElementById('ci-h').value);
  const weight=parseFloat(document.getElementById('ci-wt').value);
  const qty=parseInt(document.getElementById('ci-qty').value)||1;
  const maxload=parseFloat(document.getElementById('ci-maxload').value)||99999;
  const cat=document.getElementById('ci-cat').value;
  const prio=parseInt(document.getElementById('ci-prio').value);
  const stack=document.getElementById('ci-stack').checked;
  const rot=document.getElementById('ci-rot').checked;
  if (!shp) { toast('Shipment ID required.','error'); return; }
  if (isNaN(l)||l<=0||isNaN(w)||w<=0||isNaN(h)||h<=0) { toast('Enter valid dimensions.','error'); return; }
  if (isNaN(weight)||weight<=0) { toast('Enter valid weight.','error'); return; }
  for (let i=0;i<qty;i++) {
    AppState.items.push({ id:`${Date.now()}-${Math.random().toString(36).slice(2)}`, shipment:shp, desc, l, w, h, weight, maxLoadOnTop:maxload, category:cat, stackPriority:prio, stackable:stack, rotatable:rot });
  }
  renderItemList();
  ['ci-shp','ci-desc','ci-l','ci-w','ci-h','ci-wt','ci-maxload'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ci-qty').value='1';
  toast(`Added ${qty} item(s) · ${shp}`,'success');
}

function deleteItem(id) { AppState.items=AppState.items.filter(i=>i.id!==id); renderItemList(); }
function clearItems() { AppState.items=[]; renderItemList(); resetResultsUI(); }

function renderItemList() {
  const el=document.getElementById('cargoTable'), bdg=document.getElementById('itemBadge');
  bdg.textContent=AppState.items.length;
  if (!AppState.items.length) { el.innerHTML=`<div class="empty-msg"><div class="empty-ico">▦</div><p>No items yet. Add cargo on the left.</p></div>`; return; }
  el.innerHTML=AppState.items.map(item => {
    const col=Viewer.hexCSS(Viewer.getColor(item.shipment));
    const cbm=((item.l*item.w*item.h)/1e6).toFixed(3);
    return `<div class="cargo-row"><div class="cri"><div class="crn"><span class="cdot" style="background:${col}"></span>${item.desc}</div><div class="crs">SHP: ${item.shipment}</div><div class="crd">${item.l}×${item.w}×${item.h} cm · ${item.weight} kg · ${cbm} m³</div><div class="crf">${item.stackable?'<span class="fl fs">Stack</span>':'<span class="fl fn">No Stack</span>'}${item.rotatable?'<span class="fl fr">Rot</span>':''}<span class="fl fp">P${item.stackPriority}</span><span class="fl fp">${item.category}</span></div></div><button class="del-btn" onclick="deleteItem('${item.id}')">✕</button></div>`;
  }).join('');
}

function dlTemplate() {
  const h='shipment,description,length_cm,width_cm,height_cm,weight_kg,quantity,max_load_on_top_kg,category,stack_priority,stackable,rotatable';
  const r='SHP-001,Box of Electronics,60,40,40,25,10,100,box,2,true,true';
  const b=new Blob([h+'\n'+r],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='autoload_template.csv'; a.click();
}

function loadCSV(e) {
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    const lines=ev.target.result.split('\n').filter(l=>l.trim()).slice(1);
    let n=0;
    lines.forEach(row=>{
      const c=row.split(',').map(s=>s.trim().replace(/^"|"$/g,''));
      if(c.length<6) return;
      const [shp,desc,l,w,h,wt,qty,maxload,cat,prio,stack,rot]=c;
      const q=parseInt(qty)||1;
      for(let i=0;i<q;i++){
        AppState.items.push({ id:`${Date.now()}-${Math.random().toString(36).slice(2)}`, shipment:shp||'DEFAULT', desc:desc||'Cargo', l:parseFloat(l)||10, w:parseFloat(w)||10, h:parseFloat(h)||10, weight:parseFloat(wt)||1, maxLoadOnTop:parseFloat(maxload)||99999, category:cat||'box', stackPriority:parseInt(prio)||2, stackable:stack?.toLowerCase()!=='false', rotatable:rot?.toLowerCase()!=='false' }); n++;
      }
    });
    renderItemList(); toast(`Loaded ${n} items from CSV.`,'success'); e.target.value='';
  };
  r.readAsText(f);
}

function runAll() {
  if (!AppState.items.length) { toast('Add items first.','error'); return; }
  const btn=document.getElementById('calcBtn');
  btn.disabled=true; btn.querySelector('span').textContent='Calculating…';
  setTimeout(()=>{
    try {
      if (currentEquipType==='auto') {
        const autoResult=autoCalculateEquipment(AppState.items);
        if (!autoResult) { toast('Could not determine equipment.','error'); return; }
        const eq=autoResult.eq;
        toast(`Auto-selected: ${autoResult.unitsNeeded}× ${eq.name} (~${autoResult.estUtil}% util)`,'success');
        AppState.results=runAllAlgorithms(AppState.items,eq);
        AppState.autoEquipResult=autoResult; AppState.chosenAlgo=null; AppState.activeContainer=0;
        renderAlgoComparison(AppState.results,eq,autoResult); return;
      }
      const eq=getSelectedEquipment();
      if (!eq) { toast('Select equipment first.','error'); return; }
      const tooBig=AppState.items.filter(i=>i.l>eq.L||i.w>eq.W||i.h>eq.H);
      if (tooBig.length>0) toast(`${tooBig.length} item(s) exceed equipment dimensions.`,'error');
      AppState.results=runAllAlgorithms(AppState.items,eq);
      AppState.autoEquipResult=null; AppState.chosenAlgo=null; AppState.activeContainer=0;
      renderAlgoComparison(AppState.results,eq);
    } catch(err) { toast('Calculation error: '+err.message,'error'); console.error(err); }
    finally { btn.disabled=false; btn.querySelector('span').textContent='Calculate Load Plan'; }
  },80);
}

function renderAlgoComparison(results, eq, autoResult) {
  const wrap=document.getElementById('algoCompare'), cards=document.getElementById('algoCards');
  wrap.style.display='block'; document.getElementById('viewerArea').style.display='none'; resetSummaryUI();
  const existingBanner=document.getElementById('autoBanner'); if(existingBanner) existingBanner.remove();
  if (autoResult) {
    const banner=document.createElement('div'); banner.id='autoBanner'; banner.className='auto-banner';
    banner.innerHTML=`<span class="auto-banner-icon">⚡</span><div class="auto-banner-text"><strong>Auto-selected Equipment:</strong> ${autoResult.unitsNeeded}× ${eq.name}<span class="auto-banner-dim">${eq.L}×${eq.W}×${eq.H} cm · ${(eq.L*eq.W*eq.H/1e6).toFixed(2)} m³ each · Max ${eq.maxPayload.toLocaleString()} kg</span></div>`;
    wrap.insertBefore(banner,wrap.querySelector('.algo-cards'));
  }
  const algoDescs={'LAFF':'Sorts by base area, finds first fitting position at each candidate point. Fast and generally efficient.','DBLF':'Depth-first scanning from back-left, builds a height map. Excellent for uniform cargo.','Layer Builder':'Groups cargo into horizontal layers by height. Best for mixed-size cargo with clear height bands.'};
  cards.innerHTML=results.map((r,idx)=>{
    const c1=r.containers[0], util=c1?c1.utilization:0, utilNum=parseFloat(util);
    const utilColor=utilNum>85?'green':utilNum>60?'yellow':'blue';
    const wm=c1?.weightMetrics;
    const isBest=results.reduce((best,rr,ii)=>parseFloat(rr.containers[0]?.utilization||0)>parseFloat(results[best].containers[0]?.utilization||0)?ii:best,0)===idx;
    return `<div class="algo-card ${isBest?'best':''}">${isBest?'<div class="best-badge">★ Best</div>':''}<div class="algo-name">${r.algorithm}</div><div class="algo-desc">${algoDescs[r.algorithm]||''}</div><div class="algo-metrics"><div class="am"><span class="amv ${utilColor}">${util}%</span><span class="aml">Utilization</span></div><div class="am"><span class="amv">${r.totalContainers}</span><span class="aml">Containers</span></div><div class="am"><span class="amv">${c1?c1.placed.length:0}</span><span class="aml">Items Loaded</span></div><div class="am"><span class="amv">${c1?c1.loadedWeight.toFixed(0):0} kg</span><span class="aml">Weight</span></div></div>${wm?`<div class="cog-row"><span class="cog-label">Center of Gravity</span><span class="cog-val ${wm.balanced?'ok':'warn'}">${wm.balanced?'✓ Balanced':'⚠ Review'}</span></div>`:''}<button class="btn-primary full mt-xs" onclick="chooseAlgorithm(${idx})">Use ${r.algorithm}</button></div>`;
  }).join('');
}

function chooseAlgorithm(idx) {
  AppState.chosenAlgo=AppState.results[idx]; AppState.activeContainer=0;
  document.getElementById('algoCompare').style.display='none';
  document.getElementById('viewerArea').style.display='flex';
  Viewer.init(document.getElementById('threeMount'));
  renderContainerTabs(); renderViewerContainer(0); renderSummary();
  document.getElementById('summaryFooter').style.display='block';
}

function renderContainerTabs() {
  document.getElementById('ctrTabs').innerHTML=AppState.chosenAlgo.containers.map((c,i)=>
    `<button class="ctab ${i===AppState.activeContainer?'active':''}" onclick="switchCtr(${i})">CTR ${c.num}</button>`).join('');
}

function switchCtr(idx) {
  AppState.activeContainer=idx;
  document.querySelectorAll('.ctab').forEach((b,i)=>b.classList.toggle('active',i===idx));
  renderViewerContainer(idx);
}

function renderViewerContainer(idx) {
  const r=AppState.chosenAlgo, c=r.containers[idx];
  document.getElementById('viewerTitle').textContent=`3D View — ${r.algorithm} · Container ${c.num} of ${r.containers.length}`;
  Viewer.renderContainer(c,c.eq);
}

function renderSummary() {
  const r=AppState.chosenAlgo; if(!r) return;
  const masterRef=document.getElementById('masterRef').value||'AUTO';
  const totalW=r.containers.reduce((s,c)=>s+c.loadedWeight,0);
  const totalCBM=r.containers.reduce((s,c)=>s+c.loadedCBM,0);
  let html=`<div class="summary-body"><div class="sum-master">◈ ${masterRef}</div><div class="sum-algo-tag">Algorithm: <strong>${r.algorithm}</strong></div>`;
  r.containers.forEach(c=>{
    const util=parseFloat(c.utilization), uColor=util>85?'var(--green)':util>55?'var(--accent)':'var(--blue)';
    const shipMap={};
    c.placed.forEach(p=>{ const s=p.item.shipment; if(!shipMap[s]) shipMap[s]={count:0,weight:0,cbm:0}; shipMap[s].count++; shipMap[s].weight+=p.item.weight; shipMap[s].cbm+=(p.il*p.iw*p.ih)/1e6; });
    html+=`<div class="sum-block"><div class="sum-ctr-title">Container ${c.num} <span class="sum-eq">${c.eq.name}</span></div><div class="metric-g"><div class="met"><div class="mv">${c.loadedWeight.toFixed(0)}<span class="mu">kg</span></div><div class="ml">Weight</div></div><div class="met"><div class="mv">${c.loadedCBM.toFixed(2)}<span class="mu">m³</span></div><div class="ml">CBM</div></div><div class="met"><div class="mv">${c.placed.length}</div><div class="ml">Items</div></div><div class="met"><div class="mv" style="color:${uColor}">${c.utilization}<span class="mu">%</span></div><div class="ml">Utilization</div></div></div><div class="util-bar"><div class="util-fill" style="width:${Math.min(util,100)}%;background:${uColor}"></div></div>${c.weightMetrics?`<div class="wm-row"><span class="wm-label">COG Balance</span><span class="wm-val ${c.weightMetrics.balanced?'ok':'warn'}">${c.weightMetrics.balanced?'✓ OK':'⚠ Review'}</span></div>`:''} ${c.axleLoads?renderAxleLoads(c.axleLoads):''}<div class="shp-list">${Object.entries(shipMap).map(([sid,d])=>`<div class="shp-row"><span class="shp-id"><span class="cdot" style="background:${Viewer.hexCSS(Viewer.getColor(sid))}"></span>${sid}</span><span class="shp-stats">${d.count}pcs · ${d.weight.toFixed(0)}kg · ${d.cbm.toFixed(2)}m³</span></div>`).join('')}</div>${c.loadedWeight>c.eq.maxPayload*0.95?`<div class="warn-tag">⚠ Near weight limit: ${c.loadedWeight.toFixed(0)}/${c.eq.maxPayload} kg</div>`:''}</div>`;
  });
  html+=`<div class="sum-totals"><div class="sum-tot-title">Grand Total</div><div class="metric-g"><div class="met"><div class="mv">${totalW.toFixed(0)}<span class="mu">kg</span></div><div class="ml">Weight</div></div><div class="met"><div class="mv">${totalCBM.toFixed(2)}<span class="mu">m³</span></div><div class="ml">CBM</div></div><div class="met"><div class="mv">${r.totalContainers}</div><div class="ml">Containers</div></div><div class="met"><div class="mv">${r.avgUtilization}<span class="mu">%</span></div><div class="ml">Avg Util</div></div></div></div></div>`;
  document.getElementById('summaryBody').innerHTML=html;
}

function renderAxleLoads(axleLoads) {
  return `<div class="axle-block"><div class="axle-title">Axle Loads</div>${axleLoads.map(a=>`<div class="axle-row"><span class="axle-name">${a.name}</span><div class="axle-bar-wrap"><div class="axle-bar" style="width:${Math.min(a.load/a.maxLoad*100,100).toFixed(0)}%;background:${a.load>a.maxLoad?'var(--red)':'var(--green)'}"></div></div><span class="axle-val ${a.load>a.maxLoad?'over':''}">${a.load.toFixed(0)}/${a.maxLoad} kg</span></div>`).join('')}</div>`;
}

function resetSummaryUI() {
  document.getElementById('summaryBody').innerHTML=`<div class="empty-msg" style="padding:40px 20px"><div class="empty-ico">◫</div><p>Choose an algorithm result to view summary.</p></div>`;
  document.getElementById('summaryFooter').style.display='none';
}
function resetResultsUI() { document.getElementById('algoCompare').style.display='none'; document.getElementById('viewerArea').style.display='none'; resetSummaryUI(); }

function showGuidedFromResult() { if(!AppState.chosenAlgo){toast('No result selected.','error');return;} showPage('guided'); }

function renderGuidedPage() {
  const r=AppState.chosenAlgo, el=document.getElementById('guidedContent');
  if (!r) { el.innerHTML=`<div class="empty-msg"><p>Run a load calculation and choose an algorithm first.</p></div>`; return; }
  const masterRef=document.getElementById('masterRef').value||'AUTO';
  let html=`<div class="guided-meta"><div class="gm-item"><span class="gm-lbl">Master Ref</span><span class="gm-val">${masterRef}</span></div><div class="gm-item"><span class="gm-lbl">Algorithm</span><span class="gm-val">${r.algorithm}</span></div><div class="gm-item"><span class="gm-lbl">Containers</span><span class="gm-val">${r.totalContainers}</span></div><div class="gm-item"><span class="gm-lbl">Date</span><span class="gm-val">${new Date().toLocaleDateString()}</span></div></div>`;
  r.containers.forEach(c=>{
    const eq=c.eq, totalW=c.placed.reduce((s,p)=>s+p.item.weight,0), totalCBM=c.placed.reduce((s,p)=>s+(p.il*p.iw*p.ih)/1e6,0);
    html+=`<div class="guided-container"><div class="gc-header"><div class="gc-title">Container ${c.num} — ${eq.name}</div><div class="gc-stats">${c.placed.length} items · ${totalW.toFixed(0)} kg · ${totalCBM.toFixed(2)} m³ · ${c.utilization}% utilized</div></div><div class="loading-sequence"><table class="seq-table"><thead><tr><th>#</th><th>Shipment</th><th>Description</th><th>Dimensions (cm)</th><th>Weight (kg)</th><th>Position (x,y,z)</th><th>Rotation</th><th>Stack</th></tr></thead><tbody>${c.placed.map(p=>{const rotated=p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;const col=Viewer.hexCSS(Viewer.getColor(p.item.shipment));return `<tr><td class="seq-num">${p.seq}</td><td><span class="shp-chip" style="border-color:${col};color:${col}">${p.item.shipment}</span></td><td>${p.item.desc}</td><td class="mono">${p.il}×${p.iw}×${p.ih}</td><td class="mono">${p.item.weight}</td><td class="mono">${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}</td><td class="mono">${rotated?'<span class="rot-yes">Rotated</span>':'Standard'}</td><td>${p.item.stackable?'✓':'-'}</td></tr>`;}).join('')}</tbody></table></div>${c.weightMetrics?`<div class="gc-cog">◎ COG: X=${c.weightMetrics.cogX.toFixed(0)}cm · Y=${c.weightMetrics.cogY.toFixed(0)}cm · Z=${c.weightMetrics.cogZ.toFixed(0)}cm <span class="${c.weightMetrics.balanced?'ok-tag':'warn-tag2'}">${c.weightMetrics.balanced?'Balanced':'Review distribution'}</span></div>`:''} ${c.axleLoads?`<div class="gc-axle">${c.axleLoads.map(a=>`<span class="${a.load>a.maxLoad?'axle-over':'axle-ok'}">${a.name}: ${a.load.toFixed(0)}/${a.maxLoad} kg</span>`).join(' · ')}</div>`:''}</div>`;
  });
  el.innerHTML=html;
}

function printGuided() { window.print(); }

function doExportPNG() {
  if(!AppState.chosenAlgo){toast('Run calculation first.','error');return;}
  Viewer.exportPNG(`AutoLoad3D_${document.getElementById('masterRef').value||'plan'}_CTR${AppState.activeContainer+1}.png`);
  toast('3D snapshot exported.','success');
}

function doExportPDF() {
  if(!AppState.chosenAlgo){toast('Run calculation first.','error');return;}
  const {jsPDF}=window.jspdf, doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const r=AppState.chosenAlgo, masterRef=document.getElementById('masterRef').value||'AUTO';
  const M=18, PW=210; let y=M;
  doc.setFillColor(13,15,18); doc.rect(0,0,PW,42,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(245,200,66);
  doc.text('AutoLoad 3D Planner',M,y+8);
  doc.setFontSize(10); doc.setTextColor(138,144,168); doc.setFont('helvetica','normal');
  doc.text(`Load Plan Report — ${r.algorithm}`,M,y+16);
  doc.text(`Generated: ${new Date().toLocaleString()}`,M,y+22); y=52;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(245,200,66);
  doc.text(`Master Reference: ${masterRef}`,M,y); y+=6;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(138,144,168);
  const totW=r.containers.reduce((s,c)=>s+c.loadedWeight,0), totCBM=r.containers.reduce((s,c)=>s+c.loadedCBM,0);
  doc.text(`Equipment: ${r.containers[0]?.eq?.name}  |  Containers: ${r.totalContainers}  |  Total: ${totW.toFixed(0)}kg / ${totCBM.toFixed(3)}m³  |  Avg Util: ${r.avgUtilization}%`,M,y);
  y+=10; doc.setDrawColor(36,40,53); doc.setLineWidth(0.3); doc.line(M,y,PW-M,y); y+=8;
  r.containers.forEach(c=>{
    if(y>240){doc.addPage();y=M;}
    doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(232,234,240);
    doc.text(`Container ${c.num} — ${c.eq.name}`,M,y);y+=6;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(138,144,168);
    doc.text(`Items: ${c.placed.length}  |  Weight: ${c.loadedWeight.toFixed(0)}/${c.eq.maxPayload}kg  |  CBM: ${c.loadedCBM.toFixed(3)}/${c.containerCBM.toFixed(3)}m³  |  Utilization: ${c.utilization}%`,M,y);y+=5;
    if(c.weightMetrics){doc.text(`COG — X:${c.weightMetrics.cogX.toFixed(0)}cm Y:${c.weightMetrics.cogY.toFixed(0)}cm Z:${c.weightMetrics.cogZ.toFixed(0)}cm  Balance: ${c.weightMetrics.balanced?'OK':'Review'}`,M,y);y+=5;}
    y+=2;
    doc.setFillColor(26,30,39);doc.rect(M,y-1,PW-M*2,6,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(83,88,112);
    ['SHIPMENT','ITEMS','WEIGHT (kg)','CBM (m³)','DESCRIPTIONS'].forEach((h,i)=>doc.text(h,[M+2,M+44,M+66,M+96,M+122][i],y+3.5));
    y+=8;
    const sm={};
    c.placed.forEach(p=>{const s=p.item.shipment;if(!sm[s])sm[s]={count:0,weight:0,cbm:0,descs:new Set()};sm[s].count++;sm[s].weight+=p.item.weight;sm[s].cbm+=(p.il*p.iw*p.ih)/1e6;sm[s].descs.add(p.item.desc);});
    Object.entries(sm).forEach(([sid,d])=>{if(y>265){doc.addPage();y=M;}doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(200,204,218);doc.text(sid,M+2,y);doc.text(String(d.count),M+46,y);doc.text(d.weight.toFixed(1),M+68,y);doc.text(d.cbm.toFixed(3),M+98,y);doc.text([...d.descs].slice(0,2).join(', ').substring(0,28),M+124,y);y+=5.5;});
    y+=6;doc.setDrawColor(36,40,53);doc.line(M,y,PW-M,y);y+=8;
  });
  if(y>230){doc.addPage();y=M;}
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(245,200,66);doc.text('Loading Sequence',M,y);y+=8;
  doc.setFillColor(26,30,39);doc.rect(M,y-1,PW-M*2,6,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(83,88,112);
  ['#','CTR','SHIPMENT','DESCRIPTION','L×W×H (cm)','WT(kg)','POS x,y,z','ROT','STACK'].forEach((h,i)=>doc.text(h,[M+2,M+10,M+20,M+44,M+82,M+112,M+128,M+156,M+167][i],y+3.5));
  y+=8;
  r.containers.forEach(c=>{c.placed.forEach(p=>{if(y>270){doc.addPage();y=M+4;}doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(190,194,210);const rotated=p.il!==p.item.l||p.iw!==p.item.w||p.ih!==p.item.h;doc.text(String(p.seq),M+2,y);doc.text(String(c.num),M+12,y);doc.text(p.item.shipment.substring(0,10),M+20,y);doc.text(p.item.desc.substring(0,16),M+44,y);doc.text(`${p.il}×${p.iw}×${p.ih}`,M+82,y);doc.text(p.item.weight.toFixed(0),M+112,y);doc.text(`${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`,M+128,y);doc.text(rotated?'Y':'N',M+160,y);doc.text(p.item.stackable?'Y':'N',M+170,y);y+=5;});});
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(83,88,112);doc.text(`AutoLoad 3D Planner · ${r.algorithm} · Page ${i} of ${pages}`,M,292);}
  doc.save(`AutoLoad3D_${masterRef}.pdf`); toast('PDF downloaded.','success');
}

function toast(msg,type=''){const el=document.createElement('div');el.className='toast '+type;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3500);}
function resetCam(){Viewer.resetCamera();}
function toggleWF(){Viewer.toggleWireframe();}
function toggleExplode(){Viewer.toggleExplode();}

document.addEventListener('DOMContentLoaded',()=>{genRef();updateEquipPreview();renderItemList();document.getElementById('page-planner').style.display='block';});
