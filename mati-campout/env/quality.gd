class_name QualityPresets
extends RefCounted
## Graphics quality presets ("phone" / "low" / "medium" / "high",
## Settings.quality()). "phone" is the light preset for phones and tablets in
## a browser (Compatibility renderer): small shadow atlas with a short
## distance, no fire shadows, grass mostly off, short tree draw distance, few
## particles, a low-resolution sky that updates a few times per second and
## `"water": "simple"` for the water system.
##
## Under the Compatibility renderer (browsers) the Forward+-only effects
## (volumetric fog, SSAO, SSIL, SSR, SDFGI, FXAA/SMAA, TAA) are always forced
## off whatever the preset says, so nothing warns or breaks there; depth fog,
## glow, tonemapping and grading still work.
##
## `apply()` pushes a preset into the renderer (shadow atlases and filters,
## volumetric fog, SSAO/SSIL/SSR, anti-aliasing, mesh LOD) and onto the sun
## and moon. Other systems read their own knobs with
## `QualityPresets.value("grass_density", 1.0)` (uses the current setting) so
## every system scales from one table. See docs/ARCHITECTURE.md
## "Lighting, sky, weather & quality presets" for the table.

const PROFILES := {
	"phone": {
		"dir_shadow_size": 1024, "soft_shadows": 0, "positional_atlas": 1024,
		"sun_splits": 2, "sun_shadow_distance": 32.0, "blend_splits": false,
		"fire_shadows": false, "light_shadow_distance": 10.0,
		"volumetric_fog": false, "vfog_size": 32, "vfog_depth": 32, "vfog_filter": false, "vfog_length": 32.0,
		"ssao": false, "ssao_quality": 0, "ssao_half": true,
		"ssil": false, "ssil_quality": 0, "ssil_half": true,
		"ssr": false, "sdfgi": false,
		"msaa": 0, "screen_aa": 0, "taa": false, "lod_threshold": 6.0,
		"glow_levels": [0.0, 0.0, 1.0, 0.7, 0.0, 0.0, 0.0],
		"grass_density": 0.12, "tree_distance": 110.0, "particles": 0.3,
		"rain_amount": 500, "firefly_amount": 14,
		"sky_radiance": 32, "sky_update_hz": 4.0, "water": "simple", "cover_radius": 46.0,
	},
	"low": {
		"dir_shadow_size": 2048, "soft_shadows": 1, "positional_atlas": 2048,
		"sun_splits": 2, "sun_shadow_distance": 60.0, "blend_splits": false,
		"fire_shadows": false, "light_shadow_distance": 18.0,
		"volumetric_fog": false, "vfog_size": 48, "vfog_depth": 48, "vfog_filter": false, "vfog_length": 48.0,
		"ssao": false, "ssao_quality": 1, "ssao_half": true,
		"ssil": false, "ssil_quality": 0, "ssil_half": true,
		"ssr": false, "sdfgi": false,
		"msaa": 0, "screen_aa": 1, "taa": false, "lod_threshold": 4.0,
		"glow_levels": [0.0, 0.0, 1.0, 0.8, 0.4, 0.0, 0.0],
		"grass_density": 0.35, "tree_distance": 140.0, "particles": 0.5,
		"rain_amount": 1400, "firefly_amount": 32,
		"sky_radiance": 256, "sky_update_hz": 0.0, "water": "normal", "cover_radius": 100.0,
	},
	"medium": {
		"dir_shadow_size": 4096, "soft_shadows": 2, "positional_atlas": 2048,
		"sun_splits": 4, "sun_shadow_distance": 85.0, "blend_splits": false,
		"fire_shadows": true, "light_shadow_distance": 26.0,
		"volumetric_fog": true, "vfog_size": 64, "vfog_depth": 64, "vfog_filter": false, "vfog_length": 64.0,
		"ssao": true, "ssao_quality": 1, "ssao_half": true,
		"ssil": false, "ssil_quality": 0, "ssil_half": true,
		"ssr": false, "sdfgi": false,
		"msaa": 0, "screen_aa": 2, "taa": false, "lod_threshold": 2.0,
		"glow_levels": [0.0, 0.3, 1.0, 0.8, 0.5, 0.2, 0.0],
		"grass_density": 0.65, "tree_distance": 200.0, "particles": 0.75,
		"rain_amount": 2600, "firefly_amount": 56,
		"sky_radiance": 256, "sky_update_hz": 0.0, "water": "normal", "cover_radius": 100.0,
	},
	"high": {
		"dir_shadow_size": 4096, "soft_shadows": 3, "positional_atlas": 4096,
		"sun_splits": 4, "sun_shadow_distance": 110.0, "blend_splits": true,
		"fire_shadows": true, "light_shadow_distance": 36.0,
		"volumetric_fog": true, "vfog_size": 96, "vfog_depth": 96, "vfog_filter": true, "vfog_length": 80.0,
		"ssao": true, "ssao_quality": 2, "ssao_half": false,
		"ssil": true, "ssil_quality": 1, "ssil_half": true,
		"ssr": true, "sdfgi": false,
		"msaa": 1, "screen_aa": 2, "taa": false, "lod_threshold": 1.0,
		"glow_levels": [0.0, 0.4, 1.0, 0.85, 0.55, 0.25, 0.0],
		"grass_density": 1.0, "tree_distance": 280.0, "particles": 1.0,
		"rain_amount": 4000, "firefly_amount": 90,
		"sky_radiance": 256, "sky_update_hz": 0.0, "water": "full", "cover_radius": 100.0,
	},
}


