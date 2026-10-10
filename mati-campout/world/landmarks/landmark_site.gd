class_name LandmarkSite
extends Node3D
## Base class for one landmark. A site lives at its WorldGen landmark
## position (on the ground) and is turned so that local +Z faces the trail
## that leads to it (visitors arrive from +Z). Subclasses fill the kits in
## local space in `build_site()` (may await) and `Landmarks` then calls
## `finish()`, which turns everything into a few meshes and one StaticBody3D
## (layer 1):
##   structure  (`big` + `big_cloth`)       visible from far away
##   details    (`detail` + `detail_cloth`) small props, near only
##   glass      (`glass`)                   transparent panes, if any
## Helpers snap props to the ground (lowest point of the footprint), collect
## collision shapes, footprint zones (cleared of gatherables, registered as
## obstacles), lanterns (lit at night by Landmarks) and chest spots.

var id := ""
var display_name := ""
## Map marker kind: "landmark" or "trader".
var marker_kind := "landmark"
## WorldGen radius (discovery uses it).
var radius := 10.0
## World position of the landmark centre (on the ground).
var center := Vector3.ZERO
## Local +Z = toward the trail (world yaw around Y).
var yaw := 0.0
var gen: WorldGen = null
var game: Node = null
var rng := RandomNumberGenerator.new()

var big := LandmarkKit.new()
var big_cloth := LandmarkKit.new()
var detail := LandmarkKit.new()
var detail_cloth := LandmarkKit.new()
var glass := LandmarkKit.new()

## [{"shape": Shape3D, "xform": Transform3D (local)}]
var shapes: Array = []
## Footprints in local space: Vector3(x, z, r).
var zones: Array = []
## [{"pos": Vector3 (local), "color": Color, "range": float, "energy": float,
##   "always": bool (also by day, e.g. an indoor lamp), "kind": String}]
var lanterns: Array = []
## [{"pos": Vector3 (local), "yaw": float (local), "fallback": Vector3 (local,
##   on the terrain: where loot drops when there is no ChestManager)}]
var chest_spots: Array = []
## Structure visibility range (0 = always visible).
var far_range := 260.0
## Small props visibility range.
var near_range := 90.0
## Clear radius kept free at the centre (trader camps: the NPC stands there).
var keep_clear := 0.0

var structure_mesh: MeshInstance3D = null
var detail_mesh: MeshInstance3D = null
var glass_mesh: MeshInstance3D = null
var body: StaticBody3D = null
var _xf := Transform3D.IDENTITY


## Place the site (call before build_site). `approach` overrides the facing
## (a world direction); by default it faces the nearest trail.
func setup_site(p_id: String, p_gen: WorldGen, p_game: Node, approach: Vector3 = Vector3.ZERO) -> void:
	id = p_id
	gen = p_gen
	game = p_game
	name = "Site_" + p_id
	var lm: Dictionary = gen.landmarks.get(p_id, {}) if gen else {}
	display_name = str(lm.get("name", p_id.capitalize()))
	radius = float(lm.get("radius", 10.0))
	center = gen.landmark_pos(p_id) if gen else Vector3.ZERO
	var dir := approach
	if dir.length_squared() < 0.0001:
		dir = approach_dir(gen, center)
	yaw = atan2(dir.x, dir.z)
	_xf = Transform3D(Basis(Vector3.UP, yaw), center)
	transform = _xf
	rng.seed = int(GameState.seed) * 7919 + hash(p_id) % 100000


## Direction (unit, XZ) from `c` toward the trail that leads to it; toward
## the camp when no trail is near.
static func approach_dir(g: WorldGen, c: Vector3) -> Vector3:
	var best := INF
	var best_p := Vector2.ZERO
	if g:
		for path in g.paths:
			for q in (path as PackedVector2Array):
				var d := Vector2(c.x, c.z).distance_to(q)
				if d > 7.0 and d < 24.0 and absf(d - 12.0) < best:
					best = absf(d - 12.0)
					best_p = q
	var v := Vector3(best_p.x - c.x, 0.0, best_p.y - c.z) if best < INF else Vector3(-c.x, 0.0, -c.z)
	if v.length_squared() < 0.0001:
		v = Vector3.BACK
	return v.normalized()


