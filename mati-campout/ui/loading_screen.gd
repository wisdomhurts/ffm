extends CanvasLayer
## Loading screen in the title art style: campsite illustration, logo, a
## progress bar with a little flame riding it, the current build step and
## rotating survival tips. main.gd calls set_progress(frac, text).

const TIPS := [
	["ui_fire", "Feed the campfire before it gets low. A big fire keeps monsters far away."],
	["kindling", "Keep kindling in your Camp Box. You need it to relight a dead fire."],
	["ui_moon", "When the sky turns orange, head home. Night comes fast!"],
	["ui_warmth", "Cold nights drain your warmth. Stand near the fire or rest in your tent."],
	["cooked_meat", "Cooked meat fills you up much more than raw meat. Use the rack over the fire."],
	["coal", "Coal burns almost three times longer than wood."],
	["ui_sack", "Bigger sacks hold more. Press Tab to see the extra rows."],
	["bone", "Wolves love bones. A calm wolf might become your friend."],
	["flashlight", "A flashlight scares most monsters, but watch its battery."],
	["ui_map", "Craft a map at the crate to find chests and landmarks."],
	["good_axe", "A better axe chops trees much faster."],
	["ui_chest", "Chests hide coins and rare loot. Look near landmarks!"],
	["ui_eye", "If something tall is watching you from the trees... stay in the light."],
	["ui_star", "Every sunrise counts. Try to beat your personal best!"],
]

var art: TitleArt
var ui: ScaledRoot
var _target := 0.0
var _shown := 0.0
var _status: Label
var _tip_label: Label
var _tip_icon: TextureRect
var _tip_box: Control
var _bar: Control
var _tip_index := 0
var _tip_t := 0.0


func _ready() -> void:
	layer = 100
	art = TitleArt.new()
	art.fire_frac = Vector2(0.5, 0.7)
	art.moon_frac = Vector2(0.2, 0.22)
	art.show_tent = true
	add_child(art)
	var shade := TextureRect.new()
	var g := Gradient.new()
	g.set_color(0, Color(0.02, 0.02, 0.05, 0.0))
	g.set_color(1, Color(0.02, 0.02, 0.05, 0.85))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0.55)
	gt.fill_to = Vector2(0, 1)
	gt.width = 4
	gt.height = 128
	shade.texture = gt
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	ui = ScaledRoot.new(true)
	add_child(ui)

	var title := UIKit.label("MATI's Campout", "TitleLabel")
	title.add_theme_font_override("font", ThemeFactory.font("display_bold"))
	title.add_theme_font_size_override("font_size", 78)
	title.add_theme_color_override("font_color", Color("fff1d6"))
	title.add_theme_color_override("font_outline_color", Color("3a1a08"))
	title.add_theme_constant_override("outline_size", 12)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.name = "Title"
	ui.add_child(title)

	_bar = _Bar.new()
	(_bar as _Bar).screen = self
	ui.add_child(_bar)
	_status = UIKit.label("Getting ready...", "HudLabel")
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(_status)

	var tip_panel := PanelContainer.new()
	var sb := ThemeFactory.panel_style(22, 0.9)
	sb.content_margin_left = 22
	sb.content_margin_right = 28
	tip_panel.add_theme_stylebox_override("panel", sb)
	tip_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(18)
	_tip_icon = UIKit.icon_rect("ui_fire", 64)
	row.add_child(_tip_icon)
	var col := UIKit.vbox(2)
	col.add_child(UIKit.label("CAMPER TIP", "", 18, ThemeFactory.AMBER))
	_tip_label = UIKit.wrap_label("", "", 800)
	_tip_label.add_theme_font_size_override("font_size", 26)
	col.add_child(_tip_label)
	row.add_child(col)
	tip_panel.add_child(row)
	_tip_box = tip_panel
	ui.add_child(tip_panel)
	_tip_index = randi() % TIPS.size()
	_show_tip(true)
	ui.relayout.connect(_layout)
	_layout()


