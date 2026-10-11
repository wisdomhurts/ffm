// Treasure chests (MATI's Campout, world/chest_models.gd).
// Planks with real 3D grain, forged iron with rust, polished engraved gold,
// faceted glowing gems, plum lacquer and brass. A soft glint sweeps over
// the metal so kids notice chests (stronger at dusk); golden chests also
// glow gently. Rain darkens wood and makes everything glossier.
//
// Vertex data (MeshKit layout): COLOR rgb = albedo (sRGB), a = baked AO;
// UV in metres; CUSTOM0 = roughness, metallic, emission, pattern id:
//   20/21/22 planks (grain along object X/Y/Z), 28 iron, 40 gold, 41 gem,
//   42 velvet, 43 brass, 45 lacquer, anything else = plain paint.
// Plain uniforms only (one material per tier and state), so it costs no
// instance-uniform slots on the Compatibility renderer.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

global uniform float wetness;
global uniform float night_factor;

// Strength of the glint sweep over metal (0 once the chest is opened).
uniform float glint = 0.5;
uniform vec3 glint_color : source_color = vec3(1.0, 0.86, 0.55);
// Gentle golden glow (epic chests).
uniform float glow = 0.0;
uniform float gem_glow = 1.0;

varying vec4 mat_p;
varying vec3 obj_pos;
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

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Flat-sawn growth rings around an axis through the board: arches on the
// broad faces, lines on the edges, rings on the ends.
float wood_rings(float along, vec2 across, float seed) {
	vec2 c = across + vec2(0.31 + seed * 0.7, -0.27 - seed * 0.4);
	float wob = vnoise(vec3(along * 1.3, across * 6.0)) * 0.012;
	float r = length(c) + wob + vnoise(vec3(along * 0.35, seed * 9.0, 0.0)) * 0.02;
	float ring = fract(r * 34.0);
	return smoothstep(0.0, 0.18, ring) * (1.0 - smoothstep(0.55, 1.0, ring));
}