## Override: fill the kits, shapes, zones, lanterns and chest spots.
func build_site() -> void:
	pass


# --- Space helpers ------------------------------------------------------------------------

## Local -> world.
func to_world(p: Vector3) -> Vector3:
	return _xf * p


## World -> local.
func to_local_point(p: Vector3) -> Vector3:
	return _xf.affine_inverse() * p


## Ground height at a local point, relative to the centre.
func gy(lx: float, lz: float) -> float:
	if gen == null:
		return 0.0
	var w := _xf * Vector3(lx, 0.0, lz)
	return gen.height_at(w.x, w.z) - center.y


## Lowest ground within r of a local point (centre + 8 samples).
func gmin(lx: float, lz: float, r: float = 0.0) -> float:
	var h := gy(lx, lz)
	if r <= 0.0:
		return h
	for i in 8:
		var a := TAU * float(i) / 8.0
		h = minf(h, gy(lx + cos(a) * r, lz + sin(a) * r))
	return h


func gmax(lx: float, lz: float, r: float = 0.0) -> float:
	var h := gy(lx, lz)
	if r <= 0.0:
		return h
	for i in 8:
		var a := TAU * float(i) / 8.0
		h = maxf(h, gy(lx + cos(a) * r, lz + sin(a) * r))
	return h


## Local transform standing on the ground (lowest point within r), turned by
## local_yaw, raised by dy.
func lxf(lx: float, lz: float, local_yaw: float = 0.0, r: float = 0.0, dy: float = 0.0) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, local_yaw), Vector3(lx, gmin(lx, lz, r) + dy, lz))


## Same, but tilted to follow the ground slope (small props lying around).
func lxf_tilt(lx: float, lz: float, local_yaw: float, r: float, dy: float = 0.0) -> Transform3D:
	var hx := gy(lx + r, lz) - gy(lx - r, lz)
	var hz := gy(lx, lz + r) - gy(lx, lz - r)
	var n := Vector3(-hx, 2.0 * maxf(r, 0.01), -hz).normalized()
	var flat := Basis(Vector3.UP, local_yaw)
	var tilt := Basis(Quaternion(Vector3.UP, n)) if n.dot(Vector3.UP) < 0.9999 else Basis.IDENTITY
	return Transform3D(tilt * flat, Vector3(lx, gy(lx, lz) + dy, lz))


## True when a local point is on dry, playable land.
func is_dry(lx: float, lz: float) -> bool:
	if gen == null:
		return true
	var w := to_world(Vector3(lx, 0.0, lz))
	return not gen.is_water(w.x, w.z) and gen.in_playable(w.x, w.z)


## True when no tree trunk / log / boulder is within r of a local point.
func veg_clear(lx: float, lz: float, r: float) -> bool:
	var veg: Node = game.get("vegetation") if game else null
	if veg == null or not veg.has_method("is_clear"):
		return true
	return bool(veg.call("is_clear", to_world(Vector3(lx, 0.0, lz)), r))


## Unit direction (local, XZ) to the closest water within max_d, or ZERO.
func water_dir(max_d: float = 30.0) -> Vector3:
	var best := INF
	var best_dir := Vector3.ZERO
	for i in 48:
		var a := TAU * float(i) / 48.0
		var d := Vector3(sin(a), 0.0, cos(a))
		var r := 2.0
		while r <= max_d:
			if not is_dry(d.x * r, d.z * r):
				if r < best:
					best = r
					best_dir = d
				break
			r += 0.75
	return best_dir


## Unit direction (local, XZ) where the ground rises most within `r`.
func uphill_dir(r: float = 12.0) -> Vector3:
	var best := -INF
	var best_dir := Vector3.FORWARD
	for i in 36:
		var a := TAU * float(i) / 36.0
		var d := Vector3(sin(a), 0.0, cos(a))
		var h := gy(d.x * r, d.z * r) + gy(d.x * r * 0.7, d.z * r * 0.7) * 0.5
		# Keep away from the trail side (+Z) so the entrance faces visitors.
		h -= maxf(d.z, 0.0) * 4.0
		if h > best:
			best = h
			best_dir = d
	return best_dir


