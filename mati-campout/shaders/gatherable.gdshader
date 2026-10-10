// Gatherable resource nodes (stone heaps, coal seams, berry bushes,
// mushrooms, twig bundles, bones, cloth scraps, scrap metal). One shader for
// every kind; whole 64 m chunks are baked into single meshes.
//
// Per vertex (world/gatherable_meshes.gd):
//   COLOR   rgb albedo (sRGB), a baked AO
//   UV      surface coordinates in metres
//   UV2     x material id (GatherableMeshes.Mat), y removal threshold (-1 = permanent)
//   CUSTOM0 xyz part pivot (chunk space)    CUSTOM1 x node id (texel in state_tex)
// state_tex (one RGBA8 texel per node): r fill (charges left / charges),
// g shake (gathering), b hidden (removed), a per-node random.
shader_type spatial;
render_mode cull_back, depth_draw_opaque, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/foliage_noise.gdshaderinc"

global uniform float wetness;
global uniform float night_factor;
global uniform float wind_strength;
global uniform vec2 wind_direction;
global uniform vec3 player_position;

uniform sampler2D state_tex : filter_nearest, repeat_disable;
uniform int state_width = 64;
// Nodes shrink away between fade_far * 0.82 and fade_far metres from the
// player (consistent in the shadow pass, unlike the camera distance).
uniform float fade_far = 90.0;

varying float v_mat;
varying vec4 v_state;
varying vec3 v_wpos;
varying vec3 v_wnrm;

const int M_GROUND = 0;
const int M_STONE = 1;
const int M_COAL = 2;
const int M_LEAF = 3;
const int M_BERRY = 4;
const int M_CAP = 5;
const int M_STEM = 6;
const int M_WOOD = 7;
const int M_BONE = 8;
const int M_CLOTH = 9;
const int M_METAL = 10;
const int M_MOSS = 11;
const int M_TWINE = 12;
const int M_GILLS = 13;
const int M_SPOT = 14;
const int M_LITTER = 15;
const int M_CORE = 16;
const int M_ROCK = 17;

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

float tri_noise(vec3 p, vec3 w, float scale) {
	return vg_noise2(p.yz * scale) * w.x + vg_noise2(p.xz * scale + 7.3) * w.y + vg_noise2(p.xy * scale + 3.1) * w.z;
}

