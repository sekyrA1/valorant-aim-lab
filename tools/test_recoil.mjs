import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RecoilState, RECOIL_PROFILES, radians, coneRadius } from '../src/recoil.js';
import { WeaponManager, WEAPON_TYPES } from '../src/weapons.js';
import { PlayerController } from '../src/player.js';
import { createShotDirections } from '../src/ballistics.js';

const seeded = seed => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
for (const id of Object.keys(RECOIL_PROFILES)) {
  const state = new RecoilState(id, seeded(42));
  const first = state.fire(0);
  assert.equal(first.pitch, 0, `${id}: first bullet precedes recoil`);
  assert.equal(first.yaw, 0); assert.equal(first.firingError, 0);
  assert(state.camera(.016).pitch > 0, `${id}: camera recoil survives one frame`);
  const dt = WEAPON_TYPES[id].fireRateMs / 1000;
  const next = state.fire(dt);
  assert(next.pitch >= 0 && Number.isFinite(next.yaw));
  if (id !== 'operator') assert(next.pitch > 0, `${id}: rapidly repeated shots retain recoil`);
  let end = dt;
  for (let i = 2; i < WEAPON_TYPES[id].magSize; i++) { end = i * dt; state.fire(end); }
  const before = state.sample(end), middle = state.sample(end + state.duration / 2);
  assert(middle.pitch > 0 && middle.pitch < before.pitch, `${id}: gradual recentering`);
  assert.equal(state.sample(end + state.duration + .001).heat, 0);
  const reset = state.fire(end + state.duration + .001);
  assert.equal(reset.pitch, 0); assert.equal(reset.firingError, 0);
  assert.equal(state.shots, 1, 'fully recovered shot starts a new burst');
}

function spray(id, seed, fps = 60, pauseAt = -1) {
  const s = new RecoilState(id, seeded(seed)), shots = [], dt = WEAPON_TYPES[id].fireRateMs / 1000;
  let frame = 0;
  for (let i = 0; i < 50; i++) {
    const now = i * dt + (i >= pauseAt && pauseAt >= 0 ? .22 : 0);
    while (frame / fps < now) { s.camera(frame / fps); frame++; }
    shots.push(s.fire(now));
  }
  return shots;
}
for (const id of ['vandal', 'phantom', 'spectre']) {
  const a = spray(id, 1), b = spray(id, 9821);
  for (let i = 0; i < RECOIL_PROFILES[id].protected; i++) {
    assert.equal(a[i].yaw, b[i].yaw, `${id}: protected opening is reproducible`);
  }
  assert(a.some((shot, i) => Math.abs(shot.yaw - b[i].yaw) > radians(.15)), `${id}: long sprays vary between bursts`);
  assert(a.some(s => s.yaw > radians(.1)) && a.some(s => s.yaw < -radians(.1)), `${id}: switches sides`);
  const slow = spray(id, 15, 30, 19), fast = spray(id, 15, 144, 19);
  for (let i = 0; i < slow.length; i++) {
    assert(Math.abs(slow[i].yaw - fast[i].yaw) < 1e-10, `${id}: FPS cannot change yaw decisions`);
    assert(Math.abs(slow[i].pitch - fast[i].pitch) < 1e-10);
  }
  const hip = new RecoilState(id, seeded(42)), moving = new RecoilState(id, seeded(42));
  hip.fire(0); moving.fire(0, { moving: true });
  assert(Math.abs(moving.camera(.05).pitch / hip.camera(.05).pitch - 1.8) < 1e-10);
  const ads = new RecoilState(id, seeded(42));
  assert(ads.fire(0, { aiming: true }).firstSpread < hip.fire(2).firstSpread);
}
const crouched = new RecoilState('vandal', seeded(2)), standing = new RecoilState('vandal', seeded(2));
for (let i = 0; i < 25; i++) { crouched.fire(i / 9.75, { crouching: true }); standing.fire(i / 9.75); }
assert(Math.abs(crouched.camera(24 / 9.75).yaw / standing.camera(24 / 9.75).yaw - .85) < 1e-10);
const short = new RecoilState('vandal'), long = new RecoilState('vandal');
short.fire(0); for (let i = 0; i < 25; i++) long.fire(i / 9.75);
assert(long.duration > short.duration);

