extends CanvasLayer
## Title screen: animated campsite illustration, the logo, tagline and the
## main menu (Play, Character Locker, Leaderboard, Settings, Quit) with the
## personal best. Keyboard / controller navigable. Emits play_pressed.

signal play_pressed

const LOCKER_SCRIPT := "res://ui/locker.gd"

var art: TitleArt
var ui: ScaledRoot
var menu: VBoxContainer
var _play: Button
var _overlay: Node = null
var _t := 0.0
var _logo: Control
var _foot: Label


func _ready() -> void:
	layer = 5
	art = TitleArt.new()
	art.fire_frac = Vector2(0.69, 0.8)
	art.moon_frac = Vector2(0.84, 0.16)
	add_child(art)
	ui = ScaledRoot.new(true)
	add_child(ui)
	_logo = _Logo.new()
	_logo.position = Vector2(104, 92)
	_logo.size = Vector2(900, 300)
	ui.add_child(_logo)

	menu = UIKit.vbox(14)
	menu.position = Vector2(120, 420)
	menu.custom_minimum_size = Vector2(470, 0)
	ui.add_child(menu)
	_play = UIKit.button("Play", "PrimaryButton", "ui_fire")
	_play.add_theme_font_size_override("font_size", 40)
	_play.custom_minimum_size = Vector2(470, 84)
	_play.add_theme_constant_override("icon_max_width", 46)
	_play.pressed.connect(func() -> void: play_pressed.emit())
	menu.add_child(_play)
	var has_locker := ResourceLoader.exists(LOCKER_SCRIPT)
	var locker := UIKit.button("Character Locker", "BigMenuButton", "ui_tent" if has_locker else "ui_lock")
	locker.disabled = not has_locker
	locker.tooltip_text = "" if has_locker else "Coming soon"
	if not has_locker:
		locker.add_theme_font_size_override("font_size", 27)
		var soon := UIKit.label("COMING SOON", "", 15, ThemeFactory.AMBER)
		soon.add_theme_font_override("font", ThemeFactory.font("body_bold"))
		soon.position = Vector2(470 - 136, 24)
		soon.size = Vector2(120, 22)
		soon.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		soon.modulate.a = 0.85
		locker.add_child(soon)
	locker.pressed.connect(_open_locker)
	menu.add_child(locker)
	var lb := UIKit.button("Leaderboard", "BigMenuButton", "ui_trophy")
	lb.pressed.connect(_open_leaderboard)
	menu.add_child(lb)
	var st := UIKit.button("Settings", "BigMenuButton", "ui_star")
	st.pressed.connect(_open_settings)
	menu.add_child(st)
	var quit := UIKit.button("Quit", "BigMenuButton", "ui_moon")
	quit.pressed.connect(func() -> void: get_tree().quit())
	menu.add_child(quit)
	for b in menu.get_children():
		(b as Button).alignment = HORIZONTAL_ALIGNMENT_LEFT
		(b as Button).add_theme_constant_override("icon_max_width", 42)
		if b != _play:
			(b as Button).custom_minimum_size = Vector2(470, 70)

	# Personal best badge
	var best := Profile.best_nights()
	var badge := PanelContainer.new()
	var sb := ThemeFactory.panel_style(18, 0.85)
	sb.content_margin_left = 16
	sb.content_margin_right = 22
	badge.add_theme_stylebox_override("panel", sb)
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(12)
	row.add_child(UIKit.icon_rect("ui_trophy", 44))
	var bt := UIKit.label("Personal best: %d night%s" % [best, "" if best == 1 else "s"] if best > 0 else "No record yet. Survive your first night!", "", 24)
	bt.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(bt)
	badge.add_child(row)
	badge.position = Vector2(120, 860)
	ui.add_child(badge)

	_foot = UIKit.label("v%s  -  Scores are saved on this computer" % str(ProjectSettings.get_setting("application/config/version", "0.1")), "SmallLabel")
	_foot.size = Vector2(530, 30)
	_foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ui.add_child(_foot)
	ui.relayout.connect(_layout)
	_layout()

	menu.modulate.a = 0.0
	_logo.modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_logo, "modulate:a", 1.0, 1.0).set_delay(0.15)
	tw.tween_property(menu, "modulate:a", 1.0, 0.7).set_delay(0.6)
	_play.grab_focus.call_deferred()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _layout() -> void:
	var s := ui.size
	_foot.position = Vector2(s.x - 560, s.y - 50)


