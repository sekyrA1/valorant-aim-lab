// Valorant Crosshair Engine
// Renders pixel-accurate Valorant crosshairs with movement and firing error dynamics

export const DEFAULT_CROSSHAIR = {
  color: '#00ffff', // Valorant Cyan
  outlines: true,
  outlineOpacity: 0.8,
  outlineThickness: 1,
  centerDot: false,
  centerDotOpacity: 1,
  centerDotThickness: 2,
  innerLines: true,
  innerOpacity: 1.0,
  innerLength: 6,
  innerThickness: 2,
  innerOffset: 3,
  movementError: true,
  firingError: true
};

export class CrosshairRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = { ...DEFAULT_CROSSHAIR };
    this.currentOffset = this.settings.innerOffset;
    this.targetOffset = this.settings.innerOffset;
    this.loadSettings();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('valfps_crosshair');
      if (saved) {
        this.settings = { ...DEFAULT_CROSSHAIR, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load crosshair settings', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('valfps_crosshair', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save crosshair settings', e);
    }
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  // Draw crosshair on canvas with dynamic movement & recoil bloom
  render(movementErrorAmount = 0, firingErrorAmount = 0) {
    const { width, height } = this.canvas;
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);

    this.ctx.clearRect(0, 0, width, height);

    const s = this.settings;

    // Calculate dynamic offset
    let dynamicSpread = 0;
    if (s.movementError) {
      dynamicSpread += movementErrorAmount * 10;
    }
    if (s.firingError) {
      dynamicSpread += firingErrorAmount * 14;
    }

    // Smooth lerp
    this.targetOffset = s.innerOffset + dynamicSpread;
    this.currentOffset += (this.targetOffset - this.currentOffset) * 0.35;

    const offset = Math.round(this.currentOffset);
    const length = s.innerLength;
    const thickness = s.innerThickness;
    const outlineThick = s.outlineThickness;

    // Helper to draw rectangle with outline
    const drawRect = (x, y, w, h) => {
      // Outline
      if (s.outlines) {
        this.ctx.fillStyle = `rgba(0, 0, 0, ${s.outlineOpacity})`;
        this.ctx.fillRect(
          x - outlineThick,
          y - outlineThick,
          w + outlineThick * 2,
          h + outlineThick * 2
        );
      }
      // Inner fill
      this.ctx.fillStyle = s.color;
      this.ctx.globalAlpha = s.innerOpacity;
      this.ctx.fillRect(x, y, w, h);
      this.ctx.globalAlpha = 1.0;
    };

    // Center Dot
    if (s.centerDot) {
      const dotThick = s.centerDotThickness;
      const dotX = Math.floor(cx - dotThick / 2);
      const dotY = Math.floor(cy - dotThick / 2);

      if (s.outlines) {
        this.ctx.fillStyle = `rgba(0, 0, 0, ${s.outlineOpacity * s.centerDotOpacity})`;
        this.ctx.fillRect(
          dotX - outlineThick,
          dotY - outlineThick,
          dotThick + outlineThick * 2,
          dotThick + outlineThick * 2
        );
      }
      this.ctx.fillStyle = s.color;
      this.ctx.globalAlpha = s.centerDotOpacity;
      this.ctx.fillRect(dotX, dotY, dotThick, dotThick);
      this.ctx.globalAlpha = 1.0;
    }

    // Inner Lines (Top, Bottom, Left, Right)
    if (s.innerLines && length > 0) {
      const halfThick = Math.floor(thickness / 2);

      // Top line
      drawRect(cx - halfThick, cy - offset - length, thickness, length);
      // Bottom line
      drawRect(cx - halfThick, cy + offset, thickness, length);
      // Left line
      drawRect(cx - offset - length, cy - halfThick, length, thickness);
      // Right line
      drawRect(cx + offset, cy - halfThick, length, thickness);
    }
  }
}
