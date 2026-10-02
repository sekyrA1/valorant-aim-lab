import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';
import { DIFFICULTIES } from '../src/difficulty.js';
import { AntiRushManager, createRushSequence, findRushPath } from '../src/antiRush.js';
import { isBotPlacementClear } from '../src/spawnSafety.js';
import { GameModeManager, MODES } from '../src/gameModes.js';
import { PlayerController } from '../src/player.js';
import { ASCENT_A, rushGroundHeight } from '../src/ascentSite.js';

let seed = 1327;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
const variants = new Set();
for (const difficulty of Object.values(DIFFICULTIES)) {
  for (let i = 0; i < 100; i++) {
    const events = createRushSequence(difficulty, random);
    const types = events.map(event => event.type);
    assert.equal(types[0], 'drone');
    assert(types.indexOf('jettSmoke') < types.indexOf('dash'));
    assert(types.indexOf('dash') < types.indexOf('entry'));
    assert(events.every((event, index) => !index || event.at > events[index - 1].at));
    assert.equal(events.filter(event => event.type === 'entry').length, 3 + difficulty.extraTargets);
    variants.add(types.join(','));
  }
}
assert(variants.size >= 4, 'support order and omissions vary');

const sound = { playTargetPop() {}, playGunfire() {}, playKnifeSlash() {} };
globalThis.window = { addEventListener() {} };
const scene = new THREE.Scene();
const map = new MapManager(scene);
map.buildAntiRushSite();
assert.equal(map.spikeObject, null, 'anti-rush has no planted spike');
const spawn = new THREE.Vector3(ASCENT_A.mainX, 0, 18.7);
for (const target of [new THREE.Vector3(-8, 0, -12), new THREE.Vector3(8, 0, -3), new THREE.Vector3(0, 0, -19)]) {
  const path = findRushPath(spawn, target, map.colliders);
  assert(path.length > 0, 'attackers can reach positions around cover');
  assert(path.every(point => isBotPlacementClear(point, map.colliders, .48, 2.25)), 'path avoids crates and walls');
}

const player = { position: new THREE.Vector3(8, 1.7, -3), velocity: new THREE.Vector3(), yaw: Math.PI, pitch: 0,
  setColliders(colliders) { this.colliders = colliders; },
  setPosition(x, y, z) { this.position.set(x, y + 1.7, z); }, setLookAngles() {} };
const bots = new BotManager(scene, sound);
const game = new GameModeManager(map, bots, player, {}, sound, {});
game.startMode(MODES.ANTI_RUSH);
assert(player.colliders.length > map.colliders.length, 'movement barriers are player-only');
assert(player.colliders !== map.colliders);
for (const [x, z, axis, speed] of [[13.5, 9, 'x', 6], [-13.5, 9, 'x', -6], [-6, 14.45, 'z', 6], [0, -19.8, 'z', -6]]) {
  const defender = { position: new THREE.Vector3(x, rushGroundHeight(x, z, map.colliders) + 1.7, z), velocity: new THREE.Vector3(),
    colliders: player.colliders, playerRadius: .4, currentEyeHeight: 1.7 };
  defender.velocity[axis] = speed;
  PlayerController.prototype.resolveHorizontalCollisions.call(defender, axis);
  assert(defender.position.x >= -13.2 - 1e-7 && defender.position.x <= 13.2 + 1e-7);
  assert(defender.position.z >= -19.6 - 1e-7 && defender.position.z <= 14.1 + 1e-7);
}
assert(game.antiRushManager.smokeBlocks(new THREE.Vector3(ASCENT_A.mainX, 2, 12), new THREE.Vector3(ASCENT_A.mainX, 2, 20)));
const smokeMaterial = game.antiRushManager.smokes[0].group.children[0].material;
assert.equal(smokeMaterial.transparent, false, 'smoke uses opaque rendering');
assert.equal(smokeMaterial.opacity, 1);
assert.equal(smokeMaterial.depthWrite, true, 'smoke occludes geometry behind it');
assert.equal(rushGroundHeight(0, -10, map.colliders), ASCENT_A.siteHeight);
assert.equal(rushGroundHeight(0, 3, map.colliders), 0);
for (const point of findRushPath(spawn, new THREE.Vector3(0, 0, -19), map.colliders)) {
  assert.equal(point.y, rushGroundHeight(point.x, point.z, map.colliders, .48), 'navigation follows the raised site and steps');
}
const rush = game.antiRushManager;
let effects;
const outsidePosition = player.position.clone();
rush.callbacks.onEffects = value => { effects = value; };
player.position.copy(rush.smokes[0].group.position);
rush.update(.01);
assert.equal(effects.smoke, 1, 'inside smoke fully hides the world');
player.position.copy(outsidePosition);
rush.update(.01);
assert.equal(effects.smoke, 0, 'leaving the smoke restores the view');
rush.spawnUtility('flash');
const flash = rush.utilities[0];
assert(rush.applyUtilityHit(flash)?.isKilled, 'flash is destructible');
assert(!rush.utilities.includes(flash), 'destroyed utility cannot detonate later');
assert.equal(rush.flashLeft, 0);
assert.equal(rush.utilitiesDestroyed, 1);
game.antiRushManager.clearAll();

