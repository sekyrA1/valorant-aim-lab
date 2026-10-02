import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BotRig, registerBotModel } from '../src/botRig.js';
import { BotManager } from '../src/bots.js';
import { AgentPassManager } from '../src/agentPasses.js';
import { DIFFICULTIES } from '../src/difficulty.js';

const scene = new THREE.Scene();
const clips = ['idle','run','strafe_left','strafe_right','dash','air','slide','shoot','throw','death'];
const assets = {};
const snapshots = [];
const loader = new GLTFLoader();
const v = () => new THREE.Vector3();
function capture(rig, id, label) {
  rig.syncMatrices();
  const meshes = [];
  rig.root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    const vertices = Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,v()).applyMatrix4(mesh.matrixWorld).toArray());
    assert(vertices.flat().every(Number.isFinite), `${id}: all weighted vertices finite`);
    const bounds = new THREE.Box3().setFromPoints(vertices.map(p=>new THREE.Vector3(...p)));
    assert(bounds.getSize(v()).length() < 4, `${id}: no broken or exploding limbs`);
    meshes.push({ name: mesh.name, vertices, indices: [...mesh.geometry.index.array], color: mesh.material.color.toArray() });
  });
  snapshots.push({id,label,head:rig.headPosition().toArray(),meshes});
}
for (const kind of ['tactical','air','electric']) {
  const bytes = await fs.readFile(new URL(`../public/models/bots/${kind}.glb`, import.meta.url));
  const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength),'');
  assets[kind] = asset; registerBotModel(kind,asset);
  assert.deepEqual(asset.animations.map(a=>a.name).sort(), [...clips].sort());
  let weighted = 0, blended = 0;
  asset.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    assert.equal(mesh.skeleton.bones.length,22);
    const weights=mesh.geometry.attributes.skinWeight, indices=mesh.geometry.attributes.skinIndex;
    for (let i=0;i<weights.count;i++) {
      const ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
      assert(Math.abs(ws.reduce((a,b)=>a+b,0)-1)<1e-4);
      if (ws.filter(w=>w>.001).length>1) blended++;
      for (const joint of [indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)]) assert(joint>=0 && joint<22);
      weighted++;
    }
  });
  assert(weighted > 3000); assert(blended > 400, 'joint rings have interpolated weights');
  const group = new THREE.Group(); scene.add(group);
  const rig = new BotRig(asset, group);
  for (const clip of clips) {
    rig.setState(clip,0); rig.update(0,clip);
    for (let frame=0;frame<10;frame++) rig.update(.025,clip);
    capture(rig,`${kind}-${clip}`,`${kind} / ${clip}`);
  }
  // Independent skeleton copies are required for simultaneous bots.
  const other = new BotRig(asset, new THREE.Group());
  assert.notEqual(rig.head,other.head);
  assert.equal(rig.meshes[0].geometry,other.meshes[0].geometry,'geometry is shared, bones are not');
  const before = other.head.quaternion.clone(); rig.setState('run',0);rig.update(.17,'run');
  assert(other.head.quaternion.equals(before));
  // An additive shot must change the arm while preserving the locomotion legs.
  rig.setState('idle',0); other.setState('idle',0);
  rig.update(.1,'idle'); other.update(.1,'idle');
  rig.kind = kind === 'air' ? 'jett' : kind;
  rig.fire();
  rig.update(.1,'idle'); other.update(.1,'idle');
  const hand = rig.root.getObjectByName('hand_R');
  const otherHand = other.root.getObjectByName('hand_R');
  const handChanged = hand.getWorldPosition(v()).distanceTo(otherHand.getWorldPosition(v())) > 1e-4
    || hand.getWorldQuaternion(new THREE.Quaternion()).angleTo(otherHand.getWorldQuaternion(new THREE.Quaternion())) > 1e-4;
  assert(handChanged, `${kind}: firing animates the arm`);
  assert(rig.root.getObjectByName('shin_L').quaternion.angleTo(other.root.getObjectByName('shin_L').quaternion) < 1e-4,
    `${kind}: firing preserves the leg pose`);
  rig.dispose(); other.update(.1); other.dispose(); group.removeFromParent();
}

const sound = new Proxy({}, {get:()=>()=>{}});
const bots = new BotManager(scene,sound);
const bot = bots.spawnPeekingBot(new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0),0,4);
assert(bot.rig, 'bot manager replaces legacy solids with a skinned actor');
bot.continuousCrossing=true;
bots.update(.1,new THREE.Vector3(0,1.7,8),()=>{});
bots.update(.1,new THREE.Vector3(0,1.7,8),()=>{});
assert.equal(bot.rig.lastState,'strafe_left','animation follows actual local movement');
const head=bot.rig.headPosition();
const headHit=bots.raycastBullet(head.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1));
assert(headHit?.bot === bot, 'ray hits the animated humanoid head'); assert.equal(headHit?.zone,'head');
const miss=bots.raycastBullet(head.clone().add(new THREE.Vector3(.6,0,5)),new THREE.Vector3(0,0,-1));
assert(!miss,'old oversized rigid proxy does not remain active');
const wall={min:head.clone().add(new THREE.Vector3(-1,-1,2)),max:head.clone().add(new THREE.Vector3(1,1,3))};
assert(!bots.raycastBullet(head.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1),100,[wall]));
const clone=bots.spawnTacticalBot(2,0,0); const retainedGeometry=clone.rig.meshes[0].geometry;
bots.applyHit(bot,'head',{head:160,body:40,legs:30}); assert(bot.rig.dead);
bots.update(1,new THREE.Vector3(),()=>{});assert(!bots.bots.includes(bot));
assert.equal(clone.rig.meshes[0].geometry,retainedGeometry);assert(!clone.rig.disposed);
bots.clearAll(); assert.equal(bots.bots.length,0);

const player={position:new THREE.Vector3(0,1.7,10),velocity:new THREE.Vector3(),yaw:0};
const passes=new AgentPassManager(scene);passes.start(player,DIFFICULTIES.normal);passes.nextType='neon';passes.spawnActor();
for (const actor of passes.actors) {
  assert(actor.rig);
  actor.rig.update(.3, actor.type==='jett'?'air':'slide');
  const animatedHead=actor.rig.headPosition();
  const hit=actor.rig.raycast(animatedHead.clone().add(new THREE.Vector3(0,0,4)),new THREE.Vector3(0,0,-1));
  assert.equal(hit?.zone,'head',`${actor.type}: posed head is hittable`);
  if (actor.type==='neon') assert(actor.group.worldToLocal(animatedHead.clone()).y<1.1,'slide lowers the real head/hitbox');
  passes.applyHit(actor,'head',160);assert(actor.rig.dead);
}
passes.update(1,player,DIFFICULTIES.normal,[],()=>{},()=>{});passes.clearAll();
assert.equal(passes.actors.length,0);

if (process.argv.includes('--snapshots')) {
  await fs.mkdir(new URL('../previews/',import.meta.url),{recursive:true});
  await fs.writeFile(new URL('../previews/bot-poses.json',import.meta.url),JSON.stringify(snapshots));
}
console.log('Bot rig checks passed: three Blender skins, normalized blended weights, ten clips, independent bones, animated head/slide hitboxes, walls, recoil, death and cleanup.');
