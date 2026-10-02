// Optical magnification: divide the tangent of the half-FOV, not the angle itself.
export function verticalFov(horizontalFov, aspect, zoom = 1) {
  return 2 * Math.atan(Math.tan(horizontalFov * Math.PI / 360) / (aspect * zoom)) * 180 / Math.PI;
}

export const ADS_PROFILES = Object.freeze({
  vandal:  { zoom: 1.25, fireRateMultiplier: .9, sightY: .121 },
  phantom: { zoom: 1.25, fireRateMultiplier: .9, sightY: .121 },
  spectre: { zoom: 1.25, fireRateMultiplier: .9, sightY: .140 },
  // The Guardian has no ADS fire rate penalty (Riot patch 4.0).
  guardian: { zoom: 1.5, fireRateMultiplier: 1, sightY: .168 },
  operator: { zoom: 2.5, fireRateMultiplier: 1, scoped: true },
});
