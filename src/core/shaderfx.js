// Shared look-dev shader pieces: sun/rim uniforms the sky feeds every frame, a Fresnel rim light for
// characters, monsters and pets, height fog patched into three's fog chunks, and a tiny generated sky
// environment (PMREM) that gives those characters soft reflections on medium/high. (It is not
// scene.environment: in three r186 that would also tint and slow down every Lambert world material.)
import * as THREE from 'three';

// World-space uniforms fed by world/sky.js each frame (shared objects: every patched material reads them).
export const LOOK = {
  sunDir: { value: new THREE.Vector3(40, 80, -30).normalize() }, // towards the sun
  sunColor: { value: new THREE.Color(1, 0.94, 0.84) },
  rimColor: { value: new THREE.Color(0.85, 0.92, 1) },
  skyColor: { value: new THREE.Color(0.75, 0.88, 1) }, // sky near the horizon (water reflections)
  envScale: { value: 1 }, // sky reflections dim in dark zones
};

let ENV = null; // sky environment texture (medium/high), see setSkyEnvironment
const envMats = new Set(); // rim-lit Standard materials that use it (re-pointed after a context restore)

// ------------------------------------------------------------------ rim light

const RIM_PARS = '#include <common>\nuniform vec3 uRimColor;\nuniform vec3 uRimSun;\nuniform float uRimK;';
// the sky environment's strength follows the zone (a macro, so three's own envMapIntensity uniform stays put)
const ENV_PARS = '#include <envmap_common_pars_fragment>\n#ifdef USE_ENVMAP\nuniform float uEnvScale;\n#define envMapIntensity ( envMapIntensity * uEnvScale )\n#endif';
const RIM_FRAG = `#include <emissivemap_fragment>
{
  // Fresnel rim, brighter on the sun side and on the sides (tops are lit already), so characters read
  // against busy ground and in dark zones
  float rimF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
  vec3 rimSun = normalize( ( viewMatrix * vec4( uRimSun, 0.0 ) ).xyz );
  float rimUp = saturate( ( vec4( normal, 0.0 ) * viewMatrix ).y );
  totalEmissiveRadiance += uRimColor * pow( rimF, 2.5 ) * ( 0.4 + 0.6 * saturate( dot( normal, rimSun ) + 0.4 ) ) * ( 1.0 - 0.9 * rimUp ) * uRimK;
}`;
const NOOP = THREE.Material.prototype.onBeforeCompile;

/**
 * Adds the shared rim light to a lit built-in material (Standard / Lambert / Phong), keeping any patch it
 * already has, and (Standard, medium/high) the sky environment. k: rim strength (a per-material uniform, so
 * every strength shares one program).
 */
export function rimLit(mat, k = 0.55) {
  if (!mat || mat.userData.rimLit || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return mat;
  const prev = mat.onBeforeCompile;
  const key = prev === NOOP ? 'rim' : 'rim|' + mat.customProgramCacheKey();
  mat.userData.rimLit = true;
  mat.userData.rimK = { value: k };
  if (ENV && mat.isMeshStandardMaterial && !mat.envMap) {
    mat.envMap = ENV;
    mat.envMapIntensity = 0.26;
    envMats.add(mat);
    mat.addEventListener('dispose', () => envMats.delete(mat));
  }
  mat.onBeforeCompile = function (sh, renderer) {
    if (prev !== NOOP) prev.call(this, sh, renderer);
    sh.uniforms.uRimColor = LOOK.rimColor;
    sh.uniforms.uRimSun = LOOK.sunDir;
    sh.uniforms.uRimK = this.userData.rimK;
    sh.uniforms.uEnvScale = LOOK.envScale;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', RIM_PARS)
      .replace('#include <emissivemap_fragment>', RIM_FRAG)
      .replace('#include <envmap_common_pars_fragment>', ENV_PARS);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** rimLit() on every lit material under an object (shared materials are patched once). */
export function rimLitTree(root, k) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material.forEach((m) => rimLit(m, k));
    else rimLit(o.material, k);
  });
  return root;
}

// ------------------------------------------------------------------ height fog

let fogPatched = false;
/**
 * Height fog: the haze settles low, so tall things in the distance (cliffs, trees, arches) rise out of it.
 * It only thins the middle of the fog range (fully clear and fully fogged stay put), so nothing pops when
 * whole areas are culled past the fog. Patches three's shared fog chunks once, before anything compiles.
 */
export function installHeightFog(amount = 0.22) {
  if (fogPatched || !(amount > 0)) return;
  fogPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogH;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogH = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).y + cameraPosition.y;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogH;');
  C.fog_fragment = C.fog_fragment.replace(
    'gl_FragColor.rgb = mix(',
    `fogFactor -= ${amount.toFixed(3)} * smoothstep( 4.0, 60.0, vFogH ) * 4.0 * fogFactor * ( 1.0 - fogFactor );\n\tgl_FragColor.rgb = mix(`,
  );
}

// ------------------------------------------------------------------ environment

/** Use `tex` as the sky environment for rim-lit Standard materials made from now on (and the existing ones). */
export function setSkyEnvironment(tex) {
  ENV = tex || null;
  for (const m of envMats) m.envMap = ENV;
}

/**
 * A small, soft outdoor sky (bright zenith, white horizon band, warm sun spot, dim ground) prefiltered with
 * PMREM once, so plastic and skin pick up gentle sky reflections.
 */
export function skyEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 sky = mix(vec3(1.0, 0.98, 0.94), vec3(0.42, 0.64, 1.0), smoothstep(0.0, 0.75, h));
        vec3 ground = mix(vec3(0.55, 0.56, 0.5), vec3(0.26, 0.28, 0.24), smoothstep(0.0, -0.6, h));
        vec3 c = h > 0.0 ? sky : ground;
        c += vec3(1.0, 0.93, 0.78) * (pow(max(dot(d, normalize(vec3(0.45, 0.75, -0.35))), 0.0), 48.0) * 5.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const geo = new THREE.SphereGeometry(10, 24, 12);
  scene.add(new THREE.Mesh(geo, mat));
  const rt = pm.fromScene(scene, 0.02, 0.1, 100, { size: 64 });
  pm.dispose();
  mat.dispose();
  geo.dispose();
  return rt.texture;
}
