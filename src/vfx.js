import * as THREE from 'three';

// Procedural texture generators for zero-dependency high quality VFX
function createBulletHoleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Outer soot powder burn
  const gradSoot = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  gradSoot.addColorStop(0, 'rgba(12, 12, 14, 0.95)');
  gradSoot.addColorStop(0.35, 'rgba(25, 25, 28, 0.7)');
  gradSoot.addColorStop(0.7, 'rgba(40, 40, 45, 0.25)');
  gradSoot.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradSoot;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  // Fractured impact crater ring
  ctx.strokeStyle = 'rgba(10, 10, 12, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.25) {
    const r = 24 + (Math.sin(a * 7) * 4) + (Math.cos(a * 13) * 3);
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Cracking stress lines radiating outward
  ctx.strokeStyle = 'rgba(20, 20, 24, 0.75)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
    const startR = 18 + Math.random() * 6;
    const endR = 40 + Math.random() * 18;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * startR, 64 + Math.sin(angle) * startR);
    ctx.lineTo(64 + Math.cos(angle) * endR, 64 + Math.sin(angle) * endR);
    ctx.stroke();
  }

  // Deep dark central penetration hole
  const gradHole = ctx.createRadialGradient(64, 64, 0, 64, 64, 18);
  gradHole.addColorStop(0, 'rgba(4, 4, 6, 1)');
  gradHole.addColorStop(0.65, 'rgba(8, 8, 10, 1)');
  gradHole.addColorStop(1, 'rgba(35, 35, 40, 0.8)');
  ctx.fillStyle = gradHole;
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createSmokeParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(220, 220, 225, 0.8)');
  grad.addColorStop(0.3, 'rgba(180, 180, 190, 0.5)');
  grad.addColorStop(0.65, 'rgba(120, 120, 130, 0.2)');
  grad.addColorStop(1, 'rgba(60, 60, 70, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function createSparkParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.25, 'rgba(255, 220, 120, 0.9)');
  grad.addColorStop(0.6, 'rgba(255, 120, 30, 0.4)');
  grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// Spark Particle Class with physics, bounce and lifetime fade
class SparkParticle {
  constructor(mesh) {
    this.mesh = mesh;
    this.velocity = new THREE.Vector3();
    this.gravity = -16.0;
    this.drag = 0.94;
    this.life = 0;
    this.maxLife = 0.45;
    this.active = false;
    this.baseScale = 0.05;
  }

  spawn(pos, vel, maxLife = 0.45, scale = 0.05, colorHex = 0xffd700) {
    this.mesh.position.copy(pos);
    this.velocity.copy(vel);
    this.life = maxLife;
    this.maxLife = maxLife;
    this.baseScale = scale;
    this.mesh.scale.set(scale, scale, scale);
    this.mesh.material.color.setHex(colorHex);
    this.mesh.material.opacity = 1.0;
    this.mesh.visible = true;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return false;
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      this.mesh.visible = false;
      return false;
    }

    // Velocity & Gravity
    this.velocity.y += this.gravity * dt;
    this.velocity.x *= this.drag;
    this.velocity.z *= this.drag;

    this.mesh.position.addScaledVector(this.velocity, dt);

    // Stretch along motion vector for high-speed spark feel
    const speed = this.velocity.length();
    const stretch = Math.min(3.5, 1.0 + speed * 0.15);
    const progress = this.life / this.maxLife;

    this.mesh.scale.set(this.baseScale * progress, this.baseScale * stretch * progress, this.baseScale * progress);
    this.mesh.material.opacity = progress;
    return true;
  }
}

// Smoke Puff Class with rotation, drag and size expansion
class SmokeParticle {
  constructor(mesh) {
    this.mesh = mesh;
    this.velocity = new THREE.Vector3();
    this.rotSpeed = (Math.random() - 0.5) * 2;
    this.life = 0;
    this.maxLife = 0.8;
    this.initialScale = 0.08;
    this.targetScale = 0.35;
    this.active = false;
  }

  spawn(pos, vel, maxLife = 0.7, initScale = 0.08, targetScale = 0.32) {
    this.mesh.position.copy(pos);
    this.velocity.copy(vel);
    this.life = maxLife;
    this.maxLife = maxLife;
    this.initialScale = initScale;
    this.targetScale = targetScale;
    this.rotSpeed = (Math.random() - 0.5) * 3;
    this.mesh.rotation.z = Math.random() * Math.PI * 2;
    this.mesh.scale.set(initScale, initScale, initScale);
    this.mesh.material.opacity = 0.65;
    this.mesh.visible = true;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return false;
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      this.mesh.visible = false;
      return false;
    }

    this.velocity.multiplyScalar(0.92);
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.mesh.position.y += 0.3 * dt; // Thermal buoyancy
    this.mesh.rotation.z += this.rotSpeed * dt;

    const progress = 1.0 - (this.life / this.maxLife); // 0 to 1
    const currentScale = THREE.MathUtils.lerp(this.initialScale, this.targetScale, Math.sqrt(progress));
    this.mesh.scale.set(currentScale, currentScale, currentScale);
    this.mesh.material.opacity = Math.max(0, (1.0 - progress) * 0.6);
    return true;
  }
}

