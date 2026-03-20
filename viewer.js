/* =============================================
   viewer.js — Three.js 3D Visualization
   ULD contours · Explode mode · Orbit controls
   ============================================= */

'use strict';

const Viewer = (() => {
  let scene, camera, renderer, raycaster, animId;
  let cargoMeshes = [], containerMesh = null;
  let isWireframe = false, isExploded = false;
  let explodeOrigins = [];
  let currentContainer = null;
  let currentEq = null;
  let orbitState = {
    theta: Math.PI / 5,
    phi: Math.PI / 3.5,
    r: 0,
    target: null,
    dragging: false,
    rightDrag: false,
    lastMouse: { x: 0, y: 0 },
  };

  // Shipment color map
  const colorMap = {};
  let colorIdx = 0;
  const PALETTE = [
    0x4fa8ff, 0x3ddc97, 0xf5c842, 0xff5f6d, 0xb48aff,
    0xff9d5c, 0x5ce8e8, 0xff79c6, 0x8be9fd, 0x50fa7b,
    0xffb86c, 0xbd93f9, 0xf1fa8c, 0x6be5fd, 0xcf6679,
  ];

  function getColor(shipId) {
    if (!colorMap[shipId]) { colorMap[shipId] = PALETTE[colorIdx++ % PALETTE.length]; }
    return colorMap[shipId];
  }
  function hexCSS(h) { return '#' + h.toString(16).padStart(6, '0'); }

  // ── INIT ───────────────────────────────────────
  function init(mountEl) {
    mountEl.innerHTML = '';
    if (animId) cancelAnimationFrame(animId);
    if (renderer) { renderer.dispose(); renderer = null; }

    const W = mountEl.clientWidth || 800;
    const H = mountEl.clientHeight || 480;

    scene = new THREE.Scene();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    scene.background = new THREE.Color(isDark ? 0x13161c : 0xf0f2f5);

    camera = new THREE.PerspectiveCamera(45, W / H, 1, 100000);
    raycaster = new THREE.Raycaster();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountEl.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.45 : 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, isDark ? 0.9 : 0.7);
    sun.position.set(2000, 3000, 2000);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(isDark ? 0x4080ff : 0xffd080, 0.3);
    fill.position.set(-2000, 1000, -1000);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(8000, 40,
      isDark ? 0x242835 : 0xd0d4e0,
      isDark ? 0x1a1e27 : 0xe8eaf0);
    grid.position.y = -2;
    scene.add(grid);

    setupOrbit(mountEl);
    setupTooltip(mountEl);

    // Resize
    const ro = new ResizeObserver(() => {
      const w = mountEl.clientWidth, h = mountEl.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(mountEl);

    animate();
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  // ── CLEAR ──────────────────────────────────────
  function clearScene() {
    cargoMeshes.forEach(m => { scene.remove(m); });
    cargoMeshes = [];
    if (containerMesh) { scene.remove(containerMesh); containerMesh = null; }
    explodeOrigins = [];
    isExploded = false;
  }

  // ── RENDER CONTAINER + ITEMS ───────────────────
  function renderContainer(container, eq) {
    clearScene();
    currentContainer = container;
    currentEq = eq;

    const { L, W, H } = eq;
    const ox = -L / 2, oy = 0, oz = -W / 2;

    // ── Container Shell ──
    const contGroup = new THREE.Group();

    if (eq.type === 'uld' && eq.contourPoints) {
      // Build accurate ULD contour
      try {
        const geos = buildULDContourGeometry(eq);
        const mat = new THREE.MeshStandardMaterial({
          color: eq.color3d || 0x3a4060,
          transparent: true, opacity: 0.12,
          side: THREE.DoubleSide, wireframe: false,
        });
        const wireMat = new THREE.MeshBasicMaterial({
          color: eq.color3d || 0x3a4060,
          transparent: true, opacity: 0.35,
          wireframe: true,
        });
        geos.forEach(geo => {
          // Reposition so base is at y=0
          geo.translate(0, 0, 0);
          const mesh = new THREE.Mesh(geo, mat);
          const wire = new THREE.Mesh(geo.clone(), wireMat);
          // Rotate to align axes: extrude goes along Z, we want L along X
          mesh.rotation.y = -Math.PI / 2;
          wire.rotation.y = -Math.PI / 2;
          mesh.position.set(0, 0, 0);
          wire.position.set(0, 0, 0);
          contGroup.add(mesh);
          contGroup.add(wire);
        });
      } catch(e) {
        addBoxContainer(contGroup, L, W, H, eq.color3d);
      }
    } else {
      addBoxContainer(contGroup, L, W, H, eq.color3d);
    }

    // Floor
    const floorGeo = new THREE.PlaneGeometry(L, W);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const floorMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1a1e27 : 0xe0e4ee,
      transparent: true, opacity: 0.8
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 1, 0);
    floor.receiveShadow = true;
    contGroup.add(floor);

    contGroup.position.set(ox + L/2, oy, oz + W/2);
    scene.add(contGroup);
    containerMesh = contGroup;

    // ── Cargo Items ──
    container.placed.forEach((p, idx) => {
      const color = getColor(p.item.shipment);
      const geo = new THREE.BoxGeometry(p.il - 1.5, p.ih - 1.5, p.iw - 1.5);
      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true, opacity: isWireframe ? 0 : 0.85,
        wireframe: isWireframe,
        roughness: 0.65, metalness: 0.08,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const worldX = ox + p.x + p.il / 2;
      const worldY = oy + p.y + p.ih / 2;
      const worldZ = oz + p.z + p.iw / 2;
      mesh.position.set(worldX, worldY, worldZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Edges
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.il - 0.5, p.ih - 0.5, p.iw - 0.5));
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.18
      });
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Sequence label (sprite)
      mesh.userData = { item: p.item, placement: p, seq: p.seq };
      explodeOrigins.push({ mesh, origin: mesh.position.clone() });
      scene.add(mesh);
      cargoMeshes.push(mesh);
    });

    // Position camera
    const maxDim = Math.max(L, W, H);
    orbitState.r = maxDim * 2.2;
    orbitState.target = new THREE.Vector3(0, H / 2, 0);
    orbitState.theta = Math.PI / 4;
    orbitState.phi = Math.PI / 3.5;
    updateCamera();

    // Legend
    renderLegend(container, eq);
  }

  function addBoxContainer(group, L, W, H, color) {
    const cGeo = new THREE.BoxGeometry(L, H, W);
    const cMat = new THREE.MeshBasicMaterial({
      color: color || 0x3a4060,
      wireframe: true, transparent: true, opacity: 0.3
    });
    const cMesh = new THREE.Mesh(cGeo, cMat);
    cMesh.position.set(0, H / 2, 0);
    group.add(cMesh);

    // Solid faces with very low opacity
    const sMat = new THREE.MeshStandardMaterial({
      color: color || 0x3a4060,
      transparent: true, opacity: 0.04, side: THREE.BackSide
    });
    group.add(new THREE.Mesh(cGeo.clone(), sMat));
  }

  // ── LEGEND ─────────────────────────────────────
  function renderLegend(container, eq) {
    const legend = document.getElementById('viewerLegend');
    if (!legend) return;
    const shipments = [...new Set(container.placed.map(p => p.item.shipment))];
    legend.innerHTML = shipments.map(sid => {
      const c = hexCSS(getColor(sid));
      return `<div class="leg-item"><div class="leg-dot" style="background:${c}"></div>${sid}</div>`;
    }).join('');
  }

  // ── WIREFRAME TOGGLE ───────────────────────────
  function toggleWireframe() {
    isWireframe = !isWireframe;
    cargoMeshes.forEach(m => {
      if (m.material) {
        m.material.wireframe = isWireframe;
        m.material.opacity = isWireframe ? 1 : 0.85;
      }
    });
  }

  // ── EXPLODE TOGGLE ─────────────────────────────
  function toggleExplode() {
    isExploded = !isExploded;
    if (!currentContainer || !currentEq) return;
    const eq = currentEq;
    const factor = isExploded ? 1.4 : 1.0;
    const cx = 0, cy = eq.H / 2, cz = 0;

    explodeOrigins.forEach(({ mesh, origin }) => {
      const dx = origin.x - cx;
      const dy = origin.y - cy;
      const dz = origin.z - cz;
      mesh.position.set(cx + dx * factor, cy + dy * factor, cz + dz * factor);
    });
  }

  // ── RESET CAMERA ───────────────────────────────
  function resetCamera() {
    orbitState.theta = Math.PI / 4;
    orbitState.phi = Math.PI / 3.5;
    updateCamera();
  }

  // ── ORBIT CONTROLS ─────────────────────────────
  function setupOrbit(el) {
    orbitState.target = new THREE.Vector3(0, 200, 0);
    orbitState.r = 2500;

    el.addEventListener('mousedown', e => {
      orbitState.dragging = true;
      orbitState.rightDrag = e.button === 2;
      orbitState.lastMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    el.addEventListener('contextmenu', e => e.preventDefault());

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

    el.addEventListener('wheel', e => {
      orbitState.r = Math.max(100, Math.min(20000, orbitState.r + e.deltaY * 2));
      updateCamera();
      e.preventDefault();
    }, { passive: false });

    // Touch
    let lastT = null;
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 1) lastT = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      if (!lastT) return;
      const dx = e.touches[0].clientX - lastT.x;
      const dy = e.touches[0].clientY - lastT.y;
      orbitState.theta -= dx * 0.006;
      orbitState.phi = Math.max(0.08, Math.min(Math.PI - 0.08, orbitState.phi + dy * 0.006));
      lastT = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updateCamera();
      e.preventDefault();
    }, { passive: false });
  }

  function updateCamera() {
    if (!camera || !orbitState.target) return;
    const t = orbitState.target;
    const r = orbitState.r;
    camera.position.set(
      t.x + r * Math.sin(orbitState.phi) * Math.sin(orbitState.theta),
      t.y + r * Math.cos(orbitState.phi),
      t.z + r * Math.sin(orbitState.phi) * Math.cos(orbitState.theta)
    );
    camera.lookAt(t);
  }

  // ── TOOLTIP ────────────────────────────────────
  function setupTooltip(el) {
    const tip = document.getElementById('tooltip');
    el.addEventListener('mousemove', e => {
      if (!renderer || !camera) return;
      const rect = el.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cargoMeshes);
      if (hits.length > 0) {
        const { item, placement, seq } = hits[0].object.userData;
        const cbm = ((placement.il * placement.iw * placement.ih) / 1e6).toFixed(3);
        tip.innerHTML = `
          <strong>#${seq} — ${item.desc}</strong><br>
          Shipment: <em>${item.shipment}</em><br>
          ${item.l}×${item.w}×${item.h} cm · ${item.weight} kg<br>
          Placed: ${placement.il}×${placement.iw}×${placement.ih} cm<br>
          CBM: ${cbm} m³ · Cat: ${item.category} · P${item.stackPriority}
        `;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 10) + 'px';
      } else {
        tip.style.display = 'none';
      }
    });
    el.addEventListener('mouseleave', () => { if (tip) tip.style.display = 'none'; });
  }

  // ── PNG EXPORT ─────────────────────────────────
  function exportPNG(filename) {
    if (!renderer) return;
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'autoload3d.png';
    a.click();
  }

  // ── PUBLIC ─────────────────────────────────────
  return {
    init,
    renderContainer,
    toggleWireframe,
    toggleExplode,
    resetCamera,
    exportPNG,
    getColor,
    hexCSS,
    clearScene,
  };
})();
