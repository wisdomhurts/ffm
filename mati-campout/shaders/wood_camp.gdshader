// Camp props (MATI's Campout): wood, bark, end grain, stone, iron, rope,
// lantern glass, chalkboard, painted wood, charred logs and food.
// See wood_camp.gdshaderinc for the vertex layout and pattern ids.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/wood_camp.gdshaderinc"

void vertex() {
	mat_p = CUSTOM0;
	obj_pos = VERTEX;
	obj_nrm = NORMAL;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_nrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	CampSurface s = camp_surface(COLOR, UV, TIME);
	ALBEDO = s.albedo;
	ROUGHNESS = s.rough;
	METALLIC = s.metal;
	SPECULAR = 0.4;
	AO = s.ao;
	AO_LIGHT_AFFECT = 0.4;
	EMISSION = s.emission;
}
