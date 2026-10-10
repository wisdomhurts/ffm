class_name BannerLayer
extends Control
## Big centred messages and phase cards:
##   - Events.big_message: cinematic band + large text (the fire-out message
##     gets red-orange text, a dark band and a short shake).
##   - Dusk warning card, "NIGHT N" title card, "You survived Night N!" sunrise.
## Everything is drawn in _draw so fades/scales stay smooth and cheap.

var _items: Array = []   # active cards: {kind, text, sub, color, t, dur}
var _last_fire_out_ms := -100000
var _last_night_card := -1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	Events.big_message.connect(_on_big_message)
	Events.fire_extinguished.connect(_on_fire_out_event)
	Events.dusk_warning.connect(func() -> void: show_dusk_warning())
	Events.phase_changed.connect(_on_phase)
	Events.night_survived.connect(func(total: int) -> void: show_survived(total))


func _on_big_message(text: String, color: Color, duration: float) -> void:
	if "FIRE IS OUT" in text.to_upper():
		show_fire_out(text)
		return
	_push({"kind": "big", "text": text, "sub": "", "color": color, "dur": maxf(duration, 1.5)})


func _on_fire_out_event() -> void:
	if not GameState.is_playing():
		return
	# Give the campfire system a moment to send its own big_message first.
	await get_tree().create_timer(0.15, true, false, true).timeout
	show_fire_out("")


func show_fire_out(text: String = "") -> void:
	var now := Time.get_ticks_msec()
	if now - _last_fire_out_ms < 3000:
		return
	_last_fire_out_ms = now
	var main := "THE FIRE IS OUT."
	var sub := "YOU ARE NO LONGER SAFE."
	if text != "":
		var parts := text.split(". ", false, 1)
		main = parts[0].strip_edges()
		if not main.ends_with(".") and not main.ends_with("!"):
			main += "."
		sub = parts[1].strip_edges() if parts.size() > 1 else ""
	_items = _items.filter(func(e: Dictionary) -> bool: return e["kind"] != "fire_out")
	_push({"kind": "fire_out", "text": main, "sub": sub, "color": Color("ff5a2a"), "dur": 4.8})


func show_dusk_warning() -> void:
	_push({"kind": "dusk", "text": "Night is coming!", "sub": "Head back to camp.", "color": ThemeFactory.AMBER, "dur": 4.2})


func show_night_card(n: int) -> void:
	if n == _last_night_card:
		return
	_last_night_card = n
	_push({"kind": "night", "text": "NIGHT %d" % n, "sub": "Keep the fire alive.", "color": Color("c9d6ff"), "dur": 4.5})


func show_survived(n: int) -> void:
	_push({"kind": "survived", "text": "You survived Night %d!" % n, "sub": "The sun is coming up.", "color": ThemeFactory.GOLD, "dur": 4.8})


func _on_phase(phase: int) -> void:
	if phase == DayCycle.Phase.NIGHT:
		show_night_card(GameState.night_number())


func _push(e: Dictionary) -> void:
	e["t"] = 0.0
	# Phase cards and banners replace whatever is showing in the same slot.
	var slot := "card" if e["kind"] in ["dusk", "night", "survived"] else "banner"
	e["slot"] = slot
	_items = _items.filter(func(x: Dictionary) -> bool: return x["slot"] != slot)
	_items.append(e)


func clear() -> void:
	_items.clear()


var _had_items := false


func _process(delta: float) -> void:
	for i in range(_items.size() - 1, -1, -1):
		var e: Dictionary = _items[i]
		e["t"] = float(e["t"]) + delta
		if float(e["t"]) > float(e["dur"]):
			_items.remove_at(i)
	if not _items.is_empty() or _had_items:
		queue_redraw()
	_had_items = not _items.is_empty()


func _env(t: float, dur: float, fin: float = 0.4, fout: float = 0.7) -> float:
	return clampf(t / fin, 0.0, 1.0) * clampf((dur - t) / fout, 0.0, 1.0)


