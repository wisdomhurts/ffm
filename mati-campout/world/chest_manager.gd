class_name ChestManager
extends Node3D
## Treasure chests: deterministic world placement from GameState.seed, the
## public add_chest() API, discovery for the map, glints that make chests
## easy to notice, and restocking at dawn.
##
## Placement (balance.chests): a guaranteed starter chest 16-22 m from the
## fire in view of the clearing (first reward in seconds), `epic_count`
## golden chests far away by the lighthouse / Old Mine / Elder Grove /
## Ranger Lookout / Fern Hollow / ridge top, `rare_count` rare chests near
## ruins, along the Rocky Ridge and on the lake shore (>= 70 m out), and the
## rest of `common_count` spread over the map by biome (forest, meadow,
## shore, ridge), mostly a few metres off the trails. Never on trails, in
## water or the stream, in the camp clearing, on trunks / boulders /
## gatherables or in a building's footprint; >= `spacing` m apart.
##
## Other systems: game.chests.add_chest(pos, tier, table_id, opts) -> Chest
## with opts "restock_table", "restock_days", "label", "rot" (yaw, front =
## +Z), "variant", "keep_y" (do not snap to the terrain), "discovered".
## Call it after the "chests" build step (e.g. deferred or on
## Events.run_started); calls made through ChestManager.request_chest()
## before that are queued and placed when the manager is set up.

const SALT := 0x5C4E57
const TIERS := ["common", "rare", "epic"]
## Landmarks with buildings: chests keep out of their core.
const STRUCTURES := ["lighthouse", "abandoned_camp", "lookout", "rosies_rest", "pips_dock", "brams_dig", "old_mine"]
const EPIC_ANCHORS := ["lighthouse", "old_mine", "elder_grove", "lookout", "hollow", "ridge_top"]
const RARE_ANCHORS := ["abandoned_camp", "lookout", "old_mine", "ridge", "ridge", "shore", "shore", "shore",
	"elder_grove", "hollow", "brams_dig", "lighthouse", "shore", "ridge"]
## Where the player stands at the start, looking at the fire (Player.setup).
const START_VIEW_FROM := Vector2(3.0, 4.0)
## The starter chest sits this many degrees beside the opening view line.
const STARTER_VIEW_OFFSET := 22.0
const GLINT_SIZE := {"common": 0.24, "rare": 0.28, "epic": 0.3}
const SPARKLE_CAP := 72
## Chests join the "interactable" group only within this distance.
const INTERACT_REG_DIST := 9.0

## Requests made before the manager existed: [pos, tier, table, opts].
static var _queued: Array = []

var game: Node = null
var gen: WorldGen = null
var chests: Array = []
var sparkle: Sparkle = null
var discover_radius := 30.0
var glint_range := 60.0
var _veg: Node = null
var _poll := 0.0
var _ready_done := false
static var _sparkle_mat: ShaderMaterial = null


## Queue a chest from a system that is built before the chests (placed as
## soon as the manager is set up; immediately if it already is).
static func request_chest(pos: Vector3, tier: String, table_id: String = "", opts: Dictionary = {}) -> void:
	var g: Node = GameState.game
	if g and is_instance_valid(g):
		var cm: Variant = g.get("chests")
		if cm is ChestManager and (cm as ChestManager)._ready_done:
			(cm as ChestManager).add_chest(pos, tier, table_id, opts)
			return
	_queued.append([pos, tier, table_id, opts])


func setup(p_game: Game) -> void:
	game = p_game
	gen = p_game.gen if p_game and p_game.gen else GameState.world_gen
	if gen == null:
		push_warning("ChestManager: no WorldGen; no chests placed")
		return
	_veg = p_game.vegetation if p_game else GameState.vegetation
	var gat: Node = p_game.gatherables if p_game else null
	var camp: Node = p_game.camp if p_game else GameState.camp
	discover_radius = DB.bf("chests.discover_radius", 30.0)
	glint_range = DB.bf("chests.glint_range", 60.0)
	var t0 := Time.get_ticks_msec()
	var plan := plan_chests(gen, GameState.seed, _veg, gat, avoid_zones(gen, camp))
	for i in plan.size():
		var e: Dictionary = plan[i]
		add_chest(e["pos"], e["tier"], e["table"], {"rot": e["rot"], "starter": e.get("starter", false), "variant": e.get("variant", 0)})
		if i % 10 == 9 and is_inside_tree():
			await get_tree().process_frame
	_ready_done = true
	_flush_queue()
	sparkle = Sparkle.new(SPARKLE_CAP)
	sparkle.material_override = _glint_material()
	add_child(sparkle)
	if not Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.connect(_on_phase_changed)
	if not Events.landmark_discovered.is_connected(MapUI.mark_landmark_seen):
		Events.landmark_discovered.connect(MapUI.mark_landmark_seen)
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)
	# The painted map is needed by the HUD minimap and the map window: paint it
	# now, behind the loading screen.
	var ms := Time.get_ticks_msec()
	MapUI.map_texture()
	print("Chests: %d placed %s in %d ms (map art %d ms)" % [chests.size(), str(counts_by_tier()), ms - t0, Time.get_ticks_msec() - ms])


