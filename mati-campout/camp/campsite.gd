class_name Campsite
extends Node3D
## The home camp around the origin: the campfire (centre) with log seats and
## stumps, the tent (north-east, door facing the fire), a picnic table
## (south-west), the crafting crate with the storage box beside it (west), a
## firewood stack with a chopping block, the "MATI's Campout" sign, a
## lantern pole and small details (bucket, kettle, mugs, backpack, logs).
## Everything is procedural, snapped to WorldGen.height_at, and solid props
## collide on physics layer 1.
##
## Public: campfire, tent, crate, storage_box, cooking_rack, lantern_pole,
## structures (Node3D parent for future buildables), decor (static mesh).
## Every DAWN it scatters kindling twigs around the camp edge (anti-softlock)
## up to balance.camp.safe_kindling_respawn.

const SEED_OFFSET := 5150
## Fire at the origin; everything else in camp-local metres (+X east, -Z north).
const TENT_DOOR_DIST := 4.6
const SIGN_TEXT := "MATI's Campout"

var campfire: Campfire
var tent: Tent
var crate: CraftingCrate
var storage_box: StorageBox
var cooking_rack: CookingRack
var lantern_pole: LanternPole
## Parent for player-built structures (buildables).
var structures: Node3D
var decor: MeshInstance3D

var _gen: WorldGen
var _body: StaticBody3D
var _rng := RandomNumberGenerator.new()
## Camp-local footprints of the static props, Vector3(x, z, radius), recorded
## as they are placed (see clear_zones()).
var _zones: Array = []


func setup(game: Game) -> void:
	GameState.camp = self
	_gen = game.gen if game else GameState.world_gen
	add_to_group("map_marker")
	if _gen:
		global_position = _gen.ground(Vector3.ZERO)
	_rng.seed = GameState.seed + SEED_OFFSET
	structures = Node3D.new()
	structures.name = "Structures"
	add_child(structures)

	campfire = Campfire.new()
	campfire.name = "Campfire"
	add_child(campfire)
	campfire.setup(game)
	cooking_rack = campfire.rack
	await _yield()

	tent = Tent.new()
	var tdir := Vector3(1.0, 0.0, -1.0).normalized()
	tent.door_anchor = tdir * TENT_DOOR_DIST
	tent.facing = -tdir
	add_child(tent)
	await _yield()

	crate = CraftingCrate.new()
	add_child(crate)
	_place(crate, -5.3, -0.2, _yaw_toward(Vector3(-5.3, 0, -0.2), Vector3.ZERO))
	_zone(-5.3, -0.2, 1.0)
	storage_box = StorageBox.new()
	add_child(storage_box)
	_place(storage_box, -4.85, -2.05, _yaw_toward(Vector3(-4.85, 0, -2.05), Vector3(0.0, 0.0, 0.5)))
	_zone(-4.85, -2.05, 0.75)
	lantern_pole = LanternPole.new()
	add_child(lantern_pole)
	_place(lantern_pole, -2.35, 3.35, -0.6)
	_zone(-2.35, 3.35, 0.4)
	await _yield()

	_build_decor()
	_build_sign(Vector3(1.3, 0.0, 7.6), Vector3(0.6, 0.0, 1.0))
	Events.phase_changed.connect(_on_phase_changed)


## World-space circles Vector4(x, y, z, radius) that ground cover should keep
## clear of (fire pit, tent, seats, table, crate, box, firewood, sign...).
## Vegetation may call this to keep grass out of the tent and the fire.
func clear_zones() -> Array:
	var out: Array = []
	for z in _zones:
		var v: Vector3 = z
		out.append(Vector4(global_position.x + v.x, global_position.y + ground_y(v.x, v.y), global_position.z + v.y, v.z))
	if campfire:
		var fp := campfire.global_position
		out.append(Vector4(fp.x, fp.y, fp.z, float(FirePit.cfg(campfire.level)["soot"])))
	if tent and not tent.info.is_empty():
		var tp := tent.global_position
		var r := maxf(float(tent.info["w"]), float(tent.info["d"])) * 0.62
		out.append(Vector4(tp.x, tp.y, tp.z, r))
		var door := tent.get_interact_point()
		out.append(Vector4(door.x, tp.y, door.z, 1.0))
	return out


## Camp obstacles near a point in the Vegetation.obstacles_near format
## [Vector4(x, y, z, r)] so AI can steer around props if it wants to.
func obstacles_near(pos: Vector3, radius: float) -> Array:
	var out: Array = []
	for z in clear_zones():
		var v: Vector4 = z
		if Vector2(v.x - pos.x, v.z - pos.z).length() <= radius + v.w:
			out.append(v)
	return out


