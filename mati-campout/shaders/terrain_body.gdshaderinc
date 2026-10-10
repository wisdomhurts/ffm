// Terrain surface: stylised-realistic ground painted from per-vertex masks.
// Included by terrain.gdshader (playable map) and terrain_far.gdshader
// (outer ring beyond the map edge: TERRAIN_FAR is defined).
//
//   COLOR    r path (trail dirt)  g forest (floor / far canopy)  b meadow  a camp ground
//   CUSTOM0  r rock / slope       g shore sand  b wet soil  a cavity (baked AO, 1 = open)
//
// Global uniforms: wetness (rain), night_factor.

#include "res://shaders/terrain_common.gdshaderinc"

global uniform float wetness;
global uniform float night_factor;

// RGBA noise atlas: r fbm, g cellular (F1), b fbm (other seed), a grain.
uniform sampler2D noise_tex : filter_linear_mipmap_anisotropic, repeat_enable;
// Tangent-space detail normal map (tiling).
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float water_level = -1.6;
uniform float detail_distance = 70.0;
uniform float bump_strength = 0.55;
uniform vec2 ridge_a = vec2(40.0, -195.0);
uniform vec2 ridge_b = vec2(175.0, -140.0);

// Palette (sRGB, converted to linear by source_color).
uniform vec3 grass_moss : source_color = vec3(0.31, 0.39, 0.19);
uniform vec3 grass_sage : source_color = vec3(0.46, 0.50, 0.33);
uniform vec3 grass_lush : source_color = vec3(0.30, 0.42, 0.17);
uniform vec3 grass_dry : source_color = vec3(0.56, 0.52, 0.33);
uniform vec3 floor_needles : source_color = vec3(0.25, 0.22, 0.155);
uniform vec3 floor_red : source_color = vec3(0.31, 0.255, 0.175);
uniform vec3 floor_moss : source_color = vec3(0.22, 0.27, 0.14);
uniform vec3 dirt_col : source_color = vec3(0.38, 0.32, 0.24);
uniform vec3 dirt_light : source_color = vec3(0.52, 0.46, 0.36);
uniform vec3 earth_col : source_color = vec3(0.34, 0.30, 0.245);
uniform vec3 earth_dust : source_color = vec3(0.46, 0.43, 0.37);
uniform vec3 rock_a : source_color = vec3(0.53, 0.51, 0.47);
uniform vec3 rock_b : source_color = vec3(0.37, 0.36, 0.35);
uniform vec3 rock_warm : source_color = vec3(0.50, 0.44, 0.37);
uniform vec3 lichen_col : source_color = vec3(0.50, 0.54, 0.38);
uniform vec3 sand_col : source_color = vec3(0.78, 0.69, 0.52);
uniform vec3 sand_wet : source_color = vec3(0.55, 0.48, 0.36);
uniform vec3 pebble_col : source_color = vec3(0.60, 0.58, 0.54);
uniform vec3 mud_col : source_color = vec3(0.25, 0.20, 0.14);
uniform vec3 lakebed_col : source_color = vec3(0.38, 0.36, 0.25);
uniform vec3 canopy_dark : source_color = vec3(0.07, 0.15, 0.09);
uniform vec3 canopy_light : source_color = vec3(0.22, 0.34, 0.16);

#ifdef TERRAIN_HAZE
// Distance haze computed here instead of engine fog (keeps the far rim and
// mountains readable while matching the near fog where they meet).
uniform vec3 haze_color : source_color = vec3(0.62, 0.70, 0.80);
uniform float haze_density = 0.0016;
uniform float haze_max = 0.82;
uniform float haze_energy = 1.0;
#endif

varying vec3 v_world;
varying vec3 v_wnormal;
varying vec4 v_m1;
varying vec4 v_m2;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_wnormal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_m1 = COLOR;
	v_m2 = CUSTOM0;
}

