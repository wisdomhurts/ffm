// Shadow-creature body (Night Stalker, Watcher).
//
// Near-black skin with a deep violet translucency (BACKLIGHT lets the
// campfire glow through thin limbs), a fresnel rim that keeps the silhouette
// readable for young players at night, smoky noise-dissolved silhouette edges
// and fluttering tatters. All per-monster values are instance uniforms so every
// creature of a kind shares one material (one pipeline, cheap batching).
//
// Mesh contract (monster_models.gd): CUSTOM0.xyz = rest-pose position (keeps the
// smoke noise glued to the body while it animates), CUSTOM0.w = tatter amount
// (0 body .. 1 strand tip), COLOR.rgb = baked ambient occlusion.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert_wrap, specular_schlick_ggx;

global uniform float night_factor;

uniform vec3 body_color : source_color = vec3(0.05, 0.04, 0.07);
uniform vec3 sss_color : source_color = vec3(0.38, 0.16, 0.62);
uniform vec3 rim_color : source_color = vec3(0.46, 0.32, 0.86);
uniform vec3 burn_color : source_color = vec3(0.78, 0.42, 1.0);
uniform float rim_power = 3.2;
uniform float rim_glow = 0.26;
uniform float edge_ragged = 0.8;
uniform float smoke_scale = 4.2;
uniform float smoke_speed = 0.55;
uniform float tatter_sway = 0.09;
uniform float roughness_value = 0.86;

// 0 = solid, 1 = fully dissolved into smoke.
instance uniform float dissolve : instance_index(0) = 0.0;
// Hit flash, 1 at the moment of a hit, decays to 0.
instance uniform float flash : instance_index(1) = 0.0;
// Per-creature random offset so creatures never move in sync.
instance uniform float seed : instance_index(2) = 0.0;

varying vec3 rest_pos;
varying float tatter;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float a = hash13(i);
	float b = hash13(i + vec3(1.0, 0.0, 0.0));
	float c = hash13(i + vec3(0.0, 1.0, 0.0));
	float d = hash13(i + vec3(1.0, 1.0, 0.0));
	float e = hash13(i + vec3(0.0, 0.0, 1.0));
	float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
	float g = hash13(i + vec3(0.0, 1.0, 1.0));
	float h = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}

float fbm(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int k = 0; k < 3; k++) {
		s += a * vnoise(p);
		p = p * 2.07 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return s / 0.875;
}

void vertex() {
	rest_pos = CUSTOM0.xyz;
	tatter = CUSTOM0.w;
	if (tatter > 0.001) {
		float t = TIME * 1.8 + seed * 6.2831;
		vec3 sway = vec3(
			sin(t + rest_pos.y * 3.1 + rest_pos.z * 2.0),
			0.3 * sin(t * 1.37 + rest_pos.x * 5.0),
			cos(t * 0.83 + rest_pos.y * 2.3 + rest_pos.x * 1.7));
		VERTEX += sway * tatter_sway * tatter * tatter;
	}
}

void fragment() {
	float ndv = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float fres = 1.0 - ndv;
	vec3 sp = rest_pos * smoke_scale + vec3(seed * 17.0, -TIME * smoke_speed + seed * 5.0, TIME * 0.13);
	float n = fbm(sp);
	// Tatters fray into streaky smoke: stretched high-frequency noise.
	float streak = vnoise(rest_pos * vec3(64.0, 9.0, 64.0) + vec3(0.0, -TIME * 1.1, seed * 9.0));
	float tat = smoothstep(0.2, 1.0, tatter);
	float nc = mix(n, streak * 0.75 + n * 0.25, tat);
	// Ragged smoky silhouette, frayed tatter tips and the dissolve.
	float edge = smoothstep(0.42, 1.0, fres) * edge_ragged + tat * 1.1;
	float cut = edge * 0.78 + dissolve * 1.3 - 0.1;
	if (nc < cut) {
		discard;
	}
	// Faint violet glow where the smoke eats the body (strong while dissolving).
	float burn = (1.0 - smoothstep(0.0, 0.06, nc - cut)) * smoothstep(-0.05, 0.12, cut);
	float burn_strength = mix(0.12, 3.0, clamp(dissolve * 2.5, 0.0, 1.0));

	float variation = vnoise(rest_pos * 9.0 + seed * 3.0);
	ALBEDO = body_color * (0.7 + 0.6 * variation) * COLOR.rgb;
	ROUGHNESS = roughness_value;
	SPECULAR = 0.22;
	BACKLIGHT = sss_color * 0.45;
	RIM = 0.4;
	RIM_TINT = 0.65;

	float rim = pow(fres, rim_power);
	vec3 em = rim_color * rim * rim_glow * mix(0.3, 1.0, night_factor);
	em += sss_color * 0.06 * smoothstep(0.5, 0.95, n) * mix(0.4, 1.0, night_factor);
	ALBEDO *= mix(0.55, 1.15, smoothstep(0.25, 0.75, n));
	em += burn_color * burn * burn_strength;
	em += vec3(0.85, 0.7, 1.0) * flash * (0.22 + 1.6 * pow(fres, 1.5));
	EMISSION = em;
}