## Basis whose local +Z points along d (XZ).
static func facing(d: Vector3) -> Basis:
	return Basis(Vector3.UP, atan2(d.x, d.z))


## Where a mine entrance goes: the first point along `u` past min_d where the
## ground ahead rises steeply. Returns the distance.
func portal_distance(u: Vector3, min_d: float, max_d: float) -> float:
	var dd := min_d
	while dd < max_d:
		var h0 := gy(u.x * dd, u.z * dd)
		var h1 := gy(u.x * (dd + 2.5), u.z * (dd + 2.5))
		if h1 - h0 > 1.4:
			return dd
		dd += 0.5
	return max_d


# --- Collecting -------------------------------------------------------------------------------

func box(size: Vector3, xform: Transform3D) -> void:
	var b := BoxShape3D.new()
	b.size = size
	shapes.append({"shape": b, "xform": xform})


func cyl(r: float, h: float, xform: Transform3D) -> void:
	var c := CylinderShape3D.new()
	c.radius = r
	c.height = h
	shapes.append({"shape": c, "xform": xform})


## A collision box from point a to point b (a thick ramp / beam).
func box_between(a: Vector3, b: Vector3, width: float, thick: float, up_hint: Vector3 = Vector3.UP) -> void:
	var d := b - a
	var z := d.normalized()
	var x := up_hint.cross(z).normalized()
	if x.length_squared() < 0.5:
		x = Vector3.RIGHT
	var y := z.cross(x).normalized()
	box(Vector3(width, thick, d.length()), Transform3D(Basis(x, y, z), (a + b) * 0.5))


## An upright guard wall (handrail collider) following a sloped line a -> b:
## vertical box segments, `height` above the line (no overhang at the ends,
## unlike one tilted box).
func rail_wall(a: Vector3, b: Vector3, thick: float = 0.08, height: float = 1.1) -> void:
	var flat := Vector3(b.x - a.x, 0.0, b.z - a.z)
	var length := flat.length()
	if length < 0.01:
		return
	var n := maxi(int(ceil(length / 0.45)), 1)
	var bas := Basis(Vector3.UP, atan2(flat.x, flat.z))
	for i in n:
		var t0 := float(i) / n
		var t1 := float(i + 1) / n
		var p0 := a.lerp(b, t0)
		var p1 := a.lerp(b, t1)
		var low := minf(p0.y, p1.y)
		var high := maxf(p0.y, p1.y) + height
		var mid := (p0 + p1) * 0.5
		box(Vector3(thick, high - low, length / n), Transform3D(bas, Vector3(mid.x, (low + high) * 0.5, mid.z)))


func add_shapes(list: Array) -> void:
	shapes.append_array(list)


func zone(lx: float, lz: float, r: float) -> void:
	zones.append(Vector3(lx, lz, r))


func lantern_light(local_pos: Vector3, energy: float = 1.0, light_range: float = 6.0,
		color: Color = Color(1.0, 0.72, 0.4), always: bool = false, kind: String = "warm") -> void:
	lanterns.append({"pos": local_pos, "color": color, "range": light_range, "energy": energy, "always": always, "kind": kind})


func chest_spot(local_pos: Vector3, local_yaw: float, fallback: Vector3 = Vector3.INF) -> void:
	var fb := fallback if fallback != Vector3.INF else local_pos
	chest_spots.append({"pos": local_pos, "yaw": local_yaw, "fallback": fb})


## Lines for a LandmarkNote from balance.json landmarks.notes.<key>.
static func notes_for(key: String) -> Array:
	var all: Variant = DB.b("landmarks.notes", {})
	if all is Dictionary and (all as Dictionary).has(key):
		return ((all as Dictionary)[key] as Array).duplicate()
	return []


