// Bark for stumps, fallen logs and other static wood: fibrous plates with
// dark furrows, moss on top, light cut-wood faces with growth rings.
//   COLOR.rgb  baked AO / tint
//   UV         bark: (around, along m) | cut face: disk coords -1..1
//   CUSTOM0.g  1 = cut face (rings), 0 = bark
//   CUSTOM0.b  moss amount
// INSTANCE_CUSTOM: x tint shift, y brightness (0.5 = 1x), z seed, w dryness/grey
shader_type spatial;
render_mode cull_back;

#include "res://shaders/foliage_noise.gdshaderinc"

global uniform float wetness;

uniform vec3 bark_dark : source_color = vec3(0.12, 0.08, 0.055);
uniform vec3 bark_light : source_color = vec3(0.39, 0.27, 0.18);
uniform vec3 wood_light : source_color = vec3(0.8, 0.62, 0.42);
uniform vec3 wood_ring : source_color = vec3(0.55, 0.38, 0.22);
uniform vec3 moss_color : source_color = vec3(0.27, 0.37, 0.13);
instance uniform float use_custom_override = 0.0;
instance uniform vec4 custom_override = vec4(0.0, 0.5, 0.0, 0.0);

varying vec4 v_custom;
varying vec4 v_inst;
varying vec3 v_world_normal;

void vertex() {
	v_custom = CUSTOM0;
	v_inst = mix(INSTANCE_CUSTOM, custom_override, use_custom_override);
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float seed = v_inst.z * 17.0;
	vec3 albedo;
	float h;
	float rough = 0.9;
	float bump = 0.8;
	if (v_custom.g > 0.5) {
		float r = length(UV);
		float wob = vg_noise2(UV * 3.0 + seed) * 0.08;
		float rings = sin((r + wob) * 42.0) * 0.5 + 0.5;
		float grain = vg_noise2(UV * vec2(40.0, 4.0) + seed);
		albedo = mix(wood_light, wood_ring, smoothstep(0.55, 0.95, rings) * 0.55 + grain * 0.12);
		albedo *= mix(1.0, 0.72, smoothstep(0.0, 0.22, 0.22 - r));  // darker heart
		albedo = mix(albedo, bark_dark * 1.4, smoothstep(0.86, 0.97, r));  // bark rim
		albedo *= mix(vec3(1.0), vec3(0.78, 0.76, 0.74), v_inst.w);  // weathered grey
		h = rings * 0.3 + grain * 0.2;
		bump = 0.35;
		rough = 0.8;
	} else {
		float n = vg_fbm2(vec2(UV.x * 7.0, UV.y * 0.32) + seed);
		float furrow = smoothstep(0.05, 0.6, abs(sin((UV.x * 7.0 + n * 1.6) * 3.14159)));
		float plates = vg_noise2(vec2(UV.x * 14.0, UV.y * 2.2) + seed) * 0.5 + 0.5;
		h = furrow * 0.7 + plates * 0.3;
		albedo = mix(bark_dark, bark_light, h * (0.75 + 0.25 * n));
		albedo = mix(albedo, vec3(dot(albedo, vec3(0.33))) * vec3(1.05, 1.0, 0.95) * 1.35, v_inst.w);
	}
	albedo *= COLOR.rgb * mix(0.8, 1.2, v_inst.y);
	float mn = vg_fbm2(UV * vec2(6.0, 1.8) + seed + 2.0);
	float moss = clamp(v_custom.b * (0.4 + smoothstep(0.1, 0.8, v_world_normal.y)), 0.0, 1.0);
	moss = smoothstep(0.3, 0.65, moss * (0.5 + mn));
	albedo = mix(albedo, moss_color * (0.75 + 0.5 * mn), moss);
	bump *= 1.0 - moss * 0.6;
	albedo *= mix(1.0, 0.66, wetness);
	ALBEDO = albedo;
	ROUGHNESS = mix(rough, 0.38, wetness * 0.8);
	SPECULAR = 0.35;
	AO = COLOR.r;
	AO_LIGHT_AFFECT = 0.3;
	NORMAL = vg_bump(VERTEX, NORMAL, h * 0.035, bump);
}
