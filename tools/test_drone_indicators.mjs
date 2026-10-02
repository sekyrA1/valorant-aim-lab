import assert from 'node:assert/strict';
import * as THREE from 'three';
import { projectDroneIndicator } from '../src/droneIndicators.js';
import { DroneManager } from '../src/drones.js';
import { DIFFICULTIES } from '../src/difficulty.js';

const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
camera.updateMatrixWorld();
const project = position => projectDroneIndicator(new THREE.Vector3(...position), camera, 1280, 720);
assert.equal(project([0, 0, -10]), null, 'visible drones have no edge marker');
assert.equal(project([100, 0, -10]).x, 1216, 'right-side drones point right');
assert.equal(project([-100, 0, -10]).x, 64, 'left-side drones point left');
assert.equal(project([0, 100, -10]).y, 64, 'high drones point up');
assert.equal(project([0, -100, -10]).y, 656, 'low drones point down');
assert.equal(project([0, 0, 10]).behind, true);
assert.equal(project([0, 0, 10]).y, 656, 'directly behind has a stable bottom marker');
assert.equal(project([100, 0, 10]).x, 1216, 'behind-right does not flip to the left');
camera.position.set(3, 1, 2);
camera.rotation.y = Math.PI / 2;
camera.updateMatrixWorld();
assert.equal(project([-7, 1, 2]), null, 'visibility follows camera movement and rotation');

const manager = new DroneManager(new THREE.Scene());
for (let i = 0; i < 8; i++) {
  const yaw = i * Math.PI / 4;
  const player = { position: new THREE.Vector3(0, 1.7, 0), yaw };
  manager.start(player, DIFFICULTIES.hard, []);
  assert.equal(manager.drones.length, 3);
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  for (const drone of manager.drones) {
    const direction = drone.group.position.clone().sub(player.position); direction.y = 0; direction.normalize();
    assert(forward.angleTo(direction) <= Math.PI / 6 + 1e-7, 'spawn stays inside 60-degree cone at every yaw');
  }
}
manager.clearAll();
console.log('Drone indicator checks passed: visible/side/high/low/behind targets, camera transforms, and 60-degree spawn cone.');
