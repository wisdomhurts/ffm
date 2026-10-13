class_name FireWidget
extends Control
## Top-centre campfire status: flame icon, fuel gauge and "Strong" / "Low" /
## "OUT!". It grows prominent near camp, at dusk/night and whenever the fire is
## low or out, and pulses red when low. Below it, a home compass (arrow + metres)
## appears when the player is far from camp at dusk or night.

const FULL := Vector2(470, 104)
const COMPACT := Vector2(300, 64)
const COMPASS_DIST := 35.0

var _expand := 1.0
var _compass := 0.0
var _fuel_shown := 1.0
var _bump := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Events.fire_fed.connect(func(_id: String) -> void: _bump = 1.0)
	Events.fire_relit.connect(func() -> void: _bump = 1.0)


func _camp_pos() -> Vector3:
	if GameState.campfire and is_instance_valid(GameState.campfire):
		return GameState.campfire.global_position
	if GameState.camp and is_instance_valid(GameState.camp):
		return GameState.camp.global_position
	return Vector3.ZERO


func _player_dist() -> float:
	var p := GameState.player
	if p == null or not is_instance_valid(p):
		return 0.0
	var d := p.global_position - _camp_pos()
	d.y = 0.0
	return d.length()


func want_prominent() -> bool:
	var fire := GameState.fire
	var dc := GameState.day_cycle
	if fire.state() != FireModel.State.STRONG:
		return true
	if dc.phase == DayCycle.Phase.DUSK or dc.phase == DayCycle.Phase.NIGHT:
		return true
	return _player_dist() < 22.0


func want_compass() -> bool:
	var dc := GameState.day_cycle
	var dark := dc.phase == DayCycle.Phase.DUSK or dc.phase == DayCycle.Phase.NIGHT or (dc.phase == DayCycle.Phase.DAWN and dc.phase_progress() < 0.4)
	return dark and GameState.player != null and _player_dist() > COMPASS_DIST


func _process(delta: float) -> void:
	_expand = move_toward(_expand, 1.0 if want_prominent() else 0.0, delta * 3.0)
	_compass = move_toward(_compass, 1.0 if want_compass() else 0.0, delta * 3.0)
	_fuel_shown = lerpf(_fuel_shown, GameState.fire.fraction(), clampf(delta * 6.0, 0.0, 1.0))
	_bump = maxf(_bump - delta * 2.5, 0.0)
	var e := _ease(_expand)
	var sz := COMPACT.lerp(FULL, e)
	size = Vector2(sz.x, sz.y + 96.0 * _compass)
	var vp := get_parent_area_size()
	position = Vector2((vp.x - sz.x * scale.x) * 0.5, 22.0)
	queue_redraw()


static func _ease(x: float) -> float:
	return x * x * (3.0 - 2.0 * x)


