import * as THREE from 'three';
import { ADS_PROFILES, aimPose } from './ads.js';
import { RECOIL_PROFILES, RecoilState, coneRadius } from './recoil.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { ProceduralArms, reloadMotion } from './armsIK.js';
import { VIEWMODEL_PROFILES, RELOAD_DURATION, smoothstep } from './viewmodelProfiles.js';

const gltfLoader = new GLTFLoader();
const modelCache = new Map();

const muzzleZ = {
  vandal: -0.82,
  phantom: -0.81,
  classic: -0.25,
  sheriff: -0.41,
  operator: -1.15,
  guardian: -0.91,
  spectre: -0.71
};

// Procedural Muzzle Flash Textures (Valorant / Modern Tactical Style)
let cachedMuzzleStarTexture = null;
let cachedMuzzlePlumeTexture = null;

function getMuzzleStarTexture() {
  if (cachedMuzzleStarTexture) return cachedMuzzleStarTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const cx = 128;
  const cy = 128;

  // 1. Soft Outer Radial Corona
  const gradCorona = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
  gradCorona.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradCorona.addColorStop(0.2, 'rgba(255, 225, 120, 0.75)');
  gradCorona.addColorStop(0.5, 'rgba(255, 140, 40, 0.35)');
  gradCorona.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.fillStyle = gradCorona;
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();

  // Helper to draw sharp flame spikes
  const drawSpike = (angle, length, width, colorCore, colorTip) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, colorCore);
    grad.addColorStop(0.6, 'rgba(255, 210, 80, 0.85)');
    grad.addColorStop(1, colorTip);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, width);
    ctx.lineTo(-length * 0.15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 4 Primary orthogonal spikes
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    drawSpike(angle, 118, 15, 'rgba(255, 255, 255, 1)', 'rgba(255, 120, 20, 0)');
  }

  // 4 Secondary diagonal spikes
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    drawSpike(angle, 78, 10, 'rgba(255, 255, 255, 0.95)', 'rgba(255, 140, 30, 0)');
  }

  // 3. Central incandescent white blast core
  const gradCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
  gradCore.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradCore.addColorStop(0.5, 'rgba(255, 250, 220, 0.95)');
  gradCore.addColorStop(1, 'rgba(255, 200, 100, 0)');
  ctx.fillStyle = gradCore;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();

  cachedMuzzleStarTexture = new THREE.CanvasTexture(canvas);
  return cachedMuzzleStarTexture;
}

function getMuzzlePlumeTexture() {
  if (cachedMuzzlePlumeTexture) return cachedMuzzlePlumeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Supersonic shock diamond plume along longitudinal axis
  const grad = ctx.createLinearGradient(0, 64, 256, 64);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.25, 'rgba(255, 225, 110, 0.9)');
  grad.addColorStop(0.6, 'rgba(255, 130, 30, 0.45)');
  grad.addColorStop(1, 'rgba(255, 60, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(60, 12);
  ctx.lineTo(160, 32);
  ctx.lineTo(256, 64);
  ctx.lineTo(160, 96);
  ctx.lineTo(60, 116);
  ctx.lineTo(0, 86);
  ctx.closePath();
  ctx.fill();

  // Intense central bore axis streak
  const gradCore = ctx.createLinearGradient(0, 64, 180, 64);
  gradCore.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradCore.addColorStop(0.5, 'rgba(255, 250, 220, 0.9)');
  gradCore.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = gradCore;
  ctx.beginPath();
  ctx.moveTo(0, 56);
  ctx.lineTo(180, 64);
  ctx.lineTo(0, 72);
  ctx.closePath();
  ctx.fill();

  cachedMuzzlePlumeTexture = new THREE.CanvasTexture(canvas);
  return cachedMuzzlePlumeTexture;
}

