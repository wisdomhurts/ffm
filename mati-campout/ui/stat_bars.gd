class_name StatBars
extends Control
## Top-left survival panel: Health, Food and Warmth bars with icons.
##
## - Smoothly animated fill plus a pale "recent loss" trail.
## - Warmth shows a trend arrow (warming / cooling) from survival.warmth_target
##   and swaps to a snowflake when freezing.
## - Critical bars pulse and get diagonal stripes so the warning never relies
##   on colour alone.

const ROW_H := 50.0
const BAR_X := 74.0
const BAR_W := 318.0
const BAR_H := 30.0
const PAD := 18.0

var _shown := [1.0, 1.0, 1.0]
var _trail := [1.0, 1.0, 1.0]
var _hit := [0.0, 0.0, 0.0]
var _last := [-1.0, -1.0, -1.0]


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(BAR_X + BAR_W + PAD + 40, PAD * 2 + ROW_H * 3 - 8)
	size = custom_minimum_size


func _values() -> Array:
	var s := GameState.survival
	return [
		clampf(s.health / maxf(s.max_health, 1.0), 0.0, 1.0),
		clampf(s.hunger / maxf(s.max_hunger, 1.0), 0.0, 1.0),
		clampf(s.warmth / maxf(s.max_warmth, 1.0), 0.0, 1.0),
	]


func _process(delta: float) -> void:
	var v := _values()
	for i in 3:
		var target: float = v[i]
		if _last[i] >= 0.0 and target < float(_last[i]) - 0.004:
			_hit[i] = 1.0
		_last[i] = target
		_shown[i] = lerpf(float(_shown[i]), target, clampf(delta * 10.0, 0.0, 1.0))
		if float(_trail[i]) < target:
			_trail[i] = target
		else:
			_trail[i] = move_toward(float(_trail[i]), target, delta * 0.25)
		_hit[i] = maxf(float(_hit[i]) - delta * 2.5, 0.0)
	queue_redraw()


