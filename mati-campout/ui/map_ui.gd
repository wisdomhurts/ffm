class_name MapUI
extends UIModal
## The Campfire Map window (M / gamepad Y, the HUD minimap or the touch Map
## button; Esc / M / B close it). Opened by the HUD as modal "map".
##
## A painted parchment map (Terrain.get_map_image, else
## WorldGen.render_map_image) in a carved wooden frame with a compass rose,
## scale bar and a legend: the player arrow (turns with the view), Home
## Camp, discovered chests (opened ones greyed), landmarks, traders and the
## pet - every Node3D in group "map_marker" with get_map_marker() ->
## {kind, label, important, discovered, [pos], [tier], [opened]} - plus the
## WorldGen landmarks the player has seen (until a Landmarks system provides
## its own markers there) and geography labels (lake, ridge, meadow, grove).
##
## The map is linked to the campfire's beacon: while GameState.fire is OUT
## every "important" marker fades and blurs away and a note reads "The
## beacon is dark... relight your campfire to see your markers." (geography,
## Home Camp and the player arrow stay). They come back when it is relit.
##
## Pan / zoom: mouse wheel + drag, pinch + drag on touch, trackpad gestures,
## left stick / WASD to pan, right stick / LB RB / + - to zoom, "Find me" and
## "Home" buttons. Does not pause the game (like the crafting crate).

const MAP_PX := 512
## Metres across the view at the closest zoom.
const MIN_SPAN := 130.0
const NO_MAP_HINT := "No map yet! Craft a Campfire Map at the crafting crate."
const BEACON_NOTE := "The beacon is dark... relight your campfire to see your markers."
const INK := Color(0.29, 0.2, 0.13)
const PAPER := Color(0.9, 0.84, 0.69)
const TIER_RING := {"common": Color(0.55, 0.36, 0.18), "rare": Color(0.3, 0.5, 0.82), "epic": Color(0.93, 0.68, 0.16)}
## WorldGen landmark kind -> map marker kind (fallback markers).
const LANDMARK_KINDS := {"lighthouse": "landmark", "ruin": "landmark", "trader": "trader", "hidden": "landmark"}
const GEO_LABELS := ["lake", "ridge", "meadow", "elder_grove"]

static var _tex: ImageTexture = null
static var _tex_key := ""
## Last view (centre, zoom) in this run, restored on re-open.
static var _last_view: Dictionary = {}

var view: MapView = null
var _stats: Label = null
var _beacon_row: HBoxContainer = null
var _beacon_label: Label = null
var _beacon_icon: TextureRect = null
var _last_lit: Variant = null


func _ready() -> void:
	close_actions = ["map"]
	pauses_game = false
	var avail := avail_size()
	# Phones (short screens): a compact legend so the map can stay big.
	var compact := avail.y < 820.0
	var legend_w := 370.0 if compact else 440.0
	var side := clampf(minf(avail.y - (200.0 if compact else 236.0), avail.x - legend_w - 120.0), 340.0, 840.0)
	build_frame("Campfire Map", Vector2(side + legend_w + 60.0, side + 110.0), "ui_map", 0.62)
	var row := UIKit.hbox(24 if not compact else 18)
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(row)
	view = MapView.new()
	view.custom_minimum_size = Vector2(side, side)
	# Keep the map square even when the legend column is taller.
	view.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(view)
	row.add_child(_build_legend(compact, legend_w))


func open(args: Dictionary) -> void:
	if not bool(GameState.flags.get("has_map", false)) and not bool(args.get("force", false)):
		Events.notify.emit(NO_MAP_HINT, "info")
		close.call_deferred()
		return
	if args.has("zoom") or args.has("center"):
		view.set_view(args.get("center", Vector2.ZERO), float(args.get("zoom", 1.0)))
	elif not _last_view.is_empty() and int(_last_view.get("seed", -1)) == GameState.seed:
		view.set_view(_last_view["center"], float(_last_view["zoom"]))
	else:
		view.reset_view.call_deferred()
	_refresh_legend()


func close() -> void:
	if view and view.is_inside_tree():
		_last_view = {"center": view.center, "zoom": view.zoom_rel(), "seed": GameState.seed}
	super.close()


func _process(_delta: float) -> void:
	if view == null:
		return
	_refresh_legend()


func _input(event: InputEvent) -> void:
	super._input(event)
	if _closing or not is_top() or view == null:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and not event.is_echo():
		var k := (event as InputEventKey).keycode
		if k == KEY_EQUAL or k == KEY_PLUS or k == KEY_KP_ADD:
			view.zoom_step(1)
			get_viewport().set_input_as_handled()
		elif k == KEY_MINUS or k == KEY_KP_SUBTRACT:
			view.zoom_step(-1)
			get_viewport().set_input_as_handled()
		elif k == KEY_C or k == KEY_SPACE:
			view.center_on_player()
			get_viewport().set_input_as_handled()
		elif k == KEY_H:
			view.center_on_home()
			get_viewport().set_input_as_handled()


