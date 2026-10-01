import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const expected={vandal:['magazine'],phantom:['magazine'],classic:['magazine','slide'],sheriff:['cylinder'],operator:['magazine','bolt']};
const muzzle={vandal:-.82,phantom:-.81,classic:-.25,sheriff:-.411,operator:-1.15};
for(const [name,roles] of Object.entries(expected)) {
  const bytes=fs.readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const actions=[],meshes=[];let triangles=0;
  scene.updateMatrixWorld(true);
  scene.traverse(n=>{
    if(n.userData.viewmodelRole)actions.push(n);
    if(!n.isMesh)return;
    meshes.push(n);
    const p=n.geometry.attributes.position;
    assert.ok(Array.from(p.array).every(Number.isFinite));
    triangles+=(n.geometry.index?.count??p.count)/3;
    assert.equal(n.material.emissive.getHex(),0,'Standard finish should have no emissive strips');
  });
  assert.deepEqual(actions.map(n=>n.userData.viewmodelRole).sort(),roles.sort());
  assert.ok(triangles<65000,`${name} excessive geometry`);
  const bounds=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bounds.min.z-muzzle[name])<.012,`${name} muzzle no longer matches firing effect`);
  for(const action of actions){
    const descendants=[];action.traverse(n=>{if(n.isMesh)descendants.push(n);});
    assert.ok(descendants.length);
    assert.equal(descendants.some(n=>n.userData.viewmodelRole),false,'Nested action would animate twice');
    const probe=descendants[0],before=probe.getWorldPosition(new THREE.Vector3());
    action.position.y-=.14;scene.updateMatrixWorld(true);
    assert.ok(Math.abs(probe.getWorldPosition(new THREE.Vector3()).y-before.y+.14)<1e-5);
  }
  console.log(`${name}: ${triangles} triangles, ${meshes.length} material draws, actions ${roles.join(', ')}; muzzle and transforms OK`);
}
