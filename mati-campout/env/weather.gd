class_name Weather
extends Node3D
## Weather: a seeded daily schedule (mostly clear, some cloudy days, foggy
## mornings, occasional rain and storms), smoothly blended weather amounts,
## rain streaks that follow the active camera, ground wetness, and thunder +
## lightning in storms. Owned and ticked by EnvironmentController.
##
## Kinds: "clear", "cloudy", "rain", "storm", "fog".
## The schedule works in "run hours": day 1 starts at 07:00 = run hour 7 and
## the night after day N runs to its dawn (hours 24..31 of that day).

const KINDS := ["clear", "cloudy", "rain", "storm", "fog"]
const RAIN_SHADER := preload("res://env/rain.gdshader")

## Target amounts per kind: cloud cover, rain, extra fog, wind, storminess.
const PARAMS := {
	"clear": {"cloud": 0.16, "rain": 0.0, "fog": 0.0, "wind": 0.3, "storm": 0.0},
	"cloudy": {"cloud": 0.62, "rain": 0.0, "fog": 0.12, "wind": 0.5, "storm": 0.0},
	"rain": {"cloud": 0.9, "rain": 0.6, "fog": 0.35, "wind": 0.6, "storm": 0.0},
	"storm": {"cloud": 1.0, "rain": 1.0, "fog": 0.45, "wind": 1.0, "storm": 1.0},
	"fog": {"cloud": 0.3, "rain": 0.0, "fog": 1.0, "wind": 0.1, "storm": 0.0},
}

const DEFAULT_CFG := {
	"chances": {"clear": 0.5, "cloudy": 0.26, "rain": 0.17, "storm": 0.07},
	"fog_morning_chance": 0.3,
	"first_rain_day": 2,
	"first_storm_day": 3,
	"rain_hours": [2.0, 4.5],
	"transition_seconds": 14.0,
	"wetness_rise_seconds": 35.0,
	"wetness_dry_seconds": 140.0,
	"lightning_interval": [7.0, 20.0],
}

## Current weather kind (the scheduled or forced one).
var kind := "clear"
## Smoothed amounts (0..1).
var cloud := 0.16
var rain := 0.0
var fog := 0.0
var wind := 0.3
var storm := 0.0
var wetness := 0.0
## Lightning flash brightness (0..1), already softened for reduce_flashing.
var flash := 0.0
## True while it is raining (fire and survival read this).
var raining := false
## Horizontal wind direction (set by the EnvironmentController each frame).
var wind_dir := Vector2(0.8, 0.6)

var run_seed := 0
var cfg: Dictionary = DEFAULT_CFG.duplicate(true)
var rain_particles: GPUParticles3D
var rain_material: ShaderMaterial
var audio_anchor: Node3D

var _override := ""
var _cache: Dictionary = {}
var _rng := RandomNumberGenerator.new()
var _thunder_in := 10.0
var _flash_t := -1.0
var _flash_soft := false
var _rain_loop := false
var _wind_loop := false
var _rain_amount := 4000


func setup(p_seed: int, rain_amount: int = 4000) -> void:
	run_seed = p_seed
	_rng.seed = hash([p_seed, 5151])
	var bal: Variant = DB.b("weather", {})
	if bal is Dictionary:
		for k in (bal as Dictionary):
			cfg[k] = (bal as Dictionary)[k]
	_cache.clear()
	_build_rain()
	set_rain_amount(rain_amount)
	audio_anchor = Node3D.new()
	audio_anchor.name = "RainAudio"
	add_child(audio_anchor)


func _exit_tree() -> void:
	if _rain_loop and audio_anchor:
		Audio.stop_loop("rain", audio_anchor)
	if _wind_loop and audio_anchor:
		Audio.stop_loop("wind", audio_anchor)


# --- Schedule ------------------------------------------------------------------------

## Hours since the run began (day 1 07:00 = 7.0). Monotonic through nights.
static func run_hour(day: int, hour: float) -> float:
	return float(day - 1) * 24.0 + (hour if hour >= 7.0 else hour + 24.0)


