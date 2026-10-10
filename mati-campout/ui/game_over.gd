extends CanvasLayer
## Game-over screen: "The night got you..." with the cause, NIGHTS SURVIVED as
## a big number, a NEW PERSONAL BEST celebration, the local leaderboard rank,
## a stats grid and Try Again / Leaderboard / Title buttons.
## main.gd sets `summary` (GameState.end_run()) before adding it.

signal retry_pressed
signal title_pressed

var summary: Dictionary = {}
var ui: ScaledRoot
var _content: VBoxContainer
var _retry: Button
var _overlay: Node = null
var _new_best := false


func _ready() -> void:
	layer = 50
	process_mode = Node.PROCESS_MODE_ALWAYS
	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	bg.color = Color(0.03, 0.035, 0.08, 0.0)
	add_child(bg)
	var vig := TextureRect.new()
	var g := Gradient.new()
	g.set_color(0, Color(0.06, 0.05, 0.14, 0.55))
	g.set_color(1, Color(0.0, 0.0, 0.02, 0.95))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.42)
	gt.fill_to = Vector2(1.1, 0.42)
	gt.width = 256
	gt.height = 256
	vig.texture = gt
	vig.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vig.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	vig.stretch_mode = TextureRect.STRETCH_SCALE
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vig)
	ui = ScaledRoot.new(true)
	add_child(ui)
	_build()
	ui.modulate.a = 0.0
	vig.modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(bg, "color:a", 0.55, 1.0)
	tw.tween_property(vig, "modulate:a", 1.0, 1.0)
	tw.tween_property(ui, "modulate:a", 1.0, 0.8).set_delay(0.3)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	Audio.set_music_mood("gameover")


static func cause_text(cause: String) -> String:
	var c := cause.to_lower()
	if c.contains("cold") or c.contains("freez"):
		return "You got too cold."
	if c.contains("hunger") or c.contains("starv"):
		return "Your tummy was empty for too long."
	if c.contains("boss") or c.contains("three"):
		return "The Three-Headed Wolf was too strong."
	if c.contains("stalker"):
		return "A Night Stalker caught you in the dark."
	if c.contains("watcher"):
		return "The Watcher found you in the dark."
	if c.contains("wolf") or c.contains("bite"):
		return "A wild wolf got you."
	return "The forest was too dangerous tonight."


func is_new_best() -> bool:
	var nights := int(summary.get("nights", 0))
	if int(summary.get("rank", 0)) != 1 or nights <= 0:
		return false
	var top: Array = Profile.leaderboard.top(2)
	var prev := 0
	if top.size() > 1:
		prev = int((top[1] as Dictionary).get("nights", 0))
	return nights > prev


func _build() -> void:
	var nights := int(summary.get("nights", 0))
	var rank := int(summary.get("rank", 0))
	var st: Dictionary = summary.get("stats", {})
	_new_best = is_new_best()
	var cc := CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(cc)
	_content = UIKit.vbox(8)
	_content.alignment = BoxContainer.ALIGNMENT_CENTER
	cc.add_child(_content)

	var title := UIKit.label("The night got you...", "TitleLabel")
	title.add_theme_font_size_override("font_size", 76)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_content.add_child(title)
	var cause := UIKit.label(cause_text(str(summary.get("cause", ""))), "", 32, Color("ffc89a"))
	cause.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_content.add_child(cause)
	_content.add_child(UIKit.spacer(10))

	var num_row := UIKit.hbox(26)
	num_row.alignment = BoxContainer.ALIGNMENT_CENTER
	num_row.add_child(UIKit.icon_rect("ui_moon", 110))
	var num_col := UIKit.vbox(-10)
	var nl := UIKit.label("NIGHTS SURVIVED", "", 30, Color("c9d6ff"))
	nl.add_theme_font_override("font", ThemeFactory.font("display"))
	nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num_col.add_child(nl)
	var big := _BigNumber.new()
	big.value = nights
	big.custom_minimum_size = Vector2(320, 150)
	num_col.add_child(big)
	num_row.add_child(num_col)
	num_row.add_child(UIKit.spacer(0, 110))
	_content.add_child(num_row)

	if _new_best:
		var nb := _NewBest.new()
		nb.custom_minimum_size = Vector2(760, 86)
		_content.add_child(UIKit.center(nb))
	var rank_txt := ""
	if rank > 0:
		rank_txt = "Rank #%d on this computer's leaderboard" % rank
	else:
		rank_txt = "Not in this computer's top 10 this time. Keep trying!"
	var best := int(summary.get("best", Profile.best_nights()))
	var rl := UIKit.label("%s   -   Best: %d night%s" % [rank_txt, best, "" if best == 1 else "s"], "DimLabel")
	rl.add_theme_font_size_override("font_size", 24)
	rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_content.add_child(rl)
	_content.add_child(UIKit.spacer(12))

	var grid := UIKit.vbox(14)
	var stats := [
		["ui_moon", "Nights", str(nights)],
		["wood", "Trees chopped", str(int(st.get("trees_chopped", 0)))],
		["ui_paw", "Enemies defeated", str(int(st.get("enemies_defeated", 0)))],
		["ui_boot", "Distance", UIKit.distance_text(float(st.get("distance", 0.0)))],
		["ui_chest", "Chests found", str(int(st.get("chests_opened", 0)))],
		["ui_tent", "Highest tent", "Level %d" % int(st.get("highest_tent", 1))],
		["ui_eye", "Boss encounters", str(int(st.get("boss_encounters", 0)))],
	]
	var row: HBoxContainer = null
	for i in stats.size():
		if i % 4 == 0:
			row = UIKit.hbox(14)
			row.alignment = BoxContainer.ALIGNMENT_CENTER
			grid.add_child(row)
		var sdef: Array = stats[i]
		row.add_child(_stat_card(str(sdef[0]), str(sdef[1]), str(sdef[2])))
	_content.add_child(UIKit.center(grid))
	_content.add_child(UIKit.spacer(18))

	var buttons := UIKit.hbox(18)
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	_retry = UIKit.button("Try Again", "PrimaryButton", "ui_fire", 300)
	_retry.add_theme_font_size_override("font_size", 34)
	_retry.custom_minimum_size.y = 76
	_retry.pressed.connect(func() -> void: retry_pressed.emit())
	buttons.add_child(_retry)
	var lb := UIKit.button("Leaderboard", "", "ui_trophy", 280)
	lb.custom_minimum_size.y = 76
	lb.pressed.connect(_open_leaderboard)
	buttons.add_child(lb)
	var tb := UIKit.button("Title", "", "ui_tent", 220)
	tb.custom_minimum_size.y = 76
	tb.pressed.connect(func() -> void: title_pressed.emit())
	buttons.add_child(tb)
	_content.add_child(buttons)
	_retry.grab_focus.call_deferred()