## Data-only setup for tests and tools (no rendering; chests are plain
## children until the manager enters the tree).
func setup_data(p_gen: WorldGen, p_veg: Node = null, p_gather: Node = null, p_camp: Node = null) -> void:
	gen = p_gen
	_veg = p_veg
	for e in plan_chests(gen, GameState.seed, p_veg, p_gather, avoid_zones(gen, p_camp)):
		add_chest(e["pos"], e["tier"], e["table"], {"rot": e["rot"], "starter": e.get("starter", false), "variant": e.get("variant", 0)})
	_ready_done = true
	if not Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.connect(_on_phase_changed)


func _exit_tree() -> void:
	if Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.disconnect(_on_phase_changed)
	if Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.disconnect(_on_setting_changed)


func _on_setting_changed(key: String) -> void:
	if key == "quality":
		for c in chests:
			(c as Chest).apply_quality()


func _flush_queue() -> void:
	var q := _queued.duplicate()
	_queued.clear()
	for r in q:
		var a: Array = r
		add_chest(a[0], a[1], a[2], a[3])


# --- Public API --------------------------------------------------------------------------

## Add a chest at `pos` (snapped to the terrain unless opts.keep_y).
## tier: "common" | "rare" | "epic"; table_id: a loot_tables.json id ("" =
## the tier's default table). opts: "restock_table", "restock_days",
## "label", "rot" (yaw; the chest's front faces +Z rotated by it),
## "variant", "keep_y", "discovered", "starter".
func add_chest(pos: Vector3, tier: String, table_id: String = "", opts: Dictionary = {}) -> Node3D:
	var c := Chest.new()
	c.configure(tier, table_id, opts)
	c.managed = true
	c.index = chests.size()
	c.loot_seed = GameState.seed * 7919 + SALT
	c.name = "Chest%d_%s" % [c.index, c.tier]
	var g := gen if gen else GameState.world_gen
	var yaw := float(opts.get("rot", 0.0))
	var xf := Transform3D(Basis(Vector3.UP, yaw), pos)
	if g and not bool(opts.get("keep_y", false)):
		var n := g.normal_at(pos.x, pos.z)
		var up := n.lerp(Vector3.UP, 0.45).normalized()
		var tilt := Basis(Quaternion(Vector3.UP, up)) if up.dot(Vector3.UP) < 0.9999 else Basis.IDENTITY
		xf = Transform3D(tilt * Basis(Vector3.UP, yaw), Vector3(pos.x, g.height_at(pos.x, pos.z) - 0.035, pos.z))
	c.transform = xf
	add_child(c)
	chests.append(c)
	if _veg and _veg.has_method("add_obstacle"):
		_veg.call("add_obstacle", xf.origin, 0.62 if c.tier != "epic" else 0.7)
	return c


func chest_count() -> int:
	return chests.size()


func count_tier(tier: String) -> int:
	var n := 0
	for c in chests:
		if (c as Chest).tier == tier:
			n += 1
	return n


func counts_by_tier() -> Dictionary:
	var out := {}
	for t in TIERS:
		out[t] = count_tier(t)
	return out


func chest(i: int) -> Chest:
	return chests[i] if i >= 0 and i < chests.size() else null


## The starter chest near camp (or null).
func starter() -> Chest:
	for c in chests:
		if (c as Chest).is_starter:
			return c
	return null


