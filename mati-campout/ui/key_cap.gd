class_name KeyCap
extends Control
## A keyboard key or gamepad button glyph for prompts. Follows Controls so it
## switches between "E" and the gamepad "X" automatically.

const PAD_COLORS := {"A": Color("5bbf5f"), "B": Color("e0524a"), "X": Color("4f8fe0"), "Y": Color("f2c037")}

var action: String = ""
var fixed_text: String = ""
var cap_height := 40.0
var dim := false
var _shown := ""


func _init(p_action: String = "", p_fixed: String = "", p_height: float = 40.0) -> void:
	action = p_action
	fixed_text = p_fixed
	cap_height = p_height
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(p_height, p_height)


func text() -> String:
	if fixed_text != "":
		return fixed_text
	return Controls.prompt(action) if action != "" else "?"


func _process(_delta: float) -> void:
	var t := text()
	if t != _shown:
		_shown = t
		var f := ThemeFactory.font("display")
		var fs := int(cap_height * 0.52)
		var w := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		custom_minimum_size = Vector2(maxf(cap_height, w + cap_height * 0.62), cap_height)
		update_minimum_size()
		queue_redraw()


func _draw() -> void:
	var t := _shown if _shown != "" else text()
	var r := Rect2(Vector2.ZERO, size)
	var f := ThemeFactory.font("display")
	var fs := int(cap_height * 0.52)
	var pad := Controls.using_gamepad and PAD_COLORS.has(t) and fixed_text == ""
	var alpha := 0.55 if dim else 1.0
	if pad:
		var c: Color = PAD_COLORS[t]
		var center := r.get_center()
		var rad := minf(r.size.x, r.size.y) * 0.5
		draw_circle(center + Vector2(0, 2), rad, Color(0, 0, 0, 0.35 * alpha))
		draw_circle(center, rad, Color(c.r * 0.55, c.g * 0.55, c.b * 0.55, alpha))
		draw_circle(center - Vector2(0, 1.5), rad - 3.0, Color(c.r, c.g, c.b, alpha))
	else:
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(int(cap_height * 0.22))
		sb.corner_detail = 6
		sb.anti_aliasing = true
		sb.bg_color = Color(0.72, 0.66, 0.55, alpha)
		draw_style_box(sb, r)
		var top := StyleBoxFlat.new()
		top.set_corner_radius_all(int(cap_height * 0.2))
		top.corner_detail = 6
		top.anti_aliasing = true
		top.bg_color = Color(0.98, 0.95, 0.88, alpha) if not dim else Color(0.75, 0.73, 0.68, alpha)
		draw_style_box(top, Rect2(r.position + Vector2(2, 2), r.size - Vector2(4, 7)))
	var ts := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
	var pos := Vector2((r.size.x - ts.x) * 0.5, (r.size.y - (0.0 if pad else 4.0)) * 0.5 + f.get_ascent(fs) * 0.5 - f.get_descent(fs) * 0.35)
	var col := Color(1, 1, 1, alpha) if pad else Color(0.17, 0.11, 0.06, alpha)
	draw_string(f, pos, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
