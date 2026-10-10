// Ground cover: grass clumps, wildflowers, ferns, mushrooms, pine cones and
// twigs. Sways with the global wind, bends away from the player and shrinks
// into the ground at the edge of its draw distance (no popping).
//   COLOR.rgb  base albedo
//   CUSTOM0.r  bend weight (0 root .. 1 tip)
//   CUSTOM0.g  petal weight: 1 = use the flower palette colour
//   CUSTOM0.b  white cap spots (mushrooms)
//   CUSTOM0.a  translucency
// INSTANCE_CUSTOM: x palette slot (0..1), y brightness (0.5 = 1x), z phase,
//                  w warmth (0 cool/lush .. 0.5 neutral .. 1 dry/golden)
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;

#include "res://shaders/foliage_noise.gdshaderinc"

global uniform float wind_strength;
global uniform vec2 wind_direction;
global uniform vec3 player_position;
global uniform float wetness;

uniform float fade_start = 34.0;
uniform float fade_end = 50.0;
uniform float wind_amount = 0.22;
uniform float push_radius = 1.3;
uniform float push_amount = 0.55;
uniform float ground_tint_strength = 0.0;
uniform vec3 petal_0 : source_color = vec3(0.96, 0.95, 0.9);
uniform vec3 petal_1 : source_color = vec3(1.0, 0.82, 0.18);
uniform vec3 petal_2 : source_color = vec3(0.62, 0.42, 0.9);
uniform vec3 petal_3 : source_color = vec3(0.9, 0.2, 0.17);

varying vec4 v_custom;
varying vec4 v_inst;
varying vec3 v_up_normal;

void vertex() {
	v_custom = CUSTOM0;
	v_inst = INSTANCE_CUSTOM;
	vec3 origin = MODEL_MATRIX[3].xyz;
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float bw = CUSTOM0.r;
	float t = TIME;
	// Rolling gusts travel across the field in the wind direction.
	float along = dot(wp.xz, wind_direction);
	float gust = vg_noise2(vec2(along * 0.09 - t * 0.55, dot(wp.xz, vec2(-wind_direction.y, wind_direction.x)) * 0.05));
	float wave = sin(t * 2.1 + along * 0.6 + INSTANCE_CUSTOM.z * 6.28) * 0.35;
	vec3 off = vec3(0.0);
	float wamt = wind_amount * (0.35 + wind_strength * 1.6) * (0.5 + gust + wave) * bw * bw;
	off.xz += wind_direction * wamt;
	off.y -= wamt * 0.35;
	// Bend away from the player.
	vec2 away = wp.xz - player_position.xz;
	float pd = length(away);
	float near_y = 1.0 - smoothstep(1.2, 2.5, abs(wp.y - player_position.y));
	float push = (1.0 - smoothstep(push_radius * 0.25, push_radius, pd)) * near_y;
	off.xz += away / max(pd, 0.05) * push * push_amount * bw;
	off.y -= push * push_amount * 0.55 * bw;
	// Shrink into the ground near the end of the draw distance.
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	float d = distance(origin, cam);
	float fade = 1.0 - smoothstep(fade_start, fade_end, d);
	vec3 shrunk = mix(origin + (wp - origin) * vec3(1.0, 0.0, 1.0), wp, fade);
	wp = shrunk + off * fade;
	// Back to model space (instances are yaw + uniform scale).
	vec3 rel = wp - origin;
	float s2 = max(dot(MODEL_MATRIX[0].xyz, MODEL_MATRIX[0].xyz), 1e-6);
	VERTEX = vec3(dot(rel, MODEL_MATRIX[0].xyz), dot(rel, MODEL_MATRIX[1].xyz), dot(rel, MODEL_MATRIX[2].xyz)) / s2;
	// Soft, mostly-up normals so both faces of a blade light alike.
	vec3 wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_up_normal = normalize(mix(wn, vec3(0.0, 1.0, 0.0), 0.55 + 0.25 * (1.0 - CUSTOM0.g)));
}

vec3 palette(float slot) {
	if (slot < 0.25) {
		return petal_0;
	} else if (slot < 0.5) {
		return petal_1;
	} else if (slot < 0.75) {
		return petal_2;
	}
	return petal_3;
}

void fragment() {
	float bw = v_custom.r;
	// Vertex colours are authored in sRGB.
	vec3 albedo = pow(COLOR.rgb, vec3(2.2));
	// Warmth: lush blue-green .. dry golden.
	float warm = v_inst.w - 0.5;
	albedo = warm >= 0.0 ? mix(albedo, albedo * vec3(1.22, 1.08, 0.62), warm * 2.0) : mix(albedo, albedo * vec3(0.84, 1.0, 1.1), -warm * 2.0);
	albedo *= mix(0.8, 1.2, v_inst.y);
	vec3 pc = palette(v_inst.x);
	albedo = mix(albedo, pc * (0.92 + 0.08 * bw), v_custom.g);
	if (v_custom.b > 0.01) {
		float spots = smoothstep(0.72, 0.8, vg_noise2(UV * 7.0 + v_inst.z * 11.0));
		albedo = mix(albedo, vec3(0.95, 0.93, 0.86), spots * v_custom.b);
	}
	// Darker at the root (contact shadow), brighter tips.
	float rootao = mix(0.6, 1.0, smoothstep(0.0, 0.7, bw));
	albedo *= mix(rootao, 1.0, v_custom.g);
	albedo *= mix(1.0, 0.72, wetness);
	ALBEDO = albedo;
	ROUGHNESS = mix(0.82, 0.45, wetness);
	SPECULAR = 0.25;
	AO = rootao;
	AO_LIGHT_AFFECT = 0.25;
	BACKLIGHT = albedo * v_custom.a;
	NORMAL = normalize((VIEW_MATRIX * vec4(v_up_normal, 0.0)).xyz);
}
