import * as THREE from 'three';

export function createShotDirections(player, shot, random = Math.random) {
  const aim = player.getShotDirection(shot.recoilPitch, shot.recoilYaw);
  const right = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, aim).normalize();
  return Array.from({ length: shot.pelletCount }, () => {
    const direction = aim.clone();
    if (shot.spread > 0) {
      const angle = random() * Math.PI * 2;
      // Riot's stationary center bias is reduced to a uniform disk during movement.
      const radius = Math.pow(random(), shot.moving ? .5 : .75) * shot.spread;
      direction.addScaledVector(right, Math.cos(angle) * radius);
      direction.addScaledVector(up, Math.sin(angle) * radius);
    }
    return direction.normalize();
  });
}
