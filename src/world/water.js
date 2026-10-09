// Animated liquid shaders: the Cabo ocean around the island, plus pools (fountain, swamp, lava).
import * as THREE from 'three';
import { fogShader } from './kit.js';
import { noiseTexture } from './textures.js';
import { LOOK } from '../core/shaderfx.js';

const VERT = `
  varying vec3 vW;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const OUT = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>`;

/**
 * Ocean with turquoise shallows and animated foam at the island's shoreline.
 * island: {cx, cz, hx, hz} sharp rectangle; shoreD: distance from it where the water line sits;
 * mainlandZ: straight shoreline (cliff) to the north. hq (medium/high): ripple normals, a Fresnel sky
 * reflection and a sun glint path.
 */
export function oceanMaterial({ cx, cz, hx, hz, shoreD, mainlandZ, hq = false }) {
  return fogShader({
    defines: hq ? { OCEAN_HQ: '' } : {},
    uniforms: {
      uSky: LOOK.skyColor,
      uSunDir: LOOK.sunDir,
      uSunCol: LOOK.sunColor,
      uDeep: { value: new THREE.Color('#0f5fb8') },
      uMid: { value: new THREE.Color('#1c9fd8') },
      uShallow: { value: new THREE.Color('#46e0d2') },
      uFoam: { value: new THREE.Color('#ffffff') },
      uIsland: { value: new THREE.Vector4(cx, cz, hx, hz) },
      uShore: { value: shoreD },
      uMainZ: { value: mainlandZ },
      uNoise: { value: noiseTexture() },
    },
    vertex: VERT,
    fragment: `
      uniform vec3 uDeep, uMid, uShallow, uFoam, uSky, uSunDir, uSunCol;
      uniform vec4 uIsland; uniform float uShore, uMainZ;
      uniform sampler2D uNoise;
      varying vec3 vW;
      float sdBox(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
      void main(){
        vec2 p = vW.xz;
        float di = sdBox(p - uIsland.xy, uIsland.zw) - uShore;
        float dm = (uMainZ - p.y) - 0.3;
        float d = min(di, dm);
        float t = uTime;
        float n = texture2D(uNoise, p * 0.0028 + vec2(t * 0.0022, t * 0.0013)).r;
        float n2 = texture2D(uNoise, p * 0.0075 + vec2(-t * 0.004, t * 0.0033)).g;
        float w = n * 0.6 + n2 * 0.4;
        float sh = 1.0 - smoothstep(0.0, 70.0, d + (n - 0.5) * 16.0);
        vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.6, sh));
        col = mix(col, uShallow, smoothstep(0.55, 1.0, sh));
        col *= 0.88 + 0.24 * w;
        // sun sparkles on the crests
        float crest = smoothstep(0.66, 0.76, w + 0.06 * sin(p.x * 0.4 + t * 1.3) * sin(p.y * 0.35 - t));
        col = mix(col, vec3(0.92, 1.0, 1.0), crest * 0.22);
        #ifdef OCEAN_HQ
        {
          // ripple normals from two more taps of the same noise, then sky reflection (Fresnel) and the sun's glint path
          vec2 uvR = p * 0.0075 + vec2(-t * 0.004, t * 0.0033);
          float dx = texture2D(uNoise, uvR + vec2(0.012, 0.0)).g - n2;
          float dz = texture2D(uNoise, uvR + vec2(0.0, 0.012)).g - n2;
          vec3 N = normalize(vec3(-dx * 3.5, 1.0, -dz * 3.5));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
          // the sky tints the far water a little (keeping the sea's own deep blue), shimmering with the ripples
          col = mix(col, uSky * 0.7 + col * 0.3, fres * 0.2);
          float glint = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 220.0);
          col += uSunCol * glint * 1.3 * (1.0 - fres * 0.5);
        }
        #endif
        // shoreline foam: a solid lip plus rolling bands
        float lip = 1.0 - smoothstep(0.0, 1.6 + n2, d);
        float band = smoothstep(0.35, 0.0, abs(d - 2.2 - 1.6 * sin(t * 0.9 + n * 5.0))) * (1.0 - smoothstep(0.0, 6.0, d));
        float foam = clamp(lip + band * 0.8, 0.0, 1.0) * step(-0.5, d);
        col = mix(col, uFoam, foam * 0.9);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
}

/**
 * Generic animated liquid (unlit): c1 dark, c2 mid, c3 highlight. glow > 0 makes it emissive-bright (lava).
 * bubbles adds popping rings (swamp).
 */
export function liquidMaterial({ c1, c2, c3, scale = 0.12, flow = [0.2, 0.1], glow = 1, bubbles = 0, ripple = 0, opacity = 1, vertical = false }) {
  return fogShader({
    uniforms: {
      uC1: { value: new THREE.Color(c1) },
      uC2: { value: new THREE.Color(c2) },
      uC3: { value: new THREE.Color(c3) },
      uScale: { value: scale },
      uFlow: { value: new THREE.Vector2(...flow) },
      uGlow: { value: glow },
      uBub: { value: bubbles },
      uRip: { value: ripple },
      uOpacity: { value: opacity },
      uVert: { value: vertical ? 1 : 0 },
      uNoise: { value: noiseTexture() },
    },
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    vertex: VERT,
    fragment: `
      uniform vec3 uC1, uC2, uC3; uniform float uScale, uGlow, uBub, uRip, uOpacity, uVert; uniform vec2 uFlow;
      uniform sampler2D uNoise;
      varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      void main(){
        vec2 p = (uVert > 0.5 ? vec2(vW.x + vW.z, vW.y * 0.5) : vW.xz) * uScale;
        float t = uTime;
        float n = texture2D(uNoise, (p + uFlow * t) * 0.16).r;
        float n2 = texture2D(uNoise, (p * 2.3 - uFlow.yx * t * 1.7) * 0.16 + 0.37).g;
        float v = n * 0.65 + n2 * 0.35;
        vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.6, v));
        col = mix(col, uC3, smoothstep(0.62, 0.78, v));
        if (uRip > 0.0) {
          float rp = sin(length(vW.xz - floor(vW.xz / 6.0) * 6.0 - 3.0) * 4.0 - t * 3.0);
          col += uC3 * smoothstep(0.85, 1.0, rp) * 0.25 * uRip;
        }
        if (uBub > 0.0) {
          vec2 g = vW.xz / 3.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float h = h21(id);
          float life = fract(t * 0.35 + h * 7.0);
          float ring = smoothstep(0.05, 0.0, abs(length(f - (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.5) - life * 0.3));
          col = mix(col, uC3, ring * step(0.6, h) * (1.0 - life) * uBub);
        }
        col *= uGlow;
        gl_FragColor = vec4(col, uOpacity);
        ${OUT}
      }`,
  });
}
