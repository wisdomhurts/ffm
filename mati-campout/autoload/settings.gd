extends Node
## Persistent player settings (user://settings.cfg).
##
## Read with Settings.get_value("key"); write with Settings.set_value("key", v)
## which saves and emits `changed(key)`. Systems that depend on a setting listen
## to `changed` (the environment controller re-applies quality, the audio
## director re-applies volumes, the camera reads sensitivity every frame).

signal changed(key: String)

const PATH := "user://settings.cfg"
const QUALITY_LEVELS := ["low", "medium", "high"]

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


func _ready() -> void:
	load_settings()
	if "--dev" in OS.get_cmdline_user_args() or "--dev" in OS.get_cmdline_args():
		data["dev_mode"] = true
	apply_display()


func get_value(key: String) -> Variant:
	return data.get(key, DEFAULTS.get(key))


func set_value(key: String, value: Variant, persist: bool = true) -> void:
	if data.get(key) == value:
		return
	data[key] = value
	if key in ["fullscreen", "vsync", "fps_limit", "render_scale"]:
		apply_display()
	if persist:
		save_settings()
	changed.emit(key)


func quality() -> String:
	var q := str(get_value("quality"))
	return q if q in QUALITY_LEVELS else "high"


func quality_index() -> int:
	return QUALITY_LEVELS.find(quality())


func reset_to_defaults() -> void:
	data = DEFAULTS.duplicate()
	save_settings()
	apply_display()
	for k in data:
		changed.emit(k)


func load_settings() -> void:
	var cf := ConfigFile.new()
	if cf.load(PATH) != OK:
		return
	for k in DEFAULTS:
		if cf.has_section_key("settings", k):
			var v: Variant = cf.get_value("settings", k)
			if typeof(v) == typeof(DEFAULTS[k]) or (DEFAULTS[k] is float and v is int):
				data[k] = v


func save_settings() -> void:
	var cf := ConfigFile.new()
	for k in data:
		cf.set_value("settings", k, data[k])
	cf.save(PATH)


func apply_display() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var fs: bool = get_value("fullscreen")
	var mode := DisplayServer.window_get_mode()
	if fs and mode != DisplayServer.WINDOW_MODE_FULLSCREEN:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	elif not fs and mode == DisplayServer.WINDOW_MODE_FULLSCREEN:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if get_value("vsync") else DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = int(get_value("fps_limit"))
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_scale = clampf(float(get_value("render_scale")), 0.5, 1.0)
