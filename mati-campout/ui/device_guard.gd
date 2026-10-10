class_name DeviceGuard
extends CanvasLayer
## Keeps a run safe on phones and in browsers (added by main.gd, always on).
##
## - Portrait: on touch devices a friendly full-screen "Turn your phone
##   sideways" card covers everything and the game pauses; turning back to
##   landscape hides it and resumes.
## - Hidden app / tab: when the app loses focus on a touch device (switching
##   apps, the notification shade) or the browser tab is hidden (any browser,
##   via the page's visibilitychange event), the game pauses so the fire does
##   not burn down while nobody is watching; it resumes on return, after a
##   couple of frames so the long "catch-up" frame passes while paused.
## Only pauses it started are undone (an open pause menu stays open).
## Emits Events.device_paused(paused, reason) ("portrait" / "hidden").
## - Dynamic resolution (phone preset only): if the game runs below ~24 FPS
##   for a few seconds the 3D resolution steps down (to 60 % at most,
##   Settings.dynamic_scale); it steps back up when it runs smoothly again.

const ROTATE_TEXT := "Turn your phone sideways"
const ROTATE_SUB := "MATI's Campout plays best in landscape"

var card: Control
var _portrait := false
var _hidden := false
var _we_paused := false
var _resume_frames := 0
var _js_cb: Variant = null      # JavaScriptObject (kept alive)
var _check_t := 0.0
var _perf_t := 0.0
var _slow := 0
var _fast := 0


func _init() -> void:
	name = "DeviceGuard"
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS


func _ready() -> void:
	card = _RotateCard.new()
	card.visible = false
	add_child(card)
	get_viewport().size_changed.connect(_check_orientation)
	_hook_web_visibility()
	_check_orientation()


## Web: listen to document.visibilitychange (a hidden tab pauses even on a
## desktop browser, where window blur alone does not).
func _hook_web_visibility() -> void:
	if not Platform.is_web():
		return
	_js_cb = JavaScriptBridge.create_callback(_on_js_visibility)
	var doc: Variant = JavaScriptBridge.get_interface("document")
	if doc != null and _js_cb != null:
		doc.addEventListener("visibilitychange", _js_cb)


func _on_js_visibility(_args: Array) -> void:
	var hidden: Variant = JavaScriptBridge.eval("document.hidden", true)
	set_hidden(bool(hidden))


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED:
			if Platform.is_touch_device() or what == NOTIFICATION_APPLICATION_PAUSED:
				set_hidden(true)
		NOTIFICATION_APPLICATION_FOCUS_IN, NOTIFICATION_APPLICATION_RESUMED:
			if _hidden:
				set_hidden(false)


func is_portrait() -> bool:
	return _portrait


func is_holding_pause() -> bool:
	return _we_paused


## The app/tab was hidden (true) or shown again (false).
func set_hidden(on: bool) -> void:
	if on == _hidden:
		return
	_hidden = on
	_refresh("hidden")


func _check_orientation() -> void:
	var p := Platform.is_touch_device() and Platform.is_portrait(get_viewport().get_visible_rect().size)
	if p != _portrait:
		_portrait = p
		card.visible = p
		_refresh("portrait")


func _refresh(reason: String) -> void:
	var want := _portrait or _hidden
	var tree := get_tree()
	if want:
		_resume_frames = 0
		if not _we_paused and not tree.paused:
			_we_paused = true
			tree.paused = true
			Events.game_paused.emit(true)
			Events.device_paused.emit(true, reason)
	elif _we_paused:
		# Resume after a couple of frames (the first frame back can be long).
		_resume_frames = 3


func _process(delta: float) -> void:
	_perf_tick(delta)
	_check_t -= delta
	if _check_t <= 0.0:
		_check_t = 0.4
		_check_orientation()
	if _resume_frames > 0:
		_resume_frames -= 1
		if _resume_frames == 0 and _we_paused and not (_portrait or _hidden):
			_we_paused = false
			get_tree().paused = false
			Events.game_paused.emit(false)
			Events.device_paused.emit(false, "")


## Every 2 s while playing on the phone preset: step the 3D resolution down
## after 3 slow checks in a row (< 24 FPS), up after 4 smooth ones (> 48 FPS).
func _perf_tick(delta: float) -> void:
	if Settings.quality() != "phone" or get_tree().paused or not GameState.is_playing():
		_slow = 0
		_fast = 0
		return
	_perf_t += delta
	if _perf_t < 2.0:
		return
	_perf_t = 0.0
	var fps := Engine.get_frames_per_second()
	_slow = _slow + 1 if fps < 24.0 else 0
	_fast = _fast + 1 if fps > 48.0 else 0
	if _slow >= 3:
		_slow = 0
		Settings.set_dynamic_scale(Settings.dynamic_scale - 0.1)
	elif _fast >= 4:
		_fast = 0
		Settings.set_dynamic_scale(Settings.dynamic_scale + 0.1)