func _on_tab_cycle(dir: int) -> void:
	if view:
		view.zoom_step(dir)


# --- Legend ---------------------------------------------------------------------------

func _build_legend(compact: bool = false, width: float = 440.0) -> Control:
	var fs := 19 if compact else 23
	var col := UIKit.vbox(8 if compact else 10)
	col.custom_minimum_size = Vector2(width, 0)
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var card := PanelContainer.new()
	card.theme_type_variation = "CardPanel"
	var inner := UIKit.vbox(2 if compact else 6)
	card.add_child(inner)
	inner.add_child(UIKit.label("Legend", "HeaderLabel", 24 if compact else 30))
	var rows := [
		["player", "", "You"],
		["camp", "", "Home Camp"],
		["chest", "common", "Chest"],
		["chest", "rare", "Rare Chest"],
		["chest", "epic", "Golden Chest"],
		["chest_open", "common", "Opened chest (refills)"],
		["landmark", "", "Place to explore"],
		["trader", "", "Trader"],
	]
	if _has_kind("pet"):
		rows.append(["pet", "", "Your pet"])
	for r in rows:
		var h := UIKit.hbox(10 if compact else 12)
		var ic := _LegendIcon.new()
		ic.kind = str(r[0])
		ic.tier = str(r[1])
		ic.custom_minimum_size = Vector2(40, 31) if compact else Vector2(44, 40)
		ic.k = 0.8 if compact else 0.95
		h.add_child(ic)
		var l := UIKit.label(str(r[2]), "", fs)
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		h.add_child(l)
		inner.add_child(h)
	col.add_child(card)
	_stats = UIKit.label("", "", fs, ThemeFactory.GOLD)
	col.add_child(_stats)
	_beacon_row = UIKit.hbox(10)
	_beacon_icon = UIKit.icon_rect("ui_fire", 30 if compact else 36)
	_beacon_row.add_child(_beacon_icon)
	_beacon_label = UIKit.wrap_label("", "", width - 60.0)
	_beacon_label.add_theme_font_size_override("font_size", 17 if compact else 21)
	_beacon_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_beacon_row.add_child(_beacon_label)
	col.add_child(_beacon_row)
	col.add_child(UIKit.spacer(0, 0, true))
	var btns := UIKit.hbox(10)
	var bh := 54.0 if compact else 62.0
	var me := UIKit.button("Find me", "", "ui_boot", 0)
	me.custom_minimum_size = Vector2(0, bh)
	me.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	me.pressed.connect(func() -> void: view.center_on_player())
	btns.add_child(me)
	var home := UIKit.button("Home", "", "ui_fire", 0)
	home.custom_minimum_size = Vector2(0, bh)
	home.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	home.pressed.connect(func() -> void: view.center_on_home())
	btns.add_child(home)
	for z in [["+", 1], ["-", -1]]:
		var b := UIKit.button(str(z[0]), "", "", bh)
		b.custom_minimum_size = Vector2(bh, bh)
		var step := int(z[1])
		b.pressed.connect(func() -> void: view.zoom_step(step))
		btns.add_child(b)
	col.add_child(btns)
	var hint := UIKit.wrap_label(_controls_hint(), "SmallLabel", width - 10.0)
	if compact:
		hint.add_theme_font_size_override("font_size", 16)
	col.add_child(hint)
	return col


func _controls_hint() -> String:
	if Platform.is_touch():
		return "Pinch to zoom, drag to look around."
	if Controls.using_gamepad:
		return "Left stick: move the map. LB / RB: zoom. B: close."
	return "Mouse wheel: zoom. Drag: move the map. %s / Esc: close." % Controls.prompt("map")


func _has_kind(kind: String) -> bool:
	if not is_inside_tree():
		return false
	for n in get_tree().get_nodes_in_group("map_marker"):
		if n.has_method("get_map_marker") and str((n.call("get_map_marker") as Dictionary).get("kind", "")) == kind:
			return true
	return false


func _refresh_legend() -> void:
	if _stats == null:
		return
	var found := 0
	var opened := 0
	if is_inside_tree():
		for n in get_tree().get_nodes_in_group("chest"):
			if n is Chest:
				if (n as Chest).discovered and n.is_in_group("map_marker"):
					found += 1
				if (n as Chest).opened:
					opened += 1
	_stats.text = "Chests found: %d   Opened: %d" % [found, opened]
	var lit := beacon_lit()
	if lit == _last_lit:
		return
	_last_lit = lit
	_beacon_label.text = "The beacon is lit: your markers glow on the map." if lit else BEACON_NOTE
	_beacon_label.add_theme_color_override("font_color", ThemeFactory.text_dim() if lit else Color("ffb38a"))
	_beacon_icon.modulate = Color.WHITE if lit else Color(0.45, 0.45, 0.5, 0.8)


