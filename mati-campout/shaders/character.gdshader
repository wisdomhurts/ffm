// Shared material for characters, held items and pickups (MATI's Campout).
//
// Per-vertex data from items/mesh_kit.gd:
//   COLOR.rgb  albedo (sRGB)        COLOR.a  baked ambient occlusion
//   UV         surface coordinates in metres (pattern scale)
//   CUSTOM0    roughness, metallic, emission, pattern id
// Per-instance: hit_flash (white flash when hurt), glow (+glow_color) for
// pickups / highlights. Global: wetness darkens fabric in the rain.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

global uniform float wetness;

instance uniform float hit_flash = 0.0;
instance uniform float glow = 0.0;
instance uniform vec4 glow_color : source_color = vec4(1.0, 0.78, 0.42, 1.0);

uniform float rim_amount = 0.28;
uniform float emission_boost = 1.0;

varying vec4 mat_p;
varying vec3 obj_pos;

void vertex() {
	mat_p = CUSTOM0;
	obj_pos = VERTEX;
}

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

vec3 to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void fragment() {
	vec3 base = to_linear(COLOR.rgb);
	float ao = COLOR.a;
	float rough = mat_p.x;
	float metal = mat_p.y;
	float emis = mat_p.z;
	int pat = int(mat_p.w + 0.5);
	vec2 uv = UV;
	float n1 = vnoise(obj_pos * 23.0);
	float n2 = vnoise(obj_pos * 61.0 + 7.3);
	float shade = 1.0;

	if (pat == 1) {
		// Plaid (flannel): two crossing bands + thin light threads.
		vec2 q = fract(uv * 9.0);
		float bu = smoothstep(0.42, 0.46, q.x) * (1.0 - smoothstep(0.78, 0.82, q.x));
		float bv = smoothstep(0.42, 0.46, q.y) * (1.0 - smoothstep(0.78, 0.82, q.y));
		float thread = max(smoothstep(0.05, 0.0, abs(q.x - 0.15)), smoothstep(0.05, 0.0, abs(q.y - 0.15)));
		shade = 1.0 - 0.32 * bu - 0.32 * bv + 0.12 * bu * bv;
		base = base * shade + vec3(0.06) * thread;
		rough = max(rough, 0.82);
	} else if (pat == 2) {
		// Ribbed knit (cuffs, hems).
		shade = 0.86 + 0.14 * smoothstep(-0.4, 0.4, sin(uv.x * 190.0));
		base *= shade;
	} else if (pat == 3) {
		// Quilted puffer channels.
		float ch = abs(sin(uv.y * 31.0));
		shade = mix(0.72, 1.06, smoothstep(0.0, 0.55, ch));
		base *= shade;
		rough = mix(rough, 0.38, 0.6);
	} else if (pat == 4) {
		// Wood grain along the length.
		float g = sin(uv.x * 70.0 + n1 * 6.0 + uv.y * 3.0);
		shade = 0.86 + 0.14 * smoothstep(-0.6, 0.9, g) - 0.06 * n2;
		base *= shade;
	} else if (pat == 5) {
		// Hair strands.
		float s = sin(uv.x * 230.0 + n1 * 3.0);
		shade = 0.84 + 0.18 * smoothstep(-0.2, 1.0, s);
		base *= shade;
		rough = mix(rough, 0.45, 0.5);
	} else if (pat == 6) {
		// Denim twill.
		float tw = sin((uv.x + uv.y) * 260.0);
		shade = 0.9 + 0.08 * tw + 0.05 * (n2 - 0.5);
		base *= shade;
	} else if (pat == 7) {
		// Rust: blotches of orange-brown over dark iron.
		float r = smoothstep(0.38, 0.7, vnoise(obj_pos * 34.0) * 0.7 + n2 * 0.3);
		vec3 rust = to_linear(vec3(0.55, 0.27, 0.12));
		base = mix(base, rust, r * 0.85);
		metal = mix(metal, 0.05, r);
		rough = mix(rough, 0.95, r);
	} else if (pat == 8) {
		// Leather.
		shade = 0.88 + 0.16 * n2 + 0.05 * n1;
		base *= shade;
	} else if (pat == 9) {
		// Crystal: facet sparkle.
		float sp = pow(n2, 8.0) * 6.0;
		emis += sp * 0.4;
		base *= 0.9 + 0.2 * n1;
	} else if (pat == 10) {
		// Canvas weave.
		float w = sin(uv.x * 320.0) * sin(uv.y * 320.0);
		shade = 0.92 + 0.06 * w + 0.06 * (n1 - 0.5);
		base *= shade;
	} else if (pat == 11) {
		// Grill marks (cooked food).
		float gm = smoothstep(0.1, 0.0, abs(fract((uv.x + uv.y) * 14.0) - 0.5) - 0.38);
		base = mix(base, base * 0.35, gm * 0.8);
	} else if (pat == 12) {
		// Chunky knit (beanies, scarves).
		vec2 kq = vec2(uv.x * 60.0, uv.y * 90.0);
		float v = abs(fract(kq.x + abs(fract(kq.y) - 0.5)) - 0.5);
		shade = 0.84 + 0.2 * smoothstep(0.0, 0.5, v);
		base *= shade;
	} else {
		base *= 0.95 + 0.08 * n1;
	}

	// Rain soaks fabric and skin a little (metals just get shinier).
	float wet = clamp(wetness, 0.0, 1.0);
	base *= mix(1.0, 0.72, wet * (1.0 - metal) * 0.7);
	rough = mix(rough, rough * 0.55, wet);

	ALBEDO = base;
	ROUGHNESS = clamp(rough, 0.04, 1.0);
	METALLIC = metal;
	SPECULAR = 0.42;
	AO = ao;
	AO_LIGHT_AFFECT = 0.35;
	RIM = rim_amount * (1.0 - metal);
	RIM_TINT = 0.55;
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.2);
	vec3 em = base * emis * emission_boost;
	em += glow_color.rgb * glow * (0.12 + fres * 1.1);
	em += vec3(1.0, 0.92, 0.85) * hit_flash * (0.45 + fres);
	EMISSION = em;
}
