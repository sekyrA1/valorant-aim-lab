import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessor {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    // Configure modern filmic tone mapping on WebGLRenderer
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Render target with proper color space & high dynamic range
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Initialize EffectComposer
    this.composer = new EffectComposer(this.renderer);

    // 1. Base Scene Render Pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 2. High-Tech Unreal Bloom Pass
    // Tuned for tactical shooter aesthetic: vibrant tracers, emissive sparks, and muzzle light
    const bloomParams = {
      threshold: 0.82,  // Only emissive / bright surfaces glow
      strength: 0.38,   // Crisp luminous bloom without washing out walls
      radius: 0.32      // Tight radiant spread around light sources
    };

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      bloomParams.strength,
      bloomParams.radius,
      bloomParams.threshold
    );
    this.composer.addPass(this.bloomPass);

    // 3. Color Management & Output Pass
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  resize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
    this.bloomPass.resolution.set(width, height);
  }

  setBloomEnabled(enabled) {
    this.bloomPass.enabled = enabled;
  }

  setBloomStrength(strength) {
    this.bloomPass.strength = strength;
  }

  setToneMappingExposure(exposure) {
    this.renderer.toneMappingExposure = exposure;
  }

  render() {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
