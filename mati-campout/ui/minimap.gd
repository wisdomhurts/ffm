class_name Minimap
extends Control
## The round HUD map (appears once the Campfire Map is crafted): a tiny live
## map around the player (north up) with the player arrow, nearby chests and
## places (they fade while the campfire's beacon is dark) and Home Camp - on
## the rim, pointing home, when it is out of view. Click / tap it (or press
## M) to open the big map.
##
## Added by the HUD; desktop: bottom-left corner, touch layout: under the
## clock on the right (shrinks to fit above the touch buttons).

## Metres from the centre to the rim.
const RANGE_M := 75.0
const DIAMETER := 184.0

var hud: Node = null
var _shown := 0.0
var _pop := 0.0
var _hover := false
var _press_ms := 0
var _beacon := 1.0
var _t := 0.0
var _d := DIAMETER
var _key: KeyCap = null
var _markers: Array = []
var _markers_t := 0.0


func _init() -> void:
	name = "Minimap"
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_NONE
	tooltip_text = "Open the map"


func _ready() -> void:
	size = Vector2(DIAMETER, DIAMETER + 40.0)
	_key = KeyCap.new("map", "", 32)
	add_child(_key)
	_beacon = 1.0 if MapUI.beacon_lit() else 0.0
	_shown = 1.0 if _has_map() else 0.0
	visible = _shown > 0.0
	Events.map_unlocked.connect(_on_unlocked)
	mouse_entered.connect(func() -> void: _hover = true)
	mouse_exited.connect(func() -> void: _hover = false)


func _has_map() -> bool:
	return bool(GameState.flags.get("has_map", false))


func _on_unlocked() -> void:
	_pop = 1.0
	_shown = 0.0
	visible = true


func _has_point(p: Vector2) -> bool:
	if _shown < 0.5:
		return false
	return p.distance_to(Vector2(_d, _d) * 0.5) <= _d * 0.5 + 8.0


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if (event as InputEventScreenTouch).pressed:
			_open()
		accept_event()
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			_open()
		accept_event()


func _open() -> void:
	var now := Time.get_ticks_msec()
	if now - _press_ms < 400 or not _has_map() or GameState.ui_blocking:
		return
	_press_ms = now
	Audio.play_ui("ui_click")
	if hud and is_instance_valid(hud) and hud.has_method("open_modal"):
		hud.call("open_modal", "map")
	else:
		Events.request_modal.emit("map", {})


func _process(delta: float) -> void:
	_t += delta
	var want := _has_map() and GameState.state != GameState.RunState.DEAD
	_shown = move_toward(_shown, 1.0 if want else 0.0, delta * 3.0)
	_pop = maxf(_pop - delta * 0.8, 0.0)
	visible = _shown > 0.001
	if not visible:
		return
	_beacon = move_toward(_beacon, 1.0 if MapUI.beacon_lit() else 0.0, delta * 1.2)
	_markers_t -= delta
	if _markers_t <= 0.0:
		_markers_t = 0.25
		_markers = MapUI.collect_markers(get_tree())
	_layout()
	queue_redraw()


func _layout() -> void:
	var vp := get_parent_area_size()
	var touch_on := hud != null and is_instance_valid(hud) and hud.get("touch") != null and Platform.is_touch()
	_d = DIAMETER
	if touch_on:
		var clock: Control = hud.get("clock")
		var top := 210.0
		var right := vp.x - 26.0
		if clock and is_instance_valid(clock):
			top = clock.position.y + ClockWidget.SIZE.y * clock.scale.y + 14.0
			right = clock.position.x + ClockWidget.SIZE.x * clock.scale.x
		var bottom := vp.y - 300.0
		var tc: Variant = hud.get("touch")
		if tc is Node and (tc as Node).has_method("cluster_top"):
			bottom = float((tc as Node).call("cluster_top")) - 16.0
		_d = clampf(bottom - top, 112.0, DIAMETER)
		position = Vector2(right - _d, top)
		_key.visible = false
	else:
		var y := vp.y - 26.0 - _d - 40.0
		if bool(Settings.get_value("show_fps")):
			y -= 30.0
		position = Vector2(26.0, y)
		_key.visible = true
		_key.position = Vector2(_d * 0.5 - 50.0, _d + 4.0)
	size = Vector2(_d, _d + 40.0)
	var s := _ease_back(_shown) * (1.0 + 0.12 * sin(_pop * PI * 3.0) * _pop)
	pivot_offset = Vector2(_d, _d) * 0.5
	scale = Vector2(s, s)
	modulate.a = clampf(_shown * 1.4, 0.0, 1.0)


static func _ease_back(x: float) -> float:
	var c1 := 1.5
	var c3 := c1 + 1.0
	var y := x - 1.0
	return 1.0 + c3 * y * y * y + c1 * y * y


