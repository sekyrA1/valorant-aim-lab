import * as THREE from 'three';

// Local adaptations of the requested mechanics; scores belong to this game's tasks.
export const SKILL_TASKS = Object.freeze({
  pokeball: { title: 'POKEBALL FRENZY / AUTO SMALL', category: 'dynamic', badge: 'CONFIRMAÇÃO DE MIRA',
    desc: 'Orbes erráticos. Auto Small elimina após manter a mira por um instante; Frenzy exige três cliques confirmados e cadenciados.',
    variants: [['auto', 'Auto Small'], ['frenzy', 'Frenzy']], hint: 'Confirme a mira antes de clicar', color: '#ff8b8b' },
  horizontal_clicking: { title: 'VT PLAZA • HORIZONTAL', category: 'dynamic', badge: 'ANTI-PEEKING / ADAD',
    desc: 'Cabeças pequenas na altura dos olhos fazem strafes curtos, aceleram e freiam. Acertos durante a parada rendem bônus.',
    hint: 'Punir a frenagem do jiggle peek', color: '#ffbf69' },
  voxts: { title: 'VOXTARGETSWITCH / KINTS', category: 'switch', badge: 'TRANSFERÊNCIA HORIZONTAL',
    desc: 'Dois a três alvos com barras de vida e múltiplos acertos. Elimine um e transfira a mira rapidamente para ganhar bônus.',
    hint: 'Vida curta • bônus de transição', color: '#b991ff' },
  reflex_micro: { title: 'REFLEX MICRO++', category: 'micro', badge: 'CORREÇÃO PÓS-FLICK',
    desc: 'Uma âncora central e um alvo a 5–15 pixels dela. Reaja em menos de 400 ms; após cada tentativa, volte à âncora.',
    hint: '5–15 px • janela de 230–380 ms', color: '#64dfff' },
  wall_two: { title: '1W2TS • SMALL RELOAD', category: 'micro', badge: 'MICROAJUSTE & CADÊNCIA',
    desc: 'Duas esferas minúsculas, sem poluição visual. Faça o flick e a correção fina; uma nova dupla entra após eliminar as duas.',
    hint: 'Dois alvos por rodada', color: '#6ed7ed' },
  centering: { title: 'CENTERING I / II', category: 'tracking', badge: 'SUAVIDADE & TENSÃO',
    desc: 'Um alvo minúsculo oscila perto do centro com velocidade variável. Pontue pelo tempo no alvo, sem precisar atirar.',
    variants: [['one', 'Centering I'], ['two', 'Centering II']], hint: 'Tracking contínuo • sem clicar', color: '#7be4b1' },
  controlsphere: { title: 'CONTROLSPHERE / THIN GAUNTLET', category: 'tracking', badge: 'BRAÇO & ANTEBRAÇO',
    desc: 'Controlsphere percorre arcos amplos em 3D. Thin Gauntlet mantém um alvo fino em trajetórias horizontais com pouca oscilação vertical.',
    variants: [['sphere', 'Controlsphere'], ['thin', 'Thin Gauntlet']], hint: 'Pressão constante • sem clicar', color: '#69e2d2' },
  vertical_strafes: { title: 'TILE HORN • VERTICAL STRAFES', category: 'vertical', badge: 'ELEVAÇÃO & DESNÍVEL',
    desc: 'Um alvo pequeno sobe e desce rapidamente, troca a velocidade e varia a profundidade. Corrija a altura e confirme o tiro.',
    hint: 'Strafes verticais rápidos', color: '#9ea5ff' },
  floating_heads: { title: 'FLOATING HEADS TIMING', category: 'vertical', badge: 'TIMING DE ATERRISSAGEM',
    desc: 'Cabeças caem com gravidade. Espere o alvo ficar verde perto da aterrissagem: tiros antecipados não pontuam.',
    hint: 'Desça com o alvo • clique no verde', color: '#ffe084' }
});

export const SKILL_MODE_IDS = Object.freeze(Object.keys(SKILL_TASKS));
export const isSkillMode = mode => Object.hasOwn(SKILL_TASKS, mode);

