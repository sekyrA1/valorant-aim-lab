import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainingTaskManager } from '../src/trainingTasks.js';
import { TRAINING_TASKS } from '../src/trainingCatalog.js';
import { TASK_GUIDES, GUIDED_PLAYLISTS, assessTraining } from '../src/trainingGuides.js';
import { DIFFICULTIES } from '../src/difficulty.js';
import { GameModeManager, AVAILABLE_MODES } from '../src/gameModes.js';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';
import { CustomPlaylistStore } from '../src/customPlaylists.js';
import { SKILL_TASKS } from '../src/skillTasks.js';

assert.deepEqual(Object.keys(TASK_GUIDES).sort(), [...AVAILABLE_MODES].sort(), 'every playable task has a complete lesson');
for (const lesson of Object.values(TASK_GUIDES)) {
  assert(lesson.title?.length > 0);
  for (const key of ['purpose', 'mistake', 'improve', 'goal']) assert(lesson[key]?.length > 10);
  assert.equal(lesson.steps.length, 3);
}
assert.equal(Object.keys(TRAINING_TASKS).length, 15);
assert.equal(Object.keys(GUIDED_PLAYLISTS).length, 10);
assert.deepEqual(new Set(GUIDED_PLAYLISTS.learn_complete.stages.map(stage => stage.mode)), new Set(AVAILABLE_MODES));
assert.equal(GUIDED_PLAYLISTS.learn_calibration.stages.reduce((sum, stage) => sum + stage.time, 0), 900);
assert.equal(GUIDED_PLAYLISTS.learn_overclock.stages[0].time, 600);
for (const playlist of Object.values(GUIDED_PLAYLISTS)) for (const stage of playlist.stages) {
  assert(AVAILABLE_MODES.includes(stage.mode)); assert(stage.time >= 5 && stage.time <= 600);
  if (stage.variant) assert(SKILL_TASKS[stage.mode].variants.some(([variant]) => variant === stage.variant));
}
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
const player = { camera, position: camera.position, velocity: new THREE.Vector3(), keys: { left: false, right: false }, isGrounded: true };
let beats = 0;
const tasks = new TrainingTaskManager(scene, () => .6, player, { playMetronome() { beats++; } });
const start = (mode, difficulty = DIFFICULTIES.normal, variant) => {
  camera.position.set(0, 1.7, 8); camera.lookAt(0, 1.7, -4); camera.updateMatrixWorld(true);
  player.velocity.set(0, 0, 0); player.keys.left = player.keys.right = false;
  if (variant) tasks.variants[mode] = variant;
  tasks.start(mode, camera, difficulty);
};
const aim = point => { camera.lookAt(point); camera.updateMatrixWorld(true); };
const hit = target => tasks.shot({ bot: target });
for (const [mode, metadata] of Object.entries(TRAINING_TASKS)) for (const difficulty of Object.values(DIFFICULTIES)) {
  for (const [variant] of metadata.variants || [[undefined]]) {
    start(mode, difficulty, variant);
    for (let i = 0; i < 600; i++) {
      tasks.update(1 / 120);
      for (const target of tasks.targets) {
        assert(target.group.position.toArray().every(Number.isFinite), mode);
        assert(target.radius > 0, mode);
        assert(target.group.position.y - target.radius > 0, `${mode}: targets remain above floor`);
        assert(Math.abs(target.group.position.x) < 17, mode);
      }
    }
    assert(Number.isFinite(tasks.score)); tasks.clearAll(); assert.equal(scene.children.length, 0);
    assert.equal(player.trainingSensitivity, 1); assert.equal(player.trainingNoCrosshair, false);
  }
}
start('popcorn'); let target = tasks.targets[0]; tasks.update(target.apexTime);
assert(Math.abs(target.local.y - target.launch ** 2 / (2 * target.gravity)) < 1e-6, 'ballistic apex follows gravity');
assert(hit(target)); assert.equal(tasks.apexHits, 1);
start('tough_horizontal'); let stopped = false;
for (let i = 0; i < 600; i++) { tasks.update(.01); for (const t of tasks.targets) { assert.equal(t.local.y, 0); stopped ||= t.pause > 0 && t.velocity.x === 0; } }
assert(stopped, 'wide strafes have real hard stops');
start('pressure'); target = tasks.targets[0]; const oldRadius = target.radius;
tasks.update(.15); assert(Math.abs(target.radius - oldRadius / 2) < 1e-6);
const outside = target.group.position.clone().add(new THREE.Vector3(oldRadius * .75, 0, 2));
assert.equal(tasks.raycastBullet(outside, new THREE.Vector3(0, 0, -1)), null, 'hitbox shrinks with the mesh');
tasks.update(.16); assert.equal(tasks.expired, 1); assert.equal(tasks.misses, 1);
start('underflick'); tasks.update(.3); target = tasks.targets[0]; assert(target);
assert.equal(hit(target), false, 'direct blind flick cannot bypass the approach phase');
aim(tasks.approachPoint); tasks.update(.05); assert.equal(tasks.underState, 'correct'); assert(hit(target));
assert.equal(tasks.underState, 'anchor'); assert.equal(tasks.targets.length, 0);
start('angle_strafe'); aim(tasks.targets[0].group.position); tasks.update(.05); assert.equal(tasks.score, 0, 'standing still does not earn compensation points');
player.velocity.x = 3; player.keys.right = true;
for (let i = 0; i < 30; i++) { aim(tasks.targets[0].group.position); tasks.update(.01); }
assert(tasks.score > 0); player.keys.right = false; player.keys.left = true; player.velocity.x = -3; tasks.update(.01);
assert.equal(tasks.alternations, 1);
start('pillars'); target = tasks.targets[0]; player.velocity.x = 3; assert.equal(hit(target), false); assert.equal(tasks.movingShots, 1);
player.velocity.x = 2.1; assert(hit(target), 'deadzone matches firearm threshold');
start('metronome_static', DIFFICULTIES.normal, '120'); tasks.update(.5); assert(beats > 0); assert(hit(tasks.targets[0]));
assert.equal(hit(tasks.targets[0]), false, 'one confirmed click per beat'); tasks.update(.2); assert.equal(hit(tasks.targets[0]), false, 'out-of-time click rejected');
start('accuracy_floor'); tasks.hits = 19; tasks.misses = 1; assert(tasks.metrics().accuracyFloorPassed);
tasks.hits = 1; tasks.misses = 0; assert.equal(tasks.metrics().accuracyFloorPassed, false);
tasks.hits = 299; tasks.misses = 16; assert.equal(tasks.metrics().accuracyFloorPassed, false, 'rounding cannot pass the 95% floor');
start('quiet_eye'); target = tasks.targets[0]; aim(target.group.position); tasks.update(.15); tasks.update(.49); assert.equal(tasks.quietState, 'align');
tasks.update(.02); assert.equal(tasks.quietState, 'dodge'); assert.equal(tasks.shot({ bot: target }), false);
player.velocity.x = 3; player.keys.right = true; camera.position.x += .5; tasks.update(.01); assert.equal(tasks.kills, 1);
start('dual_task', DIFFICULTIES.normal, 'serial'); tasks.update(.01); tasks.cognitiveInput(tasks.cognitiveCurrent.expected); assert.equal(tasks.cognitiveHits, 1);
tasks.cognitiveInput(false); assert.equal(tasks.cognitiveHits, 1, 'answers cannot be spammed');
start('dual_task', DIFFICULTIES.normal, 'nback'); tasks.update(.01); assert.equal(tasks.cognitiveCurrent.expected, null);
tasks.update(2); assert.equal(tasks.cognitiveCurrent.expected, null); tasks.update(2); assert.equal(tasks.cognitiveCurrent.expected, true);
start('target_blackout'); tasks.update(.2); target = tasks.targets[0]; assert.equal(target.mesh.material.colorWrite, false);
aim(target.group.position); assert.equal(tasks.raycastBullet(camera.position, camera.getWorldDirection(new THREE.Vector3())).bot, target, 'invisible path keeps its hitbox');
start('no_crosshair'); assert(player.trainingNoCrosshair); tasks.clearAll(); assert.equal(player.trainingNoCrosshair, false);
start('sens_overclock', DIFFICULTIES.normal, 'double'); assert.equal(player.trainingSensitivity, 2); tasks.clearAll(); assert.equal(player.trainingSensitivity, 1);
for (const [variant, multiplier] of [['high', 2], ['low', .5], ['native', 1]]) { start('sens_calibration', DIFFICULTIES.normal, variant); assert.equal(player.trainingSensitivity, multiplier); }
tasks.clearAll();
assert.equal(assessTraining({ mode: 'accuracy_floor', hits: 1, misses: 0, accuracy: 100 }).passed, false);
assert(assessTraining({ mode: 'accuracy_floor', hits: 19, misses: 1, accuracy: 95 }).passed);
assert.equal(assessTraining({ mode: 'pokeball', hits: 16, misses: 4, accuracy: 80, skillMetrics: { automatic: false } }).passed, false, 'Frenzy requires 85%, separate from automatic coverage');
assert.equal(assessTraining({ mode: 'metronome_static', hits: 20, misses: 0, accuracy: 100, skillMetrics: { beatHits: 20, beatError: 33 } }).metricsText, '20 cliques no ritmo • desvio médio: 33 ms');
assert.equal(assessTraining({ mode: 'dual_task', hits: 20, misses: 0, accuracy: 100, skillMetrics: { cognitiveTrials: 10, cognitiveHits: 3 } }).passed, false);
assert(assessTraining({ mode: 'breath_reset', elapsedSeconds: 30 }).practiceOnly);

