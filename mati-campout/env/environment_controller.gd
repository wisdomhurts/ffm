class_name EnvironmentController
extends Node3D
## Sky, sun & moon, fog, post-processing, weather, fireflies and quality.
##
## Every frame it reads GameState.day_cycle (hour, darkness), samples the
## time-of-day look table (SkyKeys), mixes in the weather and the campfire's
## state, and drives: the procedural sky shader, the sun and moon lights (only
## one casts shadows at a time), ambient light, depth + volumetric fog, a
## ground-mist fog volume, glow/exposure/grading, the shared shader globals
## (night_factor, time_of_day, wind_strength, wind_direction, wetness) and
## Lights.daylight.
##
## Public API (also see docs/ARCHITECTURE.md):
##   raining: bool, weather: String           read by fire/survival/HUD
##   set_weather(kind, instant)                "clear","cloudy","rain","storm","fog","auto"
##   wind_vector() -> Vector2                  direction * strength
##   sun_direction() / moon_direction() -> Vector3   unit vectors towards them
##   weather_amounts() -> Dictionary           {cloud, rain, fog, wind, wetness, storm}
##   apply_quality(q := "")                    re-apply a quality preset

const SKY_SHADER := preload("res://env/sky.gdshader")
const MOON_LIGHT_COLOR := Color("7a95d8")
const SUN_MAX_ELEVATION := 62.0
const MOON_MAX_ELEVATION := 44.0
## Fog/ambient tints used when the fire is out at night (colder, bluer).
const COLD_FOG_ALBEDO := Color("34436e")
const COLD_FOG_EMISSION := Color("02040c")

var world_env: WorldEnvironment
var env: Environment
var sky: Sky
var sky_mat: ShaderMaterial
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var mist: FogVolume
var mist_mat: FogMaterial
## Warm haze dome over the camp that catches the firelight at night. Its size
## follows the fire's light radius, so the glowing "safe circle" visibly
## shrinks as the fire weakens and vanishes when it goes out.
var camp_haze: FogVolume
var camp_haze_mat: FogMaterial
var weather_sys: Weather
var fireflies: Fireflies
## True while it rains (FireModel burns faster, survival gets colder).
var raining := false
## Current weather kind: "clear", "cloudy", "rain", "storm" or "fog".
var weather := "clear"
var quality := "high"
var profile: Dictionary = {}
## The final look values of the last frame (handy for tests and debugging).
var look: Dictionary = {}

var _sun_dir := Vector3(0.0, 0.7, 0.7)
var _moon_dir := Vector3(0.0, -0.5, 0.86)
var _daylight := 1.0
var _night := 0.0
var _danger := 0.0
var _wind := Vector2(0.8, 0.6) * 0.35
var _wind_t := 0.0
var _wind_noise := FastNoiseLite.new()
var _base_wind_angle := 0.6435
var _cloud_offset := Vector2.ZERO
var _grade := Gradient.new()
var _grade_tex := GradientTexture1D.new()
var _grade_key := Vector2(-1.0, -1.0)
var _brightness := 1.0
var _ready_done := false
## Phone preset: the sky material (and so its radiance map) is refreshed a
## few times per second instead of every frame.
var _sky_interval := 0.0
var _sky_t := 0.0


func setup(_game: Game) -> void:
	GameState.environment = self
	_wind_noise.seed = GameState.seed + 909
	_wind_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_wind_noise.frequency = 0.05
	var wrng := RandomNumberGenerator.new()
	wrng.seed = hash([GameState.seed, 404])
	_base_wind_angle = wrng.randf_range(0.2, 1.2)
	_cloud_offset = Vector2(wrng.randf() * 50.0, wrng.randf() * 50.0)
	_build_environment()
	_build_lights()
	_build_mist()
	weather_sys = Weather.new()
	weather_sys.name = "Weather"
	add_child(weather_sys)
	fireflies = Fireflies.new()
	fireflies.name = "Fireflies"
	add_child(fireflies)
	apply_quality()
	weather_sys.setup(GameState.seed, int(profile.get("rain_amount", 4000)))
	fireflies.setup(GameState.seed, int(profile.get("firefly_amount", 64)))
	_brightness = float(Settings.get_value("brightness"))
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)
	_ready_done = true
	_update(0.0, true)