void fragment() {
	vec3 wpos = v_world;
	vec2 wp = wpos.xz;
	vec3 N = normalize(v_wnormal);
	float dist = length(wpos - CAMERA_POSITION_WORLD);
	float near_k = 1.0 - smoothstep(detail_distance * 0.45, detail_distance, dist);
	float mid_k = 1.0 - smoothstep(detail_distance * 1.5, detail_distance * 4.0, dist);

	float m_path = v_m1.r;
	float m_forest = v_m1.g;
	float m_meadow = v_m1.b;
	float m_camp = v_m1.a;
	float m_rock = v_m2.r;
	float m_sand = v_m2.g;
	float m_wet = v_m2.b;
	float cavity = v_m2.a;

	// Noise at several scales (rotated between scales to hide tiling).
	vec4 n_macro = texture(noise_tex, wp * 0.0019 + vec2(0.31, 0.17));
	vec4 n_mid = texture(noise_tex, tc_rot(wp, 0.7) * 0.0123);
	vec4 n_fine = texture(noise_tex, tc_rot(wp, 2.1) * 0.061);
	vec4 n_micro = texture(noise_tex, tc_rot(wp, 4.0) * 0.29);
	float nf = mix(0.5, n_fine.r, mid_k);
	float nm = mix(0.5, n_micro.r, near_k);

	vec3 col;
	float rough = 0.92;
	float spec = 0.32;
	float bump = bump_strength;

#ifdef TERRAIN_FAR
	// Seen from far away: forest canopy, meadows, rocky slopes, beaches.
	float crowns = texture(noise_tex, tc_rot(wp, 1.1) * 0.045).g;
	vec3 grass = mix(grass_moss, grass_sage, smoothstep(0.3, 0.75, n_mid.b));
	float canopy = smoothstep(0.25, 0.6, m_forest + (n_mid.r - 0.5) * 0.5);
	vec3 can = mix(canopy_dark, canopy_light, smoothstep(0.15, 0.85, crowns * 0.7 + n_mid.r * 0.5));
	can *= 0.8 + 0.4 * n_macro.b;
	col = mix(grass, can, canopy);
	float rockw = smoothstep(0.35, 0.65, m_rock + (n_mid.g - 0.5) * 0.4);
	vec3 rk = mix(rock_b, rock_a, n_mid.r) * mix(0.85, 1.1, n_fine.b);
	col = mix(col, rk, rockw);
	col = mix(col, mix(sand_col, sand_wet, smoothstep(water_level + 0.8, water_level, wpos.y)), m_sand * (1.0 - rockw));
	float under = smoothstep(water_level + 0.05, water_level - 1.0, wpos.y);
	col = mix(col, lakebed_col * 0.7, under);
	// Crowns: bumpy normals so the canopy catches light.
	vec2 cn = tc_nmap(texture(normal_tex, tc_rot(wp, 1.1) * 0.03));
	N = normalize(N + vec3(cn.x, 0.0, cn.y) * canopy * 0.9);
	col *= mix(0.55, 1.0, cavity);
	rough = 0.95;
	spec = 0.2;
#else
	// --- Grass: moss/sage patches, macro variation, clumps ------------------------
	float patchy = smoothstep(0.32, 0.72, n_mid.b * 0.75 + n_macro.r * 0.5 - 0.12);
	vec3 grass = mix(grass_moss, grass_sage, patchy);
	grass = mix(grass, grass_lush, m_meadow * smoothstep(0.3, 0.7, n_mid.r + 0.15));
	// Dry golden grass on the ridge and high, sunny spots.
	float ridge_d = tc_seg_dist(wp, ridge_a, ridge_b);
	float dry = smoothstep(85.0, 30.0, ridge_d) * 0.75 + smoothstep(0.62, 0.85, n_macro.b) * 0.35;
	grass = mix(grass, grass_dry, clamp(dry * smoothstep(0.3, 0.7, n_mid.g + 0.2), 0.0, 0.85));
	grass *= mix(0.86, 1.12, nf);
	// Blade flecks and darker gaps between clumps (close up only).
	float gaps = smoothstep(0.62, 0.3, n_micro.a);
	grass *= mix(1.0, mix(0.72, 1.1, n_micro.a), near_k);
	grass = mix(grass, grass * vec3(0.7, 0.62, 0.5), gaps * near_k * 0.35);

	// --- Forest floor: needles, moss patches, cones ---------------------------------
	vec3 ff = mix(floor_needles, floor_red, smoothstep(0.42, 0.78, n_fine.b));
	ff = mix(ff, floor_moss, smoothstep(0.52, 0.8, n_mid.r * 0.6 + n_fine.r * 0.5) * 0.9);
	float needles = n_micro.a;
	ff *= mix(1.0, mix(0.75, 1.2, needles), near_k);
	float twig = smoothstep(0.1, 0.03, texture(noise_tex, tc_rot(wp, 0.4) * 0.6).g) * near_k;
	ff = mix(ff, floor_red * 0.7, twig * 0.6);
	float forest_w = smoothstep(0.18, 0.62, m_forest + (nf - 0.5) * 0.45 + (nm - 0.5) * 0.15);
	col = mix(grass, ff, forest_w);
	spec = mix(0.32, 0.25, forest_w);

	// --- Wet soil near water (lake shores, stream banks) ------------------------------
	float wet_w = smoothstep(0.25, 0.7, m_wet + (nf - 0.5) * 0.35);
	vec3 mud = mix(mud_col, mud_col * vec3(0.9, 1.05, 0.9), n_fine.r);
	col = mix(col, mix(col * 0.62, mud, 0.45), wet_w * 0.8);

	// --- Beach: pebbly sand --------------------------------------------------------
	float sand_w = smoothstep(0.3, 0.62, m_sand + (nf - 0.5) * 0.3);
	float pebble = smoothstep(0.17, 0.08, n_micro.g) * near_k;
	float pebble2 = smoothstep(0.12, 0.05, n_fine.g) * mid_k;
	vec3 sand = mix(sand_col, sand_col * 0.88, n_micro.r * near_k);
	sand = mix(sand, sand_wet, smoothstep(water_level + 0.9, water_level + 0.15, wpos.y));
	sand = mix(sand, pebble_col * mix(0.75, 1.15, n_micro.b), max(pebble * 0.85, pebble2 * 0.6));
	col = mix(col, sand, sand_w);

	// --- Trails: warm worn dirt with grassy edges and pebbles -------------------------
	float trail = smoothstep(0.42, 0.66, m_path + (nf - 0.5) * 0.32 + (nm - 0.5) * 0.14);
	vec3 dirt = mix(dirt_col, dirt_light, smoothstep(0.55, 1.0, m_path) * 0.55 + n_mid.g * 0.25);
	dirt *= mix(0.88, 1.1, n_fine.b);
	dirt = mix(dirt, pebble_col * 0.72, smoothstep(0.12, 0.05, n_micro.g) * near_k * 0.5);
	col = mix(col, dirt, trail);

	// --- Camp: packed earth, dusty near the fire ------------------------------------
	float camp_w = smoothstep(0.34, 0.62, m_camp + (n_mid.r - 0.5) * 0.45 + (nf - 0.5) * 0.3 + (nm - 0.5) * 0.12);
	vec3 earth = mix(earth_col, earth_dust, smoothstep(0.7, 1.0, m_camp) * 0.6 + n_fine.r * 0.2);
	earth *= mix(0.9, 1.08, n_micro.b * near_k + (1.0 - near_k) * 0.5);
	earth = mix(earth, pebble_col * 0.7, smoothstep(0.1, 0.04, n_micro.g) * near_k * 0.45);
	// Trampled grass tufts survive at the edge of the packed earth.
	earth = mix(earth, grass * 0.85, smoothstep(0.55, 0.8, n_micro.a) * (1.0 - smoothstep(0.55, 0.85, m_camp)) * 0.7);
	col = mix(col, earth, camp_w);
	rough = mix(rough, 0.95, max(trail, camp_w));

	// --- Rock: triplanar, strata, lichen on top faces ----------------------------------
	float rock_w = smoothstep(0.38, 0.66, m_rock + (n_mid.g - 0.5) * 0.35 + (nf - 0.5) * 0.25);
	if (rock_w > 0.001) {
		vec4 t1 = tc_triplanar(noise_tex, wpos, N, 0.045);
		vec4 t2 = tc_triplanar(noise_tex, wpos, N, 0.19);
		float strata = sin(wpos.y * 1.3 + t1.r * 9.0 + t2.b * 4.0) * 0.5 + 0.5;
		vec3 rk = mix(rock_b, rock_a, smoothstep(0.2, 0.8, t1.b * 0.85 + strata * 0.18 + t2.r * 0.2));
		rk = mix(rk, rock_warm, smoothstep(0.55, 0.85, t1.r) * 0.45);
		rk *= mix(0.78, 1.12, t2.a);
		// cracks
		rk *= mix(1.0, 0.55, smoothstep(0.07, 0.02, t2.g) * mid_k);
		float lichen = smoothstep(0.55, 0.85, N.y) * smoothstep(0.45, 0.7, t2.r + 0.1);
		rk = mix(rk, lichen_col, lichen * 0.6);
		col = mix(col, rk, rock_w);
		rough = mix(rough, 0.8, rock_w);
		spec = mix(spec, 0.4, rock_w);
		bump = mix(bump, bump_strength * 2.2, rock_w);
	}

	// --- Lake bed under water ----------------------------------------------------
	float under = smoothstep(water_level + 0.05, water_level - 0.7, wpos.y);
	vec3 bed = mix(lakebed_col, sand_wet, smoothstep(water_level - 3.0, water_level - 0.4, wpos.y) * 0.6);
	bed = mix(bed, pebble_col * 0.6, pebble * 0.6);
	bed *= mix(0.8, 1.1, n_fine.r);
	col = mix(col, bed, under);

	// Baked cavity occlusion (ditches, stream beds, hollows).
	col *= mix(0.62, 1.0, cavity);

	// Detail normals: two scales of tiling normal map.
	vec2 d1 = tc_nmap(texture(normal_tex, tc_rot(wp, 0.3) * 0.21));
	vec2 d2 = tc_nmap(texture(normal_tex, tc_rot(wp, 2.6) * 0.83));
	vec2 dn = (d1 * mid_k + d2 * 0.7 * near_k) * bump;
	dn *= 1.0 - under * 0.6;
	N = normalize(N + vec3(dn.x, 0.0, dn.y));
#endif

	// --- Rain: darker, glossier ground, puddle gloss in hollows ----------------------
	float wet_all = clamp(wetness, 0.0, 1.0);
	float porous = wet_all * mix(0.75, 1.0, m_wet);
	col *= mix(1.0, 0.62, porous);
	float puddle = wet_all * smoothstep(0.62, 0.8, (1.0 - cavity) * 0.6 + n_mid.r * 0.6) * (1.0 - m_rock);
	rough = mix(rough, 0.42, porous);
	rough = mix(rough, 0.08, puddle);
	spec = mix(spec, 0.5, porous);

	// Wet shore and stream banks are a little glossy even in sunshine.
	rough = mix(rough, 0.55, m_wet * 0.5);

	// Moonlit dew: a hint of extra sheen at night.
	rough = mix(rough, rough * 0.82, night_factor * 0.5);

#ifdef TERRAIN_HAZE
	float haze = clamp(1.0 - exp(-dist * haze_density), 0.0, haze_max);
	ALBEDO = col * (1.0 - haze);
	EMISSION = haze_color * haze * haze_energy;
#else
	ALBEDO = col;
#endif
	ROUGHNESS = rough;
	SPECULAR = spec;
	NORMAL = normalize((VIEW_MATRIX * vec4(N, 0.0)).xyz);
}