# --- Shared helpers (also used by the HUD minimap) ---------------------------------------------

## The painted map texture (cached per world). 1 px ~ 1 m; covers the
## terrain square -HALF..HALF.
static func map_texture() -> Texture2D:
	var gen := GameState.world_gen
	var key := "%d_%d" % [GameState.seed, gen.get_instance_id() if gen else 0]
	if _tex and _tex_key == key:
		return _tex
	var img: Image = null
	var g: Node = GameState.game
	var terrain: Variant = g.get("terrain") if g and is_instance_valid(g) else null
	if terrain is Node and (terrain as Node).has_method("get_map_image"):
		img = (terrain as Node).call("get_map_image", MAP_PX)
	elif gen:
		img = gen.render_map_image(160)
	if img == null:
		img = Image.create(64, 64, false, Image.FORMAT_RGB8)
		img.fill(PAPER)
	_tex = ImageTexture.create_from_image(img)
	_tex_key = key
	return _tex


static func beacon_lit() -> bool:
	return GameState.fire.is_lit()


## Map position (0..1 UV of the painted map) of a world point.
static func world_uv(p: Vector3) -> Vector2:
	return WorldGen.world_to_map_uv(p)


## Every marker to draw: [{kind, label, important, discovered, pos (Vector3),
## tier, opened}], discovered ones only (Home Camp always).
static func collect_markers(tree: SceneTree) -> Array:
	var out: Array = []
	if tree == null:
		return out
	var structure_pts: Array = []
	for n in tree.get_nodes_in_group("map_marker"):
		if not (n is Node3D) or not n.has_method("get_map_marker") or not (n as Node3D).is_inside_tree():
			continue
		var m: Dictionary = n.call("get_map_marker")
		if m.is_empty():
			continue
		var e := m.duplicate()
		if not e.has("pos"):
			e["pos"] = (n as Node3D).global_position
		var kind := str(e.get("kind", ""))
		if kind != "chest" and kind != "camp" and kind != "pet":
			structure_pts.append(e["pos"])
		if not bool(e.get("discovered", true)) and kind != "camp":
			continue
		out.append(e)
	# Fallback: landmarks the player has seen, until a Landmarks system marks them.
	var gen := GameState.world_gen
	if gen:
		var seen: Dictionary = GameState.flags.get("map_seen", {})
		for id in gen.landmarks:
			var lm: Dictionary = gen.landmarks[id]
			var lk := str(lm.get("kind", ""))
			if not LANDMARK_KINDS.has(lk) or not seen.has(id):
				continue
			var p: Vector3 = gen.landmark_pos(id)
			var covered := false
			for sp in structure_pts:
				if Vector2((sp as Vector3).x - p.x, (sp as Vector3).z - p.z).length() < maxf(float(lm["radius"]), 25.0):
					covered = true
					break
			if covered:
				continue
			out.append({"kind": LANDMARK_KINDS[lk], "label": str(lm["name"]), "important": true, "discovered": true, "pos": p, "id": id})
	return out


## Mark WorldGen landmarks within reach of the player as seen (for the
## fallback markers). Called a few times a second by ChestManager.
static func track_landmarks(player_pos: Vector3) -> void:
	var gen := GameState.world_gen
	if gen == null:
		return
	var seen: Dictionary = GameState.flags.get("map_seen", {})
	var changed := false
	for id in gen.landmarks:
		if seen.has(id):
			continue
		var lm: Dictionary = gen.landmarks[id]
		if not LANDMARK_KINDS.has(str(lm.get("kind", ""))):
			continue
		var p: Vector3 = lm["pos"]
		if Vector2(p.x - player_pos.x, p.z - player_pos.z).length() < float(lm["radius"]) + 28.0:
			seen[id] = true
			changed = true
	if changed or not GameState.flags.has("map_seen"):
		GameState.flags["map_seen"] = seen


static func mark_landmark_seen(id: String) -> void:
	var seen: Dictionary = GameState.flags.get("map_seen", {})
	seen[id] = true
	GameState.flags["map_seen"] = seen


static func icon_for(kind: String, label: String = "") -> String:
	match kind:
		"chest", "chest_open":
			return "ui_chest"
		"camp":
			return "ui_fire"
		"trader":
			return "ui_coin"
		"pet":
			return "ui_paw"
		"player":
			return ""
	var l := label.to_lower()
	if "camp" in l:
		return "ui_tent"
	if "lookout" in l:
		return "ui_eye"
	return "ui_star"


