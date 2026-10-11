// Phone preset: the playable-map terrain with cheap shading (TERRAIN_LITE:
// one triplanar rock sample, no bump or detail normal maps, Lambert diffuse).
// Terrain swaps to it when Settings.quality() == "phone". See
// terrain_body.gdshaderinc.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

#define TERRAIN_LITE
#include "res://shaders/terrain_body.gdshaderinc"
