// Shared surface shading for the camp props (MATI's Campout).
// Included by wood_camp.gdshader (solid props, cull_back) and
// canvas_camp.gdshader (tent canvas, double-sided, wind flutter).
//
// Vertex data comes from camp/camp_kit.gd (same layout as items/mesh_kit.gd):
//   COLOR.rgb  albedo (sRGB)          COLOR.a  baked ambient occlusion
//   UV         surface coordinates in metres
//   CUSTOM0    roughness, metallic, emission, pattern id
// Pattern ids 0..12 match MeshKit.Pat (so item meshes can use this material,
// e.g. food on the cooking rack); 20+ are camp patterns (CampKit.P).

global uniform float wetness;
global uniform vec3 fire_position;
global uniform float fire_strength;

// Per instance: charred logs glow (ember_glow), lantern glass / starstones
// shine (lamp), food browns on the rack (cook).
instance uniform float ember_glow = 0.0;
instance uniform float lamp = 0.0;
instance uniform float cook = 0.0;

varying vec4 mat_p;
varying vec3 obj_pos;
varying vec3 obj_nrm;
varying vec3 world_pos;
varying vec3 world_nrm;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash13(i);
	float b = hash13(i + vec3(1.0, 0.0, 0.0));
	float c = hash13(i + vec3(0.0, 1.0, 0.0));
	float d = hash13(i + vec3(1.0, 1.0, 0.0));
	float e = hash13(i + vec3(0.0, 0.0, 1.0));
	float g = hash13(i + vec3(1.0, 0.0, 1.0));
	float h = hash13(i + vec3(0.0, 1.0, 1.0));
	float k = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

float fbm3(vec3 p) {
	float v = vnoise(p) * 0.5;
	v += vnoise(p * 2.03 + 11.7) * 0.28;
	v += vnoise(p * 4.11 + 3.1) * 0.15;
	v += vnoise(p * 8.3 + 7.9) * 0.07;
	return v;
}

// Cellular distance (F1) and edge distance for coals / stones / cracks.
vec2 cells(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	float f1 = 8.0;
	float f2 = 8.0;
	for (int z = -1; z <= 1; z++) {
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				vec3 g = vec3(float(x), float(y), float(z));
				vec3 o = vec3(hash13(i + g), hash13(i + g + 17.1), hash13(i + g + 41.7));
				float d = length(g + o - f);
				if (d < f1) {
					f2 = f1;
					f1 = d;
				} else if (d < f2) {
					f2 = d;
				}
			}
		}
	}
	return vec2(f1, f2 - f1);
}

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// 3D flat-sawn wood: concentric growth rings around an axis through the
// board, so tops show cathedral arches, sides show lines, ends show rings.
float wood_rings(float along, vec2 across, float seed) {
	vec2 c = across + vec2(0.31 + seed * 0.7, -0.27 - seed * 0.4);
	float wob = vnoise(vec3(along * 1.3, across * 6.0)) * 0.012;
	float r = length(c) + wob + vnoise(vec3(along * 0.35, seed * 9.0, 0.0)) * 0.02;
	float ring = fract(r * 34.0);
	return smoothstep(0.0, 0.18, ring) * (1.0 - smoothstep(0.55, 1.0, ring));
}

// Varyings must be written in vertex() itself; each shader does:
//   mat_p = CUSTOM0; obj_pos = VERTEX; obj_nrm = NORMAL;
//   world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
//   world_nrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);

struct CampSurface {
	vec3 albedo;
	float rough;
	float metal;
	float ao;
	vec3 emission;
	float backlight;
};

