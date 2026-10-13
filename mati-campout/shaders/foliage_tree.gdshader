// Trees: one shader for bark AND needles/leaves so each tree variant is a
// single surface (one draw call per MultiMesh chunk).
//
// Vertex attributes (built by TreeMeshes):
//   COLOR.rgb  baked ambient occlusion / tint
//   UV         bark: (around, height m) | foliage: (around * spikes, 0 trunk..1 rim)
//   CUSTOM0.r  sway weight (0 at the base .. 1 at the tips)
//   CUSTOM0.g  material: 0 bark, 1 needles, 2 broad leaves
//   CUSTOM0.b  bark: moss amount | foliage: tip / new-growth factor
//   CUSTOM0.a  bark: amber sap glow (Elder Trees)
// INSTANCE_CUSTOM (MultiMesh custom data):
//   x hue shift (-1 blue-green .. 1 yellow-green), y brightness (0.5 = 1.0x),
//   z wind phase 0..1, w dryness (0 lush .. 1 dead/dry)
shader_type spatial;
render_mode depth_draw_opaque, cull_back;

#include "res://shaders/foliage_noise.gdshaderinc"

global uniform float wind_strength;
global uniform vec2 wind_direction;
global uniform float wetness;
global uniform float night_factor;

uniform float sway_amount = 0.32;
uniform float flutter_amount = 0.06;
uniform vec3 needle_dark : source_color = vec3(0.075, 0.15, 0.1);
uniform vec3 needle_mid : source_color = vec3(0.17, 0.31, 0.17);
uniform vec3 needle_tip : source_color = vec3(0.4, 0.52, 0.24);
uniform vec3 leaf_dark : source_color = vec3(0.1, 0.19, 0.08);
uniform vec3 leaf_light : source_color = vec3(0.34, 0.46, 0.17);
uniform vec3 bark_dark : source_color = vec3(0.13, 0.085, 0.06);
uniform vec3 bark_light : source_color = vec3(0.4, 0.28, 0.19);
uniform vec3 moss_color : source_color = vec3(0.26, 0.36, 0.12);
uniform vec3 sap_color : source_color = vec3(1.0, 0.62, 0.18);
uniform float translucency = 0.55;
uniform float near_fade = 2.2;

// Per-instance override for single MeshInstance3D copies (shaking/falling
// trees) that have no MultiMesh custom data.
instance uniform float use_custom_override = 0.0;
instance uniform vec4 custom_override = vec4(0.0, 0.5, 0.0, 0.0);

varying vec4 v_custom;
varying vec4 v_inst;
varying vec3 v_local;
varying vec3 v_world_normal;