## Nearest chest to pos (optionally of a tier, only closed ones).
func nearest(pos: Vector3, tier: String = "", closed_only: bool = true, max_r: float = INF) -> Chest:
	var best: Chest = null
	var bd := max_r
	for c in chests:
		var ch := c as Chest
		if ch.debug_only or (tier != "" and ch.tier != tier):
			continue
		if closed_only and ch.opened:
			continue
		var d := Vector2(ch.global_position.x - pos.x, ch.global_position.z - pos.z).length() if ch.is_inside_tree() \
			else Vector2(ch.position.x - pos.x, ch.position.z - pos.z).length()
		if d < bd:
			bd = d
			best = ch
	return best


## Count one dawn for every opened chest (what Events.phase_changed(DAWN)
## does). Returns how many restocked.
func restock_step() -> int:
	var pp := Vector3.INF
	var pl := GameState.player
	if pl and is_instance_valid(pl):
		pp = pl.global_position
	var n := 0
	for c in chests:
		if (c as Chest).dawn_tick(pp):
			n += 1
	return n


func discover_all() -> void:
	for c in chests:
		(c as Chest).discovered = true


func debug_stats() -> Dictionary:
	var opened := 0
	var found := 0
	for c in chests:
		if (c as Chest).opened:
			opened += 1
		if (c as Chest).discovered:
			found += 1
	var st := starter()
	return {"count": chests.size(), "by_tier": counts_by_tier(), "opened": opened, "discovered": found,
		"starter_dist": Vector2(st.position.x, st.position.z).length() if st else -1.0,
		"glints": sparkle.point_count() if sparkle else 0}


## Screenshots: one chest of every tier in a row at `at` (facing +Z).
func debug_gallery(at: Vector3, spacing: float = 1.7, yaw: float = 0.0) -> Array:
	var out: Array = []
	var i := 0
	for t in TIERS:
		var p := at + Basis(Vector3.UP, yaw) * Vector3((float(i) - 1.0) * spacing, 0.0, 0.0)
		var c := add_chest(p, t, "", {"rot": yaw, "label": "Gallery " + t, "discovered": false})
		(c as Chest).restock_days = 0
		(c as Chest).debug_only = true
		c.remove_from_group("map_marker")
		out.append(c)
		i += 1
	return out


# --- Runtime --------------------------------------------------------------------------------

func _process(delta: float) -> void:
	if not _ready_done:
		return
	_poll -= delta
	if _poll > 0.0:
		return
	_poll = 0.25
	var pl := GameState.player
	if pl == null or not is_instance_valid(pl):
		return
	var pp := pl.global_position
	MapUI.track_landmarks(pp)
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	var pts := PackedVector3Array()
	var sizes := PackedFloat32Array()
	var strengths := PackedFloat32Array()
	for c in chests:
		var ch := c as Chest
		var d := ch.global_position.distance_to(pp)
		ch.set_near(d < 32.0)
		ch.set_interactable(d < INTERACT_REG_DIST)
		if not ch.discovered and d < discover_radius:
			if cam == null or cam.is_position_in_frustum(ch.global_position + Vector3(0.0, 0.45, 0.0)):
				_discover(ch)
		if not ch.opened and d < 12.0 and not bool(GameState.flags.get("chest_hint", false)) and GameState.is_playing():
			GameState.flags["chest_hint"] = true
			if Platform.is_touch():
				Events.notify.emit("A treasure chest! Walk up to it and tap Open Chest.", "info")
			else:
				Events.notify.emit("A treasure chest! Walk up to it and press %s to open it." % Controls.prompt("interact"), "info")
		if not ch.opened and d < glint_range and pts.size() < SPARKLE_CAP - 4:
			for gp in ch.glint_points():
				pts.append(gp)
				sizes.append(float(GLINT_SIZE.get(ch.tier, 0.25)))
				strengths.append(1.0)
	if sparkle:
		sparkle.set_points(pts, sizes, strengths)


func _discover(ch: Chest) -> void:
	ch.discovered = true
	if ch.tier != "common" and GameState.is_playing():
		var nm := "a Golden Chest" if ch.tier == "epic" else "a Rare Chest"
		Events.notify.emit("You spotted %s!" % nm, "loot")
	Events.chest_discovered.emit(ch.tier, ch.global_position)


func _on_phase_changed(phase: int) -> void:
	if phase != DayCycle.Phase.DAWN:
		return
	var known := 0
	for c in chests:
		var ch := c as Chest
		var was := ch.opened
		var pp := Vector3.INF
		var pl := GameState.player
		if pl and is_instance_valid(pl):
			pp = pl.global_position
		if ch.dawn_tick(pp) and was and ch.discovered:
			known += 1
	if known > 0 and GameState.is_playing():
		Events.notify.emit("Treasure chests have filled up again!" if known > 1 else "A treasure chest has filled up again!", "loot")