func _exit_tree() -> void:
	if GameState.environment == self:
		GameState.environment = null


# --- Construction -------------------------------------------------------------------

func _build_environment() -> void:
	world_env = WorldEnvironment.new()
	world_env.name = "WorldEnvironment"
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	sky = Sky.new()
	sky.process_mode = Sky.PROCESS_MODE_REALTIME
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = SKY_SHADER
	sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	# Tonemapping: AgX keeps fire and sunsets rich without clipping to white.
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_agx_contrast = 1.3
	# Glow only on real HDR emitters (fire, eyes, lanterns, fireflies, sun).
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	env.glow_hdr_threshold = 1.2
	env.glow_hdr_scale = 2.0
	env.glow_hdr_luminance_cap = 10.0
	# Depth/height fog for distance; volumetric fog for air the fire can light.
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_sky_affect = 0.12
	env.fog_aerial_perspective = 0.45
	env.fog_height = WorldGen.WATER_LEVEL + 1.0
	env.volumetric_fog_enabled = not Platform.is_compat_renderer()
	env.volumetric_fog_ambient_inject = 0.9
	env.volumetric_fog_gi_inject = 0.0
	env.volumetric_fog_sky_affect = 0.04
	env.volumetric_fog_detail_spread = 2.0
	env.volumetric_fog_temporal_reprojection_enabled = true
	env.volumetric_fog_temporal_reprojection_amount = 0.85
	# Contact shadows and bounce.
	env.ssao_radius = 1.3
	env.ssao_intensity = 1.6
	env.ssao_power = 1.4
	env.ssao_detail = 0.6
	env.ssao_horizon = 0.06
	env.ssao_light_affect = 0.15
	env.ssil_radius = 4.0
	env.ssil_intensity = 0.9
	env.ssr_max_steps = 48
	env.ssr_fade_in = 0.15
	env.ssr_fade_out = 2.5
	env.ssr_depth_tolerance = 0.4
	# Grading: brightness from Settings, contrast/saturation and a split-tone
	# curve (warm highlights, cool shadows) per time of day.
	env.adjustment_enabled = true
	_grade_tex.width = 256
	_grade_tex.gradient = _grade
	env.adjustment_color_correction = _grade_tex
	world_env.environment = env
	add_child(world_env)


func _build_lights() -> void:
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.1
	sun.shadow_blur = 1.0
	sun.directional_shadow_split_1 = 0.06
	sun.directional_shadow_split_2 = 0.17
	sun.directional_shadow_split_3 = 0.42
	sun.directional_shadow_fade_start = 0.82
	sun.directional_shadow_pancake_size = 30.0
	sun.light_volumetric_fog_energy = 1.0
	sun.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.name = "Moon"
	moon.light_color = MOON_LIGHT_COLOR
	moon.shadow_enabled = false
	moon.shadow_bias = 0.05
	moon.shadow_normal_bias = 1.4
	moon.shadow_blur = 2.6
	moon.shadow_opacity = 0.85
	moon.directional_shadow_split_1 = 0.06
	moon.directional_shadow_split_2 = 0.17
	moon.directional_shadow_split_3 = 0.42
	moon.directional_shadow_fade_start = 0.75
	moon.directional_shadow_pancake_size = 30.0
	moon.light_specular = 0.35
	moon.light_volumetric_fog_energy = 1.6
	moon.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	moon.visible = false
	add_child(moon)


## Low-lying mist: a fog volume around the camera whose density falls off
## with height, so hollows and the lake shore fill with mist at dawn.
## Fog volumes need Forward+ (the Compatibility renderer cannot even compile a
## fog material), so browsers skip them and rely on the denser depth fog.
func _build_mist() -> void:
	if Platform.is_compat_renderer():
		return
	mist = FogVolume.new()
	mist.name = "GroundMist"
	mist.shape = RenderingServer.FOG_VOLUME_SHAPE_BOX
	mist.size = Vector3(150.0, 28.0, 150.0)
	mist_mat = FogMaterial.new()
	mist_mat.density = 0.0
	mist_mat.albedo = Color(0.9, 0.92, 1.0)
	mist_mat.height_falloff = 0.35
	mist_mat.edge_fade = 0.35
	mist.material = mist_mat
	add_child(mist)
	camp_haze = FogVolume.new()
	camp_haze.name = "CampHaze"
	camp_haze.shape = RenderingServer.FOG_VOLUME_SHAPE_ELLIPSOID
	camp_haze.size = Vector3(30.0, 9.0, 30.0)
	camp_haze_mat = FogMaterial.new()
	camp_haze_mat.density = 0.0
	camp_haze_mat.albedo = Color(1.0, 0.9, 0.78)
	camp_haze_mat.height_falloff = 0.25
	camp_haze_mat.edge_fade = 0.7
	camp_haze.material = camp_haze_mat
	add_child(camp_haze)


