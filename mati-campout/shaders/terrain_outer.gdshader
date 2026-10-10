// Near outer ring (map edge to 640 m): forest canopy seen from afar, with the
// engine fog like the map itself. See terrain_body.gdshaderinc.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

#define TERRAIN_FAR
#include "res://shaders/terrain_body.gdshaderinc"
