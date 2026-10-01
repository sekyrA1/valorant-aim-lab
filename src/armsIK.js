import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t*t*(3-2*t); };
export const GRIPS = {
  vandal: [-.055, -.075, -.25], phantom: [-.055, -.075, -.26],
  spectre: [-.045, -.075, -.19], guardian: [-.055, -.075, -.28],
  operator: [-.06, -.085, -.33], classic: [-.025, -.135, .07],
  sheriff: [-.035, -.14, .065], knife: [-.32, -.14, -.02],
};
const SERVICE = {
  vandal: [-.035,-.20,-.12], phantom: [-.035,-.19,-.05],
  guardian: [-.035,-.18,-.015], spectre: [-.035,-.18,-.045],
  operator: [-.045,-.19,-.11], classic: [-.03,-.19,.035],
  sheriff: [.085,.012,-.035],
};
export function reloadMotion(t) {
  return {
    reach:ease(t/.20)*(1-ease((t-.84)/.16)),
    extraction:ease((t-.24)/.16)*(1-ease((t-.55)/.19)),
    rack:ease((t-.73)/.07)*(1-ease((t-.85)/.10)),
  };
}

/** Analytic elbow placement; pole picks the elbow's side without iterative jitter. */
export function solveElbow(shoulder, target, pole, upper, lower) {
  const delta = target.clone().sub(shoulder);
  const distance = THREE.MathUtils.clamp(delta.length(), Math.abs(upper-lower)+1e-5, upper+lower-1e-5);
  const direction = delta.lengthSq() > 1e-12 ? delta.normalize() : V(0,0,-1);
  let bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq()<1e-10) {
    bend = Math.abs(direction.y)<.9 ? V(0,1,0) : V(1,0,0);
    bend.addScaledVector(direction,-bend.dot(direction));
  }
  bend.normalize();
  const along = (upper*upper-lower*lower+distance*distance)/(2*distance);
  const height = Math.sqrt(Math.max(0,upper*upper-along*along));
  return {
    elbow: shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height),
    wrist: shoulder.clone().addScaledVector(direction,distance),
  };
}

export class ProceduralArms {
  constructor(root, weapon, id) {
    this.root=root; this.weapon=weapon; this.id=id;
    root.updateWorldMatrix(true,true);
    const rootQ=root.getWorldQuaternion(new THREE.Quaternion());
    const inverseRootQ=rootQ.clone().invert();
    this.chains=['R','L'].map(side => {
      const upper=root.getObjectByName(side+'_upper');
      const fore=root.getObjectByName(side+'_fore');
      const hand=root.getObjectByName(side+'_hand');
      if (!upper || !fore || !hand) throw new Error('Missing deform bones in arms_rigged.glb');
      const points=[upper,fore,hand].map(b=>b.getWorldPosition(new THREE.Vector3()));
      return {side, upper,fore,hand, anchor:upper.position.clone(),
        lengths:[points[0].distanceTo(points[1]),points[1].distanceTo(points[2])],
        directions:[points[1].clone().sub(points[0]).normalize(),points[2].clone().sub(points[1]).normalize()].map(v=>v.applyQuaternion(inverseRootQ)),
        rotations:[upper,fore,hand].map(b=>inverseRootQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()))),
        fingers:Array.from({length:4},(_,i)=>Array.from({length:3},(_,j)=>root.getObjectByName(`${side}_finger${i}_${j}`))).flat()
          .concat([root.getObjectByName(side+'_thumb0'),root.getObjectByName(side+'_thumb1')])
          .filter(Boolean).map(b=>({bone:b, rest:b.quaternion.clone(),
            axis:V(1,0,0).applyQuaternion(rootQ).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert())})),
      };
    });
  }

  update({reload=0, action=0, pull=0, shot=0}) {
    this.weapon.updateWorldMatrix(true,true);
    const weaponQ=this.weapon.getWorldQuaternion(new THREE.Quaternion());
    const rootQ=this.root.getWorldQuaternion(new THREE.Quaternion());
    for (const chain of this.chains) {
      const right=chain.side==='R';
      let target=right ? V(.045,-.095,this.id==='classic'?.045:.105) : new THREE.Vector3(...GRIPS[this.id]);
      // Release, grasp the magazine/action, extract, insert, then return to foregrip.
      const {reach,extraction,rack}=reloadMotion(reload);
      if (!right && this.id!=='knife') {
        const service = new THREE.Vector3(...SERVICE[this.id]);
        if(this.id==='sheriff') {service.x+=.02*extraction;service.y-=.03*extraction;}
        else {service.y-=.14*extraction;service.z+=.035*extraction;}
        if(this.id==='operator')service.lerp(V(.085,.045,.035+.10*rack),rack);
        if(this.id==='classic')service.lerp(V(-.04,.025,-.03+.065*rack),rack);
        target.lerp(service,reach);
      }
      target=this.weapon.localToWorld(target);
      chain.upper.position.copy(chain.anchor);
      this.root.updateWorldMatrix(true,true);
      let shoulder=chain.upper.getWorldPosition(new THREE.Vector3());
      // Small shoulder protraction preserves grip during extreme equip/slash poses.
      const delta=target.clone().sub(shoulder);
      const excess=Math.max(0,delta.length()-(chain.lengths[0]+chain.lengths[1]-.004));
      if (excess>0) {
        shoulder.addScaledVector(delta.normalize(),excess);
        chain.upper.position.copy(chain.upper.parent.worldToLocal(shoulder.clone()));
      }
      const pole=this.root.localToWorld(V(right?.35:-.72,-.48,.10));
      const result=solveElbow(shoulder,target,pole,...chain.lengths);
      const desired=[result.elbow.clone().sub(shoulder).normalize(),result.wrist.clone().sub(result.elbow).normalize()];
      for (let i=0;i<2;i++) {
        const bone=i===0?chain.upper:chain.fore;
        const q=new THREE.Quaternion().setFromUnitVectors(chain.directions[i].clone().applyQuaternion(rootQ),desired[i])
          .multiply(rootQ.clone().multiply(chain.rotations[i]));
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
        bone.updateWorldMatrix(false,true);
      }
      const wristPose=new THREE.Quaternion().setFromEuler(new THREE.Euler(
        right ? -1.1 : .15-reach*.7, right ? 0 : -1.4+reach*.5, right ? -.5 : 0));
      const handWorld=weaponQ.clone().multiply(wristPose).multiply(chain.rotations[2]);
      chain.hand.quaternion.copy(chain.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handWorld));
      for (let i=0;i<chain.fingers.length;i++) {
        const finger=chain.fingers[i];
        const release=(!right && this.id!=='knife') ? Math.sin(Math.PI*reach)*.55 : 0;
        const curl=i>=12 ? .35 : (i%3===0?.45:i%3===1?1.05:.75);
        const trigger=right && i<3 ? shot*.12 : 0;
        finger.bone.quaternion.copy(finger.rest).multiply(new THREE.Quaternion().setFromAxisAngle(finger.axis,curl-release+trigger));
      }
    }
    this.root.updateWorldMatrix(false,true);
  }

  dispose() {
    this.root.traverse(node=>{ if(node.isSkinnedMesh) node.skeleton.dispose(); });
    this.root.removeFromParent();
  }
}
