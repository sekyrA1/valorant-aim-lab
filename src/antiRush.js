import * as THREE from 'three';
import { isBotPlacementClear } from './spawnSafety.js';

export const SITE_BOUNDS = Object.freeze({ minX: -16.6, maxX: 16.6, minZ: -20, maxZ: 14.5 });

// Optional support varies, while Jett's smoke always precedes her dash and the follow-up entry.
export function createRushSequence(difficulty, random = Math.random) {
  const events = [];
  const tempo = difficulty.botFireRate;
  let time = 2.8;
  const add = (type, delay, extra = {}) => {
    time += delay * tempo;
    events.push({ type, at: time, ...extra });
  };
  add('drone', 0);
  const support = random() < .3 ? ['flash', 'recon'] : ['recon', 'flash'];
  for (const type of support) if (random() > .2) add(type, 1.4 + random() * .5);
  add('jettSmoke', 1.1);
  add('dash', .5 + random() * .25);
  const count = difficulty.extraTargets < 0 ? 2 : difficulty.extraTargets > 0 ? 4 : 3;
  const labels = ['SOVA', 'KAY/O', 'OMEN', 'BREACH'];
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  for (let i = 0; i < count; i++) {
    add('entry', .65 + random() * .45, { label: labels[i], lane: (i % 2 ? -1 : 1) });
  }
  return events;
}

// Four-way navigation keeps rushers outside solid cover, including diagonal crate corners.
export function findRushPath(start, target, colliders) {
  const clear = (x, z) => x >= -16 && x <= 16 && z >= -20 && z <= 19 &&
    isBotPlacementClear({ x, y: 0, z }, colliders, .48, 2.25);
  const nearest = point => {
    let best = null;
    let distance = Infinity;
    for (let x = Math.round(point.x) - 3; x <= Math.round(point.x) + 3; x++) {
      for (let z = Math.round(point.z) - 3; z <= Math.round(point.z) + 3; z++) {
        const d = (x - point.x) ** 2 + (z - point.z) ** 2;
        if (d < distance && clear(x, z)) { best = { x, z }; distance = d; }
      }
    }
    return best;
  };
  const first = nearest(start), goal = nearest(target);
  if (!first || !goal) return [];
  const key = p => `${p.x},${p.z}`;
  const queue = [first], visited = new Map([[key(first), null]]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (key(current) === key(goal)) {
      const path = [];
      for (let p = current; p; p = visited.get(key(p))) path.unshift(new THREE.Vector3(p.x, 0, p.z));
      if (path.length > 1 && Math.hypot(start.x - path[0].x, start.z - path[0].z) < .75 &&
          [.25, .5, .75, 1].every(t => clear(
            THREE.MathUtils.lerp(start.x, path[1].x, t), THREE.MathUtils.lerp(start.z, path[1].z, t)
          ))) path.shift();
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, z: current.z + dz };
      if (!visited.has(key(next)) && clear(next.x, next.z) &&
          clear(current.x + dx * .5, current.z + dz * .5)) {
        visited.set(key(next), current);
        queue.push(next);
      }
    }
  }
  return [];
}

export class AntiRushManager {
  constructor(scene, botManager, sound) {
    this.scene = scene;
    this.botManager = botManager;
    this.sound = sound;
    this.enabled = false;
    this.utilities = [];
    this.smokes = [];
    this.enemies = [];
    this.raycaster = new THREE.Raycaster();
    this.callbacks = {};
  }

  start(player, difficulty, colliders, callbacks = {}) {
    this.clearAll();
    this.player = player;
    this.difficulty = difficulty;
    this.colliders = colliders;
    this.callbacks = callbacks;
    this.enabled = true;
    this.elapsed = 0;
    this.wave = 0;
    this.wavesCleared = 0;
    this.utilitiesSpawned = 0;
    this.utilitiesDestroyed = 0;
    this.flashLeft = 0;
    this.revealedLeft = 0;
    this.betweenWaves = 0;
    this.waveActive = false;
    this.launchMoreWaves = true;
    this.beginWave();
  }

