// The stream: a clear, shallow flowing ribbon. Normals and foam streaks
// scroll along the flow (UV.y = metres downstream), faster and whiter where
// the bed is steep; soft foam where the water meets the banks; refraction of
// the pebbly bed.
//   UV.x 0..1 across, UV.y metres along the flow
//   COLOR.r steepness 0..1, COLOR.a fade at the ends
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/terrain_common.gdshaderinc"

global uniform float wetness;
global uniform float night_factor;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;

uniform vec3 water_col : source_color = vec3(0.15, 0.27, 0.22);
uniform vec3 foam_col : source_color = vec3(0.86, 0.91, 0.90);
uniform vec3 absorb = vec3(0.32, 0.12, 0.11);
uniform float flow_speed = 0.8;
uniform float refraction = 0.03;

varying vec4 v_col;

void vertex() {
	v_col = COLOR;
}

float view_z_at(vec2 uv, mat4 inv_proj, out vec3 view_pos) {
	float d = textureLod(depth_tex, uv, 0.0).r;
	vec4 p = inv_proj * vec4(uv * 2.0 - 1.0, d, 1.0);
	view_pos = p.xyz / p.w;
	return view_pos.z;
}

void fragment() {
	float steep = v_col.r;
	float speed = flow_speed * (0.5 + steep * 3.0);
	vec2 uv = UV;
	float dist = length(VERTEX);
	vec3 wpos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Flowing ripples: two layers stretched along the flow.
	vec2 f1 = vec2(uv.x * 0.9, uv.y * 0.22 - TIME * speed * 0.22);
	vec2 f2 = vec2(uv.x * 1.9 + 0.37, uv.y * 0.47 - TIME * speed * 0.47);
	vec2 n = tc_nmap(texture(normal_tex, f1)) * 0.6 + tc_nmap(texture(normal_tex, f2)) * 0.45;
	n += tc_nmap(texture(normal_tex, wpos.xz * 0.7 + vec2(TIME * 0.5, -TIME * 0.4))) * wetness * 0.5;
	n *= 0.28 + steep * 0.55;
	vec3 Nw = normalize(vec3(n.x, 1.0, n.y));
	vec3 Nv = normalize((VIEW_MATRIX * vec4(Nw, 0.0)).xyz);

	vec3 bg_view;
	view_z_at(SCREEN_UV, INV_PROJECTION_MATRIX, bg_view);
	vec3 bg_world = (INV_VIEW_MATRIX * vec4(bg_view, 1.0)).xyz;
	float depth_v = max(wpos.y - bg_world.y, 0.0);
	float thick = min(distance(bg_view, VERTEX), depth_v * 5.0 + 0.5);

	vec2 ruv = SCREEN_UV + n * refraction * clamp(depth_v * 1.5, 0.0, 1.0) / (1.0 + dist * 0.05);
	vec3 tmp;
	if (view_z_at(ruv, INV_PROJECTION_MATRIX, tmp) > VERTEX.z) {
		ruv = SCREEN_UV;
	}
	vec3 refr = textureLod(screen_tex, ruv, 0.0).rgb;
	vec3 trans = exp(-absorb * thick);

	// Foam: along the banks and streaks in the faster water.
	float bank = smoothstep(0.02, 0.1, depth_v) * (1.0 - smoothstep(0.1, 0.3, depth_v));
	float fn = texture(noise_tex, vec2(uv.x * 0.6, uv.y * 0.18 - TIME * speed * 0.18)).g;
	float streak = texture(noise_tex, vec2(uv.x * 0.35 + 0.2, uv.y * 0.06 - TIME * speed * 0.06)).r;
	float streak2 = texture(noise_tex, vec2(uv.x * 0.8 + 0.6, uv.y * 0.11 - TIME * speed * 0.11)).b;
	float foam = bank * smoothstep(0.3, 0.6, fn) * 0.45;
	float rapids = smoothstep(0.3, 0.85, steep);
	foam = max(foam, smoothstep(0.6, 0.85, streak * 0.7 + streak2 * 0.5) * rapids * 0.7);
	foam *= 1.0 - smoothstep(50.0, 120.0, dist);

	float ndv = clamp(dot(Nv, -normalize(VERTEX)), 0.0, 1.0);
	float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
	float vis = 1.0 - fres;
	vec3 wc = mix(water_col, water_col * vec3(0.55, 0.65, 0.95), night_factor * 0.5);
	ALBEDO = wc * (1.0 - trans) * vis * (1.0 - foam) + foam_col * foam;
	EMISSION = refr * trans * vis * (1.0 - foam);
	SPECULAR = 0.5 * (1.0 - foam);
	ROUGHNESS = mix(0.05, 0.55, foam);
	NORMAL = Nv;
	// Soft waterline: fade out where the water gets paper thin at the banks.
	// The waterline is soft: shallow water near the banks turns clear, so the
	// bed shows through instead of a hard edge along the terrain triangles.
	float shallow = smoothstep(0.0, 0.42, depth_v);
	ALPHA = v_col.a * shallow * smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x);
}
