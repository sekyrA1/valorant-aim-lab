import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkillTaskManager, SKILL_MODE_IDS } from '../src/skillTasks.js';
import { isTrainingMode } from '../src/trainingCatalog.js';
import { DIFFICULTIES } from '../src/difficulty.js';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';
import { GameModeManager, AVAILABLE_MODES } from '../src/gameModes.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
const resetCamera = () => { camera.position.set(0, 1.7, 8); camera.lookAt(0, 1.7, -4); camera.updateMatrixWorld(true); };
const manager = new SkillTaskManager(scene, () => .5);
const start = (mode, difficulty = DIFFICULTIES.normal, height = 720) => { resetCamera(); manager.start(mode, camera, difficulty, {}, height); };
const aim = target => { camera.lookAt(target.group.position); camera.updateMatrixWorld(true); };
const hit = target => manager.shot({ bot: target });

assert.equal(SKILL_MODE_IDS.filter(mode => !isTrainingMode(mode)).length, 9);
assert.equal(AVAILABLE_MODES.length, 35);
for (const difficulty of Object.values(DIFFICULTIES)) for (const mode of SKILL_MODE_IDS.filter(mode => !isTrainingMode(mode))) {
  start(mode, difficulty);
  for (let i = 0; i < 400; i++) {
    manager.update(1 / 120);
    for (const target of manager.targets) {
      assert(target.group.position.toArray().every(Number.isFinite));
      assert(target.group.position.y - target.radius > 0, `${mode}: target stays above floor`);
      assert(target.group.position.y + target.radius < 16);
      assert(target.group.position.z > -15, `${mode}: target stays in front of wall`);
      assert(target.group.position.x - target.radius > -17 && target.group.position.x + target.radius < 17);
    }
  }
  manager.clearAll(); assert.equal(scene.children.length, 0, 'mode teardown leaves no target objects');
}

start('pokeball');
let boundary = manager.targets[0];
boundary.local.x = boundary.lane + .9;
boundary.velocity.x = 3;
boundary.desiredVelocity.x = 3;
boundary.directionTimer = 1;
manager.update(.01); manager.update(.01);
assert(boundary.desiredVelocity.x < 0, 'Pokeball keeps steering inward at a lane boundary');
start('pokeball');
let target = manager.targets[1]; aim(target);
manager.update(.08); assert.equal(manager.kills, 0, 'a brief flick does not score');
camera.lookAt(10, 10, -4); manager.update(.01); assert.equal(target.dwell, 0, 'leaving a target resets confirmation');
aim(target); manager.update(.23); assert.equal(manager.kills, 1, 'Auto Small requires uninterrupted confirmation');
manager.variants.pokeball = 'frenzy'; start('pokeball');
target = manager.targets[1];
assert.equal(hit(target), false, 'Frenzy rejects blind clicks');
aim(target); manager.update(.1); assert(hit(target)); assert.equal(target.health, 2);
assert.equal(hit(target), false, 'Frenzy rejects clicks without cadence');
manager.update(.1); assert(hit(target)); manager.update(.1); assert(hit(target)); assert.equal(manager.kills, 1);

start('horizontal_clicking');
let moved = false, paused = false;
for (let i = 0; i < 200; i++) {
  manager.update(.01);
  for (const t of manager.targets) { assert.equal(t.local.y, 0, 'ADAD stays at eye height'); moved ||= Math.abs(t.velocity.x) > 1; paused ||= i > 80 && Math.abs(t.velocity.x) < .01; }
}
assert(moved && paused, 'horizontal targets accelerate and brake rather than teleport');
target = manager.targets[0];
const origin = target.group.position.clone().add(new THREE.Vector3(0, target.radius * 1.2, 2));
assert.equal(manager.raycastBullet(origin, new THREE.Vector3(0, 0, -1)), null, 'health bars and decoration are not hitboxes');

start('voxts'); target = manager.targets[0];
assert(hit(target)); assert.equal(target.isDead, false, 'a single hit does not kill a transfer target');
assert(hit(target)); assert(hit(target)); assert(target.isDead); assert.equal(manager.targets.length, 2);
assert.equal(manager.pendingSpawns.length, 1, 'a killed lane waits before respawning, forcing a transition');
manager.update(.25); const next = manager.targets[0];
for (let i = 0; i < 3; i++) hit(next);
assert.equal(manager.kills, 2); assert(manager.score > 2400, 'a rapid second elimination earns a transfer bonus');
start('voxts', DIFFICULTIES.easy); assert.equal(manager.targets.length, 2); assert.equal(manager.targets[0].maxHealth, 2);

