// Campfire flame tongues (MATI's Campout). One soft procedural flame per
// GPUParticles3D billboard: a teardrop shape eroded by scrolling noise, coloured
// by "temperature" (white-yellow core -> orange -> red tips) in HDR so the core
// blooms. Premultiplied alpha: the hot core is mostly additive while the body
// still reads as solid orange in daylight. Wind bends the tips.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled, skip_vertex_transform;

global uniform vec2 wind_direction;
global uniform float wind_strength;

// Overall HDR brightness (fire strength * level intensity).
uniform float heat = 1.0;
// 0 = healthy yellow fire, 1 = weak red fire.
uniform float redness = 0.0;
// How much the flame body hides what is behind it (0 = purely additive).
uniform float opacity = 0.45;
// 1 = tall licking tongue, 0 = round soft glow blob (core layer).
uniform float tongue = 1.0;
uniform float sway = 1.0;
uniform float scroll_speed = 1.8;
// Non-particle "hero" flames: a fixed age (>= 0) and their own seed.
uniform float fixed_age = -1.0;
uniform float seed_offset = 0.0;

varying float v_seed;
varying float v_age;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(i);
	float b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0));
	float d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
	float v = noise2(p) * 0.55;
	v += noise2(p * 2.1 + 5.2) * 0.3;
	v += noise2(p * 4.3 + 1.7) * 0.15;
	return v;
}

void vertex() {
	v_seed = fract(float(INSTANCE_ID) * 0.6180339 + 0.137 + seed_offset);
	v_age = fixed_age >= 0.0 ? fixed_age : clamp(INSTANCE_CUSTOM.y, 0.0, 1.0);
	// Camera-facing billboard that keeps the particle's scale.
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	vec3 upv = normalize(INV_VIEW_MATRIX[1].xyz);
	float sx = length(MODEL_MATRIX[0].xyz);
	float sy = length(MODEL_MATRIX[1].xyz);
	vec3 center = MODEL_MATRIX[3].xyz;
	float h = clamp(1.0 - UV.y, 0.0, 1.0);
	vec3 wpos = center + right * VERTEX.x * sx + upv * VERTEX.y * sy;
	// Wind leans the upper part; a slow wobble keeps each tongue alive.
	vec3 wind = vec3(wind_direction.x, 0.0, wind_direction.y) * clamp(wind_strength, 0.0, 1.5);
	wpos += wind * h * h * sy * 0.45 * sway;
	wpos += right * sin(TIME * (5.0 + v_seed * 3.0) + v_seed * 31.0) * 0.07 * h * sx * sway;
	VERTEX = (VIEW_MATRIX * vec4(wpos, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

vec3 fire_ramp(float t, float red) {
	// Blackbody-ish ramp, pushed toward red when the fire is weak.
	vec3 deep = vec3(0.55, 0.06, 0.015);
	vec3 orange = mix(vec3(1.0, 0.33, 0.05), vec3(0.95, 0.18, 0.03), red);
	vec3 yellow = mix(vec3(1.0, 0.6, 0.14), vec3(1.0, 0.4, 0.08), red);
	vec3 white = mix(vec3(1.0, 0.85, 0.52), vec3(1.0, 0.6, 0.22), red);
	vec3 c = mix(deep, orange, smoothstep(0.12, 0.42, t));
	c = mix(c, yellow, smoothstep(0.4, 0.7, t));
	c = mix(c, white, smoothstep(0.82, 1.0, t));
	return c;
}

void fragment() {
	vec2 uv = UV;
	float h = 1.0 - uv.y;
	float x = uv.x * 2.0 - 1.0;
	float t = TIME * scroll_speed * (0.85 + v_seed * 0.4);
	float n1 = fbm2(vec2(uv.x * 2.3 + v_seed * 17.0, uv.y * 1.7 + t));
	float n2 = noise2(vec2(uv.x * 5.5 - v_seed * 9.0, uv.y * 3.6 + t * 1.6));
	// Licks sideways, more at the top.
	x += (n1 - 0.5) * 0.95 * h * tongue;
	// Width profile: a rounded base narrowing to a pointed tip.
	float w_tongue = 0.7 * pow(max(1.0 - h, 0.0), 1.15) * smoothstep(-0.05, 0.22, h) + 0.02;
	float w = mix(0.9 * sqrt(max(1.0 - pow(abs(h - 0.5) * 2.0, 2.0), 0.0)), w_tongue, tongue);
	// Hot along the centre line, cooler toward the edges (orange rim).
	float edge = clamp(abs(x) / max(w, 0.001), 0.0, 1.0);
	float body = 1.0 - smoothstep(0.15, 1.0, edge);
	body = mix(body, 1.0 - smoothstep(w * 0.35, w + 0.02, abs(x)), 1.0 - tongue);
	float vert = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(mix(0.85, 0.6, tongue), 1.0, h + n2 * 0.25 * tongue));
	float d = body * vert;
	// Erode into wisps toward the top.
	d -= n2 * 0.5 * h * tongue + (1.0 - tongue) * n2 * 0.2;
	d = clamp(d * 1.35, 0.0, 1.0);
	float fade = smoothstep(0.0, 0.12, v_age) * (1.0 - smoothstep(0.6, 1.0, v_age));
	float temp = d * (1.0 - v_age * 0.55) * (1.0 - h * 0.4 * tongue);
	temp *= 1.0 - redness * 0.3;
	vec3 col = fire_ramp(temp, redness);
	// Mostly "solid" glowing flame bodies (high alpha: little runaway
	// accumulation where tongues overlap), brighter toward the hot core.
	float a = smoothstep(0.08, 0.42, temp) * fade * COLOR.a;
	float body_a = clamp(a * mix(0.82, opacity, step(tongue, 0.5)), 0.0, 1.0);
	float hdr = heat * (0.6 + 1.0 * temp * temp);
	ALBEDO = col * hdr * a;
	ALPHA = body_a;
}