func _yield() -> void:
	if is_inside_tree():
		await get_tree().process_frame


## Map marker contract (the map UI may show the camp).
func get_map_marker() -> Dictionary:
	return {"kind": "camp", "label": "Home Camp", "important": false, "discovered": true}


# --- Placement helpers ---------------------------------------------------------------------

## Local ground height (relative to the campsite origin) at camp-local x, z.
func ground_y(x: float, z: float) -> float:
	if _gen == null:
		return 0.0
	var w := global_position + Vector3(x, 0.0, z)
	return _gen.height_at(w.x, w.z) - global_position.y


## Lowest ground under a footprint (so wide props never float).
func ground_min(x: float, z: float, radius: float) -> float:
	var y := ground_y(x, z)
	for a in 4:
		var ang := TAU * float(a) / 4.0 + PI * 0.25
		y = minf(y, ground_y(x + cos(ang) * radius, z + sin(ang) * radius))
	return y


func _place(n: Node3D, x: float, z: float, yaw: float, radius: float = 0.6) -> void:
	n.position = Vector3(x, ground_min(x, z, radius) - 0.015, z)
	n.rotation = Vector3(0.0, yaw, 0.0)


func _zone(x: float, z: float, r: float) -> void:
	_zones.append(Vector3(x, z, r))


## Yaw that turns local +Z from `from` toward `to`.
static func _yaw_toward(from: Vector3, to: Vector3) -> float:
	var d := to - from
	return atan2(d.x, d.z)


func _xf(x: float, z: float, yaw: float, radius: float = 0.4, sink: float = 0.02) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, yaw), Vector3(x, ground_min(x, z, radius) - sink, z))


# --- Static decor (one mesh + one body) ------------------------------------------------------

func _build_decor() -> void:
	var k := CampKit.new()
	var shapes: Array = []
	# Seats around the fire: three log benches and two stumps.
	var benches := [
		[-2.95, 0.35, PI * 0.5 + 0.08, 1.9],
		[-0.55, 3.0, 0.05, 1.8],
		[-0.9, -2.95, -0.25, 1.7],
	]
	for i in benches.size():
		var b: Array = benches[i]
		shapes.append_array(CampProps.log_bench(k, _xf(b[0], b[1], b[2], 0.8, 0.05), b[3], 6100 + i))
		_zone(b[0], b[1], float(b[3]) * 0.55)
	shapes.append_array(CampProps.stump_seat(k, _xf(2.75, -0.9, 0.3), 0.27, 0.44, 6201))
	shapes.append_array(CampProps.stump_seat(k, _xf(2.15, 2.25, 1.1), 0.25, 0.4, 6202))
	_zone(2.75, -0.9, 0.45)
	_zone(2.15, 2.25, 0.45)
	# Picnic table (south-west) with a kettle, mugs and a plate.
	var tt := _xf(-3.75, 3.85, PI * 0.25, 1.0, 0.03)
	shapes.append_array(CampProps.picnic_table(k, tt))
	_zone(-3.75, 3.85, 1.4)
	var top := 0.785
	CampProps.kettle(k, tt * Transform3D(Basis(Vector3.UP, 0.8), Vector3(0.45, top, 0.05)))
	CampProps.mug(k, tt * Transform3D(Basis(Vector3.UP, 0.4), Vector3(-0.2, top, 0.18)))
	CampProps.mug(k, tt * Transform3D(Basis(Vector3.UP, 2.4), Vector3(-0.42, top, -0.16)), CampProps.ENAMEL_RED)
	CampProps.plate(k, tt * Transform3D(Basis.IDENTITY, Vector3(0.05, top, -0.17)))
	# Firewood stack and chopping block (north-west, between crate and tent).
	var fw := _xf(-3.7, -4.45, _yaw_toward(Vector3(-3.7, 0, -4.45), Vector3.ZERO), 0.9)
	shapes.append_array(CampProps.firewood_stack(k, fw, 6301))
	shapes.append_array(CampProps.chopping_block(k, _xf(-1.75, -5.0, 0.7), 6302))
	_zone(-3.7, -4.45, 1.1)
	_zone(-1.75, -5.0, 0.75)
	CampProps.loose_log(k, _xf(-5.0, -3.6, 1.2, 0.5), 0.9, 0.12, 6303)
	CampProps.loose_log(k, _xf(-2.6, -5.85, 0.4, 0.5), 0.75, 0.1, 6304)
	# A water bucket by the fire (fire safety!) and a backpack by a bench.
	shapes.append_array(CampProps.bucket(k, _xf(-2.0, 2.15, 0.0)))
	_zone(-2.0, 2.15, 0.35)
	CampProps.backpack(k, _xf(-3.35, 1.75, PI * 0.5 - 0.4))
	# A few stones scattered around the camp edge.
	for i in 6:
		var a := TAU * float(i) / 6.0 + _rng.randf_range(-0.3, 0.3)
		var d := _rng.randf_range(8.5, 10.5)
		var x := cos(a) * d
		var z := sin(a) * d
		var sz := Vector3(_rng.randf_range(0.18, 0.32), _rng.randf_range(0.12, 0.22), _rng.randf_range(0.16, 0.28))
		k.stone(Vector3(x, ground_y(x, z) + sz.y * 0.35, z), sz, 6400 + i, CampKit.STONE_COLOR.lerp(Color("#77746e"), _rng.randf()), _rng.randf() * TAU)
	decor = CampKit.instance(k, null, "Decor")
	add_child(decor)
	_body = StaticBody3D.new()
	_body.name = "DecorBody"
	_body.collision_layer = 1
	_body.collision_mask = 0
	_body.set_meta("surface", "wood")
	for e in shapes:
		var d: Dictionary = e
		var cs := CollisionShape3D.new()
		cs.shape = d["shape"]
		cs.transform = d["xform"]
		_body.add_child(cs)
	add_child(_body)


