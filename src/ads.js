// Optical magnification: divide the tangent of the half-FOV, not the angle itself.
export function verticalFov(horizontalFov, aspect, zoom = 1) {
  return 2 * Math.atan(Math.tan(horizontalFov * Math.PI / 360) / (aspect * zoom)) * 180 / Math.PI;
}

export const ADS_PROFILES = Object.freeze({
  vandal:  { zoom: 1.25, fireRateMultiplier: .9, frontSightY: .121, frontSightZ: -.648, pitch: .105, depth: -.57, clearance: .024 },
  phantom: { zoom: 1.25, fireRateMultiplier: .9, frontSightY: .121, frontSightZ: -.433, pitch: .105, depth: -.57, clearance: .024 },
  spectre: { zoom: 1.25, fireRateMultiplier: .9, frontSightY: .130, frontSightZ: -.35, pitch: .105, depth: -.55, clearance: .026 },
  // The Guardian has no ADS fire rate penalty (Riot patch 4.0).
  guardian: { zoom: 1.5, fireRateMultiplier: 1, frontSightY: .159, frontSightZ: -.43, pitch: .115, depth: -.59, clearance: .029 },
  operator: { zoom: 2.5, fireRateMultiplier: 1, scoped: true },
});

// Keep the front sight on the center column, just below the reticle. Tilting
// the receiver down relative to that point opens space around the target.
export function aimPose(profile) {
  if (!profile || profile.scoped) return null;
  return {
    y: -(profile.frontSightY * Math.cos(profile.pitch) - profile.frontSightZ * Math.sin(profile.pitch)) - profile.clearance,
    z: profile.depth,
    pitch: profile.pitch,
  };
}