func _draw() -> void:
	var r := _d * 0.5
	var c := Vector2(r, r)
	var rim := 9.0
	var inner := r - rim
	var pl := GameState.player
	var pp := Vector3.ZERO
	if pl and is_instance_valid(pl) and pl.is_inside_tree():
		pp = pl.global_position
	var k := inner / RANGE_M
	# Shadow + glow when freshly unlocked or hovered.
	draw_circle(c + Vector2(0, 4), r + 2.0, Color(0, 0, 0, 0.35), true, -1.0, true)
	if _pop > 0.0 or _hover:
		var g := maxf(_pop, 0.5 if _hover else 0.0)
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(c - Vector2(r, r) * 1.6, Vector2(r, r) * 3.2), false, Color(1.0, 0.8, 0.4, 0.55 * g))
	# The map disc: a textured polygon sampling the painted map around the player.
	var tex := MapUI.map_texture()
	var pts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var cols := PackedColorArray()
	var n := 40
	var half := WorldGen.HALF * 2.0
	for i in n:
		var a := TAU * float(i) / n
		var d := Vector2(cos(a), sin(a))
		pts.append(c + d * inner)
		var w := Vector2(pp.x, pp.z) + d * RANGE_M
		uvs.append(Vector2((w.x + WorldGen.HALF) / half, (w.y + WorldGen.HALF) / half))
		cols.append(Color.WHITE)
	if tex:
		draw_polygon(pts, cols, uvs, tex)
	else:
		draw_colored_polygon(pts, MapUI.PAPER)
	# Night: the paper darkens a little so the HUD does not glare.
	var dark := GameState.day_cycle.darkness()
	if dark > 0.01:
		draw_colored_polygon(pts, Color(0.05, 0.07, 0.16, 0.3 * dark))
	if _beacon < 0.99:
		draw_colored_polygon(pts, Color(0.06, 0.08, 0.2, 0.3 * (1.0 - _beacon)))
	# Markers within range.
	var home := MapUI.home_pos()
	for m in _markers:
		var kind := str(m.get("kind", ""))
		if kind == "camp":
			continue
		var a := _beacon if bool(m.get("important", false)) else 1.0
		if a <= 0.02:
			continue
		var wp: Vector3 = m["pos"]
		var off := Vector2(wp.x - pp.x, wp.z - pp.z) * k
		if off.length() > inner - 10.0:
			continue
		MapUI.draw_badge(self, c + off, kind, str(m.get("tier", "")), bool(m.get("opened", false)), 0.62, a, (1.0 - _beacon) * 4.0, str(m.get("label", "")))
	# Home: inside, or on the rim pointing home.
	var ho := Vector2(home.x - pp.x, home.z - pp.z) * k
	if ho.length() <= inner - 12.0:
		MapUI.draw_badge(self, c + ho, "camp", "", false, 0.7)
	else:
		var dir := ho.normalized()
		var hp := c + dir * (inner - 14.0)
		MapUI.draw_badge(self, hp, "camp", "", false, 0.62)
		var tip := c + dir * (inner + 2.0)
		var s := Vector2(-dir.y, dir.x)
		draw_colored_polygon(PackedVector2Array([tip + dir * 7.0, tip - s * 7.0, tip + s * 7.0]), Color(0.95, 0.5, 0.18))
	# Player arrow at the centre.
	MapUI.draw_player_arrow(self, c, MapUI.player_heading(), 12.0, 1.0, true)
	# Rim: carved wood ring with a brass edge and N marker.
	draw_arc(c, r - rim * 0.5, 0.0, TAU, 64, Color(0.33, 0.21, 0.12), rim, true)
	draw_arc(c, r - 1.0, 0.0, TAU, 64, Color(0.86, 0.62, 0.26), 2.0, true)
	draw_arc(c, inner, 0.0, TAU, 64, Color(0.86, 0.62, 0.26, 0.8), 2.0, true)
	var n_pos := c + Vector2(0, -r + rim * 0.5)
	draw_circle(n_pos, 12.0, Color(0.55, 0.36, 0.12), true, -1.0, true)
	draw_circle(n_pos, 10.0, Color(0.95, 0.75, 0.32), true, -1.0, true)
	var f := ThemeFactory.font("display_bold")
	var ts := f.get_string_size("N", HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
	draw_string(f, n_pos + Vector2(-ts.x * 0.5, ts.y * 0.32), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.45, 0.15, 0.08))
	# Beacon dark: a dim flame icon at the bottom of the rim.
	if _beacon < 0.99:
		var ic := ThemeFactory.icon("ui_fire")
		if ic:
			var bp := c + Vector2(0, r - rim * 0.5)
			draw_circle(bp, 13.0, Color(0.1, 0.1, 0.16, 0.9 * (1.0 - _beacon)), true, -1.0, true)
			draw_texture_rect(ic, Rect2(bp - Vector2(10, 10), Vector2(20, 20)), false, Color(0.5, 0.5, 0.6, 1.0 - _beacon))