# --- Settings / quality ---------------------------------------------------------------

func apply_quality(q: String = "") -> void:
	quality = q if q != "" else Settings.quality()
	profile = QualityPresets.apply(quality, env, get_viewport(), sun, moon)
	if weather_sys:
		weather_sys.set_rain_amount(int(profile.get("rain_amount", 4000)))
	if fireflies:
		fireflies.set_amount(int(profile.get("firefly_amount", 64)))
	if mist:
		mist.visible = bool(profile.get("volumetric_fog", true))
	if camp_haze:
		camp_haze.visible = bool(profile.get("volumetric_fog", true))
	if sky:
		var rs := int(profile.get("sky_radiance", 256))
		if rs < 256:
			sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
			sky.radiance_size = Sky.RADIANCE_SIZE_32 if rs <= 32 else (Sky.RADIANCE_SIZE_64 if rs <= 64 else Sky.RADIANCE_SIZE_128)
		else:
			sky.process_mode = Sky.PROCESS_MODE_REALTIME
			sky.radiance_size = Sky.RADIANCE_SIZE_256
	var hz := float(profile.get("sky_update_hz", 0.0))
	_sky_interval = 1.0 / hz if hz > 0.0 else 0.0
	_sky_t = 0.0


func _on_setting_changed(key: String) -> void:
	match key:
		"quality":
			apply_quality()
			_update(0.0, true)
		"brightness":
			_brightness = float(Settings.get_value("brightness"))


# --- Weather API ----------------------------------------------------------------------

## Force a weather kind ("clear", "cloudy", "rain", "storm", "fog"), or "auto"
## to follow the seeded schedule again. instant=true skips the transition.
func set_weather(kind: String, instant: bool = false) -> void:
	if weather_sys == null:
		return
	weather_sys.set_weather(kind, instant)
	raining = weather_sys.raining
	weather = weather_sys.kind
	if instant and _ready_done:
		_update(0.0, true)


func wind_vector() -> Vector2:
	return _wind


func sun_direction() -> Vector3:
	return _sun_dir


func moon_direction() -> Vector3:
	return _moon_dir


func weather_amounts() -> Dictionary:
	if weather_sys == null:
		return {"cloud": 0.0, "rain": 0.0, "fog": 0.0, "wind": 0.3, "wetness": 0.0, "storm": 0.0}
	return {"cloud": weather_sys.cloud, "rain": weather_sys.rain, "fog": weather_sys.fog,
		"wind": weather_sys.wind, "wetness": weather_sys.wetness, "storm": weather_sys.storm}


# --- Sun & moon paths ---------------------------------------------------------------------

## Unit vector towards the sun: rises in the east (+X) at 06:00, arcs over the
## south (+Z), sets in the west (-X, over the lake) at 19:00.
static func sun_dir_at(hour: float) -> Vector3:
	var h := fposmod(hour, 24.0)
	var theta: float
	if h >= 6.0 and h <= 19.0:
		theta = PI * (h - 6.0) / 13.0
	else:
		theta = PI + PI * fposmod(h - 19.0, 24.0) / 11.0
	var e := deg_to_rad(SUN_MAX_ELEVATION)
	return Vector3(cos(theta), sin(theta) * sin(e), sin(theta) * cos(e)).normalized()


## Unit vector towards the moon: rises in the east at ~18:50, lowest arc over
## the south, sets in the west at ~06:50 (below the horizon by day).
static func moon_dir_at(hour: float) -> Vector3:
	var theta := PI * fposmod(hour - 18.8, 24.0) / 12.0
	var e := deg_to_rad(MOON_MAX_ELEVATION)
	return Vector3(cos(theta), sin(theta) * sin(e), sin(theta) * cos(e) - 0.12).normalized()