func _draw() -> void:
	var vp := size
	for e in _items:
		match str(e["kind"]):
			"fire_out":
				_draw_fire_out(e, vp)
			"big":
				_draw_big(e, vp)
			"dusk":
				_draw_dusk(e, vp)
			"night":
				_draw_night(e, vp)
			"survived":
				_draw_survived(e, vp)


func _band(cy: float, h: float, a: float, col: Color, vp: Vector2) -> void:
	# Soft horizontal band: opaque in the middle, fading at top/bottom/sides.
	var steps := 12
	for k in steps:
		var u0 := float(k) / steps
		var u1 := float(k + 1) / steps
		var y0 := cy - h * 0.5 + h * u0
		var y1 := cy - h * 0.5 + h * u1
		var a0 := sin(u0 * PI) * a
		var a1 := sin(u1 * PI) * a
		var pts := PackedVector2Array([Vector2(0, y0), Vector2(vp.x * 0.5, y0), Vector2(vp.x, y0), Vector2(vp.x, y1), Vector2(vp.x * 0.5, y1), Vector2(0, y1)])
		var c_edge0 := Color(col.r, col.g, col.b, a0 * 0.15)
		var c_mid0 := Color(col.r, col.g, col.b, a0)
		var c_edge1 := Color(col.r, col.g, col.b, a1 * 0.15)
		var c_mid1 := Color(col.r, col.g, col.b, a1)
		draw_polygon(PackedVector2Array([pts[0], pts[1], pts[4], pts[5]]), PackedColorArray([c_edge0, c_mid0, c_mid1, c_edge1]))
		draw_polygon(PackedVector2Array([pts[1], pts[2], pts[3], pts[4]]), PackedColorArray([c_mid0, c_edge0, c_edge1, c_mid1]))


func _text_center(f: Font, text: String, fs: int, center: Vector2, col: Color, outline: int = 8, outline_col: Color = Color(0, 0, 0, 0.75), spacing: float = 0.0) -> void:
	if spacing <= 0.0:
		var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p := center + Vector2(-w * 0.5, fs * 0.35)
		if outline > 0:
			draw_string_outline(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, outline_col)
		draw_string(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		return
	# Letter-spaced title text.
	var total := 0.0
	for ch in text:
		total += f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + spacing
	total -= spacing
	var x := center.x - total * 0.5
	for ch in text:
		var cw := f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p2 := Vector2(x, center.y + fs * 0.35)
		if outline > 0:
			draw_string_outline(f, p2, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, outline_col)
		draw_string(f, p2, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		x += cw + spacing


func _draw_fire_out(e: Dictionary, vp: Vector2) -> void:
	var t := float(e["t"])
	var dur := float(e["dur"])
	var a := _env(t, dur, 0.25, 0.9)
	var calm := ThemeFactory.reduce_flashing()
	var shake := Vector2.ZERO
	if not calm and t < 0.9:
		var k := (0.9 - t) / 0.9
		shake = Vector2(sin(t * 61.0) * 10.0 * k, cos(t * 47.0) * 6.0 * k)
	var cy := vp.y * 0.38
	_band(cy, 300.0, 0.82 * a, Color(0.02, 0.01, 0.02), vp)
	# Thin ember lines framing the band
	var lw := vp.x * 0.42 * clampf(t / 0.5, 0.0, 1.0)
	draw_line(Vector2(vp.x * 0.5 - lw, cy - 96) + shake, Vector2(vp.x * 0.5 + lw, cy - 96) + shake, Color(1.0, 0.35, 0.12, 0.55 * a), 2.0, true)
	draw_line(Vector2(vp.x * 0.5 - lw, cy + 100) + shake, Vector2(vp.x * 0.5 + lw, cy + 100) + shake, Color(1.0, 0.35, 0.12, 0.55 * a), 2.0, true)
	var punch := 1.0 + 0.25 * clampf(1.0 - t / 0.35, 0.0, 1.0)
	var col: Color = e["color"]
	var f := ThemeFactory.font("display_bold")
	var fs := int(84 * punch)
	# Glow layer
	draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(vp.x * 0.5 - 520, cy - 150) + shake, Vector2(1040, 220)), false, Color(1.0, 0.3, 0.08, 0.3 * a))
	_text_center(f, str(e["text"]), fs, Vector2(vp.x * 0.5, cy - 28) + shake, Color(col.r, col.g, col.b, a), 12, Color(0.12, 0.0, 0.0, 0.9 * a), 6.0)
	if str(e["sub"]) != "":
		var sa := a * clampf((t - 0.35) / 0.35, 0.0, 1.0)
		_text_center(ThemeFactory.font("display"), str(e["sub"]), 46, Vector2(vp.x * 0.5, cy + 56) + shake * 0.6, Color(1.0, 0.93, 0.86, sa), 9, Color(0.12, 0.0, 0.0, 0.92 * sa), 4.0)


