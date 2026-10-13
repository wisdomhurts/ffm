class_name UIKit
extends RefCounted
## Small helpers for building UI in code with the game Theme.


static func label(text: String, variation: String = "", size: int = 0, color: Color = Color(0, 0, 0, 0)) -> Label:
	var l := Label.new()
	l.text = text
	if variation != "":
		l.theme_type_variation = variation
	if size > 0:
		l.add_theme_font_size_override("font_size", size)
	if color.a > 0.0:
		l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func wrap_label(text: String, variation: String = "DimLabel", width: float = 0.0) -> Label:
	var l := label(text, variation)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if width > 0.0:
		l.custom_minimum_size.x = width
	return l


static func icon_rect(id: String, px: float) -> TextureRect:
	var t := TextureRect.new()
	t.texture = ThemeFactory.icon(id)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(px, px)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


static func button(text: String, variation: String = "", icon_id: String = "", min_width: float = 0.0) -> Button:
	var b := Button.new()
	b.text = text
	if variation != "":
		b.theme_type_variation = variation
	if icon_id != "":
		b.icon = ThemeFactory.icon(icon_id)
		b.expand_icon = true
	if min_width > 0.0:
		b.custom_minimum_size.x = min_width
	b.focus_mode = Control.FOCUS_ALL
	b.pressed.connect(func() -> void: Audio.play_ui("ui_click"))
	return b


static func hbox(sep: int = 10) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return h


static func vbox(sep: int = 10) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return v


static func margin(all: int) -> MarginContainer:
	var m := MarginContainer.new()
	for side in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		m.add_theme_constant_override(side, all)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return m


static func spacer(h: float = 0.0, w: float = 0.0, expand: bool = false) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(w, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if expand:
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return c


static func panel(variation: String = "") -> PanelContainer:
	var p := PanelContainer.new()
	if variation != "":
		p.theme_type_variation = variation
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


static func center(c: Control) -> CenterContainer:
	var cc := CenterContainer.new()
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cc.add_child(c)
	return cc


## Recursively make a subtree ignore the mouse (passive HUD elements must not
## swallow clicks meant for the game).
static func ignore_mouse(n: Node) -> void:
	if n is Control:
		(n as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for c in n.get_children():
		ignore_mouse(c)


## Remove all children (immediately detached, freed at end of frame).
static func clear(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c)
		c.queue_free()


## "1.2 km" / "340 m"
static func distance_text(meters: float) -> String:
	if meters >= 1000.0:
		return "%.1f km" % (meters / 1000.0)
	return "%d m" % int(round(meters))


static func time_text(seconds: float) -> String:
	var s := maxi(int(ceil(seconds)), 0)
	return "%d:%02d" % [s / 60, s % 60]


## Main router node (main/main.gd), found without hard-coded paths.
static func main_node(from: Node) -> Node:
	var root := from.get_tree().root
	for c in root.get_children():
		if c.has_method("show_title") and c.has_method("start_run"):
			return c
	return null