static func _orient(light: DirectionalLight3D, towards: Vector3) -> void:
	var up := Vector3.UP if absf(towards.y) < 0.98 else Vector3.FORWARD
	light.global_transform = Transform3D(Basis.looking_at(-towards, up), Vector3.ZERO)


# --- Per frame ------------------------------------------------------------------------------

func _process(delta: float) -> void:
	if not _ready_done:
		return
	_update(delta, false)


func _update(delta: float, instant: bool) -> void:
	var dc := GameState.day_cycle
	if dc == null:
		return
	var hour := dc.hour()
	var dark := dc.darkness()
	var game_dt := delta * clampf(GameState.time_scale, 0.0, 50.0)
	var cam: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null

	# Smoothed day/night (time skips snap).
	if instant or absf(dark - _night) > 0.3:
		_night = dark
	else:
		_night = move_toward(_night, dark, delta * 0.5)
	_daylight = 1.0 - _night
	Lights.daylight = _daylight

	# Weather.
	weather_sys.wind_dir = _wind.normalized() if _wind.length() > 0.001 else Vector2(0.8, 0.6)
	weather_sys.tick(delta, 0.0 if instant else game_dt, cam)
	raining = weather_sys.raining
	weather = weather_sys.kind
	var overcast := weather_sys.overcast()
	var wfog := weather_sys.fog
	var flash := weather_sys.flash

	# Fire-aware mood: when the fire dies at night the world gets colder.
	var fire := GameState.fire
	var target_danger := 0.0
	if fire != null:
		if not fire.is_lit():
			target_danger = dark
		else:
			target_danger = dark * (1.0 - fire.strength()) * 0.3
	_danger = target_danger if instant else move_toward(_danger, target_danger, delta * 0.45)

	var k := SkyKeys.sample(hour)
	_sun_dir = sun_dir_at(hour)
	_moon_dir = moon_dir_at(hour)
	_update_wind(delta, game_dt)

	# --- Lights ---------------------------------------------------------------
	var sun_up := smoothstep(-0.035, 0.1, _sun_dir.y)
	var moon_up := smoothstep(-0.02, 0.14, _moon_dir.y)
	var sun_e := float(k["sun_e"]) * sun_up * (1.0 - overcast * 0.72) * (1.0 - wfog * 0.3)
	var moon_e := float(k["moon_e"]) * moon_up * (1.0 - overcast * 0.65) * (1.0 - wfog * 0.25)
	moon_e += flash * 1.3
	var grey_day := Color(0.82, 0.85, 0.9)
	sun.light_color = (k["sun_col"] as Color).lerp(grey_day, overcast * 0.6)
	sun.light_energy = sun_e
	moon.light_energy = moon_e
	moon.light_color = MOON_LIGHT_COLOR.lerp(Color(0.85, 0.88, 1.0), clampf(flash * 2.0, 0.0, 1.0))
	sun.visible = sun_e > 0.002
	moon.visible = moon_e > 0.002
	# Exactly one directional light casts shadows: the stronger one. The swap
	# happens around sunset/sunrise when both are dim, so it never pops.
	var sun_casts := sun_e >= moon_e
	sun.shadow_enabled = sun_casts and sun.visible
	moon.shadow_enabled = (not sun_casts) and moon.visible
	sun.shadow_opacity = lerpf(1.0, 0.55, overcast)
	if sun.visible:
		_orient(sun, _sun_dir)
	if moon.visible:
		_orient(moon, _moon_dir)

	# --- Ambient & exposure ----------------------------------------------------
	var amb_col := (k["amb_col"] as Color).lerp(Color(0.72, 0.76, 0.82), overcast * 0.45 * (1.0 - _night))
	amb_col = amb_col.lerp(Color("2c3d86"), _danger * 0.35)
	env.ambient_light_color = amb_col
	env.ambient_light_energy = float(k["amb_e"]) * (1.0 - _danger * 0.3) * (1.0 + flash * 1.8) * (1.0 + overcast * 0.12 * (1.0 - _night))
	env.ambient_light_sky_contribution = float(k["sky_contrib"]) * (1.0 - overcast * 0.25)
	env.tonemap_exposure = float(k["exposure"]) * (1.0 + overcast * 0.1 * (1.0 - _night))
	env.glow_hdr_threshold = lerpf(1.6, 1.0, _night)
	env.adjustment_brightness = clampf(_brightness, 0.5, 1.6)
	env.adjustment_contrast = float(k["contrast"])
	env.adjustment_saturation = float(k["sat"]) * (1.0 - overcast * 0.12) * (1.0 - _danger * 0.12)

	# --- Fog --------------------------------------------------------------------
	var vol_on := env.volumetric_fog_enabled and mist != null
	var fog_col := (k["fog_col"] as Color).lerp(Color(0.55, 0.58, 0.63).lerp(Color("141a33"), _night), overcast * 0.55)
	fog_col = fog_col.lerp(Color("0a0e22"), _danger * 0.65)
	env.fog_light_color = fog_col
	env.fog_light_energy = 1.0 + flash * 1.5
	var fog_mult := 1.0 + wfog * 1.8 + overcast * 0.8 + _danger * 0.9
	env.fog_density = float(k["fog_d"]) * fog_mult * (1.0 if vol_on else 1.5)
	env.fog_height_density = float(k["fog_h"]) * (1.0 + wfog * 1.5)
	env.fog_sun_scatter = float(k["scatter"]) * sun_up * (1.0 - overcast)
	if vol_on:
		env.volumetric_fog_density = float(k["vfog_d"]) * (1.0 + wfog * 1.3 + overcast * 0.6 + _danger * 1.5)
		env.volumetric_fog_albedo = (k["vfog_alb"] as Color).lerp(COLD_FOG_ALBEDO, _danger * 0.75)
		env.volumetric_fog_emission = (k["vfog_emi"] as Color).lerp(COLD_FOG_EMISSION, _danger * 0.8)
		env.volumetric_fog_emission_energy = 1.0
		env.volumetric_fog_anisotropy = float(k["vfog_aniso"])
		mist_mat.density = float(k["mist"]) * (1.0 + wfog * 1.5) + wfog * 0.012 + _danger * 0.012
		mist_mat.albedo = (k["vfog_alb"] as Color).lerp(Color(0.85, 0.88, 0.95), 0.4)
		if cam:
			var cp := cam.global_position
			var gy := cp.y - 2.0
			if GameState.world_gen:
				gy = GameState.world_gen.height_at(cp.x, cp.z)
			mist.global_position = Vector3(snappedf(cp.x, 4.0), gy - 3.0, snappedf(cp.z, 4.0))

		_update_camp_haze(fire)

	# --- Sky ---------------------------------------------------------------------
	_sky_t -= delta
	if instant or _sky_interval <= 0.0 or _sky_t <= 0.0 or flash > 0.001:
		_sky_t = _sky_interval
		_update_sky(k, overcast, flash)

	# --- Grading -------------------------------------------------------------------
	_update_grade(float(k["warm"]) * (1.0 - overcast * 0.5) * (1.0 - _danger * 0.5),
		float(k["cool"]) * (1.0 + _danger * 0.6))

	# --- Shared shader globals --------------------------------------------------------
	RenderingServer.global_shader_parameter_set("night_factor", _night)
	RenderingServer.global_shader_parameter_set("time_of_day", hour)
	RenderingServer.global_shader_parameter_set("wind_strength", _wind.length())
	RenderingServer.global_shader_parameter_set("wind_direction", _wind.normalized() if _wind.length() > 0.001 else Vector2(0.8, 0.6))
	RenderingServer.global_shader_parameter_set("wetness", weather_sys.wetness)

	# --- Rain light & fireflies ----------------------------------------------------------
	weather_sys.set_rain_light(lerpf(1.0, 0.16, _night) + flash * 1.5)
	var ff_vis := smoothstep(0.3, 0.75, _night) * (1.0 - clampf(weather_sys.rain * 5.0, 0.0, 1.0)) * (1.0 - wfog * 0.6)
	var center := Vector3.ZERO
	if GameState.player and is_instance_valid(GameState.player):
		center = GameState.player.global_position
	elif cam:
		center = cam.global_position
	fireflies.tick(delta, ff_vis, center)

	look = k
	look["overcast"] = overcast
	look["danger"] = _danger
	look["sun_energy"] = sun_e
	look["moon_energy"] = moon_e