## Full-screen night card with a phone turning sideways.
class _RotateCard:
	extends Control

	func _init() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		process_mode = Node.PROCESS_MODE_ALWAYS

	func _gui_input(event: InputEvent) -> void:
		accept_event()

	func _process(_d: float) -> void:
		if visible:
			queue_redraw()

	func _draw() -> void:
		var s := size
		var t := Time.get_ticks_msec() / 1000.0
		draw_rect(Rect2(Vector2.ZERO, s), Color("0b1024"))
		var glow := ThemeFactory.glow_texture()
		var unit := minf(s.x, s.y * 0.6)          # scale everything to the narrow side
		var c := Vector2(s.x * 0.5, s.y * 0.42)
		# Warm campfire glow behind the phone.
		draw_texture_rect(glow, Rect2(c - Vector2(unit, unit) * 0.75, Vector2(unit, unit) * 1.5), false, Color(1.0, 0.55, 0.15, 0.22 + 0.05 * sin(t * 2.0)))
		# The phone: upright, then turns 90 degrees, holds, and repeats.
		var cyc := fposmod(t, 3.2)
		var turn := smoothstep(0.7, 1.6, cyc) * (1.0 - smoothstep(2.7, 3.2, cyc))
		var ang := -PI * 0.5 * turn
		var pw := unit * 0.26
		var ph := unit * 0.46
		draw_set_transform(c, ang, Vector2.ONE)
		var body := StyleBoxFlat.new()
		body.set_corner_radius_all(int(pw * 0.16))
		body.corner_detail = 10
		body.anti_aliasing = true
		body.bg_color = Color("1c3326")
		body.set_border_width_all(maxi(int(pw * 0.06), 3))
		body.border_color = ThemeFactory.AMBER
		draw_style_box(body, Rect2(Vector2(-pw, -ph) * 0.5, Vector2(pw, ph)))
		var scr := StyleBoxFlat.new()
		scr.set_corner_radius_all(int(pw * 0.08))
		scr.anti_aliasing = true
		scr.bg_color = Color("232a5c").lerp(Color("e8892b"), turn * 0.6)
		draw_style_box(scr, Rect2(Vector2(-pw, -ph) * 0.5 + Vector2(pw, pw) * 0.12, Vector2(pw, ph) - Vector2(pw, pw) * 0.24))
		var fire := ThemeFactory.icon("ui_fire")
		if fire:
			var fs := pw * 0.5
			draw_set_transform(c, 0.0, Vector2.ONE)
			draw_texture_rect(fire, Rect2(Vector2(-fs, -fs) * 0.5, Vector2(fs, fs)), false, Color(1, 1, 1, 0.5 + 0.5 * turn))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# Curved arrow showing the turn.
		var r := ph * 0.72
		var a0 := -PI * 0.5 - 0.35
		var a1 := -PI - 0.2
		var arc_c := Color(1.0, 0.85, 0.6, 0.85)
		draw_arc(c, r, a1, a0, 32, arc_c, maxf(unit * 0.012, 3.0), true)
		var tip := c + Vector2.from_angle(a1) * r
		var tdir := Vector2.from_angle(a1 - PI * 0.5)
		var side := tdir.orthogonal() * unit * 0.025
		draw_colored_polygon(PackedVector2Array([tip + tdir * unit * 0.045, tip + side, tip - side]), arc_c)
		# Text.
		var fd := ThemeFactory.font("display_bold")
		var fb := ThemeFactory.font("body_bold")
		var fs1 := int(clampf(unit * 0.085, 28.0, 160.0))
		var fs2 := int(clampf(unit * 0.045, 18.0, 90.0))
		var y := c.y + ph * 0.5 + unit * 0.2
		_center(fd, ROTATE_TEXT, fs1, Vector2(c.x, y), Color("fff1d6"), s.x * 0.92)
		_center(fb, ROTATE_SUB, fs2, Vector2(c.x, y + fs1 * 1.1), Color("cdbf9e"), s.x * 0.92)

	func _center(f: Font, text: String, fs: int, p: Vector2, col: Color, max_w: float) -> void:
		var size_px := fs
		var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
		while w > max_w and size_px > 12:
			size_px -= 2
			w = f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
		var pos := Vector2(p.x - w * 0.5, p.y)
		draw_string_outline(f, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, maxi(size_px / 6, 4), Color(0.02, 0.02, 0.06, 0.8))
		draw_string(f, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, col)