  dispose(group) {
    this.scene.remove(group);
    group.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
  }

  clearAll() {
    this.enabled = false;
    for (const utility of this.utilities) this.dispose(utility.group);
    for (const smoke of this.smokes) this.dispose(smoke.group);
    for (const enemy of this.enemies) {
      if (!enemy.bot.isDead && this.botManager.bots.includes(enemy.bot)) this.botManager.removeBot(enemy.bot);
    }
    this.utilities = [];
    this.smokes = [];
    this.enemies = [];
    this.callbacks.onEffects?.({ flash: 0, smoke: 0, revealed: false, active: false });
  }

  prompt(text, state = 'early') { this.callbacks.onPrompt?.({ text, state }); }

  beginWave() {
    this.wave++;
    this.waveActive = true;
    this.waveTime = 0;
    this.waveDestroyed = 0;
    this.waveSpawned = 0;
    this.enemies = [];
    this.events = createRushSequence(this.difficulty);
    this.eventIndex = 0;
    this.jettLanding = new THREE.Vector3((Math.random() < .5 ? -1 : 1) * (1.5 + Math.random()), 0, 5.5 + Math.random());
    this.addSmoke(new THREE.Vector3(0, 2.1, 16), 3.8, Infinity, true);
    this.prompt(`ONDA ${this.wave} • POSICIONE-SE NO A • DESTRUA AS UTILIDADES`, 'waiting');
  }

