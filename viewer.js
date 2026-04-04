/* =============================================
   viewer.js — Three.js 3D Visualization
   Multi-instance · Pier2Pier-style rendering
   FIX: proper height init, deferred render
   ============================================= */

'use strict';

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

function createViewerInstance(mountEl, legendId) {
  let scene, camera, renderer, raycaster, animId;
  let cargoMeshes = [], containerMesh = null;
  let isWireframe = false, isExploded = false;
  let explodeOrigins = [];
  let currentEq = null;
  let pendingRender = null;
  let initialized = false;
  let orbitState = {
    theta: Math.PI / 4, phi: Math.PI / 3.5, r: 3000,
    target: null, dragging: false, rightDrag: false, lastMouse: { x: 0, y: 0 }
  };

  // ── INIT — called only when mountEl has real dimensions ──
  function init() {
    if (initialized) return;
    // Force height via inline style if CSS hasn't applied yet
    if (!mountEl.style.height) mountEl.style.height = '420px';

    const W = mountEl.offsetWidth || 800;
    const H = mountEl.offsetHeight || 420;
    if (W < 10 || H < 10) {
      // Still not ready — retry
      setTimeout(init, 60);
      return;
    }
    initialized = true;

    mountEl.innerHTML = '';
    if (animId) cancelAnimationFrame(animId);

    scene = new THREE.Scene();
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    scene.background = new THREE.Color(dark ? 0x0f1218 : 0xf0f2f6);

    camera = new THREE.PerspectiveCamera(45, W / H, 1, 200000);
    raycaster = new THREE.Raycaster();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountEl.appendChild(renderer.domElement);

    // Lights — Pier2Pier style (bright top light, warm fill)
    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.55 : 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.1 : 0.9);
    sun.position.set(3000, 5000, 3000);
    sun.castShadow = true;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 50000;
    sun.shadow.camera.left = -5000; sun.shadow.camera.right = 5000;
    sun.shadow.camera.top = 5000; sun.shadow.camera.bottom = -5000;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const back = new THREE.DirectionalLight(dark ? 0x4060a0 : 0xffeedd, 0.4);
    back.position.set(-2000, 1000, -2000);
    scene.add(back);

    // Grid — like Pier2Pier's floor grid
    const grid = new THREE.GridHelper(10000, 50,
      dark ? 0x2a3040 : 0xc8cfe0,
      dark ? 0x1a2030 : 0xe0e4ee
    );
    grid.position.y = -1;
    scene.add(grid);

    setupOrbit();
    setupTooltip();

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      const w = mountEl.offsetWidth, h = mountEl.offsetHeight;
      if (w > 10 && h > 10 && renderer) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(mountEl);

    animate();

    // Execute pending render
    if (pendingRender) {
      const { container, eq } = pendingRender;
      pendingRender = null;
      _doRender(container, eq);
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

  // Public entry — defers if not initialized
  function renderContainer(container, eq) {
    if (!initialized) {
      pendingRender = { container, eq };
    } else {
      _doRender(container, eq);
    }
  }

  function _doRender(container, eq) {
    clearScene();
    if (!scene) return;
    currentEq = eq;
    const { L, W, H } = eq;
    const cx = 0, cy = 0, cz = 0; // center at origin
    const ox = -L / 2, oz = -W / 2;

    const group = new THREE.Group();

    // ── Container shell — Pier2Pier style wireframe + subtle face ──
    if (eq.type === 'uld' && eq.contourPoints) {
      try {
        const geos = buildULDContourGeometry(eq);
        geos.forEach(geo => {
          group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: eq.color3d || 0x3060a0, transparent: true, opacity: 0.08, side: THREE.BackSide
          })));
          group.add(new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
            color: eq.color3d || 0x4080cc, wireframe: true, transparent: true, opacity: 0.45
          })));
        });
      } catch(e) { addWireBox(group, L, W, H, eq.color3d); }
    } else {
      addWireBox(group, L, W, H, eq.color3d);
    }

    // ── Floor — warm planks, clearly visible ──
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W),
      new THREE.MeshStandardMaterial({
        color: dark ? 0x4a3218 : 0xd4a96a,
        roughness: 0.95, metalness: 0.0
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.5, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Plank lines
    const plankMat = new THREE.LineBasicMaterial({
      color: dark ? 0x2a1a08 : 0xb07840, transparent: true, opacity: 0.6
    });
    for (let px = -L / 2; px <= L / 2; px += 25) {
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(px, 1, -W / 2),
          new THREE.Vector3(px, 1, W / 2)
        ]), plankMat
      ));
    }

    // Dimension markers on floor (like Pier2Pier)
    addDimensionMarker(group, L, W, H, dark);

    group.position.set(ox + L / 2, cy, oz + W / 2);
    scene.add(group);
    containerMesh = group;

    // ── Cargo items ──
    container.placed.forEach(p => {
      const color = _getColor(p.item.shipment);
      const mat = createBoxMaterials(p.item.shipment, color);
      const geo = new THREE.BoxGeometry(p.il - 2, p.ih - 2, p.iw - 2);
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(
        ox + p.x + p.il / 2,
        cy + p.y + p.ih / 2,
        oz + p.z + p.iw / 2
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Sharp edge outlines like Pier2Pier
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(p.il - 1, p.ih - 1, p.iw - 1)),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
      );
      mesh.add(edges);

      mesh.userData = { item: p.item, placement: p, seq: p.seq };
      explodeOrigins.push({ mesh, origin: mesh.position.clone() });
      scene.add(mesh);
      cargoMeshes.push(mesh);
    });

    // Camera — isometric-ish, like Pier2Pier
    const maxDim = Math.max(L, W, H);
    orbitState.r = maxDim * 2.5;
    orbitState.target = new THREE.Vector3(0, H / 2, 0);
    orbitState.theta = -Math.PI / 5;
    orbitState.phi = Math.PI / 3.2;
    updateCamera();

    renderLegend(container);
  }

  // Dimension numbers on floor
  function addDimensionMarker(group, L, W, H, dark) {
    const color = dark ? 0x6080b0 : 0x8090b0;
    // Front edge line
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    // Length line
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-L/2, 0, -W/2 - 15),
        new THREE.Vector3(L/2, 0, -W/2 - 15)
      ]), mat
    ));
    // Width line
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-L/2 - 15, 0, -W/2),
        new THREE.Vector3(-L/2 - 15, 0, W/2)
      ]), mat
    ));
  }

  // Box materials with painted shipment label on 3 faces
  function createBoxMaterials(shipmentId, boxColor) {
    const tex = makeLabelTexture(shipmentId, boxColor);
    const plain = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.6, metalness: 0.05 });
    const labeled = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 });
    // +X, -X, +Y(top), -Y, +Z(front), -Z
    return [labeled, plain, labeled, plain, labeled, plain];
  }

  function makeLabelTexture(shipmentId, boxColor) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const r = (boxColor >> 16) & 0xff;
    const g = (boxColor >> 8) & 0xff;
    const b = boxColor & 0xff;
    // Base color
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 512, 256);
    // Shade overlay
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, 512, 256);
    // White border
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 236);
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 76px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shipmentId.length > 10 ? shipmentId.substring(0, 9) + '…' : shipmentId, 256, 120);
    // Underline
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(130, 168, 252, 3);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function addWireBox(group, L, W, H, color) {
    const geo = new THREE.BoxGeometry(L, H, W);
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: color || 0x4080cc, wireframe: true, transparent: true, opacity: 0.45
    }));
    wire.position.set(0, H / 2, 0);
    group.add(wire);
    group.add(new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({
      color: color || 0x3060a0, transparent: true, opacity: 0.04, side: THREE.BackSide
    })));
  }

  function renderLegend(container) {
    const el = document.getElementById(legendId);
    if (!el) return;
    const ships = [...new Set(container.placed.map(p => p.item.shipment))];
    el.innerHTML = ships.map(s =>
      `<div class="leg-item"><div class="leg-dot" style="background:${_hexCSS(_getColor(s))}"></div>${s}</div>`
    ).join('');
  }

  // Controls
  function toggleWireframe() {
    isWireframe = !isWireframe;
    cargoMeshes.forEach(m => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
        if (mat) mat.wireframe = isWireframe;
      });
    });
  }

  function toggleExplode() {
    isExploded = !isExploded;
    if (!currentEq) return;
    const f = isExploded ? 1.5 : 1.0;
    const cy = currentEq.H / 2;
    explodeOrigins.forEach(({ mesh, origin }) => {
      mesh.position.set(
        0 + (origin.x - 0) * f,
        cy + (origin.y - cy) * f,
        0 + (origin.z - 0) * f
      );
    });
  }

  function resetCamera() {
    orbitState.theta = -Math.PI / 5;
    orbitState.phi = Math.PI / 3.2;
    updateCamera();
  }

  function setupOrbit() {
    orbitState.target = new THREE.Vector3(0, 150, 0);
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
        orbitState.target.addScaledVector(right, -dx * 2);
        orbitState.target.y += dy * 2;
      } else {
        orbitState.theta -= dx * 0.006;
        orbitState.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbitState.phi + dy * 0.006));
      }
      updateCamera();
    });
    window.addEventListener('mouseup', () => { orbitState.dragging = false; });
    mountEl.addEventListener('wheel', e => {
      orbitState.r = Math.max(100, Math.min(30000, orbitState.r + e.deltaY * 3));
      updateCamera();
      e.preventDefault();
    }, { passive: false });
    let lt = null;
    mountEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    mountEl.addEventListener('touchmove', e => {
      if (!lt) return;
      orbitState.theta -= (e.touches[0].clientX - lt.x) * 0.006;
      orbitState.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbitState.phi + (e.touches[0].clientY - lt.y) * 0.006));
      lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updateCamera(); e.preventDefault();
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
      if (!renderer || !camera || !raycaster) return;
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
        tip.innerHTML = `<strong>#${seq} — ${item.desc}</strong><br>Shipment: ${item.shipment}<br>${item.l}×${item.w}×${item.h} cm · ${item.weight} kg<br>CBM: ${cbm} m³ · P${item.stackPriority}`;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 10) + 'px';
      } else { tip.style.display = 'none'; }
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

  // Start init with a delay to ensure DOM layout is done
  // Use requestAnimationFrame twice (two paint cycles) for reliability
  requestAnimationFrame(() => requestAnimationFrame(init));

  return { renderContainer, toggleWireframe, toggleExplode, resetCamera, exportPNG };
}

const Viewer = {
  createInstance: createViewerInstance,
  getColor: _getColor,
  hexCSS: _hexCSS,
};
