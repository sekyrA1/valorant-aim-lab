import * as THREE from 'three';
import { DIFFICULTIES } from './difficulty.js';
import { isBotPlacementClear } from './spawnSafety.js';
import { attachBotRig } from './botRig.js';

export class BotManager {
  constructor(scene, soundManager) {
    this.scene = scene;
    this.soundManager = soundManager;
    this.bots = [];
    this.floatingTexts = [];
    this.particles = [];
    this.difficulty = DIFFICULTIES.normal;
  }

  clearAll() {
    this.bots.forEach(bot => {
      bot.visualDisposed = true;
      bot.cancelRigAttach?.(); bot.rig?.dispose();
      this.scene.remove(bot.group);
      this.disposeObject(bot.group);
    });
    this.bots = [];

    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      this.disposeObject(p.mesh);
    });
    this.particles = [];
  }

  disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry && !child.userData.sharedBotGeometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  // Create a Valorant Tactical Training Bot (Humanoid)
  spawnTacticalBot(x, y, z, rotationY = 0, isAggressive = false, reactionTime = 0.45, kind = 'tactical') {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;

    // Materials
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.4,
      metalness: 0.6
    });

    const innerSuitMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.8
    });

    // Enemy Red Glow Material (Valorant Enemy Highlight Outline)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b4e
    });

    // 1. Head (Hitbox: Headshot)
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, armorMat);
    headMesh.position.set(0, 1.62, 0);
    headMesh.userData = { hitZone: 'head', isHitbox: true };
    group.add(headMesh);

    // Glowing Visor / Headband
    const visorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.22);
    const visorMesh = new THREE.Mesh(visorGeo, glowMat);
    visorMesh.position.set(0, 1.63, 0.05);
    group.add(visorMesh);

    // 2. Torso / Body (Hitbox: Body)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.65, 12);
    const torsoMesh = new THREE.Mesh(torsoGeo, armorMat);
    torsoMesh.position.set(0, 1.15, 0);
    torsoMesh.userData = { hitZone: 'body', isHitbox: true };
    group.add(torsoMesh);

    // Glowing Chest Core (Valorant Radianite core)
    const coreGeo = new THREE.BoxGeometry(0.12, 0.18, 0.06);
    const coreMesh = new THREE.Mesh(coreGeo, glowMat);
    coreMesh.position.set(0, 1.2, 0.18);
    group.add(coreMesh);

    // 3. Legs (Hitbox: Legs)
    const leftLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8);
    const leftLeg = new THREE.Mesh(leftLegGeo, innerSuitMat);
    leftLeg.position.set(-0.14, 0.4, 0);
    leftLeg.userData = { hitZone: 'legs', isHitbox: true };
    group.add(leftLeg);

    const rightLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8);
    const rightLeg = new THREE.Mesh(rightLegGeo, innerSuitMat);
    rightLeg.position.set(0.14, 0.4, 0);
    rightLeg.userData = { hitZone: 'legs', isHitbox: true };
    group.add(rightLeg);

    // 4. Enemy weapon
    const weaponGeo = new THREE.BoxGeometry(0.08, 0.1, 0.5);
    const botGun = new THREE.Mesh(weaponGeo, armorMat);
    botGun.position.set(0.28, 1.1, 0.25);
    group.add(botGun);

    // Alert icon above head (for retake peeking reaction)
    const alertGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
    alertGeo.rotateX(Math.PI);
    const alertMesh = new THREE.Mesh(alertGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    alertMesh.position.set(0, 2.05, 0);
    alertMesh.visible = false;
    group.add(alertMesh);

    this.scene.add(group);

    const botData = {
      type: 'tactical_bot',
      group,
      headMesh,
      torsoMesh,
      leftLeg,
      rightLeg,
      alertMesh,
      maxHealth: 100,
      health: 100,
      isDead: false,
      isAggressive,
      reactionTime,
      reactionTimer: 0,
      hasSpottedPlayer: false,
      lastShotTime: 0,
      deathAnimationTimer: 0
    };

    // Associate meshes with bot data
    headMesh.userData.bot = botData;
    torsoMesh.userData.bot = botData;
    leftLeg.userData.bot = botData;
    rightLeg.userData.bot = botData;

    botData.cancelRigAttach = attachBotRig(botData, kind, rig => {
      for (const part of group.children) if (part !== alertMesh && part !== rig.root) { part.visible = false; part.userData.isHitbox = false; }
      for (const mesh of rig.meshes) Object.assign(mesh.userData, { isHitbox: true, bot: botData });
    });

    this.bots.push(botData);
    return botData;
  }

  // Create a Peeking Bot for Angle Holding / Reaction Trainer
  spawnPeekingBot(startPos, endPos, delaySec, strafeSpeed = 6.2, isJiggle = false) {
    const bot = this.spawnTacticalBot(startPos.x, startPos.y, startPos.z, Math.PI, false, 0);
    bot.isPeeking = true;
    bot.peekStart = startPos.clone();
    bot.peekEnd = endPos.clone();
    bot.peekDelay = delaySec;
    bot.strafeSpeed = strafeSpeed;
    bot.isJiggle = isJiggle;
    bot.peekTimer = 0;
    bot.peekState = 'waiting'; // 'waiting' -> 'peeking' -> 'retracting' -> 'holding'
    bot.peekStartTime = 0;
    bot.hasEmerged = false;
    return bot;
  }

  // Create an Aimlab/Kovaaks Target Sphere
  spawnAimTarget(x, y, z, radius = 0.35, isTracking = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Glowing neon cyan / orange orb
    const targetMat = new THREE.MeshStandardMaterial({
      color: isTracking ? 0xffaa00 : 0x00f0ff,
      emissive: isTracking ? 0xff5500 : 0x0077aa,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8
    });

    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const sphere = new THREE.Mesh(geo, targetMat);
    sphere.userData = { hitZone: 'head', isHitbox: true, isTargetOrb: true };
    group.add(sphere);

    // Outer glow ring
    const ringGeo = new THREE.TorusGeometry(radius * 1.25, 0.02, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isTracking ? 0xffcc00 : 0x00ffff,
      transparent: true,
      opacity: 0.75
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const botData = {
      type: isTracking ? 'tracking_target' : 'aim_target',
      group,
      sphere,
      ring,
      radius,
      isDead: false,
      maxHealth: isTracking ? 300 : 1,
      health: isTracking ? 300 : 1,
      isTracking,
      trackDir: 1,
      trackSpeed: 3.5,
      minX: x - 4.5,
      maxX: x + 4.5,
      deathAnimationTimer: 0
    };

    sphere.userData.bot = botData;
    this.bots.push(botData);
    return botData;
  }

  // Create a Voltaic 1w6ts Static Target Sphere
  spawnStaticTarget(x, y, z, radius = 0.22) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Gold/Amber precision sphere with bright core
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xfb8500,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.7
    });

    const geo = new THREE.SphereGeometry(radius, 20, 20);
    const sphere = new THREE.Mesh(geo, targetMat);
    sphere.userData = { hitZone: 'head', isHitbox: true, isTargetOrb: true };
    group.add(sphere);

    // Inner bullseye center for pinpoint crosshair alignment
    const centerGeo = new THREE.SphereGeometry(radius * 0.38, 12, 12);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    group.add(centerMesh);

    // Outer subtle gold halo ring
    const ringGeo = new THREE.TorusGeometry(radius * 1.25, 0.015, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe29a,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const botData = {
      type: 'static_target',
      group,
      sphere,
      ring,
      radius,
      isDead: false,
      maxHealth: 1,
      health: 1
    };

    sphere.userData.bot = botData;
    this.bots.push(botData);
    return botData;
  }

  // Create a Voltaic Pasu Dynamic Bouncing Target
  spawnDynamicPasuTarget(x, y, z, vx, vy, radius = 0.32) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Ruby / Crimson neon sphere with bright emissive core
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xd90429,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8
    });

    const geo = new THREE.SphereGeometry(radius, 22, 22);
    const sphere = new THREE.Mesh(geo, targetMat);
    sphere.userData = { hitZone: 'head', isHitbox: true, isTargetOrb: true };
    group.add(sphere);

    // Inner bright core
    const coreGeo = new THREE.SphereGeometry(radius * 0.45, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Dynamic orbital ring
    const ringGeo = new THREE.TorusGeometry(radius * 1.3, 0.02, 8, 30);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4d79,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const botData = {
      type: 'pasu_target',
      group,
      sphere,
      ring,
      radius,
      vel: new THREE.Vector3(vx, vy, 0),
      motionTimer: 0,
      motionInterval: .65 + Math.random() * .5,
      speedFloorX: Math.abs(vx) * .6,
      speedFloorY: Math.abs(vy) * .6,
      speedCapX: Math.abs(vx) * 1.45,
      speedCapY: Math.abs(vy) * 1.45,
      bounds: { minX: -7.5 + radius, maxX: 7.5 - radius,
        minY: 1.8 + radius, maxY: 8.2 - radius },
      isDead: false,
      maxHealth: 1,
      health: 1
    };

    sphere.userData.bot = botData;
    this.bots.push(botData);
    return botData;
  }

  // Create a Voltaic Smoothbot Tracking Target (Smooth harmonic 3D curve motion)
  spawnSmoothbotTarget(x = 0, y = 4.8, z = -14.4, radius = 0.38) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Neon emerald / vibrant cyan glowing orb
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: 0x00dd88,
      emissiveIntensity: 0.95,
      roughness: 0.15,
      metalness: 0.8
    });

    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const sphere = new THREE.Mesh(geo, targetMat);
    sphere.userData = { hitZone: 'head', isHitbox: true, isTargetOrb: true };
    group.add(sphere);

    // Inner bright white core
    const coreGeo = new THREE.SphereGeometry(radius * 0.42, 14, 14);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Multi-axis orbital rings
    const ringGeo = new THREE.TorusGeometry(radius * 1.35, 0.022, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x77ffdd,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const botData = {
      type: 'smoothbot_target',
      group,
      sphere,
      ring,
      radius,
      isDead: false,
      maxHealth: 999999,
      health: 999999,
      baseX: x,
      baseY: y,
      baseZ: z,
      time: Math.random() * 20,
      freqX: 0.85 + Math.random() * 0.35,
      freqY: 1.35 + Math.random() * 0.45,
      ampX: 5.6,
      ampY: 2.2,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2
    };

    sphere.userData.bot = botData;
    this.bots.push(botData);
    return botData;
  }

  // Create a Voltaic PatTargetSwitch Target (Fast target switching)
  spawnSwitchTarget(x, y, z, strafeSpeed = 3.8, radius = 0.30) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Electric purple / radiant magenta orb
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x9333ea,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.7
    });

    const geo = new THREE.SphereGeometry(radius, 20, 20);
    const sphere = new THREE.Mesh(geo, targetMat);
    sphere.userData = { hitZone: 'head', isHitbox: true, isTargetOrb: true };
    group.add(sphere);

    // Inner bright core
    const coreGeo = new THREE.SphereGeometry(radius * 0.4, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Pulsing outer ring
    const ringGeo = new THREE.TorusGeometry(radius * 1.3, 0.02, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd8b4fe,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    this.scene.add(group);

    const botData = {
      type: 'switch_target',
      group,
      sphere,
      ring,
      radius,
      isDead: false,
      maxHealth: 110,
      health: 110,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeSpeed,
      speedMultiplier: 1,
      motionTimer: 0,
      motionInterval: 0.45 + Math.random() * 0.9,
      baseY: y,
      verticalOffset: 0,
      verticalTarget: 0,
      bounds: { minX: -7.5 + radius, maxX: 7.5 - radius }
    };

    sphere.userData.bot = botData;
    this.bots.push(botData);
    return botData;
  }

  // Ray-AABB intersection distance helper (Slab method)
  getRayAABBIntersectionDistance(origin, dir, box, maxDist) {
    let tmin = 0;
    let tmax = maxDist;

    // X slab
    if (Math.abs(dir.x) < 1e-6) {
      if (origin.x < box.min.x || origin.x > box.max.x) return null;
    } else {
      const inv = 1.0 / dir.x;
      let t1 = (box.min.x - origin.x) * inv;
      let t2 = (box.max.x - origin.x) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    // Y slab
    if (Math.abs(dir.y) < 1e-6) {
      if (origin.y < box.min.y || origin.y > box.max.y) return null;
    } else {
      const inv = 1.0 / dir.y;
      let t1 = (box.min.y - origin.y) * inv;
      let t2 = (box.max.y - origin.y) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    // Z slab
    if (Math.abs(dir.z) < 1e-6) {
      if (origin.z < box.min.z || origin.z > box.max.z) return null;
    } else {
      const inv = 1.0 / dir.z;
      let t1 = (box.min.z - origin.z) * inv;
      let t2 = (box.max.z - origin.z) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    if (tmax < 0.1 || tmin > maxDist) return null;
    return Math.max(0.05, tmin);
  }

  // Check unobstructed line of sight between two 3D points
  hasLineOfSight(origin, target, colliders) {
    if (!colliders || colliders.length === 0) return true;

    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.normalize();

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      const d = this.getRayAABBIntersectionDistance(origin, dir, box, dist);
      if (d !== null && d > 0.3 && d < (dist - 0.3)) {
        return false; // Obstructed by wall or crate
      }
    }
    return true;
  }

  // Raycast bullet intersection (respects walls/colliders)
  raycastBullet(origin, direction, range = 100, colliders = null) {
    const raycaster = new THREE.Raycaster(origin, direction, 0.1, range);
    const hitboxes = [];

    this.bots.forEach(b => {
      if (!b.isDead) {
        if (b.rig) b.rig.syncMatrices();
        else b.group.updateWorldMatrix(true, true);
        b.group.traverse(child => {
          if (child.userData && child.userData.isHitbox) {
            hitboxes.push(child);
          }
        });
      }
    });

    // Check closest wall obstacle along the ray
    let closestWallDist = range;
    if (colliders && colliders.length > 0) {
      for (let i = 0; i < colliders.length; i++) {
        const d = this.getRayAABBIntersectionDistance(origin, direction, colliders[i], range);
        if (d !== null && d < closestWallDist) {
          closestWallDist = d;
        }
      }
    }

    const intersects = raycaster.intersectObjects(hitboxes, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      // Only hit bot if bot is in front of the wall
      if (hit.distance < closestWallDist) {
        const bot = hit.object.userData.bot;
        const zone = bot.rig ? bot.rig.hitZone(hit.point) : hit.object.userData.hitZone || 'body';
        return {
          point: hit.point,
          distance: hit.distance,
          bot,
          zone
        };
      }
    }
    return null;
  }

  // Apply hit damage to a bot/target
  applyHit(bot, zone, damageTable) {
    if (bot.isDead) return null;

    let dmg = damageTable[zone] || 40;
    const isHeadshot = (zone === 'head');

    if (bot.type === 'aim_target') {
      // 1-shot pop
      bot.health = 0;
      bot.isDead = true;
      this.soundManager.playTargetPop();
      this.createPopParticles(bot.group.position, 0x00f0ff);
      this.removeBot(bot);
      return { isKilled: true, isHeadshot: true, damage: dmg };
    }

    if (bot.type === 'static_target') {
      bot.health = 0;
      bot.isDead = true;
      this.soundManager.playTargetPop();
      this.createPopParticles(bot.group.position, 0xffb703);
      this.removeBot(bot);
      return { isKilled: true, isHeadshot: true, damage: dmg };
    }

    if (bot.type === 'pasu_target') {
      bot.health = 0;
      bot.isDead = true;
      this.soundManager.playTargetPop();
      this.createPopParticles(bot.group.position, 0xff0055);
      this.removeBot(bot);
      return { isKilled: true, isHeadshot: true, damage: dmg };
    }

    if (bot.type === 'tracking_target') {
      bot.health -= dmg;
      this.soundManager.playBodyHit();
      if (bot.health <= 0) {
        bot.isDead = true;
        this.soundManager.playTargetPop();
        this.createPopParticles(bot.group.position, 0xffaa00);
        this.removeBot(bot);
        return { isKilled: true, isHeadshot: false, damage: dmg };
      }
      return { isKilled: false, isHeadshot: false, damage: dmg };
    }

    if (bot.type === 'smoothbot_target') {
      bot.health -= dmg;
      bot.totalHits = (bot.totalHits || 0) + 1;
      this.soundManager.playBodyHit();
      this.createPopParticles(bot.group.position, 0x10b981);
      return { isKilled: false, isHeadshot: true, damage: dmg };
    }

    if (bot.type === 'switch_target') {
      bot.health -= dmg;
      if (isHeadshot) this.soundManager.playHeadshot();
      else this.soundManager.playBodyHit();

      if (bot.health <= 0) {
        bot.isDead = true;
        this.soundManager.playTargetPop();
        this.createPopParticles(bot.group.position, 0xc084fc);
        this.removeBot(bot);
        return { isKilled: true, isHeadshot, damage: dmg };
      }
      return { isKilled: false, isHeadshot, damage: dmg };
    }

    // Tactical bot
    if (isHeadshot) {
      this.soundManager.playHeadshot();
      bot.health -= dmg; // 160 dmg kills instantly
    } else {
      this.soundManager.playBodyHit();
      bot.health -= dmg;
    }

    // Trigger hit flinch
    if (bot.rig) bot.rig.hit();

    if (bot.health <= 0) {
      bot.isDead = true;
      this.createPopParticles(bot.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), isHeadshot ? 0xffd700 : 0xff3b4e);
      this.triggerBotDeath(bot);
      return { isKilled: true, isHeadshot, damage: dmg };
    }

    return { isKilled: false, isHeadshot, damage: dmg };
  }

  triggerBotDeath(bot) {
    bot.rig?.die();
    bot.deathAnimationTimer = 0;
  }

  removeBot(bot) {
    const idx = this.bots.indexOf(bot);
    if (idx !== -1) {
      this.bots.splice(idx, 1);
    }
    this.scene.remove(bot.group);
    bot.visualDisposed = true; bot.cancelRigAttach?.(); bot.rig?.dispose();
    this.disposeObject(bot.group);
  }

  createPopParticles(pos, colorHex) {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 6
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0.6,
        maxLife: 0.6
      });
    }
  }

  // Update AI, tracking movement, and particle physics
  update(dt, playerPosition, onPlayerDamaged, colliders = []) {
    // Update tracking targets
    this.bots.forEach(bot => {
      if (bot.isDead || bot.visualDisposed) return;

      if (bot.type === 'tracking_target') {
        bot.group.position.x += bot.trackDir * bot.trackSpeed * dt;
        if (bot.group.position.x > bot.maxX) {
          bot.trackDir = -1;
        } else if (bot.group.position.x < bot.minX) {
          bot.trackDir = 1;
        }
        // Rotate outer ring
        bot.ring.rotation.z += dt * 3;
        bot.ring.rotation.x += dt * 1.5;
      }

      // Voltaic Pasu Dynamic bouncing target kinematics
      if (bot.type === 'pasu_target' && bot.vel) {
        bot.motionTimer += dt;
        if (bot.motionTimer >= bot.motionInterval) {
          bot.motionTimer = 0;
          bot.motionInterval = .65 + Math.random() * .55;
          bot.vel.x = Math.sign(bot.vel.x) * Math.max(bot.speedFloorX,
            Math.min(bot.speedCapX, Math.abs(bot.vel.x) + (Math.random() - .5) * 1.4));
          bot.vel.y = Math.sign(bot.vel.y) * Math.max(bot.speedFloorY,
            Math.min(bot.speedCapY, Math.abs(bot.vel.y) + (Math.random() - .5) * 1.1));
        }
        bot.group.position.x += bot.vel.x * dt;
        bot.group.position.y += bot.vel.y * dt;

        // Bounce horizontally
        if (bot.group.position.x > bot.bounds.maxX) {
          bot.group.position.x = bot.bounds.maxX;
          bot.vel.x = -Math.abs(bot.vel.x) + (Math.random() - 0.5) * 0.4;
        } else if (bot.group.position.x < bot.bounds.minX) {
          bot.group.position.x = bot.bounds.minX;
          bot.vel.x = Math.abs(bot.vel.x) + (Math.random() - 0.5) * 0.4;
        }

        // Bounce vertically
        if (bot.group.position.y > bot.bounds.maxY) {
          bot.group.position.y = bot.bounds.maxY;
          bot.vel.y = -Math.abs(bot.vel.y) + (Math.random() - 0.5) * 0.4;
        } else if (bot.group.position.y < bot.bounds.minY) {
          bot.group.position.y = bot.bounds.minY;
          bot.vel.y = Math.abs(bot.vel.y) + (Math.random() - 0.5) * 0.4;
        }

        if (bot.ring) {
          bot.ring.rotation.z += dt * 3.5;
          bot.ring.rotation.x += dt * 2.0;
        }
      }

      // Voltaic Smoothbot harmonic 3D continuous motion
      if (bot.type === 'smoothbot_target') {
        bot.time += dt;
        bot.group.position.x = bot.baseX + Math.sin(bot.time * bot.freqX + bot.phaseX) * bot.ampX;
        bot.group.position.y = bot.baseY + Math.cos(bot.time * bot.freqY + bot.phaseY) * bot.ampY;
        bot.group.position.z = bot.baseZ + Math.sin(bot.time * 0.7) * 0.8;
        if (bot.ring) {
          bot.ring.rotation.z += dt * 4.0;
          bot.ring.rotation.x += dt * 2.5;
        }
      }

      // Voltaic PatTargetSwitch horizontal fast strafing
      if (bot.type === 'switch_target') {
        bot.motionTimer += dt;
        if (bot.motionTimer >= bot.motionInterval) {
          bot.motionTimer = 0;
          bot.motionInterval = 0.45 + Math.random() * 0.9;
          if (Math.random() < 0.45) bot.strafeDir *= -1;
          bot.speedMultiplier = 0.7 + Math.random() * 0.65;
          bot.verticalTarget = (Math.random() - 0.5) * 0.28;
        }
        bot.verticalOffset += (bot.verticalTarget - bot.verticalOffset) * (1 - Math.exp(-6 * dt));
        bot.group.position.y = bot.baseY + bot.verticalOffset;
        bot.group.position.x += bot.strafeDir * bot.strafeSpeed * bot.speedMultiplier * dt;
        if (bot.group.position.x > bot.bounds.maxX) {
          bot.group.position.x = bot.bounds.maxX;
          bot.strafeDir = -1;
        } else if (bot.group.position.x < bot.bounds.minX) {
          bot.group.position.x = bot.bounds.minX;
          bot.strafeDir = 1;
        }
        if (bot.ring) {
          bot.ring.rotation.z += dt * 4.5;
        }
      }

      // Yprac Site Defense attacker bot advancing toward site
      if (bot.type === 'tactical_bot' && bot.isDefenseAttacker && !bot.hasSpottedPlayer && bot.targetPos) {
        const toSite = bot.targetPos.clone().sub(bot.group.position);
        toSite.y = 0;
        const d = toSite.length();
        if (d > 1.2 && bot.group.position.y < 1) {
          toSite.normalize();
          const step = (bot.moveSpeed || 2.4) * dt;
          const next = bot.group.position.clone().addScaledVector(toSite, step);
          if (isBotPlacementClear(next, colliders)) {
            bot.group.position.copy(next);
          } else {
            const alongX = bot.group.position.clone().add(new THREE.Vector3(toSite.x * step, 0, 0));
            const alongZ = bot.group.position.clone().add(new THREE.Vector3(0, 0, toSite.z * step));
            if (isBotPlacementClear(alongX, colliders)) bot.group.position.copy(alongX);
            else if (isBotPlacementClear(alongZ, colliders)) bot.group.position.copy(alongZ);
          }
          bot.group.rotation.y = Math.atan2(toSite.x, toSite.z);
        }
      }

      // Tactical bot AI for Retake mode
      if (bot.type === 'tactical_bot' && bot.isAggressive) {
        // Distance check
        const dx = playerPosition.x - bot.group.position.x;
        const dz = playerPosition.z - bot.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let canSee = false;
        if (dist < 55) {
          const botEye = new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.5, bot.group.position.z);
          const playerHead = new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z);
          const playerChest = new THREE.Vector3(playerPosition.x, playerPosition.y - 0.55, playerPosition.z);

          // Check direct line of sight to either player's head or chest
          canSee = this.hasLineOfSight(botEye, playerHead, colliders) || this.hasLineOfSight(botEye, playerChest, colliders);
        }

        if (canSee) {
          const targetYaw = Math.atan2(dx, dz);
          bot.group.rotation.y = targetYaw;

          if (!bot.hasSpottedPlayer) {
            bot.hasSpottedPlayer = true;
            bot.alertMesh.visible = true;
            bot.reactionTimer = 0; // Starts reaction from zero upon spotting
          }

          bot.reactionTimer += dt;
          if (bot.reactionTimer >= bot.reactionTime) {
            const now = performance.now();
            if (now - bot.lastShotTime > 460 * this.difficulty.botFireRate) {
              bot.lastShotTime = now;
              bot.rig?.fire();
              this.soundManager.playGunfire('phantom');
              if (onPlayerDamaged) {
                // Inflict damage to player (16-24 dmg)
                onPlayerDamaged(Math.round((Math.floor(Math.random() * 9) + 16) * this.difficulty.botDamage));
                if (bot.visualDisposed) return;
              }
            }
          }
        } else {
          bot.hasSpottedPlayer = false;
          bot.alertMesh.visible = false;
          bot.reactionTimer = 0;
        }
      }

      // Peeking Bot logic for Hold de Pixel mode
      if (bot.isPeeking && !bot.isDead) {
        if (bot.peekState === 'waiting') {
          bot.peekTimer += dt;
          if (bot.peekTimer >= bot.peekDelay) {
            bot.peekState = 'peeking';
            bot.peekStartTime = performance.now();
          }
        } else if (bot.peekState === 'peeking') {
          const dir = bot.peekEnd.clone().sub(bot.group.position);
          const dist = dir.length();
          const step = bot.strafeSpeed * dt;
          if (dist <= step) {
            bot.group.position.copy(bot.peekEnd);
            bot.peekState = bot.continuousCrossing ? 'done' : (bot.isJiggle ? 'retracting' : 'holding');
          } else {
            dir.normalize().multiplyScalar(step);
            bot.group.position.add(dir);
          }
        } else if (bot.peekState === 'retracting') {
          const dir = bot.peekStart.clone().sub(bot.group.position);
          const dist = dir.length();
          const step = bot.strafeSpeed * dt;
          if (dist <= step) {
            bot.group.position.copy(bot.peekStart);
            bot.peekState = 'done';
          } else {
            dir.normalize().multiplyScalar(step);
            bot.group.position.add(dir);
          }
        }
        if (!bot.hasEmerged && bot.peekState === 'peeking') {
          const head = bot.group.position.clone().add(new THREE.Vector3(0, 1.62 * bot.group.scale.y, 0));
          if (this.hasLineOfSight(playerPosition, head, colliders)) {
            bot.hasEmerged = true;
            bot.peekStartTime = performance.now();
          }
        }
      }
    });

    // Animate after navigation/peeking, using actual displacement in this frame.
    for (const bot of [...this.bots]) if (bot.type === 'tactical_bot') {
      if (bot.isDead) {
        bot.deathAnimationTimer += dt;
        bot.rig?.update(dt);
        if (!bot.rig) bot.group.rotation.x = Math.min(1, bot.deathAnimationTimer / .25) * Math.PI / 2;
        if (bot.deathAnimationTimer >= (bot.rig?.deathDuration || .25)) this.removeBot(bot);
      } else bot.rig?.update(dt, bot.animationState);
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else {
        p.vel.y -= 18.0 * dt; // gravity
        p.mesh.position.addScaledVector(p.vel, dt);
        const scale = p.life / p.maxLife;
        p.mesh.scale.set(scale, scale, scale);
      }
    }
  }
}