func _process(delta: float) -> void:
	_t += delta


func _open_leaderboard() -> void:
	_show_overlay(LeaderboardScreen.new())


func _open_settings() -> void:
	_show_overlay(SettingsMenu.new())


func _open_locker() -> void:
	if not ResourceLoader.exists(LOCKER_SCRIPT):
		return
	var scr: Variant = load(LOCKER_SCRIPT)
	if not (scr is GDScript):
		return
	var inst: Variant = (scr as GDScript).new()
	if inst is Node:
		_show_overlay(inst as Node)


func _show_overlay(n: Node) -> void:
	if _overlay and is_instance_valid(_overlay):
		_overlay.queue_free()
	_overlay = n
	if n is CanvasLayer:
		add_child(n)
	else:
		ui.add_child(n)
	if n.has_method("open"):
		n.call("open", {})
	if n.has_signal("closed"):
		n.connect("closed", func() -> void:
			_overlay = null
			if is_instance_valid(_play):
				_play.grab_focus())


class _Logo:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var t := Time.get_ticks_msec() / 1000.0
		var fd := ThemeFactory.font("display_bold")
		var fb := ThemeFactory.font("body_bold")
		var glow := ThemeFactory.glow_texture()
		var pulse := 0.85 + 0.15 * sin(t * 1.7)
		draw_texture_rect(glow, Rect2(Vector2(-120, -60), Vector2(940, 360)), false, Color(1.0, 0.55, 0.15, 0.22 * pulse))
		# "MATI's" in warm amber
		var top := "MATI's"
		var p1 := Vector2(8, 92)
		draw_string_outline(fd, p1 + Vector2(0, 5), top, HORIZONTAL_ALIGNMENT_LEFT, -1, 92, 16, Color(0.05, 0.02, 0.05, 0.5))
		draw_string_outline(fd, p1, top, HORIZONTAL_ALIGNMENT_LEFT, -1, 92, 12, Color("3a1a08"))
		draw_string(fd, p1, top, HORIZONTAL_ALIGNMENT_LEFT, -1, 92, Color("ffb347"))
		# "Campout" big cream with a warm glow edge
		var word := "Campout"
		var p2 := Vector2(0, 226)
		draw_string_outline(fd, p2 + Vector2(0, 7), word, HORIZONTAL_ALIGNMENT_LEFT, -1, 150, 22, Color(0.03, 0.01, 0.04, 0.55))
		draw_string_outline(fd, p2, word, HORIZONTAL_ALIGNMENT_LEFT, -1, 150, 26, Color(1.0, 0.55, 0.15, 0.16 * pulse))
		draw_string_outline(fd, p2, word, HORIZONTAL_ALIGNMENT_LEFT, -1, 150, 14, Color("3a1a08"))
		draw_string(fd, p2, word, HORIZONTAL_ALIGNMENT_LEFT, -1, 150, Color("fff1d6"))
		# Small flame dotting the logo, right after "MATI's"
		var fire := ThemeFactory.icon("ui_fire")
		if fire:
			var tw := fd.get_string_size(top, HORIZONTAL_ALIGNMENT_LEFT, -1, 92).x
			var fs := 78.0 * (1.0 + 0.04 * sin(t * 9.0))
			draw_texture_rect(glow, Rect2(Vector2(tw + 4, -4), Vector2(110, 110)), false, Color(1.0, 0.6, 0.2, 0.35 * pulse))
			draw_texture_rect(fire, Rect2(Vector2(tw + 20, 20 - (fs - 78.0)), Vector2(fs, fs)), false)
		var tag := "Keep the fire alive. Survive the night."
		draw_string_outline(fb, Vector2(10, 290), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, 8, Color(0.03, 0.02, 0.05, 0.75))
		draw_string(fb, Vector2(10, 290), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, Color("f2e4c4"))
