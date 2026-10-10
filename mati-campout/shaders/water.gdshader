// Moonmirror Lake: depth-tinted water with refraction, soft shoreline foam,
// gentle animated normal waves, fresnel reflections (screen-space march of the
// shore, trees and mountains; the engine's sky reflection where the march
// misses) and sun / moon glints from the lights' specular.
//
// Opaque-looking transparent surface: the refracted scene is written through
// EMISSION and the in-scattered water colour through ALBEDO, both scaled by
// (1 - fresnel), so the engine's reflections and specular sit on top.
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/terrain_common.gdshaderinc"

global uniform float wind_strength;
global uniform vec2 wind_direction;
global uniform float wetness;
global uniform float night_factor;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;

uniform vec3 shallow_col : source_color = vec3(0.22, 0.50, 0.47);
uniform vec3 deep_col : source_color = vec3(0.035, 0.15, 0.19);
uniform vec3 foam_col : source_color = vec3(0.90, 0.94, 0.94);
// Absorption per metre (red goes first, so deep water turns blue-green).
uniform vec3 absorb = vec3(0.42, 0.13, 0.10);
uniform float scatter_depth = 3.2;
uniform float wave_strength = 0.22;
uniform float refraction = 0.035;
uniform float foam_width = 0.7;
uniform float reflect_strength = 1.0;
uniform int ssr_steps = 24;
// Strength of the depth-free "far" reflection fallback (0 = engine sky only).
uniform float far_reflect = 0.9;
uniform float roughness = 0.035;
// Terrain heightmaps (see tc_ground).
uniform sampler2D height_inner : filter_linear, repeat_disable;
uniform sampler2D height_outer : filter_linear, repeat_disable;
uniform vec4 inner_rect = vec4(-320.0, -320.0, 640.0, 640.0);
uniform vec2 inner_res = vec2(321.0, 321.0);
uniform vec4 outer_rect = vec4(-2048.0, -1792.0, 1792.0, 3584.0);
uniform vec2 outer_res = vec2(113.0, 225.0);

float scene_view_z(vec2 uv, mat4 inv_proj) {
	float d = textureLod(depth_tex, uv, 0.0).r;
	vec4 p = inv_proj * vec4(uv * 2.0 - 1.0, d, 1.0);
	return p.z / p.w;
}

