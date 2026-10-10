// Far outer ring (640 m to the horizon): forest canopy seen from afar,
// beaches and lake bed, with its own capped distance haze (engine fog
// disabled so the far shore and hills stay readable). See
// terrain_body.gdshaderinc.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx, fog_disabled;

#define TERRAIN_FAR
#define TERRAIN_HAZE
#include "res://shaders/terrain_body.gdshaderinc"