globalThis.window = { addEventListener() {}, innerHeight: 720 };
Object.assign(player, { currentEyeHeight: 1.7, setColliders() {}, setPosition(x, y, z) { camera.position.set(x, y + 1.7, z); },
  setLookAngles() { camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -1))); } });
const sound = { playTargetPop() {}, playGunfire() {}, playKnifeSlash() {} };
const map = new MapManager(scene), bots = new BotManager(scene, sound);
const game = new GameModeManager(map, bots, player, {}, sound, {});
game.startMode('pillars'); assert.equal(player.aimOnly, false);
game.startMode('pressure'); assert(player.aimOnly);
game.startPlaylist('learn_calibration'); assert.equal(game.maxTime, 300); assert.equal(player.trainingSensitivity, 2);
game.startPlaylistStage(1); assert.equal(player.trainingSensitivity, .5); game.startPlaylistStage(2); assert.equal(player.trainingSensitivity, 1);
game.stopPlaylist(); game.skillTaskManager.clearAll(); assert.equal(player.trainingSensitivity, 1);
const catalog = Object.fromEntries(AVAILABLE_MODES.map(mode => [mode, { title: TASK_GUIDES[mode].title, variants: SKILL_TASKS[mode]?.variants }]));
let saved; const storage = { getItem() { return saved; }, setItem(key, value) { saved = value; } };
const store = new CustomPlaylistStore(catalog, storage);
store.save({ id: 'custom-course', title: 'Curso', stages: GUIDED_PLAYLISTS.learn_complete.stages.map(stage => ({ ...stage, difficulty: 'normal', scenario: stage.mode === 'hold_pixel' ? 'ascent_main' : undefined })) });
assert.equal(store.get('custom-course').stages.length, 35);
const code = await store.createCode(); const received = new CustomPlaylistStore(catalog, { getItem() {}, setItem() {} });
assert.equal((await received.importCode(code)).added, 1); assert.equal(received.playlists[0].stages.length, 35);
bots.clearAll(); map.clearMap();
console.log('Training checks passed: all 35 guides, 10 routines, 15 mechanics/variants/difficulties, gravity, shrinking hitboxes, underflick gating, movement deadzone, beats, 95% floor, cognitive tasks, occluded hits, sensitivity restoration and shareable curriculum.');
