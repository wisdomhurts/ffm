// Terrain of the playable map (chunks inside +-320 m). See terrain_body.gdshaderinc.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/terrain_body.gdshaderinc"
