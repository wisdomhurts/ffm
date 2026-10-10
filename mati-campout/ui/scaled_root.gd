class_name ScaledRoot
extends Control
## Full-screen Control that applies the game Theme and the "ui_scale"
## setting. Children are laid out in unscaled 1920x1080-style units; the root
## shrinks its own size by the scale so anchors still reach the screen edges.
##
## On phones and tablets (Platform.is_touch_device()) it also:
##   - multiplies the scale by Platform.ui_scale_boost() so text and buttons
##     stay readable and big enough for thumbs on small, dense screens;
##   - keeps its rect inside the notch / home-indicator safe area
##     (Platform.safe_insets()), so every HUD widget and menu respects it.
## `safe_margins` (left, top, right, bottom in layout units) tells children
## how much was inset.

signal relayout()

var use_ui_scale := true
## Inset applied for notches (layout units; position = left/top, size = right/bottom).
var safe_margins := Rect2()
var _last_insets := Rect2()
var _check_t := 0.0


func _init(p_use_scale: bool = true) -> void:
	use_ui_scale = p_use_scale
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS


func _ready() -> void:
	theme = ThemeFactory.get_theme()
	get_viewport().size_changed.connect(_relayout)
	Settings.changed.connect(_on_setting)
	Events.input_mode_changed.connect(func(_t: bool) -> void: _relayout())
	_relayout()


func current_scale() -> float:
	if not use_ui_scale:
		return 1.0
	return ThemeFactory.ui_scale() * Platform.ui_scale_boost(get_viewport_rect().size)


func _process(delta: float) -> void:
	# Safe-area insets can change after a rotation without a resize event
	# (iOS reports them late), so poll them now and then on touch devices.
	if not Platform.is_touch_device():
		return
	_check_t -= delta
	if _check_t > 0.0:
		return
	_check_t = 0.5
	if Platform.safe_insets() != _last_insets:
		_relayout()


func _relayout() -> void:
	var vp := get_viewport_rect().size
	var s := current_scale()
	scale = Vector2(s, s)
	# Window pixels -> layout units of the canvas (canvas_items stretch).
	var insets := Platform.safe_insets() if Platform.is_touch_device() else Rect2()
	_last_insets = insets
	var win := Platform.window_size()
	var k := vp.x / maxf(win.x, 1.0) if win.x > 0.0 else 1.0
	var l := insets.position.x * k
	var t := insets.position.y * k
	var r := insets.size.x * k
	var b := insets.size.y * k
	position = Vector2(l, t)
	size = (vp - Vector2(l + r, t + b)) / s
	safe_margins = Rect2(l / s, t / s, r / s, b / s)
	relayout.emit()


func _on_setting(key: String) -> void:
	if key == "ui_scale":
		_relayout()
	elif key in ["high_contrast", "colorblind_mode"]:
		theme = ThemeFactory.get_theme()
		propagate_call("queue_redraw")