for (const difficulty of Object.values(DIFFICULTIES)) {
  let damage = 0, failed = false;
  const manager = new AntiRushManager(scene, bots, sound);
  manager.start(player, difficulty, map.colliders, { onDamage: value => { damage += value; }, onFailed: () => { failed = true; } });
  manager.launchMoreWaves = false;
  for (let time = 0; time < 21; time += .05) {
    manager.update(.05);
    for (const enemy of manager.enemies) {
      assert(isBotPlacementClear(enemy.bot.group.position, map.colliders, .42, 2.05), 'entry/hunt stays outside crates');
    }
  }
  assert(!failed, 'wave stays active until deadline');
  assert.equal(manager.enemies.length, 4 + difficulty.extraTargets);
  assert(manager.enemies.every(enemy => !['dash', 'smokeHold'].includes(enemy.phase)), 'attackers finish the dash and can engage from entry or search angles');
  assert(damage > 0, 'visible attackers pressure the defender');
  manager.clearAll();
}
let engagementDamage = 0;
const search = new AntiRushManager(scene, bots, sound);
search.start(player, DIFFICULTIES.normal, map.colliders, { onDamage: value => { engagementDamage += value; } });
search.spawnEnemy('OMEN', 1);
const seeker = search.enemies[0];
seeker.phase = 'hunt';
seeker.bot.group.position.set(0, 0, 0);
search.canSee = () => false;
const playerBefore = player.position.clone();
player.position.set(8, 1.7, -3);
search.updateEnemy(seeker, .1);
const firstMove = seeker.bot.group.position.clone();
const firstPath = seeker.path.map(point => point.toArray());
seeker.bot.group.position.set(0, 0, 0);
seeker.pathTimer = 0;
player.position.set(-8, 1.7, -12);
search.updateEnemy(seeker, .1);
assert.deepEqual(seeker.bot.group.position.toArray(), firstMove.toArray(), 'hidden player position does not steer the search');
assert.deepEqual(seeker.path.map(point => point.toArray()), firstPath, 'search route is independent of hidden player movement');
search.canSee = () => true;
const firingPosition = seeker.bot.group.position.clone();
seeker.fireTimer = 0;
search.updateEnemy(seeker, 1);
assert.deepEqual(seeker.bot.group.position.toArray(), firingPosition.toArray(), 'enemy stops moving when seeing the player');
assert(engagementDamage > 0, 'stationary visible enemy still fires');
player.position.copy(playerBefore);
search.clearAll();
let perfectWaves = 0;
const perfectDefense = new AntiRushManager(scene, bots, sound);
perfectDefense.start(player, DIFFICULTIES.normal, map.colliders, {
  onWaveCleared: perfect => { assert(perfect); perfectWaves++; }
});
perfectDefense.launchMoreWaves = false;
for (let time = 0; time < 18; time += .05) {
  perfectDefense.update(.05);
  for (const utility of [...perfectDefense.utilities]) perfectDefense.applyUtilityHit(utility);
  for (const enemy of perfectDefense.enemies) {
    if (!enemy.bot.isDead) { enemy.bot.isDead = true; bots.removeBot(enemy.bot); }
  }
}
assert.equal(perfectWaves, 1, 'clearing attackers and destroying every utility completes one perfect wave');
assert.equal(perfectDefense.waveActive, false);
assert.equal(perfectDefense.utilitiesDestroyed, perfectDefense.utilitiesSpawned);
perfectDefense.clearAll();
console.log('Anti-rush checks passed: sequence dependencies, optional support, navigation, barriers, utility cancellation, smoke occlusion, attacking AI and perfect-wave completion.');
