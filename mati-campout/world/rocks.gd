class_name Rocks
extends Node3D
## Mossy boulders and scattered stones. Most sit along the Rocky Ridge, on
## slopes and on the lake shore; a few dot the forest and frame the camp
## clearing. Big boulders collide (layer 1, "world") and are registered as
## obstacles with the Vegetation spatial hash so creatures walk around them.
## Rendering: 64 m chunks, one MultiMesh per chunk and variant with a near
## (detailed) and far (low-poly, big rocks only) LOD.

const CHUNK := 64.0
const SEED_ROCKS := 7207
## World radius from which a boulder gets collision and an obstacle entry.
const COLLIDE_SCALE := 0.85
## Rocks smaller than this are only drawn up close.
const FAR_MIN_SCALE := 0.6
const RANGES := {"high": [90.0, 260.0], "medium": [72.0, 190.0], "low": [55.0, 130.0]}

var veg: Vegetation
var gen: WorldGen
var _count := 0
## chunk index -> {variant -> {"x": Array[Transform3D], "c": PackedColorArray}}
var _data: Dictionary = {}
var _near: Array[MultiMeshInstance3D] = []
var _far: Array[MultiMeshInstance3D] = []
var _nch := 0


func setup(p_veg: Vegetation) -> void:
	veg = p_veg
	gen = p_veg.gen if p_veg else null
	if gen == null:
		return
	_nch = int(ceil(WorldGen.HALF * 2.0 / CHUNK))
	_place()
	await get_tree().process_frame
	_build()
	apply_quality()


func rock_count() -> int:
	return _count