// Bullet Tracer Trail (high speed beam from gun muzzle to target/wall)
class BulletTracer {
  constructor(mesh) {
    this.mesh = mesh;
    this.startPos = new THREE.Vector3();
    this.endPos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.totalDist = 0;
    this.currentDist = 0;
    this.speed = 320; // 320 m/s tracer velocity
    this.tracerLength = 2.2;
    this.active = false;
  }

  spawn(start, end, colorHex = 0xffe680) {
    this.startPos.copy(start);
    this.endPos.copy(end);
    this.dir.subVectors(end, start);
    this.totalDist = this.dir.length();
    this.dir.normalize();

    this.currentDist = 0;
    this.mesh.material.color.setHex(colorHex);
    this.mesh.material.opacity = 0.95;
    this.mesh.visible = true;
    this.active = true;

    // Align orientation with flight path
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.dir);
    this.updateMeshTransform(0);
  }

  updateMeshTransform(leadDist) {
    const head = Math.min(this.totalDist, leadDist);
    const tail = Math.max(0, head - this.tracerLength);
    const mid = (head + tail) * 0.5;
    const len = Math.max(0.1, head - tail);

    this.mesh.position.copy(this.startPos).addScaledVector(this.dir, mid);
    this.mesh.scale.set(0.022, len, 0.022);
  }

  update(dt) {
    if (!this.active) return false;
    this.currentDist += this.speed * dt;
    this.updateMeshTransform(this.currentDist);

    if (this.currentDist - this.tracerLength >= this.totalDist) {
      this.active = false;
      this.mesh.visible = false;
      return false;
    }
    return true;
  }
}

// Main VFX Manager
export class VFXManager {
  constructor(scene) {
    this.scene = scene;
    this.vfxGroup = new THREE.Group();
    this.scene.add(this.vfxGroup);

    // Textures
    this.bulletHoleTexture = createBulletHoleTexture();
    this.smokeTexture = createSmokeParticleTexture();
    this.sparkTexture = createSparkParticleTexture();

    // Materials
    this.bulletHoleMaterial = new THREE.MeshBasicMaterial({
      map: this.bulletHoleTexture,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: false
    });

    this.sparkMaterial = new THREE.SpriteMaterial({
      map: this.sparkTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.smokeMaterial = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    this.tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe680,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // Object Pools
    this.maxDecals = 90;
    this.decals = [];
    this.decalGeometry = new THREE.PlaneGeometry(0.13, 0.13);

    // Sparks Pool
    this.maxSparks = 140;
    this.sparkPool = [];
    for (let i = 0; i < this.maxSparks; i++) {
      const sprite = new THREE.Sprite(this.sparkMaterial.clone());
      sprite.visible = false;
      this.vfxGroup.add(sprite);
      this.sparkPool.push(new SparkParticle(sprite));
    }

    // Smoke Pool
    this.maxSmoke = 60;
    this.smokePool = [];
    for (let i = 0; i < this.maxSmoke; i++) {
      const sprite = new THREE.Sprite(this.smokeMaterial.clone());
      sprite.visible = false;
      this.vfxGroup.add(sprite);
      this.smokePool.push(new SmokeParticle(sprite));
    }

    // Tracers Pool
    this.maxTracers = 24;
    this.tracerPool = [];
    for (let i = 0; i < this.maxTracers; i++) {
      const mesh = new THREE.Mesh(tracerGeo, this.tracerMaterial.clone());
      mesh.visible = false;
      this.vfxGroup.add(mesh);
      this.tracerPool.push(new BulletTracer(mesh));
    }
  }

  // --- BULLET HOLES (DECALS) ---
  createBulletHole(position, normal) {
    let decalMesh;
    if (this.decals.length >= this.maxDecals) {
      decalMesh = this.decals.shift();
    } else {
      decalMesh = new THREE.Mesh(this.decalGeometry, this.bulletHoleMaterial.clone());
      this.vfxGroup.add(decalMesh);
    }

    // Offset slightly along normal to prevent any z-fighting
    decalMesh.position.copy(position).addScaledVector(normal, 0.0035);

    // Orient quad facing along the surface normal
    const up = new THREE.Vector3(0, 0, 1);
    decalMesh.quaternion.setFromUnitVectors(up, normal);

    // Random spin around the normal for natural variety
    const randomAngle = Math.random() * Math.PI * 2;
    decalMesh.rotateZ(randomAngle);

    // Random scale variation (pistol vs sniper impact size)
    const scaleVar = 0.85 + Math.random() * 0.35;
    decalMesh.scale.set(scaleVar, scaleVar, scaleVar);

    decalMesh.material.opacity = 1.0;
    decalMesh.userData.createdAt = performance.now();
    decalMesh.visible = true;

    this.decals.push(decalMesh);
  }

  // --- IMPACT SPARKS & DEBRIS (THREE-VFX STYLE CONE EMISSION) ---
  spawnImpactSparks(position, normal, colorHex = 0xffcc33, count = 14) {
    let spawned = 0;
    const tangent = new THREE.Vector3();
    if (Math.abs(normal.y) < 0.9) {
      tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const p = this.sparkPool[i];
      if (!p.active) {
        // Conical bounce distribution off surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * 0.65; // Cone spread angle
        const speed = 4.0 + Math.random() * 8.5;

        const vel = new THREE.Vector3()
          .copy(normal).multiplyScalar(Math.cos(phi))
          .addScaledVector(tangent, Math.sin(phi) * Math.cos(theta))
          .addScaledVector(bitangent, Math.sin(phi) * Math.sin(theta))
          .multiplyScalar(speed);

        p.spawn(position, vel, 0.28 + Math.random() * 0.22, 0.038 + Math.random() * 0.02, colorHex);
        spawned++;
      }
    }
  }

  // --- IMPACT DUST & SMOKE PUFFS ---
  spawnImpactDust(position, normal, count = 4) {
    let spawned = 0;
    for (let i = 0; i < this.smokePool.length && spawned < count; i++) {
      const s = this.smokePool[i];
      if (!s.active) {
        const vel = new THREE.Vector3()
          .copy(normal).multiplyScalar(0.8 + Math.random() * 1.4)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.5, (Math.random() - 0.5) * 0.8));

        s.spawn(position, vel, 0.5 + Math.random() * 0.35, 0.06, 0.28 + Math.random() * 0.12);
        spawned++;
      }
    }
  }

