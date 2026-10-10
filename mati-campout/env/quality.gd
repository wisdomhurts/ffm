class_name QualityPresets
extends RefCounted
## Graphics quality presets ("low" / "medium" / "high", Settings.quality()).
##
## `apply()` pushes a preset into the renderer (shadow atlases and filters,
## volumetric fog, SSAO/SSIL/SSR, anti-aliasing, mesh LOD) and onto the sun
## and moon. Other systems read their own knobs with
## `QualityPresets.value("grass_density", 1.0)` (uses the current setting) so
## every system scales from one table. See docs/ARCHITECTURE.md
## "Lighting, sky, weather & quality presets" for the table.

const PROFILES := {
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
	},
}


static func profile(q: String) -> Dictionary:
	return PROFILES.get(q, PROFILES["high"])


## A knob from the current quality preset (e.g. "grass_density", "tree_distance",
## "fire_shadows", "particles", "light_shadow_distance").
static func value(key: String, default: Variant = null) -> Variant:
	return profile(Settings.quality()).get(key, default)


## Apply a preset to the renderer. Any argument may be null (headless tests).
static func apply(q: String, env: Environment, viewport: Viewport, sun: DirectionalLight3D, moon: DirectionalLight3D) -> Dictionary:
	var p := profile(q)
	RenderingServer.directional_shadow_atlas_set_size(int(p["dir_shadow_size"]), true)
	RenderingServer.directional_soft_shadow_filter_set_quality(int(p["soft_shadows"]))
	RenderingServer.positional_soft_shadow_filter_set_quality(int(p["soft_shadows"]))
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
	return p
