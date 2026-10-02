import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const assets = new Map();
const waiting = new Set();
let loading;
export const BOT_MODELS = Object.freeze({ tactical: 'tactical', jett: 'air', neon: 'electric' });
const kindOf = kind => BOT_MODELS[kind] || kind;

export function registerBotModel(kind, gltf) {
  assets.set(kindOf(kind), gltf);
  for (const listener of [...waiting]) listener();
}

export function loadBotModels() {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all(Object.values(BOT_MODELS).map(async kind => {
      const asset = await loader.loadAsync(`${import.meta.env?.BASE_URL || '/'}models/bots/${kind}.glb`);
      registerBotModel(kind, asset);
    }));
  }
  return loading;
}

/** Waiters are explicitly released when an actor is removed or its task ends. */
export function attachBotRig(owner, kind = 'tactical', onAttached = () => {}) {
  const attach = () => {
    if (owner.visualsRemoved || owner.visualDisposed || owner.rig || !assets.has(kindOf(kind))) return;
    owner.rig = new BotRig(assets.get(kindOf(kind)), owner.group);
    owner.rig.kind = kind;
    onAttached(owner.rig);
    if (owner.isDead) owner.rig.die();
    waiting.delete(attach);
  };
  attach();
  if (!owner.rig) waiting.add(attach);
  return () => waiting.delete(attach);
}

/** Playback of Blender IK bakes, with independent skeletons and upper-body recoil. */
export class BotRig {
  constructor(asset, parent) {
    this.root = cloneSkeleton(asset.scene);
    this.root.name = 'BlenderSkinnedBot';
    parent.add(this.root);
    this.parent = parent;
    this.meshes = [];
    this.root.traverse(node => {
      if (!node.isMesh) return;
      node.material = Array.isArray(node.material) ? node.material.map(m => m.clone()) : node.material.clone();
      node.castShadow = true; node.receiveShadow = true; node.frustumCulled = false;
      node.userData.sharedBotGeometry = true;
      if (node.isSkinnedMesh && !node.name.startsWith('AbilityOrRifle') && !node.parent?.name.startsWith('BotWeapon')) this.meshes.push(node);
    });
    this.head = this.root.getObjectByName('head');
    this.pelvis = this.root.getObjectByName('pelvis');
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = new Map(asset.animations.map(clip => [clip.name, this.mixer.clipAction(clip)]));
    this.lastPosition = parent.position.clone();
    this.velocity = new THREE.Vector3(); this.lastState = null;
    this.dead = false; this.hitTime = 0;
    // Apply only torso/arm tracks from the additive recoil, preserving running legs.
    for (const [clipName, field] of [['shoot', 'recoil'], ['throw', 'throwAction']]) {
      const shoot = asset.animations.find(clip => clip.name === clipName);
      if (!shoot) continue;
      const recoil = shoot.clone(); recoil.name = `upper_body_${clipName}`;
      recoil.tracks = recoil.tracks.filter(track => /(?:chest|spine|clavicle|upper_arm|forearm|hand)_?/.test(track.name));
      THREE.AnimationUtils.makeClipAdditive(recoil, 0, shoot, 30);
      this[field] = this.mixer.clipAction(recoil).setLoop(THREE.LoopOnce, 1);
      this[field].clampWhenFinished = true;
      this[field].enabled = false;
    }
    this.setState('idle', 0);
    this.update(0);
  }

  setState(state, fade = .12) {
    if (state === this.lastState || !this.actions.has(state) || this.dead && state !== 'death') return;
    const next = this.actions.get(state);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(state === 'death' ? THREE.LoopOnce : THREE.LoopRepeat, state === 'death' ? 1 : Infinity);
    next.clampWhenFinished = state === 'death';
    next.play();
    if (this.base && fade > 0) this.base.crossFadeTo(next, fade, false);
    else this.base?.stop();
    this.base = next; this.lastState = state;
  }

  fire() {
    if (this.dead) return;
    (this.kind === 'jett' ? this.throwAction : this.recoil)?.reset().setEffectiveWeight(1).play();
  }
  hit() { this.hitTime = .16; }
  die() {
    if (this.dead) return;
    this.recoil?.stop(); this.throwAction?.stop(); this.setState('death', .08); this.dead = true;
  }
  get deathDuration() { return this.actions.get('death')?.getClip().duration || .8; }
  syncMatrices() {
    this.parent.updateWorldMatrix(true, false);
    // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse. The generic
    // updateWorldMatrix bypasses that override and would double actor translation.
    this.root.updateMatrixWorld(true);
  }
  headPosition(target = new THREE.Vector3()) {
    this.syncMatrices();
    return this.head ? target.set(0, .105, 0).applyMatrix4(this.head.matrixWorld) : target.copy(this.parent.position).add(new THREE.Vector3(0,1.62,0));
  }
  hitZone(point) {
    const scale = this.root.getWorldScale(new THREE.Vector3());
    if (point.distanceTo(this.headPosition()) < .19 * Math.max(scale.x, scale.y, scale.z)) return 'head';
    const local = this.root.worldToLocal(point.clone());
    const hip = this.root.worldToLocal(this.pelvis.getWorldPosition(new THREE.Vector3()));
    return local.y < hip.y - .08 ? 'legs' : 'body';
  }

  update(dt, state) {
    if (this.disposed) return;
    if (dt > 0) this.velocity.subVectors(this.parent.position, this.lastPosition).divideScalar(dt);
    this.lastPosition.copy(this.parent.position);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.dead) {
      if (!state) {
        const sideways = this.velocity.clone().applyQuaternion(this.parent.quaternion.clone().invert());
        state = speed > .15 ? (Math.abs(sideways.x) > Math.abs(sideways.z) * 1.3 ? sideways.x > 0 ? 'strafe_right' : 'strafe_left' : 'run') : 'idle';
      }
      this.setState(state);
      if (['run','strafe_left','strafe_right'].includes(state)) this.base.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 4.2, .4, 2));
    }
    this.mixer.update(dt);
    if (this.hitTime > 0 && !this.dead) {
      this.hitTime = Math.max(0, this.hitTime - dt);
      this.root.getObjectByName('chest').rotateX(-.07 * Math.sin(this.hitTime / .16 * Math.PI));
    }
    this.syncMatrices();
    for (const mesh of this.meshes) {
      mesh.skeleton.update();
      mesh.boundingSphere = null; mesh.boundingBox = null;
    }
  }

  raycast(origin, direction, range = 100) {
    this.syncMatrices();
    const hit = new THREE.Raycaster(origin, direction, .05, range).intersectObjects(this.meshes, false)[0];
    return hit ? { point: hit.point, distance: hit.distance, zone: this.hitZone(hit.point) } : null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root);
    const skeletons = new Set();
    this.root.traverse(node => {
      if (!node.isMesh) return;
      if (node.skeleton) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
    for (const skeleton of skeletons) skeleton.dispose();
    this.root.removeFromParent();
  }
}
