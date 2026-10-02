import * as THREE from 'three';

export function projectDroneIndicator(position, camera, width, height) {
  const local = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = position.clone().project(camera);
  const behind = local.z >= 0;
  if (!behind && projected.z >= -1 && projected.z <= 1 &&
      Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1) return null;
  let dx = local.x * camera.projectionMatrix.elements[0];
  let dy = -local.y * camera.projectionMatrix.elements[5];
  // A drone directly behind the player points down, without projection flipping sides.
  if (Math.abs(dx) + Math.abs(dy) < .0001) dy = 1;
  const halfW = Math.max(1, width / 2 - 64);
  const halfH = Math.max(1, height / 2 - 64);
  const scale = Math.min(halfW / Math.max(.0001, Math.abs(dx)), halfH / Math.max(.0001, Math.abs(dy)));
  return { x: width / 2 + dx * scale, y: height / 2 + dy * scale,
    angle: Math.atan2(dy, dx) * 180 / Math.PI, behind,
    distance: position.distanceTo(camera.getWorldPosition(new THREE.Vector3())) };
}

export class DroneIndicators {
  constructor(container) { this.container = container; this.nodes = new Map(); }

  update(drones, camera, active, width, height) {
    camera.updateMatrixWorld();
    const shown = new Set();
    const occupied = [];
    if (active) for (const drone of drones) {
      if (drone.isDead) continue;
      const indicator = projectDroneIndicator(drone.group.position, camera, width, height);
      if (!indicator) continue;
      shown.add(drone);
      let node = this.nodes.get(drone);
      if (!node) {
        node = document.createElement('div');
        node.className = 'drone-edge-indicator';
        const arrow = document.createElement('span'); arrow.className = 'drone-edge-arrow';
        const label = document.createElement('span'); label.className = 'drone-edge-label';
        node.append(arrow, label);
        this.container.append(node);
        this.nodes.set(drone, node);
      }
      let { x, y } = indicator;
      const sideEdge = x <= 65 || x >= width - 65;
      for (const offset of [0, 44, -44, 88, -88]) {
        const candidateX = sideEdge ? x : THREE.MathUtils.clamp(x + offset * 2, 64, width - 64);
        const candidateY = sideEdge ? THREE.MathUtils.clamp(y + offset, 64, height - 64) : y;
        if (occupied.every(point => Math.abs(point.x - candidateX) > 84 || Math.abs(point.y - candidateY) > 36)) {
          x = candidateX; y = candidateY; break;
        }
      }
      occupied.push({ x, y });
      node.style.left = `${x}px`; node.style.top = `${y}px`;
      node.style.setProperty('--arrow-angle', `${indicator.angle}deg`);
      node.classList.toggle('charging', Boolean(drone.charging));
      node.lastChild.textContent = `${indicator.behind ? 'ATRÁS' : 'DRONE'} • ${Math.round(indicator.distance)}m`;
    }
    for (const [drone, node] of this.nodes) if (!shown.has(drone)) { node.remove(); this.nodes.delete(drone); }
  }
}