let now = 10000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
const sound = { playGunfire() {}, playReload() {} };
function weapon(id, ammo = WEAPON_TYPES[id].magSize) {
  return Object.assign(Object.create(WeaponManager.prototype), {
    currentWeaponType: WEAPON_TYPES[id], ammo, lastShotTime: -Infinity, soundManager: sound,
    isReloading: false, isAiming: false, recoilAmount: 0, triggerMuzzleFlash() {},
    equippedSlots: {}, basePos: new THREE.Vector3(), currentPos: new THREE.Vector3(), currentRot: new THREE.Euler(), rebuildWeaponMesh() {},
  });
}
const classic = weapon('classic');
const burst = classic.shoot(0, true, { burst: true });
assert.equal(burst.pelletCount, 3); assert.equal(classic.ammo, 9);
assert(Math.abs(burst.spread - coneRadius(1.9)) < 1e-10);
assert.equal(classic.shoot(0, true, { burst: true }), null);
assert.equal(classic.shoot(0, true), null, 'left click cannot bypass burst cooldown');
now += 499; assert.equal(classic.shoot(0, true), null);
now += 2; assert(classic.shoot(0, true));
assert.equal(weapon('classic', 2).shoot(0, true, { burst: true }).pelletCount, 2);
assert(Math.abs(weapon('classic').shoot(6.75, true, { burst: true }).movementError - coneRadius(1.3)) < 1e-10);
assert(Math.abs(weapon('classic').shoot(3.75, true, { burst: true, walking: true }).movementError - coneRadius(.6)) < 1e-10);
assert(Math.abs(weapon('classic').shoot(0, false, { burst: true }).movementError - coneRadius(2.1)) < 1e-10);
const guardian = weapon('guardian'); assert(guardian.shoot(0, true).spread > 0);
guardian.setAiming(true); now += 2000; assert.equal(guardian.shoot(0, true).spread, 0);
const op = weapon('operator'); assert.equal(op.getFireInterval(), 1000 / .6);
assert(op.shoot(0, true).spread > .08); now += 800; assert.equal(op.shoot(0, true), null);
now += 1000; op.setAiming(true); assert.equal(op.shoot(0, true).spread, 0);
now += 2000; assert(op.shoot(1.5, true).movementError > 0, 'Operator requires a slower stop');
const rifle = weapon('vandal'); rifle.shoot(0, true); now += 105; rifle.shoot(0, true);
rifle.setWeapon('classic'); assert.equal(rifle.getRecoilState().sample(now / 1000).heat, 0, 'weapon switch clears old spray');

globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.document = { addEventListener() {} };
globalThis.localStorage = { getItem() { return null; } };
const player = new PlayerController(new THREE.PerspectiveCamera(), {}, {});
player.recoilPitch = .1; player.pendingMousePitch = .05; player.pendingMouseYaw = .02;
player.applyPendingMouseInput();
assert.equal(player.pitch, -.05); assert.equal(player.yaw, -.02, 'raw mouse deltas stay unchanged during recoil');
assert.equal(player.recoilPitch, .1, 'camera recoil does not absorb or amplify input');
player.yaw = 0; player.pitch = -.03;
const expected = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(.05, -.02, 0, 'YXZ'));
assert(player.getShotDirection(.08, .02).distanceTo(expected) < 1e-10, 'bullet recoil is applied exactly once');
const directions = createShotDirections(player, { recoilPitch: .08, recoilYaw: .02, spread: 0, pelletCount: 3 });
assert.equal(directions.length, 3);
for (const direction of directions) assert(direction.distanceTo(expected) < 1e-10);
let stationaryDistance = 0, movingDistance = 0;
for (const moving of [false, true]) {
  const rng = seeded(88);
  for (let i = 0; i < 1000; i++) {
    const direction = createShotDirections(player, { recoilPitch: .08, recoilYaw: .02, spread: .02, pelletCount: 1, moving }, rng)[0];
    const angle = direction.angleTo(expected);
    assert(angle <= Math.atan(.02) + 1e-10, 'spread stays within its specified angular cone');
    if (moving) movingDistance += angle; else stationaryDistance += angle;
  }
}
assert(movingDistance > stationaryDistance * 1.1, 'movement removes stationary center bias');
player.recoilPitch = 0; player.updateRecoil(1 / 60, { getCameraRecoil: () => ({ pitch: .03, yaw: -.02 }) });
assert(player.recoilPitch > 0 && player.recoilPitch < .03);
for (let i = 0; i < 60; i++) player.updateRecoil(1 / 60, null);
assert.equal(player.recoilPitch, 0); assert.equal(player.recoilYaw, 0);
player.pitch = radians(88); player.yaw = radians(720);
assert(Number.isFinite(player.getShotDirection(.2, -.2).x), 'pitch limits and multiple yaw turns remain stable');
console.log('Recoil passed: seven profiles, reproducible openings, variable bounded yaw, FPS independence, partial/full recovery, ADS, crouch/run, shared Classic burst cadence, Operator accuracy and raw mouse compensation without duplicate recoil.');