## Weather segments for one day: Array of {from, to, kind} in run hours. Later
## segments win where they overlap. Deterministic for (seed, day).
static func day_segments(p_seed: int, day: int, p_cfg: Dictionary) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash([p_seed, day, 7177])
	var base := float(day - 1) * 24.0
	var segs: Array = []
	# Foggy morning (the dawn before this day's 07:00). Never on day 1.
	if day >= 2 and rng.randf() < float(p_cfg.get("fog_morning_chance", 0.3)):
		segs.append({"from": base + 4.2, "to": base + rng.randf_range(8.5, 10.5), "kind": "fog"})
	var chances: Dictionary = p_cfg.get("chances", {})
	var pc := float(chances.get("clear", 0.5))
	var pcl := float(chances.get("cloudy", 0.26))
	var pr := float(chances.get("rain", 0.17))
	var ps := float(chances.get("storm", 0.07))
	if day < int(p_cfg.get("first_rain_day", 2)):
		pr = 0.0
		ps = 0.0
	elif day < int(p_cfg.get("first_storm_day", 3)):
		pr += ps
		ps = 0.0
	var total := maxf(pc + pcl + pr + ps, 0.0001)
	var r := rng.randf() * total
	var main := "clear"
	if r < pc:
		main = "clear"
	elif r < pc + pcl:
		main = "cloudy"
	elif r < pc + pcl + pr:
		main = "rain"
	else:
		main = "storm"
	match main:
		"cloudy":
			segs.append({"from": base + rng.randf_range(9.0, 13.0), "to": base + rng.randf_range(17.5, 23.0), "kind": "cloudy"})
		"rain", "storm":
			var hrs: Array = p_cfg.get("rain_hours", [2.0, 4.5])
			var start := base + rng.randf_range(11.0, 21.0)
			var dur := rng.randf_range(float(hrs[0]), float(hrs[1]))
			segs.append({"from": start - 1.6, "to": start + dur + 1.2, "kind": "cloudy"})
			segs.append({"from": start, "to": start + dur, "kind": main})
	return segs


## Scheduled kind at a run hour.
func scheduled_kind(rh: float) -> String:
	var day := int(floor((rh - 7.0) / 24.0)) + 1
	var out := "clear"
	for d in [day, day + 1]:
		if d < 1:
			continue
		if not _cache.has(d):
			_cache[d] = day_segments(run_seed, d, cfg)
		for s in _cache[d]:
			var seg: Dictionary = s
			if rh >= float(seg["from"]) and rh < float(seg["to"]):
				out = str(seg["kind"])
	return out


## Force a weather kind (tools, dev, tests). "auto" returns to the schedule.
func set_weather(p_kind: String, instant: bool = false) -> void:
	if p_kind == "auto" or p_kind == "":
		_override = ""
	elif p_kind in KINDS:
		_override = p_kind
	else:
		push_warning("Weather: unknown kind '%s'" % p_kind)
		return
	var target := _override if _override != "" else _current_scheduled()
	_change_kind(target, instant)
	if instant:
		_snap()


func _current_scheduled() -> String:
	var dc := GameState.day_cycle
	return scheduled_kind(run_hour(dc.day, dc.hour()))


func _change_kind(k: String, quiet: bool) -> void:
	if k == kind:
		return
	var was := kind
	kind = k
	Events.weather_changed.emit(k)
	if quiet or not GameState.is_playing():
		return
	match k:
		"rain":
			Events.notify.emit("It's raining! Your fire burns faster in the rain.", "warn")
		"storm":
			Events.notify.emit("A storm is coming! Keep the fire fed.", "warn")
		"fog":
			Events.notify.emit("A thick mist rolls in...", "info")
		"clear", "cloudy":
			if was in ["rain", "storm"]:
				Events.notify.emit("The rain has stopped.", "good")


func _snap() -> void:
	var p: Dictionary = PARAMS[kind]
	cloud = float(p["cloud"])
	rain = float(p["rain"])
	fog = float(p["fog"])
	wind = float(p["wind"])
	storm = float(p["storm"])
	wetness = clampf(rain * 1.4, 0.0, 1.0)
	_update_raining()


# --- Per-frame -------------------------------------------------------------------------

## Advance weather. game_dt = delta scaled by game speed (0 while frozen).
func tick(delta: float, game_dt: float, camera: Camera3D) -> void:
	var target_kind := _override if _override != "" else _current_scheduled()
	_change_kind(target_kind, false)
	var p: Dictionary = PARAMS[kind]
	var rate := game_dt / maxf(float(cfg.get("transition_seconds", 14.0)), 0.1)
	# Clouds gather before the rain starts; rain eases off before clouds clear.
	cloud = move_toward(cloud, float(p["cloud"]), rate * (1.3 if float(p["cloud"]) > cloud else 0.8))
	var rain_target := float(p["rain"]) if cloud > float(p["cloud"]) - 0.25 else 0.0
	rain = move_toward(rain, rain_target, rate)
	fog = move_toward(fog, float(p["fog"]), rate * 0.6)
	wind = move_toward(wind, float(p["wind"]), rate)
	storm = move_toward(storm, float(p["storm"]), rate)
	if rain > 0.05:
		wetness = minf(wetness + game_dt * rain / maxf(float(cfg.get("wetness_rise_seconds", 35.0)), 0.1), 1.0)
	else:
		wetness = maxf(wetness - game_dt / maxf(float(cfg.get("wetness_dry_seconds", 140.0)), 0.1), 0.0)
	_update_raining()
	_tick_lightning(delta, game_dt)
	_tick_rain_visuals(camera)


func _update_raining() -> void:
	var was := raining
	raining = rain > 0.15
	if raining != was or (raining and not _rain_loop):
		_set_rain_loop(raining)
	var windy := storm > 0.4
	if windy != _wind_loop and audio_anchor:
		_wind_loop = windy
		if windy:
			Audio.start_loop("wind", audio_anchor, -6.0)
		else:
			Audio.stop_loop("wind", audio_anchor)


