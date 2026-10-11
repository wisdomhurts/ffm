// Shared surface shading for the landmarks (MATI's Campout): the lighthouse,
// the abandoned campsite, the ranger lookout, the trader camps, the old mine
// and Fern Hollow. Included by landmark.gdshader (solid, cull_back) and
// landmark_cloth.gdshader (double-sided cloth, ferns, nets; wind flutter).
//
// Same vertex layout as camp/camp_kit.gd + items/mesh_kit.gd:
//   COLOR.rgb  albedo (sRGB)          COLOR.a  baked ambient occlusion
//   UV         surface coordinates in metres
//   CUSTOM0    roughness, metallic (cloth: flutter weight), emission, pattern
// Pattern ids: 0..12 = MeshKit.Pat, 20..36 = CampKit.P, 40+ = LandmarkKit.LP.
//
// No instance uniforms (they are scarce under the Compatibility renderer):
// lantern glass, the lighthouse lens and glowing mushrooms follow the global
// night_factor; the emission channel scales them (0 = a dead lantern).

global uniform float wetness;
global uniform float night_factor;

varying vec4 mat_p;
varying vec3 obj_pos;
varying vec3 world_pos;
varying vec3 world_nrm;

float lm_hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float lm_noise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = lm_hash13(i);
	float b = lm_hash13(i + vec3(1.0, 0.0, 0.0));
	float c = lm_hash13(i + vec3(0.0, 1.0, 0.0));
	float d = lm_hash13(i + vec3(1.0, 1.0, 0.0));
	float e = lm_hash13(i + vec3(0.0, 0.0, 1.0));
	float g = lm_hash13(i + vec3(1.0, 0.0, 1.0));
	float h = lm_hash13(i + vec3(0.0, 1.0, 1.0));
	float k = lm_hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

float lm_fbm(vec3 p) {
	float v = lm_noise(p) * 0.5;
	v += lm_noise(p * 2.03 + 11.7) * 0.28;
	v += lm_noise(p * 4.11 + 3.1) * 0.15;
	v += lm_noise(p * 8.3 + 7.9) * 0.07;
	return v;
}

vec3 lm_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Flat-sawn wood rings around an axis through the board.
float lm_rings(float along, vec2 across, float seed) {
	vec2 c = across + vec2(0.31 + seed * 0.7, -0.27 - seed * 0.4);
	float wob = lm_noise(vec3(along * 1.3, across * 6.0)) * 0.012;
	float r = length(c) + wob + lm_noise(vec3(along * 0.35, seed * 9.0, 0.0)) * 0.02;
	float ring = fract(r * 34.0);
	return smoothstep(0.0, 0.18, ring) * (1.0 - smoothstep(0.55, 1.0, ring));
}

// 0 by day, 1 at night: lanterns, the lighthouse lens, glowing mushrooms.
float lm_lamp_on() {
	return smoothstep(0.08, 0.5, clamp(night_factor, 0.0, 1.0));
}

struct LmSurface {
	vec3 albedo;
	float rough;
	float metal;
	float ao;
	vec3 emission;
	float backlight;
};

