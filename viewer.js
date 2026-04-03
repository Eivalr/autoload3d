/* =============================================
   viewer.js — Three.js 3D Visualization
   Multi-instance · Painted labels on box faces
   ============================================= */

'use strict';

// Shared color map across all instances
const _colorMap = {};
let _colorIdx = 0;
const _PALETTE = [
  0x4fa8ff, 0x3ddc97, 0xf5c842, 0xff5f6d, 0xb48aff,
  0xff9d5c, 0x5ce8e8, 0xff79c6, 0x8be9fd, 0x50fa7b,
  0xffb86c, 0xbd93f9, 0xf1fa8c, 0x6be5fd, 0xcf6679,
];

function _getColor(shipId) {
  if (!_colorMap[shipId]) { _colorMap[shipId] = _PALETTE[_colorIdx++ % _PALETTE.length]; }
  return _colorMap[shipId];
}
function _hexCSS(h) { return '#' + h.toString(16).padStart(6, '0'); }

// ── CREATE INSTANCE ────────────────────────────
function createViewerInstance(mountEl, legendId) {
  let scene, camera, renderer, raycaster, animId;
  let cargoMeshes = [], containerMesh = null;
  let isWireframe = false, isExploded = false;
  let explodeOrigins = [];
  let currentEq = null;
  let pendingContainer = null;
  let orbitState = { theta: Math.PI/4, phi: Math.PI/3.5, r: 2500, target: null, dragging: false, rightDrag: false, lastMouse:{x:0,y:0} };

  function getSize() {
    // Force the element to have a real height before reading
    const W = mountEl.offsetWidth || mountEl.clientWidth || 800;
    const H = mountEl.offsetHeight || mountEl.clientHeight || 420;
    return { W: W || 800, H: H || 420 };
  }

  function init() {
    mountEl.innerHTML = '';
    if (animId) cancelAnimationFrame(animId);
    if (renderer) { renderer.dispose(); renderer = null; }

    const { W, H } = getSize();

    scene = new THREE.Scene();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    scene.background = new THREE.Color(isDark ? 0x13161c : 0xf0f2f5);

    camera = new THREE.PerspectiveCamera(45, W / H, 1, 100000);
    raycaster = new THREE.Raycaster();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountEl.appendChild(renderer.domElement);

    // Lights
    const isDark2 = document.documentElement.getAttribute('data-theme') !== 'light';
    scene.add(new THREE.AmbientLight(0xffffff, isDark2 ? 0.45 : 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, isDark2 ? 0.9 : 0.7);
    sun.position.set(2000, 3000, 2000);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(isDark2 ? 0x4080ff : 0xffd080, 0.3);
    fill.position.set(-2000, 1000, -1000);
    scene.add(fill);

    const grid = new THREE.GridHelper(8000, 40, isDark2 ? 0x242835 : 0xd0d4e0, isDark2 ? 0x1a1e27 : 0xe8eaf0);
    grid.position.y = -2;
    scene.add(grid);

    setupOrbit();
    setupTooltip();

    // ResizeObserver to handle layout changes
    const ro = new ResizeObserver(() => {
      const w = mountEl.offsetWidth || mountEl.clientWidth;
      const h = mountEl.offsetHeight || mountEl.clientHeight;
      if (w > 10 && h > 10 && renderer) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(mountEl);

    animate();

    // If renderContainer was called before init finished, execute it now
    if (pendingContainer) {
      const { container, eq } = pendingContainer;
      pendingContainer = null;
      _renderContainer(container, eq);
    }
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function clearScene() {
    if (!scene) return;
    cargoMeshes.forEach(m => scene.remove(m));
    cargoMeshes = [];
    if (containerMesh) { scene.remove(containerMesh); containerMesh = null; }
    explodeOrigins = [];
    isExploded = false;
  }

  function renderContainer(container, eq) {
    if (!renderer) {
      // Not yet initialized — queue it
      pendingContainer = { container, eq };
      return;
    }
    _renderContainer(container, eq);
  }

  function _renderContainer(container, eq) {
    clearScene();
    if (!scene) return;
    currentEq = eq;
    const { L, W, H } = eq;
    const ox = -L/2, oy = 0, oz = -W/2;
    const contGroup = new THREE.Group();

    // Container shell
    if (eq.type === 'uld' && eq.contourPoints) {
      try {
        const geos = buildULDContourGeometry(eq);
        const mat = new THREE.MeshStandardMaterial({ color: eq.color3d||0x3a4060, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
        const wireMat = new THREE.MeshBasicMaterial({ color: eq.color3d||0x3a4060, transparent: true, opacity: 0.35, wireframe: true });
        geos.forEach(geo => {
          const mesh = new THREE.Mesh(geo, mat);
          const wire = new THREE.Mesh(geo.clone(), wireMat);
          mesh.rotation.y = -Math.PI/2; wire.rotation.y = -Math.PI/2;
          contGroup.add(mesh); contGroup.add(wire);
        });
      } catch(e) { addBoxContainer(contGroup, L, W, H, eq.color3d); }
    } else {
      addBoxContainer(contGroup, L, W, H, eq.color3d);
    }

    // Floor — warm timber brown, clearly distinct from cargo
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({ color: isDark ? 0x5a3e1b : 0xc8a96e, roughness: 0.9, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI/2;
    floor.position.set(0, 1, 0);
    floor.receiveShadow = true;
    contGroup.add(floor);

    // Floor planking lines
    const plankMat = new THREE.LineBasicMaterial({ color: isDark ? 0x3a2510 : 0xa07840, transparent: true, opacity: 0.5 });
    for (let px = -L/2; px <= L/2; px += 30) {
      contGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(px, 2, -W/2), new THREE.Vector3(px, 2, W/2)]),
        plankMat
      ));
    }

    contGroup.position.set(ox + L/2, oy, oz + W/2);
    scene.add(contGroup);
    containerMesh = contGroup;

    // Cargo items
    container.placed.forEach(p => {
      const color = _getColor(p.item.shipment);
      const materials = createBoxMaterials(p.item.shipment, color);
      const geo = new THREE.BoxGeometry(p.il - 1.5, p.ih - 1.5, p.iw - 1.5);
      const mesh = new THREE.Mesh(geo, materials);

      mesh.position.set(ox + p.x + p.il/2, oy + p.y + p.ih/2, oz + p.z + p.iw/2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Edge outline
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(p.il - 0.5, p.ih - 0.5, p.iw - 0.5)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
      ));

      mesh.userData = { item: p.item, placement: p, seq: p.seq };
      explodeOrigins.push({ mesh, origin: mesh.position.clone() });
      scene.add(mesh);
      cargoMeshes.push(mesh);
    });

    // Camera position
    orbitState.r = Math.max(L, W, H) * 2.2;
    orbitState.target = new THREE.Vector3(0, H / 2, 0);
    orbitState.theta = Math.PI / 4;
    orbitState.phi = Math.PI / 3.5;
    updateCamera();

    renderLegend(container);
  }

  // ── BOX FACE MATERIALS WITH PAINTED LABEL ──
  function createBoxMaterials(shipmentId, boxColor) {
    const tex = makeLabelTexture(shipmentId, boxColor);
    const r = (boxColor >> 16) & 0xff;
    const g = (boxColor >> 8) & 0xff;
    const b = boxColor & 0xff;

    const plain = () => new THREE.MeshStandardMaterial({
      color: boxColor, roughness: 0.65, metalness: 0.08,
    });
    const labeled = () => new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.6, metalness: 0.05,
    });

    // BoxGeometry face order: +X, -X, +Y (top), -Y, +Z (front), -Z
    return [labeled(), plain(), labeled(), plain(), labeled(), plain()];
  }

  function makeLabelTexture(shipmentId, boxColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base color fill
    const r = (boxColor >> 16) & 0xff;
    const g = (boxColor >> 8) & 0xff;
    const b = boxColor & 0xff;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 512, 256);

    // Dark overlay for contrast
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, 512, 256);

    // White border
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 488, 232);

    // Shipment ID text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 78px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = shipmentId.length > 10 ? shipmentId.substring(0, 9) + '…' : shipmentId;
    ctx.fillText(label, 256, 118);

    // Underline accent
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(130, 168, 252, 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function addBoxContainer(group, L, W, H, color) {
    const cGeo = new THREE.BoxGeometry(L, H, W);
    const cMesh = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({
      color: color || 0x3a4060, wireframe: true, transparent: true, opacity: 0.3
    }));
    cMesh.position.set(0, H / 2, 0);
    group.add(cMesh);
    group.add(new THREE.Mesh(cGeo.clone(), new THREE.MeshStandardMaterial({
      color: color || 0x3a4060, transparent: true, opacity: 0.05, side: THREE.BackSide
    })));
  }

  function renderLegend(container) {
    const el = document.getElementById(legendId);
    if (!el) return;
    const shipments = [...new Set(container.placed.map(p => p.item.shipment))];
    el.innerHTML = shipments.map(sid =>
      `<div class="leg-item"><div class="leg-dot" style="background:${_hexCSS(_getColor(sid))}"></div>${sid}</div>`
    ).join('');
  }

  // ── CONTROLS ───────────────────────────────
  function toggleWireframe() {
    isWireframe = !isWireframe;
    cargoMeshes.forEach(m => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => { if (mat) mat.wireframe = isWireframe; });
    });
  }

  function toggleExplode() {
    isExploded = !isExploded;
    if (!currentEq) return;
    const factor = isExploded ? 1.45 : 1.0;
    const cx = 0, cy = currentEq.H / 2, cz = 0;
    explodeOrigins.forEach(({ mesh, origin }) => {
      mesh.position.set(
        cx + (origin.x - cx) * factor,
        cy + (origin.y - cy) * factor,
        cz + (origin.z - cz) * factor
      );
    });
  }

  function resetCamera() {
    orbitState.theta = Math.PI / 4;
    orbitState.phi = Math.PI / 3.5;
    updateCamera();
  }

  function setupOrbit() {
    orbitState.target = new THREE.Vector3(0, 200, 0);

    mountEl.addEventListener('mousedown', e => {
      orbitState.dragging = true;
      orbitState.rightDrag = e.button === 2;
      orbitState.lastMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    mountEl.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('mousemove', e => {
      if (!orbitState.dragging) return;
      const dx = e.clientX - orbitState.lastMouse.x;
      const dy = e.clientY - orbitState.lastMouse.y;
      orbitState.lastMouse = { x: e.clientX, y: e.clientY };
      if (orbitState.rightDrag) {
        const right = new THREE.Vector3();
        right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
        orbitState.target.addScaledVector(right, -dx * 1.5);
        orbitState.target.y += dy * 1.5;
      } else {
        orbitState.theta -= dx * 0.006;
        orbitState.phi = Math.max(0.08, Math.min(Math.PI - 0.08, orbitState.phi + dy * 0.006));
      }
      updateCamera();
    });

    window.addEventListener('mouseup', () => { orbitState.dragging = false; });

    mountEl.addEventListener('wheel', e => {
      orbitState.r = Math.max(100, Math.min(20000, orbitState.r + e.deltaY * 2));
      updateCamera();
      e.preventDefault();
    }, { passive: false });

    let lastT = null;
    mountEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) lastT = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    mountEl.addEventListener('touchmove', e => {
      if (!lastT) return;
      orbitState.theta -= (e.touches[0].clientX - lastT.x) * 0.006;
      orbitState.phi = Math.max(0.08, Math.min(Math.PI - 0.08, orbitState.phi + (e.touches[0].clientY - lastT.y) * 0.006));
      lastT = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updateCamera();
      e.preventDefault();
    }, { passive: false });
  }

  function updateCamera() {
    if (!camera || !orbitState.target) return;
    const t = orbitState.target, r = orbitState.r;
    camera.position.set(
      t.x + r * Math.sin(orbitState.phi) * Math.sin(orbitState.theta),
      t.y + r * Math.cos(orbitState.phi),
      t.z + r * Math.sin(orbitState.phi) * Math.cos(orbitState.theta)
    );
    camera.lookAt(t);
  }

  function setupTooltip() {
    const tip = document.getElementById('tooltip');
    mountEl.addEventListener('mousemove', e => {
      if (!renderer || !camera) return;
      const rect = mountEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cargoMeshes);
      if (hits.length > 0 && hits[0].object.userData.item) {
        const { item, placement, seq } = hits[0].object.userData;
        const cbm = ((placement.il * placement.iw * placement.ih) / 1e6).toFixed(3);
        tip.innerHTML = `<strong>#${seq} — ${item.desc}</strong><br>Shipment: <em>${item.shipment}</em><br>${item.l}×${item.w}×${item.h} cm · ${item.weight} kg<br>Placed: ${placement.il}×${placement.iw}×${placement.ih} cm<br>CBM: ${cbm} m³ · P${item.stackPriority}`;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 10) + 'px';
      } else {
        tip.style.display = 'none';
      }
    });
    mountEl.addEventListener('mouseleave', () => { if (tip) tip.style.display = 'none'; });
  }

  function exportPNG(filename) {
    if (!renderer) return;
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = filename || 'autoload3d.png';
    a.click();
  }

  // Initialize immediately — but use a small delay to ensure DOM layout is complete
  setTimeout(init, 50);

  return { renderContainer, toggleWireframe, toggleExplode, resetCamera, exportPNG };
}

// ── PUBLIC API ─────────────────────────────────
const Viewer = {
  createInstance: createViewerInstance,
  getColor: _getColor,
  hexCSS: _hexCSS,
};
