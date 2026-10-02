import * as THREE from 'three';

const ARENA_BOUNDS = { minX: -15.1, maxX: 15.1, minZ: -13.2, maxZ: 17.2 };

export class AgentPassManager {
  constructor(scene) {
    this.scene = scene;
    this.actors = [];
    this.projectiles = [];
    this.enabled = false;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.nextType = 'jett';
    this.difficulty = null;
    this.damageCallback = null;
    this.warningCallback = null;
    this.right = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.tmpDirection = new THREE.Vector3();
    this.tmpPoint = new THREE.Vector3();
    this.tmpRay = new THREE.Ray();
    this.tmpBox = new THREE.Box3();
    this.tmpHit = new THREE.Vector3();
    this.tmpLine = new THREE.Line3();

    this.jettTorso = new THREE.CapsuleGeometry(0.2, 0.42, 3, 8);
    this.neonTorso = new THREE.CapsuleGeometry(0.18, 0.42, 3, 8);
    this.head = new THREE.SphereGeometry(0.17, 14, 10);
    this.hairCap = new THREE.SphereGeometry(0.18, 12, 8);
    this.arm = new THREE.CapsuleGeometry(0.065, 0.31, 3, 6);
    this.leg = new THREE.CapsuleGeometry(0.085, 0.42, 3, 6);
    this.hairSpike = new THREE.ConeGeometry(0.08, 0.31, 7);
    this.accentGeometry = new THREE.BoxGeometry(0.11, 0.39, 0.045);
    this.weaponGlow = new THREE.SphereGeometry(0.09, 10, 8);
    this.knifeBlade = new THREE.ConeGeometry(0.065, 0.34, 5);
    this.knifeHandle = new THREE.CylinderGeometry(0.035, 0.045, 0.19, 6);
    this.energyBolt = new THREE.OctahedronGeometry(0.15, 0);
    this.boltShell = new THREE.SphereGeometry(0.23, 10, 8);

    this.jettSuitMaterial = new THREE.MeshStandardMaterial({
      color: 0xdde8f2, metalness: 0.36, roughness: 0.5
    });
    this.jettDarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x253747, metalness: 0.45, roughness: 0.52
    });
    this.jettHairMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8c5d1, metalness: 0.05, roughness: 0.88
    });
    this.jettAccentMaterial = new THREE.MeshBasicMaterial({ color: 0x74e7ec });
    this.neonSuitMaterial = new THREE.MeshStandardMaterial({
      color: 0x10243b, metalness: 0.35, roughness: 0.48
    });
    this.neonHairMaterial = new THREE.MeshStandardMaterial({
      color: 0x167ee9, metalness: 0.2, roughness: 0.4,
      emissive: 0x063d9c, emissiveIntensity: 0.45
    });
    this.neonAccentMaterial = new THREE.MeshBasicMaterial({ color: 0x32e9ff });
    this.skinMaterial = new THREE.MeshStandardMaterial({ color: 0xb78367, roughness: 0.8 });
    this.jettWeaponMaterial = new THREE.MeshBasicMaterial({ color: 0xf4fdff });
    this.neonWeaponMaterial = new THREE.MeshBasicMaterial({ color: 0x41eaff });
    this.jettWarningMaterial = new THREE.LineBasicMaterial({
      color: 0xc8faff, transparent: true, opacity: 0.88, depthWrite: false
    });
    this.neonWarningMaterial = new THREE.LineBasicMaterial({
      color: 0x42dcff, transparent: true, opacity: 0.88, depthWrite: false
    });
    this.jettTrailMaterial = new THREE.LineBasicMaterial({
      color: 0x94f4ff, transparent: true, opacity: 0.45, depthWrite: false
    });
    this.neonTrailMaterial = new THREE.LineBasicMaterial({
      color: 0x00d9ff, transparent: true, opacity: 0.62, depthWrite: false
    });
    this.knifeMaterial = new THREE.MeshBasicMaterial({ color: 0xedffff });
    this.knifeHiltMaterial = new THREE.MeshStandardMaterial({ color: 0x567681, metalness: 0.8, roughness: 0.3 });
    this.boltMaterial = new THREE.MeshBasicMaterial({ color: 0x39e7ff });
    this.boltShellMaterial = new THREE.MeshBasicMaterial({
      color: 0x14caff, transparent: true, opacity: 0.32, depthWrite: false
    });
    this.projectileTrailMaterial = new THREE.LineBasicMaterial({
      color: 0x8ceeff, transparent: true, opacity: 0.76, depthWrite: false
    });
  }

  start(player, difficulty) {
    this.clearAll();
    this.enabled = true;
    this.elapsed = 0;
    this.difficulty = difficulty;
    this.right.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw).normalize();
    const forward = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    this.center.copy(player.position).setY(0).addScaledVector(forward, 11.5);
    this.nextType = Math.random() < 0.5 ? 'jett' : 'neon';
    this.spawnActor();
    this.spawnTimer = 1.2;
  }

  clearAll() {
    this.enabled = false;
    for (const actor of this.actors) this.removeActorVisuals(actor);
    for (const projectile of this.projectiles) this.removeProjectileVisuals(projectile);
    this.actors.length = 0;
    this.projectiles.length = 0;
  }

  distanceToBoundary(point, direction) {
    let distance = Infinity;
    if (direction.x > 1e-5) distance = Math.min(distance, (ARENA_BOUNDS.maxX - point.x) / direction.x);
    else if (direction.x < -1e-5) distance = Math.min(distance, (ARENA_BOUNDS.minX - point.x) / direction.x);
    if (direction.z > 1e-5) distance = Math.min(distance, (ARENA_BOUNDS.maxZ - point.z) / direction.z);
    else if (direction.z < -1e-5) distance = Math.min(distance, (ARENA_BOUNDS.minZ - point.z) / direction.z);
    return Math.max(0, distance - 0.8);
  }

  createLine(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    this.scene.add(line);
    return line;
  }

  createAgentModel(type) {
    const group = new THREE.Group();
    const mesh = (geometry, material, position, rotation) => {
      const item = new THREE.Mesh(geometry, material);
      item.position.copy(position);
      if (rotation) item.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
      group.add(item);
      return item;
    };
    const part = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) =>
      mesh(geometry, material, new THREE.Vector3(x, y, z), { x: rx, y: ry, z: rz });

    let head;
    let glow;
    if (type === 'jett') {
      part(this.jettTorso, this.jettSuitMaterial, 0, 0.97, 0);
      part(this.head, this.skinMaterial, 0, 1.49, 0.04);
      part(this.hairCap, this.jettHairMaterial, 0, 1.63, -0.015);
      part(this.hairSpike, this.jettHairMaterial, -0.1, 1.79, 0.02, 0, 0, 0.18);
      part(this.hairSpike, this.jettHairMaterial, 0.07, 1.76, -0.07, 0, 0, -0.25);
      part(this.accentGeometry, this.jettDarkMaterial, 0, 1.0, 0.205);
      for (const side of [-1, 1]) {
        part(this.arm, this.jettSuitMaterial, side * 0.28, 1.03, 0.04, 0, 0, side * -0.36);
        part(this.leg, this.jettDarkMaterial, side * 0.12, 0.4, 0, 0, 0, side * 0.08);
        part(this.weaponGlow, this.jettAccentMaterial, side * 0.39, 0.82, 0.19);
      }
      head = new THREE.Vector3(0, 1.5, 0.04);
      glow = group.children[group.children.length - 1];
    } else {
      part(this.neonTorso, this.neonSuitMaterial, 0, 0.61, -0.02, 0, 0, Math.PI / 2);
      part(this.head, this.skinMaterial, 0, 0.85, 0.32);
      part(this.hairCap, this.neonHairMaterial, 0, 0.98, 0.32);
      part(this.hairSpike, this.neonHairMaterial, -0.1, 1.13, 0.32, 0, 0, 0.17);
      part(this.hairSpike, this.neonHairMaterial, 0.04, 1.12, 0.39, 0, 0, -0.16);
      part(this.accentGeometry, this.neonAccentMaterial, 0, 0.65, 0.17, 0, 0, Math.PI / 2);
      for (const side of [-1, 1]) {
        part(this.arm, this.neonSuitMaterial, side * 0.18, 0.63, 0.29, Math.PI / 2, 0, side * 0.24);
        part(this.leg, this.neonSuitMaterial, side * 0.44, 0.26, -0.11, 0, 0, Math.PI / 2);
        part(this.weaponGlow, this.neonAccentMaterial, side * 0.24, 0.65, 0.42);
      }
      head = new THREE.Vector3(0, 0.86, 0.32);
      glow = group.children[group.children.length - 1];
    }

    this.scene.add(group);
    return { group, head, glow };
  }

  spawnActor() {
    if (!this.enabled) return false;
    const type = this.nextType;
    this.nextType = type === 'jett' ? 'neon' : 'jett';
    const positiveReach = this.distanceToBoundary(this.center, this.right);
    const negativeReach = this.distanceToBoundary(this.center, this.right.clone().negate());
    if (positiveReach < 4 || negativeReach < 4) return false;

    const directionSign = Math.random() < 0.5 ? -1 : 1;
    const rootY = type === 'jett' ? 2.05 : 0.08;
    const startDistance = directionSign > 0 ? negativeReach : positiveReach;
    const endDistance = directionSign > 0 ? positiveReach : negativeReach;
    const travelDirection = this.right.clone().multiplyScalar(directionSign);
    const start = this.center.clone().addScaledVector(travelDirection, -startDistance);
    const end = this.center.clone().addScaledVector(travelDirection, endDistance);
    start.y = rootY;
    end.y = rootY;

    const visual = this.createAgentModel(type);
    visual.group.position.copy(start);
    const actor = {
      ...visual,
      type,
      label: type === 'jett' ? 'JETT' : 'NEON',
      isDead: false,
      health: type === 'jett' ? 85 : 100,
      maxHealth: type === 'jett' ? 85 : 100,
      radius: type === 'jett' ? 0.48 : 0.54,
      headHeight: visual.head.y,
      baseY: rootY,
      start,
      end,
      travelDirection,
      pathLength: start.distanceTo(end),
      progress: 0,
      speed: (type === 'jett' ? 8.7 : 10.0) * (this.difficulty?.speed ?? 1),
      age: Math.random() * Math.PI * 2,
      attackTimer: 0.55 + Math.random() * 0.42,
      charging: false,
      chargeLeft: 0,
      aimPoint: new THREE.Vector3(),
      attacked: false,
      warning: this.createLine(type === 'jett' ? this.jettWarningMaterial : this.neonWarningMaterial),
      trail: this.createLine(type === 'jett' ? this.jettTrailMaterial : this.neonTrailMaterial)
    };
    actor.glow = visual.glow;
    actor.trail.visible = true;
    this.actors.push(actor);
    return true;
  }

  updateLine(line, start, end) {
    const position = line.geometry.attributes.position;
    position.setXYZ(0, start.x, start.y, start.z);
    position.setXYZ(1, end.x, end.y, end.z);
    position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  update(dt, player, difficulty, colliders, onDamage, onWarning) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.difficulty = difficulty;
    this.damageCallback = onDamage;
    this.warningCallback = onWarning;
    this.actors = this.actors.filter(actor => !actor.isDead);

    const maxActors = difficulty.extraTargets < 0 ? 2 : (difficulty.extraTargets > 0 ? 4 : 3);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.actors.length < maxActors) {
      this.spawnActor();
      this.spawnTimer = (2.0 + Math.random() * 0.45) * difficulty.botFireRate;
    }

    for (const actor of [...this.actors]) {
      if (!this.enabled) return;
      this.updateActor(actor, dt, player, difficulty);
    }
    this.updateProjectiles(dt, player, colliders);
  }

  updateActor(actor, dt, player, difficulty) {
    actor.age += dt;
    actor.progress += (actor.speed * dt) / actor.pathLength;
    if (actor.progress >= 1) {
      actor.isDead = true;
      this.removeActorVisuals(actor);
      this.spawnTimer = Math.min(this.spawnTimer, 0.5);
      return;
    }

    actor.group.position.lerpVectors(actor.start, actor.end, actor.progress);
    if (actor.type === 'jett') {
      actor.group.position.y = actor.baseY + Math.sin(actor.progress * Math.PI * 2 + actor.age * 2.8) * 0.38;
      actor.group.rotation.z = Math.sin(actor.age * 3.2) * 0.045;
    } else {
      actor.group.position.y = actor.baseY + Math.sin(actor.age * 7) * 0.035;
      actor.group.rotation.z = Math.sin(actor.age * 5.8) * 0.025;
    }

    const face = this.tmpDirection.subVectors(player.position, actor.group.position);
    actor.group.rotation.y = Math.atan2(face.x, face.z);
    const trailEnd = actor.group.position.clone().addScaledVector(actor.travelDirection, -1.15);
    trailEnd.y += actor.type === 'jett' ? 0.12 : 0.03;
    this.updateLine(actor.trail, trailEnd, actor.group.position);

    if (actor.charging) {
      actor.chargeLeft -= dt;
      actor.glow.scale.setScalar(1.4 + Math.sin(this.elapsed * 25) * 0.35);
      const muzzle = actor.group.localToWorld(new THREE.Vector3(0, actor.type === 'jett' ? 0.84 : 0.68, 0.38));
      this.updateLine(actor.warning, muzzle, actor.aimPoint);
      if (actor.chargeLeft <= 0) {
        this.launchVolley(actor, difficulty);
        actor.charging = false;
        actor.attacked = true;
        actor.warning.visible = false;
        actor.glow.scale.setScalar(1);
      }
      return;
    }

    if (!actor.attacked) {
      actor.attackTimer -= dt;
      if (actor.attackTimer <= 0) {
        actor.charging = true;
        const baseWindup = actor.type === 'jett' ? 0.62 : 0.5;
        actor.chargeLeft = THREE.MathUtils.clamp(baseWindup * difficulty.reaction, 0.34, 0.9);
        actor.aimPoint.copy(player.position).addScaledVector(player.velocity, 0.14);
        actor.warning.visible = true;
        if (this.warningCallback) this.warningCallback(actor.label);
      }
    }
  }

  launchVolley(actor, difficulty) {
    const target = actor.aimPoint;
    const baseDirection = new THREE.Vector3().subVectors(target, actor.group.position).normalize();
    if (actor.type === 'jett') {
      for (const spread of [-0.075, 0, 0.075]) {
        const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        this.createProjectile(actor, target, direction, difficulty, 'knife');
      }
    } else {
      for (const spread of [-0.13, -0.065, 0, 0.065, 0.13]) {
        const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
        this.createProjectile(actor, target, direction, difficulty, 'bolt');
      }
    }
  }

  createProjectile(actor, target, direction, difficulty, projectileType) {
    const group = new THREE.Group();
    if (projectileType === 'knife') {
      const blade = new THREE.Mesh(this.knifeBlade, this.knifeMaterial);
      blade.position.y = 0.12;
      const handle = new THREE.Mesh(this.knifeHandle, this.knifeHiltMaterial);
      handle.position.y = -0.12;
      group.add(blade, handle);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    } else {
      group.add(
        new THREE.Mesh(this.energyBolt, this.boltMaterial),
        new THREE.Mesh(this.boltShell, this.boltShellMaterial)
      );
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    const muzzle = actor.group.localToWorld(new THREE.Vector3(0, actor.type === 'jett' ? 0.84 : 0.68, 0.38));
    group.position.copy(muzzle);
    this.scene.add(group);

    const trail = this.createLine(this.projectileTrailMaterial);
    trail.visible = true;
    const velocity = direction.clone().multiplyScalar((actor.type === 'jett' ? 20 : 21) * difficulty.speed);
    this.projectiles.push({
      group,
      trail,
      velocity,
      spinAxis: direction.clone(),
      spinQuaternion: new THREE.Quaternion(),
      radius: projectileType === 'knife' ? 0.12 : 0.18,
      age: 0,
      damage: Math.round(8 * difficulty.botDamage)
    });
  }

  updateProjectiles(dt, player, colliders) {
    for (const projectile of [...this.projectiles]) {
      if (!this.enabled) return;
      const start = projectile.group.position.clone();
      const end = start.clone().addScaledVector(projectile.velocity, dt);
      const segment = this.tmpLine.set(start, end);
      projectile.age += dt;
      projectile.group.position.copy(end);
      projectile.group.quaternion.premultiply(
        projectile.spinQuaternion.setFromAxisAngle(projectile.spinAxis, dt * 13)
      );
      this.updateLine(projectile.trail, end.clone().addScaledVector(projectile.velocity, -0.065), end);

      const closestPoint = segment.closestPointToPoint(player.position, true, this.tmpPoint);
      if (closestPoint.distanceToSquared(player.position) < (0.62 + projectile.radius) ** 2) {
        this.removeProjectile(projectile);
        if (this.damageCallback) this.damageCallback(projectile.damage);
        if (!this.enabled) return;
        continue;
      }
      if (this.projectileHitWall(start, end, projectile.radius, colliders) || projectile.age > 3.5) {
        this.removeProjectile(projectile);
      }
    }
  }

  projectileHitWall(start, end, radius, colliders) {
    const delta = this.tmpDirection.subVectors(end, start);
    const length = delta.length();
    if (length <= 0) return false;
    this.tmpRay.set(start, delta.multiplyScalar(1 / length));
    for (const collider of colliders) {
      this.tmpBox.min.copy(collider.min).addScalar(-radius);
      this.tmpBox.max.copy(collider.max).addScalar(radius);
      const hit = this.tmpRay.intersectBox(this.tmpBox, this.tmpHit);
      if (hit && start.distanceToSquared(hit) <= length * length) return true;
    }
    return false;
  }

  raycastBullet(origin, direction, maxRange) {
    const rayDirection = direction.clone().normalize();
    let closest = null;
    for (const actor of this.actors) {
      if (actor.isDead) continue;
      const center = actor.group.position.clone().add(new THREE.Vector3(0, actor.headHeight * 0.55, 0));
      const toActor = this.tmpPoint.subVectors(center, origin);
      const distance = toActor.dot(rayDirection);
      if (distance < 0 || distance > maxRange) continue;
      const point = this.tmpPoint.copy(origin).addScaledVector(rayDirection, distance);
      if (point.distanceToSquared(center) > actor.radius * actor.radius) continue;
      if (closest && distance >= closest.distance) continue;
      const headPosition = actor.group.localToWorld(actor.head.clone());
      closest = {
        bot: actor,
        point: point.clone(),
        distance,
        zone: point.distanceTo(headPosition) <= 0.19 ? 'head' : 'body'
      };
    }
    return closest;
  }

  applyHit(actor, zone, damage) {
    if (!actor || actor.isDead) return null;
    const isHeadshot = zone === 'head';
    actor.health -= Math.max(0, damage || 0) * (isHeadshot ? 2 : 1);
    if (actor.health > 0) return { isKilled: false, isHeadshot };
    actor.isDead = true;
    this.removeActorVisuals(actor);
    this.spawnTimer = Math.min(this.spawnTimer, 0.55);
    return { isKilled: true, isHeadshot };
  }

  removeActorVisuals(actor) {
    if (actor.visualsRemoved) return;
    actor.visualsRemoved = true;
    this.scene.remove(actor.group, actor.warning, actor.trail);
    actor.warning.geometry.dispose();
    actor.trail.geometry.dispose();
  }

  removeProjectile(projectile) {
    this.projectiles = this.projectiles.filter(item => item !== projectile);
    this.removeProjectileVisuals(projectile);
  }

  removeProjectileVisuals(projectile) {
    if (projectile.visualsRemoved) return;
    projectile.visualsRemoved = true;
    this.scene.remove(projectile.group, projectile.trail);
    projectile.trail.geometry.dispose();
  }
}
