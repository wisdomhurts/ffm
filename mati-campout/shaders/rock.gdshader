// Mossy boulders: triplanar procedural stone with lichen speckles, moss on
// top-facing surfaces and rain darkening.
//   COLOR.r     baked cavity AO
// INSTANCE_CUSTOM: x moss amount (0..1), y brightness (0.5 = 1x), z seed,
//                  w warmth (0 cool grey .. 1 warm sandstone)
shader_type spatial;
render_mode cull_back;

#include "res://shaders/foliage_noise.gdshaderinc"

global uniform float wetness;

uniform vec3 stone_dark : source_color = vec3(0.24, 0.225, 0.21);
uniform vec3 stone_light : source_color = vec3(0.6, 0.57, 0.52);
uniform vec3 stone_warm : source_color = vec3(0.58, 0.5, 0.42);
uniform vec3 moss_dark : source_color = vec3(0.13, 0.2, 0.07);
uniform vec3 moss_light : source_color = vec3(0.3, 0.41, 0.15);
uniform vec3 lichen : source_color = vec3(0.66, 0.68, 0.56);
instance uniform float use_custom_override = 0.0;
instance uniform vec4 custom_override = vec4(0.4, 0.5, 0.0, 0.3);

varying vec3 v_world_pos;
varying vec3 v_world_normal;
varying vec4 v_inst;

void vertex() {
	v_inst = mix(INSTANCE_CUSTOM, custom_override, use_custom_override);
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

float tri_noise(vec3 p, vec3 w, float scale) {
	float a = vg_fbm2(p.yz * scale);
	float b = vg_fbm2(p.xz * scale + 7.3);
	float c = vg_fbm2(p.xy * scale + 3.1);
	return a * w.x + b * w.y + c * w.z;
}

void fragment() {
	vec3 n = normalize(v_world_normal);
	vec3 w = pow(abs(n), vec3(4.0));
	w /= (w.x + w.y + w.z);
	vec3 p = v_world_pos + v_inst.z * 31.0;
	float big = tri_noise(p, w, 0.45);
	float fine = tri_noise(p, w, 2.6);
	float strata = sin(p.y * 5.5 + big * 4.0) * 0.5 + 0.5;
	vec3 stone = mix(stone_light, stone_warm, v_inst.w);
	vec3 albedo = mix(stone_dark, stone, smoothstep(0.2, 0.85, big * 0.75 + fine * 0.35 + strata * 0.12));
	albedo *= COLOR.r * 0.55 + 0.45;
	// Lichen speckles.
	float lich = smoothstep(0.7, 0.76, tri_noise(p * 2.3, w, 4.5));
	albedo = mix(albedo, lichen, lich * 0.4);
	// Moss creeping over the top.
	float top = smoothstep(0.25, 0.85, n.y);
	float mn = tri_noise(p, w, 0.9);
	float moss = smoothstep(0.42, 0.62, top * (0.35 + v_inst.x * 0.9) + (mn - 0.5) * 0.6);
	vec3 moss_c = mix(moss_dark, moss_light, smoothstep(0.3, 0.8, fine + top * 0.3));
	albedo = mix(albedo, moss_c, moss);
	albedo *= mix(0.8, 1.2, v_inst.y);
	float wet = wetness * (1.0 - moss * 0.4);
	albedo *= mix(1.0, 0.58, wet);
	ALBEDO = albedo;
	ROUGHNESS = mix(mix(0.82, 0.95, moss), 0.3, wet);
	SPECULAR = mix(0.4, 0.6, wet);
	AO = COLOR.r;
	AO_LIGHT_AFFECT = 0.4;
	float h = big * 0.6 + fine * 0.4 - moss * 0.2;
	NORMAL = vg_bump(VERTEX, NORMAL, h * 0.12, mix(1.0, 0.4, moss));
}