export class SkillTaskManager {
  constructor(scene, random = Math.random) {
    this.scene = scene;
    this.random = random;
    this.raycaster = new THREE.Raycaster();
    this.variants = { pokeball: 'auto', centering: 'one', controlsphere: 'sphere' };
    this.targets = [];
    this.enabled = false;
  }

  range(min, max) { return min + (max - min) * this.random(); }
  isTracking() { return ['centering', 'controlsphere'].includes(this.mode); }
  isAutomatic() { return this.isTracking() || (this.mode === 'pokeball' && this.variant === 'auto'); }
  confirmationTime() { return .22 / this.difficulty.reaction; }

  clearAll() {
    this.enabled = false;
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(object => {
        object.geometry?.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
      });
    }
    this.group = null;
    this.targets = [];
    this.pendingSpawns = [];
  }

  start(mode, camera, difficulty, callbacks = {}, viewportHeight = 720) {
    this.clearAll();
    this.mode = mode; this.camera = camera; this.difficulty = difficulty; this.callbacks = callbacks;
    this.variant = this.variants[mode];
    this.enabled = true;
    this.elapsed = 0; this.score = 0; this.hits = 0; this.misses = 0; this.kills = 0;
    this.expired = 0; this.timeOnTarget = 0; this.sampleTime = 0; this.lastKill = -Infinity;
    this.lastKillSlot = null;
    this.reactions = []; this.switchTimes = []; this.landings = 0; this.hudTimer = 0; this.reflexState = 'anchor';
    this.reflexWait = this.range(.35, .7); this.anchorHold = 0; this.pairWait = 0;
    this.pixelWorld = 2 * 12 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewportHeight;
    this.viewportHeight = viewportHeight;
    this.origin = camera.position.clone();
    this.group = new THREE.Group(); this.group.name = SKILL_TASKS[mode].title;
    this.scene.add(this.group);
    this.anchorPoint = this.origin.clone().add(new THREE.Vector3(0, 0, -12));
    if (mode === 'reflex_micro') {
      this.anchor = new THREE.Mesh(new THREE.SphereGeometry(this.pixelWorld, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xa5adb8 }));
      this.anchor.position.copy(this.anchorPoint); this.group.add(this.anchor);
    } else if (mode === 'wall_two') this.spawnPair();
    else {
      const count = mode === 'pokeball' ? (difficulty.extraTargets > 0 ? 4 : 3) :
        mode === 'horizontal_clicking' ? 2 : mode === 'voxts' ? (difficulty.extraTargets < 0 ? 2 : 3) : 1;
      for (let i = 0; i < count; i++) this.spawn(i, count);
    }
    this.publish();
  }

  spawn(slot = 0, count = 1) {
    const scale = this.difficulty.targetScale;
    let radius = ({ pokeball: .19, horizontal_clicking: .105, voxts: .17, wall_two: .07,
      centering: .085, controlsphere: .19, vertical_strafes: .13, floating_heads: .12 })[this.mode] * scale;
    if (this.mode === 'reflex_micro') radius = this.pixelWorld * (this.difficulty.speed < 1 ? 3 : this.difficulty.speed > 1 ? 1.65 : 2.2);
    if (this.mode === 'controlsphere' && this.variant === 'thin') radius = .075 * scale;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x64dfff, emissive: 0x1b7795, emissiveIntensity: .65, roughness: .4 }));
    const group = new THREE.Group(); group.add(mesh); this.group.add(group);
    const lane = count > 1 ? (slot - (count - 1) / 2) * (this.mode === 'pokeball' ? 2.6 : 3.6) : 0;
    const target = { type: 'skill_target', group, mesh, radius, isDead: false, slot, count, lane,
      age: 0, dwell: 0, health: this.mode === 'voxts' ? (this.difficulty.speed < 1 ? 2 : 3) :
        this.mode === 'pokeball' && this.variant === 'frenzy' ? 3 : 1,
      lastClick: -Infinity, directionTimer: 0, phase: this.range(0, Math.PI * 2),
      velocity: new THREE.Vector3(), desiredVelocity: new THREE.Vector3(), moveTime: 0,
      local: new THREE.Vector3(lane, 0, 0), fromX: lane, toX: lane, travel: .5, pause: 0 };
    target.maxHealth = target.health;
    if (this.mode === 'reflex_micro') {
      const angle = this.range(0, Math.PI * 2), pixels = this.range(5, 15);
      target.local.set(Math.cos(angle) * pixels * this.pixelWorld, Math.sin(angle) * pixels * this.pixelWorld, 0);
      target.deadline = this.difficulty.speed < 1 ? .38 : this.difficulty.speed > 1 ? .23 : .32;
      this.anchor.visible = false;
    }
    if (this.mode === 'wall_two') target.local.set((slot ? 1 : -1) * this.range(.4, 2.4), this.range(-.4, 1.8), 0);
    if (this.mode === 'floating_heads') {
      target.local.set(this.range(-3.5, 3.5), this.range(3, 6), this.range(-1.5, 1));
      target.dropHeight = target.local.y;
      target.gravity = 14 * this.difficulty.speed;
      target.landTime = Math.sqrt(2 * target.dropHeight / target.gravity);
      target.window = .14 * this.difficulty.reaction;
    }
    if (this.mode === 'pokeball') target.local.y = this.range(.1, 3.2);
    if (this.mode === 'controlsphere' && this.variant !== 'thin') target.local.y = 2.3;
    if (['horizontal_clicking', 'voxts'].includes(this.mode)) {
      target.fromX = lane + this.range(-.8, .8);
      target.toX = lane + (target.fromX >= lane ? -1 : 1) * this.range(.28, .95);
      target.travel = this.range(.18, .38) / this.difficulty.speed;
      target.pause = this.range(.07, .2) * this.difficulty.reaction;
      target.moveTime = this.range(0, target.travel);
      const t = target.moveTime / target.travel;
      target.local.x = THREE.MathUtils.lerp(target.fromX, target.toX, t * t * (3 - 2 * t));
    }
    if (this.mode === 'vertical_strafes') {
      target.local.set(1.4 * Math.sin(target.phase), this.range(.3, 5.8), .8 * Math.sin(target.phase));
    }
    if (['pokeball', 'voxts'].includes(this.mode)) {
      const background = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.2, .045), new THREE.MeshBasicMaterial({ color: 0x253542 }));
      background.position.set(0, radius + .11, 0); group.add(background);
      target.bar = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.2, .045), new THREE.MeshBasicMaterial({ color: 0x7be4b1 }));
      target.bar.position.copy(background.position); target.bar.position.z = .005; group.add(target.bar);
    }
    group.position.copy(this.anchorPoint).add(target.local);
    this.targets.push(target);
    return target;
  }

  spawnPair() { this.spawn(0, 2); this.spawn(1, 2); }

  setViewportHeight(height) {
    if (!this.enabled || this.mode !== 'reflex_micro') return;
    const next = 2 * 12 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / height;
    this.viewportHeight = height;
    if (Math.abs(next - this.pixelWorld) < 1e-12) return;
    const ratio = next / this.pixelWorld;
    this.viewportHeight = height; this.pixelWorld = next;
    this.anchor.scale.multiplyScalar(ratio);
    for (const target of this.targets) {
      target.local.x *= ratio; target.local.y *= ratio;
      target.radius *= ratio; target.mesh.scale.multiplyScalar(ratio);
      target.group.position.copy(this.anchorPoint).add(target.local);
    }
  }

  remove(target) {
    target.isDead = true;
    this.group.remove(target.group);
    target.group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    this.targets = this.targets.filter(other => other !== target);
  }

  kill(target, bonus = 0) {
    this.score += 1000 + bonus; this.kills++;
    if (this.mode === 'pokeball' && this.variant === 'auto') this.hits++;
    this.callbacks.onKill?.(target);
    this.lastKill = this.elapsed;
    this.lastKillSlot = target.slot;
    const { slot, count } = target;
    this.remove(target);
    if (this.mode === 'reflex_micro') this.resetReflex();
    else if (this.mode === 'wall_two') { if (!this.targets.length) this.pairWait = .24; }
    else if (this.mode === 'voxts') this.pendingSpawns.push({ slot, count, wait: .75 });
    else if (this.mode !== 'floating_heads') this.spawn(slot, count);
    else this.pairWait = .22;
  }

  resetReflex() {
    this.reflexState = 'anchor'; this.anchorHold = 0; this.reflexWait = this.range(.25, .6);
    this.anchor.visible = true;
  }

  raycastBullet(origin, direction, range = 100) {
    if (!this.enabled) return null;
    this.raycaster.set(origin, direction); this.raycaster.far = range;
    this.group.updateMatrixWorld(true);
    const hit = this.raycaster.intersectObjects(this.targets.map(target => target.mesh), false)[0];
    if (!hit) return null;
    return { bot: this.targets.find(target => target.mesh === hit.object), zone: 'body', point: hit.point.clone(), distance: hit.distance };
  }

  shot(hit) {
    if (!this.enabled || this.isAutomatic()) return false;
    const target = hit?.bot;
    const valid = target && this.targets.includes(target) && !target.isDead;
    if (!valid) { this.misses++; this.publish(); return false; }
    if (this.mode === 'pokeball' && (target.dwell < .07 / this.difficulty.reaction || this.elapsed - target.lastClick < .065)) {
      this.misses++; this.callbacks.onPrompt?.('CONFIRME A MIRA ANTES DO CLIQUE'); this.publish(); return false;
    }
    if (this.mode === 'floating_heads' && Math.abs(target.age - target.landTime) > target.window) {
      this.misses++; this.callbacks.onPrompt?.('CEDO DEMAIS • ESPERE O ALVO VERDE'); this.publish(); return false;
    }
    this.hits++;
    if (this.mode === 'pokeball' && this.elapsed - target.lastClick > .45) target.health = target.maxHealth;
    target.lastClick = this.elapsed; target.health--;
    if (target.health <= 0) {
      let bonus = 0;
      if (this.mode === 'horizontal_clicking' && Math.abs(target.velocity.x) < .45) bonus = 300;
      if (this.mode === 'reflex_micro') {
        this.reactions.push(Math.round(target.age * 1000)); bonus = Math.round((target.deadline - target.age) * 1500);
      }
      if (this.mode === 'voxts' && Number.isFinite(this.lastKill) && target.slot !== this.lastKillSlot) {
        const transition = this.elapsed - this.lastKill; this.switchTimes.push(Math.round(transition * 1000));
        bonus = Math.max(0, Math.round((1 - transition) * 500));
      }
      if (this.mode === 'floating_heads') { this.landings++; bonus = Math.round(500 * (1 - Math.abs(target.age - target.landTime) / target.window)); }
      this.kill(target, bonus);
    } else this.score += 100;
    this.publish();
    return true;
  }

  move(target, dt) {
    target.age += dt;
    const speed = this.difficulty.speed, p = target.local;
    if (this.mode === 'pokeball') {
      target.directionTimer -= dt;
      if (target.directionTimer <= 0) {
        target.directionTimer = this.range(.16, .5) / speed;
        target.desiredVelocity.set(this.range(-3.5, 3.5) * speed, this.range(-2.8, 2.8) * speed, 0);
      }
      target.velocity.lerp(target.desiredVelocity, 1 - Math.exp(-dt * 17));
      p.addScaledVector(target.velocity, dt);
      if (p.x < target.lane - .9 || p.x > target.lane + .9) {
        target.desiredVelocity.x = (p.x < target.lane ? 1 : -1) * Math.abs(target.desiredVelocity.x);
        p.x = THREE.MathUtils.clamp(p.x, target.lane - .9, target.lane + .9);
      }
      if (p.y < -.4 || p.y > 3.8) {
        target.desiredVelocity.y = (p.y < -.4 ? 1 : -1) * Math.abs(target.desiredVelocity.y);
        p.y = THREE.MathUtils.clamp(p.y, -.4, 3.8);
      }
    } else if (['horizontal_clicking', 'voxts'].includes(this.mode)) {
      target.moveTime += dt;
      if (target.moveTime >= target.travel + target.pause) {
        target.fromX = p.x;
        target.toX = target.lane + (p.x >= target.lane ? -1 : 1) * this.range(.28, .95);
        target.travel = this.range(.18, .38) / speed;
        target.pause = this.range(.07, .2) * this.difficulty.reaction;
        target.moveTime = 0;
      }
      const t = Math.min(1, target.moveTime / target.travel), previous = p.x;
      p.x = THREE.MathUtils.lerp(target.fromX, target.toX, t * t * (3 - 2 * t));
      p.y = 0; target.velocity.x = (p.x - previous) / dt;
    } else if (this.mode === 'centering') {
      const t = target.age * speed * (this.variant === 'two' ? 1.7 : 1);
      p.x = .65 * Math.sin(t * 1.8 + .35 * Math.sin(t * .8));
      p.y = (this.variant === 'two' ? .26 : .09) * Math.sin(t * 2.3);
    } else if (this.mode === 'controlsphere') {
      const t = target.age * speed;
      p.x = 5.8 * Math.sin(t * .85 + .17 * Math.sin(t * 1.6));
      p.y = this.variant === 'thin' ? .07 * Math.sin(t * .9) : 2.3 + 2.2 * Math.sin(t * .68);
      p.z = this.variant === 'thin' ? 0 : 1.6 * Math.sin(t * .6);
    } else if (this.mode === 'vertical_strafes') {
      target.directionTimer -= dt;
      if (target.directionTimer <= 0) {
        target.fromY = p.y; target.toY = p.y > 2.4 ? this.range(.1, 1.6) : this.range(3.4, 6.2);
        target.travel = this.range(.32, .65) / speed; target.moveTime = 0;
        target.directionTimer = target.travel;
      }
      target.moveTime += dt;
      const t = Math.min(1, target.moveTime / target.travel);
      p.y = THREE.MathUtils.lerp(target.fromY, target.toY, t * t * (3 - 2 * t));
      p.x = 1.4 * Math.sin(target.age * .7 + target.phase); p.z = .8 * Math.sin(target.age * .85 + target.phase);
    } else if (this.mode === 'floating_heads') {
      p.y = Math.max(0, target.dropHeight - .5 * target.gravity * target.age ** 2);
      const ready = Math.abs(target.age - target.landTime) <= target.window;
      target.mesh.material.color.set(ready ? 0x79ffa7 : 0x7abfff);
      target.mesh.material.emissive.set(ready ? 0x239b4a : 0x224e7b);
    }
    target.group.position.copy(this.anchorPoint).add(p);
  }

  update(dt) {
    if (!this.enabled || dt <= 0) return;
    this.elapsed += dt;
    if (this.mode === 'reflex_micro') this.setViewportHeight(this.viewportHeight);
    for (const target of this.targets) this.move(target, dt);
    this.camera.updateMatrixWorld(true);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const hovered = this.raycastBullet(this.camera.position, direction)?.bot;
    this.sampleTime += dt;
    if (hovered) this.timeOnTarget += dt;
    if (this.isTracking()) this.score += (hovered ? 1000 : 0) * dt;
    for (const target of [...this.targets]) {
      target.dwell = hovered === target ? target.dwell + dt : 0;
      if (this.mode === 'pokeball' && this.variant === 'auto') {
        if (target.bar) target.bar.scale.x = Math.min(1, target.dwell / this.confirmationTime());
        if (target.dwell >= this.confirmationTime()) this.kill(target);
      } else if (target.bar) target.bar.scale.x = target.health / target.maxHealth;
      if ((this.mode === 'reflex_micro' && target.age >= target.deadline) ||
          (this.mode === 'floating_heads' && target.age > target.landTime + target.window)) {
        this.expired++; this.misses++; this.remove(target);
        if (this.mode === 'reflex_micro') this.resetReflex(); else this.pairWait = .24;
      }
    }
    if (this.mode === 'reflex_micro' && this.reflexState === 'anchor') {
      const toAnchor = this.anchorPoint.clone().sub(this.camera.position);
      const along = toAnchor.dot(direction);
      const nearAnchor = along > 0 && toAnchor.addScaledVector(direction, -along).length() <= this.pixelWorld * 2.5;
      this.anchorHold = nearAnchor ? this.anchorHold + dt : 0;
      this.reflexWait -= dt;
      if (this.anchorHold >= .1 && this.reflexWait <= 0) { this.reflexState = 'target'; this.spawn(); }
    }
    if (this.pairWait > 0) {
      this.pairWait -= dt;
      if (this.pairWait <= 0 && !this.targets.length) {
        if (this.mode === 'wall_two') this.spawnPair(); else if (this.mode === 'floating_heads') this.spawn();
      }
    }
    for (const pending of [...this.pendingSpawns]) {
      pending.wait -= dt;
      if (pending.wait <= 0) {
        this.spawn(pending.slot, pending.count);
        this.pendingSpawns = this.pendingSpawns.filter(other => other !== pending);
      }
    }
    this.hudTimer += dt;
    if (this.hudTimer >= .1) { this.hudTimer = 0; this.publish(); }
  }

  accuracy() {
    if (this.isAutomatic()) return this.sampleTime ? Math.round(this.timeOnTarget / this.sampleTime * 100) : 0;
    return this.hits + this.misses ? Math.round(this.hits / (this.hits + this.misses) * 100) : 100;
  }

  publish() {
    let prompt = SKILL_TASKS[this.mode].hint;
    if (this.isTracking()) prompt = `TEMPO NO ALVO: ${this.timeOnTarget.toFixed(1)}s • COBERTURA: ${this.accuracy()}% • NÃO PRECISA ATIRAR`;
    else if (this.mode === 'pokeball') prompt = this.variant === 'auto' ? 'AUTO SMALL • MANTENHA A MIRA ATÉ PREENCHER A BARRA' : 'FRENZY • CONFIRME A MIRA E ACERTE 3 CLIQUES CADENCIADOS';
    else if (this.mode === 'reflex_micro') prompt = `VOLTE À ÂNCORA • 5–15 PX • ALVOS PERDIDOS: ${this.expired}`;
    else if (this.mode === 'floating_heads') prompt = `CLIQUE NO VERDE • ATERRISSAGENS: ${this.landings} • PERDIDOS: ${this.expired}`;
    this.callbacks.onStats?.({ score: Math.round(this.score), hits: this.hits, misses: this.misses, headshots: this.kills, accuracy: this.accuracy() });
    this.callbacks.onPrompt?.(prompt);
  }

  summary() {
    if (this.isAutomatic()) return `CONCLUÍDO • TEMPO NO ALVO: ${this.timeOnTarget.toFixed(1)}s • COBERTURA: ${this.accuracy()}%`;
    if (this.mode === 'reflex_micro') return `MICRO REFLEX • REAÇÃO MÉDIA: ${this.reactions.length ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length) : '—'} ms • PERDIDOS: ${this.expired}`;
    if (this.mode === 'floating_heads') return `TIMING • ${this.landings} ATERRISSAGENS • ${this.expired} ALVOS PERDIDOS`;
    if (this.mode === 'voxts') return `TRANSFERÊNCIAS • ${this.kills} ELIMINAÇÕES • TRANSIÇÃO MÉDIA: ${this.switchTimes.length ? Math.round(this.switchTimes.reduce((a, b) => a + b, 0) / this.switchTimes.length) : '—'} ms`;
    return `${SKILL_TASKS[this.mode].title} • ${this.kills} ELIMINAÇÕES • ${this.accuracy()}% ACERTO`;
  }
}