for (const height of [720, 1080]) for (const difficulty of Object.values(DIFFICULTIES)) {
  start('reflex_micro', difficulty, height);
  manager.update(.7); target = manager.targets[0]; assert(target);
  const projected = target.group.position.clone().project(camera);
  const distancePx = Math.hypot(projected.x * (height * camera.aspect) / 2, projected.y * height / 2);
  assert(distancePx >= 5 - 1e-6 && distancePx <= 15 + 1e-6, 'micro offset is measured in actual viewport pixels');
  assert(target.deadline < .4);
  manager.update(target.deadline + .001); assert.equal(manager.expired, 1); assert.equal(manager.targets.length, 0);
  camera.lookAt(6, 6, -4); manager.update(1); assert.equal(manager.targets.length, 0, 'new reflex waits until the player returns to the anchor');
}
start('reflex_micro'); manager.update(.7); target = manager.targets[0]; aim(target);
assert.equal(manager.raycastBullet(camera.position, camera.getWorldDirection(new THREE.Vector3())).bot, target);
manager.update(.12); assert(hit(target)); assert.equal(manager.reactions[0], 120);
start('reflex_micro'); manager.update(.7); target = manager.targets[0];
camera.aspect = 16 / 9; camera.updateProjectionMatrix(); manager.setViewportHeight(1080);
const resized = target.group.position.clone().project(camera);
assert(Math.abs(Math.hypot(resized.x * 1920 / 2, resized.y * 1080 / 2) - 10) < 1e-6, 'resizing preserves the micro offset in pixels');

start('wall_two'); const pair = [...manager.targets];
hit(pair[0]); assert.equal(manager.targets.length, 1, 'the first elimination keeps the remaining duel target');
hit(pair[1]); assert.equal(manager.targets.length, 0); manager.update(.25); assert.equal(manager.targets.length, 2);

for (const mode of ['centering', 'controlsphere']) {
  start(mode);
  for (let i = 0; i < 120; i++) { aim(manager.targets[0]); manager.update(1 / 120); }
  assert(manager.timeOnTarget > .95 && manager.score > 950, 'continuous tracking scores without shots');
  const score = manager.score; hit(manager.targets[0]); assert.equal(manager.score, score, 'shooting does not inflate tracking scores');
  camera.lookAt(15, 14, -4); manager.update(.2); assert.equal(manager.score, score, 'off-target tracking earns no points');
}
manager.variants.controlsphere = 'thin'; start('controlsphere');
for (let i = 0; i < 200; i++) { manager.update(.01); assert(Math.abs(manager.targets[0].local.y) <= .071, 'Thin Gauntlet isolates horizontal stability'); }

start('vertical_strafes'); let min = Infinity, max = -Infinity;
for (let i = 0; i < 300; i++) { manager.update(.01); min = Math.min(min, manager.targets[0].local.y); max = Math.max(max, manager.targets[0].local.y); }
assert(max - min > 3, 'vertical strafe covers meaningful elevation changes');

start('floating_heads'); target = manager.targets[0];
manager.update(target.landTime / 2); assert(Math.abs(target.local.y - target.dropHeight * .75) < 1e-6, 'drops follow gravity');
assert.equal(hit(target), false, 'early airborne shots cannot score');
manager.update(target.landTime / 2 - .01); assert(hit(target)); assert.equal(manager.landings, 1); assert(manager.score > 1000);
start('floating_heads'); target = manager.targets[0]; manager.update(target.landTime + target.window + .01);
assert.equal(manager.expired, 1, 'missing the landing window expires the target');
manager.clearAll();

// Verify the same entry points used by the firearm ray, mode selector and restart.
globalThis.window = { addEventListener() {}, innerHeight: 720 };
const sound = { playTargetPop() {}, playGunfire() {}, playKnifeSlash() {} };
const map = new MapManager(scene), bots = new BotManager(scene, sound);
const player = { camera, currentEyeHeight: 1.7, position: camera.position, velocity: new THREE.Vector3(),
  setColliders(colliders) { this.colliders = colliders; }, setPosition(x, y, z) { camera.position.set(x, y + 1.7, z); },
  setLookAngles() { camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -1))); } };
const weapon = { ammo: 25, refillMagOnKill() { this.ammo = 25; } };
const game = new GameModeManager(map, bots, player, weapon, sound, {});
game.startMode('wall_two'); assert.equal(player.aimOnly, false);
game.registerShot({ bot: game.skillTaskManager.targets[0] }); assert.equal(game.hits, 1); assert.equal(game.headshots, 1); assert.equal(game.score, 1000);
game.startMode('centering'); assert.equal(game.skillTaskManager.targets.length, 1); assert.equal(game.score, 0);
game.startMode('gridshot'); assert.equal(player.aimOnly, false); assert.equal(game.skillTaskManager.enabled, false);
map.clearMap(); bots.clearAll();
console.log('Skill task checks passed: all 9 modes and difficulties, confirmation/cadence, ADAD brakes, short health and switch bonus, pixel offsets/deadlines, pair reload, continuous tracking, vertical paths, landing windows, hitboxes and lifecycle integration.');