func _draw() -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var s := GameState.survival
	var panel := ThemeFactory.cached_panel(20, 0.9)
	draw_style_box(panel, Rect2(Vector2.ZERO, size))
	var names := ["Health", "Food", "Warmth"]
	var icons := ["ui_heart", "ui_hunger", "ui_warmth"]
	var kinds := ["health", "hunger", "warmth"]
	var freezing := s.warmth < float(s.cfg.get("freezing_threshold", 18.0))
	var critical := [float(_shown[0]) < 0.25, float(_shown[1]) < 0.2, freezing]
	var f := ThemeFactory.font("body_bold")
	var fnum := ThemeFactory.font("display")
	for i in 3:
		var y := PAD + i * ROW_H
		var crit: bool = critical[i]
		var pulse := 0.5 + 0.5 * sin(t * (7.0 if crit else 0.0))
		# Icon
		var icon_id: String = icons[i]
		if i == 2 and freezing:
			icon_id = "ui_snowflake"
		var tex := ThemeFactory.icon(icon_id)
		var isz := 48.0 + (6.0 * pulse if crit else 0.0) + float(_hit[i]) * 6.0
		var ic := Vector2(PAD + 22, y + BAR_H * 0.5)
		if crit:
			var glow_col := Color(1, 0.25, 0.15, 0.55 * pulse) if i != 2 else Color(0.5, 0.8, 1.0, 0.6 * pulse)
			draw_texture_rect(ThemeFactory.glow_texture(), Rect2(ic - Vector2(44, 44), Vector2(88, 88)), false, glow_col)
		if tex:
			draw_texture_rect(tex, Rect2(ic - Vector2(isz, isz) * 0.5, Vector2(isz, isz)), false)
		# Track
		var r := Rect2(Vector2(BAR_X, y), Vector2(BAR_W, BAR_H))
		var track := ThemeFactory.flat(Color(0.0, 0.02, 0.01, 0.6), int(BAR_H * 0.5))
		track.set_border_width_all(2)
		track.border_color = Color(1, 1, 1, 0.07) if not crit else Color(1, 0.35, 0.25, 0.35 + 0.4 * pulse)
		if i == 2 and freezing:
			track.border_color = Color(0.6, 0.85, 1.0, 0.4 + 0.4 * pulse)
		draw_style_box(track, r)
		var inner := r.grow(-3.0)
		var frac: float = _shown[i]
		var trail: float = _trail[i]
		var cols: Array = ThemeFactory.bar_colors(kinds[i])
		if i == 2:
			# Warmth slides from cold blue to warm amber.
			var cold: Array = ThemeFactory.bar_colors("cold")
			var k := clampf((frac - 0.15) / 0.45, 0.0, 1.0)
			cols = [(cold[0] as Color).lerp(cols[0], k), (cold[1] as Color).lerp(cols[1], k)]
		# Recent-loss trail
		if trail > frac + 0.002:
			var tr := Rect2(inner.position + Vector2(inner.size.x * frac, 0), Vector2(inner.size.x * (trail - frac), inner.size.y))
			draw_style_box(ThemeFactory.flat(Color(1, 0.92, 0.8, 0.55), 4), tr)
		if frac > 0.003:
			_draw_fill(Rect2(inner.position, Vector2(maxf(inner.size.x * frac, inner.size.y), inner.size.y)), cols[0], cols[1], crit, t)
		if float(_hit[i]) > 0.0 and not ThemeFactory.reduce_flashing():
			draw_style_box(ThemeFactory.flat(Color(1, 1, 1, float(_hit[i]) * 0.35), int(BAR_H * 0.5)), r)
		# Text inside the bar
		var label: String = names[i]
		var lp := Vector2(BAR_X + 14, y + BAR_H * 0.5 + 7)
		draw_string_outline(f, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, 5, Color(0.05, 0.03, 0.02, 0.85))
		draw_string(f, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color("fff8ea"))
		var vals := [s.health, s.hunger, s.warmth]
		var num := str(int(ceil(float(vals[i]))))
		var nw := fnum.get_string_size(num, HORIZONTAL_ALIGNMENT_LEFT, -1, 21).x
		var np := Vector2(BAR_X + BAR_W - 14 - nw, y + BAR_H * 0.5 + 8)
		draw_string_outline(fnum, np, num, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, 5, Color(0.05, 0.03, 0.02, 0.85))
		draw_string(fnum, np, num, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, Color("fff8ea"))
		# Warmth trend arrow
		if i == 2:
			var diff := s.warmth_target - s.warmth
			var ax := BAR_X + BAR_W + 22.0
			var ay := y + BAR_H * 0.5
			if absf(diff) > 1.0:
				var up := diff > 0.0
				var bob := sin(t * 5.0) * 2.5
				var col := Color("ffb347") if up else Color("8fc4ff")
				var pts: PackedVector2Array
				if up:
					pts = PackedVector2Array([Vector2(ax, ay - 13 + bob), Vector2(ax + 12, ay + 3 + bob), Vector2(ax + 4, ay + 3 + bob), Vector2(ax + 4, ay + 12 + bob), Vector2(ax - 4, ay + 12 + bob), Vector2(ax - 4, ay + 3 + bob), Vector2(ax - 12, ay + 3 + bob)])
				else:
					pts = PackedVector2Array([Vector2(ax, ay + 13 - bob), Vector2(ax - 12, ay - 3 - bob), Vector2(ax - 4, ay - 3 - bob), Vector2(ax - 4, ay - 12 - bob), Vector2(ax + 4, ay - 12 - bob), Vector2(ax + 4, ay - 3 - bob), Vector2(ax + 12, ay - 3 - bob)])
				var shadow := PackedVector2Array()
				for p in pts:
					shadow.append(p + Vector2(0, 2))
				draw_colored_polygon(shadow, Color(0, 0, 0, 0.5))
				draw_colored_polygon(pts, col)
			else:
				draw_circle(Vector2(ax, ay), 5.0, Color(1, 1, 1, 0.35))


func _draw_fill(r: Rect2, a: Color, b: Color, striped: bool, t: float) -> void:
	# Horizontal gradient via a coloured polygon, clipped to a rounded shape by
	# drawing it as a rounded StyleBox first and the gradient as a soft sheen.
	var sb := ThemeFactory.flat(a, int(r.size.y * 0.5))
	draw_style_box(sb, r)
	var steps := 10
	var rad := r.size.y * 0.5
	var x0 := r.position.x + rad
	var x1 := r.end.x - rad
	if x1 > x0:
		for k in steps:
			var u0 := float(k) / steps
			var u1 := float(k + 1) / steps
			var c0 := a.lerp(b, u0)
			var c1 := a.lerp(b, u1)
			var px0 := lerpf(x0, x1, u0)
			var px1 := lerpf(x0, x1, u1)
			draw_polygon(PackedVector2Array([Vector2(px0, r.position.y), Vector2(px1, r.position.y), Vector2(px1, r.end.y), Vector2(px0, r.end.y)]),
				PackedColorArray([c0, c1, c1, c0]))
		draw_circle(Vector2(x1, r.get_center().y), rad, b)
	# Top sheen
	var sheen := ThemeFactory.flat(Color(1, 1, 1, 0.22), int(r.size.y * 0.3))
	draw_style_box(sheen, Rect2(r.position + Vector2(rad * 0.5, 2), Vector2(maxf(r.size.x - rad, 2.0), r.size.y * 0.36)))
	if striped:
		var off := fmod(t * 30.0, 16.0)
		var x := r.position.x - 16.0 + off
		while x < r.end.x:
			var p0 := Vector2(maxf(x, r.position.x + 2), r.end.y - 2)
			var p1 := Vector2(minf(x + 10.0, r.end.x - 2), r.position.y + 2)
			if p1.x > p0.x:
				draw_line(p0, p1, Color(0, 0, 0, 0.25), 4.0, true)
			x += 16.0
