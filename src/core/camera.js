// Roblox-style third-person orbit camera with optional gentle auto-follow and wall avoidance.
import * as THREE from 'three';
import { settings } from './settings.js';

export const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export class FollowCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = Math.PI; // camera looks along +Z when yaw = 0? see update(): camera sits behind target at -dir(yaw)
    this.pitch = 0.42;
    this.distance = 22;
    this.minDist = 8;
    this.maxDist = 48;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.lastManual = -10;
    this.time = 0;
    this.shake = 0;
    this._dir = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this.mode = 'follow'; // 'follow' | 'cinematic'
  }

  // Yaw convention matches Player.yaw: forward direction = (sin(yaw), 0, cos(yaw)).
  get forwardYaw() {
    return this.yaw;
  }

  snapBehind(playerYaw) {
    this.yaw = playerYaw;
  }

  // Swoop in from a high overview to the follow position over `duration` seconds.
  playIntro(duration = 2.4) {
    this.introDur = duration;
    this.introT = 0;
    this._introFrom = null;
  }

  addShake(amount) {
    if (reducedMotion()) return;
    this.shake = Math.min(1.5, this.shake + amount);
  }

  update(dt, input, focus, playerYaw, moving) {
    this.time += dt;
    if (input) {
      const { dx, dy } = input.takeCameraDelta();
      const sens = 0.0055 * (settings.camSensitivity || 1);
      if (dx || dy) this.lastManual = this.time;
      this.yaw -= dx * sens;
      this.pitch += dy * sens * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-0.15, Math.min(1.25, this.pitch));
      const z = input.takeZoom();
      if (z) this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * (1 + z * 0.1)));
    }
    // Gentle auto-follow: after a moment without manual orbit, drift behind the running player.
    if (settings.autoRotate && moving && this.time - this.lastManual > 1.4) {
      const d = Math.atan2(Math.sin(playerYaw - this.yaw), Math.cos(playerYaw - this.yaw));
      // don't swing around when running towards the camera
      if (Math.abs(d) < 2.2) this.yaw += d * Math.min(1, dt * 1.6);
    }
    this.target.set(focus.x, focus.y + 4.2, focus.z);
    if (this.smoothTarget.lengthSq() === 0) this.smoothTarget.copy(this.target);
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-dt * 14));

    const cp = Math.cos(this.pitch);
    this._dir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    let dist = this.distance;
    if (this.physics) {
      const hit = this.physics.raycast(this.smoothTarget, this._dir, dist);
      if (hit < dist) dist = Math.max(3, hit - 0.8);
    }
    this._pos.copy(this.smoothTarget).addScaledVector(this._dir, dist);
    if (this._pos.y < 1) this._pos.y = 1;
    if (this.introT != null && this.introT < 1) {
      if (!this._introFrom) {
        this._introFrom = new THREE.Vector3(focus.x * 0.4, 70, focus.z - 50);
        this._introLook = new THREE.Vector3(focus.x * 0.6, 0, focus.z * 0.6 + 10);
      }
      this.introT = Math.min(1, this.introT + dt / this.introDur);
      const k = this.introT < 0.5 ? 4 * this.introT ** 3 : 1 - Math.pow(-2 * this.introT + 2, 3) / 2;
      this.camera.position.lerpVectors(this._introFrom, this._pos, k);
      const look = this._introLook.clone().lerp(this.smoothTarget, k);
      this.camera.lookAt(look);
      return;
    }
    if (this.shake > 0) {
      const s = this.shake * 0.6;
      this._pos.x += (Math.random() - 0.5) * s;
      this._pos.y += (Math.random() - 0.5) * s;
      this._pos.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this.smoothTarget);
  }
}