## Minimum sun/moon shadow biases under the Compatibility renderer.
const COMPAT_SHADOW_BIAS := 0.1
const COMPAT_NORMAL_BIAS := 2.2


static func profile(q: String) -> Dictionary:
	return PROFILES.get(q, PROFILES["high"])


static var _eff_q := ""
static var _eff: Dictionary = {}


## A knob from the current quality preset (e.g. "grass_density", "tree_distance",
## "fire_shadows", "particles", "light_shadow_distance", "water"), already
## adjusted for the running renderer (see effective_profile()).
static func value(key: String, default: Variant = null) -> Variant:
	var q := Settings.quality()
	if q != _eff_q:
		_eff = effective_profile(q, Platform.is_compat_renderer())
		_eff_q = q
	return _eff.get(key, default)


## The preset adjusted for the renderer actually running: the Compatibility
## renderer (browsers, phones) has no volumetric fog, SSAO, SSIL, SSR, SDFGI,
## screen-space AA or TAA, so those are switched off (no warnings, no cost).
static func effective_profile(q: String, compat: bool) -> Dictionary:
	var p: Dictionary = profile(q).duplicate()
	if compat:
		for k in ["volumetric_fog", "ssao", "ssil", "ssr", "sdfgi", "taa"]:
			p[k] = false
		p["screen_aa"] = 0
	return p


## Apply a preset to the renderer. Any argument may be null (headless tests).
static func apply(q: String, env: Environment, viewport: Viewport, sun: DirectionalLight3D, moon: DirectionalLight3D) -> Dictionary:
	var compat := Platform.is_compat_renderer()
	var p := effective_profile(q, compat)
	RenderingServer.directional_shadow_atlas_set_size(int(p["dir_shadow_size"]), true)
	RenderingServer.directional_soft_shadow_filter_set_quality(int(p["soft_shadows"]))
	RenderingServer.positional_soft_shadow_filter_set_quality(int(p["soft_shadows"]))
	if not compat:
		RenderingServer.environment_set_volumetric_fog_volume_size(int(p["vfog_size"]), int(p["vfog_depth"]))
		RenderingServer.environment_set_volumetric_fog_filter_active(bool(p["vfog_filter"]))
		RenderingServer.environment_set_ssao_quality(int(p["ssao_quality"]), bool(p["ssao_half"]), 0.5, 2, 50.0, 300.0)
		RenderingServer.environment_set_ssil_quality(int(p["ssil_quality"]), bool(p["ssil_half"]), 0.5, 2, 50.0, 300.0)
	if env:
		env.volumetric_fog_enabled = bool(p["volumetric_fog"])
		env.volumetric_fog_length = float(p["vfog_length"])
		env.ssao_enabled = bool(p["ssao"])
		env.ssil_enabled = bool(p["ssil"])
		env.ssr_enabled = bool(p["ssr"])
		# SDFGI stays off: see docs/ARCHITECTURE.md (light leaks under the
		# canopy and cascade shimmer at this 640 m scale; SSIL covers bounce).
		env.sdfgi_enabled = bool(p["sdfgi"])
		var levels: Array = p["glow_levels"]
		for i in levels.size():
			env.set_glow_level(i, float(levels[i]))
	if viewport:
		viewport.positional_shadow_atlas_size = int(p["positional_atlas"])
		viewport.msaa_3d = int(p["msaa"]) as Viewport.MSAA
		viewport.screen_space_aa = int(p["screen_aa"]) as Viewport.ScreenSpaceAA
		viewport.use_taa = bool(p["taa"])
		viewport.use_debanding = true
		viewport.mesh_lod_threshold = float(p["lod_threshold"])
	for light in [sun, moon]:
		var l := light as DirectionalLight3D
		if l == null:
			continue
		l.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if int(p["sun_splits"]) >= 4 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
		l.directional_shadow_max_distance = float(p["sun_shadow_distance"])
		l.directional_shadow_blend_splits = bool(p["blend_splits"])
		if compat:
			# WebGL shadow maps are less precise: without more bias a low sun
			# paints wide "acne" stripes across the ground.
			l.shadow_bias = maxf(l.shadow_bias, COMPAT_SHADOW_BIAS)
			l.shadow_normal_bias = maxf(l.shadow_normal_bias, COMPAT_NORMAL_BIAS)
	return p


## Particle count for one-shot bursts (chips, dust, sparks). Scaled by the
## preset's "particles" knob on the phone preset only (desktop counts were
## tuned by eye per preset and stay as they are).
static func particle_count(n: int) -> int:
	if Settings.quality() != "phone":
		return n
	return maxi(int(round(float(n) * float(value("particles", 1.0)))), 1)