  // --- VALORANT HEADSHOT CRITICAL STARBURST ---
  spawnHeadshotBurst(position) {
    // 1. Radiant Golden Starburst Sparks (360 degree explosion)
    let count = 28;
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const p = this.sparkPool[i];
      if (!p.active) {
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const speed = 5.0 + Math.random() * 9.0;
        const vel = new THREE.Vector3(
          Math.cos(phi) * Math.cos(theta) * speed,
          (Math.sin(phi) * speed) + 3.0,
          Math.cos(phi) * Math.sin(theta) * speed
        );
        p.spawn(position, vel, 0.45 + Math.random() * 0.25, 0.06, 0xffe040);
        spawned++;
      }
    }

    // 2. Headshot Golden Energy Puff
    let smokeSpawned = 0;
    for (let i = 0; i < this.smokePool.length && smokeSpawned < 3; i++) {
      const s = this.smokePool[i];
      if (!s.active) {
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          0.8 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.8
        );
        s.spawn(position, vel, 0.4, 0.08, 0.38);
        smokeSpawned++;
      }
    }
  }

  // --- BULLET TRACERS (HIGH VELOCITY LUMINOUS BEAMS) ---
  spawnBulletTracer(startPos, endPos, weaponId = 'vandal') {
    const tracerColors = {
      vandal: 0xffb74d,
      phantom: 0x00f0ff,
      guardian: 0xffd700,
      spectre: 0x38bdf8,
      classic: 0xffeb99,
      sheriff: 0xffa726,
      operator: 0xd8b4fe
    };
    const colorHex = tracerColors[weaponId] || 0xffe680;

    for (let i = 0; i < this.tracerPool.length; i++) {
      const t = this.tracerPool[i];
      if (!t.active) {
        t.spawn(startPos, endPos, colorHex);
        break;
      }
    }
  }

  // --- MUZZLE SMOKE CURL ---
  spawnMuzzleSmoke(barrelPos, forwardDir) {
    for (let i = 0; i < this.smokePool.length; i++) {
      const s = this.smokePool[i];
      if (!s.active) {
        const vel = new THREE.Vector3()
          .copy(forwardDir).multiplyScalar(0.6)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2));
        s.spawn(barrelPos, vel, 0.4, 0.04, 0.16);
        break;
      }
    }
  }

  // --- CLEAR ALL VFX ON MAP OR MODE RESET ---
  clear() {
    this.decals.forEach(d => {
      this.vfxGroup.remove(d);
      if (d.geometry) d.geometry.dispose();
      if (d.material) d.material.dispose();
    });
    this.decals = [];

    this.sparkPool.forEach(p => {
      p.active = false;
      p.mesh.visible = false;
    });

    this.smokePool.forEach(s => {
      s.active = false;
      s.mesh.visible = false;
    });

    this.tracerPool.forEach(t => {
      t.active = false;
      t.mesh.visible = false;
    });
  }

  // --- MAIN FRAME UPDATE ---
  update(dt) {
    // Update active sparks
    for (let i = 0; i < this.sparkPool.length; i++) {
      this.sparkPool[i].update(dt);
    }

    // Update active smoke puffs
    for (let i = 0; i < this.smokePool.length; i++) {
      this.smokePool[i].update(dt);
    }

    // Update bullet tracers
    for (let i = 0; i < this.tracerPool.length; i++) {
      this.tracerPool[i].update(dt);
    }

    // Subtle fadeout for very old bullet holes (older than 20 seconds)
    const now = performance.now();
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      const age = (now - d.userData.createdAt) / 1000;
      if (age > 20) {
        const fade = Math.max(0, 1.0 - (age - 20) / 10);
        d.material.opacity = fade;
      }
    }
  }
}