## A two-post signboard standing on the ground at a local point, facing
## local_yaw, with painted text (Label3D). Goes into the detail kit.
func sign_board(at: Vector3, local_yaw: float, text: String, board: Color = Color("#2f5d4a"),
		w: float = 1.4, top: float = 1.7, ink: Color = Color(1.0, 0.93, 0.74)) -> void:
	var t := lxf(at.x, at.z, local_yaw, 0.3)
	for x in [-w * 0.5 - 0.05, w * 0.5 + 0.05]:
		var xx: float = x
		detail.log_piece(t * Vector3(xx, -0.25, 0), t * Vector3(xx, top + 0.12, 0), 0.055, 8300 + int(xx * 10.0), true, Color("#5a4232"))
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, top - 0.34, 0)), Vector3(w, 0.6, 0.05), board)
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, top - 0.34, -0.01)), Vector3(w + 0.08, 0.68, 0.04), Color("#5a3a22"))
	add_shapes([LandmarkProps.box_shape(Vector3(w + 0.3, 0.3, 0.2), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.15, 0)))])
	zone(at.x, at.z, w * 0.55)
	add_child(LandmarkLabel.make(text, t * Transform3D(Basis.IDENTITY, Vector3(0, top - 0.34, 0.03)), ink, board.darkened(0.6)))


# --- Output ------------------------------------------------------------------------------------

## Build the mesh instances and the static body from the kits.
func finish() -> void:
	var low := Settings.is_low_quality()
	var shadows_detail := not low
	structure_mesh = LandmarkKit.instance(big, big_cloth, "Structure", true)
	if structure_mesh:
		_set_range(structure_mesh, far_range)
		add_child(structure_mesh)
	detail_mesh = LandmarkKit.instance(detail, detail_cloth, "Details", shadows_detail)
	if detail_mesh:
		_set_range(detail_mesh, near_range * (0.75 if low else 1.0))
		add_child(detail_mesh)
	if not glass.is_empty():
		glass_mesh = MeshInstance3D.new()
		glass_mesh.name = "Glass"
		glass_mesh.mesh = glass.to_mesh(LandmarkKit.glass_mat())
		glass_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_set_range(glass_mesh, far_range)
		add_child(glass_mesh)
	if not shapes.is_empty():
		body = StaticBody3D.new()
		body.name = "Body"
		body.collision_layer = 1
		body.collision_mask = 0
		body.set_meta("landmark", id)
		for e in shapes:
			var cs := CollisionShape3D.new()
			cs.shape = e["shape"]
			cs.transform = e["xform"]
			body.add_child(cs)
		add_child(body)
	# The kits are not needed any more.
	big = LandmarkKit.new()
	big_cloth = LandmarkKit.new()
	detail = LandmarkKit.new()
	detail_cloth = LandmarkKit.new()
	glass = LandmarkKit.new()


## Re-apply the quality preset (detail shadows and draw distance).
func apply_quality() -> void:
	var low := Settings.is_low_quality()
	if detail_mesh:
		detail_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if low else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		_set_range(detail_mesh, near_range * (0.75 if low else 1.0))


func _set_range(gi: GeometryInstance3D, end: float) -> void:
	if end <= 0.0:
		return
	gi.visibility_range_end = end
	gi.visibility_range_end_margin = 12.0
	gi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF


## World footprints Vector4(x, y, z, r).
func world_zones() -> Array:
	var out: Array = []
	for z in zones:
		var v: Vector3 = z
		var w := to_world(Vector3(v.x, gy(v.x, v.y), v.y))
		out.append(Vector4(w.x, w.y, w.z, v.z))
	return out


## World chest spots: [{"pos", "rot" (world yaw), "fallback"}].
func world_chest_spots() -> Array:
	var out: Array = []
	for c in chest_spots:
		var d: Dictionary = c
		out.append({"pos": to_world(d["pos"]), "rot": yaw + float(d["yaw"]), "fallback": to_world(d["fallback"])})
	return out


## Where a trader NPC stands (the centre) and the yaw that faces visitors.
func stand_spot() -> Dictionary:
	return {"pos": center, "yaw": yaw, "facing": Vector3(sin(yaw), 0.0, cos(yaw))}


## Per-frame hook (called by Landmarks; `cam` may be null).
func update_site(_delta: float, _darkness: float, _cam: Camera3D) -> void:
	pass
