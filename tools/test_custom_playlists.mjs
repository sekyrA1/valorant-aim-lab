import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CustomPlaylistStore, CUSTOM_PLAYLIST_KEY, escapeHTML } from '../src/customPlaylists.js';
import { SKILL_TASKS } from '../src/skillTasks.js';
import { GameModeManager, AVAILABLE_MODES } from '../src/gameModes.js';
import { MapManager } from '../src/maps.js';
import { BotManager } from '../src/bots.js';

const catalog = Object.fromEntries(AVAILABLE_MODES.map(mode => [mode, SKILL_TASKS[mode] || { title: mode }]));
const data = new Map();
const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
const store = new CustomPlaylistStore(catalog, storage);
const draft = { id: 'custom-test', title: '<Treino & precisão>', stages: [
  { mode: 'centering', variant: 'two', time: 5, difficulty: 'hard' },
  { mode: 'pokeball', variant: 'frenzy', time: 17, difficulty: 'easy' },
  { mode: 'hold_pixel', scenario: 'tight_pixel', time: 20, difficulty: 'normal' }
] };
store.save(draft);
const loaded = new CustomPlaylistStore(catalog, storage);
assert.equal(loaded.get(draft.id).title, draft.title);
assert.deepEqual(loaded.get(draft.id).stages.map(stage => stage.mode), ['centering', 'pokeball', 'hold_pixel']);
const edited = loaded.get(draft.id); edited.stages.reverse(); edited.title = 'Editada'; loaded.save(edited);
assert.equal(loaded.playlists.length, 1, 'editing keeps the stable ID');
assert.equal(new CustomPlaylistStore(catalog, storage).get(draft.id).stages[0].scenario, 'tight_pixel');
const copy = loaded.get(draft.id); copy.stages.pop(); assert.equal(loaded.get(draft.id).stages.length, 3);
for (const change of [{ time: 0 }, { time: 601 }, { time: 5.5 }, { mode: 'unknown' }, { mode: '__proto__' }, { difficulty: 'unknown' }, { variant: 'unknown' }]) {
  assert.throws(() => loaded.save({ ...draft, stages: [{ ...draft.stages[0], ...change }] }));
}
assert.throws(() => loaded.save({ ...draft, stages: [] }));
assert.throws(() => loaded.save({ ...draft, stages: Array(41).fill(draft.stages[0]) }));
assert.throws(() => loaded.save({ ...draft, stages: [{ ...draft.stages[2], scenario: 'unknown' }] }));
const removed = loaded.remove(draft.id); assert.equal(new CustomPlaylistStore(catalog, storage).playlists.length, 0);
loaded.save(removed); assert.equal(new CustomPlaylistStore(catalog, storage).playlists.length, 1, 'undo persists');
const failing = new CustomPlaylistStore(catalog, { getItem: storage.getItem, setItem() { throw new Error('quota'); } });
assert.throws(() => failing.remove(draft.id)); assert.equal(failing.playlists.length, 1, 'failed writes preserve existing data');
storage.setItem(CUSTOM_PLAYLIST_KEY, 'bad json');
assert(new CustomPlaylistStore(catalog, storage).readProblem);
storage.setItem(CUSTOM_PLAYLIST_KEY, JSON.stringify({ version: 1, playlists: [draft, { ...draft, id: 'invalid' }] }));
assert.equal(new CustomPlaylistStore(catalog, storage).playlists.length, 1, 'bad records do not hide valid playlists');
assert.equal(escapeHTML('<img src=x> & "test"'), '&lt;img src=x&gt; &amp; &quot;test&quot;');

