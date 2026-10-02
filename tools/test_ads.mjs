import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponManager, WEAPON_TYPES } from '../src/weapons.js';
import { PlayerController } from '../src/player.js';
import { ADS_PROFILES, verticalFov } from '../src/ads.js';

let now = 10000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.document = { addEventListener() {} };
globalThis.localStorage = { getItem() { return null; } };
const sound = { playGunfire() {}, playReload() {}, playFootstep() {}, playJump() {}, playLand() {} };
function weapon(id) {
  return Object.assign(Object.create(WeaponManager.prototype), {
    currentWeaponType: WEAPON_TYPES[id], equippedSlots: {}, ammo: 25, soundManager: sound,
    isAiming: false, aimBlend: 0, aimZoom: 1, isReloading: false,
    lastShotTime: -Infinity, sprayCount: 0, timeSinceLastShot: 999, recoilAmount: 0,
    basePos: new THREE.Vector3(.22, -.22, -.45), baseRot: new THREE.Euler(),
    currentPos: new THREE.Vector3(.22, -.22, -.45), currentRot: new THREE.Euler(),
    swayCurrent: new THREE.Vector2(), swayTarget: new THREE.Vector2(),
    equipTimer: 10, shotTimer: Infinity, bobPhase: 0, animatedParts: [],
    gunMesh: new THREE.Group(), armsGroup: new THREE.Group(),
    triggerMuzzleFlash() {}, rebuildWeaponMesh() {},
  });
}
for (const [id, profile] of Object.entries(ADS_PROFILES)) {
  const w = weapon(id), hipInterval = w.getFireInterval();
  assert(w.shoot(0, true));
  w.setAiming(true);
  assert.equal(w.getFireInterval(), hipInterval / profile.fireRateMultiplier);
  const interval = w.getFireInterval();
  now += interval - .01;
  assert.equal(w.shoot(0, true), null, `${id}: ADS cadence is enforced by real shoot()`);
  now += .02;
  assert(w.shoot(0, true));
  // Toggling ADS must not clear the existing shot cooldown.
  w.setAiming(false); w.setAiming(true);
  assert.equal(w.shoot(0, true), null);
  for (let i = 0; i < 60; i++) w.update(1 / 60, 0, true);
  assert.equal(w.aimZoom, profile.zoom);
  assert.equal(w.gunMesh.visible, !profile.scoped);
  assert.equal(w.armsGroup.visible, !profile.scoped);
  if (!profile.scoped) assert(Math.abs(w.currentPos.x) < .003, `${id}: sights centered`);
  w.lastShotTime = -Infinity;
  assert(w.shoot(6.75, true).movementError > 0, `${id}: ADS does not cancel movement error`);
  w.lastShotTime = -Infinity;
  assert(w.shoot(0, false).movementError > 0);
  w.reload(); assert.equal(w.isAiming, false); assert.equal(w.isScoping, false);
  assert.equal(w.setAiming(true), false, 'cannot ADS while reloading');
  for (let i = 0; i < 100; i++) w.update(1 / 60, 0, true);
  assert.equal(w.aimZoom, 1);
  assert(w.gunMesh.visible && w.armsGroup.visible);
  w.setAiming(true, true); w.setWeapon('classic');
  assert.equal(w.aimZoom, 1); assert.equal(w.isAiming, false);
}
for (const id of ['classic', 'sheriff', 'knife']) assert.equal(weapon(id).setAiming(true), false);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
const player = new PlayerController(camera, {}, sound), original = camera.fov;
player.setAimZoom(1.25);
assert(camera.fov < original);
assert(Math.abs(Math.tan(original * Math.PI / 360) / Math.tan(camera.fov * Math.PI / 360) - 1.25) < 1e-10);
window.innerWidth = 900; window.innerHeight = 900;
player.updateCameraFov(); assert.equal(camera.fov, verticalFov(103, 1, 1.25), 'resize retains zoom');
player.setAimZoom(1); assert.equal(player.fov, 103, 'saved base FOV is untouched');
player.handleKey('KeyD', true);
const w = weapon('vandal'); w.setAiming(true);
for (let i = 0; i < 60; i++) player.update(1 / 60, w);
assert(Math.abs(player.getHorizontalSpeed() - player.RUN_SPEED * .76) < .01, 'ADS allows slower movement');
assert(player.position.x > 1);
assert.equal(player.aimZoom, 1.25);
console.log('ADS passed: actual cadence, toggle cooldown, all primary poses, scope visibility, reload/switch reset, projection/resize and movement spread.');
