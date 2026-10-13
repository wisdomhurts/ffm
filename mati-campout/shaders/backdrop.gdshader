// Distant mountain ranges: forested foothills, bare rock, snow caps, and a
// layered atmospheric haze (own haze, engine fog disabled, so each range reads
// a step lighter / bluer than the one in front of it).
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx, fog_disabled;

#include "res://shaders/terrain_common.gdshaderinc"

global uniform float wetness;
global uniform float night_factor;

uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 haze_color : source_color = vec3(0.62, 0.70, 0.80);
uniform float haze_density = 0.0011;
uniform float haze_max = 0.8;
uniform float haze_energy = 1.0;
uniform vec3 sun_dir = vec3(0.0, 0.5, 0.8);
uniform vec3 sun_scatter : source_color = vec3(0.0);
// Extra haze for this layer (further ranges are paler).
uniform float layer_haze = 0.0;
uniform float snow_line = 230.0;
uniform float tree_line = 140.0;

uniform vec3 forest_col : source_color = vec3(0.10, 0.19, 0.12);
uniform vec3 forest_light : source_color = vec3(0.22, 0.31, 0.17);
uniform vec3 rock_col : source_color = vec3(0.42, 0.42, 0.44);
uniform vec3 rock_dark : source_color = vec3(0.26, 0.26, 0.29);
uniform vec3 snow_col : source_color = vec3(0.79, 0.83, 0.89);

varying vec3 v_world;
varying vec3 v_wn;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 p = v_world;
	vec3 N = normalize(v_wn);
	float dist = length(p - CAMERA_POSITION_WORLD);
	vec4 n1 = texture(noise_tex, p.xz * 0.0031);
	vec4 n2 = texture(noise_tex, tc_rot(p.xz, 1.2) * 0.013);
	vec4 n3 = texture(noise_tex, vec2(p.x + p.z, p.y * 2.0) * 0.011);
	float slope = 1.0 - N.y;

	// Forest on the lower, gentler slopes; rock above the tree line.
	float tl = tree_line + (n1.r - 0.5) * 90.0;
	float forest = smoothstep(tl + 25.0, tl - 25.0, p.y) * (1.0 - smoothstep(0.5, 0.75, slope));
	vec3 fc = mix(forest_col, forest_light, smoothstep(0.35, 0.8, n2.g * 0.6 + n2.r * 0.5));
	vec3 rc = mix(rock_dark, rock_col, smoothstep(0.25, 0.75, n2.b * 0.6 + n3.r * 0.5));
	// Gully streaks down the faces.
	rc *= mix(0.75, 1.08, smoothstep(0.2, 0.8, n3.g));
	vec3 col = mix(rc, fc, forest);

	// Snow caps: above the snow line, less on the steepest faces.
	float sl = snow_line + (n1.b - 0.5) * 70.0 + (n3.r - 0.5) * 30.0;
	float snow = smoothstep(sl - 12.0, sl + 18.0, p.y) * (1.0 - smoothstep(0.45, 0.8, slope) * 0.75);
	snow = max(snow, smoothstep(sl + 50.0, sl + 110.0, p.y) * 0.8);
	// Rocky gullies streak down through the snow.
	float gully = texture(noise_tex, vec2((p.x - p.z) * 0.006, p.y * 0.0018)).r;
	float gully2 = texture(noise_tex, vec2((p.x + p.z) * 0.013, p.y * 0.004)).b;
	snow *= 1.0 - smoothstep(0.55, 0.72, gully * 0.65 + gully2 * 0.5) * 0.85;
	vec3 sc = snow_col * mix(0.82, 1.0, smoothstep(0.3, 0.7, n2.r));
	col = mix(col, sc, snow);
	col *= mix(1.0, 0.75, wetness);

	// Layered haze: distance + low-lying, + this layer's own lift.
	float haze = 1.0 - exp(-dist * haze_density);
	haze += (1.0 - smoothstep(0.0, 260.0, p.y)) * 0.12 + layer_haze;
	haze = clamp(haze, 0.0, haze_max);
	vec3 vdir = normalize(p - CAMERA_POSITION_WORLD);
	float toward_sun = pow(max(dot(vdir, normalize(sun_dir)), 0.0), 6.0);
	vec3 hc = haze_color + sun_scatter * toward_sun;

	ALBEDO = col * (1.0 - haze);
	EMISSION = hc * haze * haze_energy;
	ROUGHNESS = mix(0.95, 0.6, snow);
	SPECULAR = mix(0.2, 0.45, snow);
}