## A marker badge: parchment disc with a coloured ring and the icon.
## alpha < 1 fades it; blur > 0 smears it (beacon going dark).
static func draw_badge(ci: CanvasItem, pos: Vector2, kind: String, tier: String, opened: bool, scale_k: float = 1.0,
		alpha: float = 1.0, blur: float = 0.0, label: String = "") -> void:
	if alpha <= 0.01:
		return
	var r := 17.0 * scale_k
	var ring := Color(0.35, 0.25, 0.16)
	if kind == "chest" or kind == "chest_open":
		ring = TIER_RING.get(tier, ring)
	elif kind == "camp":
		ring = Color(0.88, 0.45, 0.14)
		r = 21.0 * scale_k
	elif kind == "trader":
		ring = Color(0.75, 0.6, 0.2)
	elif kind == "pet":
		ring = Color(0.5, 0.35, 0.7)
	var is_open := opened or kind == "chest_open"
	if is_open:
		ring = ring.lerp(Color(0.5, 0.48, 0.45), 0.7)
	var passes := 1 if blur <= 0.05 else 5
	for i in passes:
		var off := Vector2.ZERO
		var a := alpha
		if passes > 1:
			off = Vector2.from_angle(TAU * float(i) / 4.0 + 0.6) * blur * (0.0 if i == 0 else 1.0)
			a = alpha * (0.55 if i == 0 else 0.22)
		var p := pos + off
		if kind == "chest" and tier == "epic" and not is_open:
			ci.draw_texture_rect(ThemeFactory.glow_texture(), Rect2(p - Vector2(r, r) * 2.0, Vector2(r, r) * 4.0), false, Color(1.0, 0.75, 0.25, 0.55 * a))
		ci.draw_circle(p + Vector2(0, 2.0 * scale_k), r + 1.5, Color(0.1, 0.06, 0.03, 0.35 * a), true, -1.0, true)
		ci.draw_circle(p, r, Color(ring.r, ring.g, ring.b, a), true, -1.0, true)
		ci.draw_circle(p, r - 3.0 * scale_k, Color(0.96, 0.91, 0.78, a) if not is_open else Color(0.82, 0.8, 0.76, a), true, -1.0, true)
		var tex := ThemeFactory.icon(icon_for(kind, label))
		if tex:
			var s := r * 1.45
			var mod := Color(1, 1, 1, a) if not is_open else Color(0.6, 0.58, 0.55, a * 0.85)
			ci.draw_texture_rect(tex, Rect2(p - Vector2(s, s) * 0.5, Vector2(s, s)), false, mod)
		if is_open:
			var ck := ThemeFactory.icon("ui_check")
			if ck:
				var cs := r * 0.9
				ci.draw_texture_rect(ck, Rect2(p + Vector2(r * 0.25, r * 0.1), Vector2(cs, cs)), false, Color(1, 1, 1, a))


## The player arrow (dir = screen direction it points to).
static func draw_player_arrow(ci: CanvasItem, pos: Vector2, dir: Vector2, size: float, alpha: float = 1.0, cone: bool = true) -> void:
	var d := dir.normalized() if dir.length() > 0.001 else Vector2.UP
	var side := Vector2(-d.y, d.x)
	if cone:
		var pts := PackedVector2Array([pos])
		var cols := PackedColorArray([Color(1.0, 0.95, 0.75, 0.38 * alpha)])
		for i in 9:
			var a := lerpf(-0.55, 0.55, float(i) / 8.0)
			pts.append(pos + d.rotated(a) * size * 3.4)
			cols.append(Color(1.0, 0.95, 0.75, 0.0))
		ci.draw_polygon(pts, cols)
	var tip := pos + d * size
	var back := pos - d * size * 0.62
	var l := back + side * size * 0.72 - d * size * 0.12
	var r := back - side * size * 0.72 - d * size * 0.12
	var notch := pos - d * size * 0.28
	var shadow := PackedVector2Array([tip, l, notch, r])
	var so := Vector2(0, 2.5)
	var sh := PackedVector2Array()
	for p in shadow:
		sh.append(p + so)
	ci.draw_colored_polygon(sh, Color(0, 0, 0, 0.35 * alpha))
	var outline := PackedVector2Array([tip + d * 3.0, l + (l - pos).normalized() * 3.0, notch - d * 1.5, r + (r - pos).normalized() * 3.0])
	ci.draw_colored_polygon(outline, Color(1.0, 0.97, 0.9, alpha))
	ci.draw_colored_polygon(PackedVector2Array([tip, l, notch]), Color(0.93, 0.33, 0.16, alpha))
	ci.draw_colored_polygon(PackedVector2Array([tip, notch, r]), Color(0.78, 0.2, 0.1, alpha))


## Screen direction the player is looking (map north up = -Z).
static func player_heading() -> Vector2:
	var pl := GameState.player
	if pl and is_instance_valid(pl) and pl.is_inside_tree():
		var cam: Variant = pl.get("camera")
		if cam is Camera3D and (cam as Camera3D).is_inside_tree():
			var f := -(cam as Camera3D).global_transform.basis.z
			if Vector2(f.x, f.z).length() > 0.05:
				return Vector2(f.x, f.z).normalized()
		var model: Variant = pl.get("model")
		if model is Node3D:
			var yaw := (model as Node3D).global_rotation.y
			return Vector2(-sin(yaw), -cos(yaw))
	return Vector2.UP