func _draw_big(e: Dictionary, vp: Vector2) -> void:
	var t := float(e["t"])
	var a := _env(t, float(e["dur"]), 0.35, 0.6)
	var cy := vp.y * 0.36
	_band(cy, 200.0, 0.6 * a, Color(0.02, 0.03, 0.05), vp)
	var col: Color = e["color"]
	if col.a <= 0.01:
		col = ThemeFactory.text_color()
	var s := 1.0 + 0.06 * (1.0 - clampf(t / 0.4, 0.0, 1.0))
	_text_center(ThemeFactory.font("display_bold"), str(e["text"]), int(64 * s), Vector2(vp.x * 0.5, cy), Color(col.r, col.g, col.b, a), 10, Color(0, 0, 0, 0.8 * a))


func _draw_dusk(e: Dictionary, vp: Vector2) -> void:
	var t := float(e["t"])
	var a := _env(t, float(e["dur"]), 0.45, 0.8)
	var cy := vp.y * 0.3 - (1.0 - clampf(t / 0.45, 0.0, 1.0)) * 20.0
	_band(cy + 10, 200.0, 0.55 * a, Color(0.06, 0.03, 0.08), vp)
	var moon := ThemeFactory.icon("ui_moon")
	if moon:
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(vp.x * 0.5 - 90, cy - 150), Vector2(180, 180)), false, Color(0.6, 0.65, 1.0, 0.4 * a))
		draw_texture_rect(moon, Rect2(Vector2(vp.x * 0.5 - 38, cy - 98), Vector2(76, 76)), false, Color(1, 1, 1, a))
	_text_center(ThemeFactory.font("display_bold"), str(e["text"]), 60, Vector2(vp.x * 0.5, cy + 6), Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, a), 10, Color(0.08, 0.02, 0, 0.85 * a))
	_text_center(ThemeFactory.font("display"), str(e["sub"]), 36, Vector2(vp.x * 0.5, cy + 64), Color(1, 0.96, 0.88, a), 8, Color(0, 0, 0, 0.8 * a))


func _draw_night(e: Dictionary, vp: Vector2) -> void:
	var t := float(e["t"])
	var dur := float(e["dur"])
	var a := _env(t, dur, 0.9, 1.0)
	var cy := vp.y * 0.32
	_band(cy, 260.0, 0.78 * a, Color(0.02, 0.03, 0.09), vp)
	var grow := clampf(t / 1.4, 0.0, 1.0)
	var lw := 380.0 * (1.0 - pow(1.0 - grow, 3.0))
	var lc := Color(0.62, 0.72, 1.0, 0.6 * a)
	draw_line(Vector2(vp.x * 0.5 - 60 - lw, cy + 70), Vector2(vp.x * 0.5 - 60, cy + 70), lc, 2.0, true)
	draw_line(Vector2(vp.x * 0.5 + 60, cy + 70), Vector2(vp.x * 0.5 + 60 + lw, cy + 70), lc, 2.0, true)
	var star_tex := ThemeFactory.icon("ui_star")
	if star_tex:
		draw_texture_rect(star_tex, Rect2(Vector2(vp.x * 0.5 - 16, cy + 54), Vector2(32, 32)), false, Color(0.85, 0.9, 1.0, a))
	var s := 1.08 - 0.08 * (1.0 - pow(1.0 - clampf(t / 1.2, 0.0, 1.0), 3.0))
	draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(vp.x * 0.5 - 360, cy - 120), Vector2(720, 200)), false, Color(0.4, 0.5, 1.0, 0.22 * a))
	_text_center(ThemeFactory.font("display_bold"), str(e["text"]), int(112 * s), Vector2(vp.x * 0.5, cy - 14), Color(0.84, 0.88, 1.0, a), 12, Color(0.02, 0.03, 0.12, 0.9 * a), 14.0)
	var sa := a * clampf((t - 0.4) / 0.4, 0.0, 1.0)
	_text_center(ThemeFactory.font("display"), str(e["sub"]), 36, Vector2(vp.x * 0.5, cy + 112), Color(1.0, 0.84, 0.58, sa), 8, Color(0.02, 0.02, 0.06, 0.9 * sa))


