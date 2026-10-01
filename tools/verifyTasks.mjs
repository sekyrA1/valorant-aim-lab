import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';
import { GameModeManager, MODES } from '../src/gameModes.js';
import { isBotPlacementClear } from '../src/spawnSafety.js';

globalThis.window = { addEventListener() {} };

const scene = new THREE.Scene();
const maps = new MapManager(scene);
const sound = new Proxy({}, { get: () => () => {} });
const bots = new BotManager(scene, sound);
const camera = new THREE.PerspectiveCamera();
const player = {
  camera, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  setColliders() {},
  setPosition(x, y, z) {
    this.position.set(x, y + 1.7, z);
    camera.position.copy(this.position);
  },
  setLookAngles() {}
};
const weapon = { ammo: 30, refillMagOnKill() {} };
const manager = new GameModeManager(maps, bots, player, weapon, sound, {});
const assertTacticalClear = label => {
  for (const bot of bots.bots) {
    if (bot.type !== 'tactical_bot') continue;
    assert.ok(isBotPlacementClear(bot.group.position, maps.colliders),
      `${label}: bot inside collider at ${bot.group.position.toArray()}`);
  }
};

for (const difficulty of ['easy', 'normal', 'hard']) {
  manager.setDifficulty(difficulty);
  for (let run = 0; run < 8; run++) {
    for (const mode of Object.values(MODES)) {
      manager.startMode(mode);
      assertTacticalClear(`${difficulty}/${mode}`);
      if (mode === MODES.VOLTAIC_STATIC || mode === MODES.VOLTAIC_PASU || mode === MODES.VOLTAIC_SWITCH) {
        for (let i = 0; i < bots.bots.length; i++) {
          for (let j = i + 1; j < bots.bots.length; j++) {
            const a = bots.bots[i].group.position;
            const b = bots.bots[j].group.position;
            assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 1,
              `${difficulty}/${mode}: overlapping targets`);
          }
        }
      }
    }
  }
  manager.startMode(MODES.YPRAC_PREAIM);
  for (let i = 0; i < manager.ypracPreaimCheckpoints.length; i++) {
    manager.startYpracPreaimCheckpoint(i);
    assertTacticalClear(`${difficulty}/preaim/${i}`);
  }
  manager.startMode(MODES.YPRAC_PEEK_DUEL);
  for (let i = 0; i < manager.ypracDuelPositions.length; i++) {
    manager.startYpracDuelRound(i);
    assertTacticalClear(`${difficulty}/duel/${i}`);
  }
  manager.startMode(MODES.YPRAC_SPRAY);
  for (let i = 0; i < manager.ypracSpraySets.length; i++) {
    manager.startYpracSpraySet(i);
    assertTacticalClear(`${difficulty}/spray/${i}`);
  }
  manager.startMode(MODES.YPRAC_DEFENSE);
  for (let wave = 1; wave <= 3; wave++) {
    manager.startDefenseWave(wave);
    assertTacticalClear(`${difficulty}/defense/${wave}`);
  }
  for (let frame = 0; frame < 180; frame++) {
    bots.update(1 / 60, player.position, () => {}, maps.colliders);
    for (const bot of bots.bots) {
      assert.ok(isBotPlacementClear(bot.group.position, maps.colliders),
        `${difficulty}/defense: moving bot entered collider`);
    }
  }
}

for (let run = 0; run < 10; run++) {
  for (const scenario of ['ascent_main', 'ascent_heaven', 'tight_pixel', 'unpredictable']) {
    const data = maps.buildHoldPixelArena(scenario);
    assert.ok(isBotPlacementClear(data.peekStart, maps.colliders), `${scenario}: start inside collider`);
    assert.ok(isBotPlacementClear(data.peekEnd, maps.colliders), `${scenario}: end inside collider`);
    for (let t = 0; t <= 20; t++) {
      const point = data.peekStart.clone().lerp(data.peekEnd, t / 20);
      assert.ok(isBotPlacementClear(point, maps.colliders), `${scenario}: peek crosses collider`);
    }
    bots.clearAll();
    player.setPosition(data.spawnPos.x, data.spawnPos.y, data.spawnPos.z);
    const peeker = bots.spawnPeekingBot(data.peekStart, data.peekEnd, 0,
      data.strafeSpeed, data.isJiggle);
    for (let frame = 0; frame < 240 && !peeker.hasEmerged; frame++) {
      bots.update(1 / 60, player.position, () => {}, maps.colliders);
    }
    assert.ok(peeker.hasEmerged, `${scenario}: bot never becomes visible`);
  }
}

console.log('14 modes × 3 difficulties × 8 spawn rounds, defense movement and Hold paths: OK');
