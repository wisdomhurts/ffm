class_name InteractPrompt
extends Control
## "[E] Add Wood to fire" pill above the hotbar. Reads the player's current
## target every frame; shows a greyed hint (get_interact_hint) when the target
## exists but its action is not available right now.

var hotbar: Hotbar
var _pill: PanelContainer
var _key: KeyCap
var _text: Label
var _alpha := 0.0
var _last := ""


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill = PanelContainer.new()
	var sb := ThemeFactory.panel_style(30, 0.95)
	sb.content_margin_left = 12
	sb.content_margin_right = 24
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	_pill.add_theme_stylebox_override("panel", sb)
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(14)
	_key = KeyCap.new("interact", "", 44)
	row.add_child(_key)
	_text = UIKit.label("", "HudLabel")
	_text.add_theme_font_size_override("font_size", 28)
	_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(_text)
	_pill.add_child(row)
	add_child(_pill)
	_pill.modulate.a = 0.0


## Returns [text, is_hint].
static func query() -> Array:
	var p := GameState.player
	if p == null or not is_instance_valid(p) or GameState.ui_blocking or not GameState.is_playing():
		return ["", false]
	if p.has_method("get_interact_text_full"):
		# Player returns {text, hint, key}; older stubs may return a String.
		var full: Variant = p.call("get_interact_text_full")
		if full is Dictionary:
			var d := full as Dictionary
			if str(d.get("text", "")) != "":
				return [str(d["text"]), false]
			if str(d.get("hint", "")) != "":
				return [str(d["hint"]), true]
			return ["", false]
		if str(full) != "":
			return [str(full), false]
	var target: Variant = p.call("get_interact_target") if p.has_method("get_interact_target") else null
	if target == null or not is_instance_valid(target):
		return ["", false]
	var n := target as Node
	var txt := ""
	if n.has_method("get_interact_text"):
		txt = str(n.call("get_interact_text", p))
	if txt != "":
		return [txt, false]
	if n.has_method("get_interact_hint"):
		var hint := str(n.call("get_interact_hint", p))
		if hint != "":
			return [hint, true]
	return ["", false]


func _process(delta: float) -> void:
	var q := query()
	var txt: String = q[0]
	var is_hint: bool = q[1]
	# Touch mode: the context button of the touch controls shows the prompt.
	if Platform.is_touch() and not Controls.using_gamepad:
		txt = ""
	if txt != "":
		if txt != _last:
			_last = txt
			_text.text = txt
			_pill.reset_size()
		_key.visible = not is_hint
		_key.dim = is_hint
		_text.add_theme_color_override("font_color", Color(0.78, 0.76, 0.7) if is_hint else ThemeFactory.text_color())
	_alpha = move_toward(_alpha, 1.0 if txt != "" else 0.0, delta * 8.0)
	_pill.modulate.a = _alpha
	_pill.visible = _alpha > 0.01
	var vp := get_parent_area_size()
	var ps := _pill.get_combined_minimum_size()
	_pill.size = ps
	var top := hotbar.top_y() if hotbar else vp.y - 150.0
	var lift := (1.0 - _alpha) * 10.0
	_pill.position = Vector2((vp.x - ps.x) * 0.5, top - ps.y - 96.0 + lift)