func _stat_card(icon_id: String, label: String, value: String) -> Control:
	var p := PanelContainer.new()
	var sb := ThemeFactory.panel_style(16, 0.9)
	sb.shadow_size = 6
	p.add_theme_stylebox_override("panel", sb)
	p.custom_minimum_size = Vector2(300, 0)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := UIKit.hbox(14)
	h.add_child(UIKit.icon_rect(icon_id, 52))
	var v := UIKit.vbox(0)
	var val := UIKit.label(value, "", 32)
	val.add_theme_font_override("font", ThemeFactory.font("display"))
	v.add_child(val)
	v.add_child(UIKit.label(label, "SmallLabel"))
	h.add_child(v)
	p.add_child(h)
	return p


func _open_leaderboard() -> void:
	if _overlay and is_instance_valid(_overlay):
		return
	var lb := LeaderboardScreen.new()
	lb.highlight_rank = int(summary.get("rank", 0))
	_overlay = lb
	ui.add_child(lb)
	lb.closed.connect(func() -> void:
		_overlay = null
		if is_instance_valid(_retry):
			_retry.grab_focus())


class _BigNumber:
	extends Control
	var value := 0
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var shown := int(round(lerpf(0.0, float(value), clampf((_t - 0.6) / 1.0, 0.0, 1.0))))
		var f := ThemeFactory.font("display_bold")
		var txt := str(shown)
		var fs := 150
		var pop := 1.0 + 0.12 * sin(clampf((_t - 1.6) / 0.35, 0.0, 1.0) * PI)
		fs = int(fs * pop)
		var w := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p := Vector2((size.x - w) * 0.5, size.y * 0.5 + fs * 0.36)
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(p.x - 80, -10), Vector2(w + 160, size.y + 20)), false, Color(1.0, 0.75, 0.3, 0.25))
		draw_string_outline(f, p + Vector2(0, 6), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 18, Color(0, 0, 0, 0.45))
		draw_string_outline(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 12, Color("3a1a08"))
		draw_string(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("ffd166"))


class _NewBest:
	extends Control
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var a := clampf((_t - 1.8) / 0.4, 0.0, 1.0)
		if a <= 0.0:
			return
		var c := size * 0.5
		var calm := ThemeFactory.reduce_flashing()
		var pulse := 0.5 + 0.5 * sin(_t * (2.0 if calm else 4.0))
		var s := 1.0 + 0.25 * (1.0 - a)
		var sb := ThemeFactory.flat(Color(0.35, 0.2, 0.04, 0.9 * a), 40)
		sb.set_border_width_all(3)
		sb.border_color = Color(1.0, 0.82, 0.4, a)
		sb.shadow_color = Color(1.0, 0.6, 0.15, (0.25 + 0.25 * pulse) * a)
		sb.shadow_size = 22
		var w := 660.0 * s
		var h := 72.0 * s
		draw_style_box(sb, Rect2(c - Vector2(w, h) * 0.5, Vector2(w, h)))
		var f := ThemeFactory.font("display_bold")
		var txt := "NEW PERSONAL BEST!"
		var fs := int(46 * s)
		var tw := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p := c + Vector2(-tw * 0.5, fs * 0.36)
		draw_string_outline(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 8, Color(0.2, 0.08, 0, a))
		draw_string(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1.0, 0.86, 0.4, a).lerp(Color(1, 1, 0.9, a), pulse * 0.3))
		var star := ThemeFactory.icon("ui_star")
		if star:
			for i in 2:
				var side := -1.0 if i == 0 else 1.0
				var sp := c + Vector2(side * (w * 0.5 + 10.0), 0)
				var ss := 64.0 * (1.0 + 0.12 * sin(_t * 5.0 + i))
				draw_texture_rect(star, Rect2(sp - Vector2(ss, ss) * 0.5, Vector2(ss, ss)), false, Color(1, 1, 1, a))
			# Burst of small stars right after it appears
			var bt := _t - 1.8
			if bt < 1.6 and not calm:
				for k in 14:
					var ang := TAU * float(k) / 14.0
					var d := 60.0 + bt * 300.0
					var sp2 := c + Vector2(cos(ang) * d * 1.6, sin(ang) * d * 0.6)
					var ss2 := 26.0 * (1.0 - bt / 1.6)
					draw_texture_rect(star, Rect2(sp2 - Vector2(ss2, ss2) * 0.5, Vector2(ss2, ss2)), false, Color(1, 1, 1, (1.0 - bt / 1.6)))