func _draw_survived(e: Dictionary, vp: Vector2) -> void:
	var t := float(e["t"])
	var a := _env(t, float(e["dur"]), 0.6, 0.9)
	var cy := vp.y * 0.32
	_band(cy, 260.0, 0.5 * a, Color(0.12, 0.06, 0.02), vp)
	# Rising sun with rotating rays behind the text
	var rise := 1.0 - pow(1.0 - clampf(t / 1.6, 0.0, 1.0), 3.0)
	var sc := Vector2(vp.x * 0.5, cy - 40 - 60 * rise)
	var rays := 14
	for i in rays:
		var ang := TAU * float(i) / rays + t * 0.25
		var p0 := sc + Vector2(cos(ang), sin(ang)) * 70.0
		var p1 := sc + Vector2(cos(ang - 0.08), sin(ang - 0.08)) * 260.0
		var p2 := sc + Vector2(cos(ang + 0.08), sin(ang + 0.08)) * 260.0
		draw_polygon(PackedVector2Array([p0, p1, p2]), PackedColorArray([Color(1, 0.85, 0.4, 0.28 * a), Color(1, 0.7, 0.3, 0.0), Color(1, 0.7, 0.3, 0.0)]))
	draw_texture_rect(ThemeFactory.glow_texture(), Rect2(sc - Vector2(150, 150), Vector2(300, 300)), false, Color(1, 0.8, 0.4, 0.5 * a))
	var sun := ThemeFactory.icon("ui_sun")
	if sun:
		draw_texture_rect(sun, Rect2(sc - Vector2(56, 56), Vector2(112, 112)), false, Color(1, 1, 1, a))
	var s := 1.0 + 0.1 * sin(clampf(t / 0.5, 0.0, 1.0) * PI)
	_text_center(ThemeFactory.font("display_bold"), str(e["text"]), int(76 * s), Vector2(vp.x * 0.5, cy + 60), Color(1.0, 0.86, 0.42, a), 10, Color(0.2, 0.08, 0.0, 0.9 * a))
	_text_center(ThemeFactory.font("display"), str(e["sub"]), 32, Vector2(vp.x * 0.5, cy + 122), Color(1, 0.96, 0.88, a * clampf((t - 0.5) / 0.5, 0.0, 1.0)), 7, Color(0, 0, 0, 0.8 * a))
	# Sparkles
	var star_tex := ThemeFactory.icon("ui_star")
	if star_tex:
		for i in 8:
			var ang2 := TAU * float(i) / 8.0 + 0.4
			var d := 330.0 + 40.0 * sin(t * 2.0 + i)
			var p := Vector2(vp.x * 0.5, cy + 70) + Vector2(cos(ang2) * d * 1.45, sin(ang2) * d * 0.42)
			var ss := 22.0 + 10.0 * sin(t * 4.0 + i * 1.3)
			draw_texture_rect(star_tex, Rect2(p - Vector2(ss, ss) * 0.5, Vector2(ss, ss)), false, Color(1, 1, 1, a * 0.85))