void vertex() {
	vec4 ic = mix(INSTANCE_CUSTOM, custom_override, use_custom_override);
	v_inst = ic;
	v_custom = CUSTOM0;
	v_local = VERTEX;
	vec3 origin = MODEL_MATRIX[3].xyz;
	float phase = ic.z * 6.2831 + dot(origin.xz, vec2(0.071, 0.053));
	float t = TIME;
	float gust = 0.65 + 0.35 * sin(t * 0.31 + origin.x * 0.017 + origin.z * 0.011);
	float sway = sin(t * 0.85 + phase) * 0.55 + sin(t * 1.63 + phase * 1.7) * 0.25 + 0.45;
	float w = CUSTOM0.r;
	vec3 wl = vg_wind_local(MODEL_MATRIX, wind_direction);
	float amp = wind_strength * gust * sway_amount * w * w;
	VERTEX += wl * amp * sway;
	// Small vertical flutter on needle/leaf tips.
	float fl = step(0.5, CUSTOM0.g) * CUSTOM0.b;
	VERTEX.y += sin(t * 3.4 + phase * 3.0 + VERTEX.x * 1.7 + VERTEX.z * 1.3) * flutter_amount * fl * wind_strength * w;
	v_world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

vec3 hue_tint(vec3 c, float shift) {
	// shift > 0: warmer yellow-green, < 0: cooler blue-green.
	vec3 warm = c * vec3(1.12, 1.05, 0.78);
	vec3 cool = c * vec3(0.82, 0.98, 1.12);
	return shift >= 0.0 ? mix(c, warm, shift) : mix(c, cool, -shift);
}

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

void fragment() {
	float mat_id = v_custom.g;
	// Dither away foliage that is right in front of the camera so a camera
	// under the branches never shows a screen full of needles.
	float cam_d = length(VERTEX);
	float keep = smoothstep(near_fade * (mat_id < 0.5 ? 0.15 : 0.4), near_fade * (mat_id < 0.5 ? 0.3 : 1.0), cam_d);
	if (keep < 0.999) {
		ivec2 q = ivec2(mod(FRAGCOORD.xy, 4.0));
		if (keep * 16.0 < BAYER[q.x + q.y * 4] + 0.5) {
			discard;
		}
	}
	float ao = COLOR.r;
	float bright = mix(0.75, 1.25, v_inst.y);
	float dry = v_inst.w;
	vec3 albedo;
	float rough;
	float spec = 0.35;
	vec3 backlight = vec3(0.0);
	vec3 emission = vec3(0.0);
	float h = 0.0;
	float bump_strength = 0.0;
	if (mat_id < 0.5) {
		// --- Bark: vertical fibrous plates with dark furrows ---
		vec2 buv = vec2(UV.x * 7.0, UV.y * 0.9);
		float n = vg_fbm2(buv * vec2(1.0, 0.35) + vec2(0.0, v_inst.z * 13.0));
		float furrow = abs(sin((UV.x * 7.0 + n * 1.6) * 3.14159));
		furrow = smoothstep(0.05, 0.6, furrow);
		float plates = vg_noise2(vec2(UV.x * 14.0, UV.y * 2.2)) * 0.5 + 0.5;
		h = furrow * 0.7 + plates * 0.3;
		albedo = mix(bark_dark, bark_light, h * (0.75 + 0.25 * n));
		albedo *= COLOR.rgb * 1.15;
		// Moss: baked amount + up-facing surfaces.
		float moss = clamp(v_custom.b + smoothstep(0.45, 0.9, v_world_normal.y) * v_custom.b, 0.0, 1.0);
		float mn = vg_fbm2(UV * vec2(9.0, 2.5) + 3.1);
		moss = smoothstep(0.35, 0.7, moss * (0.55 + mn));
		albedo = mix(albedo, moss_color * (0.75 + 0.5 * mn), moss);
		rough = mix(0.88, 0.95, moss);
		bump_strength = mix(0.9, 0.25, moss);
		// Amber sap glints (Elder Trees).
		float sap = v_custom.a;
		if (sap > 0.01) {
			float pulse = 0.75 + 0.25 * sin(TIME * 1.3 + v_local.y * 0.7 + v_local.x);
			albedo = mix(albedo, sap_color * 0.65, sap);
			emission = sap_color * sap * pulse * mix(0.7, 2.6, night_factor);
			rough = mix(rough, 0.25, sap);
			spec = mix(spec, 0.7, sap);
			bump_strength *= 1.0 - sap;
		}
	} else {
		// --- Needles / leaves ---
		float tip = v_custom.b;
		if (mat_id < 1.5) {
			float clumps = vg_noise2(vec2(UV.x * 3.0, UV.y * 5.0) + v_inst.z * 7.0);
			float strands = vg_noise2(vec2(UV.x * 38.0, UV.y * 9.0));
			// Combed needle grooves running out along each branch spray,
			// faded out when they get smaller than a pixel (no shimmer).
			float gc = UV.x * 26.0 + vg_noise2(UV * vec2(6.0, 3.0)) * 1.4;
			float fw = fwidth(gc);
			float groove = smoothstep(0.55, 0.95, abs(fract(gc) - 0.5) * 2.0);
			groove *= 1.0 - smoothstep(0.25, 0.8, fw);
			vec3 base = mix(needle_dark, needle_mid, clamp(ao * (0.8 + clumps * 0.4), 0.0, 1.2));
			base = mix(base, needle_tip, tip * tip * 0.6 * (0.6 + clumps * 0.6));
			albedo = base * (0.9 + strands * 0.2) * (1.0 - groove * 0.28);
			h = strands * 0.4 + clumps * 0.3 + (1.0 - groove) * 0.3;
			bump_strength = 0.45;
		} else {
			float cells = vg_noise2(UV * vec2(9.0, 9.0));
			float fine = vg_noise2(UV * vec2(31.0, 27.0));
			albedo = mix(leaf_dark, leaf_light, clamp(ao * (0.75 + cells * 0.5), 0.0, 1.2));
			albedo *= 0.85 + fine * 0.3;
			h = cells * 0.7 + fine * 0.3;
			bump_strength = 0.5;
		}
		albedo = hue_tint(albedo, v_inst.x) * bright;
		albedo = mix(albedo, albedo * vec3(1.25, 1.0, 0.55) + vec3(0.06, 0.03, 0.0), dry);
		rough = 0.82;
		spec = 0.3;
		backlight = albedo * translucency * (0.45 + 0.55 * tip) * ao;
	}
	// Rain darkens and adds sheen.
	albedo *= mix(1.0, 0.68, wetness);
	rough = mix(rough, 0.38, wetness * 0.8);
	ALBEDO = albedo;
	ROUGHNESS = rough;
	SPECULAR = spec;
	AO = clamp(ao * 1.1, 0.0, 1.0);
	AO_LIGHT_AFFECT = 0.35;
	BACKLIGHT = backlight;
	EMISSION = emission;
	if (bump_strength > 0.0) {
		NORMAL = vg_bump(VERTEX, NORMAL, h * 0.04, bump_strength);
	}
}