void fragment() {
	vec3 wpos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 wp = wpos.xz;
	float dist = length(VERTEX);

	// --- Waves: three scrolling layers of a tiling normal map --------------------------------
	vec2 wdir = normalize(wind_direction + vec2(0.0001));
	float wind = 0.35 + wind_strength * 1.3 + wetness * 0.4;
	vec2 n1 = tc_nmap(texture(normal_tex, wp * 0.038 + wdir * TIME * 0.012 * wind));
	vec2 n2 = tc_nmap(texture(normal_tex, tc_rot(wp, 1.9) * 0.093 - vec2(0.009, 0.014) * TIME * wind));
	vec2 n3 = tc_nmap(texture(normal_tex, tc_rot(wp, 4.1) * 0.0085 + vec2(0.0021, 0.0013) * TIME));
	vec2 rain = vec2(0.0);
	if (wetness > 0.01) {
		rain = tc_nmap(texture(normal_tex, wp * 0.9 + vec2(TIME * 0.7, -TIME * 0.5))) * wetness * 0.6;
	}
	float calm = 1.0 / (1.0 + dist * 0.009);
	vec2 wn = (n1 * 0.55 + n2 * 0.35 * calm + n3 * 0.6 + rain * calm) * wave_strength * (0.6 + wind * 0.5);
	vec3 Nw = normalize(vec3(wn.x, 1.0, wn.y));
	vec3 Nv = normalize((VIEW_MATRIX * vec4(Nw, 0.0)).xyz);

	// --- Water depth: from the terrain heightmap (always available), refined by
	// the depth buffer when there is one (things standing in the water). -------------
	float ground = tc_ground(height_inner, inner_rect, inner_res, height_outer, outer_rect, outer_res, wp);
	float depth_v = max(wpos.y - ground, 0.0);                // vertical water depth
	vec3 vdir = normalize(wpos - CAMERA_POSITION_WORLD);
	float thick = depth_v / max(abs(vdir.y), 0.12);           // path length through water
	float d_raw = textureLod(depth_tex, SCREEN_UV, 0.0).r;
	bool has_depth = d_raw > 0.0;
	if (has_depth) {
		vec4 bp = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d_raw, 1.0);
		vec3 bg_view = bp.xyz / bp.w;
		vec3 bg_world = (INV_VIEW_MATRIX * vec4(bg_view, 1.0)).xyz;
		depth_v = min(depth_v, max(wpos.y - bg_world.y, 0.0));
		thick = min(thick, distance(bg_view, VERTEX));
	}
	thick = min(thick, depth_v * 6.0 + 2.0);

	// Refraction: bend the lookup a little, but never sample things in front.
	vec2 ruv = SCREEN_UV + wn * refraction * clamp(depth_v * 0.6, 0.0, 1.0) / (1.0 + dist * 0.04);
	if (has_depth && scene_view_z(ruv, INV_PROJECTION_MATRIX) > VERTEX.z) {
		ruv = SCREEN_UV;
	}
	vec3 refr = textureLod(screen_tex, ruv, 0.0).rgb;

	// Absorption along the path and in-scattered water colour.
	vec3 trans = exp(-absorb * thick);
	float depth_k = 1.0 - exp(-depth_v / scatter_depth);
	vec3 water = mix(shallow_col, deep_col, depth_k);
	water = mix(water, water * vec3(0.55, 0.65, 0.95), night_factor * 0.5);

	// --- Shoreline foam: soft band where the water gets thin, lapping in and out -------
	float lap = sin(TIME * 1.1 - depth_v * 7.0 + tc_vnoise2(wp * 0.15) * 6.0) * 0.5 + 0.5;
	float foam_n = texture(noise_tex, wp * 0.21 + vec2(TIME * 0.011, -TIME * 0.007)).g;
	float foam_n2 = texture(noise_tex, tc_rot(wp, 0.8) * 0.53 - vec2(TIME * 0.02, 0.0)).a;
	float edge = 1.0 - smoothstep(0.0, foam_width * (0.6 + lap * 0.6), depth_v);
	// Lacy foam: the borders of drifting cells, broken up by fbm.
	float lace = smoothstep(0.42, 0.72, foam_n) * smoothstep(0.35, 0.65, foam_n2 + 0.15);
	float foam = edge * lace * 0.6;
	foam = max(foam, smoothstep(0.06, 0.0, depth_v) * 0.35 * smoothstep(0.3, 0.6, foam_n2 + 0.2));
	foam *= 1.0 - smoothstep(60.0, 180.0, dist);

	// --- Fresnel ---------------------------------------------------------------------------
	float ndv = clamp(dot(Nv, -normalize(VERTEX)), 0.0, 1.0);
	float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
	fres = clamp(fres * reflect_strength, 0.0, 1.0);

	// --- Screen-space reflection march (shore, trees, mountains) -------------------------
	vec3 refl = vec3(0.0);
	float refl_mask = 0.0;
	if (ssr_steps > 0 && has_depth) {
		vec3 Nr = normalize((VIEW_MATRIX * vec4(normalize(vec3(wn.x * 0.35, 1.0, wn.y * 0.35)), 0.0)).xyz);
		vec3 R = reflect(normalize(VERTEX), Nr);
		float t = 0.6;
		float t_prev = 0.0;
		for (int i = 0; i < 48; i++) {
			if (i >= ssr_steps) {
				break;
			}
			t_prev = t;
			t *= 1.38;
			vec3 p = VERTEX + R * t;
			vec4 clip = PROJECTION_MATRIX * vec4(p, 1.0);
			if (clip.w <= 0.0) {
				break;
			}
			vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
			if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
				break;
			}
			float sz = scene_view_z(suv, INV_PROJECTION_MATRIX);
			if (p.z < sz) {
				// Behind the depth buffer: refine between the last two steps.
				float a = t_prev;
				float b = t;
				for (int k = 0; k < 5; k++) {
					float m = (a + b) * 0.5;
					vec3 pm = VERTEX + R * m;
					vec4 cm = PROJECTION_MATRIX * vec4(pm, 1.0);
					vec2 um = cm.xy / cm.w * 0.5 + 0.5;
					if (pm.z < scene_view_z(um, INV_PROJECTION_MATRIX)) {
						b = m;
					} else {
						a = m;
					}
				}
				vec3 ph = VERTEX + R * b;
				vec4 ch = PROJECTION_MATRIX * vec4(ph, 1.0);
				vec2 uh = ch.xy / ch.w * 0.5 + 0.5;
				float gap = abs(ph.z - scene_view_z(uh, INV_PROJECTION_MATRIX));
				if (gap < 0.6 + b * 0.08) {
					refl = textureLod(screen_tex, uh, 0.0).rgb;
					vec2 e = smoothstep(vec2(0.0), vec2(0.07), uh) * smoothstep(vec2(1.0), vec2(0.93), uh);
					refl_mask = e.x * e.y;
				}
				break;
			}
		}
	}

	// Without a depth buffer (or where the march missed), mirror what the
	// camera sees in the reflected direction as if it were far away: exact
	// for the sky and the mountains, close enough for the shore forest.
	if (refl_mask < 0.01 && far_reflect > 0.0) {
		vec3 Rw = reflect(vdir, normalize(vec3(wn.x * 0.5, 1.0, wn.y * 0.5)));
		if (Rw.y > 0.002) {
			vec4 cf = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(CAMERA_POSITION_WORLD + Rw * 3000.0, 1.0));
			if (cf.w > 0.0) {
				vec2 fuv = cf.xy / cf.w * 0.5 + 0.5;
				vec2 e = smoothstep(vec2(0.0), vec2(0.06), fuv) * smoothstep(vec2(1.0), vec2(0.94), fuv);
				if (e.x * e.y > 0.0) {
					refl = textureLod(screen_tex, fuv, 0.0).rgb;
					refl_mask = e.x * e.y * far_reflect;
				}
			}
		}
	}

	float vis = 1.0 - fres;
	ALBEDO = water * (1.0 - trans) * vis * (1.0 - foam) + foam_col * foam;
	EMISSION = refr * trans * vis * (1.0 - foam) + refl * fres * refl_mask * (1.0 - foam);
	SPECULAR = 0.5 * (1.0 - refl_mask * 0.85) * (1.0 - foam);
	ROUGHNESS = mix(roughness + wetness * 0.05, 0.6, foam);
	METALLIC = 0.0;
	NORMAL = Nv;
	// Soft waterline on the beaches.
	ALPHA = smoothstep(0.0, 0.22, depth_v);
}