static func _glint_material() -> ShaderMaterial:
	if _sparkle_mat == null:
		_sparkle_mat = ShaderMaterial.new()
		_sparkle_mat.shader = load(Sparkle.SHADER_PATH)
		_sparkle_mat.set_shader_parameter("color", Color(1.0, 0.86, 0.52))
		_sparkle_mat.set_shader_parameter("energy", 2.2)
		_sparkle_mat.set_shader_parameter("fade_near", 38.0)
		_sparkle_mat.set_shader_parameter("fade_far", 62.0)
	return _sparkle_mat


# --- Placement (pure, deterministic) -----------------------------------------------------------

## Circles Vector4(x, y, z, r) chests keep clear of: camp props and the core
## of every landmark with a building.
static func avoid_zones(p_gen: WorldGen, camp: Node = null) -> Array:
	var out: Array = []
	if camp and is_instance_valid(camp) and camp.has_method("clear_zones"):
		for z in camp.call("clear_zones"):
			out.append(z)
	if p_gen:
		for id in STRUCTURES:
			if p_gen.landmarks.has(id):
				var lm: Dictionary = p_gen.landmarks[id]
				var p: Vector3 = lm["pos"]
				out.append(Vector4(p.x, 0.0, p.z, float(lm["radius"]) * 0.85 + 1.5))
	return out


## The full placement plan: Array of {pos, tier, table, rot, anchor,
## starter, variant}. veg (Vegetation) and gather (Gatherables) are optional.
static func plan_chests(p_gen: WorldGen, seed_v: int, veg: Node = null, gather: Node = null, avoid: Array = []) -> Array:
	var pl := _Planner.new(p_gen, seed_v, veg, gather, avoid)
	return pl.run()


