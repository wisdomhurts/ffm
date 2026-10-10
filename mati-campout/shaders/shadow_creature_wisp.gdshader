// Soft shadow-smoke wisps for GPUParticles3D draw passes (creature trails and
// shadow puffs). Billboarded, lit (the campfire tints the smoke), with a noisy
// edge so puffs never read as discs. Particle COLOR (from the process
// material's colour ramp) drives tint and fade.
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, diffuse_lambert_wrap, specular_disabled, shadows_disabled;

global uniform float night_factor;

uniform vec3 smoke_color : source_color = vec3(0.07, 0.05, 0.1);
uniform vec3 glow_color : source_color = vec3(0.34, 0.16, 0.6);
uniform float glow = 0.18;
uniform float opacity = 0.7;
uniform float edge_noise = 0.65;

varying float life;
varying float pseed;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
		mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}

void vertex() {
	life = INSTANCE_CUSTOM.y;
	pseed = float(INSTANCE_ID) * 1.618;
	float a = INSTANCE_CUSTOM.x;
	mat2 rot = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a)));
	VERTEX.xy = rot * VERTEX.xy;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(
		vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0),
		vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0),
		vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0),
		vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float n = vnoise(vec3(UV * 3.2 + pseed, life * 1.6 + pseed));
	float n2 = vnoise(vec3(UV * 7.0 - pseed, life * 2.4));
	float r = length(p) + (n - 0.5) * edge_noise + (n2 - 0.5) * 0.25;
	float a = 1.0 - smoothstep(0.15, 0.95, r);
	ALBEDO = smoke_color * COLOR.rgb;
	EMISSION = glow_color * glow * (0.4 + 0.6 * n) * mix(0.4, 1.0, night_factor);
	ALPHA = clamp(a * COLOR.a * opacity, 0.0, 1.0);
	ROUGHNESS = 1.0;
}
