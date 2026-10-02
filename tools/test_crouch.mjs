import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController } from '../src/player.js';

globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.document = { addEventListener() {} };
globalThis.localStorage = { getItem() { return null; } };
let landings = 0;
const sound = { playJump() {}, playFootstep() {}, playLand() { landings++; } };
const makePlayer = () => new PlayerController(new THREE.PerspectiveCamera(), {}, sound);
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, message);
const run = (player, duration, fps, floor) => {
  for (let elapsed = 0; elapsed < duration - 1e-10;) {
    const dt = Math.min(1 / fps, duration - elapsed); elapsed += dt;
    player.update(dt);
    if (floor !== undefined) {
      close(player.position.y - player.currentEyeHeight, floor, 'stance never lifts or sinks the feet');
      assert(player.isGrounded, 'crouching must not create an airborne state');
      close(player.camera.position.y, player.position.y, 'camera follows the body immediately');
    }
  }
};
for (const fps of [30, 60, 144]) for (const floor of [0, 1]) {
  const player = makePlayer();
  if (floor) player.setColliders([new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, floor, 2))]);
  player.setPosition(0, floor, 0);
  player.handleKey('ControlLeft', true);
  run(player, 1 / fps, fps, floor);
  assert(player.camera.position.y < floor + player.STAND_EYE_HEIGHT, 'descent starts on the first frame');
  run(player, player.CROUCH_TRANSITION_TIME - 1 / fps, fps, floor);
  close(player.currentEyeHeight, player.CROUCH_EYE_HEIGHT, 'full crouch is reached in 120 ms at every FPS');
  run(player, .5, fps, floor);
  player.handleKey('ControlLeft', false);
  run(player, player.STAND_TRANSITION_TIME, fps, floor);
  close(player.currentEyeHeight, player.STAND_EYE_HEIGHT, 'standing finishes without residual interpolation');
  // Repeated taps reverse the transition from its current height without a jump.
  for (let i = 0; i < 5; i++) {
    player.handleKey('ControlLeft', true); run(player, .05, fps, floor);
    player.handleKey('ControlLeft', false); run(player, .05, fps, floor);
  }
  run(player, .2, fps, floor);
  close(player.currentEyeHeight, player.STAND_EYE_HEIGHT);
}
assert.equal(landings, 0, 'changing stance must not trigger landing effects or slowdown');
const crouched = makePlayer(), standing = makePlayer();
for (const p of [crouched, standing]) {
  p.setPosition(0, 2, 0); p.isGrounded = false; p.velocity.y = 3;
}
crouched.handleKey('ControlLeft', true);
run(crouched, .12, 60); run(standing, .12, 60);
close(crouched.position.y - crouched.currentEyeHeight, standing.position.y - standing.currentEyeHeight,
  'midair crouching does not change the jump trajectory');
close(crouched.velocity.y, standing.velocity.y, 'vertical velocity is unaffected');
console.log('Crouch passed: immediate camera descent, 120 ms down / 160 ms up at 30/60/144 FPS, stable feet on floor/platform, reversals without false landings and unchanged midair trajectory.');
