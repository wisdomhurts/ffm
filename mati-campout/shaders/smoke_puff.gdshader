// Soft curling campfire smoke (MATI's Campout). Large, slowly rotating
// billboards with a noisy puff shape. Unshaded but lit by hand: daylight grey
// by day, deep blue-grey at night, warmed from below by the fire glow.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled, skip_vertex_transform;

global uniform vec3 fire_position;
global uniform float fire_strength;

// 0 = day, 1 = night (set by the campfire from the day cycle).
uniform float darkness = 0.0;
uniform float density = 0.5;
uniform vec4 day_color : source_color = vec4(0.72, 0.72, 0.74, 1.0);
uniform vec4 night_color : source_color = vec4(0.16, 0.17, 0.23, 1.0);
uniform vec4 glow_color : source_color = vec4(1.0, 0.58, 0.3, 1.0);
// Extra warm glow (embers smouldering after the fire went out).
uniform float smoulder_glow = 0.0;

varying float v_seed;
varying float v_age;
varying vec3 v_world;

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
	float v = noise2(p) * 0.5;
	v += noise2(p * 2.07 + 3.1) * 0.3;
	v += noise2(p * 4.2 + 8.3) * 0.2;
	return v;
}

void vertex() {
	v_seed = fract(float(INSTANCE_ID) * 0.5698403 + 0.21);
	v_age = clamp(INSTANCE_CUSTOM.y, 0.0, 1.0);
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	vec3 upv = normalize(INV_VIEW_MATRIX[1].xyz);
	float s = length(MODEL_MATRIX[0].xyz);
	// Slow roll so puffs curl as they rise.
	float a = v_seed * 6.2831 + TIME * (v_seed - 0.5) * 0.5;
	vec2 rv = vec2(cos(a) * VERTEX.x - sin(a) * VERTEX.y, sin(a) * VERTEX.x + cos(a) * VERTEX.y);
	vec3 wpos = MODEL_MATRIX[3].xyz + (right * rv.x + upv * rv.y) * s;
	v_world = wpos;
	VERTEX = (VIEW_MATRIX * vec4(wpos, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float n = fbm2(UV * 2.6 + vec2(v_seed * 13.0, -TIME * 0.12 + v_age * 1.5));
	float shape = 1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.7);
	shape *= smoothstep(0.2, 0.6, n + 0.25);
	float env = COLOR.a;
	float a = clamp(shape * env * density, 0.0, 1.0);
	vec3 base = mix(day_color.rgb, night_color.rgb, darkness);
	base *= 0.85 + 0.3 * n;
	float hgt = max(v_world.y - fire_position.y, 0.0);
	float lit = (fire_strength + smoulder_glow) * exp(-hgt * 0.55) * (0.25 + darkness * 0.95);
	vec3 col = base + glow_color.rgb * lit * 0.4;
	ALBEDO = col;
	ALPHA = a;
}
