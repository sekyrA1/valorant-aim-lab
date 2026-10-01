// Valorant Shooting Error Graph Engine
// Visualizes Movement Error (Blue) and Firing Error (Orange/Yellow) for each shot, exactly like Valorant's in-game graph.

export class ShootingErrorGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.history = []; // Array of shot error data
    this.maxBars = 36;
    this.visible = true;
    this.lastShotInfo = null;

    // Valorant theme colors
    this.colors = {
      movement: '#00c3ff', // Valorant Movement Error Blue
      firing: '#ff9900',   // Valorant Firing / Recoil Error Orange
      accurate: '#00ffaa', // Perfect shot green
      background: 'rgba(10, 16, 23, 0.75)',
      border: 'rgba(255, 255, 255, 0.15)',
      deadzoneLine: 'rgba(255, 70, 85, 0.5)'
    };
  }

  recordShot(data) {
    // data: { movementError, firingError, totalError, isGrounded, speed, weaponId }
    const entry = {
      timestamp: performance.now(),
      movementError: data.movementError || 0,
      firingError: data.firingError || 0,
      totalError: data.totalError || 0,
      isMovement: (data.movementError > 0.008),
      isAccurate: (data.movementError <= 0.008 && data.firingError <= 0.005)
    };

    this.history.push(entry);
    if (this.history.length > this.maxBars) {
      this.history.shift();
    }
    this.lastShotInfo = entry;
    this.render();
  }

  clear() {
    this.history = [];
    this.lastShotInfo = null;
    this.render();
  }

  render() {
    if (!this.visible || !this.canvas) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // Background panel
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Outer border
    ctx.strokeStyle = this.colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Deadzone baseline guideline at bottom (approx 20% height)
    const deadzoneY = height - 16;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, deadzoneY);
    ctx.lineTo(width, deadzoneY);
    ctx.stroke();

    // Deadzone threshold marker label
    ctx.font = '9px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillText('DEADZONE 0.0°', 6, deadzoneY - 3);

    // Draw bars
    const barWidth = 6;
    const barGap = 3;
    const totalBarSlot = barWidth + barGap;
    const startX = width - (this.history.length * totalBarSlot) - 8;

    this.history.forEach((shot, index) => {
      const x = startX + index * totalBarSlot;
      if (x < 0) return;

      // Scale height: maximum display error ~ 0.12 rad
      const maxErrorRad = 0.10;
      const totalH = Math.min(height - 24, (shot.totalError / maxErrorRad) * (height - 26));

      // Separate into Movement and Firing portions
      const moveRatio = shot.totalError > 0 ? (shot.movementError / shot.totalError) : 0;
      const moveH = totalH * moveRatio;
      const fireH = totalH - moveH;

      const baseY = deadzoneY;

      if (shot.isAccurate) {
        // Perfect shot: small bright baseline dot
        ctx.fillStyle = this.colors.accurate;
        ctx.fillRect(x, baseY - 4, barWidth, 4);
      } else {
        // Firing / Recoil error portion (at bottom)
        if (fireH > 0) {
          ctx.fillStyle = this.colors.firing;
          ctx.fillRect(x, baseY - fireH, barWidth, fireH);
        }
        // Movement error portion (stacked on top of firing error)
        if (moveH > 0) {
          ctx.fillStyle = this.colors.movement;
          ctx.fillRect(x, baseY - fireH - moveH, barWidth, moveH);
        }
      }
    });

    // Top Header info: Last Shot text
    if (this.lastShotInfo) {
      const shot = this.lastShotInfo;
      const degrees = (shot.totalError * 180 / Math.PI).toFixed(2);

      let statusText = 'PERFEITO';
      let statusColor = this.colors.accurate;

      if (shot.isMovement) {
        statusText = `ERRO DE MOVIMENTO (+${(shot.movementError * 180 / Math.PI).toFixed(1)}°)`;
        statusColor = this.colors.movement;
      } else if (!shot.isAccurate) {
        statusText = `ERRO DE RECUO (+${(shot.firingError * 180 / Math.PI).toFixed(1)}°)`;
        statusColor = this.colors.firing;
      }

      ctx.fillStyle = statusColor;
      ctx.font = 'bold 10px Rajdhani, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${degrees}° - ${statusText}`, width - 8, 14);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px Rajdhani, sans-serif';
      ctx.fillText('GRÁFICO DE ERRO DE DISPARO', 8, 14);
    }
  }
}