func _draw() -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var fire := GameState.fire
	var st := fire.state()
	var e := _ease(_expand)
	var box := COMPACT.lerp(FULL, e)
	var r := Rect2(Vector2.ZERO, box)
	var low := st == FireModel.State.LOW
	var out := st == FireModel.State.OUT
	var calm := ThemeFactory.reduce_flashing()
	var pulse := 0.5 + 0.5 * sin(t * (5.0 if low else 8.0))
	if calm:
		pulse = 0.5 + 0.2 * sin(t * 2.0)
	# Panel
	var sb := ThemeFactory.panel_style(int(lerpf(18, 24, e)), 0.92)
	if low or out:
		var warn := ThemeFactory.DANGER if out else ThemeFactory.BAD
		sb.border_color = Color(warn.r, warn.g, warn.b, 0.45 + 0.5 * pulse)
		sb.set_border_width_all(3)
		sb.shadow_color = Color(warn.r, warn.g * 0.5, 0.0, 0.25 + 0.3 * pulse)
		sb.shadow_size = 18
	draw_style_box(sb, r)
	# Flame icon with flicker (dark ember when out)
	var isz := lerpf(48.0, 78.0, e) * (1.0 + 0.12 * sin(_bump * PI))
	var flick := 1.0 + 0.05 * sin(t * 13.0) + 0.03 * sin(t * 21.7)
	var ic := Vector2(lerpf(34.0, 54.0, e), box.y * 0.5)
	if not out:
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(ic - Vector2(isz, isz) * 0.95, Vector2(isz, isz) * 1.9), false,
			Color(1.0, 0.6, 0.2, 0.35 * fire.strength() + 0.15))
	var tex := ThemeFactory.icon("ui_fire")
	if tex:
		var fsz := Vector2(isz, isz * (flick if not out else 1.0))
		var tint := Color.WHITE if not out else Color(0.35, 0.33, 0.4, 0.95)
		draw_texture_rect(tex, Rect2(ic - Vector2(fsz.x * 0.5, fsz.y * 0.55), fsz), false, tint)
	# Texts
	var fdisp := ThemeFactory.font("display")
	var fbody := ThemeFactory.font("body_bold")
	var state_txt := "Strong"
	var state_col := ThemeFactory.GOLD
	if low:
		state_txt = "Low"
		state_col = ThemeFactory.BAD.lerp(Color("ffd0a0"), pulse * 0.4)
	elif out:
		state_txt = "OUT!"
		state_col = ThemeFactory.DANGER.lerp(Color("ffe0d0"), pulse * (0.15 if calm else 0.45))
	var gx := lerpf(70.0, 108.0, e)
	var gw := box.x - gx - lerpf(16.0, 22.0, e)
	var title_fs := int(lerpf(0.0, 19.0, e))
	if e > 0.35:
		var a := clampf((e - 0.35) / 0.4, 0.0, 1.0)
		var title := "CAMPFIRE"
		if fire.level > 1:
			title = "CAMPFIRE  Lv %d" % fire.level
		draw_string(fbody, Vector2(gx, 32), title, HORIZONTAL_ALIGNMENT_LEFT, -1, title_fs, Color(ThemeFactory.text_dim(), a))
	var sfs := int(lerpf(24.0, 32.0, e))
	var sw := fdisp.get_string_size(state_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs).x
	var sy := lerpf(box.y * 0.5 - 2.0, 40.0, e)
	var spos := Vector2(box.x - lerpf(16.0, 22.0, e) - sw, sy + sfs * 0.35)
	draw_string_outline(fdisp, spos, state_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, 6, Color(0.05, 0.02, 0.0, 0.85))
	draw_string(fdisp, spos, state_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, state_col)
	# Fuel gauge
	var gh := lerpf(16.0, 24.0, e)
	var gy := lerpf(box.y * 0.5 - gh * 0.5, box.y - gh - 20.0, e)
	if e < 0.5:
		gw -= sw + 14.0
	var gr := Rect2(Vector2(gx, gy), Vector2(maxf(gw, 40.0), gh))
	var track := ThemeFactory.flat(Color(0, 0.02, 0.01, 0.6), int(gh * 0.5))
	track.set_border_width_all(2)
	track.border_color = Color(1, 1, 1, 0.08)
	draw_style_box(track, gr)
	var inner := gr.grow(-3.0)
	var frac := clampf(_fuel_shown, 0.0, 1.0)
	if frac > 0.004 and not out:
		var cols := ThemeFactory.bar_colors("fire")
		var c0: Color = cols[0]
		var c1: Color = cols[1]
		if low:
			c0 = c0.lerp(ThemeFactory.DANGER, 0.5 + 0.4 * pulse)
			c1 = c1.lerp(ThemeFactory.BAD, 0.6)
		var fr := Rect2(inner.position, Vector2(maxf(inner.size.x * frac, inner.size.y), inner.size.y))
		draw_style_box(ThemeFactory.flat(c0, int(inner.size.y * 0.5)), fr)
		var hi := Rect2(fr.position + Vector2(fr.size.y * 0.3, 0), Vector2(maxf(fr.size.x - fr.size.y * 0.6, 1.0), fr.size.y))
		draw_polygon(PackedVector2Array([hi.position, Vector2(hi.end.x, hi.position.y), hi.end, Vector2(hi.position.x, hi.end.y)]),
			PackedColorArray([c0, c1, c1, c0]))
		draw_style_box(ThemeFactory.flat(Color(1, 1, 1, 0.22), int(inner.size.y * 0.3)), Rect2(fr.position + Vector2(4, 2), Vector2(maxf(fr.size.x - 8, 1), fr.size.y * 0.36)))
		# Low marker
		var lx := inner.position.x + inner.size.x * fire.low_fraction
		draw_line(Vector2(lx, gr.position.y + 2), Vector2(lx, gr.end.y - 2), Color(1, 1, 1, 0.35), 2.0)
	elif out and e > 0.3:
		var hint := "Relight: Kindling + Wood"
		var hfs := int(lerpf(14.0, 18.0, e))
		var hw := fbody.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hfs).x
		draw_string(fbody, Vector2(gr.get_center().x - hw * 0.5, gr.get_center().y + hfs * 0.35), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hfs, Color(1, 0.85, 0.75, 0.9))
	if _compass > 0.01:
		_draw_compass(Vector2(box.x * 0.5, box.y + 50.0), _ease(_compass), t)


func _draw_compass(c: Vector2, a: float, t: float) -> void:
	var p := GameState.player
	if p == null or not is_instance_valid(p):
		return
	var to_camp := _camp_pos() - p.global_position
	to_camp.y = 0.0
	var dist := to_camp.length()
	var cam: Camera3D = get_viewport().get_camera_3d()
	var fwd := Vector3(0, 0, -1)
	if cam:
		fwd = -cam.global_transform.basis.z
	fwd.y = 0.0
	if fwd.length() < 0.01:
		fwd = Vector3(0, 0, -1)
	fwd = fwd.normalized()
	var dir := to_camp.normalized() if dist > 0.01 else fwd
	var angle := atan2(fwd.x * dir.z - fwd.z * dir.x, fwd.x * dir.x + fwd.z * dir.z)
	# Pill
	var f := ThemeFactory.font("display")
	var txt := "Camp  " + UIKit.distance_text(dist)
	var fs := 24
	var tw := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var w := 78.0 + tw + 22.0
	var pr := Rect2(c - Vector2(w * 0.5, 34), Vector2(w, 68))
	var sb := ThemeFactory.panel_style(34, 0.95)
	sb.border_color = Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, 0.5 + 0.3 * sin(t * 3.0))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var col_a := Color(1, 1, 1, a)
	draw_style_box(sb, pr)
	var ac := Vector2(pr.position.x + 40, c.y)
	draw_circle(ac, 26.0, Color(0, 0, 0, 0.35 * a))
	var tex := ThemeFactory.icon("ui_home_arrow")
	draw_set_transform(ac, angle, Vector2.ONE)
	if tex:
		draw_texture_rect(tex, Rect2(Vector2(-24, -26), Vector2(48, 48)), false, col_a)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	draw_string_outline(f, Vector2(pr.position.x + 76, c.y + 9), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0, 0, 0, 0.8 * a))
	draw_string(f, Vector2(pr.position.x + 76, c.y + 9), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(ThemeFactory.text_color(), a))