CampSurface camp_surface(vec4 vcolor, vec2 uv, float time) {
	CampSurface s;
	vec3 base = to_linear(vcolor.rgb);
	float ao = vcolor.a;
	float rough = mat_p.x;
	float metal = mat_p.y;
	float emis = mat_p.z;
	int pat = int(mat_p.w + 0.5);
	vec3 em = vec3(0.0);
	float back = 0.0;
	float n1 = vnoise(obj_pos * 9.0);
	float n2 = vnoise(obj_pos * 37.0 + 7.3);
	float up = clamp(world_nrm.y, 0.0, 1.0);
	// Soot and heat near the campfire (stones of the ring, grate, rack ends).
	float fire_d = length(world_pos.xz - fire_position.xz);
	float near_fire = smoothstep(1.7, 0.35, fire_d) * smoothstep(1.4, 0.0, world_pos.y - fire_position.y);
	float soot_amt = 0.0;

	if (pat == 4) {
		// MeshKit wood grain (items).
		float g = sin(uv.x * 70.0 + n1 * 6.0 + uv.y * 3.0);
		base *= 0.86 + 0.14 * smoothstep(-0.6, 0.9, g) - 0.06 * n2;
	} else if (pat == 7) {
		float r = smoothstep(0.38, 0.7, vnoise(obj_pos * 34.0) * 0.7 + n2 * 0.3);
		base = mix(base, to_linear(vec3(0.55, 0.27, 0.12)), r * 0.85);
		metal = mix(metal, 0.05, r);
		rough = mix(rough, 0.95, r);
	} else if (pat == 8) {
		base *= 0.88 + 0.16 * n2 + 0.05 * n1;
	} else if (pat == 10) {
		float w = sin(uv.x * 320.0) * sin(uv.y * 320.0);
		float fw = fwidth(uv.x * 320.0) + fwidth(uv.y * 320.0);
		base *= 0.95 + (0.05 * w) * (1.0 - smoothstep(0.5, 2.0, fw)) + 0.06 * (n1 - 0.5);
	} else if (pat == 11) {
		float gm = smoothstep(0.1, 0.0, abs(fract((uv.x + uv.y) * 14.0) - 0.5) - 0.38);
		base = mix(base, base * 0.35, gm * 0.8);
	} else if (pat >= 20 && pat <= 22) {
		// Sawn planks: grain along object X (20), Y (21) or Z (22).
		vec3 p = obj_pos;
		float along = pat == 20 ? p.x : (pat == 21 ? p.y : p.z);
		vec2 across = pat == 20 ? p.yz : (pat == 21 ? p.xz : p.xy);
		float seed = hash13(floor(vec3(across * 4.0, 0.5)));
		float rings = wood_rings(along, across, seed);
		float fib = vnoise(vec3(along * 3.0, across * 90.0));
		float knot = smoothstep(0.035, 0.0, length(vec2(fract(along * 0.9 + seed) - 0.5, (across.x + across.y) * 3.0 - floor((across.x + across.y) * 3.0) - 0.5) * vec2(0.6, 1.0)));
		base *= 0.78 + 0.2 * rings + 0.1 * fib - 0.06 * seed;
		base = mix(base, base * 0.45, knot * 0.7);
		base *= 0.92 + 0.12 * vnoise(p * 2.5);
		// Weathered: lighter on top faces, darker grime toward the ground.
		base = mix(base, base * vec3(1.08, 1.06, 1.02), up * 0.3);
	} else if (pat == 23) {
		// Bark: vertical furrows (uv.y runs along the trunk), plates, moss.
		float fur = abs(sin(uv.x * 26.0 + vnoise(vec3(uv.y * 2.4, uv.x * 3.0, 0.0)) * 5.0));
		float plates = vnoise(vec3(uv.x * 14.0, uv.y * 4.0, 1.7));
		float ridge = smoothstep(0.15, 0.8, fur) * (0.7 + 0.3 * plates);
		base *= 0.55 + 0.6 * ridge;
		base *= 0.9 + 0.2 * vnoise(obj_pos * 3.0);
		rough = max(rough, 0.92);
		float moss = smoothstep(0.55, 0.9, up) * smoothstep(0.45, 0.75, fbm3(obj_pos * 4.0));
		base = mix(base, to_linear(vec3(0.36, 0.47, 0.22)) * (0.8 + 0.3 * n2), moss * 0.85);
	} else if (pat == 24) {
		// End grain: growth rings (uv.y = distance from the log's centre).
		float r = uv.y + vnoise(obj_pos * 14.0) * 0.012;
		float ring = sin(r * 150.0) * 0.5 + 0.5;
		base *= 0.82 + 0.18 * ring;
		base *= 0.9 + 0.16 * vnoise(obj_pos * 25.0);
		float crack = smoothstep(0.03, 0.0, abs(fract(atan(obj_pos.z, obj_pos.x) * 1.2 + n1 * 0.3) - 0.5)) * smoothstep(0.2, 0.6, n2);
		base *= 1.0 - crack * 0.25;
	} else if (pat == 25) {
		// Rounded stone: mottled greys, speckles, moss on top, soot by the fire.
		vec3 q = obj_pos * 2.2;
		float big = fbm3(q);
		float speck = smoothstep(0.72, 0.8, vnoise(obj_pos * 46.0));
		base *= 0.72 + 0.48 * big;
		base = mix(base, base * 1.35, speck * 0.5);
		base = mix(base, base * vec3(1.05, 0.98, 0.9), smoothstep(0.4, 0.7, vnoise(obj_pos * 5.0 + 3.0)) * 0.5);
		float moss = smoothstep(0.62, 0.92, up) * smoothstep(0.42, 0.7, fbm3(obj_pos * 3.1 + 5.0));
		moss *= 1.0 - near_fire;
		base = mix(base, to_linear(vec3(0.38, 0.5, 0.24)) * (0.75 + 0.4 * n2), moss * 0.9);
		rough = mix(rough, 0.98, moss);
		soot_amt = near_fire * 0.85;
	} else if (pat == 26) {
		// Big canvas: soft weave, panel seams with stitching, dirt toward the
		// ground, sun-faded tops. uv in metres (x across panels, y down).
		float fw = fwidth(uv.x * 260.0) + fwidth(uv.y * 260.0);
		float weave = sin(uv.x * 260.0) * sin(uv.y * 260.0) * (1.0 - smoothstep(0.4, 1.6, fw));
		float seam_u = abs(fract(uv.x / 1.15 + 0.5) - 0.5) * 1.15;
		float seam = smoothstep(0.03, 0.012, seam_u);
		float stitch = seam * step(0.5, fract(uv.y * 16.0)) * smoothstep(0.012, 0.004, abs(seam_u - 0.018));
		float blotch = fbm3(obj_pos * 1.4);
		base *= 0.93 + 0.05 * weave + 0.12 * (blotch - 0.5);
		base *= 1.0 - seam * 0.12;
		base = mix(base, base * 1.25, stitch * 0.6);
		float dirt = 1.0 - smoothstep(0.0, 0.45, obj_pos.y);
		base = mix(base, base * vec3(0.62, 0.56, 0.48), dirt * 0.55);
		back = 0.55;
	} else if (pat == 27) {
		// Charred log: black "alligator" char blocks with a little grey ash,
		// thin glowing cracks only low down where the embers are.
		vec3 q = obj_pos * 16.0 + vec3(vnoise(obj_pos * 5.0) * 1.5);
		vec2 cl = cells(q);
		float crack = smoothstep(0.045, 0.0, cl.y);
		float ashp = smoothstep(0.6, 0.9, vnoise(obj_pos * 11.0 + 2.0));
		base = to_linear(vec3(0.028, 0.024, 0.022)) * (0.75 + 0.5 * smoothstep(0.0, 0.5, cl.x));
		base = mix(base, to_linear(vec3(0.24, 0.23, 0.22)), ashp * 0.55);
		rough = 0.96;
		float under = 1.0 - smoothstep(0.0, 0.22, world_pos.y - fire_position.y);
		float pulse = 0.6 + 0.4 * sin(time * 2.1 + vnoise(obj_pos * 4.0) * 12.0);
		float heat = ember_glow * crack * under * pulse * (1.0 - ashp) * 0.8;
		heat += ember_glow * under * under * 0.22 * (0.5 + 0.5 * n1);
		em += vec3(1.0, 0.3, 0.05) * heat * 2.4;
	} else if (pat == 28) {
		// Iron: dark forged metal with soot and rust patches.
		float r = smoothstep(0.55, 0.8, fbm3(obj_pos * 7.0));
		base = mix(base, to_linear(vec3(0.42, 0.22, 0.11)), r * 0.7);
		base *= 0.85 + 0.25 * n2;
		metal = mix(metal, 0.1, r);
		rough = mix(rough, 0.92, r);
		soot_amt = near_fire * 0.6;
	} else if (pat == 29) {
		// Rope: twisted strands along uv.y.
		float tw = sin(uv.y * 210.0 + uv.x * 60.0);
		base *= 0.82 + 0.2 * smoothstep(-0.5, 0.8, tw);
		rough = 1.0;
	} else if (pat == 30) {
		// Lantern glass: warm light inside.
		float flick = 0.88 + 0.12 * sin(time * 9.0 + n1 * 6.0) * sin(time * 5.3);
		em += vec3(1.0, 0.68, 0.32) * lamp * 4.5 * flick;
		base = mix(base, vec3(1.0, 0.8, 0.5), lamp * 0.5);
		rough = 0.15;
		back = 0.4;
	} else if (pat == 31) {
		// Slate chalkboard with smudges.
		float sm = fbm3(obj_pos * 6.0);
		base = mix(base, base + vec3(0.06), smoothstep(0.5, 0.8, sm));
		rough = 0.95;
	} else if (pat == 32) {
		// Painted wood: paint over grain, worn at the edges.
		float grain = wood_rings(obj_pos.x, obj_pos.yz, 0.3);
		float wear = smoothstep(0.62, 0.78, fbm3(obj_pos * 9.0));
		base *= 0.92 + 0.1 * grain;
		base = mix(base, to_linear(vec3(0.45, 0.31, 0.19)) * (0.8 + 0.25 * grain), wear * 0.75);
	} else if (pat == 34) {
		// Starstone: glowing crystal.
		float sp = pow(n2, 6.0) * 5.0;
		float pulse = 0.82 + 0.18 * sin(time * 1.7 + n1 * 4.0);
		em += vec3(0.62, 0.82, 1.0) * (lamp * 3.6 * pulse + sp * 0.3) + base * 0.2;
		rough = 0.2;
	} else if (pat == 35) {
		// Fabric (rug, bunting, flags): woven with a soft pile.
		float fw = fwidth(uv.x * 160.0) + fwidth(uv.y * 160.0);
		float weave = sin(uv.x * 160.0) * sin(uv.y * 160.0) * (1.0 - smoothstep(0.4, 1.6, fw));
		base *= 0.92 + 0.06 * weave + 0.1 * (n1 - 0.5);
		back = 0.6;
	} else if (pat == 36) {
		// Light bulb (string lights): emissive when lamp is on.
		em += base * lamp * 5.0;
		rough = 0.2;
	} else {
		base *= 0.95 + 0.08 * n1;
	}

	// Food on the rack (any pattern): raw -> golden -> browned, crisp spots.
	if (cook > 0.001) {
		float c = clamp(cook, 0.0, 1.0);
		vec3 golden = base * vec3(0.95, 0.7, 0.42) + vec3(0.06, 0.025, 0.0);
		vec3 browned = to_linear(vec3(0.5, 0.26, 0.12)) * (0.8 + 0.4 * n2);
		base = mix(base, golden, smoothstep(0.0, 0.55, c));
		base = mix(base, browned, smoothstep(0.45, 1.0, c) * 0.8);
		float spots = smoothstep(0.62, 0.8, vnoise(obj_pos * 60.0)) * smoothstep(0.5, 1.0, c);
		base = mix(base, base * 0.4, spots * 0.6);
		rough = mix(rough, 0.42, c);
	}

	// Soot: blackens toward the fire.
	base = mix(base, to_linear(vec3(0.05, 0.045, 0.04)), soot_amt * smoothstep(0.25, 0.7, vnoise(obj_pos * 6.0) * 0.6 + 0.4));

	// Rain darkens porous things and makes them glossier.
	float wet = clamp(wetness, 0.0, 1.0);
	base *= mix(1.0, 0.68, wet * (1.0 - metal) * 0.75);
	rough = mix(rough, rough * 0.5, wet * 0.8);

	em += base * emis;
	s.albedo = base;
	s.rough = clamp(rough, 0.04, 1.0);
	s.metal = clamp(metal, 0.0, 1.0);
	s.ao = ao;
	s.emission = em;
	s.backlight = back;
	return s;
}
