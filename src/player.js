import * as THREE from 'three';
import { verticalFov } from './ads.js';

export class PlayerController {
  constructor(camera, domElement, soundManager) {
    this.camera = camera;
    this.domElement = domElement;
    this.soundManager = soundManager;

    // Valorant Physical Parameters
    this.RUN_SPEED = 5.75;      // m/s
    this.WALK_SPEED = 3.75;     // m/s
    this.CROUCH_SPEED = 2.0;    // m/s
    this.ACCELERATION = 100.0;
    this.DECELERATION = 200.0;
    this.COUNTER_STRAFE_ACCELERATION = 150.0;
    this.GRAVITY = 24.0;        // snappy Valorant gravity
    this.JUMP_FORCE = 7.4;      // ~1.15m jump height

    // Eye levels
    this.STAND_EYE_HEIGHT = 1.70;
    this.CROUCH_EYE_HEIGHT = 1.10;
    this.CROUCH_TRANSITION_TIME = .12;
    this.STAND_TRANSITION_TIME = .16;
    this.currentEyeHeight = this.STAND_EYE_HEIGHT;
    this.landingDip = 0;

    // Movement state
    this.position = new THREE.Vector3(0, this.STAND_EYE_HEIGHT, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = true;
    this.isWalking = false;
    this.isCrouching = false;
    this.landingSlowdownTimer = 0;

    // Orientation
    this.pitch = 0; // Look up/down
    this.yaw = 0;   // Look left/right
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Valorant Sensitivity Settings
    this.valorantSens = 0.35;
    this.dpi = 800;
    this.fov = 103; // Horizontal FOV in 16:9
    this.aimZoom = 1;
    this.loadSettings();

    // Input state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      walk: false,
      crouch: false
    };

    // Footsteps
    this.footstepTimer = 0;

    // Bounding colliders (obstacles set by map)
    this.colliders = [];
    this.playerRadius = 0.4;

    // Weapon Recoil & Camera Kick
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.pendingMouseYaw = 0;
    this.pendingMousePitch = 0;

    this.isPointerLocked = false;
    this.initInputListeners();
    this.updateCameraFov();
  }

  loadSettings() {
    try {
      const savedSens = localStorage.getItem('valfps_sens');
      if (savedSens) this.valorantSens = parseFloat(savedSens) || 0.35;
      const savedDpi = localStorage.getItem('valfps_dpi');
      if (savedDpi) this.dpi = parseInt(savedDpi) || 800;
      const savedFov = localStorage.getItem('valfps_fov');
      if (savedFov) this.fov = parseFloat(savedFov) || 103;
    } catch (e) {
      console.warn('Failed to load player settings', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('valfps_sens', this.valorantSens.toString());
      localStorage.setItem('valfps_dpi', this.dpi.toString());
      localStorage.setItem('valfps_fov', this.fov.toString());
    } catch (e) {
      console.warn('Failed to save player settings', e);
    }
  }

  setSensitivity(sens) {
    this.valorantSens = Math.max(0.01, Math.min(5.0, sens));
    this.saveSettings();
  }

  setDpi(dpi) {
    this.dpi = Math.max(100, Math.min(6400, dpi));
    this.saveSettings();
  }

  setFov(horizontalFov) {
    this.fov = Math.max(70, Math.min(130, horizontalFov));
    this.saveSettings();
    this.updateCameraFov();
  }

  updateCameraFov() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = verticalFov(this.fov, aspect, this.aimZoom);
    this.camera.updateProjectionMatrix();
  }

  setAimZoom(zoom) {
    if (this.aimZoom === zoom) return;
    this.aimZoom = zoom;
    this.updateCameraFov();
  }

  requestPointerLock() {
    if (!this.domElement || !this.domElement.requestPointerLock) return;

    const handleRequestError = (error, requestedRawInput) => {
      if (requestedRawInput && (error.name === 'NotSupportedError' || error.name === 'TypeError')) {
        this.requestPointerLockWithRawInput(false);
        return;
      }
      console.warn('Pointer lock request failed:', error);
    };

    this.requestPointerLockWithRawInput(true, handleRequestError);
  }

