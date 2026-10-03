import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController } from '../src/player.js';
import { WeaponManager, WEAPON_TYPES } from '../src/weapons.js';

globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.document = { addEventListener() {} };
globalThis.localStorage = { getItem() { return null; } };
const sound = { playJump() {}, playLand() {}, playFootstep() {}, playGunfire() {} };
const makePlayer = () => new PlayerController(new THREE.PerspectiveCamera(), {}, sound);
const rifle = Object.assign(Object.create(WeaponManager.prototype), {
  currentWeaponType: WEAPON_TYPES.vandal, ammo: 25, lastShotTime: -Infinity,
  soundManager: sound, isReloading: false, isAiming: false, recoilAmount: 0,
  triggerMuzzleFlash() {},
});
const records = [];
for (const fps of [30, 60, 144, 240]) {
  const player = makePlayer(), dt = 1 / fps;
  player.handleKey('KeyD', true);
  player.update(dt);
  assert(player.position.x > 0, 'movement starts on the first frame');
  let startTime = dt;
  while (player.getHorizontalSpeed() < player.RUN_SPEED - 1e-9) {
    player.update(dt); startTime += dt;
    assert(startTime < .2, 'acceleration cannot have a long easing tail');
  }
  assert(startTime <= .075, `${fps} FPS: running speed reached within 75 ms`);
  rifle.resetRecoil(); rifle.ammo = 25;
  assert(rifle.shoot(player.getHorizontalSpeed(), true).movementError > 0, 'running still causes real bullet spread');

  player.handleKey('KeyD', false);
  let stopTime = 0, accuracyTime = 0;
  while (player.getHorizontalSpeed() > 0) {
    player.update(dt); stopTime += dt;
    if (!accuracyTime && player.getHorizontalSpeed() <= rifle.getMovementThreshold()) accuracyTime = stopTime;
    assert(player.velocity.x >= 0, 'releasing the key never reverses movement');
    assert(stopTime < .2, 'release must stop completely');
  }
  assert(stopTime <= .1, `${fps} FPS: no residual slide after 100 ms`);
  assert(accuracyTime <= .07, 'stationary accuracy returns quickly, according to real speed');
  rifle.resetRecoil(); rifle.ammo = 25;
  assert.equal(rifle.shoot(player.getHorizontalSpeed(), true).movementError, 0);
  const stopped = player.position.clone();
  for (let i = 0; i < fps; i++) player.update(dt);
  assert(player.position.equals(stopped), 'no drift after releasing movement');

  player.velocity.x = player.RUN_SPEED;
  player.handleKey('KeyA', true);
  let reverseTime = 0;
  while (player.velocity.x > -player.RUN_SPEED + 1e-9) {
    player.update(dt); reverseTime += dt;
    assert(reverseTime < .3);
  }
  assert(reverseTime <= .12, `${fps} FPS: AD reversal finishes within 120 ms`);
  records.push({ fps, startMs: Math.round(startTime * 1000), stopMs: Math.round(stopTime * 1000), reverseMs: Math.round(reverseTime * 1000) });

  // Normalized diagonal movement and speed modifiers survive the faster response.
  for (const [keys, speed, aiming] of [
    [['KeyW', 'KeyD'], player.RUN_SPEED, false],
    [['KeyW', 'ShiftLeft'], player.WALK_SPEED, false],
    [['KeyW', 'ControlLeft'], player.CROUCH_SPEED, false],
    [['KeyW'], player.RUN_SPEED * .76, true],
  ]) {
    const p = makePlayer(); keys.forEach(key => p.handleKey(key, true));
    const weapon = { isAiming: aiming, currentWeaponType: WEAPON_TYPES.vandal, aimZoom: 1, update() {} };
    for (let i = 0; i < fps; i++) p.update(dt, weapon);
    assert(Math.abs(p.getHorizontalSpeed() - speed) < 1e-9);
    assert(p.velocity.z < 0, 'forward movement works with every speed modifier');
  }
  const air = makePlayer(); air.setPosition(0, 10, 0); air.isGrounded = false;
  air.handleKey('KeyW', true); air.update(dt);
  assert(air.velocity.z < 0 && air.position.z < 0, 'air control uses the forward axis of the horizontal velocity');
  assert(Number.isFinite(air.velocity.z));
}
console.table(records);
console.log('Movement passed: immediate input, fast acceleration/release/reversal, no drift, real shooting error, FPS consistency, normalized diagonals, walk/crouch/ADS caps and forward air control.');
