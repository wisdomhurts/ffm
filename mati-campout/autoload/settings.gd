extends Node
## Persistent player settings (user://settings.cfg).
##
## Read with Settings.get_value("key"); write with Settings.set_value("key", v)
## which saves and emits `changed(key)`. Systems that depend on a setting listen
## to `changed` (the environment controller re-applies quality, the audio
## director re-applies volumes, the camera reads sensitivity every frame).

signal changed(key: String)

const PATH := "user://settings.cfg"
## Lowest to highest. "phone" is the lightest preset (phones and tablets in a
## browser); it is picked automatically on the first run on mobile.
const QUALITY_LEVELS := ["phone", "low", "medium", "high"]
## The phone preset renders 3D at 70 % of the Render scale setting and never
## taller than this many pixels (phones have 2-3x DPR screens).
const PHONE_RENDER_SCALE := 0.7
const PHONE_MAX_3D_HEIGHT := 720.0

const DEFAULTS := {
	"quality": "high",
	"fullscreen": false,
	"vsync": true,
	"fps_limit": 0,
	"render_scale": 1.0,
	"show_fps": false,
	"master_volume": 0.9,
	"music_volume": 0.65,
	"sfx_volume": 0.9,
	"ambience_volume": 0.85,
	"mouse_sensitivity": 1.0,
	"controller_sensitivity": 1.0,
	"touch_sensitivity": 1.0,
	"invert_y": false,
	"fov": 70.0,
	"camera_shake": 1.0,
	"camera_distance": 4.6,
	"auto_pickup": true,
	"ui_scale": 1.0,
	"high_contrast": false,
	"colorblind_mode": "none",
	"brightness": 1.0,
	"reduce_flashing": false,
	"sound_captions": false,
	"hold_to_sprint": true,
	"day_length_mult": 1.0,
	"dev_mode": false,
}

var data: Dictionary = DEFAULTS.duplicate()
## True when no settings file existed (first run): platform defaults applied.
var first_run := false
## `--quality=phone` on the command line (tests/screenshots); not saved and
## cleared as soon as the player picks a quality in the menu.
var quality_override := ""
## Phone preset only: extra 3D resolution factor (0.6..1) that DeviceGuard
## lowers when the frame rate stays low and raises again when it recovers.
var dynamic_scale := 1.0


func _ready() -> void:
	data = platform_defaults()
	first_run = not load_settings()
	if "--dev" in OS.get_cmdline_user_args() or "--dev" in OS.get_cmdline_args():
		data["dev_mode"] = true
	for a in OS.get_cmdline_user_args():
		if str(a).begins_with("--quality="):
			var q := str(a).trim_prefix("--quality=")
			if q in QUALITY_LEVELS:
				quality_override = q
	apply_display()
	var vp := get_viewport()
	if vp and not vp.size_changed.is_connected(_on_viewport_resized):
		vp.size_changed.connect(_on_viewport_resized)


## DEFAULTS adjusted for the platform: phones and tablets get the "phone"
## preset and a calmer camera, desktop browsers "low" (WebGL), desktops "high".
static func platform_defaults() -> Dictionary:
	var d: Dictionary = DEFAULTS.duplicate()
	if Platform.is_mobile():
		d["quality"] = "phone"
		d["fov"] = 72.0
		d["camera_shake"] = 0.7
		d["hold_to_sprint"] = true
	elif Platform.is_web():
		d["quality"] = "low"
	return d


## Default for one key on this platform.
func default_value(key: String) -> Variant:
	return platform_defaults().get(key)


func get_value(key: String) -> Variant:
	return data.get(key, DEFAULTS.get(key))


func set_value(key: String, value: Variant, persist: bool = true) -> void:
	if key == "quality" and quality_override != "":
		quality_override = ""
		if data.get(key) == value:
			changed.emit(key)
			apply_display(key)
			return
	if data.get(key) == value:
		return
	data[key] = value
	if key in ["fullscreen", "vsync", "fps_limit", "render_scale", "quality"]:
		apply_display(key)
	if persist:
		save_settings()
	changed.emit(key)


func quality() -> String:
	var q := quality_override if quality_override != "" else str(get_value("quality"))
	return q if q in QUALITY_LEVELS else "high"


func quality_index() -> int:
	return QUALITY_LEVELS.find(quality())


## True on the two lightest presets ("phone" and "low"): use it instead of
## comparing with "low" so the phone preset gets the cheap path too.
func is_low_quality() -> bool:
	return quality_index() <= QUALITY_LEVELS.find("low")


func is_phone_quality() -> bool:
	return quality() == "phone"


func reset_to_defaults() -> void:
	data = platform_defaults()
	save_settings()
	apply_display()
	for k in data:
		changed.emit(k)


## Returns false when there is no settings file yet (first run).
func load_settings() -> bool:
	var cf := ConfigFile.new()
	if cf.load(PATH) != OK:
		return false
	for k in DEFAULTS:
		if cf.has_section_key("settings", k):
			var v: Variant = cf.get_value("settings", k)
			if typeof(v) == typeof(DEFAULTS[k]) or (DEFAULTS[k] is float and v is int):
				data[k] = v
	return true


func save_settings() -> void:
	var cf := ConfigFile.new()
	for k in data:
		cf.set_value("settings", k, data[k])
	cf.save(PATH)


## Apply window/display settings. In a browser the page owns fullscreen and
## v-sync: only an explicit change of the setting (a click in the menu, which
## counts as the user gesture browsers require) touches them.
func apply_display(changed_key: String = "") -> void:
	if DisplayServer.get_name() == "headless":
		return
	var web: bool = Platform.is_web()
	if not web or changed_key == "fullscreen":
		var fs: bool = get_value("fullscreen")
		var mode := DisplayServer.window_get_mode()
		if fs and mode != DisplayServer.WINDOW_MODE_FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		elif not fs and mode == DisplayServer.WINDOW_MODE_FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	if not web:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if get_value("vsync") else DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = int(get_value("fps_limit"))
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_scale = effective_render_scale(Vector2(DisplayServer.window_get_size()))


## The 3D resolution scale actually used: the Render scale setting, times 0.7
## on the phone preset, capped so phones never render 3D taller than
## PHONE_MAX_3D_HEIGHT pixels.
func effective_render_scale(window_px: Vector2) -> float:
	var s := clampf(float(get_value("render_scale")), 0.5, 1.0)
	if quality() == "phone":
		s *= PHONE_RENDER_SCALE
		if window_px.y > 1.0:
			s = minf(s, PHONE_MAX_3D_HEIGHT / window_px.y)
		s = maxf(s * clampf(dynamic_scale, 0.6, 1.0), 0.3)
	return s


## Dynamic resolution step (phone preset; see DeviceGuard).
func set_dynamic_scale(v: float) -> void:
	v = clampf(v, 0.6, 1.0)
	if is_equal_approx(v, dynamic_scale):
		return
	dynamic_scale = v
	_on_viewport_resized()


func _on_viewport_resized() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_scale = effective_render_scale(Vector2(DisplayServer.window_get_size()))