void vertex() {
	mat_p = CUSTOM0;
	obj_pos = VERTEX;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_nrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 base = to_linear(COLOR.rgb);
	float ao = COLOR.a;
	float rough = mat_p.x;
	float metal = mat_p.y;
	float emis = mat_p.z;
	int pat = int(mat_p.w + 0.5);
	vec3 em = vec3(0.0);
	float n1 = vnoise(obj_pos * 9.0);
	float n2 = vnoise(obj_pos * 37.0 + 7.3);
	float up = clamp(world_nrm.y, 0.0, 1.0);
	// How strongly the glint shows on this surface.
	float shiny = 0.0;
	float porous = 1.0;
	float spec = 0.45;

	if (pat >= 20 && pat <= 22) {
		vec3 p = obj_pos;
		float along = pat == 20 ? p.x : (pat == 21 ? p.y : p.z);
		vec2 across = pat == 20 ? p.yz : (pat == 21 ? p.xz : p.xy);
		float seed = hash13(floor(vec3(across * 9.0, 0.5)));
		float rings = wood_rings(along, across, seed);
		float fib = vnoise(vec3(along * 3.0, across * 90.0));
		float knot = smoothstep(0.03, 0.0, length(vec2(fract(along * 1.3 + seed) - 0.5, fract((across.x + across.y) * 7.0) - 0.5) * vec2(0.55, 1.0)));
		base *= 0.78 + 0.22 * rings + 0.1 * fib - 0.05 * seed;
		base = mix(base, base * 0.5, knot * 0.6);
		base *= 0.92 + 0.12 * vnoise(p * 3.0);
		// Weathering: sun-bleached tops, grime toward the ground.
		base = mix(base, base * vec3(1.1, 1.07, 1.02), up * 0.35);
		float grime = 1.0 - smoothstep(0.0, 0.18, p.y);
		base = mix(base, base * vec3(0.7, 0.66, 0.6), grime * 0.5);
		shiny = 0.12;
	} else if (pat == 45) {
		// Lacquered panels: deep colour, faint grain, glossy.
		float grain = wood_rings(obj_pos.x, obj_pos.yz, 0.4);
		base *= 0.86 + 0.14 * grain + 0.06 * (n1 - 0.5);
		rough = 0.32 + 0.12 * n2;
		porous = 0.4;
		spec = 0.55;
		shiny = 0.2;
	} else if (pat == 28) {
		// Forged iron: hammered, with rust in the crevices.
		float hammer = vnoise(obj_pos * 60.0);
		float r = smoothstep(0.56, 0.82, fbm3(obj_pos * 8.0));
		base *= 0.82 + 0.3 * hammer;
		base = mix(base, to_linear(vec3(0.43, 0.23, 0.12)), r * 0.65);
		metal = mix(metal, 0.15, r);
		rough = mix(rough + 0.1 * hammer, 0.92, r);
		shiny = 0.65 - r * 0.5;
		porous = 0.2;
	} else if (pat == 40 || pat == 43) {
		// Gold (and brass): engraved scrollwork in the recesses, polished
		// highs, a little tarnish.
		float sw = sin(UV.x * 95.0 + sin(UV.y * 70.0 + n1 * 2.0) * 1.8) * sin(UV.y * 95.0 + sin(UV.x * 63.0) * 1.8);
		float fw = fwidth(UV.x * 95.0) + fwidth(UV.y * 95.0);
		float eng = smoothstep(0.6, 0.9, abs(sw)) * (1.0 - smoothstep(0.6, 2.0, fw));
		base *= 0.92 + 0.16 * n1;
		base = mix(base, base * 0.55, eng * 0.55);
		rough = mix(rough, rough + 0.25, eng);
		float tarnish = smoothstep(0.6, 0.85, fbm3(obj_pos * 6.0));
		base = mix(base, base * vec3(0.7, 0.62, 0.45), tarnish * (pat == 43 ? 0.7 : 0.35));
		metal = 1.0;
		shiny = pat == 40 ? 1.0 : 0.8;
		porous = 0.0;
		spec = 0.6;
		if (pat == 40) {
			float pulse = 0.75 + 0.25 * sin(TIME * 1.4 + n1 * 3.0);
			em += base * glow * 0.12 * pulse * (1.0 - eng * 0.6);
		}
	} else if (pat == 41) {
		// Faceted gem with an inner glow.
		float facet = 0.75 + 0.5 * n2;
		float pulse = 0.8 + 0.2 * sin(TIME * 2.3 + n1 * 5.0);
		em += base * gem_glow * (1.6 + 0.8 * facet) * pulse;
		base *= 0.6 * facet;
		rough = 0.06;
		metal = 0.3;
		shiny = 1.0;
		porous = 0.0;
		spec = 0.8;
	} else if (pat == 42) {
		// Velvet lining.
		float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.5);
		base *= 0.85 + 0.15 * n1;
		base += base * rim * 0.6;
		rough = 1.0;
	} else {
		base *= 0.95 + 0.08 * n1;
	}

	// Glint: a thin band of light sweeping across the metal in world space,
	// so every chest flashes at a different moment. Stronger at dusk.
	float s = fract(dot(world_pos, vec3(0.43, 0.75, 0.31)) * 0.32 - TIME * 0.19);
	float band = smoothstep(0.0, 0.012, s) * (1.0 - smoothstep(0.012, 0.05, s));
	// Brightest where the surface turns toward the camera, like a real glint.
	float facing = 0.35 + 0.65 * pow(clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	float duskk = smoothstep(0.08, 0.45, night_factor) - 0.35 * smoothstep(0.75, 1.0, night_factor);
	float g = glint * (0.7 + 0.9 * duskk);
	em += mix(glint_color, base * 4.0, 0.45) * band * shiny * facing * g * 1.1;
	// A little fill so dark woods still read at dusk: the browser renderer
	// has no SSAO / SSIL bounce light and its evenings come out darker.
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	em += base * (0.12 + 0.4 * max(duskk, 0.0));
#else
	em += base * 0.05 * max(duskk, 0.0);
#endif
	// A faint warm rim at dusk/night keeps the silhouette readable.
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	em += glint_color * fres * glint * duskk * 0.05;

	// Rain darkens porous things and makes everything glossier.
	float wet = clamp(wetness, 0.0, 1.0);
	base *= mix(1.0, 0.66, wet * porous * 0.8);
	rough = mix(rough, rough * 0.45, wet * 0.85);

	em += base * emis;
	ALBEDO = base;
	ROUGHNESS = clamp(rough, 0.04, 1.0);
	METALLIC = clamp(metal, 0.0, 1.0);
	SPECULAR = spec;
	AO = ao;
	AO_LIGHT_AFFECT = 0.35;
	EMISSION = em;
}