func _layout() -> void:
	var s := ui.size
	var title := ui.get_node("Title") as Label
	title.size = Vector2(s.x, 100)
	title.position = Vector2(0, 70)
	_bar.size = Vector2(900, 64)
	_bar.position = Vector2((s.x - 900) * 0.5, s.y - 236)
	_status.size = Vector2(900, 40)
	_status.position = Vector2((s.x - 900) * 0.5, s.y - 262)
	var ts := _tip_box.get_combined_minimum_size()
	_tip_box.size = Vector2(maxf(ts.x, 940), ts.y)
	_tip_box.position = Vector2((s.x - _tip_box.size.x) * 0.5, s.y - 138)


func set_progress(frac: float, text: String) -> void:
	_target = clampf(frac, 0.0, 1.0)
	if text != "":
		_status.text = text


## Touch screens: keyboard words become the on-screen buttons.
static func _tip_text(tip: Array) -> String:
	var t := str(tip[1])
	if Platform.is_touch():
		t = t.replace("Press Tab to see", "Tap the bag to see")
	return t


func _show_tip(instant: bool = false) -> void:
	var tip: Array = TIPS[_tip_index % TIPS.size()]
	if instant:
		_tip_icon.texture = ThemeFactory.icon(str(tip[0]))
		_tip_label.text = _tip_text(tip)
		return
	var tw := create_tween()
	tw.tween_property(_tip_box, "modulate:a", 0.0, 0.25)
	tw.tween_callback(func() -> void:
		_tip_icon.texture = ThemeFactory.icon(str(tip[0]))
		_tip_label.text = _tip_text(tip))
	tw.tween_property(_tip_box, "modulate:a", 1.0, 0.3)


func _process(delta: float) -> void:
	_shown = move_toward(_shown, _target, delta * 1.6)
	_shown = lerpf(_shown, _target, clampf(delta * 4.0, 0.0, 1.0))
	_tip_t += delta
	if _tip_t > 4.5:
		_tip_t = 0.0
		_tip_index += 1
		_show_tip()
	_bar.queue_redraw()


class _Bar:
	extends Control
	var screen: Node

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var frac: float = screen.get("_shown") if screen else 0.0
		var r := Rect2(Vector2(0, 18), Vector2(size.x, 28))
		var track := ThemeFactory.flat(Color(0, 0.02, 0.01, 0.65), 14)
		track.set_border_width_all(2)
		track.border_color = Color(1, 0.8, 0.55, 0.25)
		draw_style_box(track, r)
		var inner := r.grow(-4)
		if frac > 0.005:
			var fr := Rect2(inner.position, Vector2(maxf(inner.size.x * frac, inner.size.y), inner.size.y))
			draw_style_box(ThemeFactory.flat(Color("e8892b"), 10), fr)
			var hi := Rect2(fr.position + Vector2(10, 0), Vector2(maxf(fr.size.x - 20, 1), fr.size.y))
			draw_polygon(PackedVector2Array([hi.position, Vector2(hi.end.x, hi.position.y), hi.end, Vector2(hi.position.x, hi.end.y)]),
				PackedColorArray([Color("e8892b"), Color("ffd166"), Color("ffd166"), Color("e8892b")]))
			draw_style_box(ThemeFactory.flat(Color(1, 1, 1, 0.22), 6), Rect2(fr.position + Vector2(6, 2), Vector2(maxf(fr.size.x - 12, 1), fr.size.y * 0.4)))
		var t := Time.get_ticks_msec() / 1000.0
		var fx := inner.position.x + inner.size.x * frac
		var fire := ThemeFactory.icon("ui_fire")
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(fx - 50, r.get_center().y - 50), Vector2(100, 100)), false, Color(1, 0.6, 0.2, 0.55))
		if fire:
			var fs := 58.0 * (1.0 + 0.06 * sin(t * 10.0))
			draw_texture_rect(fire, Rect2(Vector2(fx - fs * 0.5, r.get_center().y - fs * 0.78), Vector2(fs, fs)), false)
		var f := ThemeFactory.font("display")
		var pct := "%d%%" % int(round(frac * 100.0))
		var pw := f.get_string_size(pct, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
		draw_string(f, Vector2(size.x - pw, r.end.y + 26), pct, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, ThemeFactory.text_dim())
