// Foot-level cylinder against axis-aligned map colliders. Floor contact is allowed.
export function isBotPlacementClear(point, colliders, radius = .42, height = 2.05) {
  return colliders.every(box => {
    if (box.max.y <= point.y + .04 || box.min.y >= point.y + height) return true;
    const closestX = Math.max(box.min.x, Math.min(point.x, box.max.x));
    const closestZ = Math.max(box.min.z, Math.min(point.z, box.max.z));
    const dx = point.x - closestX;
    const dz = point.z - closestZ;
    return dx * dx + dz * dz >= radius * radius;
  });
}

export function findSafeBotPlacement(point, colliders, occupied = [], options = {}) {
  const radius = options.radius ?? .42;
  const maxDistance = options.maxDistance ?? 5;
  const minSpacing = options.minSpacing ?? 1.1;
  const bounds = options.bounds ?? { minX: -16.5, maxX: 16.5, minZ: -20, maxZ: 29 };
  const valid = candidate =>
    candidate.x >= bounds.minX && candidate.x <= bounds.maxX &&
    candidate.z >= bounds.minZ && candidate.z <= bounds.maxZ &&
    isBotPlacementClear(candidate, colliders, radius) &&
    occupied.every(other => {
      if (Math.abs(other.y - candidate.y) > 2.2) return true;
      return Math.hypot(other.x - candidate.x, other.z - candidate.z) >= minSpacing;
    });

  if (valid(point)) return { ...point };
  for (let distance = .5; distance <= maxDistance; distance += .5) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const candidate = { x: point.x + Math.cos(angle) * distance,
        y: point.y, z: point.z + Math.sin(angle) * distance };
      if (valid(candidate)) return candidate;
    }
  }
  return null;
}