func _set_rain_loop(on: bool) -> void:
	if audio_anchor == null or on == _rain_loop:
		return
	_rain_loop = on
	if on:
		Audio.start_loop("rain", audio_anchor, -3.0 if kind == "storm" else -7.0)
	else:
		Audio.stop_loop("rain", audio_anchor)


func overcast() -> float:
	return smoothstep(0.55, 1.0, cloud)


# --- Lightning --------------------------------------------------------------------------

func _tick_lightning(delta: float, game_dt: float) -> void:
	if storm > 0.6 and game_dt > 0.0:
		_thunder_in -= delta
		if _thunder_in <= 0.0:
			var iv: Array = cfg.get("lightning_interval", [7.0, 20.0])
			_thunder_in = _rng.randf_range(float(iv[0]), float(iv[1]))
			strike()
	if _flash_t >= 0.0:
		_flash_t += delta
		flash = flash_curve(_flash_t, _flash_soft)
		if _flash_t > 2.5:
			_flash_t = -1.0
			flash = 0.0
	else:
		flash = 0.0


## Trigger a lightning strike now: flash + delayed thunder.
func strike() -> void:
	_flash_soft = bool(Settings.get_value("reduce_flashing"))
	_flash_t = 0.0
	var delay := _rng.randf_range(0.5, 2.2)
	var vol := _rng.randf_range(-6.0, 0.0)
	get_tree().create_timer(delay, false).timeout.connect(func() -> void:
		Audio.play("thunder", null, vol, 0.12)
		Events.caption.emit("[thunder rumbles]"))


## Flash brightness over time. The soft version (reduce_flashing) is one slow,
## gentle swell with no strobe.
static func flash_curve(t: float, soft: bool) -> float:
	if soft:
		return 0.22 * smoothstep(0.0, 0.35, t) * (1.0 - smoothstep(0.35, 1.8, t))
	var a := exp(-t * 22.0)
	var b := 0.65 * exp(-maxf(t - 0.16, 0.0) * 14.0) * (1.0 if t >= 0.16 else 0.0)
	var c := 0.25 * exp(-maxf(t - 0.38, 0.0) * 9.0) * (1.0 if t >= 0.38 else 0.0)
	return clampf(a + b + c, 0.0, 1.0)


# --- Rain visuals ------------------------------------------------------------------------

func _build_rain() -> void:
	rain_particles = GPUParticles3D.new()
	rain_particles.name = "Rain"
	rain_particles.local_coords = false
	rain_particles.lifetime = 1.15
	rain_particles.preprocess = 1.2
	rain_particles.transform_align = GPUParticles3D.TRANSFORM_ALIGN_Z_BILLBOARD_Y_TO_VELOCITY
	rain_particles.visibility_aabb = AABB(Vector3(-26.0, -40.0, -26.0), Vector3(52.0, 48.0, 52.0))
	rain_particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	rain_particles.emitting = false
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(20.0, 1.0, 20.0)
	pm.direction = Vector3(0.0, -1.0, 0.0)
	pm.spread = 2.0
	pm.initial_velocity_min = 17.0
	pm.initial_velocity_max = 21.0
	pm.gravity = Vector3(0.0, -9.8, 0.0)
	pm.scale_min = 0.75
	pm.scale_max = 1.25
	rain_particles.process_material = pm
	var quad := QuadMesh.new()
	quad.size = Vector2(0.024, 0.55)
	rain_material = ShaderMaterial.new()
	rain_material.shader = RAIN_SHADER
	quad.material = rain_material
	rain_particles.draw_pass_1 = quad
	add_child(rain_particles)


func set_rain_amount(amount: int) -> void:
	_rain_amount = maxi(amount, 64)
	if rain_particles and rain_particles.amount != _rain_amount:
		rain_particles.amount = _rain_amount


## Brightness of the rain streaks (follows the scene's ambient light).
func set_rain_light(brightness: float) -> void:
	if rain_material:
		rain_material.set_shader_parameter("brightness", brightness)


func _tick_rain_visuals(camera: Camera3D) -> void:
	if rain_particles == null:
		return
	var show := rain > 0.02 and camera != null
	if show:
		var cpos := camera.global_position
		var fwd := -camera.global_transform.basis.z
		fwd.y = 0.0
		fwd = fwd.normalized() if fwd.length() > 0.01 else Vector3.ZERO
		rain_particles.global_position = cpos + fwd * 7.0 + Vector3(0.0, 13.0, 0.0)
		rain_particles.amount_ratio = clampf(rain, 0.05, 1.0)
		var pm := rain_particles.process_material as ParticleProcessMaterial
		pm.gravity = Vector3(wind_dir.x * wind * 5.0, -9.8, wind_dir.y * wind * 5.0)
	if audio_anchor and camera:
		audio_anchor.global_position = camera.global_position
	if rain_particles.emitting != show:
		rain_particles.emitting = show
