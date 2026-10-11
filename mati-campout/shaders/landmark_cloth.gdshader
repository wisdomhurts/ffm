// Landmark cloth, canvas, nets and fern fronds (MATI's Campout).
// Double-sided, lets light glow through, flutters in the wind. The vertex
// "metallic" channel (CUSTOM0.y) is the flutter weight: 0 = pinned, 1 = loose.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/landmark.gdshaderinc"

global uniform float wind_strength;
global uniform vec2 wind_direction;

uniform float flutter_amount = 1.0;

void vertex() {
	float flutter = CUSTOM0.y;
	mat_p = vec4(CUSTOM0.x, 0.0, CUSTOM0.z, CUSTOM0.w);
	obj_pos = VERTEX;
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_nrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float w = clamp(wind_strength, 0.0, 1.5);
	float ph = dot(world_pos.xz, wind_direction) * 1.7;
	float wave = sin(TIME * 2.6 - ph) * 0.6 + sin(TIME * 4.9 - ph * 1.9 + world_pos.y * 3.0) * 0.4;
	// Loose things (washing, flags, fronds) also lean a little downwind.
	// Landmark meshes are only rotated, so the transpose maps world -> object.
	vec3 wind_obj = transpose(mat3(MODEL_MATRIX)) * vec3(wind_direction.x, 0.0, wind_direction.y);
	vec3 sway = NORMAL * wave * (0.012 + 0.03 * w);
	sway += wind_obj * w * 0.05 * (0.6 + 0.4 * sin(TIME * 1.7 - ph));
	VERTEX += sway * flutter * flutter_amount;
}

void fragment() {
	if (int(mat_p.w + 0.5) == 49) {
		// Fishing net: knotted cords on a diamond grid, holes cut out.
		vec2 g = vec2(UV.x + UV.y, UV.x - UV.y) * 9.0;
		vec2 f = abs(fract(g) - 0.5);
		float cord = max(smoothstep(0.42, 0.47, f.x), smoothstep(0.42, 0.47, f.y));
		if (cord < 0.5) {
			discard;
		}
	}
	LmSurface s = lm_surface(COLOR, UV, TIME);
	if (!FRONT_FACING) {
		s.albedo *= vec3(0.86, 0.84, 0.78);
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
