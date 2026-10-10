class_name ScaledRoot
extends Control
## Full-screen Control that applies the game Theme and the "ui_scale"
## setting. Children are laid out in unscaled 1920x1080-style units; the root
## shrinks its own size by the scale so anchors still reach the screen edges.

signal relayout()

var use_ui_scale := true


func _init(p_use_scale: bool = true) -> void:
	use_ui_scale = p_use_scale
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS


func _ready() -> void:
	theme = ThemeFactory.get_theme()
	get_viewport().size_changed.connect(_relayout)
	Settings.changed.connect(_on_setting)
	_relayout()


func current_scale() -> float:
	return ThemeFactory.ui_scale() if use_ui_scale else 1.0


func _relayout() -> void:
	var vp := get_viewport_rect().size
	var s := current_scale()
	scale = Vector2(s, s)
	position = Vector2.ZERO
	size = vp / s
	relayout.emit()


func _on_setting(key: String) -> void:
	if key == "ui_scale":
		_relayout()
	elif key in ["high_contrast", "colorblind_mode"]:
		theme = ThemeFactory.get_theme()
		propagate_call("queue_redraw")
