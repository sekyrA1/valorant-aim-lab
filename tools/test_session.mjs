import assert from 'node:assert/strict';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { GameModeManager, MODES } from '../src/gameModes.js';
import { PlayerController } from '../src/player.js';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';
import { updateSessionFrame } from '../src/sessionLoop.js';

const listeners = new Map();
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener(type, callback) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(callback);
} };
const canvasContext = new Proxy({}, { get: () => () => {} });
globalThis.document = { addEventListener() {}, documentElement: { clientWidth: 1280, clientHeight: 720 },
  createElement() { return { style: {}, getContext() { return canvasContext; } }; },
  body: { appendChild() {}, removeChild() {}, contains() { return true; } } };
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const pending = new Map();
const originalTimers = { setTimeout, clearTimeout };
globalThis.setTimeout = (callback) => { const id = {}; pending.set(id, callback); return id; };
globalThis.clearTimeout = id => pending.delete(id);
const sound = new Proxy({}, { get: () => () => {} });
const scene = new THREE.Scene(), map = new MapManager(scene), bots = new BotManager(scene, sound);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
const player = new PlayerController(camera, {}, sound);
const weapon = { setAiming() {}, resetRecoil() {}, update() {}, getCameraRecoil() { return { pitch: 0, yaw: 0 }; } };
let reports = 0, summary;
const game = new GameModeManager(map, bots, player, weapon, sound, { onGameOver(value) { reports++; summary = value; } });
try {
  for (const mode of [MODES.DRONES, MODES.JETT_NEON, MODES.ANTI_RUSH]) {
    game.startMode(mode);
    player.handleKey('KeyD', true); player.velocity.x = 6;
    player.pendingMouseYaw = .1; player.pendingMousePitch = .1;
    game.score = 321; game.sessionTimer -= 3;
    game.scheduleModeAction(() => assert.fail('a stopped task must not spawn again'), 700);
    const previousReports = reports;
    game.onPlayerDamaged(200);
    assert.equal(game.isRunning, false, `${mode}: lethal damage stops the session`);
    assert.equal(reports, previousReports + 1);
    assert.equal(summary.score, 321); assert.equal(summary.isVictory, false);
    assert.equal(summary.elapsedSeconds, 3);
    assert.equal(player.velocity.lengthSq(), 0);
    assert(Object.values(player.keys).every(key => !key));
    assert.equal(player.pendingMouseYaw, 0); assert.equal(player.pendingMousePitch, 0);
    assert.equal(bots.bots.length, 0);
    for (const manager of [game.droneManager, game.agentPassManager, game.antiRushManager, game.skillTaskManager]) assert.equal(manager.enabled, false);
    assert.equal(game.droneManager.projectiles.length + game.agentPassManager.projectiles.length, 0);
    assert.equal(game.antiRushManager.smokes.length + game.antiRushManager.utilities.length, 0);
    assert.equal(pending.size, 0, 'pending task callbacks are cancelled on death');
    game.onPlayerDamaged(200); game.endGame(false, 'duplicate');
    assert.equal(reports, previousReports + 1, 'the result is emitted only once');
  }

  // A lethal projectile must stop AI and VFX in the same frame, even if it arrives before timeout.
  game.startMode(MODES.DRONES);
  const aiUpdate = bots.update;
  let aiTicks = 0, effectsTicks = 0;
  bots.update = () => aiTicks++;
  const drone = game.droneManager.drones[0];
  drone.aimPoint.copy(player.position);
  for (let shot = 0; shot < 2; shot++) {
    game.droneManager.launchProjectile(drone, game.difficulty);
    game.droneManager.projectiles.at(-1).group.position.copy(player.position);
  }
  game.playerHealth = 1; game.playerShield = 0;
  const vfx = { update() { effectsTicks++; } };
  updateSessionFrame(1 / 60, game, vfx);
  assert.equal(game.playerHealth, 0, 'the real projectile collision causes death');
  assert.equal(game.droneManager.projectiles.length, 0, 'the remaining volley is removed');
  assert.equal(aiTicks, 0); assert.equal(effectsTicks, 0);
  const frozenPosition = player.position.clone(), frozenTime = game.sessionTimer;
  for (let frame = 0; frame < 180; frame++) updateSessionFrame(1 / 60, game, vfx);
  assert(player.position.equals(frozenPosition)); assert.equal(game.sessionTimer, frozenTime);
  bots.update = aiUpdate;

  for (const mode of [MODES.DRONES, MODES.GRIDSHOT]) {
    game.startMode(mode);
    game.sessionTimer = .001;
    const previousReports = reports;
    updateSessionFrame(1 / 60, game, vfx);
    confetti.reset();
    assert.equal(game.isRunning, false, `${mode}: timeout also stops completely`);
    assert.equal(reports, previousReports + 1); assert.equal(summary.isVictory, true);
    assert.equal(bots.bots.length, 0); assert.equal(effectsTicks, 0);
  }

  // A visible menu blocks an otherwise running session, including keyboard movement and viewmodel updates.
  game.startMode(MODES.DRONES);
  player.handleKey('KeyD', true);
  const blockedPosition = player.position.clone(), blockedTimer = game.sessionTimer;
  for (let frame = 0; frame < 180; frame++) updateSessionFrame(1 / 60, game, vfx, true);
  assert(player.position.equals(blockedPosition)); assert.equal(game.sessionTimer, blockedTimer);
  assert.equal(effectsTicks, 0);

  // Returning to the lobby during a playlist transition must cancel the scheduled next stage.
  game.startPlaylist('session-test', { id: 'session-test', custom: true, stages: [
    { mode: MODES.DRONES, title: 'Drones', time: 10 }, { mode: MODES.HOLD_PIXEL, title: 'Hold', time: 10 }
  ] });
  game.onPlayerDamaged(200);
  assert(game.playlistTransitionTimeout);
  game.stopSession(); game.stopSession();
  assert.equal(game.activePlaylist, null); assert.equal(game.playlistTransitionTimeout, null);
  assert.equal(pending.size, 0); assert.equal(player.colliders.length, 0);
  assert.equal(map.currentMapGroup.children.length, 0);
  game.advancePlaylistStageNow(); assert.equal(game.isRunning, false);

  // Menu keystrokes cannot leak into the next task; starting another task remains usable.
  player.isPointerLocked = false;
  for (const callback of listeners.get('keydown')) callback({ code: 'KeyW' });
  assert.equal(player.keys.forward, false);
  game.startMode(MODES.DRONES);
  assert.equal(game.isRunning, true); assert(game.droneManager.enabled);
  assert(Object.values(player.keys).every(key => !key));
  updateSessionFrame(1 / 60, game, vfx);
  assert.equal(effectsTicks, 1);
  game.stopSession();
  console.log('Session checks passed: lethal damage in all combat tasks, same-frame cancellation, frozen lobby/menu, input reset, one report, cancelled spawns/playlist transitions and clean restart.');
} finally {
  Object.assign(globalThis, originalTimers);
}