  addSmoke(center, radius, lifetime, allied = false) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: allied ? 0x8b91a1 : 0xc4d5e4,
      roughness: 1, transparent: true, opacity: .97, depthWrite: false, side: THREE.DoubleSide });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), material);
    group.add(sphere);
    group.position.copy(center);
    this.scene.add(group);
    this.smokes.push({ group, radius, lifetime, age: 0, allied });
  }

  spawnUtility(kind) {
    const group = new THREE.Group();
    const color = kind === 'flash' ? 0xffd77a : 0x60dcff;
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: .6, roughness: .3 });
    const part = (geometry, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    if (kind === 'drone') {
      part(new THREE.IcosahedronGeometry(.28, 1));
      part(new THREE.BoxGeometry(1.4, .08, .16));
      for (const side of [-1, 1]) {
        const rotor = part(new THREE.TorusGeometry(.26, .045, 8, 20), side * .62);
        rotor.rotation.x = Math.PI / 2;
      }
      part(new THREE.SphereGeometry(.12, 12, 8), 0, -.04, -.25);
    } else {
      part(kind === 'flash' ? new THREE.SphereGeometry(.2, 16, 12) : new THREE.OctahedronGeometry(.22));
      part(new THREE.TorusGeometry(.3, .035, 6, 24));
    }
    material.dispose();
    group.position.set((Math.random() - .5) * 2, 2.3, 19);
    if (kind === 'recon') group.position.x = 0;
    this.scene.add(group);
    const target = kind === 'recon' ? new THREE.Vector3((Math.random() < .5 ? -1 : 1) * 16.8, 4.7, 0) :
      kind === 'flash' ? new THREE.Vector3((Math.random() - .5) * 5, 3.2, 9) : new THREE.Vector3(0, 2.2, 1);
    const utility = { type: 'rush_utility', kind, label: kind === 'drone' ? 'DRONE' : kind === 'recon' ? 'RECON' : 'FLASH',
      group, isDead: false, age: 0, origin: group.position.clone(), target, scanTimer: 0, scanned: false };
    this.utilities.push(utility);
    this.utilitiesSpawned++;
    this.waveSpawned++;
    this.prompt(`${utility.label} NO A MAIN • DESTRUA ANTES DE ATIVAR`);
  }

  spawnEnemy(label, lane = 1, dash = false) {
    const x = (Math.random() - .5) * 2.5;
    const bot = this.botManager.spawnTacticalBot(x, 0, 18.7, Math.PI, false);
    bot.group.scale.setScalar(this.difficulty.botScale);
    bot.label = label;
    bot.isAntiRush = true;
    if (label === 'JETT') {
      bot.torsoMesh.material = bot.torsoMesh.material.clone();
      bot.headMesh.material = bot.headMesh.material.clone();
      bot.torsoMesh.material.color.set(0x4dcedd);
      bot.headMesh.material.color.set(0xf2d5c6);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(.19, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf0f6ff }));
      hair.scale.set(1, .55, 1);
      hair.position.set(0, 1.75, -.025);
      bot.group.add(hair);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(.105, 10, 8), hair.material.clone());
      bun.position.set(0, 1.88, -.08);
      bot.group.add(bun);
    }
    this.enemies.push({ bot, phase: dash ? 'dash' : 'entry', path: [], pathTimer: 0, fireTimer: .7,
      destination: this.jettLanding.clone(),
      exitDestination: new THREE.Vector3(lane * (4 + Math.random() * 3), 0, 1),
      holdTimer: .4 + Math.random() * .4, gait: 0, reaction: 0 });
    this.prompt(dash ? 'JETT DANDO DASH • ELA VAI TE CAÇAR' : `${label} SAINDO DA SMOKE • SEGURE O SITE`);
  }

  execute(event) {
    if (['drone', 'recon', 'flash'].includes(event.type)) this.spawnUtility(event.type);
    else if (event.type === 'jettSmoke') {
      this.addSmoke(this.jettLanding.clone().add(new THREE.Vector3(0, 1.7, 0)), 2.6, 6.5);
      this.prompt('SMOKE DA JETT NO SITE • PREPARE O TRACKING');
    } else if (event.type === 'dash') {
      this.sound.playKnifeSlash?.();
      this.spawnEnemy('JETT', 1, true);
    }
    else if (event.type === 'entry') this.spawnEnemy(event.label, event.lane);
  }

  smokeBlocks(start, end) {
    const segment = new THREE.Line3(start, end);
    const point = new THREE.Vector3();
    return this.smokes.some(smoke => segment.closestPointToPoint(smoke.group.position, true, point)
      .distanceToSquared(smoke.group.position) < smoke.radius ** 2);
  }

  canSee(start, end, ignoreSmoke = false) {
    return this.botManager.hasLineOfSight(start, end, this.colliders) &&
      (ignoreSmoke || !this.smokeBlocks(start, end));
  }

  reveal(duration) {
    this.revealedLeft = Math.max(this.revealedLeft, duration);
    this.prompt('REVELADO • QUEBRE O SCAN E MUDE DE COBERTURA');
  }

  updateUtility(utility, dt) {
    utility.age += dt;
    const p = utility.group.position;
    if (utility.kind === 'drone') {
      const progress = Math.min(1, utility.age * (3.8 * this.difficulty.speed) / 18);
      p.lerpVectors(utility.origin, utility.target, progress);
      p.x += Math.sin(utility.age * 2.1) * .6;
      p.y += Math.sin(utility.age * 3) * .2;
      utility.group.rotation.z = Math.sin(utility.age * 2) * .1;
      for (const rotor of utility.group.children.slice(2, 4)) rotor.rotation.z += dt * 20;
      if (!utility.scanned && this.canSee(p, this.player.position) && p.distanceTo(this.player.position) < 22) {
        utility.scanTimer += dt;
        if (utility.scanTimer > .8 * this.difficulty.reaction) { utility.scanned = true; this.reveal(2.5); }
      }
      if (utility.age > 7.5) this.expireUtility(utility);
    } else {
      const flight = Math.min(1, utility.age / (utility.kind === 'flash' ? 1.3 : 1.1));
      p.lerpVectors(utility.origin, utility.target, flight);
      p.y += Math.sin(flight * Math.PI) * 1.2;
      if (utility.kind === 'flash' && flight >= 1) {
        if (this.canSee(p, this.player.position)) {
          const toFlash = p.clone().sub(this.player.position).normalize();
          const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'));
          this.flashLeft = toFlash.dot(forward) > .25 ? 1.1 * this.difficulty.botDamage : .12;
          this.prompt('FLASH ATIVADA • VIRE O ROSTO OU DESTRUA ANTES');
        }
        this.expireUtility(utility);
      } else if (utility.kind === 'recon' && flight >= 1) {
        const scan = Math.floor((utility.age - 1.1) / 1.3);
        const ring = utility.group.children[1];
        ring.scale.setScalar(1 + ((utility.age - 1.1) % 1.3) * 5);
        if (scan > utility.scanTimer) {
          utility.scanTimer = scan;
          if (this.canSee(p, this.player.position, true)) this.reveal(1.5);
        }
        if (utility.age > 5.4) this.expireUtility(utility);
      }
    }
  }

  expireUtility(utility) {
    if (utility.isDead) return;
    utility.isDead = true;
    this.dispose(utility.group);
    this.utilities = this.utilities.filter(item => item !== utility);
  }

  raycastBullet(origin, direction, range) {
    if (!this.enabled) return null;
    this.raycaster.set(origin, direction);
    this.raycaster.far = range;
    let closest = null;
    for (const utility of this.utilities) {
      utility.group.updateMatrixWorld(true);
      // Recon scan rings are cosmetic; only the dart itself is destructible.
      const meshes = utility.kind === 'recon' ? [utility.group.children[0]] : utility.group.children;
      const hit = this.raycaster.intersectObjects(meshes, false)[0];
      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = { bot: utility, zone: 'body', point: hit.point.clone(), distance: hit.distance };
      }
    }
    return closest;
  }

  applyUtilityHit(utility) {
    if (utility.isDead || !this.utilities.includes(utility)) return null;
    this.utilitiesDestroyed++;
    this.waveDestroyed++;
    this.expireUtility(utility);
    this.sound.playTargetPop();
    this.prompt(`${utility.label} DESTRUÍDO • UTILIDADE NEGADA`, 'success');
    return { isKilled: true, isHeadshot: false };
  }

  updateEnemy(enemy, dt) {
    const bot = enemy.bot;
    if (bot.isDead) return;
    const p = bot.group.position;
    if (enemy.phase === 'dash') {
      const direction = enemy.destination.clone().sub(p); direction.y = 0;
      const distance = direction.length();
      const step = Math.min(distance, dt * 24 * this.difficulty.speed);
      if (distance > .01) p.addScaledVector(direction.normalize(), step);
      if (distance <= step + .1) enemy.phase = 'smokeHold';
      bot.torsoMesh.rotation.x = -.4;
      bot.group.rotation.y = Math.atan2(direction.x, direction.z);
      return;
    }
    bot.torsoMesh.rotation.x = 0;
    if (enemy.phase === 'smokeHold') {
      enemy.holdTimer -= dt;
      if (enemy.holdTimer <= 0) enemy.phase = 'hunt';
      return;
    }
    const target = enemy.phase === 'entry' ? enemy.destination :
      enemy.phase === 'exit' ? enemy.exitDestination : this.player.position;
    enemy.pathTimer -= dt;
    if (enemy.pathTimer <= 0) {
      enemy.path = findRushPath(p, target, this.colliders);
      enemy.pathTimer = .8;
    }
    if (enemy.path.length) {
      const point = enemy.path[0];
      const delta = point.clone().sub(p); delta.y = 0;
      const distance = delta.length();
      if (distance < .15) enemy.path.shift();
      else {
        const speed = enemy.phase === 'entry' ? 6.2 : enemy.phase === 'exit' ? 5.0 : (bot.label === 'JETT' ? 4.8 : 3.4);
        const step = Math.min(distance, dt * speed * this.difficulty.speed);
        const next = p.clone().addScaledVector(delta.normalize(), step); next.y = 0;
        if (isBotPlacementClear(next, this.colliders, .45, 2.25)) p.copy(next);
        else enemy.pathTimer = 0;
        bot.group.rotation.y = Math.atan2(delta.x, delta.z);
        enemy.gait += step * 5;
        bot.leftLeg.rotation.x = Math.sin(enemy.gait) * .35;
        bot.rightLeg.rotation.x = -Math.sin(enemy.gait) * .35;
      }
    }
    if (enemy.phase === 'entry' && p.distanceTo(enemy.destination) < 1.2) { enemy.phase = 'exit'; enemy.pathTimer = 0; }
    if (enemy.phase === 'exit' && p.distanceTo(enemy.exitDestination) < 1.4) { enemy.phase = 'hunt'; enemy.pathTimer = 0; }
    const eye = p.clone().add(new THREE.Vector3(0, 1.55, 0));
    const visible = this.canSee(eye, this.player.position);
    enemy.reaction = visible ? enemy.reaction + dt : 0;
    enemy.fireTimer -= dt;
    const reaction = .55 * this.difficulty.reaction * (this.revealedLeft > 0 ? .65 : 1);
    if (visible && enemy.reaction >= reaction && enemy.fireTimer <= 0) {
      enemy.fireTimer = (.75 + Math.random() * .4) * this.difficulty.botFireRate;
      bot.group.rotation.y = Math.atan2(this.player.position.x - p.x, this.player.position.z - p.z);
      this.sound.playGunfire('phantom');
      this.callbacks.onDamage?.(Math.round((8 + Math.random() * 5) * this.difficulty.botDamage));
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.revealedLeft = Math.max(0, this.revealedLeft - dt);
    for (const smoke of [...this.smokes]) {
      smoke.age += dt;
      smoke.group.rotation.y += dt * .05;
      if (smoke.age >= smoke.lifetime) { this.dispose(smoke.group); this.smokes = this.smokes.filter(item => item !== smoke); }
    }
    if (this.waveActive) {
      this.waveTime += dt;
      while (this.eventIndex < this.events.length && this.waveTime >= this.events[this.eventIndex].at) {
        this.execute(this.events[this.eventIndex++]);
      }
      for (const utility of [...this.utilities]) this.updateUtility(utility, dt);
      for (const enemy of this.enemies) { this.updateEnemy(enemy, dt); if (!this.enabled) return; }
      if (this.eventIndex === this.events.length && this.enemies.every(enemy => enemy.bot.isDead) && this.utilities.length === 0) {
        this.waveActive = false;
        this.wavesCleared++;
        this.betweenWaves = 3;
        const perfect = this.waveDestroyed === this.waveSpawned;
        this.callbacks.onWaveCleared?.(perfect);
        this.prompt(`ONDA ${this.wave} DEFENDIDA • UTILIDADES ${this.waveDestroyed}/${this.waveSpawned}`, 'success');
        for (const smoke of this.smokes) this.dispose(smoke.group);
        this.smokes = [];
      } else if (this.waveTime > 32 * this.difficulty.timer) {
        this.callbacks.onFailed?.('OS ATACANTES DOMINARAM O SITE • LIMPE A ONDA MAIS RÁPIDO');
        return;
      }
    } else if (this.launchMoreWaves) {
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) this.beginWave();
    }
    const insideSmoke = this.smokes.some(smoke => this.player.position.distanceTo(smoke.group.position) < smoke.radius);
    this.callbacks.onEffects?.({ flash: Math.min(1, this.flashLeft * 2), smoke: insideSmoke ? .82 : 0,
      revealed: this.revealedLeft > 0, active: true, wave: this.wave,
      alive: this.enemies.filter(enemy => !enemy.bot.isDead).length,
      destroyed: this.utilitiesDestroyed, spawned: this.utilitiesSpawned, cleared: this.wavesCleared });
  }
}