class _Planner:
	var gen: WorldGen
	var veg: Node
	var gather: Node
	var avoid: Array
	var rng := RandomNumberGenerator.new()
	var placed: Array = []
	var spacing := 26.0
	var trail_clear := 3.0
	var camp_clear := 26.0

	func _init(p_gen: WorldGen, seed_v: int, p_veg: Node, p_gather: Node, p_avoid: Array) -> void:
		gen = p_gen
		veg = p_veg if p_veg and is_instance_valid(p_veg) else null
		gather = p_gather if p_gather and is_instance_valid(p_gather) else null
		avoid = p_avoid
		rng.seed = hash(seed_v * 31 + ChestManager.SALT)
		_index_decor()
		spacing = DB.bf("chests.spacing", 26.0)
		trail_clear = DB.bf("chests.trail_clear", 3.0)
		camp_clear = DB.bf("chests.camp_clear", 26.0)

	func run() -> Array:
		if gen == null:
			return placed
		if bool(DB.b("chests.near_camp_starter", true)):
			_starter()
		_far("epic", DB.bi("chests.epic_count", 3), ChestManager.EPIC_ANCHORS, DB.bf("chests.epic_min_dist", 115.0))
		_far("rare", DB.bi("chests.rare_count", 9), ChestManager.RARE_ANCHORS, DB.bf("chests.rare_min_dist", 70.0))
		_commons(DB.bi("chests.common_count", 26) - (1 if not placed.is_empty() and bool(placed[0].get("starter", false)) else 0))
		return placed

	func table_for(tier: String) -> String:
		return str(DB.b("chests.tables.%s" % tier, "chest_" + tier))

	## Distance to the nearest trail: Vegetation's 1 m raster in the game;
	## without it (tests) a coarse 4 m raster, exact near the trails.
	func path_dist(x: float, z: float) -> float:
		if veg and veg.has_method("path_distance"):
			return float(veg.call("path_distance", x, z))
		if _pd.is_empty():
			_build_pd()
		var ix := clampi(int((x + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
		var iz := clampi(int((z + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
		var approx := _pd[iz * _pd_n + ix]
		if approx < trail_clear + 4.0:
			return gen.distance_to_path(x, z)
		return approx

	const PD_CELL := 4.0
	const PD_REACH := 24.0
	var _pd := PackedFloat32Array()
	var _pd_n := 0

	func _build_pd() -> void:
		_pd_n = int(WorldGen.HALF * 2.0 / PD_CELL)
		_pd.resize(_pd_n * _pd_n)
		_pd.fill(99.0)
		for poly in gen.paths:
			var pl: PackedVector2Array = poly
			for i in pl.size() - 1:
				var a := pl[i]
				var b := pl[i + 1]
				var x0 := clampi(int((minf(a.x, b.x) - PD_REACH + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
				var x1 := clampi(int((maxf(a.x, b.x) + PD_REACH + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
				var z0 := clampi(int((minf(a.y, b.y) - PD_REACH + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
				var z1 := clampi(int((maxf(a.y, b.y) + PD_REACH + WorldGen.HALF) / PD_CELL), 0, _pd_n - 1)
				var ab := b - a
				var l2 := maxf(ab.length_squared(), 0.0001)
				for iz in range(z0, z1 + 1):
					for ix in range(x0, x1 + 1):
						var c := Vector2(-WorldGen.HALF + (ix + 0.5) * PD_CELL, -WorldGen.HALF + (iz + 0.5) * PD_CELL)
						var t := clampf((c - a).dot(ab) / l2, 0.0, 1.0)
						var d := c.distance_to(a + ab * t)
						var k := iz * _pd_n + ix
						if d < _pd[k]:
							_pd[k] = d

	## Every rule a chest spot must pass (min_spacing applies to all chests).
	func ok(x: float, z: float, min_camp: float, min_spacing: float) -> bool:
		var lim := WorldGen.PLAYABLE_HALF - 10.0
		if absf(x) > lim or absf(z) > lim:
			return false
		if Vector2(x, z).length() < min_camp:
			return false
		for e in placed:
			var p: Vector3 = e["pos"]
			if Vector2(p.x - x, p.z - z).length() < min_spacing:
				return false
		for a in avoid:
			var v: Vector4 = a
			if Vector2(v.x - x, v.z - z).length() < v.w + 1.0:
				return false
		if gen.slope_at(x, z) > 0.06:
			return false
		var wl := WorldGen.WATER_LEVEL + 0.3
		if gen.height_at(x, z) < wl + 0.15:
			return false
		for o in [Vector2(0.9, 0.0), Vector2(-0.9, 0.0), Vector2(0.0, 0.9), Vector2(0.0, -0.9)]:
			if gen.height_at(x + o.x, z + o.y) < wl:
				return false
		if gen.distance_to_stream(x, z) < 6.0:
			return false
		if path_dist(x, z) < trail_clear:
			return false
		var p3 := Vector3(x, gen.height_at(x, z), z)
		if veg and veg.has_method("is_clear") and not bool(veg.call("is_clear", p3, 1.3)):
			return false
		if _decor_hit(x, z, 1.0):
			return false
		if gather and gather.has_method("is_clear") and not bool(gather.call("is_clear", p3, 1.1)):
			return false
		return true

	## Vegetation decor (bushes, stumps, saplings): `decor_footprints()` ->
	## Array of Vector3(x, z, r) when Vegetation has it, else its decor list
	## read defensively (same as Gatherables). Never required.
	var _decor: Dictionary = {}

	func _index_decor() -> void:
		if veg == null:
			return
		var src: Variant = veg.call("decor_footprints") if veg.has_method("decor_footprints") else veg.get("_decor")
		if not (src is Array):
			return
		for e in (src as Array):
			if e is Vector3:
				_decor_add((e as Vector3).x, (e as Vector3).y, (e as Vector3).z)
			elif e is Array and (e as Array).size() >= 2 and (e as Array)[1] is Transform3D:
				var layer := int((e as Array)[0]) if (e as Array)[0] is int else 0
				var xf: Transform3D = (e as Array)[1]
				var sc := xf.basis.get_scale().x
				var r := 0.0
				if layer >= 20 and layer < 30:
					r = 0.95 * sc
				elif layer >= 40 and layer < 50:
					r = 0.55 * sc
				elif layer >= 50 and layer < 60:
					r = 0.6 * sc
				if r > 0.0:
					_decor_add(xf.origin.x, xf.origin.z, r)

	func _decor_add(x: float, z: float, r: float) -> void:
		var c := Vector2i(int(floor(x / 8.0)), int(floor(z / 8.0)))
		var arr: PackedVector3Array = _decor.get(c, PackedVector3Array())
		arr.append(Vector3(x, z, r))
		_decor[c] = arr

	func _decor_hit(x: float, z: float, r: float) -> bool:
		if _decor.is_empty():
			return false
		var c0 := Vector2i(int(floor((x - r - 1.5) / 8.0)), int(floor((z - r - 1.5) / 8.0)))
		var c1 := Vector2i(int(floor((x + r + 1.5) / 8.0)), int(floor((z + r + 1.5) / 8.0)))
		for cz in range(c0.y, c1.y + 1):
			for cx in range(c0.x, c1.x + 1):
				var key := Vector2i(cx, cz)
				if not _decor.has(key):
					continue
				for dv in (_decor[key] as PackedVector3Array):
					if Vector2(dv.x - x, dv.y - z).length() < r + dv.z:
						return true
		return false

	func add(x: float, z: float, tier: String, anchor: String, starter: bool = false) -> void:
		var rot := face_starter(x, z) if starter else face(x, z)
		placed.append({"pos": Vector3(x, gen.height_at(x, z), z), "tier": tier, "table": table_for(tier),
			"rot": rot, "anchor": anchor, "starter": starter, "variant": rng.randi() % 2})

	## Yaw so the chest's front (+Z) faces direction (dx, dz).
	static func yaw_to(dx: float, dz: float) -> float:
		return atan2(dx, dz)

	func face_starter(x: float, z: float) -> float:
		return yaw_to(-x, -z)

	## Face the nearest trail (so walkers see the lock), else the camp.
	func face(x: float, z: float) -> float:
		var best := 1e9
		var best_a := 0.0
		for i in 12:
			var a := TAU * float(i) / 12.0
			var d := path_dist(x + sin(a) * 7.0, z + cos(a) * 7.0)
			if d < best:
				best = d
				best_a = a
		if best < 14.0:
			return best_a + rng.randf_range(-0.25, 0.25)
		return yaw_to(-x, -z) + rng.randf_range(-0.7, 0.7)

	## The starter: 16-22 m out, in the direction the player looks at the
	## start (past the fire), with a clear line of sight from the clearing.
	func _starter() -> void:
		var dr: Array = DB.b("chests.starter_dist", [16.0, 22.0])
		var d0 := float(dr[0])
		var d1 := float(dr[1])
		var view := (-ChestManager.START_VIEW_FROM).normalized()
		var best := Vector2.INF
		var best_score := INF
		for i in 96:
			var a := TAU * float(i) / 96.0 + rng.randf_range(-0.02, 0.02)
			var dir := Vector2(cos(a), sin(a))
			for k in 4:
				var r := lerpf(d0 + 0.5, d1 - 0.5, float(k) / 3.0)
				var x := dir.x * r
				var z := dir.y * r
				if not ok(x, z, d0 - 0.01, 0.0):
					continue
				# Beside the view line (not hidden behind the player or the fire).
				var ang := absf(absf(dir.angle_to(view)) - deg_to_rad(STARTER_VIEW_OFFSET))
				var score := ang * 2.0 + absf(r - 18.5) * 0.04
				score += blocked(Vector2.ZERO, Vector2(x, z)) * 1.2
				score += blocked(ChestManager.START_VIEW_FROM * 1.6, Vector2(x, z)) * 0.8
				if score < best_score:
					best_score = score
					best = Vector2(x, z)
		if best == Vector2.INF:
			# Nothing fits the rules (should not happen): relax trees/gatherables.
			var a := rng.randf() * TAU
			best = Vector2(cos(a), sin(a)) * (d0 + d1) * 0.5
		add(best.x, best.y, "common", "starter", true)

	## How many trunks stand on the line of sight a -> b (eye height).
	func blocked(a: Vector2, b: Vector2) -> float:
		if veg == null or not veg.has_method("obstacles_near"):
			return 0.0
		var n := 0.0
		var steps := 8
		for i in range(1, steps):
			var p := a.lerp(b, float(i) / steps)
			var obs: Array = veg.call("obstacles_near", Vector3(p.x, 0.0, p.y), 0.7)
			if not obs.is_empty():
				n += 1.0
		return n

	func _far(tier: String, count: int, anchors: Array, min_dist: float) -> void:
		if count <= 0:
			return
		var order := anchors.duplicate()
		_shuffle(order)
		var made := 0
		for anchor in order:
			if made >= count:
				break
			var spot := find_near_anchor(str(anchor), min_dist)
			if spot != Vector2.INF:
				add(spot.x, spot.y, tier, str(anchor))
				made += 1
		# Not enough anchors fitted: far spots on the ridge / shore / forest.
		var tries := 0
		while made < count and tries < 3000:
			tries += 1
			var x := rng.randf_range(-WorldGen.PLAYABLE_HALF, WorldGen.PLAYABLE_HALF)
			var z := rng.randf_range(-WorldGen.PLAYABLE_HALF, WorldGen.PLAYABLE_HALF)
			if Vector2(x, z).length() < min_dist + 20.0:
				continue
			if ok(x, z, min_dist, spacing * 1.3):
				add(x, z, tier, "far")
				made += 1

	func _shuffle(arr: Array) -> void:
		for i in range(arr.size() - 1, 0, -1):
			var j := rng.randi_range(0, i)
			var t: Variant = arr[i]
			arr[i] = arr[j]
			arr[j] = t

	func find_near_anchor(anchor: String, min_dist: float, min_spacing: float = -1.0) -> Vector2:
		var sp := min_spacing if min_spacing > 0.0 else spacing * 1.3
		match anchor:
			"shore":
				var lake: Dictionary = gen.landmarks.get("lake", {"pos": Vector3(-200, 0, 30), "radius": 110.0})
				var c: Vector3 = lake["pos"]
				for _i in 120:
					var a := rng.randf() * TAU
					var r := rng.randf_range(80.0, 140.0)
					var x := c.x + cos(a) * r
					var z := c.z + sin(a) * r * 1.15
					if gen.biome_at(x, z) != "shore":
						continue
					if ok(x, z, min_dist, sp):
						return Vector2(x, z)
			"ridge", "ridge_top":
				var rl: Dictionary = gen.landmarks.get("ridge", {"pos": Vector3(110, 0, -170), "radius": 60.0})
				var c: Vector3 = rl["pos"]
				var best := Vector2.INF
				var best_h := -INF
				for _i in 90:
					var a := rng.randf() * TAU
					var r := sqrt(rng.randf()) * 60.0
					var x := c.x + cos(a) * r
					var z := c.z + sin(a) * r
					if gen.biome_at(x, z) != "ridge" or not ok(x, z, min_dist, sp):
						continue
					if anchor == "ridge":
						return Vector2(x, z)
					var h := gen.height_at(x, z)
					if h > best_h:
						best_h = h
						best = Vector2(x, z)
				return best
			_:
				if not gen.landmarks.has(anchor):
					return Vector2.INF
				var lm: Dictionary = gen.landmarks[anchor]
				var c: Vector3 = lm["pos"]
				var rad := float(lm["radius"])
				var r0 := rad * 0.95 + 3.0
				var r1 := rad * 1.5 + 12.0
				if anchor == "elder_grove":
					r0 = 6.0
					r1 = rad * 0.9
				for _i in 70:
					var a := rng.randf() * TAU
					var r := rng.randf_range(r0, r1)
					var x := c.x + cos(a) * r
					var z := c.z + sin(a) * r
					if ok(x, z, min_dist, sp):
						return Vector2(x, z)
		return Vector2.INF

	func _commons(count: int) -> void:
		var min_d := DB.bf("chests.common_min_dist", 30.0)
		var made := 0
		var tries := 0
		# A couple on the lake shore and on the ridge, so every biome has some.
		for anchor in ["shore", "shore", "ridge", "ridge"]:
			if made >= count:
				break
			var spot := find_near_anchor(str(anchor), min_d, spacing)
			if spot != Vector2.INF:
				add(spot.x, spot.y, "common", str(anchor))
				made += 1
		var lim := WorldGen.PLAYABLE_HALF - 10.0
		var weights := {"forest": 0.75, "meadow": 1.0, "shore": 1.0, "ridge": 0.9, "grove": 0.6, "water": 0.0, "camp": 0.0}
		while made < count and tries < 6000:
			tries += 1
			var x := rng.randf_range(-lim, lim)
			var z := rng.randf_range(-lim, lim)
			if Vector2(x, z).length() < min_d:
				continue
			var biome := gen.biome_at(x, z)
			if rng.randf() > float(weights.get(biome, 0.7)):
				continue
			if not ok(x, z, min_d, spacing):
				continue
			# Most commons sit a few metres off a trail, where walkers find them.
			if path_dist(x, z) > 16.0 and rng.randf() > 0.15:
				continue
			add(x, z, "common", biome)
			made += 1