func _update_camp_haze(fire: FireModel) -> void:
	var cf := GameState.campfire
	if camp_haze == null or cf == null or not is_instance_valid(cf) or fire == null:
		if camp_haze_mat:
			camp_haze_mat.density = 0.0
		return
	var r := fire.light_radius() if fire.is_lit() else 0.0
	camp_haze.global_position = cf.global_position + Vector3(0.0, 1.5, 0.0)
	camp_haze.size = Vector3(maxf(r * 2.0, 2.0), 8.0, maxf(r * 2.0, 2.0))
	camp_haze_mat.density = 0.038 * fire.strength() * smoothstep(0.15, 0.7, _night) if r > 0.5 else 0.0


func _update_wind(delta: float, game_dt: float) -> void:
	_wind_t += delta
	var base := weather_sys.wind if weather_sys else 0.3
	var gust := _wind_noise.get_noise_1d(_wind_t * 9.0) * 0.5 + 0.5
	var flutter := _wind_noise.get_noise_1d(_wind_t * 31.0 + 77.0) * 0.5 + 0.5
	var strength := base * (0.65 + 0.45 * gust + 0.12 * flutter)
	var ang := _base_wind_angle + _wind_noise.get_noise_1d(_wind_t * 0.7 + 300.0) * 0.6
	_wind = Vector2(cos(ang), sin(ang)) * strength
	_cloud_offset += Vector2(cos(ang), sin(ang)) * (0.003 + base * 0.012) * maxf(game_dt, delta * 0.25)