  requestPointerLockWithRawInput(requestRawInput, handleError = (error) => console.warn('Pointer lock request failed:', error)) {
    try {
      const result = requestRawInput
        ? this.domElement.requestPointerLock({ unadjustedMovement: true })
        : this.domElement.requestPointerLock();

      if (result && typeof result.catch === 'function') {
        result.catch((error) => handleError(error, requestRawInput));
      }
    } catch (error) {
      handleError(error, requestRawInput);
    }
  }

  exitPointerLock() {
    if (document.exitPointerLock && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (err) {
        console.warn('Exit pointer lock error:', err);
      }
    }
  }

  initInputListeners() {
    window.addEventListener('keydown', (e) => {
      if (this.isPointerLocked) this.handleKey(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.handleKey(e.code, false);
    });

    document.addEventListener('pointerlockchange', () => {
      const isLocked = document.pointerLockElement === this.domElement;
      if (!isLocked) {
        this.resetInput();
      }
      this.isPointerLocked = isLocked;
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      this.handleMouseMove(e.movementX, e.movementY);
    });
  }

  handleKey(code, isDown) {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = isDown;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = isDown;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isDown;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isDown;
        break;
      case 'Space':
        this.keys.jump = isDown;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.walk = isDown;
        break;
      case 'ControlLeft':
      case 'ControlRight':
      case 'KeyC':
        this.keys.crouch = isDown;
        break;
    }
  }

  handleMouseMove(movementX, movementY) {
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) return;

    // Authentic Valorant sensitivity conversion
    // Valorant uses a factor of 0.07 degrees per count * sens
    const degreesPerCount = this.valorantSens * (this.trainingSensitivity || 1) * 0.07 / (this.aimZoom || 1);
    const radiansPerCount = (degreesPerCount * Math.PI) / 180;

