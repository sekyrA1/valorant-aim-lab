import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ProceduralArms, GRIPS, solveElbow } from '../src/armsIK.js';
const loader=new GLTFLoader();
async function load(name) {
  const bytes=fs.readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '')).scene;
}
const template=await load('arms_rigged');
let skins=0;
template.traverse(n=>{
  if(!n.isSkinnedMesh)return;
  skins++;
  assert.equal(n.skeleton.bones.length,34);
  const w=n.geometry.attributes.skinWeight;
  for(let i=0;i<w.count;i++) assert.ok(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5);
});
assert.ok(skins>0);
let maxError=0,poses=0;
for(const id of Object.keys(GRIPS)) {
  const camera=new THREE.Group(); camera.rotation.set(.2,.7,-.1);
  const root=clone(template);root.position.set(.22,-.22,-.45);camera.add(root);
  const weapon=new THREE.Group();weapon.position.copy(root.position);camera.add(weapon);
  const rig=new ProceduralArms(root,weapon,id);
  for(let i=0;i<=100;i++) {
    const t=i/100;
    camera.rotation.set(.6*Math.sin(t*6),t*8,.1);
    weapon.rotation.set(.22*Math.sin(t*5),.35*Math.sin(t*3),-.6*Math.sin(t*Math.PI));
    weapon.position.y=-.22-.25*Math.sin(t*Math.PI);
    rig.update({reload:t,shot:1-t,action:Math.sin(t*Math.PI),pull:1-t});
    const target=weapon.localToWorld(new THREE.Vector3(.045,-.095,id==='classic'?.045:.105));
    const actual=rig.chains[0].hand.getWorldPosition(new THREE.Vector3());
    const error=actual.distanceTo(target); maxError=Math.max(maxError,error);
    assert.ok(error<.001,`${id} wrist drift: ${error}`);
    root.traverse(n=>assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
    poses++;
  }
  rig.dispose();
}
for(const target of [new THREE.Vector3(),new THREE.Vector3(0,5,0),new THREE.Vector3(0,.1,0)]) {
  const result=solveElbow(new THREE.Vector3(),target,new THREE.Vector3(0,1,0),.36,.34);
  assert.ok(Math.abs(result.elbow.length()-.36)<1e-6);
  assert.ok(Math.abs(result.elbow.distanceTo(result.wrist)-.34)<1e-6);
}
// Export the actual Three.js skinned pose for independent Blender visual review.
const snapshots=[];
for(const [id,reload] of [['vandal',0],['classic',0],['operator',.45],['knife',0]]) {
  const scene=new THREE.Group(),root=clone(template),weapon=await load(id);
  root.position.set(.22,-.22,-.45);weapon.position.copy(root.position);
  scene.add(root,weapon);
  const rig=new ProceduralArms(root,weapon,id);
  rig.update({reload,action:Math.sin(reload*Math.PI)});
  scene.updateMatrixWorld(true);
  const meshes=[];
  scene.traverse(n=>{
    if(!n.isMesh)return;
    if(n.isSkinnedMesh)n.skeleton.update();
    const a=n.geometry.attributes.position, vertices=[];
    for(let i=0;i<a.count;i++) {
      const p=new THREE.Vector3().fromBufferAttribute(a,i);
      if(n.isSkinnedMesh)n.applyBoneTransform(i,p);
      vertices.push(p.applyMatrix4(n.matrixWorld).toArray());
    }
    meshes.push({name:n.name,vertices,indices:n.geometry.index?Array.from(n.geometry.index.array):Array.from({length:a.count},(_,i)=>i),color:n.material.color.toArray()});
  });
  snapshots.push({id,reload,meshes});
}
fs.mkdirSync(new URL('../previews/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../previews/arms-poses.json',import.meta.url),JSON.stringify(snapshots));
console.log(`${skins} skinned meshes; ${poses} poses across 8 weapons; max wrist error ${(maxError*1000).toFixed(5)} mm; singularities finite.`);
