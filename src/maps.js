import * as THREE from 'three';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.currentMapGroup = new THREE.Group();
    this.scene.add(this.currentMapGroup);
    this.colliders = [];
    this.spikeObject = null;
  }

  clearMap() {
    while (this.currentMapGroup.children.length > 0) {
      const child = this.currentMapGroup.children[0];
      this.currentMapGroup.remove(child);
      child.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
    }
    this.colliders = [];
    this.spikeObject = null;
  }

  addColliderBox(minX, minY, minZ, maxX, maxY, maxZ) {
    this.colliders.push({
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ)
    });
  }

  // BUILD 1: Aimlab / Kovaak Training Arena
  buildAimlabArena() {
    this.clearMap();
    const group = this.currentMapGroup;

    // Materials
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x12151c,
      roughness: 0.8,
      metalness: 0.2
    });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e27,
      roughness: 0.9,
      metalness: 0.1
    });

    const targetBackwallMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e12,
      roughness: 0.95,
      metalness: 0.05
    });

    const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const neonOrangeMat = new THREE.MeshBasicMaterial({ color: 0xff4655 });

    // Floor (30m wide, 40m deep)
    const floorGeo = new THREE.PlaneGeometry(36, 40);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(36, 36, 0x00f0ff, 0x1f2735);
    gridHelper.position.set(0, 0.01, 0);
    group.add(gridHelper);

    // Target Front Wall (at Z = -16)
    const backWallGeo = new THREE.BoxGeometry(36, 16, 1);
    const backWall = new THREE.Mesh(backWallGeo, targetBackwallMat);
    backWall.position.set(0, 8, -16);
    group.add(backWall);
    this.addColliderBox(-18, 0, -16.5, 18, 16, -15.5);

    // Neon frame around target wall
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(36, 0.2, 0.2), neonCyanMat);
    topBar.position.set(0, 16, -15.4);
    group.add(topBar);

    const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(36, 0.2, 0.2), neonCyanMat);
    bottomBar.position.set(0, 0.1, -15.4);
    group.add(bottomBar);

    // Left Wall
    const leftWallGeo = new THREE.BoxGeometry(1, 16, 40);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-18, 8, 4);
    group.add(leftWall);
    this.addColliderBox(-18.5, 0, -16, -17.5, 16, 24);

    // Right Wall
    const rightWall = new THREE.Mesh(leftWallGeo, wallMat);
    rightWall.position.set(18, 8, 4);
    group.add(rightWall);
    this.addColliderBox(17.5, 0, -16, 18.5, 16, 24);

    // Back Wall (Behind player spawn at Z = +16)
    const spawnBackWallGeo = new THREE.BoxGeometry(36, 16, 1);
    const spawnBackWall = new THREE.Mesh(spawnBackWallGeo, wallMat);
    spawnBackWall.position.set(0, 8, 20);
    group.add(spawnBackWall);
    this.addColliderBox(-18, 0, 19.5, 18, 16, 20.5);

    // Ceiling with luminous strips
    const ceilingGeo = new THREE.PlaneGeometry(36, 40);
    ceilingGeo.rotateX(Math.PI / 2);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.position.set(0, 16, 2);
    group.add(ceiling);

    // Ambient & Directional Lights with soft shadows & balanced esports ambience
    const hemiLight = new THREE.HemisphereLight(0xd4e9ff, 0x141822, 0.75);
    group.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(0, 15, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.bias = -0.0003;
    dirLight.shadow.radius = 2.0;
    group.add(dirLight);

    // Subtle cyan accent fill for target wall depth
    const wallAccent = new THREE.PointLight(0x00f0ff, 1.2, 28);
    wallAccent.position.set(0, 8, -12);
    group.add(wallAccent);

    return {
      spawnPos: new THREE.Vector3(0, 0, 8),
      spawnYawDeg: 0, // Facing target wall directly at -Z
      targetWallZ: -15.0
    };
  }

  // BUILD 2: Valorant Tactical Bomb Site Retake (Ascent A Site inspired)
  buildRetakeSite() {
    this.clearMap();
    const group = this.currentMapGroup;

    // Materials - Valorant stone & radianite containers
    const stoneFloorMat = new THREE.MeshStandardMaterial({
      color: 0x242831,
      roughness: 0.85,
      metalness: 0.15
    });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x363d4a,
      roughness: 0.7,
      metalness: 0.2
    });

    const radianiteGreenBoxMat = new THREE.MeshStandardMaterial({
      color: 0x1f4438,
      roughness: 0.4,
      metalness: 0.5
    });

    const radianiteCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x22242a,
      roughness: 0.3,
      metalness: 0.8
    });

    const sitePlantZoneMat = new THREE.MeshBasicMaterial({
      color: 0xff4655,
      transparent: true,
      opacity: 0.25
    });

    // Main Ground extended to cover site and staging area (Z: -28 to +38)
    const floorGeo = new THREE.PlaneGeometry(50, 68);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, stoneFloorMat);
    floor.position.set(0, 0, 6);
    group.add(floor);

    // Bomb Site Plant Boundary Graphic
    const plantAreaGeo = new THREE.PlaneGeometry(16, 16);
    plantAreaGeo.rotateX(-Math.PI / 2);
    const plantArea = new THREE.Mesh(plantAreaGeo, sitePlantZoneMat);
    plantArea.position.set(0, 0.02, -8);
    group.add(plantArea);

    // Site boundary neon lines
    const lineEdges = new THREE.EdgesGeometry(plantAreaGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff4655, linewidth: 3 });
    const wireframe = new THREE.LineSegments(lineEdges, lineMat);
    wireframe.position.copy(plantArea.position);
    wireframe.position.y += 0.03;
    group.add(wireframe);

    // Helper to spawn a Radianite Crate
    const createRadianiteCrate = (x, y, z, w = 2.4, h = 2.4, d = 2.4) => {
      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const box = new THREE.Mesh(boxGeo, radianiteGreenBoxMat);
      box.position.set(x, y + h / 2, z);
      group.add(box);

      // Glowing Radianite energy panel
      const panelGeo = new THREE.BoxGeometry(w * 0.7, h * 0.7, d + 0.02);
      const panel = new THREE.Mesh(panelGeo, radianiteCoreMat);
      panel.position.set(x, y + h / 2, z);
      group.add(panel);

      this.addColliderBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      return box;
    };

    // Helper to spawn concrete cover / walls
    const createWall = (x, y, z, w, h, d) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y + h / 2, z);
      group.add(mesh);
      this.addColliderBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      return mesh;
    };

    // 1. GENERATOR (Center-Left of site)
    createRadianiteCrate(-4.5, 0, -8, 3.2, 4.0, 3.2);

    // 2. DEFAULT PLANT BOXES (Dice)
    createRadianiteCrate(2.5, 0, -7, 2.2, 2.2, 2.2);
    createRadianiteCrate(2.5, 2.2, -7, 2.0, 2.0, 2.0); // Stacked box!
    createRadianiteCrate(4.6, 0, -7, 2.2, 2.2, 2.2);

    // 3. HEAVEN (Elevated Balcony at North Z = -18)
    // Heaven floor platform
    const heavenFloorGeo = new THREE.BoxGeometry(16, 0.6, 6);
    const heavenFloor = new THREE.Mesh(heavenFloorGeo, metalMat);
    heavenFloor.position.set(0, 4.5, -18);
    group.add(heavenFloor);
    this.addColliderBox(-8, 4.2, -21, 8, 4.8, -15);

    // Heaven Balcony Railing
    createWall(0, 4.8, -15.2, 16, 1.1, 0.3);

    // Heaven Back Wall
    createWall(0, 4.8, -21, 18, 6.0, 1.0);

    // Under-Heaven (Hell) back wall
    createWall(0, 0, -21, 18, 4.8, 1.0);

    // Heaven Ramp / Stairs (Rising from site to Heaven at East side)
    const rampSteps = 8;
    for (let i = 0; i < rampSteps; i++) {
      const stepH = (4.5 / rampSteps) * (i + 1);
      const stepZ = -14 - i * 0.7;
      createWall(7.5, 0, stepZ, 3.0, stepH, 0.8);
    }

    // 4. SITE BOUNDARY WALLS
    // North wall (behind heaven)
    createWall(0, 0, -22, 40, 12, 1.5);
    // South Wall (A Main corridor entrance)
    createWall(-12, 0, 16, 16, 8, 1.5);
    createWall(12, 0, 16, 16, 8, 1.5);
    // Entry doorway into site is at X: [-4, 4], Z: 16

    // West Wall (Garden / Tree side)
    createWall(-18, 0, 0, 1.5, 8, 36);
    // East Wall (Wine / Long side)
    createWall(18, 0, 0, 1.5, 8, 36);

    // 5. WINE / CORNER COVER
    createWall(15, 0, 6, 4.5, 3.5, 2.0);

    // 6. TREE / GARDEN FLANK DOOR COVER
    createWall(-14, 0, -4, 2.0, 3.5, 4.5);

    // 7. A-MAIN CONNECTOR HALLWAY (Z = 16 to Z = 22)
    createWall(-4.5, 0, 19, 1.0, 7.0, 6.0); // West hallway wall
    createWall(4.5, 0, 19, 1.0, 7.0, 6.0);  // East hallway wall
    const hallCeiling = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 6.2), metalMat);
    hallCeiling.position.set(0, 6.0, 19);
    group.add(hallCeiling);
    this.addColliderBox(-5, 5.8, 16, 5, 6.2, 22);

    // 8. SAFE STAGING SPAWN ROOM (Sala Pequena de Spawn // Z = 22 to Z = 30)
    // Dark tactical tiled floor
    const stagingFloorGeo = new THREE.PlaneGeometry(12, 10);
    stagingFloorGeo.rotateX(-Math.PI / 2);
    const stagingFloorMat = new THREE.MeshStandardMaterial({ color: 0x161822, roughness: 0.5, metalness: 0.3 });
    const stagingFloor = new THREE.Mesh(stagingFloorGeo, stagingFloorMat);
    stagingFloor.position.set(0, 0.02, 26);
    group.add(stagingFloor);

    // Staging room exterior perimeter walls
    createWall(-5.5, 0, 26, 1.0, 6.0, 8.0); // West wall
    createWall(5.5, 0, 26, 1.0, 6.0, 8.0);  // East wall
    createWall(0, 0, 30, 12.0, 6.0, 1.0);   // Back wall

    // Room ceiling (completely enclosed overhead)
    const roomCeiling = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.4, 8.2), metalMat);
    roomCeiling.position.set(0, 5.5, 26);
    group.add(roomCeiling);
    this.addColliderBox(-6, 5.3, 22, 6, 5.7, 30);

    // Partition wall at Z = 22 with offset exit doorway
    // Solid wall blocking direct sightline from A-Site/Heaven into the room
    createWall(-1.8, 0, 22, 6.4, 5.5, 0.8);
    // Lintel above doorway (leaves clear doorway from X = 1.4 to 4.0, height 4.0m)
    createWall(2.7, 4.0, 22, 2.6, 1.5, 0.8);

    // Tactical staging room props & radianite boxes
    createRadianiteCrate(-3.8, 0, 28, 1.8, 1.8, 1.8);
    createRadianiteCrate(3.8, 0, 28, 1.8, 1.8, 1.8);
    createRadianiteCrate(3.8, 1.8, 28, 1.4, 1.4, 1.4);

    // Interior warm cyan tactical lighting
    const stagingLight = new THREE.PointLight(0x38bdf8, 2.2, 14);
    stagingLight.position.set(0, 4.5, 26);
    group.add(stagingLight);

    // Holographic spawn sign on back wall
    const signGeo = new THREE.BoxGeometry(4.0, 0.7, 0.08);
    const signMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 3.2, 29.4);
    group.add(signMesh);

    // Illuminated Exit sign above door
    const exitSignGeo = new THREE.BoxGeometry(1.6, 0.4, 0.08);
    const exitSignMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const exitSign = new THREE.Mesh(exitSignGeo, exitSignMat);
    exitSign.position.set(2.7, 3.6, 22.45);
    group.add(exitSign);

    // 9. SPAWN THE SPIKE (Planted in Default plant zone)
    this.spawnSpike(1.0, 0, -8);

    // Lighting (Warm outdoor Mediterranean sunlight like Ascent with soft PCF shadows)
    const sunLight = new THREE.DirectionalLight(0xfff3df, 1.6);
    sunLight.position.set(20, 32, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 70.0;
    sunLight.shadow.camera.left = -26;
    sunLight.shadow.camera.right = 26;
    sunLight.shadow.camera.top = 36;
    sunLight.shadow.camera.bottom = -36;
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.radius = 2.5;
    group.add(sunLight);

    // Mediterranean sky hemisphere light (Sky cyan & warm ground bounce)
    const hemiLight = new THREE.HemisphereLight(0x8ac8ff, 0x362c24, 0.85);
    group.add(hemiLight);

    // Subtle tactical fill lights:
    // 1. Heaven interior fill
    const heavenFill = new THREE.PointLight(0x60a5fa, 1.2, 16);
    heavenFill.position.set(0, 6.5, -20);
    group.add(heavenFill);

    // 2. A-Main corridor warm sunlight bounce
    const amainBounce = new THREE.PointLight(0xffd8a8, 1.1, 16);
    amainBounce.position.set(2.5, 4.0, 16);
    group.add(amainBounce);

    // 3. Hell shadow alcove bounce
    const hellFill = new THREE.PointLight(0x38bdf8, 0.9, 10);
    hellFill.position.set(0, 2.0, -18);
    group.add(hellFill);

    return {
      spawnPos: new THREE.Vector3(-1.2, 0, 26.5), // Player spawns safely inside the staging room!
      spawnYawDeg: 0, // Facing directly towards site (-Z)
      botPositions: [
        { x: 0, y: 4.8, z: -17, name: 'Heaven Balcony', rotY: Math.PI },
        { x: -5.5, y: 0, z: -10, name: 'Behind Generator', rotY: Math.PI - 0.6 },
        { x: 3.5, y: 0, z: -10, name: 'Behind Default', rotY: Math.PI + 0.4 },
        { x: 0, y: 0, z: -19, name: 'Hell', rotY: Math.PI },
        { x: 13, y: 0, z: 4, name: 'Wine', rotY: -Math.PI / 2 }
      ]
    };
  }

  // Animated 3D Valorant Spike Model
  spawnSpike(x, y, z) {
    const spikeGroup = new THREE.Group();
    spikeGroup.position.set(x, y, z);

    // Base chassis
    const baseGeo = new THREE.CylinderGeometry(0.22, 0.35, 0.45, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x16181f,
      roughness: 0.3,
      metalness: 0.8
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.22, 0);
    spikeGroup.add(base);

    // Center Radianite Core (Glows and pulses)
    const coreGeo = new THREE.OctahedronGeometry(0.18, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3b4e });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 0.55, 0);
    spikeGroup.add(core);

    // Floating Rotating Gyroscope Rings
    const ring1Geo = new THREE.TorusGeometry(0.24, 0.02, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.position.set(0, 0.55, 0);
    spikeGroup.add(ring1);

    const ring2 = new THREE.Mesh(ring1Geo, ringMat);
    ring2.position.set(0, 0.55, 0);
    ring2.rotation.x = Math.PI / 2;
    spikeGroup.add(ring2);

    // Defuse radius marker ring on floor
    const radiusGeo = new THREE.RingGeometry(2.5, 2.58, 32);
    radiusGeo.rotateX(-Math.PI / 2);
    const radiusMat = new THREE.MeshBasicMaterial({
      color: 0xff3b4e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const radiusMesh = new THREE.Mesh(radiusGeo, radiusMat);
    radiusMesh.position.set(0, 0.02, 0);
    spikeGroup.add(radiusMesh);

    // Pulsing point light
    const spikeLight = new THREE.PointLight(0xff2244, 2, 6);
    spikeLight.position.set(0, 0.6, 0);
    spikeGroup.add(spikeLight);

    this.currentMapGroup.add(spikeGroup);
    this.spikeObject = {
      group: spikeGroup,
      core,
      ring1,
      ring2,
      spikeLight,
      position: new THREE.Vector3(x, y, z),
      defuseRadius: 2.8
    };

    return this.spikeObject;
  }

  // Update Spike animations
  updateSpike(dt, spikeTimeLeft, maxSpikeTime = 45) {
    if (!this.spikeObject) return;
    const { ring1, ring2, core, spikeLight } = this.spikeObject;

    // Spin faster as time runs out
    const urgency = 1 - Math.max(0, spikeTimeLeft / maxSpikeTime);
    const spinSpeed = 2 + urgency * 10;
    ring1.rotation.y += dt * spinSpeed;
    ring1.rotation.x += dt * (spinSpeed * 0.7);
    ring2.rotation.z += dt * (spinSpeed * 0.8);

    // Pulsing core scale
    const pulse = 1 + Math.sin(performance.now() * 0.008 * (1 + urgency * 3)) * 0.2;
    core.scale.set(pulse, pulse, pulse);
    spikeLight.intensity = 1.5 + pulse * 1.5;
  }

  // BUILD 3: Hold de Pixel Arena (Angle Holding & Reaction Time Trainer)
  buildHoldPixelArena(scenarioId = 'ascent_main') {
    this.clearMap();
    const group = this.currentMapGroup;

    // Materials
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.85,
      metalness: 0.15
    });

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2d3442,
      roughness: 0.8,
      metalness: 0.2
    });

    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x1f4438,
      roughness: 0.4,
      metalness: 0.5
    });

    const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // Ground
    const floorGeo = new THREE.PlaneGeometry(36, 40);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    group.add(floor);

    // Back wall behind bot area (Z = -20)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(36, 12, 1), wallMat);
    backWall.position.set(0, 6, -20);
    group.add(backWall);
    this.addColliderBox(-18, 0, -20.5, 18, 12, -19.5);

    // Wall behind player spawn (Z = +14)
    const spawnWall = new THREE.Mesh(new THREE.BoxGeometry(36, 12, 1), wallMat);
    spawnWall.position.set(0, 6, 14);
    group.add(spawnWall);
    this.addColliderBox(-18, 0, 13.5, 18, 12, 14.5);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 34), wallMat);
    leftWall.position.set(-18, 6, -3);
    group.add(leftWall);
    this.addColliderBox(-18.5, 0, -20, -17.5, 12, 14);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 34), wallMat);
    rightWall.position.set(18, 6, -3);
    group.add(rightWall);
    this.addColliderBox(17.5, 0, -20, 18.5, 12, 14);

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    group.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(8, 18, 10);
    group.add(dir);

    // Two occluding walls frame a clear, continuous crossing lane behind them.
    const elevated = scenarioId === 'ascent_heaven';
    const laneY = elevated ? 4.8 : 0;
    const gap = scenarioId === 'tight_pixel' ? 0.6 : elevated ? 2 : 2.5;
    if (elevated) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 6), wallMat);
      platform.position.set(0, 4.55, -16);
      group.add(platform);
      this.addColliderBox(-12, 4.3, -19, 12, 4.8, -13);
    }
    for (const side of [-1, 1]) {
      const width = 10.5 - gap;
      const height = elevated ? 6 : 8;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 2),
        scenarioId === 'tight_pixel' ? boxMat : wallMat);
      wall.position.set(side * (gap + width / 2), laneY + height / 2, -14.5);
      group.add(wall);
      const minX = side < 0 ? -10.5 : gap;
      const maxX = side < 0 ? -gap : 10.5;
      this.addColliderBox(minX, laneY, -15.5, maxX, laneY + height, -13.5);
    }
    const startPos = new THREE.Vector3(-gap - 1.5, laneY, -16.6);
    const endPos = new THREE.Vector3(gap + 1.5, laneY, -16.6);
    const strafeSpeed = elevated || scenarioId === 'tight_pixel' ? 6.75 : 6.4;

    return {
      spawnPos: new THREE.Vector3(0, 0, 6),
      spawnYawDeg: 0,
      peekStart: startPos,
      peekEnd: endPos,
      strafeSpeed
    };
  }
}