// Codes transfer the routine itself, without depending on browser IDs or a server.
const sharedCode = await store.createCode(draft.id);
assert.match(sharedCode, /^VALPL1\.[A-Za-z0-9_-]+$/);
const receivedData = new Map();
const receivedStorage = { getItem: key => receivedData.get(key), setItem: (key, value) => receivedData.set(key, value) };
const recipient = new CustomPlaylistStore(catalog, receivedStorage);
const imported = await recipient.importCode(`  ${sharedCode.slice(0, 20)}\n${sharedCode.slice(20)}  `);
assert.equal(imported.added, 1); assert.equal(imported.skipped, 0);
const received = recipient.get(imported.firstId);
assert.notEqual(received.id, draft.id, 'import creates its own local ID');
assert.equal(received.title, draft.title, 'Unicode and special characters survive sharing');
assert.deepEqual(received.stages, store.get(draft.id).stages, 'order, duration, difficulty, variants and scenarios survive sharing');
assert.equal(new CustomPlaylistStore(catalog, receivedStorage).playlists.length, 1, 'import persists immediately');
assert.equal((await recipient.importCode(sharedCode)).added, 0, 'same code does not duplicate a playlist');
assert.equal(recipient.playlists.length, 1);
const sameId = recipient.get(imported.firstId); sameId.title = 'Minha edição local'; recipient.save(sameId);
assert.equal((await recipient.importCode(sharedCode)).added, 1, 'an imported copy cannot overwrite an edited local playlist');
assert.equal(recipient.get(sameId.id).title, 'Minha edição local');
store.save({ ...draft, id: 'custom-second', title: 'Outra rotina' });
const allCode = await store.createCode();
assert.equal((await recipient.importCode(allCode)).added, 1, 'a bundle merges new playlists and skips existing ones');
const beforeFailure = JSON.stringify(recipient.playlists);
for (const badCode of ['', 'VALPL2.abc', 'VALPL1.not-valid', sharedCode.slice(0, -8), `${sharedCode.slice(0, -1)}!`, 'x'.repeat(131073)]) {
  await assert.rejects(() => recipient.importCode(badCode));
  assert.equal(JSON.stringify(recipient.playlists), beforeFailure, 'invalid codes leave existing playlists untouched');
}
const encodeInvalid = async payload => {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return 'VALPL1.' + Buffer.from(bytes).toString('base64url');
};
const validTuple = ['Primeira', [['gridshot', 30, 'normal', null, null]]];
const invalidTuple = ['Inválida', [['removed-task', 30, 'normal', null, null]]];
for (const payload of [null, [], [validTuple, invalidTuple], Array(101).fill(validTuple), [['Sem etapas', []]],
  [['Duração inválida', [['gridshot', '30', 'normal', null, null]]]],
  [['Task inválida', [[['gridshot'], 30, 'normal', null, null]]]],
  [['Dificuldade inválida', [['gridshot', 30, ['normal'], null, null]]]],
  [['Variante inválida', [['centering', 30, 'hard', 'unknown', null]]]],
  [['Cenário inválido', [['hold_pixel', 30, 'normal', null, 'unknown']]]], [['x'.repeat(600000), []]]]) {
  await assert.rejects(async () => recipient.importCode(await encodeInvalid(payload)));
  assert.equal(JSON.stringify(recipient.playlists), beforeFailure, 'bundle validation is atomic');
}
await assert.rejects(() => failing.importCode(allCode), /salvar/, 'quota failure leaves local data intact');
assert.equal(failing.playlists.length, 1);
await assert.rejects(() => new CustomPlaylistStore(catalog, { getItem() {} }).createCode(), /Salve/);

globalThis.window = { addEventListener() {}, innerHeight: 720 };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 150);
const sound = { playTargetPop() {}, playGunfire() {}, playKnifeSlash() {} };
const map = new MapManager(scene), bots = new BotManager(scene, sound);
const player = { camera, currentEyeHeight: 1.7, position: camera.position, velocity: new THREE.Vector3(),
  setColliders() {}, setPosition(x, y, z) { camera.position.set(x, y + 1.7, z); },
  setLookAngles() { camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -1))); } };
const game = new GameModeManager(map, bots, player, {}, sound, {});
game.setDifficulty('normal'); game.skillTaskManager.variants.centering = 'one';
const playlist = store.get(draft.id);
assert(game.startPlaylist(draft.id, playlist));
playlist.stages[0].time = 99;
assert.equal(game.maxTime, 5, 'running playlist uses a snapshot and exact duration');
assert.equal(game.difficultyId, 'hard'); assert.equal(game.skillTaskManager.variant, 'two');
game.endGame(false, 'manual');
assert(game.playlistTransitionTimeout);
game.advancePlaylistStageNow();
assert.equal(game.currentMode, 'pokeball'); assert.equal(game.maxTime, 17);
assert.equal(game.difficultyId, 'easy'); assert.equal(game.skillTaskManager.variant, 'frenzy');
game.endGame(false, 'manual');
assert.equal(game.playlistResults[1].accuracy, 0, 'no shots cannot produce perfect accuracy in a custom clicking stage');
game.stopPlaylist();
assert.equal(game.playlistTransitionTimeout, null);
assert.equal(game.difficultyId, 'normal'); assert.equal(game.skillTaskManager.variants.centering, 'one');
assert.equal(game.activePlaylist, null); assert.equal(game.customDuration, null);
assert(game.startPlaylist('pro_warmup'), 'built-in playlists still start');
game.stopPlaylist(); game.skillTaskManager.clearAll(); bots.clearAll(); map.clearMap();
console.log('Custom playlist checks passed: persistence, compressed share codes, Unicode round trip, bundles, duplicate handling, atomic validation, corruption/size limits, write failure and per-stage execution.');