LmSurface lm_surface(vec4 vcolor, vec2 uv, float time) {
	LmSurface s;
	vec3 base = lm_linear(vcolor.rgb);
	float ao = vcolor.a;
	float rough = mat_p.x;
	float metal = mat_p.y;
	float emis = mat_p.z;
	int pat = int(mat_p.w + 0.5);
	vec3 em = vec3(0.0);
	float back = 0.0;
	bool emis_done = false;
	float n1 = lm_noise(obj_pos * 9.0);
	float n2 = lm_noise(obj_pos * 37.0 + 7.3);
	float up = clamp(world_nrm.y, 0.0, 1.0);
	float lamp = lm_lamp_on();

	if (pat == 4) {
		float g = sin(uv.x * 70.0 + n1 * 6.0 + uv.y * 3.0);
		base *= 0.86 + 0.14 * smoothstep(-0.6, 0.9, g) - 0.06 * n2;
	} else if (pat == 7) {
		float r = smoothstep(0.38, 0.7, lm_noise(obj_pos * 34.0) * 0.7 + n2 * 0.3);
		base = mix(base, lm_linear(vec3(0.55, 0.27, 0.12)), r * 0.85);
		metal = mix(metal, 0.05, r);
		rough = mix(rough, 0.95, r);
	} else if (pat == 8) {
		base *= 0.88 + 0.16 * n2 + 0.05 * n1;
	} else if (pat >= 20 && pat <= 22) {
		// Sawn planks: grain along object X (20), Y (21) or Z (22); weathered.
		vec3 p = obj_pos;
		float along = pat == 20 ? p.x : (pat == 21 ? p.y : p.z);
		vec2 across = pat == 20 ? p.yz : (pat == 21 ? p.xz : p.xy);
		float seed = lm_hash13(floor(vec3(across * 4.0, 0.5)));
		float rings = lm_rings(along, across, seed);
		float fib = lm_noise(vec3(along * 3.0, across * 90.0));
		base *= 0.78 + 0.2 * rings + 0.1 * fib - 0.06 * seed;
		base *= 0.9 + 0.14 * lm_noise(p * 2.5);
		base = mix(base, base * vec3(1.08, 1.06, 1.02), up * 0.3);
		// Old boards go grey and get a little moss in the cracks.
		float age = smoothstep(0.55, 0.85, lm_fbm(p * 1.7));
		base = mix(base, base * vec3(0.86, 0.88, 0.86) + vec3(0.02), age * 0.4);
	} else if (pat == 23) {
		// Bark.
		float fur = abs(sin(uv.x * 26.0 + lm_noise(vec3(uv.y * 2.4, uv.x * 3.0, 0.0)) * 5.0));
		float plates = lm_noise(vec3(uv.x * 14.0, uv.y * 4.0, 1.7));
		float ridge = smoothstep(0.15, 0.8, fur) * (0.7 + 0.3 * plates);
		base *= 0.55 + 0.6 * ridge;
		base *= 0.9 + 0.2 * lm_noise(obj_pos * 3.0);
		rough = max(rough, 0.92);
		float moss = smoothstep(0.55, 0.9, up) * smoothstep(0.45, 0.75, lm_fbm(obj_pos * 4.0));
		base = mix(base, lm_linear(vec3(0.36, 0.47, 0.22)) * (0.8 + 0.3 * n2), moss * 0.85);
	} else if (pat == 24) {
		// End grain.
		float r = uv.y + lm_noise(obj_pos * 14.0) * 0.012;
		float ring = sin(r * 150.0) * 0.5 + 0.5;
		base *= 0.82 + 0.18 * ring;
		base *= 0.9 + 0.16 * lm_noise(obj_pos * 25.0);
	} else if (pat == 25) {
		// Rounded stone / big rock: mottled greys, speckles, moss on top.
		float big = lm_fbm(obj_pos * 2.2);
		float speck = smoothstep(0.72, 0.8, lm_noise(obj_pos * 46.0));
		base *= 0.72 + 0.48 * big;
		base = mix(base, base * 1.35, speck * 0.5);
		base = mix(base, base * vec3(1.05, 0.98, 0.9), smoothstep(0.4, 0.7, lm_noise(obj_pos * 5.0 + 3.0)) * 0.5);
		float moss = smoothstep(0.62, 0.92, up) * smoothstep(0.42, 0.7, lm_fbm(obj_pos * 3.1 + 5.0));
		base = mix(base, lm_linear(vec3(0.38, 0.5, 0.24)) * (0.75 + 0.4 * n2), moss * 0.9);
		rough = mix(rough, 0.98, moss);
	} else if (pat == 26 || pat == 35) {
		// Canvas / fabric: soft weave, seams, dirt toward the ground.
		float freq = pat == 26 ? 260.0 : 160.0;
		float fw = fwidth(uv.x * freq) + fwidth(uv.y * freq);
		float weave = sin(uv.x * freq) * sin(uv.y * freq) * (1.0 - smoothstep(0.4, 1.6, fw));
		float blotch = lm_fbm(obj_pos * 1.4);
		base *= 0.93 + 0.05 * weave + 0.14 * (blotch - 0.5);
		if (pat == 26) {
			float seam_u = abs(fract(uv.x / 1.15 + 0.5) - 0.5) * 1.15;
			base *= 1.0 - smoothstep(0.03, 0.012, seam_u) * 0.12;
			float dirt = 1.0 - smoothstep(0.0, 0.45, obj_pos.y);
			base = mix(base, base * vec3(0.62, 0.56, 0.48), dirt * 0.55);
		}
		back = 0.55;
	} else if (pat == 27) {
		// Charred log (cold).
		float ashp = smoothstep(0.55, 0.9, lm_noise(obj_pos * 11.0 + 2.0));
		float blocks = smoothstep(0.1, 0.5, abs(sin(uv.x * 30.0 + n1 * 3.0) * sin(uv.y * 22.0 + n2 * 2.0)));
		base = lm_linear(vec3(0.03, 0.026, 0.024)) * (0.75 + 0.5 * blocks);
		base = mix(base, lm_linear(vec3(0.3, 0.29, 0.28)), ashp * 0.6);
		rough = 0.96;
		// Optional ember glow (emission channel): warm cracks, pulsing.
		float pulse = 0.6 + 0.4 * sin(time * 2.1 + lm_noise(obj_pos * 4.0) * 12.0);
		em += vec3(1.0, 0.32, 0.06) * emis * (1.0 - blocks) * (1.0 - ashp) * pulse * 3.0;
		emis_done = true;
	} else if (pat == 28) {
		// Iron.
		float r = smoothstep(0.55, 0.8, lm_fbm(obj_pos * 7.0));
		base = mix(base, lm_linear(vec3(0.42, 0.22, 0.11)), r * 0.7);
		base *= 0.85 + 0.25 * n2;
		metal = mix(metal, 0.1, r);
		rough = mix(rough, 0.92, r);
	} else if (pat == 29) {
		float tw = sin(uv.y * 210.0 + uv.x * 60.0);
		base *= 0.82 + 0.2 * smoothstep(-0.5, 0.8, tw);
		rough = 1.0;
	} else if (pat == 30) {
		// Lantern glass: warm and flickering at night (emission = lamp size).
		float flick = 0.88 + 0.12 * sin(time * 9.0 + n1 * 6.0) * sin(time * 5.3 + world_pos.x);
		float on = lamp * emis;
		em += vec3(1.0, 0.66, 0.3) * on * 5.0 * flick;
		base = mix(base, vec3(1.0, 0.8, 0.5), on * 0.5);
		rough = 0.12;
		back = 0.4;
		emis_done = true;
	} else if (pat == 32) {
		// Painted wood (boats, doors, signs): paint over grain, worn edges.
		float grain = lm_rings(obj_pos.x, obj_pos.yz, 0.3);
		float wear = smoothstep(0.62, 0.8, lm_fbm(obj_pos * 9.0));
		base *= 0.92 + 0.1 * grain;
		base = mix(base, lm_linear(vec3(0.45, 0.31, 0.19)) * (0.8 + 0.25 * grain), wear * 0.75);
		rough = mix(0.62, 0.85, wear);
	} else if (pat == 34) {
		// Starstone crystal: always glows a little, more at night.
		float sp = pow(n2, 6.0) * 5.0;
		float pulse = 0.82 + 0.18 * sin(time * 1.7 + n1 * 4.0);
		em += vec3(0.62, 0.82, 1.0) * (emis * (1.2 + lamp * 1.6) * pulse + sp * 0.3) + base * 0.2;
		rough = 0.2;
		emis_done = true;
	} else if (pat == 40) {
		// Whitewash / lighthouse paint over masonry: faint courses, streaks
		// running down from the gallery, grime toward the ground.
		float course = smoothstep(0.03, 0.0, abs(fract(world_pos.y * 2.2) - 0.5) - 0.47);
		float streak = lm_noise(vec3(obj_pos.x * 4.0, obj_pos.y * 0.18, obj_pos.z * 4.0));
		float fine = lm_noise(vec3(obj_pos.x * 22.0, obj_pos.y * 1.5, obj_pos.z * 22.0));
		base *= 0.96 + 0.05 * n1;
		base *= 1.0 - course * 0.04;
		base = mix(base, base * vec3(0.84, 0.82, 0.78), smoothstep(0.5, 0.85, streak) * smoothstep(0.3, 0.8, fine) * 0.35);
		float grime = 1.0 - smoothstep(0.0, 1.6, obj_pos.y);
		base = mix(base, base * vec3(0.62, 0.6, 0.55), grime * 0.55);
		float chip = smoothstep(0.86, 0.93, lm_noise(obj_pos * 9.0));
		base = mix(base, lm_linear(vec3(0.62, 0.6, 0.57)), chip * 0.2);
		rough = 0.82;
	} else if (pat == 41) {
		// Masonry: dressed stone blocks with mortar joints, moss and lichen.
		vec3 p = obj_pos;
		float row = floor(p.y * 3.1);
		float joint_y = abs(fract(p.y * 3.1) - 0.5);
		float run = (abs(world_nrm.x) > abs(world_nrm.z) ? p.z : p.x) + (abs(world_nrm.y) > 0.7 ? p.z * 0.6 : 0.0);
		float col_i = run * 1.9 + row * 0.5;
		float joint_x = abs(fract(col_i) - 0.5);
		float block = lm_hash13(vec3(floor(col_i), row, 3.0));
		float mortar = max(smoothstep(0.43, 0.49, joint_y), smoothstep(0.44, 0.5, joint_x));
		base *= 0.78 + 0.32 * block + 0.12 * (lm_fbm(p * 4.0) - 0.5);
		base = mix(base, base * 0.55, mortar * 0.8);
		// Moss in patches (more on top faces); the emission channel can't be
		// used here, so the metallic channel > 0.5 asks for extra moss (ruins).
		float mossy = metal > 0.5 ? 1.0 : 0.0;
		metal = 0.0;
		float mp = lm_fbm(p * 1.3 + 4.0);
		float moss = smoothstep(0.6 - mossy * 0.22, 0.78 - mossy * 0.2, mp + up * (0.1 + mossy * 0.25));
		base = mix(base, lm_linear(vec3(0.33, 0.47, 0.2)) * (0.75 + 0.45 * n2), moss * 0.85);
		float lichen = smoothstep(0.8, 0.86, lm_noise(p * 21.0));
		base = mix(base, lm_linear(vec3(0.72, 0.74, 0.55)), lichen * 0.35);
		rough = mix(0.86, 0.97, moss);
	} else if (pat == 42) {
		// Glowing mushroom caps (blue): spots, softly pulsing, brighter at night.
		float spots = smoothstep(0.7, 0.78, lm_noise(obj_pos * 28.0));
		float pulse = 0.75 + 0.25 * sin(time * 1.3 + world_pos.x * 0.7 + world_pos.z * 0.9);
		vec3 glow = lm_linear(vcolor.rgb) * (0.5 + spots * 1.2);
		em += glow * emis * (0.35 + lamp * 2.6) * pulse;
		base = mix(base, base * 1.25, spots * 0.5);
		rough = 0.4;
		back = 0.5;
		emis_done = true;
	} else if (pat == 43) {
		// Paper / parchment (maps, notes): fibres, stains, faded ink lines.
		float fib = lm_noise(vec3(uv * 120.0, 0.0));
		float stain = smoothstep(0.55, 0.85, lm_fbm(vec3(uv * 6.0, 1.0)));
		base *= 0.92 + 0.08 * fib;
		base = mix(base, base * vec3(0.78, 0.66, 0.5), stain * 0.5);
		rough = 0.95;
	} else if (pat == 44) {
		// Earth / spoil heap / ore sack dirt: crumbly soil with pebbles.
		float clod = lm_fbm(obj_pos * 6.0);
		float peb = smoothstep(0.74, 0.8, lm_noise(obj_pos * 18.0));
		base *= 0.7 + 0.5 * clod;
		base = mix(base, lm_linear(vec3(0.5, 0.48, 0.45)), peb * 0.6);
		rough = 0.97;
	} else if (pat == 45) {
		// Leaves / fern fronds: midrib, veins, glossy tips, translucent.
		float vein = smoothstep(0.08, 0.0, abs(uv.x)) * 0.25;
		base *= 0.85 + 0.25 * n1 + vein;
		base = mix(base, base * vec3(1.15, 1.12, 0.8), smoothstep(0.6, 1.0, uv.y) * 0.4);
		rough = 0.62;
		back = 0.75;
	} else if (pat == 46) {
		// Painted metal (railings, lantern room, dome): chipped paint, rust.
		float r = smoothstep(0.66, 0.86, lm_fbm(obj_pos * 6.0));
		base *= 0.92 + 0.12 * n2;
		base = mix(base, lm_linear(vec3(0.38, 0.2, 0.1)), r * 0.6);
		metal = mix(0.35, 0.1, r);
		rough = mix(0.45, 0.85, r);
	} else if (pat == 47) {
		// Fresnel lens / lighthouse lamp: concentric prism rings that sparkle
		// by day and blaze warm at night (emission = brightness).
		float rings = abs(sin(uv.y * 40.0));
		float prism = smoothstep(0.6, 1.0, rings);
		base = mix(vec3(0.22, 0.3, 0.28), vec3(0.8, 0.86, 0.8), prism);
		rough = 0.06;
		metal = 0.55;
		float pulse = 0.94 + 0.06 * sin(time * 3.0);
		em += vec3(1.0, 0.78, 0.45) * (0.02 + lamp * emis * (0.6 + 0.4 * rings)) * 6.0 * pulse;
		emis_done = true;
	} else if (pat == 50) {
		// Wooden shingles in overlapping rows (any roof slope): rows follow
		// world height, shingle widths vary, lower edges are shaded.
		float rowf = world_pos.y * 4.2;
		float row = floor(rowf);
		float in_row = fract(rowf);
		float along = (world_pos.x + world_pos.z) * 3.1 + lm_hash13(vec3(row, 1.0, 2.0)) * 7.0;
		float id = floor(along);
		float tone = lm_hash13(vec3(id, row, 5.0));
		float gap = smoothstep(0.06, 0.0, abs(fract(along) - 0.5) - 0.44);
		base *= 0.78 + 0.32 * tone;
		base *= mix(0.62, 1.0, smoothstep(0.0, 0.3, in_row));
		base *= 1.0 - gap * 0.45;
		float moss = smoothstep(0.62, 0.85, lm_fbm(world_pos * 0.9));
		base = mix(base, lm_linear(vec3(0.36, 0.45, 0.22)) * (0.8 + 0.3 * n2), moss * 0.55);
		rough = 0.9;
	} else if (pat == 48) {
		// Inside of a tunnel / dark opening: darkens with depth (uv.y).
		base *= mix(1.0, 0.08, smoothstep(0.0, 1.0, uv.y));
		rough = 1.0;
	} else {
		base *= 0.95 + 0.08 * n1;
	}

	// Rain darkens porous things and makes them glossier.
	float wet = clamp(wetness, 0.0, 1.0);
	base *= mix(1.0, 0.7, wet * (1.0 - metal) * 0.7);
	rough = mix(rough, rough * 0.5, wet * 0.8);

	if (!emis_done) {
		em += base * emis;
	}
	s.albedo = base;
	s.rough = clamp(rough, 0.04, 1.0);
	s.metal = clamp(metal, 0.0, 1.0);
	s.ao = ao;
	s.emission = em;
	s.backlight = back;
	return s;
}
