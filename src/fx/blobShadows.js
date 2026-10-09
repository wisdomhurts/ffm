// Soft round contact shadows under the family and the road monsters: one instanced draw call for all of them.
// On 'low' (no real shadows) they are the only thing grounding a character; with shadows on they stay as a
// faint ambient-occlusion disc under the feet. Pets draw their own (pets/models.js).
import * as THREE from 'three';

const _m = new THREE.Matrix4();

/**
 * parent: Object3D to live under. strong: true when there are no real-time shadows (settable later: slow devices
 * can lose their shadows mid-game). Per frame: begin(), add(x, groundY, z, radius, alpha) for each caster, end().
 */
export function createBlobShadows(parent, { strong = true, cap = 48 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const alpha = new Float32Array(cap);
  const aAlpha = new THREE.InstancedBufferAttribute(alpha, 1);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#141a3a') } }]),
    vertexShader: `
      attribute float aAlpha;
      varying vec2 vUv;
      varying float vA;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vA = aAlpha;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vA;
      #include <fog_pars_fragment>
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(1.0 - smoothstep(0.35, 1.0, d), 1.2) * vA;
        #if defined( USE_FOG ) && !defined( FOG_EXP2 )
        a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'blob-shadows';
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.raycast = () => {};
  mesh.count = 0; // left visible until the first end() so the match warm-up compiles its shader
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  let strength = strong ? 0.42 : 0.24;
  let n = 0;
  return {
    mesh,
    set strong(v) {
      strength = v ? 0.42 : 0.24;
    },
    begin() {
      n = 0;
    },
    add(x, y, z, r, a = 1) {
      if (n >= cap || a <= 0.01) return;
      _m.makeScale(r * 2, 1, r * 2).setPosition(x, y + 0.15, z); // above thin floor decals (paths sit up to 0.1 high)
      mesh.setMatrixAt(n, _m);
      alpha[n] = a * strength;
      n++;
    },
    end() {
      mesh.count = n;
      mesh.visible = n > 0;
      if (!n) return;
      mesh.instanceMatrix.needsUpdate = true;
      aAlpha.needsUpdate = true;
    },
    dispose() {
      parent.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