static func home_pos() -> Vector3:
	if GameState.campfire and is_instance_valid(GameState.campfire):
		return GameState.campfire.global_position
	if GameState.camp and is_instance_valid(GameState.camp):
		return GameState.camp.global_position
	return Vector3.ZERO


# --- The map view ------------------------------------------------------------------------------

## The parchment map with markers, frame, compass and scale bar. Handles pan
## and zoom input.
class MapView:
	extends Control

	const FRAME := 18.0
	var center := Vector2.ZERO
	var zoom := 1.0
	var _zoom_target := -1.0
	var _zoom_anchor := Vector2.ZERO
	var _drag := false
	var _touches: Dictionary = {}
	var _beacon := 1.0
	var _t := 0.0

	func _init() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_STOP
		focus_mode = Control.FOCUS_NONE
		_beacon = 1.0 if MapUI.beacon_lit() else 0.0

	func fit_zoom() -> float:
		var s := minf(size.x, size.y) - FRAME * 2.0
		return maxf(s, 64.0) / (WorldGen.PLAYABLE_HALF * 2.0 + 24.0)

	func max_zoom() -> float:
		return (minf(size.x, size.y) - FRAME * 2.0) / MIN_SPAN

	## Zoom relative to "whole map fits" (1 = overview).
	func zoom_rel() -> float:
		return zoom / maxf(fit_zoom(), 0.0001)

	var _pending: Array = []
	var _view_set := false

	func set_view(c: Vector2, rel: float) -> void:
		center = c
		if size.x < 2.0:
			_pending = [c, rel]
			return
		_view_set = true
		zoom = clampf(fit_zoom() * rel, fit_zoom() * 0.95, max_zoom())
		_clamp_center()

	func reset_view() -> void:
		set_view(Vector2.ZERO, 1.0)

	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED:
			if not _pending.is_empty():
				var p := _pending
				_pending = []
				set_view(p[0], float(p[1]))
			elif not _view_set and size.x >= 2.0:
				set_view(Vector2.ZERO, 1.0)

	func world_to_view(p: Vector3) -> Vector2:
		return (Vector2(p.x, p.z) - center) * zoom + size * 0.5

	func view_to_world(v: Vector2) -> Vector2:
		return (v - size * 0.5) / maxf(zoom, 0.0001) + center

	func _clamp_center() -> void:
		var half_view := size * 0.5 / maxf(zoom, 0.0001)
		var lim := WorldGen.PLAYABLE_HALF + 12.0
		var mx := maxf(lim - half_view.x, 0.0)
		var mz := maxf(lim - half_view.y, 0.0)
		center = Vector2(clampf(center.x, -mx, mx), clampf(center.y, -mz, mz))

	func zoom_at(screen_pt: Vector2, factor: float) -> void:
		var before := view_to_world(screen_pt)
		zoom = clampf(zoom * factor, fit_zoom() * 0.95, max_zoom())
		var after := view_to_world(screen_pt)
		center += before - after
		_clamp_center()

	func zoom_step(dir: int) -> void:
		var base := _zoom_target if _zoom_target > 0.0 else zoom
		_zoom_target = clampf(base * (1.45 if dir > 0 else 1.0 / 1.45), fit_zoom() * 0.95, max_zoom())
		_zoom_anchor = size * 0.5

	func center_on_player() -> void:
		var pl := GameState.player
		if pl and is_instance_valid(pl):
			center = Vector2(pl.global_position.x, pl.global_position.z)
			_zoom_target = maxf(zoom, fit_zoom() * 2.4)
			_zoom_anchor = size * 0.5
			_clamp_center()

	func center_on_home() -> void:
		var h := MapUI.home_pos()
		center = Vector2(h.x, h.z)
		_zoom_target = maxf(zoom, fit_zoom() * 2.0)
		_zoom_anchor = size * 0.5
		_clamp_center()

	func pan_pixels(rel: Vector2) -> void:
		center -= rel / maxf(zoom, 0.0001)
		_clamp_center()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			var t := event as InputEventScreenTouch
			if t.pressed:
				_touches[t.index] = t.position
			else:
				_touches.erase(t.index)
			accept_event()
		elif event is InputEventScreenDrag:
			var d := event as InputEventScreenDrag
			if _touches.size() >= 2 and _touches.has(d.index):
				var keys := _touches.keys()
				var other: Vector2 = _touches[keys[0] if keys[0] != d.index else keys[1]]
				var old_p: Vector2 = _touches[d.index]
				var old_mid := (old_p + other) * 0.5
				var old_d := maxf(old_p.distance_to(other), 1.0)
				var new_mid := (d.position + other) * 0.5
				var new_d := maxf(d.position.distance_to(other), 1.0)
				zoom_at(new_mid, new_d / old_d)
				pan_pixels(new_mid - old_mid)
			else:
				pan_pixels(d.relative)
			_touches[d.index] = d.position
			_zoom_target = -1.0
			accept_event()
		elif event is InputEventMagnifyGesture:
			var mg := event as InputEventMagnifyGesture
			zoom_at(mg.position, mg.factor)
			_zoom_target = -1.0
			accept_event()
		elif event is InputEventPanGesture:
			pan_pixels(-(event as InputEventPanGesture).delta * 12.0)
			accept_event()
		elif event is InputEventMouseButton:
			var mb := event as InputEventMouseButton
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
				_zoom_target = clampf((_zoom_target if _zoom_target > 0.0 else zoom) * 1.2, fit_zoom() * 0.95, max_zoom())
				_zoom_anchor = mb.position
				accept_event()
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
				_zoom_target = clampf((_zoom_target if _zoom_target > 0.0 else zoom) / 1.2, fit_zoom() * 0.95, max_zoom())
				_zoom_anchor = mb.position
				accept_event()
			elif mb.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE]:
				# Emulated mouse from touches: the touch events above do the work.
				if not Platform.is_touch():
					_drag = mb.pressed
				accept_event()
		elif event is InputEventMouseMotion:
			if _drag and not Platform.is_touch():
				pan_pixels((event as InputEventMouseMotion).relative)
				_zoom_target = -1.0
			accept_event()

	func _process(delta: float) -> void:
		_t += delta
		var target := 1.0 if MapUI.beacon_lit() else 0.0
		_beacon = move_toward(_beacon, target, delta * 1.2)
		if _zoom_target > 0.0:
			var nz := lerpf(zoom, _zoom_target, clampf(delta * 10.0, 0.0, 1.0))
			if absf(nz - _zoom_target) < _zoom_target * 0.002:
				nz = _zoom_target
				_zoom_target = -1.0
			zoom_at(_zoom_anchor, nz / maxf(zoom, 0.0001))
		# Gamepad / keyboard: pan with the move actions, zoom with the right stick.
		var mv := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		if mv.length() > 0.05:
			pan_pixels(-mv * 620.0 * delta)
		var zs := Input.get_axis("look_down", "look_up")
		if absf(zs) > 0.2:
			zoom_at(size * 0.5, pow(2.2, zs * delta))
			_zoom_target = -1.0
		queue_redraw()

	# --- Drawing ------------------------------------------------------------------------

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, MapUI.PAPER.darkened(0.08))
		var tex := MapUI.map_texture()
		if tex:
			var tl := world_to_view(Vector3(-WorldGen.HALF, 0.0, -WorldGen.HALF))
			draw_texture_rect(tex, Rect2(tl, Vector2.ONE * WorldGen.HALF * 2.0 * zoom), false)
		_draw_grid()
		_draw_geo_labels()
		var markers := MapUI.collect_markers(get_tree())
		var k := clampf(sqrt(zoom_rel()) * 0.9, 0.85, 1.5)
		var blur := (1.0 - _beacon) * 7.0
		var home_pt := Vector2.INF
		# Important markers first (they fade with the beacon), camp on top.
		for m in markers:
			var kind := str(m.get("kind", ""))
			if kind == "camp":
				home_pt = world_to_view(m["pos"])
				continue
			var a := _beacon if bool(m.get("important", false)) else 1.0
			if a <= 0.01:
				continue
			var p := world_to_view(m["pos"])
			if not r.grow(30.0).has_point(p):
				continue
			var opened := bool(m.get("opened", false))
			MapUI.draw_badge(self, p, kind, str(m.get("tier", "")), opened, k * (0.85 if kind == "chest" else 1.0), a, blur, str(m.get("label", "")))
			if kind != "chest" and zoom_rel() > 1.25 and str(m.get("label", "")) != "":
				_label(p + Vector2(0, 22.0 * k + 16.0), str(m["label"]), 19, MapUI.INK, a)
		if home_pt == Vector2.INF:
			home_pt = world_to_view(MapUI.home_pos())
		MapUI.draw_badge(self, home_pt, "camp", "", false, k)
		_label(home_pt + Vector2(0, 26.0 * k + 15.0), "Home Camp", 20, MapUI.INK, 1.0)
		# The player.
		var pl := GameState.player
		if pl and is_instance_valid(pl) and pl.is_inside_tree():
			var pp := world_to_view(pl.global_position)
			var pulse := 0.5 + 0.5 * sin(_t * 3.0)
			draw_circle(pp, 15.0 + pulse * 6.0, Color(1.0, 0.95, 0.8, 0.18 * (1.0 - pulse * 0.5)), true, -1.0, true)
			MapUI.draw_player_arrow(self, pp, MapUI.player_heading(), 17.0 * clampf(k, 0.9, 1.2))
		_draw_edges()
		_draw_beacon_dark()
		_draw_compass(Vector2(size.x - FRAME - 84.0, FRAME + 84.0), 46.0)
		_draw_scale_bar()
		_draw_frame()

	func _label(pos: Vector2, text: String, fs: int, col: Color, alpha: float, outline_col: Color = Color(0.95, 0.9, 0.76)) -> void:
		var f := ThemeFactory.font("display_medium")
		var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p := pos - Vector2(w * 0.5, 0.0)
		draw_string_outline(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(outline_col.r, outline_col.g, outline_col.b, 0.85 * alpha))
		draw_string(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col.r, col.g, col.b, alpha))

	func _draw_grid() -> void:
		# Faint survey lines every 100 m, like an old chart.
		var col := Color(MapUI.INK.r, MapUI.INK.g, MapUI.INK.b, 0.1)
		var x := -300.0
		while x <= 300.0:
			var a := world_to_view(Vector3(x, 0.0, -WorldGen.HALF))
			var b := world_to_view(Vector3(x, 0.0, WorldGen.HALF))
			draw_line(a, b, col, 1.5)
			var c := world_to_view(Vector3(-WorldGen.HALF, 0.0, x))
			var d := world_to_view(Vector3(WorldGen.HALF, 0.0, x))
			draw_line(c, d, col, 1.5)
			x += 100.0

	func _draw_geo_labels() -> void:
		var gen := GameState.world_gen
		if gen == null:
			return
		var fs := int(clampf(22.0 * sqrt(zoom_rel()), 22.0, 34.0))
		for id in MapUI.GEO_LABELS:
			if not gen.landmarks.has(id):
				continue
			var lm: Dictionary = gen.landmarks[id]
			var p: Vector3 = lm["pos"]
			var col := MapUI.INK
			var name := str(lm["name"])
			match id:
				"lake":
					p = Vector3(-150.0, 0.0, 10.0)
					col = Color(0.14, 0.3, 0.42)
				"ridge":
					col = Color(0.36, 0.26, 0.18)
				"meadow":
					col = Color(0.3, 0.38, 0.16)
				"elder_grove":
					col = Color(0.16, 0.3, 0.16)
			_label(world_to_view(p), name, fs, col, 0.85)

	func _draw_edges() -> void:
		# Burnt-parchment shading toward the frame.
		var steps := 10
		for i in steps:
			var w := float(i) * 4.0 + FRAME
			var a := 0.05 * (1.0 - float(i) / steps)
			var c := Color(0.25, 0.15, 0.05, a)
			draw_rect(Rect2(Vector2(w, w), size - Vector2(w, w) * 2.0), c, false, 5.0)

	func _draw_beacon_dark() -> void:
		var dark := 1.0 - _beacon
		if dark <= 0.01:
			return
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.08, 0.2, 0.28 * dark))
		var f := ThemeFactory.font("body_bold")
		var fs := 23
		var lines := ["The beacon is dark...", "relight your campfire to see your markers."]
		var w := 0.0
		for ln in lines:
			w = maxf(w, f.get_string_size(ln, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
		var box := Rect2(Vector2((size.x - w) * 0.5 - 76.0, size.y - FRAME - 118.0), Vector2(w + 110.0, 84.0))
		var sb := ThemeFactory.flat(Color(0.05, 0.06, 0.12, 0.82 * dark), 18)
		sb.set_border_width_all(2)
		sb.border_color = Color(1.0, 0.55, 0.3, 0.6 * dark)
		draw_style_box(sb, box)
		var ic := ThemeFactory.icon("ui_fire")
		if ic:
			var flick := 0.55 + 0.15 * sin(_t * 5.0)
			draw_texture_rect(ic, Rect2(box.position + Vector2(14, 16), Vector2(52, 52)), false, Color(0.45, 0.45, 0.55, flick * dark))
		for i in lines.size():
			draw_string(f, box.position + Vector2(80.0, 34.0 + 30.0 * i), lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1.0, 0.86, 0.72, dark))

	func _draw_compass(c: Vector2, rad: float) -> void:
		draw_circle(c + Vector2(0, 3), rad + 6.0, Color(0.1, 0.06, 0.03, 0.25), true, -1.0, true)
		draw_circle(c, rad + 5.0, Color(0.96, 0.91, 0.78, 0.92), true, -1.0, true)
		draw_arc(c, rad + 5.0, 0.0, TAU, 48, Color(0.42, 0.28, 0.14), 2.5, true)
		draw_arc(c, rad - 3.0, 0.0, TAU, 48, Color(0.42, 0.28, 0.14, 0.6), 1.5, true)
		# Eight points: long cardinal, short diagonal; light/dark halves.
		for i in 8:
			var a := -PI * 0.5 + PI * 0.25 * float(i)
			var long := i % 2 == 0
			var len := rad * (0.95 if long else 0.55)
			var wid := rad * (0.2 if long else 0.13)
			var d := Vector2.from_angle(a)
			var s := Vector2(-d.y, d.x)
			var tip := c + d * len
			var col_a := Color(0.85, 0.3, 0.16) if i == 0 else (Color(0.36, 0.25, 0.15) if long else Color(0.6, 0.48, 0.32))
			var col_b := col_a.lightened(0.35)
			draw_colored_polygon(PackedVector2Array([c, tip, c + s * wid]), col_a)
			draw_colored_polygon(PackedVector2Array([c, c - s * wid, tip]), col_b)
		draw_circle(c, rad * 0.1, Color(0.93, 0.7, 0.25), true, -1.0, true)
		var f := ThemeFactory.font("display_bold")
		for e in [["N", Vector2(0, -1)], ["E", Vector2(1, 0)], ["S", Vector2(0, 1)], ["W", Vector2(-1, 0)]]:
			var t := str(e[0])
			var fs := 22 if t == "N" else 17
			var ts := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
			var p := c + (e[1] as Vector2) * (rad + 22.0) - Vector2(ts.x * 0.5, -ts.y * 0.32)
			draw_string_outline(f, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0.96, 0.91, 0.78, 0.95))
			draw_string(f, p, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0.75, 0.2, 0.1) if t == "N" else MapUI.INK)

	func _draw_scale_bar() -> void:
		var metres := 100.0
		for m in [25.0, 50.0, 100.0, 200.0]:
			metres = m
			if m * zoom >= 90.0:
				break
		var px := metres * zoom
		var o := Vector2(FRAME + 24.0, size.y - FRAME - 30.0)
		draw_rect(Rect2(o - Vector2(10, 34), Vector2(px + 20, 48)), Color(0.96, 0.91, 0.78, 0.75))
		for i in 4:
			var seg := Rect2(o + Vector2(px * i / 4.0, 0), Vector2(px / 4.0, 9))
			draw_rect(seg, MapUI.INK if i % 2 == 0 else Color(0.96, 0.91, 0.78))
		draw_rect(Rect2(o, Vector2(px, 9)), MapUI.INK, false, 1.5)
		var f := ThemeFactory.font("body_bold")
		draw_string(f, o + Vector2(0, -8), "%d m" % int(metres), HORIZONTAL_ALIGNMENT_LEFT, -1, 19, MapUI.INK)

	func _draw_frame() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var wood := StyleBoxFlat.new()
		wood.draw_center = false
		wood.set_border_width_all(int(FRAME))
		wood.border_color = Color(0.33, 0.21, 0.12)
		wood.set_corner_radius_all(3)
		wood.corner_detail = 8
		wood.anti_aliasing = true
		# Outside of the rounded frame is the panel: fill the corners.
		draw_style_box(wood, r)
		draw_rect(Rect2(Vector2(FRAME, FRAME), size - Vector2(FRAME, FRAME) * 2.0), Color(0.86, 0.62, 0.26, 0.9), false, 2.5)
		draw_rect(Rect2(Vector2(4, 4), size - Vector2(8, 8)), Color(0.55, 0.38, 0.22, 0.6), false, 2.0)
		# Grain lines in the wood.
		var gc := Color(0.24, 0.15, 0.08, 0.5)
		for i in 3:
			var y := 5.0 + 4.0 * i
			draw_line(Vector2(20, y), Vector2(size.x - 20, y), gc, 1.0)
			draw_line(Vector2(20, size.y - y), Vector2(size.x - 20, size.y - y), gc, 1.0)
			draw_line(Vector2(y, 20), Vector2(y, size.y - 20), gc, 1.0)
			draw_line(Vector2(size.x - y, 20), Vector2(size.x - y, size.y - 20), gc, 1.0)
		# Brass corner caps with a little star.
		for c in [Vector2(FRAME * 0.5, FRAME * 0.5), Vector2(size.x - FRAME * 0.5, FRAME * 0.5), Vector2(FRAME * 0.5, size.y - FRAME * 0.5), Vector2(size.x - FRAME * 0.5, size.y - FRAME * 0.5)]:
			draw_circle(c, 15.0, Color(0.55, 0.36, 0.12), true, -1.0, true)
			draw_circle(c, 12.5, Color(0.93, 0.72, 0.3), true, -1.0, true)
			var star := PackedVector2Array()
			for i in 8:
				var a := -PI * 0.5 + PI * 0.25 * float(i)
				star.append(c + Vector2.from_angle(a) * (8.0 if i % 2 == 0 else 3.4))
			draw_colored_polygon(star, Color(1.0, 0.93, 0.62))


class _LegendIcon:
	extends Control

	var kind := ""
	var tier := ""
	var k := 0.95

	func _draw() -> void:
		var c := size * 0.5
		if kind == "player":
			MapUI.draw_player_arrow(self, c, Vector2(0.6, -0.8), 15.0 * k / 0.95, 1.0, false)
			return
		MapUI.draw_badge(self, c, kind, tier, kind == "chest_open", k)
