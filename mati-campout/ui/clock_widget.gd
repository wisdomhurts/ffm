class_name ClockWidget
extends Control
## Top-right panel: "Day 3" / "Night 3" with a little sky dial (sun or moon
## riding an arc), time until night (or until dawn), coins and personal best.

const SIZE := Vector2(400, 168)

var _coin_bump := 0.0
var _coins_shown := 0.0
## Extra room kept free on the right (the touch Pause button), layout units.
var right_inset := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = SIZE
	custom_minimum_size = SIZE
	_coins_shown = GameState.coins
	Events.coins_changed.connect(func(_total: int, delta: int) -> void:
		if delta != 0:
			_coin_bump = 1.0)


func _process(delta: float) -> void:
	var vp := get_parent_area_size()
	position = Vector2(vp.x - SIZE.x * scale.x - 26.0 - right_inset, 22.0)
	_coin_bump = maxf(_coin_bump - delta * 3.0, 0.0)
	_coins_shown = move_toward(_coins_shown, float(GameState.coins), maxf(absf(GameState.coins - _coins_shown) * delta * 8.0, delta * 10.0))
	queue_redraw()


func _draw() -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var dc := GameState.day_cycle
	draw_style_box(ThemeFactory.cached_panel(20, 0.9), Rect2(Vector2.ZERO, SIZE))
	# --- Dial -------------------------------------------------------------
	var dial_c := Vector2(76, 82)
	var rad := 52.0
	var night_mix := dc.darkness()
	var sky_top := Color("5f9fe0").lerp(Color("1b2350"), night_mix)
	var sky_bot := Color("ffd9a0").lerp(Color("3a3270"), night_mix)
	if dc.phase == DayCycle.Phase.DUSK:
		sky_bot = Color("ff9a5a").lerp(Color("4a3270"), dc.phase_progress())
	var pts := PackedVector2Array()
	var cols := PackedColorArray()
	pts.append(dial_c)
	cols.append(sky_bot)
	for i in 33:
		var a := PI + PI * float(i) / 32.0
		pts.append(dial_c + Vector2(cos(a), sin(a)) * rad)
		cols.append(sky_top.lerp(sky_bot, 0.15))
	draw_polygon(pts, cols)
	# Rolling hills inside the dial, then the rim and horizon line.
	var hills := PackedVector2Array()
	var hill_col := Color(0.08, 0.16, 0.12).lerp(Color(0.04, 0.06, 0.1), night_mix)
	for i in range(1, 20):
		var u := float(i) / 20.0
		var x := -rad + u * rad * 2.0
		var y := -10.0 - 7.0 * sin(u * 7.5 + 0.8) - 4.0 * sin(u * 15.0)
		var lim := -sqrt(maxf(rad * rad - x * x, 0.0))
		hills.append(dial_c + Vector2(x, maxf(y, lim)))
	hills.append(dial_c + Vector2(rad, 0))
	hills.append(dial_c + Vector2(-rad, 0))
	draw_colored_polygon(hills, hill_col)
	draw_arc(dial_c, rad, PI, TAU, 40, Color(1, 0.85, 0.6, 0.45), 2.5, true)
	draw_line(dial_c - Vector2(rad + 6, 0), dial_c + Vector2(rad + 6, 0), Color(0.85, 0.7, 0.5, 0.9), 3.0, true)
	var h := dc.hour()
	var is_sun := h >= 6.0 and h < 19.0
	var prog := 0.0
	if is_sun:
		prog = (h - 6.0) / 13.0
	else:
		prog = fposmod(h - 19.0, 24.0) / 11.0
	var ang := PI + PI * clampf(prog, 0.0, 1.0)
	var body := dial_c + Vector2(cos(ang), sin(ang)) * (rad - 6.0)
	var tex := ThemeFactory.icon("ui_sun" if is_sun else "ui_moon")
	draw_texture_rect(ThemeFactory.glow_texture(), Rect2(body - Vector2(30, 30), Vector2(60, 60)), false,
		Color(1, 0.85, 0.4, 0.5) if is_sun else Color(0.6, 0.7, 1.0, 0.45))
	if tex:
		draw_texture_rect(tex, Rect2(body - Vector2(21, 21), Vector2(42, 42)), false)
	# --- Title and countdown -------------------------------------------------
	var fd := ThemeFactory.font("display")
	var fb := ThemeFactory.font("body_bold")
	var title := "Day %d" % dc.day
	var title_col := ThemeFactory.text_color()
	var sub := ""
	var sub_col := ThemeFactory.text_dim()
	match dc.phase:
		DayCycle.Phase.DAY:
			sub = "Night in " + UIKit.time_text(dc.seconds_until_night())
			if dc.seconds_until_night() < dc.durations[DayCycle.Phase.DUSK] + 30.0:
				sub_col = ThemeFactory.AMBER
		DayCycle.Phase.DUSK:
			title = "Dusk"
			title_col = Color("ffc78a")
			sub = "Night in " + UIKit.time_text(dc.seconds_until_night())
			sub_col = ThemeFactory.AMBER.lerp(Color.WHITE, 0.25 + 0.25 * sin(t * 4.0))
		DayCycle.Phase.NIGHT:
			title = "Night %d" % dc.night_number()
			title_col = Color("b9c8ff")
			sub = "Dawn in " + UIKit.time_text(dc.phase_duration() - dc.phase_time)
			sub_col = Color("9fb3ea")
		DayCycle.Phase.DAWN:
			title = "Dawn"
			title_col = Color("ffd9a0")
			sub = "Morning is here!"
	var tx := 150.0
	draw_string_outline(fd, Vector2(tx, 58), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 40, 6, Color(0, 0, 0, 0.6))
	draw_string(fd, Vector2(tx, 58), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 40, title_col)
	draw_string(fb, Vector2(tx, 90), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, sub_col)
	# --- Coins and best ----------------------------------------------------------
	draw_line(Vector2(18, 116), Vector2(SIZE.x - 18, 116), Color(1, 0.85, 0.6, 0.12), 2.0)
	var coin := ThemeFactory.icon("ui_coin")
	var cs := 36.0 * (1.0 + 0.25 * sin(_coin_bump * PI))
	if coin:
		draw_texture_rect(coin, Rect2(Vector2(40 - cs * 0.5, 142 - cs * 0.5), Vector2(cs, cs)), false)
	var ctxt := str(int(round(_coins_shown)))
	draw_string_outline(fd, Vector2(66, 153), ctxt, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, 6, Color(0, 0, 0, 0.6))
	draw_string(fd, Vector2(66, 153), ctxt, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, ThemeFactory.GOLD.lerp(Color.WHITE, _coin_bump * 0.6))
	var best := Profile.best_nights()
	var btxt := "Best: %d night%s" % [best, "" if best == 1 else "s"]
	var bw := fb.get_string_size(btxt, HORIZONTAL_ALIGNMENT_LEFT, -1, 21).x
	var troph := ThemeFactory.icon("ui_trophy")
	var bx := SIZE.x - 22 - bw
	if troph:
		draw_texture_rect(troph, Rect2(Vector2(bx - 36, 125), Vector2(30, 30)), false)
	draw_string(fb, Vector2(bx, 150), btxt, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, ThemeFactory.text_dim())