func _update_sky(k: Dictionary, overcast: float, flash: float) -> void:
	var m := sky_mat
	m.set_shader_parameter("zenith_color", k["zenith"])
	m.set_shader_parameter("horizon_color", k["horizon"])
	m.set_shader_parameter("horizon_sun_color", k["horizon_sun"])
	m.set_shader_parameter("ground_color", k["ground"])
	m.set_shader_parameter("sky_energy", float(k["sky_e"]) * (1.0 - _danger * 0.15))
	m.set_shader_parameter("sun_dir", _sun_dir)
	m.set_shader_parameter("sun_color", k["sun_col"])
	m.set_shader_parameter("sun_visible", smoothstep(-0.06, 0.0, _sun_dir.y))
	m.set_shader_parameter("sun_halo", lerpf(0.35, 0.9, 1.0 - smoothstep(0.0, 0.5, _sun_dir.y)))
	m.set_shader_parameter("moon_dir", _moon_dir)
	m.set_shader_parameter("moon_visible", smoothstep(-0.04, 0.06, _moon_dir.y) * clampf(_night * 1.4, 0.0, 1.0))
	m.set_shader_parameter("stars", float(k["stars"]) * (1.0 - overcast))
	m.set_shader_parameter("cloud_cover", weather_sys.cloud)
	m.set_shader_parameter("cloud_offset", _cloud_offset)
	m.set_shader_parameter("cloud_light_dir", _sun_dir if _sun_dir.y > -0.12 else _moon_dir)
	m.set_shader_parameter("cloud_lit", k["cloud_lit"])
	m.set_shader_parameter("cloud_dark", k["cloud_dark"])
	m.set_shader_parameter("overcast", overcast)
	m.set_shader_parameter("overcast_color", Color(0.58, 0.61, 0.66).lerp(Color("161c36"), _night))
	m.set_shader_parameter("flash", flash)


## Split-tone curve on the colour-correction LUT (per-channel 1D curves).
func _update_grade(warm: float, cool: float) -> void:
	var key := Vector2(warm, cool)
	if key.distance_to(_grade_key) < 0.002:
		return
	_grade_key = key
	var offsets := PackedFloat32Array()
	var colors := PackedColorArray()
	var n := 12
	for i in n:
		var x := float(i) / float(n - 1)
		var lo := 6.75 * x * (1.0 - x) * (1.0 - x)   # peaks in the shadows
		var hi := 6.75 * x * x * (1.0 - x)           # peaks in the highlights
		var r := x + warm * hi - cool * lo * 0.55
		var g := x + warm * hi * 0.35 - cool * lo * 0.1
		var b := x - warm * hi * 0.7 + cool * lo
		offsets.append(x)
		colors.append(Color(clampf(r, 0.0, 1.0), clampf(g, 0.0, 1.0), clampf(b, 0.0, 1.0)))
	_grade.offsets = offsets
	_grade.colors = colors