    this.pendingMousePitch += movementY * radiansPerCount;
    this.pendingMouseYaw += movementX * radiansPerCount;
  }

  applyPendingMouseInput() {
    const deltaYaw = this.pendingMouseYaw;
    const deltaPitch = this.pendingMousePitch;
    if (deltaYaw === 0 && deltaPitch === 0) return;

    // Apply the complete relative mouse delta on the next camera update.
    // Carrying part of a large delta into later frames makes the camera keep
    // turning after the physical mouse movement has already ended.
    this.pendingMouseYaw = 0;
    this.pendingMousePitch = 0;

    // Raw input always changes the same base aim, including while controlling spray.
    this.pitch -= deltaPitch;
    this.yaw -= deltaYaw;

    // Pitch limit: -89° to +89°
    const maxPitch = (89 * Math.PI) / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this.updateCameraRotation();
  }

  getShotDirection(recoilPitch = 0, recoilYaw = 0) {
    const maxPitch = 89 * Math.PI / 180;
    const orientation = new THREE.Euler(THREE.MathUtils.clamp(this.pitch + recoilPitch, -maxPitch, maxPitch),
      this.yaw - recoilYaw, 0, 'YXZ');
    return new THREE.Vector3(0, 0, -1).applyEuler(orientation);
  }

  updateRecoil(dt, weaponManager) {
    const target = weaponManager?.getCameraRecoil?.() || { pitch: 0, yaw: 0 };
    const follow = 1 - Math.exp(-32 * dt);
    this.recoilPitch += (target.pitch - this.recoilPitch) * follow;
    this.recoilYaw += (target.yaw - this.recoilYaw) * follow;
    if (Math.abs(this.recoilPitch) < .00001) this.recoilPitch = 0;
    if (Math.abs(this.recoilYaw) < .00001) this.recoilYaw = 0;
  }

  updateCameraRotation() {
    // Clamp the final angle too: mouse pitch is bounded separately, but weapon
    // recoil is added afterward and could otherwise push the view past 90°.
    const maxPitch = (89 * Math.PI) / 180;
    this.euler.x = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -maxPitch, maxPitch);
    this.euler.y = this.yaw + this.recoilYaw;
    this.camera.quaternion.setFromEuler(this.euler);
  }


  setColliders(colliders) {
    this.colliders = colliders;
  }

  resetInput() {
    for (const key of Object.keys(this.keys)) this.keys[key] = false;
    this.velocity.set(0, 0, 0);
    this.pendingMouseYaw = 0;
    this.pendingMousePitch = 0;
    this.footstepTimer = 0;
  }

  setPosition(x, y, z) {
    this.position.set(x, y + this.currentEyeHeight, z);
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(this.position);
  }

  setLookAngles(yawDeg, pitchDeg = 0) {
    this.pendingMouseYaw = 0;
    this.pendingMousePitch = 0;
    this.yaw = (yawDeg * Math.PI) / 180;
    this.pitch = (pitchDeg * Math.PI) / 180;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.updateCameraRotation();
  }

  getHorizontalSpeed() {
    return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
  }

  update(dt, weaponManager) {
    this.applyPendingMouseInput();

    // 1. Determine target speed
    this.isCrouching = !this.aimOnly && this.keys.crouch;
    this.isWalking = this.keys.walk;

    // Change stance before collision resolution. Move the eye position by the
    // same amount as the body height so the feet stay put, including in the air.
    const targetHeight = this.isCrouching ? this.CROUCH_EYE_HEIGHT : this.STAND_EYE_HEIGHT;
    const heightGap = targetHeight - this.currentEyeHeight;
    const transitionTime = this.isCrouching ? this.CROUCH_TRANSITION_TIME : this.STAND_TRANSITION_TIME;
    const heightStep = (this.STAND_EYE_HEIGHT - this.CROUCH_EYE_HEIGHT) * dt / transitionTime;
    const heightDelta = Math.sign(heightGap) * Math.min(Math.abs(heightGap), heightStep);
    this.currentEyeHeight += heightDelta;
    this.position.y += heightDelta;

    const baseRun = (weaponManager && weaponManager.currentWeaponType && weaponManager.currentWeaponType.isMelee) ? 7.15 : this.RUN_SPEED;
    let targetMaxSpeed = baseRun;
    if (this.isCrouching) {
      targetMaxSpeed = this.CROUCH_SPEED;
    } else if (this.isWalking) {
      targetMaxSpeed = this.WALK_SPEED;
    }
    if (weaponManager?.isAiming) targetMaxSpeed *= .76;

    // Landing slowdown recovery
    if (this.landingSlowdownTimer > 0) {
      this.landingSlowdownTimer -= dt;
      targetMaxSpeed *= 0.72; // Valorant jump landing recovery penalty
    }

    // 2. Input movement direction in camera horizontal frame
    let wishDir = new THREE.Vector3(0, 0, 0);
    if (this.keys.forward) wishDir.z -= 1;
    if (this.keys.backward) wishDir.z += 1;
    if (this.keys.left) wishDir.x -= 1;
    if (this.keys.right) wishDir.x += 1;
    if (this.aimOnly) wishDir.set(0, 0, 0);

    if (wishDir.lengthSq() > 0) {
      wishDir.normalize();
      // Rotate wish direction by yaw
      wishDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    // 3. Acceleration & Counter-strafing / Dead-stop friction
    const currentHorizVel = new THREE.Vector2(this.velocity.x, this.velocity.z);
    const hasInput = wishDir.lengthSq() > 0;

    if (this.isGrounded) {
      if (hasInput) {
        const targetVel = new THREE.Vector2(wishDir.x * targetMaxSpeed, wishDir.z * targetMaxSpeed);
        // Opposite input brakes more sharply; normal acceleration has no easing tail.
        const diff = targetVel.clone().sub(currentHorizVel);
        const reversing = currentHorizVel.dot(targetVel) < 0;
        const maxDelta = (reversing ? this.COUNTER_STRAFE_ACCELERATION : this.ACCELERATION) * dt;
        if (diff.length() > maxDelta) {
          diff.setLength(maxDelta);
        }
        currentHorizVel.add(diff);
      } else {
        // High dead-stopping friction
        const speed = currentHorizVel.length();
        const drop = this.DECELERATION * dt;
        const newSpeed = Math.max(0, speed - drop);
        if (speed > 0) {
          currentHorizVel.multiplyScalar(newSpeed / speed);
        }
      }
    } else {
      // Air acceleration (limited in Valorant)
      if (hasInput) {
        const airAccel = 12.0 * dt;
        currentHorizVel.x += wishDir.x * airAccel;
        currentHorizVel.y += wishDir.z * airAccel;
        // Cap horizontal speed in air
        if (currentHorizVel.length() > this.RUN_SPEED) {
          currentHorizVel.setLength(this.RUN_SPEED);
        }
      }
    }

    this.velocity.x = currentHorizVel.x;
    this.velocity.z = currentHorizVel.y;

    // 4. Jump & Gravity
    if (this.isGrounded) {
      if (this.keys.jump && !this.aimOnly) {
        this.velocity.y = this.JUMP_FORCE;
        this.isGrounded = false;
        this.soundManager.playJump();
      } else {
        this.velocity.y = 0;
      }
    } else {
      this.velocity.y -= this.GRAVITY * dt;
    }

    // 5. Apply Movement & Collision Detection
    const deltaMove = this.velocity.clone().multiplyScalar(dt);
    
    // Horizontal step with collision
    this.position.x += deltaMove.x;
    this.resolveHorizontalCollisions('x');
    this.position.z += deltaMove.z;
    this.resolveHorizontalCollisions('z');

    // Vertical step
    this.position.y += deltaMove.y;

    // Floor and obstacle vertical collision
    let groundHeight = 0;
    for (const box of this.colliders) {
      // Check if player is above the box bounds horizontally
      if (
        this.position.x + this.playerRadius > box.min.x &&
        this.position.x - this.playerRadius < box.max.x &&
        this.position.z + this.playerRadius > box.min.z &&
        this.position.z - this.playerRadius < box.max.z
      ) {
        if (box.max.y <= this.position.y - this.currentEyeHeight + 0.3) {
          groundHeight = Math.max(groundHeight, box.max.y);
        }
      }
    }

    const targetEyeY = groundHeight + this.currentEyeHeight;
    if (this.position.y <= targetEyeY + 1e-6) {
      if (!this.isGrounded && this.velocity.y < -3.0) {
        // Just landed!
        this.soundManager.playLand();
        this.landingSlowdownTimer = 0.16;
        this.landingDip = 0.08;
      }
      this.position.y = targetEyeY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // 6. Landing Dip Recovery
    if (this.landingDip > 0) {
      this.landingDip = Math.max(0, this.landingDip - dt * 0.4);
    }

    // 7. Update Camera Position
    this.camera.position.set(
      this.position.x,
      this.position.y - this.landingDip,
      this.position.z
    );

    // Recoil follows the same angular state as bullets, with visual damping only.
    this.updateRecoil(dt, weaponManager);
    this.updateCameraRotation();

    // 8. Footsteps
    const horizSpeed = this.getHorizontalSpeed();
    if (this.isGrounded && horizSpeed > 0.8) {
      this.footstepTimer += dt * horizSpeed;
      const stepInterval = this.isWalking ? 2.4 : 1.9;
      if (this.footstepTimer >= stepInterval) {
        this.soundManager.playFootstep(this.isWalking ? 'walk' : 'run');
        this.footstepTimer = 0;
      }
    } else {
      this.footstepTimer = 0;
    }

    // 9. Update weapon viewmodel
    if (weaponManager) {
      weaponManager.update(dt, horizSpeed, this.isGrounded);
      this.setAimZoom(weaponManager.aimZoom ?? 1);
    }
  }

  resolveHorizontalCollisions(axis) {
    const pMinX = this.position.x - this.playerRadius;
    const pMaxX = this.position.x + this.playerRadius;
    const pMinZ = this.position.z - this.playerRadius;
    const pMaxZ = this.position.z + this.playerRadius;
    const playerFeet = this.position.y - this.currentEyeHeight;
    const playerHead = this.position.y;

    for (const box of this.colliders) {
      // Check vertical overlap
      if (playerFeet < box.max.y - 0.25 && playerHead > box.min.y) {
        // Check horizontal overlap
        if (pMaxX > box.min.x && pMinX < box.max.x && pMaxZ > box.min.z && pMinZ < box.max.z) {
          if (axis === 'x') {
            if (this.velocity.x > 0) {
              this.position.x = box.min.x - this.playerRadius;
            } else if (this.velocity.x < 0) {
              this.position.x = box.max.x + this.playerRadius;
            }
            this.velocity.x = 0;
          } else if (axis === 'z') {
            if (this.velocity.z > 0) {
              this.position.z = box.min.z - this.playerRadius;
            } else if (this.velocity.z < 0) {
              this.position.z = box.max.z + this.playerRadius;
            }
            this.velocity.z = 0;
          }
        }
      }
    }
  }
}
