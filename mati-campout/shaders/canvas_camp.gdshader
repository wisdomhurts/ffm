// Tent canvas, rugs, flags and bunting (MATI's Campout). Double-sided, lets
// light glow through (a lantern inside makes the tent glow at night) and
// flutters gently in the wind. The vertex "metallic" channel (CUSTOM0.y) is
// reused as the flutter weight: 0 = pinned to a pole/edge, 1 = loose.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/wood_camp.gdshaderinc"

global uniform float wind_strength;
global uniform vec2 wind_direction;

uniform float flutter_amount = 1.0;

void vertex() {
	float flutter = CUSTOM0.y;
	mat_p = vec4(CUSTOM0.x, 0.0, CUSTOM0.z, CUSTOM0.w);
	obj_pos = VERTEX;
	obj_nrm = NORMAL;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_nrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float w = clamp(wind_strength, 0.0, 1.5);
	float ph = dot(world_pos.xz, wind_direction) * 1.7;
	float wave = sin(TIME * 2.6 - ph) * 0.6 + sin(TIME * 4.9 - ph * 1.9 + world_pos.y * 3.0) * 0.4;
	VERTEX += NORMAL * wave * flutter * flutter_amount * (0.012 + 0.03 * w);
}

void fragment() {
	CampSurface s = camp_surface(COLOR, UV, TIME);
	if (!FRONT_FACING) {
		// Inside of the tent: a little darker and warmer.
		s.albedo *= vec3(0.86, 0.82, 0.76);
	}
	ALBEDO = s.albedo;
	ROUGHNESS = s.rough;
	METALLIC = 0.0;
	SPECULAR = 0.3;
	AO = s.ao;
	AO_LIGHT_AFFECT = 0.4;
	EMISSION = s.emission;
	BACKLIGHT = s.albedo * s.backlight;
}