## The "MATI's Campout" sign at the camp entrance, facing `facing_dir`.
func _build_sign(at: Vector3, facing_dir: Vector3) -> void:
	var w := 2.3
	var bh := 0.6
	var top := 1.95
	var yaw := atan2(facing_dir.x, facing_dir.z)
	_zone(at.x, at.z, w * 0.6)
	var t := _xf(at.x, at.z, yaw, 1.0, 0.05)
	var k := CampKit.new()
	var shapes := CampProps.camp_sign(k, Transform3D.IDENTITY, w, bh, top)
	var sign_node := Node3D.new()
	sign_node.name = "CampSign"
	sign_node.transform = t
	add_child(sign_node)
	sign_node.add_child(CampKit.instance(k, null, "SignMesh"))
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	for e in shapes:
		var d: Dictionary = e
		var cs := CollisionShape3D.new()
		cs.shape = d["shape"]
		cs.transform = d["xform"]
		body.add_child(cs)
	sign_node.add_child(body)
	var label := Label3D.new()
	label.name = "SignText"
	label.text = SIGN_TEXT
	label.font = ThemeFactory.font("display_bold")
	label.font_size = 96
	label.pixel_size = 0.0028
	label.modulate = Color(1.0, 0.9, 0.62)
	label.outline_size = 10
	label.outline_modulate = Color(0.28, 0.16, 0.07)
	label.shaded = true
	label.double_sided = false
	label.alpha_cut = Label3D.ALPHA_CUT_OPAQUE_PREPASS
	label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	label.position = Vector3(0.0, top - bh * 0.5, 0.034)
	sign_node.add_child(label)


# --- Anti-softlock: kindling at dawn -----------------------------------------------------------

func _on_phase_changed(phase: int) -> void:
	if phase == DayCycle.Phase.DAWN:
		spawn_dawn_kindling()


## Scatter kindling twigs around the camp edge until there are
## balance.camp.safe_kindling_respawn lying around. Returns how many spawned.
func spawn_dawn_kindling() -> int:
	var want := DB.bi("camp.safe_kindling_respawn", 4)
	if want <= 0 or not is_inside_tree():
		return 0
	var have := 0
	for n in get_tree().get_nodes_in_group("pickup"):
		var p := n as Node3D
		if p and is_instance_valid(p) and str(p.get("item_id")) == "kindling":
			if p.global_position.distance_to(global_position) < 25.0:
				have += int(p.get("count")) if p.get("count") != null else 1
	var rng := RandomNumberGenerator.new()
	rng.seed = GameState.seed + SEED_OFFSET + 31 * GameState.day_cycle.day
	var ring: Variant = DB.b("camp.kindling_ring", [9.0, 13.0])
	var ring_min := 9.0
	var ring_max := 13.0
	if ring is Array and (ring as Array).size() >= 2:
		ring_min = float(ring[0])
		ring_max = float(ring[1])
	var spawned := 0
	var tries := 0
	while have + spawned < want and tries < 40:
		tries += 1
		var a := rng.randf() * TAU
		var d := rng.randf_range(ring_min, ring_max)
		var x := cos(a) * d
		var z := sin(a) * d
		if _gen and (_gen.is_water(global_position.x + x, global_position.z + z)):
			continue
		var pos := global_position + Vector3(x, ground_y(x, z) + 0.3, z)
		if Pickup.spawn("kindling", 1, pos) != null:
			spawned += 1
		else:
			break
	return spawned