// 3D Multi-Layer Muzzle Flash Assembly with glowing cross quads and bloom trigger
function createMuzzleFlashGroup(weaponId, flashZ) {
  const group = new THREE.Group();
  group.position.set(0, 0.02, flashZ);
  group.visible = false;

  const starTex = getMuzzleStarTexture();
  const plumeTex = getMuzzlePlumeTexture();

  const flashColors = {
    vandal: 0xffcc33,
    phantom: 0x4deeee,
    guardian: 0xffd54f,
    spectre: 0x58c5fa,
    classic: 0xffea88,
    sheriff: 0xff9900,
    operator: 0xd8b4fe
  };
  const colorHex = flashColors[weaponId] || 0xffd54f;

  const materials = [];

  // 1. Frontal Starburst Billboard
  const starMat = new THREE.MeshBasicMaterial({
    map: starTex,
    color: colorHex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  materials.push(starMat);

  const starGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const starMesh = new THREE.Mesh(starGeo, starMat);
  group.add(starMesh);

  // 2. Cross Plume 1 (Horizontal along bore)
  const plumeMat1 = new THREE.MeshBasicMaterial({
    map: plumeTex,
    color: colorHex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  materials.push(plumeMat1);

  const plumeGeo = new THREE.PlaneGeometry(0.38, 0.18);
  plumeGeo.rotateY(Math.PI / 2); // Project forward along barrel bore (-Z)
  const plumeMesh1 = new THREE.Mesh(plumeGeo, plumeMat1);
  plumeMesh1.position.z = -0.14;
  group.add(plumeMesh1);

  // 3. Cross Plume 2 (Vertical along bore)
  const plumeMat2 = plumeMat1.clone();
  materials.push(plumeMat2);
  const plumeMesh2 = new THREE.Mesh(plumeGeo, plumeMat2);
  plumeMesh2.rotation.z = Math.PI / 2;
  plumeMesh2.position.z = -0.14;
  group.add(plumeMesh2);

  // 4. Hyper-bright central core point
  const coreMat = new THREE.MeshBasicMaterial({
    map: starTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  materials.push(coreMat);
  const coreMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), coreMat);
  group.add(coreMesh);

  group.userData = {
    materials,
    currentOpacity: 0
  };

  return group;
}

function loadModel(name) {
  if (!name) return Promise.reject(new Error('Model name is required'));
  if (!modelCache.has(name)) {
    modelCache.set(name, gltfLoader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
      .then(gltf => {
        gltf.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;
            node.frustumCulled = false;
            node.userData.sharedViewmodel = true;
          }
        });
        return gltf.scene;
      }));
  }
  return modelCache.get(name);
}

export const WEAPON_TYPES = {
  vandal: {
    id: 'vandal',
    name: 'VANDAL',
    slot: 1,
    category: 'Rifle',
    magSize: 25,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / 9.75,
    damage: { head: 160, body: 40, legs: 34 },
    firstShotSpread: coneRadius(.25),
    movingSpread: 0.065,
    jumpingSpread: 0.14,
    viewmodelPunch: 0.068,
    viewmodelFlip: 0.095,
    viewmodelRoll: 0.02,
    recoilRecovery: 9.0,
    colorTheme: 0x222228,
    accentColor: 0xff4655,
    isMelee: false
  },
  phantom: {
    id: 'phantom',
    name: 'PHANTOM',
    slot: 1,
    category: 'Rifle',
    magSize: 30,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / 11,
    damage: { head: 156, body: 39, legs: 33 },
    firstShotSpread: coneRadius(.20),
    movingSpread: 0.05,
    jumpingSpread: 0.12,
    viewmodelPunch: 0.048,
    viewmodelFlip: 0.065,
    viewmodelRoll: 0.014,
    recoilRecovery: 11.0,
    colorTheme: 0x181e26,
    accentColor: 0x00ffff,
    isMelee: false
  },
  guardian: {
    id: 'guardian',
    name: 'GUARDIAN',
    slot: 1,
    category: 'DMR',
    magSize: 12,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / 5.25, // Semi-auto high caliber
    damage: { head: 195, body: 65, legs: 49 },
    firstShotSpread: coneRadius(.1), // Zero first-shot error only in ADS.
    movingSpread: 0.07,
    jumpingSpread: 0.16,
    viewmodelPunch: 0.082,
    viewmodelFlip: 0.135,
    viewmodelRoll: 0.012,
    recoilRecovery: 8.0,
    colorTheme: 0x242730,
    accentColor: 0xd4af37,
    isMelee: false
  },
  spectre: {
    id: 'spectre',
    name: 'SPECTRE',
    slot: 1,
    category: 'SMG',
    magSize: 30,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / 13.33,
    damage: { head: 78, body: 26, legs: 22 },
    firstShotSpread: coneRadius(.4),
    movingSpread: 0.035, // Great run and gun mobility
    jumpingSpread: 0.09,
    viewmodelPunch: 0.038,
    viewmodelFlip: 0.048,
    viewmodelRoll: 0.01,
    recoilRecovery: 12.0,
    colorTheme: 0x1a212b,
    accentColor: 0x00f0ff,
    isMelee: false
  },
  classic: {
    id: 'classic',
    name: 'CLASSIC',
    slot: 2,
    category: 'Sidearm',
    magSize: 12,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / 6.75, // semi-auto
    damage: { head: 78, body: 26, legs: 22 },
    firstShotSpread: coneRadius(.4),
    movingSpread: 0.045,
    jumpingSpread: 0.11,
    viewmodelPunch: 0.065,
    viewmodelFlip: 0.115,
    viewmodelRoll: 0.015,
    recoilRecovery: 8.5,
    colorTheme: 0x2c2d33,
    accentColor: 0x55ffaa,
    isMelee: false
  },
  sheriff: {
    id: 'sheriff',
    name: 'SHERIFF',
    slot: 2,
    category: 'Sidearm',
    magSize: 6,
    reserveAmmo: Infinity,
    fireRateMs: 250, // 4 rounds/sec
    damage: { head: 159, body: 55, legs: 46 },
    firstShotSpread: coneRadius(.25),
    movingSpread: 0.08,
    jumpingSpread: 0.18,
    viewmodelPunch: 0.115,
    viewmodelFlip: 0.185,
    viewmodelRoll: 0.025,
    recoilRecovery: 6.0,
    colorTheme: 0x2a2a30,
    accentColor: 0xe6b800,
    isMelee: false
  },
  operator: {
    id: 'operator',
    name: 'OPERATOR',
    slot: 1,
    category: 'Sniper',
    magSize: 5,
    reserveAmmo: Infinity,
    fireRateMs: 1000 / .6,
    damage: { head: 255, body: 150, legs: 120 },
    firstShotSpread: coneRadius(5),
    movingSpread: 0.25,
    jumpingSpread: 0.4,
    viewmodelPunch: 0.145,
    viewmodelFlip: 0.235,
    viewmodelRoll: 0.03,
    recoilRecovery: 3.5,
    colorTheme: 0x1f232b,
    accentColor: 0x9933ff,
    isMelee: false
  },
  knife: {
    id: 'knife',
    name: 'TACTICAL KNIFE',
    slot: 3,
    category: 'Melee',
    magSize: 1,
    reserveAmmo: Infinity,
    fireRateMs: 380, // melee swing rate
    damage: { head: 100, body: 50, legs: 50 },
    firstShotSpread: 0,
    movingSpread: 0,
    jumpingSpread: 0,
    viewmodelPunch: 0,
    viewmodelFlip: 0,
    viewmodelRoll: 0,
    recoilRecovery: 10.0,
    colorTheme: 0x1a1e24,
    accentColor: 0x00f0ff,
    isMelee: true
  }
};

export class WeaponManager {
  constructor(camera, soundManager) {
    this.camera = camera;
    this.soundManager = soundManager;
    this.currentWeaponType = WEAPON_TYPES.vandal;
    this.ammo = this.currentWeaponType.magSize;
    this.reserve = Infinity;
    this.lastShotTime = 0;
    this.recoilAmount = 0;
    this.sprayCount = 0;
    this.timeSinceLastShot = 999;
    this.recoilState = new RecoilState(this.currentWeaponType.id);
    this.lastFireInterval = 0;
    this.shotPower = 1;
    this.isReloading = false;
    this.isScoping = false;
    this.isAiming = false;
    this.aimBlend = 0;
    this.aimZoom = 1;

    // Slots state
    this.equippedSlots = {
      1: WEAPON_TYPES.vandal,
      2: WEAPON_TYPES.classic,
      3: WEAPON_TYPES.knife
    };

    // Viewmodel container attached to camera
    this.viewmodelHolder = new THREE.Group();
    this.camera.add(this.viewmodelHolder);

    // Dedicated tactical viewmodel lighting for metallic surfaces and glove textures
    const vmDir = new THREE.DirectionalLight(0xffffff, 1.2);
    vmDir.position.set(0.4, 0.8, 0.3);
    this.viewmodelHolder.add(vmDir);

    const vmAmb = new THREE.AmbientLight(0xffffff, 0.75);
    this.viewmodelHolder.add(vmAmb);

    // Gun mesh and arms
    this.gunMesh = null;
    this.armsGroup = null;
    this.muzzleFlash = null;
    this.muzzleLight = null;

    // Melee slash animation state
    this.isSlashing = false;
    this.slashTimer = 0;
    this.slashDuration = 0.26;
    this.isHeavyStab = false;

    // Procedural animation state
    this.basePos = new THREE.Vector3(0.22, -0.22, -0.45);
    this.baseRot = new THREE.Euler(0, 0, 0);
    this.currentPos = this.basePos.clone();
    this.currentRot = new THREE.Euler().copy(this.baseRot);
    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);
    this.bobPhase = 0;
    this.equipTimer = 0;
    this.shotTimer = Infinity;
    this.reloadTimer = 0;
    this.reloadDuration = RELOAD_DURATION;
    this.isInspecting = false;
    this.supportArm = null;
    this.animatedParts = [];

    this.rebuildWeaponMesh();
  }

  setWeapon(weaponId) {
    if (!WEAPON_TYPES[weaponId]) return;
    this.setAiming(false, true);
    const w = WEAPON_TYPES[weaponId];
    this.currentWeaponType = w;
    this.equippedSlots[w.slot] = w;
    this.ammo = this.currentWeaponType.magSize;
    this.reserve = Infinity;
    this.isReloading = false;
    this.isScoping = false;
    this.isSlashing = false;
    this.recoilAmount = 0;
    this.recoilState = w.isMelee ? null : new RecoilState(w.id);
    this.sprayCount = 0;
    this.timeSinceLastShot = 999;
    this.lastShotTime = -Infinity;
    this.lastFireInterval = 0;
    this.equipTimer = 0;
    this.shotTimer = Infinity;
    this.reloadTimer = 0;
    this.isInspecting = false;
    this.currentPos.copy(this.basePos).y -= .3;
    this.currentRot.set(.2, 0, -.2);
    this.rebuildWeaponMesh();
  }

  // Switch by slot (1: Primary, 2: Secondary, 3: Melee)
  switchToSlot(slotNumber) {
    if (this.equippedSlots[slotNumber]) {
      this.setWeapon(this.equippedSlots[slotNumber].id);
      return this.currentWeaponType;
    }
    return null;
  }

  // Instantly refill current weapon magazine on kill!
  refillMagOnKill() {
    if (this.currentWeaponType.isMelee) return;
    this.ammo = this.currentWeaponType.magSize;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.soundManager.playAmmoRefill();
  }

  rebuildWeaponMesh() {
    // Clear old gun mesh & arms from viewmodelHolder (preserves viewmodel lights)
    if (this.gunMesh) {
      this.viewmodelHolder.remove(this.gunMesh);
      this.gunMesh = null;
    }
    this.muzzleFlash = null;
    this.muzzleLight = null;
    this.armIK?.dispose();
    this.armIK = null;
    this.armsGroup = null;
    this.supportArm = null;
    this.animatedParts = [];

    const type = this.currentWeaponType;
    const gunGroup = new THREE.Group();


    // Material definitions
    const gunMetalMat = new THREE.MeshStandardMaterial({
      color: type.colorTheme,
      roughness: 0.35,
      metalness: 0.75
    });

    const darkAccentMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.6,
      metalness: 0.2
    });

    const emissiveGlowMat = new THREE.MeshBasicMaterial({
      color: type.accentColor
    });

    // 1. TACTICAL ARMS & HANDS MATERIALS
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x181e26, // Dark tactical agent sleeve
      roughness: 0.75,
      metalness: 0.15
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x0f1115, // Carbon fiber tactical glove
      roughness: 0.5,
      metalness: 0.35
    });

    const gloveAccentMat = new THREE.MeshBasicMaterial({
      color: type.accentColor // Accent trim on gloves matching weapon
    });

    // Arm builder helper
    const buildArm = (isLeft) => {
      const armGroup = new THREE.Group();
      const side = isLeft ? -1 : 1;

      // Forearm sleeve
      const forearmGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.32, 10);
      forearmGeo.rotateX(Math.PI / 2.8);
      const forearm = new THREE.Mesh(forearmGeo, sleeveMat);
      forearm.position.set(0, -0.06, 0.16);
      armGroup.add(forearm);

      // Glove wrist guard
      const wristGeo = new THREE.CylinderGeometry(0.042, 0.046, 0.08, 10);
      wristGeo.rotateX(Math.PI / 2.8);
      const wrist = new THREE.Mesh(wristGeo, gloveMat);
      wrist.position.set(0, -0.02, 0.03);
      armGroup.add(wrist);

      // Glove accent ring
      const ringGeo = new THREE.TorusGeometry(0.043, 0.004, 6, 16);
      ringGeo.rotateX(Math.PI / 2.8);
      const ring = new THREE.Mesh(ringGeo, gloveAccentMat);
      ring.position.copy(wrist.position);
      armGroup.add(ring);

      // Hand palm
      const palmGeo = new THREE.BoxGeometry(0.065, 0.04, 0.07);
      const palm = new THREE.Mesh(palmGeo, gloveMat);
      palm.position.set(0, 0, -0.03);
      armGroup.add(palm);

      // Fingers
      for (let f = 0; f < 4; f++) {
        const fingerGeo = new THREE.BoxGeometry(0.015, 0.018, 0.05);
        const finger = new THREE.Mesh(fingerGeo, gloveMat);
        finger.position.set((f - 1.5) * 0.016, -0.01, -0.07);
        finger.rotation.x = 0.45;
        armGroup.add(finger);
      }

      // Thumb
      const thumbGeo = new THREE.BoxGeometry(0.016, 0.02, 0.045);
      const thumb = new THREE.Mesh(thumbGeo, gloveMat);
      thumb.position.set(-side * 0.038, 0.01, -0.03);
      thumb.rotation.y = -side * 0.5;
      armGroup.add(thumb);

      return armGroup;
    };

    const rightArm = buildArm(false);
    const leftArm = buildArm(true);
    const arms = new THREE.Group();
    arms.add(rightArm);
    arms.add(leftArm);
    gunGroup.add(arms);
    this.armsGroup = arms;

    // Position arms & build weapon according to type:
    if (type.id === 'vandal') {
      // Vandal Rifle Body
      const bodyGeo = new THREE.BoxGeometry(0.06, 0.10, 0.42);
      const body = new THREE.Mesh(bodyGeo, gunMetalMat);
      gunGroup.add(body);

      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.38, 12);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, darkAccentMat);
      barrel.position.set(0, 0.02, -0.36);
      gunGroup.add(barrel);

      // Muzzle Brake
      const brakeGeo = new THREE.BoxGeometry(0.035, 0.04, 0.06);
      const brake = new THREE.Mesh(brakeGeo, gunMetalMat);
      brake.position.set(0, 0.02, -0.56);
      gunGroup.add(brake);

      // Curved Magazine
      const magGeo = new THREE.BoxGeometry(0.045, 0.16, 0.09);
      const mag = new THREE.Mesh(magGeo, darkAccentMat);
      mag.position.set(0, -0.11, -0.05);
      mag.rotation.x = 0.25;
      gunGroup.add(mag);

      // Stock
      const stockGeo = new THREE.BoxGeometry(0.05, 0.11, 0.22);
      const stock = new THREE.Mesh(stockGeo, darkAccentMat);
      stock.position.set(0, -0.01, 0.28);
      gunGroup.add(stock);

      // Top Rail & Iron Sights
      const railGeo = new THREE.BoxGeometry(0.028, 0.022, 0.32);
      const rail = new THREE.Mesh(railGeo, darkAccentMat);
      rail.position.set(0, 0.06, -0.05);
      gunGroup.add(rail);

      // Emissive energy stripe
      const glowGeo = new THREE.BoxGeometry(0.012, 0.008, 0.28);
      const glow = new THREE.Mesh(glowGeo, emissiveGlowMat);
      glow.position.set(0, 0.072, -0.05);
      gunGroup.add(glow);

      // Arms positioning for Vandal rifle:
      // Right hand holding pistol grip
      rightArm.position.set(0.04, -0.09, 0.12);
      rightArm.rotation.set(-0.2, 0.1, 0);

      // Left arm holding front handguard
      leftArm.position.set(-0.06, -0.06, -0.16);
      leftArm.rotation.set(0.3, -0.3, -0.2);

    } else if (type.id === 'phantom') {
      // Phantom Silenced Compact Rifle
      const bodyGeo = new THREE.BoxGeometry(0.065, 0.11, 0.38);
      const body = new THREE.Mesh(bodyGeo, gunMetalMat);
      gunGroup.add(body);

      // Silencer
      const silencerGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.36, 16);
      silencerGeo.rotateX(Math.PI / 2);
      const silencer = new THREE.Mesh(silencerGeo, darkAccentMat);
      silencer.position.set(0, 0.02, -0.34);
      gunGroup.add(silencer);

      // Mag & Stock
      const magGeo = new THREE.BoxGeometry(0.045, 0.15, 0.08);
      const mag = new THREE.Mesh(magGeo, darkAccentMat);
      mag.position.set(0, -0.10, -0.02);
      gunGroup.add(mag);

      const stockGeo = new THREE.BoxGeometry(0.05, 0.09, 0.18);
      const stock = new THREE.Mesh(stockGeo, darkAccentMat);
      stock.position.set(0, 0, 0.25);
      gunGroup.add(stock);

      const holoGeo = new THREE.BoxGeometry(0.04, 0.045, 0.08);
      const holo = new THREE.Mesh(holoGeo, emissiveGlowMat);
      holo.position.set(0, 0.08, -0.05);
      gunGroup.add(holo);

      // Arms for Phantom
      rightArm.position.set(0.04, -0.09, 0.12);
      rightArm.rotation.set(-0.2, 0.1, 0);
      leftArm.position.set(-0.06, -0.05, -0.14);
      leftArm.rotation.set(0.3, -0.25, -0.2);

    } else if (type.id === 'classic') {
      // Valorant Classic Pistol
      const slideGeo = new THREE.BoxGeometry(0.042, 0.055, 0.21);
      const slide = new THREE.Mesh(slideGeo, gunMetalMat);
      slide.position.set(0, 0.02, -0.05);
      gunGroup.add(slide);

      const frameGeo = new THREE.BoxGeometry(0.04, 0.05, 0.16);
      const frame = new THREE.Mesh(frameGeo, darkAccentMat);
      frame.position.set(0, -0.02, -0.04);
      gunGroup.add(frame);

      const gripGeo = new THREE.BoxGeometry(0.038, 0.12, 0.07);
      const grip = new THREE.Mesh(gripGeo, darkAccentMat);
      grip.position.set(0, -0.08, 0.03);
      grip.rotation.x = -0.25;
      gunGroup.add(grip);

      // Cyan accent energy line on Classic slide
      const lineGeo = new THREE.BoxGeometry(0.008, 0.012, 0.14);
      const line = new THREE.Mesh(lineGeo, emissiveGlowMat);
      line.position.set(0, 0.045, -0.05);
      gunGroup.add(line);

      // Arms for Classic pistol:
      rightArm.position.set(0.02, -0.08, 0.07);
      rightArm.rotation.set(-0.2, 0.05, 0);

      // Left hand cup support (two-handed pistol stance)
      leftArm.position.set(-0.04, -0.09, 0.06);
      leftArm.rotation.set(-0.15, 0.35, 0.2);

    } else if (type.id === 'sheriff') {
      // Sheriff Heavy Hand Cannon
      const frameGeo = new THREE.BoxGeometry(0.05, 0.09, 0.22);
      const frame = new THREE.Mesh(frameGeo, gunMetalMat);
      gunGroup.add(frame);

      const cylGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.1, 14);
      cylGeo.rotateX(Math.PI / 2);
      const cyl = new THREE.Mesh(cylGeo, darkAccentMat);
      cyl.position.set(0, 0.01, -0.02);
      gunGroup.add(cyl);

      const barrelGeo = new THREE.BoxGeometry(0.038, 0.055, 0.24);
      const barrel = new THREE.Mesh(barrelGeo, gunMetalMat);
      barrel.position.set(0, 0.03, -0.19);
      gunGroup.add(barrel);

      const gripGeo = new THREE.BoxGeometry(0.045, 0.14, 0.08);
      const grip = new THREE.Mesh(gripGeo, darkAccentMat);
      grip.position.set(0, -0.09, 0.07);
      grip.rotation.x = -0.3;
      gunGroup.add(grip);

      const accentGeo = new THREE.BoxGeometry(0.01, 0.015, 0.16);
      const accent = new THREE.Mesh(accentGeo, emissiveGlowMat);
      accent.position.set(0, 0.055, -0.16);
      gunGroup.add(accent);

      rightArm.position.set(0.02, -0.09, 0.1);
      rightArm.rotation.set(-0.2, 0.05, 0);
      leftArm.position.set(-0.05, -0.1, 0.09);
      leftArm.rotation.set(-0.15, 0.35, 0.2);

    } else if (type.id === 'operator') {
      // Heavy Sniper Rifle
      const bodyGeo = new THREE.BoxGeometry(0.07, 0.12, 0.55);
      const body = new THREE.Mesh(bodyGeo, gunMetalMat);
      gunGroup.add(body);

      const barrelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.65, 14);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, darkAccentMat);
      barrel.position.set(0, 0.03, -0.58);
      gunGroup.add(barrel);

      const brakeGeo = new THREE.BoxGeometry(0.055, 0.055, 0.1);
      const brake = new THREE.Mesh(brakeGeo, gunMetalMat);
      brake.position.set(0, 0.03, -0.92);
      gunGroup.add(brake);

      const scopeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 14);
      scopeGeo.rotateX(Math.PI / 2);
      const scope = new THREE.Mesh(scopeGeo, darkAccentMat);
      scope.position.set(0, 0.11, -0.1);
      gunGroup.add(scope);

      const stockGeo = new THREE.BoxGeometry(0.06, 0.13, 0.28);
      const stock = new THREE.Mesh(stockGeo, darkAccentMat);
      stock.position.set(0, -0.02, 0.38);
      gunGroup.add(stock);

      rightArm.position.set(0.04, -0.09, 0.15);
      rightArm.rotation.set(-0.2, 0.1, 0);
      leftArm.position.set(-0.07, -0.06, -0.22);
      leftArm.rotation.set(0.3, -0.3, -0.2);

    } else if (type.id === 'knife') {
      // VALORANT TACTICAL MELEE KNIFE
      const knifeMesh = new THREE.Group();

      // Blade: Sleek curved carbon combat blade
      const bladeGeo = new THREE.BoxGeometry(0.012, 0.055, 0.26);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x1f232c,
        metalness: 0.9,
        roughness: 0.2
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0, 0.02, -0.18);
      knifeMesh.add(blade);

      // Cutting Edge (Glowing sharpened edge)
      const edgeGeo = new THREE.BoxGeometry(0.005, 0.015, 0.26);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(0, 0.048, -0.18);
      knifeMesh.add(edge);

      // Knife Guard
      const guardGeo = new THREE.BoxGeometry(0.035, 0.08, 0.02);
      const guard = new THREE.Mesh(guardGeo, darkAccentMat);
      guard.position.set(0, 0.02, -0.05);
      knifeMesh.add(guard);

      // Knife Ergonomic Handle
      const handleGeo = new THREE.BoxGeometry(0.03, 0.045, 0.15);
      const handle = new THREE.Mesh(handleGeo, darkAccentMat);
      handle.position.set(0, 0.01, 0.03);
      knifeMesh.add(handle);

      // Pommel / Ring at base
      const pommelGeo = new THREE.TorusGeometry(0.025, 0.006, 8, 16);
      const pommel = new THREE.Mesh(pommelGeo, emissiveGlowMat);
      pommel.position.set(0, 0.01, 0.12);
      knifeMesh.add(pommel);

      gunGroup.add(knifeMesh);

      // Right hand holding knife
      rightArm.position.set(0, 0.01, 0.03);
      rightArm.rotation.set(0, 0, 0);

      // Left hand poised naturally in tactical off-hand stance
      leftArm.position.set(-0.25, -0.15, -0.1);
      leftArm.rotation.set(0.4, 0.6, -0.3);
    }

    // Muzzle Flash 3D Multi-Layer Assembly (for firearms)
    if (!type.isMelee) {
      const flashZ = muzzleZ[type.id] ?? -0.65;
      this.muzzleFlash = createMuzzleFlashGroup(type.id, flashZ);
      gunGroup.add(this.muzzleFlash);

      const lightColors = {
        vandal: 0xffb74d,
        phantom: 0x00f0ff,
        guardian: 0xffd700,
        spectre: 0x38bdf8,
        classic: 0xffe680,
        sheriff: 0xffa726,
        operator: 0xd8b4fe
      };
      this.muzzleLight = new THREE.PointLight(lightColors[type.id] || 0xffb74d, 0, 9);
      this.muzzleLight.position.set(0, 0.02, flashZ);
      gunGroup.add(this.muzzleLight);
    }

    this.gunMesh = gunGroup;
    this.viewmodelHolder.add(this.gunMesh);
    this.supportArm = null;
    this.animatedParts = [];

    // Load Blender 3D weapon and tactical hands models from public/models/
    const armFile = 'arms_rigged';
    Promise.all([loadModel(type.id), loadModel(armFile)])
      .then(([weaponModel, armModelScene]) => {
        if (this.gunMesh !== gunGroup) return;

        // Remove placeholder children (except muzzle flash and muzzle light)
        for (const child of [...gunGroup.children]) {
          if (child === this.muzzleFlash || child === this.muzzleLight) continue;
          gunGroup.remove(child);
        }

        // Add cloned 3D weapon model
        const weaponClone = weaponModel.clone(true);
        gunGroup.add(weaponClone);

        // Detect named Blender animated parts
        this.animatedParts = [];
        let hasExplicitActions = false;
        weaponClone.traverse(node => { if (node.userData.viewmodelRole) hasExplicitActions = true; });
        weaponClone.traverse(node => {
          const name = node.name.toLowerCase();
          let role = node.userData.viewmodelRole || null;
          if (!hasExplicitActions) {
            if (name.includes('magazine')) role = 'magazine';
            else if (type.id === 'classic' && name.includes('slide')) role = 'slide';
            else if (type.id === 'sheriff' && (name.includes('cylinder') || name.includes('chamber'))) role = 'cylinder';
            else if (type.id === 'operator' && (name.includes('bolt') || name.includes('handle'))) role = 'bolt';
          }
          if (role) {
            this.animatedParts.push({
              node,
              role,
              position: node.position.clone(),
              rotation: node.rotation.clone()
            });
          }
        });

        // Add cloned tactical hands and arms model
        this.armsGroup = cloneSkeleton(armModelScene);
        this.armsGroup.position.copy(this.basePos);
        this.armsGroup.visible = !this.isScoping;
        this.viewmodelHolder.add(this.armsGroup);
        this.armsGroup.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
        this.armIK = new ProceduralArms(this.armsGroup, gunGroup, type.id);
        this.armIK.update({pull: 1});
      })
      .catch(error => console.error(`Viewmodel ${type.id} failed to load from /models:`, error));
  }

  // Handle mouse movement for viewmodel sway
  handleMouseLook(dx, dy) {
    this.swayTarget.x = Math.max(-0.04, Math.min(0.04, -dx * 0.0003));
    this.swayTarget.y = Math.max(-0.04, Math.min(0.04, dy * 0.0003));
  }

  // Trigger weapon shot or knife slash
  shoot(playerMovementSpeed, isGrounded, { crouching = false, walking = false, burst = false } = {}) {
    const now = performance.now();
    const type = this.currentWeaponType;

    // Melee Knife Slash Attack
    if (type.isMelee) {
      if (now - this.lastShotTime < type.fireRateMs) return null;
      this.lastShotTime = now;
      this.isSlashing = true;
      this.slashTimer = 0;
      this.shotTimer = 0;
      this.soundManager.playKnifeSlash();

      return {
        isMelee: true,
        spread: 0,
        damage: type.damage,
        weaponId: type.id
      };
    }

    // Firearm attack
    if (this.isReloading) return null;
    if (this.ammo <= 0) {
      this.reload();
      return null;
    }
    burst = burst && type.id === 'classic';
    const recoilProfile = RECOIL_PROFILES[type.id];
    const interval = burst ? recoilProfile.burstInterval : this.getFireInterval();
    if (now - this.lastShotTime < Math.max(interval, this.lastFireInterval || 0)) {
      return null;
    }

    this.lastShotTime = now;
    this.lastFireInterval = interval;
    const pelletCount = burst ? Math.min(3, this.ammo) : 1;
    this.ammo -= pelletCount;
    this.shotTimer = 0;
    this.shotPower = burst ? 1.6 : 1;

    // Play gunshot sound
    this.soundManager.playGunfire(type.id);

    // Calculate spread error breakdown (Valorant Shooting Error mechanics)
    let movementError = 0;
    const threshold = this.getMovementThreshold();
    const moving = playerMovementSpeed > threshold;
    if (!isGrounded) {
      movementError = burst ? coneRadius(recoilProfile.burstJumpError) : type.jumpingSpread;
    } else if (moving) {
      // Deadzone threshold is 2.2 m/s in Valorant. Error scales up to max run speed.
      const ratio = Math.min(1.0, (playerMovementSpeed - threshold) / (6.75 - threshold));
      movementError = burst ? coneRadius(walking ? recoilProfile.burstWalkError : recoilProfile.burstRunError)
        : type.movingSpread * ratio;
    }
    const recoil = this.getRecoilState();
    const shot = recoil.fire(now * .001, {
      aiming: this.isAiming, crouching, walking, moving, airborne: !isGrounded, burst, pellets: pelletCount,
    });
    const firingError = shot.firingError;
    const totalSpread = shot.firstSpread + movementError + firingError;

    // Increment continuous spray count & reset timer
    this.sprayCount = recoil.shots;
    this.timeSinceLastShot = 0;

    // Viewmodel kick impulse
    this.recoilAmount = Math.min(1.0, this.recoilAmount + 0.35);

    // Flash muzzle flash
    this.triggerMuzzleFlash();

    return {
      isMelee: false,
      spread: totalSpread,
      movementError,
      firingError,
      totalError: totalSpread,
      damage: type.damage,
      weaponId: type.id,
      recoilPitch: shot.pitch,
      recoilYaw: shot.yaw,
      pelletCount,
      moving: moving || !isGrounded,
      sprayCount: this.sprayCount
    };
  }

  triggerMuzzleFlash() {
    if (this.muzzleFlash && this.muzzleLight) {
      this.muzzleFlash.visible = true;
      if (this.muzzleFlash.userData) {
        this.muzzleFlash.userData.currentOpacity = 1.0;
        const s = 0.9 + Math.random() * 0.35;
        this.muzzleFlash.scale.set(s, s, s);
        this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
        if (this.muzzleFlash.userData.materials) {
          for (let i = 0; i < this.muzzleFlash.userData.materials.length; i++) {
            this.muzzleFlash.userData.materials[i].opacity = 1.0;
          }
        }
      }
      this.muzzleLight.intensity = 4.2;
    }
  }

  reload() {
    if (this.currentWeaponType.isMelee) {
      this.isInspecting = true; // A knife has no magazine; R plays a flourish.
      this.reloadTimer = 0;
      return;
    }
    if (this.isReloading || this.ammo === this.currentWeaponType.magSize) {
      return;
    }
    this.isReloading = true;
    this.setAiming(false);
    this.reloadTimer = 0;
    this.soundManager.playReload();
  }

  setAiming(enabled, immediate = false) {
    const profile = ADS_PROFILES[this.currentWeaponType.id];
    this.isAiming = !!(enabled && profile && !this.isReloading);
    this.isScoping = !!(this.isAiming && profile.scoped);
    if (immediate) {
      this.aimBlend = this.isAiming ? 1 : 0;
      this.aimZoom = this.isAiming ? profile.zoom : 1;
    }
    if (this.armsGroup) this.armsGroup.visible = !this.isScoping;
    if (this.gunMesh) this.gunMesh.visible = !this.isScoping;
    return this.isAiming;
  }

  setScope(enabled) {
    if (this.currentWeaponType.id === 'operator') this.setAiming(enabled);
  }

  getFireInterval() {
    const multiplier = this.isAiming ? ADS_PROFILES[this.currentWeaponType.id]?.fireRateMultiplier : 1;
    return this.currentWeaponType.fireRateMs / (multiplier || 1);
  }

  getRecoilState() {
    if (!this.recoilState || this.recoilState.id !== this.currentWeaponType.id) {
      this.recoilState = new RecoilState(this.currentWeaponType.id);
    }
    return this.recoilState;
  }

  getMovementThreshold() {
    return RECOIL_PROFILES[this.currentWeaponType.id]?.movementThreshold ?? 2.2;
  }

  resetRecoil() {
    this.recoilState?.reset();
    this.sprayCount = 0;
    this.recoilAmount = 0;
    this.lastShotTime = -Infinity;
    this.lastFireInterval = 0;
  }

  getCameraRecoil() {
    return this.currentWeaponType.isMelee ? { pitch: 0, yaw: 0 }
      : this.getRecoilState().camera(performance.now() * .001);
  }

  // Update viewmodel animations every frame
  update(dt, playerSpeed, isGrounded) {
    const profile = VIEWMODEL_PROFILES[this.currentWeaponType.id];
    const ads = ADS_PROFILES[this.currentWeaponType.id];
    const adsPose = aimPose(ads);
    this.aimBlend += ((this.isAiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-dt * 22));
    if (Math.abs(this.aimBlend - (this.isAiming ? 1 : 0)) < .001) this.aimBlend = this.isAiming ? 1 : 0;
    this.aimZoom = 1 + ((ads?.zoom || 1) - 1) * this.aimBlend;
    this.equipTimer += dt;
    this.shotTimer += dt;
    if (this.isReloading || this.isInspecting) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.reloadDuration) {
        if (this.isReloading) this.ammo = this.currentWeaponType.magSize;
        this.isReloading = false;
        this.isInspecting = false;
        this.reloadTimer = 0;
      }
    }

    // Gun recovery keeps partial heat; it does not abruptly reset after a short burst.
    this.timeSinceLastShot += dt;
    if (!this.currentWeaponType.isMelee && this.getRecoilState().sample(performance.now() * .001).heat < .001) {
      this.sprayCount = 0;
    }

    // Decay recoil amount
    this.recoilAmount = Math.max(0, this.recoilAmount - dt * (this.currentWeaponType.recoilRecovery || 9.0));

    // Decay muzzle flash mesh
    if (this.muzzleFlash && this.muzzleFlash.userData && this.muzzleFlash.userData.currentOpacity > 0) {
      this.muzzleFlash.userData.currentOpacity = Math.max(0, this.muzzleFlash.userData.currentOpacity - dt * 32);
      const op = this.muzzleFlash.userData.currentOpacity;
      if (this.muzzleFlash.userData.materials) {
        for (let i = 0; i < this.muzzleFlash.userData.materials.length; i++) {
          this.muzzleFlash.userData.materials[i].opacity = op;
        }
      }
      if (op <= 0) {
        this.muzzleFlash.visible = false;
      }
    }

    // Decay muzzle point light independently so it ALWAYS turns completely off after flashing
    if (this.muzzleLight && this.muzzleLight.intensity > 0) {
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 65);
    }

    // Knife slash animation arc
    let slashOffsetX = 0;
    let slashOffsetY = 0;
    let slashRotZ = 0;
    let slashRotY = 0;

    if (this.isSlashing) {
      this.slashTimer += dt;
      const progress = this.slashTimer / this.slashDuration;
      if (progress <= 1.0) {
        // Swift diagonal slash from upper right to lower left
        const swing = Math.sin(progress * Math.PI);
        slashOffsetX = -swing * 0.35;
        slashOffsetY = -swing * 0.15;
        slashRotZ = -swing * 1.4;
        slashRotY = -swing * 0.8;
      } else {
        this.isSlashing = false;
      }
    }

    // Smooth weapon sway
    this.swayCurrent.lerp(this.swayTarget, dt * 10);
    this.swayTarget.multiplyScalar(0.9);

    // Procedural weapon bobbing and breathing, tuned for each weapon's mass.
    let bobX = 0;
    let bobY = 0;
    if (isGrounded && playerSpeed > 0.5) {
      this.bobPhase += dt * playerSpeed * 3.2;
      bobX = Math.sin(this.bobPhase) * 0.015;
      bobY = Math.abs(Math.cos(this.bobPhase)) * 0.018;
    } else {
      // Idle breathing sway
      const idleTime = performance.now() * .001 * profile.idleRate * Math.PI * 2;
      bobX = Math.sin(idleTime) * profile.idle;
      bobY = Math.cos(idleTime * .65) * profile.idle;
    }

    const pull = 1 - smoothstep(this.equipTimer / profile.pull);
    const shot = Math.pow(Math.max(0, 1 - this.shotTimer / profile.shotTime), 2) * (this.shotPower || 1);
    const reloadProgress = (this.isReloading || this.isInspecting)
      ? this.reloadTimer / this.reloadDuration : 0;
    const reloadEnvelope = Math.sin(Math.PI * reloadProgress) ** 2;
    const inspectSpin = this.isInspecting ? Math.sin(Math.PI * reloadProgress) : 0;

    // Named Blender components move with the action instead of remaining rigid.
    const action = Math.sin(Math.PI * smoothstep((reloadProgress - .12) / .76));
    const {extraction, rack} = reloadMotion(reloadProgress);
    for (const part of this.animatedParts) {
      part.node.position.copy(part.position);
      part.node.rotation.copy(part.rotation);
      if (part.role === 'magazine') {
        part.node.position.y -= .14 * extraction;
        part.node.position.z += .035 * extraction;
      } else if (part.role === 'slide') {
        part.node.position.z += .065 * rack + .042 * shot;
      } else if (part.role === 'cylinder') {
        part.node.position.x += .082 * action;
        part.node.rotation.z += .5 * action;
      } else if (part.role === 'bolt') {
        part.node.position.z += .1 * rack;
      }
    }

    // Weapon-specific procedural kick impulses
    const stability = 1 - .85 * this.aimBlend;
    const vmPunch = (this.currentWeaponType.viewmodelPunch || profile.shot) * shot * (1 - .6 * this.aimBlend);
    const vmFlip = (this.currentWeaponType.viewmodelFlip || profile.shotAngle) * shot * (1 - .75 * this.aimBlend);
    const vmRoll = (this.currentWeaponType.viewmodelRoll || 0.015) * shot * stability;

    // Equip (pull), shot impulse, reload and knife flourish layer over idle.
    // The front sight stays centered while the receiver sits lower; IK follows the grips.
    const targetX = this.basePos.x * (1 - this.aimBlend) + (this.swayCurrent.x + bobX) * stability + slashOffsetX
      + .09 * pull - .025 * shot * stability;
    const targetY = THREE.MathUtils.lerp(this.basePos.y, adsPose?.y ?? this.basePos.y, this.aimBlend)
      + (this.swayCurrent.y - bobY) * stability + slashOffsetY
      - .32 * pull - profile.reloadDrop * reloadEnvelope - vmPunch * 0.35;
    const targetZ = THREE.MathUtils.lerp(this.basePos.z, adsPose?.z ?? this.basePos.z, this.aimBlend) + .08 * pull + vmPunch;

    const blend = 1 - Math.exp(-dt * 22);
    this.currentPos.x += (targetX - this.currentPos.x) * blend;
    this.currentPos.y += (targetY - this.currentPos.y) * blend;
    this.currentPos.z += (targetZ - this.currentPos.z) * blend;

    const targetRotX = this.baseRot.x + (adsPose?.pitch || 0) * this.aimBlend - this.swayCurrent.y * 1.2 * stability
      + vmFlip + .23 * pull;
    const targetRotY = this.baseRot.y + this.swayCurrent.x * 1.2 * stability + slashRotY
      + .18 * pull + 1.2 * inspectSpin;
    const targetRotZ = this.baseRot.z + this.swayCurrent.x * .8 * stability + slashRotZ
      - .42 * pull + profile.reloadTilt * reloadEnvelope + .28 * inspectSpin + vmRoll;

    this.currentRot.x += (targetRotX - this.currentRot.x) * blend;
    this.currentRot.y += (targetRotY - this.currentRot.y) * blend;
    this.currentRot.z += (targetRotZ - this.currentRot.z) * blend;

    if (this.gunMesh) {
      this.gunMesh.position.copy(this.currentPos);
      this.gunMesh.rotation.copy(this.currentRot);
    }
    this.armIK?.update({reload: reloadProgress, action, pull, shot});
  }

  getFiringErrorRatio() {
    const type = this.currentWeaponType;
    if (type.isMelee) return 0;
    const state = this.getRecoilState();
    const maxErr = coneRadius(Math.max(...state.profile.bloom));
    const currentErr = coneRadius(state.sample(performance.now() * .001).bloom);
    if (!maxErr) return 0;
    return Math.min(1.0, currentErr / maxErr);
  }
}