void vertex() {
	int id = int(CUSTOM1.x + 0.5);
	vec4 st = texelFetch(state_tex, ivec2(id % state_width, id / state_width), 0);
	int m = int(UV2.x + 0.5);
	float thr = UV2.y;
	float s = 1.0;
	if (thr >= 0.0) {
		s = smoothstep(thr, thr + 0.04, st.r);
		// A little bounce as parts pop in or out.
		s *= 1.0 + 0.32 * sin(s * 3.14159);
	}
	s *= 1.0 - step(0.5, st.b);
	vec3 wp0 = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float d = distance(wp0.xz, player_position.xz);
	s *= smoothstep(fade_far, fade_far * 0.82, d);
	VERTEX = mix(CUSTOM0.xyz, VERTEX, s);

	// Wind sway for leafy parts (top leaves move most: AO grows with height).
	if (m == M_LEAF || m == M_BERRY || m == M_CORE) {
		float h = clamp(COLOR.a - 0.45, 0.0, 0.6);
		float ph = dot(wp0.xz, vec2(0.71, 0.53)) * 1.3 + TIME * (1.6 + wind_strength * 1.4);
		float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.4) * (0.012 + 0.05 * wind_strength) * h;
		// Chunk meshes are only translated, so world directions work locally.
		VERTEX.xz += wind_direction * sway;
	}
	// Rustle / wiggle while being gathered.
	if (st.g > 0.002 && m != M_GROUND && m != M_LITTER) {
		float k = st.g * 0.028;
		VERTEX.x += sin(TIME * 41.0 + wp0.y * 23.0 + wp0.z * 7.0) * k;
		VERTEX.z += cos(TIME * 37.0 + wp0.x * 19.0) * k;
	}
	v_mat = UV2.x;
	v_state = st;
	v_wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	int m = int(v_mat + 0.5);
	vec3 base = to_linear(COLOR.rgb);
	float ao = COLOR.a;
	float rnd = v_state.a;
	vec3 n = normalize(v_wnrm);
	vec3 p = v_wpos;
	float rough = 0.85;
	float spec = 0.4;
	float metal = 0.0;
	float bump = 0.0;
	float bump_k = 0.0;
	vec3 emit = vec3(0.0);
	vec3 backlight = vec3(0.0);
	float wet_k = 1.0;
	// Per-node brightness variation.
	base *= 0.92 + 0.16 * rnd;

	if (m == M_STONE || m == M_ROCK) {
		vec3 w = pow(abs(n), vec3(4.0));
		w /= (w.x + w.y + w.z);
		vec3 q = p + rnd * 37.0;
		float big = tri_noise(q, w, 3.2);
		float fine = tri_noise(q, w, 11.0);
		base *= 0.62 + 0.55 * (big * 0.65 + fine * 0.35);
		// Darker crevices between stones (baked AO into the albedo too).
		base *= mix(0.5, 1.0, ao);
		// Small lichen flecks lighten the stone a little.
		float lich = smoothstep(0.76, 0.8, tri_noise(q * 1.7, w, 14.0));
		base = mix(base, base * 1.3 + vec3(0.012, 0.016, 0.004), lich * 0.6);
		float moss = 0.0;
		if (m == M_STONE) {
			// Moss creeping over the top-facing surfaces.
			float top = smoothstep(0.45, 0.95, n.y);
			float mn = tri_noise(q, w, 5.0);
			moss = smoothstep(0.62, 0.82, top * (0.4 + rnd * 0.45) + (mn - 0.5) * 0.9);
			vec3 moss_c = mix(vec3(0.03, 0.055, 0.016), vec3(0.085, 0.14, 0.035), fine);
			base = mix(base, moss_c, moss * 0.92);
		} else {
			// Dark ridge rock: faint strata; the painted coal seam glitters.
			float strata = sin(p.y * 22.0 + big * 5.0) * 0.5 + 0.5;
			base *= 0.85 + 0.2 * strata;
			float seam = 1.0 - smoothstep(0.004, 0.02, dot(to_linear(COLOR.rgb), vec3(0.333)));
			float h = vg_hash13(floor(p * 52.0));
			float tw = 0.5 + 0.5 * sin(TIME * 2.1 + h * 37.0 + dot(VIEW, vec3(11.0, 5.0, 13.0)) * 6.0);
			emit = vec3(1.0, 0.9, 0.72) * seam * step(0.95, h) * pow(tw, 6.0) * (0.7 + 1.2 * night_factor) * v_state.r;
			moss = -seam;
		}
		rough = mix(0.84, 0.97, max(moss, 0.0));
		rough = mix(rough, 0.4, max(-moss, 0.0));
		moss = max(moss, 0.0);
		spec = 0.35;
		bump = big * 0.6 + fine * 0.4 - moss * 0.3;
		bump_k = 1.0;
	} else if (m == M_COAL) {
		vec3 cell = floor(p * 70.0);
		float h = vg_hash13(cell);
		float tw = 0.5 + 0.5 * sin(TIME * 2.3 + h * 40.0 + dot(VIEW, vec3(13.0, 7.0, 11.0)) * 6.0);
		float glitter = step(0.975, h) * pow(tw, 8.0);
		base = vec3(0.016, 0.015, 0.014) + base * 0.08;
		rough = 0.3 + 0.25 * vg_noise3(p * 30.0);
		spec = 0.5;
		metal = 0.08;
		emit = vec3(1.0, 0.9, 0.72) * glitter * (0.9 + 1.4 * night_factor);
		bump = vg_noise3(p * 40.0);
		bump_k = 0.3;
	} else if (m == M_LEAF || m == M_CORE) {
		float k = vg_noise3(p * 6.0 + rnd * 9.0);
		base *= 0.85 + 0.3 * k;
		// Leaves a touch yellower on some bushes.
		base = mix(base, base * vec3(1.15, 1.05, 0.7), rnd * 0.35);
		if (m == M_CORE) {
			base *= 0.7;
			rough = 0.95;
			spec = 0.2;
		} else {
			float vein = smoothstep(0.06, 0.0, abs(UV.x)) * step(0.05, UV.y);
			base *= 1.0 - vein * 0.18;
			base *= 1.12;
			rough = 0.62;
			spec = 0.38;
			backlight = base * 0.6;
		}
		wet_k = 0.6;
	} else if (m == M_BERRY) {
		base *= 0.92 + 0.12 * vg_noise3(p * 60.0);
		rough = 0.18;
		spec = 0.75;
		backlight = base * 0.35;
		// Juicy rim so berries read even in shade.
		float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
		emit = base * rim * 0.25;
		wet_k = 0.2;
	} else if (m == M_CAP) {
		float t = UV.y;
		base *= mix(0.78, 1.1, t) * (0.92 + 0.12 * vg_noise3(p * 45.0));
		rough = 0.5;
		spec = 0.45;
		bump = vg_noise3(p * 35.0);
		bump_k = 0.04;
	} else if (m == M_GILLS) {
		float lines = 0.5 + 0.5 * sin(UV.x * 6.2832 * 38.0);
		base *= 0.82 + 0.18 * lines;
		rough = 0.85;
	} else if (m == M_STEM || m == M_SPOT) {
		base *= 0.92 + 0.1 * vg_noise3(vec3(p.x * 60.0, p.y * 12.0, p.z * 60.0));
		rough = m == M_SPOT ? 0.75 : 0.7;
		backlight = base * 0.15;
	} else if (m == M_WOOD) {
		float streak = vg_noise2(vec2(UV.x * 28.0, UV.y * 3.5));
		float knot = smoothstep(0.75, 0.85, vg_noise2(UV * vec2(9.0, 4.0)));
		base *= 0.75 + 0.4 * streak;
		base *= 1.0 - knot * 0.3;
		rough = 0.9;
		bump = streak;
		bump_k = 0.35;
	} else if (m == M_TWINE) {
		float tw = 0.5 + 0.5 * sin((UV.x * 3.0 + UV.y * 1.0) * 6.2832 * 3.0);
		base *= 0.8 + 0.3 * tw;
		rough = 0.95;
	} else if (m == M_BONE) {
		float pore = vg_noise3(p * 55.0);
		float big = vg_noise3(p * 9.0 + rnd * 7.0);
		base *= 0.88 + 0.14 * big;
		base = mix(base, base * vec3(0.92, 0.86, 0.74), smoothstep(0.55, 0.8, big) * 0.5);
		rough = 0.62 + 0.15 * pore;
		spec = 0.45;
		backlight = base * 0.12;
		bump = pore;
		bump_k = 0.15;
		wet_k = 0.5;
	} else if (m == M_CLOTH) {
		vec2 wv = UV * 260.0;
		float weave = (0.5 + 0.5 * sin(wv.x)) * (0.5 + 0.5 * sin(wv.y));
		// Fade the weave with distance so it never shimmers.
		float wfade = 1.0 - smoothstep(1.5, 4.0, length(VERTEX));
		base *= 1.0 - 0.07 * weave * wfade;
		// Faded stripes on half of the scraps.
		float stripe = smoothstep(0.42, 0.47, abs(fract(UV.x * 2.6 + rnd * 3.0) - 0.5)) * step(0.5, rnd);
		base = mix(base, base * vec3(0.55, 0.6, 0.7), stripe * 0.6);
		float dirt = vg_noise3(p * 4.0 + rnd * 11.0);
		base *= 0.85 + 0.2 * dirt;
		rough = 0.92;
		spec = 0.25;
		backlight = base * 0.4;
		bump = dirt;
		bump_k = 0.15;
	} else if (m == M_METAL) {
		float r1 = vg_noise3(p * 14.0 + rnd * 5.0);
		float r2 = vg_noise3(p * 48.0);
		float rust_k = smoothstep(0.32, 0.62, r1 * 0.75 + r2 * 0.35);
		vec3 rust = mix(vec3(0.24, 0.085, 0.03), vec3(0.42, 0.18, 0.07), r2);
		vec3 bare = base * 0.9;
		base = mix(bare, rust, rust_k);
		metal = mix(0.75, 0.05, rust_k);
		rough = mix(0.38, 0.92, rust_k);
		spec = 0.5;
		bump = r1 * 0.5 + r2 * 0.5;
		bump_k = mix(0.1, 0.45, rust_k);
	} else if (m == M_MOSS || m == M_LITTER) {
		float k = vg_noise3(p * 14.0);
		float k2 = vg_noise3(p * 40.0 + 3.0);
		if (m == M_LITTER) {
			vec3 leafy = vec3(0.22, 0.13, 0.05) * (0.8 + 0.5 * k2);
			base = mix(base, leafy, smoothstep(0.45, 0.6, k));
		}
		base *= 0.8 + 0.35 * k2;
		rough = 1.0;
		spec = 0.2;
		bump = k2;
		bump_k = 0.3;
	} else {
		// Ground bed: earth with grit.
		float k = vg_noise3(p * 9.0);
		float grit = smoothstep(0.8, 0.9, vg_noise3(p * 45.0));
		base *= 0.8 + 0.35 * k;
		base = mix(base, base * 1.45 + vec3(0.02), grit * 0.5);
		rough = 0.97;
		spec = 0.25;
		bump = k;
		bump_k = 0.35;
	}

	// Rain: darker, glossier.
	float wet = wetness * wet_k;
	base *= mix(1.0, 0.62, wet);
	rough = mix(rough, 0.22, wet * 0.8);

	ALBEDO = base;
	ROUGHNESS = rough;
	SPECULAR = spec;
	METALLIC = metal;
	AO = ao;
	AO_LIGHT_AFFECT = 0.35;
	EMISSION = emit;
	if (m == M_LEAF || m == M_BERRY || m == M_CLOTH || m == M_STEM || m == M_SPOT || m == M_BONE) {
		BACKLIGHT = backlight;
	}
	if (bump_k > 0.0) {
		NORMAL = vg_bump(VERTEX, NORMAL, bump * 0.02, bump_k);
	}
}
