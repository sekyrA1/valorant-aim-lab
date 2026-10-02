import * as THREE from 'three';
import { SkillTaskManager, SKILL_TASKS } from './skillTasks.js';
import { TRAINING_TASKS, isTrainingMode } from './trainingCatalog.js';

export class TrainingTaskManager extends SkillTaskManager {
  constructor(scene, random = Math.random, player = null, sound = null) {
    super(scene, random); this.player = player; this.sound = sound;
    for (const [mode, task] of Object.entries(TRAINING_TASKS)) if (task.variants) this.variants[mode] = task.variants[0][0];
  }
  clearAll() {
    if (this.player) { this.player.trainingSensitivity = 1; this.player.trainingNoCrosshair = false; }
    super.clearAll();
  }
  isTracking() { return isTrainingMode(this.mode) ? this.mode === 'angle_strafe' : super.isTracking(); }
  isAutomatic() { return isTrainingMode(this.mode) ? ['angle_strafe', 'quiet_eye', 'breath_reset'].includes(this.mode) : super.isAutomatic(); }
  start(mode, camera, difficulty, callbacks = {}, viewportHeight = 720) {
    if (!isTrainingMode(mode)) return super.start(mode, camera, difficulty, callbacks, viewportHeight);
    this.clearAll(); Object.assign(this, { mode, camera, difficulty, callbacks, viewportHeight, variant: this.variants[mode],
      enabled: true, elapsed: 0, score: 0, hits: 0, misses: 0, kills: 0, expired: 0, timeOnTarget: 0,
      sampleTime: 0, hudTimer: 0, streak: 0, bestStreak: 0, brakeHits: 0, apexHits: 0, movingShots: 0,
      cognitiveHits: 0, cognitiveMisses: 0, cognitiveTrials: 0, beatHits: 0, beatErrors: [], alternations: 0,
      moveDirection: 0, quietState: 'observe', wait: .25, beatIndex: -1, usedBeat: -1, cognitiveNext: 0,
      cognitiveCurrent: null, cognitiveHistory: [], serialValue: 100, pendingSpawns: [], reactions: [], switchTimes: [] });
    this.origin = camera.position.clone(); this.anchorPoint = this.origin.clone().add(new THREE.Vector3(0, 0, -12));
    this.pixelWorld = 2 * 12 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewportHeight;
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.group.name = SKILL_TASKS[mode].title;
    if (this.player) {
      this.player.trainingSensitivity = mode === 'sens_overclock' ? (this.variant === 'double' ? 2 : 1.5) :
        mode === 'sens_calibration' ? ({ high: 2, low: .5, native: 1 })[this.variant] : 1;
      this.player.trainingNoCrosshair = mode === 'no_crosshair';
    }
    if (mode === 'underflick') {
      this.anchor = this.marker(this.anchorPoint, .035, 0xa5adb8);
      this.underState = 'anchor'; this.anchorHold = 0;
    } else if (mode !== 'breath_reset') {
      const count = mode === 'accuracy_floor' ? 6 : mode === 'metronome_static' ? 4 : mode === 'pillars' ? 3 : mode === 'tough_horizontal' ? 2 : 1;
      for (let i = 0; i < count; i++) this.spawn(i, count);
    }
    this.publish();
  }
  marker(position, radius, color) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(position); this.group.add(mesh); return mesh;
  }
  spawn(slot = 0, count = 1) {
    if (!isTrainingMode(this.mode)) return super.spawn(slot, count);
    const mode = this.mode, radius = ({ popcorn: .12, tough_horizontal: .11, pressure: .095, underflick: .085,
      angle_strafe: .075, pillars: .09, sens_overclock: .065, metronome_static: .12, accuracy_floor: .085,
      quiet_eye: .14, dual_task: .09, target_blackout: .15, no_crosshair: .11, sens_calibration: .08 })[mode] * this.difficulty.targetScale;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x70d9ef, emissive: 0x236677, emissiveIntensity: .7 }));
    if (['tough_horizontal', 'pillars', 'angle_strafe'].includes(mode)) mesh.scale.set(.55, 1.4, 1);
    const group = new THREE.Group(); group.add(mesh); this.group.add(group);
    const target = { type: 'skill_target', group, mesh, radius, baseRadius: radius, slot, count, age: 0, dwell: 0,
      isDead: false, health: 1, maxHealth: 1, local: new THREE.Vector3(), velocity: new THREE.Vector3(),
      phase: this.range(0, Math.PI * 2), pause: 0, directionTimer: 0 };
    const p = target.local;
    p.set(this.range(-3.5, 3.5), this.range(-.45, 2.4), 0);
    if (['tough_horizontal', 'no_crosshair', 'target_blackout'].includes(mode)) p.y = 0;
    if (mode === 'tough_horizontal') { target.lane = (slot ? 1 : -1) * 3; p.x = target.lane; target.velocity.x = (slot ? -1 : 1) * this.range(2.5, 5) * this.difficulty.speed; }
    if (mode === 'popcorn') {
      p.set(this.range(-4, 4), 0, 0); target.gravity = 14 * this.difficulty.speed;
      target.launch = this.range(8, 10); target.apexTime = target.launch / target.gravity;
      target.landTime = 2 * target.apexTime;
    }
    if (mode === 'pressure') {
      p.set(this.range(-.3, .3), this.range(-.2, .2), 0);
      target.deadline = this.difficulty.speed < 1 ? .35 : this.difficulty.speed > 1 ? .25 : .3;
    }
    if (mode === 'underflick') {
      p.set((this.random() < .5 ? -1 : 1) * this.range(1.4, 3.6), this.range(-.3, 1.2), 0);
      this.anchor.visible = false; this.underState = 'approach';
      this.approachPoint = this.anchorPoint.clone().addScaledVector(p, .8);
      this.approach = this.marker(this.approachPoint, .07, 0x548eff); this.approachHold = 0;
    }
    if (mode === 'angle_strafe') { p.set(.5, .2, 0); this.column = new THREE.Mesh(new THREE.BoxGeometry(.6, 3.5, .4), new THREE.MeshStandardMaterial({ color: 0x526371 })); group.add(this.column); this.column.position.set(-.4, -.8, -.2); }
    if (mode === 'pillars') {
      p.set((slot - 1) * 3.5, 0, slot % 2 ? -2 : 0);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.1, .5), new THREE.MeshStandardMaterial({ color: 0x516875 }));
      pillar.position.y = -.75; group.add(pillar);
    }
    if (['metronome_static', 'accuracy_floor'].includes(mode)) {
      p.set((slot % 3 - 1) * 2.2 + this.range(-.5, .5), Math.floor(slot / 3) * 1.8 + this.range(-.25, .25), 0);
    }
    if (mode === 'quiet_eye') { p.set(this.range(-2.8, 2.8), 0, 0); this.quietState = 'observe'; this.confirmOrigin = null; }
    if (mode === 'sens_calibration' && this.variant === 'low') {
      const angle = this.range(-Math.PI, Math.PI);
      group.position.copy(this.origin).add(new THREE.Vector3(Math.sin(angle) * 9, .2, -Math.cos(angle) * 9));
      target.absolute = group.position.clone();
    } else group.position.copy(this.anchorPoint).add(p);
    this.targets.push(target); return target;
  }
  movement() { return this.player?.getHorizontalSpeed?.() || Math.hypot(this.player?.velocity?.x || 0, this.player?.velocity?.z || 0); }
  near(point, tolerance) {
    const direction = this.camera.getWorldDirection(new THREE.Vector3()), offset = point.clone().sub(this.camera.position);
    const along = offset.dot(direction); return along > 0 && offset.addScaledVector(direction, -along).length() <= tolerance;
  }
  expire(target) { this.expired++; this.miss(false); this.remove(target); this.pendingSpawns.push({ slot: target.slot, count: target.count, wait: .2 }); }
  miss(penalty = true) {
    this.misses++; this.streak = 0;
    if (penalty && ['pressure', 'underflick'].includes(this.mode)) this.score = Math.max(0, this.score - 250);
  }
  shot(hit) {
    if (!isTrainingMode(this.mode)) return super.shot(hit);
    if (!this.enabled || this.isAutomatic()) return false;
    const target = hit?.bot;
    if (this.mode === 'pillars' && (this.movement() > 2.2 || this.player?.isGrounded === false)) {
      this.movingShots++; this.miss(); this.callbacks.onPrompt?.('PARE ANTES DO TIRO • VELOCIDADE ACIMA DA DEADZONE'); this.publish(); return false;
    }
    if (!target || !this.targets.includes(target) || target.isDead) { this.miss(); this.publish(); return false; }
    if (this.mode === 'underflick' && this.underState !== 'correct') { this.miss(); this.publish(); return false; }
    if (this.mode === 'metronome_static') {
      const period = 60 / Number(this.variant), nearest = Math.round(this.elapsed / period);
      const error = Math.abs(this.elapsed - nearest * period), window = .085 * this.difficulty.reaction;
      if (error > window || nearest === this.usedBeat) { this.miss(); this.publish(); return false; }
      this.usedBeat = nearest; this.beatHits++; this.beatErrors.push(Math.round(error * 1000));
    }
    this.hits++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); this.kills++;
    let bonus = 0;
    if (this.mode === 'popcorn' && Math.abs(target.age - target.apexTime) < .12 * this.difficulty.reaction) { this.apexHits++; bonus = 300; }
    if (this.mode === 'tough_horizontal' && target.pause > 0) { this.brakeHits++; bonus = 300; }
    if (this.mode === 'pressure') this.reactions.push(Math.round(target.age * 1000));
    this.score += 1000 + bonus; this.callbacks.onKill?.(target); this.remove(target);
    if (this.mode === 'underflick') {
      this.group.remove(this.approach); this.approach.geometry.dispose(); this.approach.material.dispose(); this.approach = null;
      this.underState = 'anchor'; this.anchor.visible = true; this.anchorHold = 0; this.wait = .2;
    } else this.pendingSpawns.push({ slot: target.slot, count: target.count, wait: .12 });
    this.publish(); return true;
  }
  cognitiveInput(match) {
    if (!this.enabled || this.mode !== 'dual_task' || this.cognitiveCurrent?.answered || this.cognitiveCurrent?.expected == null) return;
    this.cognitiveCurrent.answered = true;
    if (match === this.cognitiveCurrent.expected) this.cognitiveHits++; else this.cognitiveMisses++;
    this.callbacks.onCognitive?.({ ...this.cognitiveCurrent, hits: this.cognitiveHits, misses: this.cognitiveMisses });
    this.publish();
  }
  advanceCognitive() {
    if (this.cognitiveCurrent?.expected != null && !this.cognitiveCurrent.answered) this.cognitiveMisses++;
    let shown, expected, text;
    if (this.variant === 'serial') {
      shown = this.serialValue - 7 + (this.random() < .5 ? 0 : 1); expected = shown === this.serialValue - 7;
      text = `${this.serialValue} − 7 = ${shown}?`; this.serialValue -= 7; if (this.serialValue < 7) this.serialValue = 100;
    } else if (this.variant === 'nback') {
      shown = Math.floor(this.range(1, 5)); expected = this.cognitiveHistory.length >= 2 ? shown === this.cognitiveHistory.at(-2) : null;
      text = `${shown} • igual ao número de 2 passos atrás?`; this.cognitiveHistory.push(shown);
    } else {
      shown = this.random() < .5 ? 'AZUL' : 'LARANJA'; expected = shown === 'AZUL'; text = `COR: ${shown}`;
    }
    if (expected != null) this.cognitiveTrials++;
    this.cognitiveCurrent = { shown, expected, text, answered: false }; this.cognitiveNext += 2;
    this.callbacks.onCognitive?.({ ...this.cognitiveCurrent, hits: this.cognitiveHits, misses: this.cognitiveMisses });
  }
  update(dt) {
    if (!isTrainingMode(this.mode)) return super.update(dt);
    if (!this.enabled || dt <= 0) return;
    this.elapsed += dt;
    for (const target of [...this.targets]) {
      target.age += dt; const p = target.local;
      if (this.mode === 'popcorn') {
        p.y = target.launch * target.age - .5 * target.gravity * target.age ** 2;
        target.mesh.material.color.set(Math.abs(target.age - target.apexTime) < .12 * this.difficulty.reaction ? 0x7bffa7 : 0x70d9ef);
        if (target.age >= target.landTime) { this.expire(target); continue; }
      } else if (this.mode === 'tough_horizontal') {
        target.pause -= dt; target.directionTimer -= dt;
        if (target.pause > 0) target.velocity.x = 0;
        else {
          if (target.directionTimer <= 0 || target.velocity.x === 0) {
            target.velocity.x = (p.x >= target.lane ? -1 : 1) * this.range(2.5, 5.5) * this.difficulty.speed;
            target.directionTimer = this.range(.3, .65) / this.difficulty.speed;
          }
          p.x += target.velocity.x * dt;
          if (Math.abs(p.x - target.lane) > 1.4 || target.directionTimer <= 0) { p.x = THREE.MathUtils.clamp(p.x, target.lane - 1.4, target.lane + 1.4); target.pause = this.range(.08, .18) * this.difficulty.reaction; target.velocity.x = 0; }
        }
      } else if (this.mode === 'pressure') {
        const scale = Math.max(.03, 1 - target.age / target.deadline); target.mesh.scale.setScalar(scale); target.radius = target.baseRadius * scale;
        if (target.age >= target.deadline) { this.expire(target); continue; }
      } else if (this.mode === 'angle_strafe') p.x = .5 + .65 * Math.sin(target.age * .7 * this.difficulty.speed);
      else if (this.mode === 'target_blackout') {
        p.x = 3.4 * Math.sin(target.age * 1.2 * this.difficulty.speed + target.phase);
        const visible = target.age % .8 < .1;
        // Keep the physical target raycastable during its occluded path.
        target.mesh.material.colorWrite = visible; target.mesh.material.depthWrite = visible;
      }
      if (!target.absolute) target.group.position.copy(this.anchorPoint).add(p);
    }
    this.camera.updateMatrixWorld(true);
    const hovered = this.raycastBullet(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()))?.bot;
    const moving = this.movement() > .2;
    const side = this.player?.keys?.left !== this.player?.keys?.right && (this.player?.keys?.left || this.player?.keys?.right);
    if (this.mode === 'angle_strafe' && side && moving) {
      const direction = this.player.keys.left ? -1 : 1;
      if (this.moveDirection && direction !== this.moveDirection) this.alternations++;
      this.moveDirection = direction;
    }
    const eligible = this.mode !== 'angle_strafe' || (moving && side && this.player?.isGrounded !== false);
    this.sampleTime += dt;
    if (hovered && eligible) this.timeOnTarget += dt;
    if (this.mode === 'angle_strafe' && hovered && eligible) this.score += dt * 1000;
    for (const target of this.targets) target.dwell = hovered === target ? target.dwell + dt : 0;
    if (this.mode === 'underflick') {
      if (this.underState === 'anchor') {
        this.wait -= dt; this.anchorHold = this.near(this.anchorPoint, this.pixelWorld * 3) ? this.anchorHold + dt : 0;
        if (this.wait <= 0 && this.anchorHold > .1) this.spawn();
      } else if (this.underState === 'approach') {
        this.approachHold = this.near(this.approachPoint, .12) ? this.approachHold + dt : 0;
        if (this.approachHold >= .04) { this.underState = 'correct'; this.approach.visible = false; }
      }
    }
    if (this.mode === 'quiet_eye' && this.targets[0]) {
      const target = this.targets[0];
      if (this.quietState === 'observe' && target.age >= .15) { this.quietState = 'align'; target.dwell = 0; }
      if (this.quietState === 'align' && target.dwell >= .5) {
        this.quietState = 'dodge'; this.confirmOrigin = this.camera.position.clone(); target.mesh.material.color.set(0x7bffa7);
      }
      if (this.quietState === 'dodge' && side && moving && this.camera.position.distanceTo(this.confirmOrigin) >= .4) {
        this.kills++; this.hits++; this.score += 1000; this.remove(target); this.spawn();
      }
    }
    if (this.mode === 'dual_task' && this.elapsed >= this.cognitiveNext) this.advanceCognitive();
    if (this.mode === 'metronome_static') {
      const beat = Math.floor(this.elapsed * Number(this.variant) / 60);
      if (beat > this.beatIndex) { this.beatIndex = beat; this.sound?.playMetronome?.(beat % 4 === 0); }
    }
    for (const pending of [...this.pendingSpawns]) {
      pending.wait -= dt;
      if (pending.wait <= 0) { this.spawn(pending.slot, pending.count); this.pendingSpawns = this.pendingSpawns.filter(item => item !== pending); }
    }
    this.hudTimer += dt; if (this.hudTimer >= .1) { this.hudTimer = 0; this.publish(); }
  }
  accuracy() {
    if (!isTrainingMode(this.mode)) return super.accuracy();
    if (this.mode === 'angle_strafe') return this.sampleTime ? Math.round(100 * this.timeOnTarget / this.sampleTime) : 0;
    if (this.mode === 'quiet_eye') return this.kills ? 100 : 0;
    return this.hits + this.misses ? Math.round(100 * this.hits / (this.hits + this.misses)) : 0;
  }
  metrics() {
    return { bestStreak: this.bestStreak, brakeHits: this.brakeHits, apexHits: this.apexHits, movingShots: this.movingShots,
      cognitiveHits: this.cognitiveHits, cognitiveMisses: this.cognitiveMisses, cognitiveTrials: this.cognitiveTrials,
      alternations: this.alternations, beatHits: this.beatHits, beatError: this.beatErrors?.length ? Math.round(this.beatErrors.reduce((a, b) => a + b) / this.beatErrors.length) : null,
      accuracyFloorPassed: this.mode === 'accuracy_floor' ? this.hits + this.misses >= 20 && this.hits / (this.hits + this.misses) >= .95 : undefined };
  }
  publish() {
    if (!isTrainingMode(this.mode)) return super.publish();
    let text = SKILL_TASKS[this.mode].hint;
    if (this.mode === 'angle_strafe') text += ` • COBERTURA EM MOVIMENTO: ${this.accuracy()}% • INVERSÕES: ${this.alternations}`;
    if (this.mode === 'underflick') text = ({ anchor: 'VOLTE À ÂNCORA CENTRAL', approach: 'FLICK ATÉ A MARCA AZUL • SEM ATIRAR', correct: 'COMPLETE O MICROAJUSTE E CLIQUE' })[this.underState];
    if (this.mode === 'pressure') text += ` • PERDIDOS: ${this.expired} • SEQUÊNCIA: ${this.streak}`;
    if (this.mode === 'accuracy_floor') text += ` • ${this.accuracy()}% • ${this.hits + this.misses}/20 TIROS`;
    if (this.mode === 'quiet_eye') text = ({ observe: 'OBSERVE PRIMEIRO • SEM ATIRAR', align: 'MANTENHA A MIRA POR 0,5 S', dodge: 'CONFIRMADO • DESVIE COM A/D' })[this.quietState] + ` • CONFIRMAÇÕES: ${this.kills}`;
    if (this.mode === 'metronome_static') text += ` • ${this.variant} BPM • BATIDA ${this.beatIndex + 1} • NO RITMO: ${this.beatHits}`;
    if (this.mode === 'sens_overclock' || this.mode === 'sens_calibration') text += ` • SENS TEMPORÁRIA: ${this.player?.trainingSensitivity || 1}×`;
    if (this.mode === 'dual_task') text += ' • [Q] SIM / AZUL • [E] NÃO / LARANJA';
    if (this.mode === 'breath_reset') text = ['SOLTE OS OMBROS E A MÃO', 'INSPIRE CONFORTAVELMENTE', 'EXPIRE DEVAGAR, SEM FORÇAR', 'OBSERVE A TENSÃO DA MÃO'][Math.floor(this.elapsed / 4) % 4] + ' • PAUSA SEM PONTUAÇÃO';
    this.callbacks.onStats?.({ score: Math.round(this.score), hits: this.hits, misses: this.misses, headshots: this.kills, accuracy: this.accuracy() });
    this.callbacks.onPrompt?.(text);
  }
  summary() {
    if (!isTrainingMode(this.mode)) return super.summary();
    if (this.mode === 'accuracy_floor') return this.metrics().accuracyFloorPassed ? 'VALIDADA • 95% OU MAIS EM PELO MENOS 20 TIROS' : 'REPETIR • ALCANCE 95% COM PELO MENOS 20 TIROS';
    if (this.mode === 'dual_task') return `MIRA: ${this.accuracy()}% • RESPOSTAS COGNITIVAS: ${this.cognitiveHits}/${this.cognitiveTrials}`;
    if (this.mode === 'breath_reset') return 'PAUSA CONCLUÍDA • RETOME COM A MÃO LEVE';
    if (this.mode === 'quiet_eye') return `${this.kills} CONFIRMAÇÕES DE 0,5 S COM DESVIO • FIXAÇÃO DO OLHAR NÃO É MEDIDA`;
    return `${SKILL_TASKS[this.mode].title} • ${this.accuracy()}% • ${this.kills} ALVOS • ${this.expired} PERDIDOS`;
  }
}
