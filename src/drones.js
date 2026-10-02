import * as THREE from 'three';

const SPAWN_HALF_ANGLE = Math.PI / 4;
const DRONE_RADIUS = 0.82;
const DRONE_SCALE = 0.45;
const FIRST_SHOT_DELAY_MIN = 0.12;
const FIRST_SHOT_DELAY_MAX = 0.32;

export class DroneManager {
  constructor(scene) {
    this.scene = scene;
    this.drones = [];
    this.projectiles = [];
    this.enabled = false;
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.difficulty = null;
    this.damageCallback = null;
    this.warningCallback = null;
    this.tmpDirection = new THREE.Vector3();
    this.tmpPoint = new THREE.Vector3();
    this.tmpRay = new THREE.Ray();
    this.tmpBox = new THREE.Box3();
    this.tmpHit = new THREE.Vector3();
    this.tmpLine = new THREE.Line3();

    this.bodyGeometry = new THREE.IcosahedronGeometry(0.43, 1);
    this.eyeGeometry = new THREE.SphereGeometry(0.15, 16, 12);
    this.armGeometry = new THREE.BoxGeometry(0.72, 0.09, 0.11);
    this.rotorGeometry = new THREE.TorusGeometry(0.22, 0.035, 8, 20);
    this.projectileGeometry = new THREE.SphereGeometry(0.2, 12, 10);
    this.projectileShellGeometry = new THREE.SphereGeometry(0.31, 12, 10);
    this.projectileRingGeometry = new THREE.TorusGeometry(0.28, 0.025, 6, 16);

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x252a34,
      metalness: 0.88,
      roughness: 0.28,
      emissive: 0x421116,
      emissiveIntensity: 0.85
    });
    this.armMaterial = new THREE.MeshStandardMaterial({
      color: 0x69717d,
      metalness: 0.9,
      roughness: 0.32
    });
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff4c58 });
    this.rotorMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5360,
      transparent: true,
      opacity: 0.82
    });
    this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff364d });
    this.projectileShellMaterial = new THREE.MeshBasicMaterial({
      color: 0xff263f,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    this.projectileRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9a5d,
      transparent: true,
      opacity: 0.9
    });
    this.warningMaterial = new THREE.LineBasicMaterial({
      color: 0xff5a48,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: 0xff573d,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
  }

  start(player, difficulty, colliders = []) {
    this.clearAll();
    this.enabled = true;
    this.elapsed = 0;
    this.difficulty = difficulty;
    this.spawnTimer = 1.5;
    this.spawnDrone(player, colliders);
  }

  clearAll() {
    this.enabled = false;
    for (const drone of this.drones) this.removeDroneVisuals(drone);
    for (const projectile of this.projectiles) this.removeProjectileVisuals(projectile);
    this.drones.length = 0;
    this.projectiles.length = 0;
  }

  createDroneVisuals() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    body.castShadow = true;
    group.add(body);

    for (const angle of [0, Math.PI / 2]) {
      const arm = new THREE.Mesh(this.armGeometry, this.armMaterial);
      arm.rotation.y = angle;
      group.add(arm);
    }

    const rotors = [];
    for (const x of [-0.7, 0.7]) {
      for (const z of [-0.47, 0.47]) {
        const rotor = new THREE.Mesh(this.rotorGeometry, this.rotorMaterial);
        rotor.position.set(x, 0, z);
        rotor.rotation.x = Math.PI / 2;
        group.add(rotor);
        rotors.push(rotor);
      }
    }

    const eye = new THREE.Mesh(this.eyeGeometry, this.eyeMaterial);
    eye.position.set(0, 0.02, 0.48);
    group.add(eye);

    const warningGeometry = new THREE.BufferGeometry();
    warningGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const warning = new THREE.Line(warningGeometry, this.warningMaterial);
    warning.frustumCulled = false;
    warning.visible = false;
    this.scene.add(warning);

    return { group, rotors, eye, warning };
  }

  spawnDrone(player, colliders) {
    if (!this.enabled) return false;
    const forward = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw)
      .normalize();
    const position = new THREE.Vector3();
    let found = false;

    // Every candidate is sampled inside a 90-degree horizontal cone.
    for (let i = 0; i < 100; i++) {
      const angle = (Math.random() * 2 - 1) * SPAWN_HALF_ANGLE;
      const distance = 8.8 + Math.random() * 4.0;
      const direction = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      position.copy(player.position).addScaledVector(direction, distance);
      position.y = THREE.MathUtils.clamp(
        player.position.y + 0.3 + Math.random() * 3.2,
        2.7,
        12.8
      );

      if (position.x < -15.8 || position.x > 15.8 ||
          position.z < -13.8 || position.z > 17.8) continue;
      if (colliders.some(collider => this.pointOverlapsCollider(position, collider, 0.85))) continue;
      found = true;
      break;
    }

    if (!found) return false;

    const visual = this.createDroneVisuals();
    visual.group.position.copy(position);
    this.scene.add(visual.group);

    const difficultySpeed = this.difficulty?.speed ?? 1;
    const moveDirection = this.randomMoveDirection();
    const velocity = moveDirection.multiplyScalar((2.7 + Math.random() * 1.0) * difficultySpeed);
    visual.group.scale.setScalar(DRONE_SCALE);
    const drone = {
      ...visual,
      type: 'drone',
      isDead: false,
      health: 100,
      maxHealth: 100,
      velocity,
      desiredVelocity: velocity.clone(),
      directionTimer: 0.35 + Math.random() * 0.65,
      fireCooldown: FIRST_SHOT_DELAY_MIN +
        Math.random() * (FIRST_SHOT_DELAY_MAX - FIRST_SHOT_DELAY_MIN),
      charging: false,
      chargeLeft: 0,
      chargeDuration: 0,
      aimPoint: new THREE.Vector3(),
      createdAt: this.elapsed
    };
    this.drones.push(drone);
    return true;
  }

  pointOverlapsCollider(point, collider, padding) {
    return point.x > collider.min.x - padding && point.x < collider.max.x + padding &&
      point.y > collider.min.y - padding && point.y < collider.max.y + padding &&
      point.z > collider.min.z - padding && point.z < collider.max.z + padding;
  }

  randomMoveDirection() {
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.5 - 0.75,
      Math.random() * 2 - 1
    );
    if (direction.lengthSq() < 0.01) direction.set(1, 0.2, 0);
    return direction.normalize();
  }

  update(dt, player, difficulty, colliders, onDamage, onWarning) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.difficulty = difficulty;
    this.damageCallback = onDamage;
    this.warningCallback = onWarning;

    this.drones = this.drones.filter(drone => !drone.isDead);
    const maxDrones = difficulty.extraTargets < 0 ? 2 : (difficulty.extraTargets > 0 ? 4 : 3);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.drones.length < maxDrones) {
      this.spawnDrone(player, colliders);
      this.spawnTimer = 2.9 * (difficulty.botFireRate ?? 1) + Math.random() * 0.9;
    }

    const forward = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    for (const drone of [...this.drones]) {
      if (!this.enabled) return;
      this.updateDrone(drone, dt, player, difficulty, forward);
    }
    this.updateProjectiles(dt, player, colliders, difficulty);
  }

  updateDrone(drone, dt, player, difficulty, playerForward) {
    const position = drone.group.position;
    drone.directionTimer -= dt;
    if (drone.directionTimer <= 0) {
      const speed = (2.7 + Math.random() * 1.0) * difficulty.speed;
      drone.desiredVelocity.copy(this.randomMoveDirection()).multiplyScalar(speed);
      drone.directionTimer = 0.4 + Math.random() * 0.75;
    }
    drone.velocity.lerp(drone.desiredVelocity, 1 - Math.exp(-dt * 3.5));

    // Keep enemies inside the arena while allowing lateral, vertical and depth strafes.
    const toPlayer = this.tmpDirection.subVectors(player.position, position);
    const distance = toPlayer.length();
    if (distance < 6.4) drone.velocity.addScaledVector(toPlayer.normalize(), -3.2 * dt);
    else if (distance > 15.2) drone.velocity.addScaledVector(toPlayer.normalize(), 2.4 * dt);

    position.addScaledVector(drone.velocity, dt);
    if (position.x < -15.2 || position.x > 15.2) {
      position.x = THREE.MathUtils.clamp(position.x, -15.2, 15.2);
      drone.velocity.x *= -1;
      drone.desiredVelocity.x *= -1;
    }
    if (position.y < 2.6 || position.y > 13.2) {
      position.y = THREE.MathUtils.clamp(position.y, 2.6, 13.2);
      drone.velocity.y *= -1;
      drone.desiredVelocity.y *= -1;
    }
    if (position.z < -13.2 || position.z > 17.2) {
      position.z = THREE.MathUtils.clamp(position.z, -13.2, 17.2);
      drone.velocity.z *= -1;
      drone.desiredVelocity.z *= -1;
    }

    drone.group.lookAt(player.position);
    for (let i = 0; i < drone.rotors.length; i++) {
      drone.rotors[i].rotation.z += dt * (i % 2 ? -28 : 28);
    }

    if (drone.charging) {
      drone.chargeLeft -= dt;
      const pulse = 1 + Math.sin(this.elapsed * 22) * 0.22;
      drone.eye.scale.setScalar(pulse);
      this.updateWarningLine(drone, drone.aimPoint);
      if (drone.chargeLeft <= 0) {
        this.launchProjectile(drone, difficulty);
        drone.charging = false;
        drone.warning.visible = false;
        drone.eye.scale.setScalar(1);
        drone.fireCooldown = (1.55 + Math.random() * 0.6) * difficulty.botFireRate;
      }
      return;
    }

    drone.eye.scale.setScalar(1);
    drone.fireCooldown -= dt;
    if (drone.fireCooldown <= 0) {
      drone.charging = true;
      drone.chargeDuration = THREE.MathUtils.clamp(0.76 * difficulty.reaction * 0.72, 0.36, 0.85);
      drone.chargeLeft = drone.chargeDuration;
      drone.aimPoint.copy(player.position).addScaledVector(player.velocity, 0.12);
      if (this.warningCallback) this.warningCallback();
      this.updateWarningLine(drone, drone.aimPoint);
    }
  }

  updateWarningLine(drone, target) {
    const attribute = drone.warning.geometry.attributes.position;
    attribute.setXYZ(0, drone.group.position.x, drone.group.position.y, drone.group.position.z);
    attribute.setXYZ(1, target.x, target.y, target.z);
    attribute.needsUpdate = true;
    drone.warning.geometry.computeBoundingSphere();
    drone.warning.visible = true;
  }

  launchProjectile(drone, difficulty) {
    const direction = new THREE.Vector3().subVectors(drone.aimPoint, drone.group.position).normalize();
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
    const shell = new THREE.Mesh(this.projectileShellGeometry, this.projectileShellMaterial);
    const ring = new THREE.Mesh(this.projectileRingGeometry, this.projectileRingMaterial);
    group.add(core, shell, ring);
    group.position.copy(drone.group.position);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    this.scene.add(group);

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const trail = new THREE.Line(trailGeometry, this.trailMaterial);
    trail.frustumCulled = false;
    this.scene.add(trail);

    this.projectiles.push({
      group,
      trail,
      velocity: direction.multiplyScalar(12.0 + difficulty.speed * 7.5),
      radius: 0.2,
      age: 0,
      damage: Math.round(11 * difficulty.botDamage)
    });
  }

  updateProjectiles(dt, player, colliders, difficulty) {
    for (const projectile of [...this.projectiles]) {
      if (!this.enabled) return;
      const start = projectile.group.position.clone();
      const end = start.clone().addScaledVector(projectile.velocity, dt);
      const segment = this.tmpLine.set(start, end);
      projectile.age += dt;
      projectile.group.position.copy(end);
      projectile.group.rotation.z += dt * 8;

      const trailPosition = projectile.trail.geometry.attributes.position;
      const trailStart = end.clone().addScaledVector(projectile.velocity, -0.075);
      trailPosition.setXYZ(0, trailStart.x, trailStart.y, trailStart.z);
      trailPosition.setXYZ(1, end.x, end.y, end.z);
      trailPosition.needsUpdate = true;

      const closestPoint = segment.closestPointToPoint(player.position, true, this.tmpPoint);
      if (closestPoint.distanceToSquared(player.position) < (0.72 + projectile.radius) ** 2) {
        this.removeProjectile(projectile);
        if (this.damageCallback) this.damageCallback(projectile.damage);
        if (!this.enabled) return;
        continue;
      }

      if (this.projectileHitWall(start, end, projectile.radius, colliders) || projectile.age > 4.5) {
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
    for (const drone of this.drones) {
      if (drone.isDead) continue;
      const toDrone = this.tmpPoint.subVectors(drone.group.position, origin);
      const distance = toDrone.dot(rayDirection);
      if (distance < 0 || distance > maxRange) continue;
      const pointOnRay = this.tmpPoint.copy(origin).addScaledVector(rayDirection, distance);
      const radius = DRONE_RADIUS * drone.group.scale.x;
      if (pointOnRay.distanceToSquared(drone.group.position) > radius * radius) continue;
      if (closest && distance >= closest.distance) continue;

      const point = pointOnRay.clone();
      const eyePosition = drone.eye.getWorldPosition(new THREE.Vector3());
      closest = {
        bot: drone,
        point,
        distance,
        zone: point.distanceTo(eyePosition) <= 0.2 ? 'head' : 'body'
      };
    }
    return closest;
  }

  applyHit(drone, zone, damage) {
    if (!drone || drone.isDead) return null;
    const isHeadshot = zone === 'head';
    drone.health -= Math.max(0, damage || 0) * (isHeadshot ? 2 : 1);
    if (drone.health > 0) return { isKilled: false, isHeadshot };

    drone.isDead = true;
    this.removeDroneVisuals(drone);
    this.spawnTimer = Math.min(this.spawnTimer, 0.65);
    return { isKilled: true, isHeadshot };
  }

  removeDroneVisuals(drone) {
    this.scene.remove(drone.group);
    this.scene.remove(drone.warning);
    drone.warning.geometry.dispose();
  }

  removeProjectile(projectile) {
    this.projectiles = this.projectiles.filter(item => item !== projectile);
    this.removeProjectileVisuals(projectile);
  }

  removeProjectileVisuals(projectile) {
    this.scene.remove(projectile.group);
    this.scene.remove(projectile.trail);
    projectile.trail.geometry.dispose();
  }
}