func _add(pos: Vector3, variant: int, s: float, yaw: float, tilt: Vector3, cu: Color, body_holder: Dictionary) -> void:
	var b := Basis(Vector3.UP, yaw)
	if tilt.length_squared() > 0.0001:
		b = Basis(tilt.normalized(), tilt.length()) * b
	b = b.scaled(Vector3.ONE * s)
	var xf := Transform3D(b, pos)
	var cx := clampi(int(floor((pos.x + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	var cz := clampi(int(floor((pos.z + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	var ci := cz * _nch + cx
	if not _data.has(ci):
		_data[ci] = {}
	var cd: Dictionary = _data[ci]
	if not cd.has(variant):
		var xs: Array[Transform3D] = []
		cd[variant] = {"x": xs, "c": PackedColorArray()}
	var vd: Dictionary = cd[variant]
	(vd["x"] as Array).append(xf)
	var cc: PackedColorArray = vd["c"]
	cc.append(cu)
	vd["c"] = cc
	_count += 1
	if s >= COLLIDE_SCALE:
		var pts := PackedVector3Array()
		for p in TreeMeshes.rock_hull(variant):
			pts.append(b * p)
		var shape := ConvexPolygonShape3D.new()
		shape.points = pts
		var body: StaticBody3D = body_holder.get(ci)
		if body == null:
			body = StaticBody3D.new()
			body.name = "Boulders%d" % ci
			body.collision_layer = 1
			body.collision_mask = 0
			add_child(body)
			body_holder[ci] = body
		var owner_id := body.create_shape_owner(body)
		body.shape_owner_add_shape(owner_id, shape)
		body.shape_owner_set_transform(owner_id, Transform3D(Basis(), pos))
		var stretch: float = [1.0, 0.8, 1.35, 1.15][variant]
		veg.add_obstacle(pos, s * 0.85 * maxf(stretch, 1.0))


func _place() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(GameState.seed) * 13 + SEED_ROCKS
	var bodies := {}
	var cell := 7.0
	var n := int(WorldGen.HALF * 2.0 / cell)
	for iz in n:
		for ix in n:
			var x := -WorldGen.HALF + (float(ix) + rng.randf_range(0.1, 0.9)) * cell
			var z := -WorldGen.HALF + (float(iz) + rng.randf_range(0.1, 0.9)) * cell
			var roll := rng.randf()
			var size_roll := rng.randf()
			var variant := rng.randi_range(0, TreeMeshes.ROCK_VARIANTS - 1)
			var yaw := rng.randf() * TAU
			var h := gen.height_at(x, z)
			if h < WorldGen.WATER_LEVEL - 0.7:
				continue
			var rf := gen.rock_factor(x, z)
			var p := 0.018 + rf * 0.32
			if roll > p:
				continue
			var camp_d := Vector2(x, z).length()
			if camp_d < 16.0:
				continue
			var s := 0.25 + pow(size_roll, 2.6) * (1.6 + rf * 1.6)
			if veg.path_distance(x, z) < 1.4 + s:
				continue
			if gen.clearing_factor(x, z) > 0.45 and camp_d > 32.0:
				continue
			if not veg.is_clear(Vector3(x, 0, z), s * 0.9):
				continue
			var shore := h < WorldGen.WATER_LEVEL + 0.6
			var moss := clampf(0.25 + veg.canopy_at(x, z) * 0.6 + (0.25 if shore else 0.0) - rf * 0.25 + rng.randf_range(-0.15, 0.15), 0.0, 1.0)
			var warm := clampf(0.15 + rf * 0.45 + rng.randf_range(-0.1, 0.1), 0.0, 1.0)
			var nrm := gen.normal_at(x, z)
			var tilt := Vector3.UP.cross(nrm) * 0.6 + Vector3(rng.randf_range(-0.08, 0.08), 0.0, rng.randf_range(-0.08, 0.08))
			var pos := Vector3(x, h - 0.12 * s - 0.05, z)
			_add(pos, variant, s, yaw, tilt, Color(moss, rng.randf_range(0.4, 0.6), rng.randf(), warm), bodies)
	# A few mossy rocks framing the camp clearing (never inside it).
	var framed := 0
	for attempt in 40:
		if framed >= 5:
			break
		var a := rng.randf() * TAU
		var r := rng.randf_range(17.0, 26.0)
		var x := cos(a) * r
		var z := sin(a) * r
		if gen.is_water(x, z) or veg.path_distance(x, z) < 3.5:
			continue
		var s := rng.randf_range(0.45, 0.95)
		if not veg.is_clear(Vector3(x, 0, z), s + 1.0):
			continue
		var pos := Vector3(x, gen.height_at(x, z) - 0.12 * s - 0.05, z)
		_add(pos, rng.randi_range(0, 3), s, rng.randf() * TAU, Vector3.ZERO, Color(0.65, rng.randf_range(0.45, 0.6), rng.randf(), 0.25), bodies)
		framed += 1


func _build() -> void:
	for ci in _data:
		var cd: Dictionary = _data[ci]
		var holder := Node3D.new()
		holder.name = "RockChunk%d" % ci
		add_child(holder)
		for variant in cd:
			var vd: Dictionary = cd[variant]
			var xs: Array = vd["x"]
			var cs: PackedColorArray = vd["c"]
			_near.append(_mmi(TreeMeshes.rock(variant, 0), xs, cs, holder, 0.0))
			var far_x: Array = []
			var far_c := PackedColorArray()
			for i in xs.size():
				var xf: Transform3D = xs[i]
				if xf.basis.get_scale().x >= FAR_MIN_SCALE:
					far_x.append(xf)
					far_c.append(cs[i])
			if not far_x.is_empty():
				_far.append(_mmi(TreeMeshes.rock(variant, 1), far_x, far_c, holder, FAR_MIN_SCALE))


func _mmi(mesh: Mesh, xs: Array, cs: PackedColorArray, parent: Node3D, _min_scale: float) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = xs.size()
	for i in xs.size():
		mm.set_instance_transform(i, xs[i])
		mm.set_instance_custom_data(i, cs[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	mmi.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	parent.add_child(mmi)
	return mmi


func apply_quality() -> void:
	var q := Settings.quality()
	var r: Array = RANGES.get(q, RANGES["high"])
	var near_end: float = r[0]
	var far_end: float = r[1]
	for m in _near:
		m.visibility_range_begin = 0.0
		m.visibility_range_end = near_end
		m.visibility_range_end_margin = 8.0
		m.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for m in _far:
		m.visibility_range_begin = near_end
		m.visibility_range_begin_margin = 8.0
		m.visibility_range_end = far_end
		m.visibility_range_end_margin = 8.0
		m.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if q == "high" else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
