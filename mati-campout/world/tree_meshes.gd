class_name TreeMeshes
extends RefCounted
## Procedural vegetation meshes and materials, built once and cached.
##
## Trees are single-surface meshes (bark + needles share foliage_tree.gdshader)
## so each MultiMesh chunk costs one draw call. Every mesh is deterministic
## (fixed per-variant seeds) so all runs share the same art.
##
## Model space: base of the plant at the origin, +Y up. Regular trees are
## built at REF_HEIGHT and scaled per instance; trunks reach 0.6 m below the
## ground so they never float on slopes.

const MAT_BARK := 0.0
const MAT_NEEDLES := 1.0
const MAT_LEAVES := 2.0

## Regular (choppable) tree variants.
enum { PINE_A, PINE_B, PINE_C, PINE_D, SNAG }
const TREE_VARIANTS := 5
const ELDER_VARIANTS := 2
const BUSH_VARIANTS := 2
const ROCK_VARIANTS := 4
const GRASS_VARIANTS := 2

## Height (model units) and base trunk radius of each regular variant.
const TREE_SPECS := [
	{"name": "fir", "height": 14.0, "trunk": 0.36, "tiers": 7, "crown_base": 3.6, "radius": 3.6, "spikes": 14, "droop": 1.25, "shape": 1.05, "jitter": 0.12, "seed": 11},
	{"name": "spruce", "height": 16.5, "trunk": 0.34, "tiers": 9, "crown_base": 3.4, "radius": 3.0, "spikes": 15, "droop": 1.4, "shape": 0.95, "jitter": 0.1, "seed": 23},
	{"name": "old_pine", "height": 12.5, "trunk": 0.43, "tiers": 6, "crown_base": 4.2, "radius": 4.0, "spikes": 12, "droop": 1.05, "shape": 1.2, "jitter": 0.2, "seed": 37},
	{"name": "young_fir", "height": 10.5, "trunk": 0.27, "tiers": 7, "crown_base": 2.3, "radius": 2.8, "spikes": 13, "droop": 1.35, "shape": 1.0, "jitter": 0.1, "seed": 41},
	{"name": "snag", "height": 11.0, "trunk": 0.33, "tiers": 0, "crown_base": 0.0, "radius": 0.0, "spikes": 0, "droop": 0.0, "shape": 1.0, "jitter": 0.0, "seed": 53},
]
const ELDER_HEIGHT := 34.0
const ELDER_TRUNK := 2.4
## Collision/obstacle radius of an Elder Tree trunk (model units).
const ELDER_COLLIDE := 3.0

static var _meshes: Dictionary = {}
static var _materials: Dictionary = {}
static var _ico_cache: Dictionary = {}
static var _rock_hulls: Dictionary = {}


# =============================================================================
# Mesh data builder
# =============================================================================

class MeshData:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uvs := PackedVector2Array()
	var custom := PackedFloat32Array()
	var indices := PackedInt32Array()

	func add(v: Vector3, n: Vector3, c: Color, uv: Vector2, cu: Color) -> int:
		verts.append(v)
		normals.append(n.normalized() if n.length_squared() > 0.000001 else Vector3.UP)
		colors.append(c)
		uvs.append(uv)
		custom.append(cu.r)
		custom.append(cu.g)
		custom.append(cu.b)
		custom.append(cu.a)
		return verts.size() - 1

	## Adds a triangle, flipping it if needed so the front face agrees with
	## the vertex normals (Godot front faces are clockwise).
	func tri(a: int, b: int, c: int) -> void:
		var va := verts[a]
		var n := normals[a] + normals[b] + normals[c]
		if (verts[b] - va).cross(verts[c] - va).dot(n) > 0.0:
			indices.append(a)
			indices.append(c)
			indices.append(b)
		else:
			indices.append(a)
			indices.append(b)
			indices.append(c)

	## Triangle with fixed winding (for double-sided surfaces).
	func tri_raw(a: int, b: int, c: int) -> void:
		indices.append(a)
		indices.append(b)
		indices.append(c)

	func quad(a: int, b: int, c: int, d: int) -> void:
		tri(a, b, c)
		tri(a, c, d)

	func vertex_count() -> int:
		return verts.size()

	## Blend vertex normals in [v0, v1) toward smoothed geometric normals of
	## the triangles in index range [i0, i1) (keeps soft shading but lets
	## creases and folds catch the light).
	func blend_geometric_normals(v0: int, v1: int, i0: int, i1: int, amount: float) -> void:
		var acc := PackedVector3Array()
		acc.resize(v1 - v0)
		for i in range(i0, i1, 3):
			var a := indices[i]
			var b := indices[i + 1]
			var c := indices[i + 2]
			# Front faces are clockwise: the face normal is -cross(b - a, c - a).
			var fn := -(verts[b] - verts[a]).cross(verts[c] - verts[a])
			for v: int in [a, b, c]:
				if v >= v0 and v < v1:
					acc[v - v0] += fn
		for v in range(v0, v1):
			var g := acc[v - v0]
			if g.length_squared() > 0.0000001:
				normals[v] = normals[v].lerp(g.normalized(), amount).normalized()

	func commit(material: Material, mesh: ArrayMesh = null) -> ArrayMesh:
		var m := mesh if mesh else ArrayMesh.new()
		if verts.is_empty():
			return m
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_COLOR] = colors
		arrays[Mesh.ARRAY_TEX_UV] = uvs
		arrays[Mesh.ARRAY_CUSTOM0] = custom
		arrays[Mesh.ARRAY_INDEX] = indices
		var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
		m.surface_set_material(m.get_surface_count() - 1, material)
		return m


static func _ao(v: float) -> Color:
	return Color(v, v, v, 1.0)


static func _dir(angle: float) -> Vector3:
	return Vector3(cos(angle), 0.0, sin(angle))


# =============================================================================
# Materials
# =============================================================================

static func _shader_mat(key: String, path: String) -> ShaderMaterial:
	if _materials.has(key):
		return _materials[key]
	var m := ShaderMaterial.new()
	m.shader = ShaderCompat.shader(path)
	_materials[key] = m
	return m


static func mat_tree() -> ShaderMaterial:
	return _shader_mat("tree", "res://shaders/foliage_tree.gdshader")


static func mat_bark() -> ShaderMaterial:
	return _shader_mat("bark", "res://shaders/bark.gdshader")


static func mat_rock() -> ShaderMaterial:
	return _shader_mat("rock", "res://shaders/rock.gdshader")


## Ground cover material; `fade_start`/`fade_end` shrink plants into the ground
## near their draw distance.
static func mat_grass(key: String = "grass", fade_start: float = 34.0, fade_end: float = 50.0, wind: float = 0.22) -> ShaderMaterial:
	var full := "grass_" + key
	if _materials.has(full):
		return _materials[full]
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/grass.gdshader")
	m.set_shader_parameter("fade_start", fade_start)
	m.set_shader_parameter("fade_end", fade_end)
	m.set_shader_parameter("wind_amount", wind)
	_materials[full] = m
	return m


# =============================================================================
# Public mesh accessors (cached)
# =============================================================================

static func _cached(key: String, builder: Callable) -> ArrayMesh:
	if _meshes.has(key):
		return _meshes[key]
	var m: ArrayMesh = builder.call()
	_meshes[key] = m
	return m


## Regular tree variant (PINE_A..SNAG); lod 0 = full detail, 1 = far.
static func tree(variant: int, lod: int = 0) -> ArrayMesh:
	variant = clampi(variant, 0, TREE_VARIANTS - 1)
	return _cached("tree_%d_%d" % [variant, lod], func() -> ArrayMesh: return _build_tree(variant, lod))


static func tree_height(variant: int) -> float:
	return float(TREE_SPECS[clampi(variant, 0, TREE_VARIANTS - 1)]["height"])


static func tree_trunk_radius(variant: int) -> float:
	return float(TREE_SPECS[clampi(variant, 0, TREE_VARIANTS - 1)]["trunk"])


static func elder(variant: int, lod: int = 0) -> ArrayMesh:
	variant = clampi(variant, 0, ELDER_VARIANTS - 1)
	return _cached("elder_%d_%d" % [variant, lod], func() -> ArrayMesh: return _build_elder(variant, lod))


static func sapling() -> ArrayMesh:
	return _cached("sapling", _build_sapling)


## Stump with a 0.4 m trunk radius (scale by trunk_radius / 0.4).
static func stump() -> ArrayMesh:
	return _cached("stump", _build_stump)


static func fallen_log(variant: int = 0) -> ArrayMesh:
	return _cached("log_%d" % variant, func() -> ArrayMesh: return _build_log(variant))


static func bush(variant: int = 0) -> ArrayMesh:
	return _cached("bush_%d" % variant, func() -> ArrayMesh: return _build_bush(variant))


static func fern() -> ArrayMesh:
	return _cached("fern", _build_fern)


static func grass(variant: int = 0) -> ArrayMesh:
	return _cached("grass_%d" % variant, func() -> ArrayMesh: return _build_grass(variant))


static func flowers() -> ArrayMesh:
	return _cached("flowers", _build_flowers)


static func mushrooms(red: bool) -> ArrayMesh:
	return _cached("mush_%s" % ("red" if red else "brown"), func() -> ArrayMesh: return _build_mushrooms(red))


static func debris() -> ArrayMesh:
	return _cached("debris", _build_debris)


static func rock(variant: int, lod: int = 0) -> ArrayMesh:
	variant = clampi(variant, 0, ROCK_VARIANTS - 1)
	return _cached("rock_%d_%d" % [variant, lod], func() -> ArrayMesh: return _build_rock(variant, lod))


## Low-res convex point cloud of a rock variant (model space) for collision.
static func rock_hull(variant: int) -> PackedVector3Array:
	variant = clampi(variant, 0, ROCK_VARIANTS - 1)
	if not _rock_hulls.has(variant):
		_rock_hulls[variant] = _rock_points(variant, 1)
	return _rock_hulls[variant]


# =============================================================================
# Shared pieces
# =============================================================================

## A tapered tube along a polyline (branches, roots, twigs, stubs).
static func _tube(md: MeshData, pts: PackedVector3Array, radii: PackedFloat32Array, segs: int,
		ao: PackedFloat32Array, cust: Color, sway_top: float, total_h: float, cap_end: bool = true) -> void:
	var n := pts.size()
	if n < 2:
		return
	var base := md.vertex_count()
	var length_acc := 0.0
	for i in n:
		var t: Vector3
		if i == 0:
			t = pts[1] - pts[0]
		elif i == n - 1:
			t = pts[i] - pts[i - 1]
		else:
			t = pts[i + 1] - pts[i - 1]
		t = t.normalized()
		var ref := Vector3.UP if absf(t.y) < 0.9 else Vector3.RIGHT
		var b1 := t.cross(ref).normalized()
		var b2 := t.cross(b1).normalized()
		if i > 0:
			length_acc += pts[i].distance_to(pts[i - 1])
		for s in segs + 1:
			var a := TAU * float(s) / segs
			var dir := b1 * cos(a) + b2 * sin(a)
			var p := pts[i] + dir * radii[i]
			var c := cust
			c.r = clampf(sway_top * clampf(p.y / maxf(total_h, 0.01), 0.0, 1.0), 0.0, 1.0)
			md.add(p, dir, _ao(ao[i]), Vector2(float(s) / segs * 0.6, length_acc), c)
	for i in n - 1:
		for s in segs:
			var a0 := base + i * (segs + 1) + s
			var b0 := base + (i + 1) * (segs + 1) + s
			md.quad(a0, a0 + 1, b0 + 1, b0)
	if cap_end and radii[n - 1] > 0.001:
		var tip_t := (pts[n - 1] - pts[n - 2]).normalized()
		var c2 := cust
		c2.r = clampf(sway_top * clampf(pts[n - 1].y / maxf(total_h, 0.01), 0.0, 1.0), 0.0, 1.0)
		var tip := md.add(pts[n - 1] + tip_t * radii[n - 1] * 0.8, tip_t, _ao(ao[n - 1]), Vector2(0.3, length_acc), c2)
		var last := base + (n - 1) * (segs + 1)
		for s in segs:
			md.tri(last + s, last + s + 1, tip)


static func _icosphere(subdiv: int) -> Array:
	if _ico_cache.has(subdiv):
		return _ico_cache[subdiv]
	var t := (1.0 + sqrt(5.0)) / 2.0
	var verts: Array[Vector3] = [
		Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0),
		Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t),
		Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1),
	]
	for i in verts.size():
		verts[i] = verts[i].normalized()
	var faces: Array = [
		[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
		[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
		[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
	]
	for _s in subdiv:
		var mid := {}
		var nf: Array = []
		for f in faces:
			var m: Array[int] = []
			for e in 3:
				var a: int = f[e]
				var b: int = f[(e + 1) % 3]
				var key := Vector2i(mini(a, b), maxi(a, b))
				if not mid.has(key):
					verts.append(((verts[a] + verts[b]) * 0.5).normalized())
					mid[key] = verts.size() - 1
				m.append(int(mid[key]))
			nf.append([f[0], m[0], m[2]])
			nf.append([f[1], m[1], m[0]])
			nf.append([f[2], m[2], m[1]])
			nf.append([m[0], m[1], m[2]])
		faces = nf
	var pv := PackedVector3Array(verts)
	var idx := PackedInt32Array()
	for f in faces:
		idx.append(int(f[0]))
		idx.append(int(f[1]))
		idx.append(int(f[2]))
	var res := [pv, idx]
	_ico_cache[subdiv] = res
	return res


## A small blob (sap spot, mushroom cap filler, bush core).
static func _blob(md: MeshData, center: Vector3, radii: Vector3, ao_top: float, ao_bottom: float, cust: Color, subdiv: int = 1) -> void:
	var ico: Array = _icosphere(subdiv)
	var pv: PackedVector3Array = ico[0]
	var idx: PackedInt32Array = ico[1]
	var base := md.vertex_count()
	for v in pv:
		var p := center + Vector3(v.x * radii.x, v.y * radii.y, v.z * radii.z)
		var n := Vector3(v.x / maxf(radii.x, 0.001), v.y / maxf(radii.y, 0.001), v.z / maxf(radii.z, 0.001))
		var a := lerpf(ao_bottom, ao_top, v.y * 0.5 + 0.5)
		md.add(p, n, _ao(a), Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5), cust)
	for i in range(0, idx.size(), 3):
		md.tri(base + idx[i], base + idx[i + 1], base + idx[i + 2])


# =============================================================================
# Needle tiers
# =============================================================================

static func _tier_sway(y: float, radial: float, tree_h: float) -> float:
	return clampf(sqrt(clampf(y / tree_h, 0.0, 1.0)) * 0.78 + radial * 0.3, 0.0, 1.0)


## One drooping, jagged needle tier ("skirt") around the trunk.
##  attach_y: where the tier meets the trunk; radius: rim radius; drop: how far
##  the rim hangs below attach_y; spikes: branch sprays around the rim. Each
##  spray has a raised spine (crease) so light picks out individual branches.
static func _tier(md: MeshData, tier_seed: int, attach_y: float, radius: float, drop: float,
		spikes: int, tree_h: float, shade: float, jitter: float, lod: int, apex_y: float = -1.0, notch: float = 1.0) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = tier_seed
	var per := 3 if lod == 0 else 2
	var segs := spikes * per
	var rot := rng.randf() * TAU
	var off := Vector3(rng.randf_range(-1.0, 1.0), 0.0, rng.randf_range(-1.0, 1.0)) * radius * jitter * 0.35
	var top_y := attach_y + drop * 0.22 if apex_y < 0.0 else apex_y
	var v_start := md.vertex_count()
	var i_start := md.indices.size()
	# Rim pattern per spray: tip, shoulder (sub-tip), notch.
	var pat_r := PackedFloat32Array([1.0, 1.0 - 0.16 * notch, 1.0 - 0.36 * notch] if per == 3 else [1.0, 1.0 - 0.34 * notch])
	var pat_d := PackedFloat32Array([1.12, 0.96, 0.78] if per == 3 else [1.1, 0.8])
	var pat_crease := PackedFloat32Array([1.0, 0.25, -0.7] if per == 3 else [1.0, -0.6])
	var pat_tip := PackedFloat32Array([1.0, 0.75, 0.45] if per == 3 else [1.0, 0.5])
	var rim_r := PackedFloat32Array()
	var rim_d := PackedFloat32Array()
	for s in segs:
		var k := s % per
		var spray := rng.randf_range(0.88, 1.12) if k == 0 else 1.0
		rim_r.append(radius * pat_r[k] * spray * rng.randf_range(0.95, 1.05))
		rim_d.append(drop * pat_d[k] * rng.randf_range(0.92, 1.08))
	var uv_k := float(spikes) * 0.5 / float(segs)
	# Top-surface rings: [radius fraction, drop fraction, ao, tip]
	var rings: Array = []
	if lod == 0:
		rings = [[0.3, -0.04, 0.5, 0.12], [0.64, 0.32, 0.74, 0.4]]
	else:
		rings = [[0.55, 0.22, 0.66, 0.3]]
	var apex := md.add(Vector3(0.0, top_y, 0.0), Vector3.UP, _ao(0.42 * shade), Vector2(0.0, 0.0),
			Color(_tier_sway(top_y, 0.0, tree_h), MAT_NEEDLES, 0.0, 0.0))
	var prev_start := -1
	for ring in rings:
		var rf: float = ring[0]
		var hf: float = ring[1]
		var start := md.vertex_count()
		for s in segs + 1:
			var si := s % segs
			var k := si % per
			var a := rot + TAU * float(s) / segs
			var d := _dir(a)
			var crease := pat_crease[k] * drop * 0.16 * sin(PI * clampf(rf * 1.1, 0.0, 1.0))
			var r := rim_r[si] * rf * (1.0 if k == 0 else 0.94)
			var p := off * rf + d * r
			p.y = attach_y - rim_d[si] * hf + drop * 0.08 * (1.0 - rf) + crease
			var nrm := (d * (0.25 + rf * 0.6) + Vector3.UP * (1.0 - rf * 0.35)).normalized()
			var ao := float(ring[2]) * shade * (1.0 if k == 0 else 0.88)
			md.add(p, nrm, _ao(ao), Vector2(float(s) * uv_k, rf), Color(_tier_sway(p.y, rf, tree_h), MAT_NEEDLES, float(ring[3]) * pat_tip[k], 0.0))
		if prev_start < 0:
			for s in segs:
				md.tri(apex, start + s, start + s + 1)
		else:
			for s in segs:
				md.quad(prev_start + s, prev_start + s + 1, start + s + 1, start + s)
		prev_start = start
	# Rim (top side)
	var rim_start := md.vertex_count()
	for s in segs + 1:
		var si := s % segs
		var k := si % per
		var a := rot + TAU * float(s) / segs
		var d := _dir(a)
		var p := off + d * rim_r[si]
		p.y = attach_y - rim_d[si]
		var nrm := (d * 0.95 + Vector3.UP * 0.42).normalized()
		var ao := lerpf(0.8, 1.0, pat_tip[k]) * shade
		md.add(p, nrm, _ao(ao), Vector2(float(s) * uv_k, 1.0), Color(_tier_sway(p.y, 1.0, tree_h), MAT_NEEDLES, pat_tip[k], 0.0))
	for s in segs:
		md.quad(prev_start + s, prev_start + s + 1, rim_start + s + 1, rim_start + s)
	md.blend_geometric_normals(v_start, md.vertex_count(), i_start, md.indices.size(), 0.5)
	# Underside: rim -> inner ring -> trunk. Normals lean outward so the
	# shaded undersides still pick up sky light instead of going black.
	var under_rim := md.vertex_count()
	for s in segs + 1:
		var si := s % segs
		var a := rot + TAU * float(s) / segs
		var d := _dir(a)
		var p := off + d * rim_r[si]
		p.y = attach_y - rim_d[si]
		md.add(p, (d * 0.9 + Vector3.UP * 0.1).normalized(), _ao(0.78 * shade), Vector2(float(s) * uv_k, 1.0), Color(_tier_sway(p.y, 1.0, tree_h), MAT_NEEDLES, 0.55, 0.0))
	var inner := md.vertex_count()
	for s in segs + 1:
		var si := s % segs
		var a := rot + TAU * float(s) / segs
		var d := _dir(a)
		var p := off * 0.55 + d * rim_r[si] * 0.5
		p.y = attach_y - rim_d[si] * 0.62
		md.add(p, (d * 0.85 - Vector3.UP * 0.15).normalized(), _ao(0.58 * shade), Vector2(float(s) * uv_k, 0.5), Color(_tier_sway(p.y, 0.5, tree_h), MAT_NEEDLES, 0.15, 0.0))
	var bottom_y := attach_y - drop * 0.5
	var under_apex := md.add(Vector3(0.0, bottom_y, 0.0), Vector3.DOWN, _ao(0.45 * shade), Vector2(0.0, 0.0), Color(_tier_sway(bottom_y, 0.0, tree_h), MAT_NEEDLES, 0.0, 0.0))
	for s in segs:
		md.quad(under_rim + s, under_rim + s + 1, inner + s + 1, inner + s)
		md.tri(under_apex, inner + s + 1, inner + s)


## Straight tapering trunk with a root flare; rings follow a gentle wobble.
static func _trunk(md: MeshData, rng: RandomNumberGenerator, h_top: float, r_base: float, tree_h: float,
		segs: int, crown_base: float, moss: float, lod: int) -> void:
	var ys: Array[float] = [-0.6, 0.0, 0.18, 0.45]
	var y := 0.9
	var step := 1.6 if lod == 0 else 3.5
	while y < h_top:
		ys.append(y)
		y += step
	ys.append(h_top)
	var wob_a := rng.randf() * TAU
	var furrows := maxf(3.0, roundf(TAU * r_base / 0.28))
	var base := md.vertex_count()
	for yi in ys:
		var t := clampf(yi / maxf(h_top, 0.01), 0.0, 1.0)
		var r := r_base * (1.0 - 0.86 * t) + r_base * 0.5 * exp(-maxf(yi, 0.0) / 0.32)
		if yi < 0.0:
			r *= 1.25
		var wob := Vector3(cos(wob_a + yi * 0.4), 0.0, sin(wob_a + yi * 0.33)) * 0.05 * minf(yi / 3.0, 1.0)
		var ao := 0.62 if yi < 0.25 else (0.95 if yi < crown_base else 0.55)
		var moss_v := moss * clampf(1.0 - maxf(yi, 0.0) / 1.4, 0.0, 1.0)
		for s in segs + 1:
			var a := TAU * float(s) / segs
			var d := _dir(a)
			var p := wob + d * r
			p.y = yi
			var nrm := (d + Vector3.UP * (0.35 * exp(-maxf(yi, 0.0) / 0.4))).normalized()
			var sway := clampf(sqrt(clampf(yi / tree_h, 0.0, 1.0)) * 0.72, 0.0, 1.0)
			md.add(p, nrm, _ao(ao), Vector2(float(s) / segs * furrows / 7.0, yi), Color(sway, MAT_BARK, moss_v, 0.0))
	for i in ys.size() - 1:
		for s in segs:
			var a0 := base + i * (segs + 1) + s
			var b0 := base + (i + 1) * (segs + 1) + s
			md.quad(a0, a0 + 1, b0 + 1, b0)


# =============================================================================
# Regular trees
# =============================================================================

static func _build_tree(variant: int, lod: int) -> ArrayMesh:
	var spec: Dictionary = TREE_SPECS[variant]
	var rng := RandomNumberGenerator.new()
	rng.seed = int(spec["seed"]) * 1000 + 7
	var md := MeshData.new()
	if variant == SNAG:
		_build_snag(md, rng, spec, lod)
		return md.commit(mat_tree())
	var h: float = spec["height"]
	var r_base: float = spec["trunk"]
	var tiers: int = spec["tiers"]
	var crown_base: float = spec["crown_base"]
	var radius: float = spec["radius"]
	var spikes: int = spec["spikes"]
	var droop: float = spec["droop"]
	var shape: float = spec["shape"]
	var jitter: float = spec["jitter"]
	if lod > 0:
		spikes = maxi(5, int(spikes * 0.6))
	var layout := RandomNumberGenerator.new()
	layout.seed = int(spec["seed"]) * 7919 + 3
	var trunk_rng := RandomNumberGenerator.new()
	trunk_rng.seed = int(spec["seed"]) * 31 + 1
	_trunk(md, trunk_rng, h * 0.93, r_base, h, 8 if lod == 0 else 5, crown_base, 0.4, lod)
	# Dead lower branch stubs (near LOD only).
	if lod == 0:
		var nstub := rng.randi_range(4, 7)
		for _i in nstub:
			var sy := rng.randf_range(1.3, maxf(crown_base + 0.6, 1.6))
			var a := rng.randf() * TAU
			var d := _dir(a)
			var rr := r_base * (1.0 - 0.86 * sy / h) * 0.95
			var blen := rng.randf_range(0.35, 1.0) * (0.6 + r_base)
			var p0 := d * rr * 0.6 + Vector3(0, sy, 0)
			var p1 := p0 + (d * 0.85 + Vector3.DOWN * rng.randf_range(0.0, 0.45)).normalized() * blen
			_tube(md, PackedVector3Array([p0, p1]), PackedFloat32Array([0.045, 0.012]), 4,
					PackedFloat32Array([0.8, 0.85]), Color(0, MAT_BARK, 0.0, 0.0), 0.5, h)
	# Needle tiers from the bottom up.
	var crown_h := h - crown_base
	var spacing := crown_h / (float(tiers) + 0.35)
	for i in tiers:
		var t := float(i) / float(maxi(tiers - 1, 1))
		var attach := crown_base + spacing * (float(i) + 1.0)
		var r := radius * pow(1.0 - t * 0.86, shape) * layout.randf_range(0.9, 1.08) + 0.25
		var drop := spacing * droop * layout.randf_range(0.9, 1.1) * (1.0 - t * 0.25)
		var tier_seed := layout.randi()
		var shade := 0.7 + 0.3 * t
		var apex := -1.0
		if i == tiers - 1:
			apex = h
			drop = maxf(drop, spacing * 1.1)
		var sp := spikes if i < tiers - 2 else maxi(5, spikes - 3)
		_tier(md, tier_seed, attach, r, drop, sp, h, shade, jitter, lod, apex)
	return md.commit(mat_tree())


static func _build_snag(md: MeshData, rng: RandomNumberGenerator, spec: Dictionary, lod: int) -> void:
	var h: float = spec["height"]
	var r_base: float = spec["trunk"]
	var top := h * 0.82
	var segs := 7 if lod == 0 else 5
	_trunk(md, rng, top, r_base, h, segs, top + 1.0, 0.55, lod)
	# Jagged broken top: a ring of splinters.
	var r_top := r_base * (1.0 - 0.86) + 0.02
	var base := md.vertex_count()
	for s in segs + 1:
		var a := TAU * float(s) / segs
		var d := _dir(a)
		var p := d * r_top * 1.05
		p.y = top + (rng.randf_range(0.2, 0.9) if s % 2 == 0 else rng.randf_range(0.0, 0.15))
		if s == segs:
			p = md.verts[base]
		md.add(p, d, _ao(0.8), Vector2(float(s) / segs, p.y), Color(0.6, MAT_BARK, 0.0, 0.0))
	var ring_prev := base - (segs + 1)
	for s in segs:
		md.quad(ring_prev + s, ring_prev + s + 1, base + s + 1, base + s)
	var cap := md.add(Vector3(0, top + 0.05, 0), Vector3.UP, _ao(0.5), Vector2(0.5, top), Color(0.6, MAT_BARK, 0.0, 0.0))
	for s in segs:
		md.tri(cap, base + s, base + s + 1)
	# Bare branches: some reach up, some droop; a few forks.
	var nb := rng.randi_range(9, 13) if lod == 0 else 6
	for i in nb:
		var by := lerpf(2.2, top - 0.6, float(i) / float(nb)) + rng.randf_range(-0.3, 0.3)
		var a := rng.randf() * TAU
		var d := _dir(a)
		var rr := r_base * (1.0 - 0.86 * by / h)
		var blen := rng.randf_range(0.8, 2.6) * (1.0 - by / h * 0.5)
		var upness := rng.randf_range(-0.35, 0.55)
		var p0 := d * rr * 0.5 + Vector3(0, by, 0)
		var p1 := p0 + (d + Vector3.UP * upness).normalized() * blen * 0.55
		var p2 := p1 + (d + Vector3.UP * (upness + rng.randf_range(-0.3, 0.4))).normalized() * blen * 0.45
		var rad0 := clampf(rr * 0.28, 0.03, 0.08)
		_tube(md, PackedVector3Array([p0, p1, p2]), PackedFloat32Array([rad0, rad0 * 0.55, 0.008]), 4 if lod == 0 else 3,
				PackedFloat32Array([0.75, 0.85, 0.9]), Color(0, MAT_BARK, 0.0, 0.0), 0.7, h)
		if lod == 0 and rng.randf() < 0.5:
			var f2 := p1 + (d.rotated(Vector3.UP, rng.randf_range(-0.9, 0.9)) + Vector3.UP * rng.randf_range(0.0, 0.8)).normalized() * blen * 0.35
			_tube(md, PackedVector3Array([p1, f2]), PackedFloat32Array([rad0 * 0.45, 0.006]), 3,
					PackedFloat32Array([0.85, 0.9]), Color(0, MAT_BARK, 0.0, 0.0), 0.7, h)


static func _build_sapling() -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 9091
	var md := MeshData.new()
	var h := 2.2
	_trunk(md, rng, h * 0.9, 0.055, h, 5, 0.3, 0.0, 1)
	var tiers := 5
	var crown_base := 0.25
	var spacing := (h - crown_base) / (float(tiers) + 0.35)
	for i in tiers:
		var t := float(i) / float(tiers - 1)
		var attach := crown_base + spacing * (float(i) + 1.0)
		var r := 0.85 * (1.0 - t * 0.8) + 0.08
		var apex := h if i == tiers - 1 else -1.0
		_tier(md, rng.randi(), attach, r, spacing * 1.3, 7 if i < tiers - 1 else 5, h, 0.8 + 0.2 * t, 0.12, 0, apex)
	return md.commit(mat_tree())


# =============================================================================
# Elder Trees (giants)
# =============================================================================

static func _build_elder(variant: int, lod: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7777 + variant * 131
	var md := MeshData.new()
	var h := ELDER_HEIGHT * (1.0 if variant == 0 else 0.9)
	var rb := ELDER_TRUNK * (1.0 if variant == 0 else 1.1)
	var segs := 28 if lod == 0 else 12
	var nroots := 7 if variant == 0 else 8
	var root_angles := PackedFloat32Array()
	for i in nroots:
		root_angles.append(TAU * float(i) / nroots + rng.randf_range(-0.25, 0.25))
	var crown_base := h * 0.48
	# Trunk rings with buttress ridges near the ground.
	var ys: Array[float] = [-1.2, -0.3, 0.2, 0.6, 1.1, 1.8, 2.7, 3.8, 5.2, 7.0, 9.5, 12.5, 16.0, 20.0, 24.5, 29.0, h * 0.97]
	if lod > 0:
		ys = [-1.2, 0.0, 0.8, 2.0, 4.0, 7.0, 12.0, 18.0, 25.0, h * 0.97]
	var furrows := roundf(TAU * rb / 0.32)
	var base := md.vertex_count()
	for yi in ys:
		var t := clampf(yi / h, 0.0, 1.0)
		var r := rb * (1.0 - 0.82 * pow(t, 0.8)) + 0.15
		var bf := 0.0
		if yi < 6.0:
			bf = pow(clampf(1.0 - maxf(yi, -0.3) / 6.0, 0.0, 1.0), 2.4) * 1.6
		var moss := clampf(1.0 - maxf(yi, 0.0) / 7.0, 0.0, 1.0) * 0.85
		var lean := Vector3(0.6, 0.0, -0.35) * pow(t, 2.0) * (1.0 if variant == 0 else -1.0)
		for s in segs + 1:
			var a := TAU * float(s) / segs
			var d := _dir(a)
			var ridge := 0.0
			for ra in root_angles:
				var da := absf(wrapf(a - ra, -PI, PI))
				ridge = maxf(ridge, pow(maxf(cos(da * 1.6), 0.0), 10.0))
			var bark_n := 1.0 + 0.04 * sin(a * furrows * 0.5 + yi)
			var rr := r * bark_n * (1.0 + bf * ridge) + bf * 0.15
			var p := lean + d * rr
			p.y = yi
			var nrm := (d + Vector3.UP * (0.6 * bf * ridge)).normalized()
			var ao := lerpf(0.55, 0.95, clampf((yi + 0.3) / 3.0, 0.0, 1.0))
			if yi > crown_base:
				ao = 0.6
			ao *= lerpf(1.0, 0.82, ridge * bf * 0.5)
			var sway := clampf(sqrt(t) * 0.5, 0.0, 1.0)
			md.add(p, nrm, Color(ao * 1.14, ao * 0.9, ao * 0.8), Vector2(float(s) / segs * furrows / 7.0, yi), Color(sway, MAT_BARK, moss * (0.6 + ridge * 0.4), 0.0))
	for i in ys.size() - 1:
		for s in segs:
			var a0 := base + i * (segs + 1) + s
			var b0 := base + (i + 1) * (segs + 1) + s
			md.quad(a0, a0 + 1, b0 + 1, b0)
	# Roots snaking away along the ground from each buttress.
	for ra in root_angles:
		var d := _dir(ra)
		var start_r := rb * 2.3
		var length := rng.randf_range(3.0, 5.5)
		var pts := PackedVector3Array()
		var radii := PackedFloat32Array()
		var aos := PackedFloat32Array()
		var steps := 6 if lod == 0 else 3
		var side := d.cross(Vector3.UP)
		var curl := rng.randf_range(-0.6, 0.6)
		for k in steps + 1:
			var f := float(k) / steps
			var p := d * (start_r - 0.6 + length * f) + side * sin(f * 2.2) * curl
			p.y = lerpf(0.5, -0.6, pow(f, 0.75))
			pts.append(p)
			radii.append(lerpf(0.75, 0.12, f))
			aos.append(lerpf(0.7, 0.85, f))
		_tube(md, pts, radii, 7 if lod == 0 else 4, aos, Color(0, MAT_BARK, 0.45, 0.0), 0.0, h, false)
	# Glowing amber sap spots and drips.
	if lod == 0:
		var nsap := rng.randi_range(9, 13)
		for i in nsap:
			var sy := rng.randf_range(1.4, 9.5)
			var a := rng.randf() * TAU
			var d := _dir(a)
			var t := sy / h
			var bf := pow(clampf(1.0 - sy / 6.0, 0.0, 1.0), 2.4) * 1.6
			var r := (rb * (1.0 - 0.82 * pow(t, 0.8)) + 0.15) * (1.0 + bf * 0.3)
			var sz := rng.randf_range(0.1, 0.2)
			var c := d * (r + sz * 0.15)
			c.y = sy
			_blob(md, c, Vector3(sz, sz * 1.2, sz), 1.0, 0.85, Color(0.1, MAT_BARK, 0.0, 1.0), 1)
			if rng.randf() < 0.7:
				var dl := rng.randf_range(0.25, 0.6)
				_blob(md, c + Vector3(0, -sz - dl * 0.5, 0) + d * 0.02, Vector3(sz * 0.4, dl * 0.55, sz * 0.4), 1.0, 0.9, Color(0.1, MAT_BARK, 0.0, 0.85), 0)
	# Great limbs reaching out under the canopy.
	var tiers := 11 if lod == 0 else 7
	var spacing := (h - crown_base) / (float(tiers) + 0.4)
	var radius := 8.2 * (1.0 if variant == 0 else 1.1)
	for i in tiers:
		var t := float(i) / float(tiers - 1)
		var attach := crown_base + spacing * (float(i) + 1.0)
		var r := radius * pow(1.0 - t * 0.85, 1.1) * rng.randf_range(0.88, 1.1) + 0.5
		var drop := maxf(spacing * 1.35, r * 0.42) * rng.randf_range(0.9, 1.15)
		if lod == 0 and i < tiers - 2:
			var nl := 4 if i < 4 else 3
			for k in nl:
				var a := rng.randf() * TAU
				var d := _dir(a)
				var tr := rb * (1.0 - 0.82 * pow(attach / h, 0.8))
				var p0 := d * tr * 0.5 + Vector3(0, attach - drop * 0.55, 0)
				var p1 := p0 + (d + Vector3.UP * 0.35).normalized() * r * 0.4
				var p2 := p1 + (d + Vector3.UP * 0.05).normalized() * r * 0.3
				var lr := clampf(tr * 0.32, 0.12, 0.45)
				_tube(md, PackedVector3Array([p0, p1, p2]), PackedFloat32Array([lr, lr * 0.55, lr * 0.2]), 6,
						PackedFloat32Array([0.55, 0.6, 0.65]), Color(0, MAT_BARK, 0.25, 0.0), 0.6, h)
		var apex := h if i == tiers - 1 else -1.0
		var sp := (21 if lod == 0 else 9) if i < tiers - 2 else (13 if lod == 0 else 6)
		_tier(md, rng.randi(), attach, r, drop, sp, h, 0.62 + 0.38 * t, 0.22, lod, apex, 0.5)
	return md.commit(mat_tree())


# =============================================================================
# Stumps & logs (bark shader)
# =============================================================================

static func _bark_cylinder(md: MeshData, rng: RandomNumberGenerator, r0: float, r1: float, length: float,
		segs: int, rings: int, xf: Transform3D, moss: float, flare: float, cap0: bool, cap1: bool, jag1: float) -> void:
	var base := md.vertex_count()
	var furrows := maxf(3.0, roundf(TAU * r0 / 0.28))
	for i in rings + 1:
		var f := float(i) / rings
		var r := lerpf(r0, r1, f) * (1.0 + flare * exp(-f * length / 0.18))
		for s in segs + 1:
			var a := TAU * float(s) / segs
			var d := Vector3(cos(a), sin(a), 0.0)
			var p := Vector3(d.x * r, d.y * r, f * length)
			var wn := xf.basis * d
			var ao := lerpf(0.7, 1.0, clampf(wn.y * 0.5 + 0.6, 0.0, 1.0))
			md.add(xf * p, wn, _ao(ao), Vector2(float(s) / segs * furrows / 7.0, f * length), Color(0, 0.0, moss, 0.0))
	for i in rings:
		for s in segs:
			var a0 := base + i * (segs + 1) + s
			var b0 := base + (i + 1) * (segs + 1) + s
			md.quad(a0, a0 + 1, b0 + 1, b0)
	for cap in [0, 1]:
		if (cap == 0 and not cap0) or (cap == 1 and not cap1):
			continue
		var f := float(cap)
		var r := lerpf(r0, r1, f) * (1.0 + flare * exp(-f * length / 0.18))
		var n_local := Vector3(0, 0, 1.0 if cap == 1 else -1.0)
		var wn := xf.basis * n_local
		var c0 := md.vertex_count()
		var center := Vector3(0, 0, f * length)
		md.add(xf * center, wn, _ao(0.95), Vector2.ZERO, Color(0, 1.0, 0.0, 0.0))
		for s in segs + 1:
			var a := TAU * float(s) / segs
			var d := Vector3(cos(a), sin(a), 0.0)
			var p := Vector3(d.x * r, d.y * r, f * length)
			if cap == 1 and jag1 > 0.0:
				p.z += rng.randf_range(-jag1, jag1 * 0.3) if s < segs else 0.0
			md.add(xf * p, wn, _ao(0.9), Vector2(d.x, d.y), Color(0, 1.0, 0.0, 0.0))
		for s in segs:
			md.tri(c0, c0 + 1 + s, c0 + 2 + s)


static func _build_stump() -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	var md := MeshData.new()
	# Vertical: local z of the cylinder points up.
	var xf := Transform3D(Basis(Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)), Vector3(0, -0.2, 0))
	_bark_cylinder(md, rng, 0.44, 0.4, 0.75, 10, 4, xf, 0.5, 0.3, false, true, 0.0)
	return md.commit(mat_bark())


static func _build_log(variant: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 5150 + variant * 17
	var md := MeshData.new()
	var length := 4.2 if variant == 0 else 3.0
	var r := 0.36 if variant == 0 else 0.27
	# Lying along +X, centred, sunk slightly into the ground.
	var xf := Transform3D(Basis(Vector3(0, 0, -1), Vector3(0, 1, 0), Vector3(1, 0, 0)), Vector3(-length * 0.5, r * 0.75, 0))
	_bark_cylinder(md, rng, r, r * 0.82, length, 10, 6, xf, 0.5, 0.0, true, true, 0.0)
	# A couple of broken branch stubs.
	for i in 3:
		var x := rng.randf_range(-length * 0.35, length * 0.35)
		var a := rng.randf_range(-0.4, PI + 0.4)
		var d := Vector3(0, sin(a), cos(a))
		var p0 := Vector3(x, r * 0.75, 0) + d * r * 0.8
		var p1 := p0 + (d + Vector3(rng.randf_range(-0.4, 0.4), 0, 0)).normalized() * rng.randf_range(0.25, 0.55)
		_tube(md, PackedVector3Array([p0, p1]), PackedFloat32Array([0.06, 0.02]), 4, PackedFloat32Array([0.85, 0.9]), Color(0, 0.0, 0.3, 0.0), 0.0, 1.0)
	return md.commit(mat_bark())


# =============================================================================
# Bushes (leaf-card clusters around a dark core)
# =============================================================================

static func _build_bush(variant: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3300 + variant * 77
	var md := MeshData.new()
	var w := 0.85 if variant == 0 else 0.65
	var hgt := 0.75 if variant == 0 else 0.95
	var lobes := 5 if variant == 0 else 4
	var centers: Array[Vector3] = []
	for i in lobes:
		var a := TAU * float(i) / lobes + rng.randf_range(-0.3, 0.3)
		var c := _dir(a) * w * rng.randf_range(0.25, 0.5)
		c.y = hgt * rng.randf_range(0.45, 0.7)
		centers.append(c)
	centers.append(Vector3(0, hgt * 0.75, 0))
	# Dark core lumps hide gaps between the leaves.
	for c in centers:
		_blob(md, c, Vector3(w * 0.38, hgt * 0.38, w * 0.38), 0.32, 0.18, Color(0.0, MAT_LEAVES, 0.1, 0.0), 1)
	# Folded leaf cards covering the lobes.
	var nleaves := 330 if variant == 0 else 270
	for i in nleaves:
		var c: Vector3 = centers[rng.randi_range(0, centers.size() - 1)]
		var dir := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.35, 1), rng.randf_range(-1, 1)).normalized()
		var lr := Vector3(w * 0.44, hgt * 0.44, w * 0.44)
		var p := c + Vector3(dir.x * lr.x, dir.y * lr.y, dir.z * lr.z) * rng.randf_range(0.9, 1.15)
		if p.y < 0.06:
			continue
		var n := (dir + Vector3.UP * 0.3).normalized()
		var tangent := n.cross(Vector3.UP if absf(n.y) < 0.95 else Vector3.RIGHT).normalized()
		tangent = tangent.rotated(n, rng.randf_range(-1.3, 1.3))
		var bit := n.cross(tangent).normalized()
		var sz := rng.randf_range(0.075, 0.12) * (1.0 if variant == 0 else 0.92)
		var tip := p + tangent * sz * 1.35 - n * sz * 0.25
		var back := p - tangent * sz * 0.45
		var l := p + bit * sz * 0.5 + tangent * sz * 0.35 - n * sz * 0.12
		var r := p - bit * sz * 0.5 + tangent * sz * 0.35 - n * sz * 0.12
		var mid := p + tangent * sz * 0.4 + n * sz * 0.08
		var ao := clampf(0.5 + (p.y / hgt) * 0.55, 0.45, 1.0)
		var sway := clampf(p.y / hgt * 0.7 + 0.2, 0.0, 1.0)
		var tipf := clampf(rng.randf_range(0.3, 1.0) * (p.y / hgt), 0.0, 1.0)
		var cu := Color(sway, MAT_LEAVES, tipf, 0.0)
		var i0 := md.add(back, n, _ao(ao * 0.8), Vector2(0.0, 0.5), cu)
		var i1 := md.add(l, n, _ao(ao * 0.95), Vector2(0.5, 0.0), cu)
		var i2 := md.add(tip, n, _ao(ao * 1.05), Vector2(1.0, 0.5), cu)
		var i3 := md.add(r, n, _ao(ao * 0.95), Vector2(0.5, 1.0), cu)
		var i4 := md.add(mid, n, _ao(ao), Vector2(0.5, 0.5), cu)
		md.tri(i0, i1, i4)
		md.tri(i1, i2, i4)
		md.tri(i2, i3, i4)
		md.tri(i3, i0, i4)
	return md.commit(mat_tree())


# =============================================================================
# Ground cover (grass shader)
# =============================================================================

## A curved, tapering grass blade.
static func _blade(md: MeshData, rng: RandomNumberGenerator, root: Vector3, height: float, width: float,
		lean: Vector3, col_root: Color, col_tip: Color, transl: float, segs: int = 3) -> void:
	var face := lean.cross(Vector3.UP)
	if face.length_squared() < 0.0001:
		face = Vector3.RIGHT
	face = face.normalized()
	var nrm := Vector3.UP.cross(face).normalized()
	if nrm.dot(lean) < 0.0:
		nrm = -nrm
	var base := md.vertex_count()
	var curve := rng.randf_range(0.5, 1.2)
	for i in segs:
		var f := float(i) / segs
		var p := root + Vector3.UP * height * f + lean * height * curve * f * f
		var wdt := width * (1.0 - f * 0.75)
		var c := col_root.lerp(col_tip, f)
		var bw := pow(f, 1.3)
		md.add(p - face * wdt * 0.5, nrm, c, Vector2(0.0, f), Color(bw, 0.0, 0.0, transl))
		md.add(p + face * wdt * 0.5, nrm, c, Vector2(1.0, f), Color(bw, 0.0, 0.0, transl))
	var tip := root + Vector3.UP * height + lean * height * curve
	var ti := md.add(tip, nrm, col_tip, Vector2(0.5, 1.0), Color(1.0, 0.0, 0.0, transl))
	for i in segs - 1:
		var a := base + i * 2
		md.tri_raw(a, a + 1, a + 3)
		md.tri_raw(a, a + 3, a + 2)
	var last := base + (segs - 1) * 2
	md.tri_raw(last, last + 1, ti)


static func _build_grass(variant: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 6100 + variant * 19
	var md := MeshData.new()
	var blades := 20 if variant == 0 else 24
	for i in blades:
		var a := rng.randf() * TAU
		var rr := rng.randf_range(0.0, 0.3 if variant == 0 else 0.34)
		var root := _dir(a) * rr
		root.y = -0.03
		var h := rng.randf_range(0.28, 0.55) if variant == 0 else rng.randf_range(0.45, 0.85)
		var lean := (_dir(a) * rng.randf_range(0.15, 0.45) + _dir(rng.randf() * TAU) * 0.15)
		var dry := rng.randf() < 0.18
		var root_c := Color(0.15, 0.25, 0.085)
		var tip_c := Color(0.42, 0.56, 0.2) if not dry else Color(0.62, 0.6, 0.3)
		tip_c = tip_c.lerp(Color(0.32, 0.5, 0.18), rng.randf() * 0.5)
		_blade(md, rng, root, h, rng.randf_range(0.05, 0.085), lean, root_c, tip_c, 0.45, 2 if variant == 0 else 3)
	if variant == 1:
		# Seed stems with little golden heads.
		for i in 3:
			var a := rng.randf() * TAU
			var root := _dir(a) * rng.randf_range(0.0, 0.18)
			var h := rng.randf_range(0.8, 1.1)
			var lean := _dir(a) * rng.randf_range(0.05, 0.2)
			_blade(md, rng, root, h, 0.018, lean, Color(0.2, 0.3, 0.1), Color(0.5, 0.55, 0.25), 0.3, 3)
			var top := root + Vector3.UP * h + lean * h * 0.8
			_blob(md, top + Vector3(0, 0.04, 0), Vector3(0.018, 0.06, 0.018), 1.0, 1.0, Color(1.0, 0.0, 0.0, 0.3), 0)
	# Blob vertices default to white albedo: tint them.
	for i in md.colors.size():
		if md.colors[i] == Color(1, 1, 1, 1):
			md.colors[i] = Color(0.7, 0.62, 0.32)
	return md.commit(mat_grass("grass", 30.0, 46.0, 0.22))


static func _build_flowers() -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7300
	var md := MeshData.new()
	var stem_c := Color(0.18, 0.32, 0.1)
	# Leaves at the base.
	for i in 6:
		var a := rng.randf() * TAU
		_blade(md, rng, _dir(a) * 0.04, rng.randf_range(0.12, 0.22), 0.05, _dir(a) * 0.6, Color(0.12, 0.22, 0.07), Color(0.3, 0.46, 0.15), 0.4, 2)
	var n := 4
	for i in n:
		var a := TAU * float(i) / n + rng.randf_range(-0.4, 0.4)
		var root := _dir(a) * rng.randf_range(0.03, 0.13)
		var h := rng.randf_range(0.22, 0.42)
		var lean := _dir(a) * rng.randf_range(0.05, 0.2)
		_blade(md, rng, root, h, 0.016, lean, stem_c, stem_c.lightened(0.15), 0.3, 2)
		var head := root + Vector3.UP * h + lean * h
		var face := (Vector3.UP * 1.4 + lean.normalized() * 0.6).normalized()
		var t1 := face.cross(Vector3.RIGHT if absf(face.x) < 0.9 else Vector3.FORWARD).normalized()
		var t2 := face.cross(t1).normalized()
		var petals := 6 if i % 2 == 0 else 5
		var pr := rng.randf_range(0.06, 0.085)
		for k in petals:
			var pa := TAU * float(k) / petals
			var pd := t1 * cos(pa) + t2 * sin(pa)
			var side := face.cross(pd).normalized()
			var p0 := head + face * 0.004
			var tip := head + pd * pr + face * pr * 0.25
			var l := head + pd * pr * 0.55 + side * pr * 0.32
			var r := head + pd * pr * 0.55 - side * pr * 0.32
			var cu := Color(1.0, 1.0, 0.0, 0.6)
			var i0 := md.add(p0, face, Color(1, 1, 1), Vector2(0.5, 0.0), cu)
			var i1 := md.add(l, face, Color(1, 1, 1), Vector2(0.0, 0.5), cu)
			var i2 := md.add(tip, face, Color(1, 1, 1), Vector2(0.5, 1.0), cu)
			var i3 := md.add(r, face, Color(1, 1, 1), Vector2(1.0, 0.5), cu)
			md.tri_raw(i0, i1, i2)
			md.tri_raw(i0, i2, i3)
		_blob(md, head + face * 0.012, Vector3(0.018, 0.012, 0.018), 1.0, 1.0, Color(1.0, 0.0, 0.0, 0.2), 0)
	for i in md.colors.size():
		if md.colors[i] == Color(1, 1, 1, 1) and md.custom[i * 4 + 1] < 0.5:
			md.colors[i] = Color(0.95, 0.72, 0.15)
	return md.commit(mat_grass("flowers", 26.0, 40.0, 0.18))


static func _build_fern() -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 8400
	var md := MeshData.new()
	var fronds := 9
	for f in fronds:
		var a := TAU * float(f) / fronds + rng.randf_range(-0.2, 0.2)
		var d := _dir(a)
		var side := d.cross(Vector3.UP).normalized()
		var length := rng.randf_range(0.75, 1.05)
		var arch := rng.randf_range(0.35, 0.55)
		var segs := 10
		var spine: Array[Vector3] = []
		for i in segs + 1:
			var s := float(i) / segs
			var p := d * length * s
			p.y = arch * sin(PI * s * 0.85) * (1.0 - s * 0.3) + 0.02 - s * s * 0.25
			spine.append(p)
		var nrm := (Vector3.UP + d * 0.2).normalized()
		for i in segs:
			var s := float(i) / segs
			var s1 := float(i + 1) / segs
			var w := 0.19 * sin(PI * (0.12 + 0.88 * s)) * (1.0 - s * 0.55)
			var c0 := Color(0.13, 0.27, 0.08).lerp(Color(0.3, 0.5, 0.17), s)
			var c1 := Color(0.13, 0.27, 0.08).lerp(Color(0.3, 0.5, 0.17), s1)
			var p0: Vector3 = spine[i]
			var p1: Vector3 = spine[i + 1]
			var fwd := (p1 - p0)
			var bw0 := pow(s, 1.2)
			var bw1 := pow(s1, 1.2)
			for sgn in [-1.0, 1.0]:
				var tip := p0 + fwd * 0.9 + side * w * float(sgn) + Vector3.DOWN * w * 0.25
				var mid := p0 + fwd * 0.45 + side * w * 0.35 * float(sgn)
				var i0 := md.add(p0, nrm, c0, Vector2(0.5, s), Color(bw0, 0.0, 0.0, 0.5))
				var i1 := md.add(tip, nrm, c1.lightened(0.08), Vector2(1.0, s), Color(bw1, 0.0, 0.0, 0.5))
				var i2 := md.add(p1, nrm, c1, Vector2(0.5, s1), Color(bw1, 0.0, 0.0, 0.5))
				var i3 := md.add(mid, nrm, c0, Vector2(0.7, s), Color(bw0, 0.0, 0.0, 0.5))
				md.tri_raw(i0, i1, i2)
				md.tri_raw(i0, i3, i1)
	return md.commit(mat_grass("fern", 60.0, 80.0, 0.12))


static func _build_mushrooms(red: bool) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 9500 if red else 9600
	var md := MeshData.new()
	var count := 3 if red else 4
	for i in count:
		var a := rng.randf() * TAU
		var pos := _dir(a) * rng.randf_range(0.0, 0.16) if i > 0 else Vector3.ZERO
		var h := rng.randf_range(0.08, 0.17) * (1.3 if i == 0 else 1.0)
		var cr := h * rng.randf_range(0.55, 0.75)
		var stem_c := Color(0.92, 0.88, 0.78)
		var segs := 7
		# Stem
		var base := md.vertex_count()
		for k in 2:
			var y := h * float(k)
			var r := 0.022 * (1.0 if k == 0 else 0.8) * (h / 0.12)
			for s in segs + 1:
				var d := _dir(TAU * float(s) / segs)
				md.add(pos + d * r + Vector3(0, y - 0.02, 0), d, stem_c * (0.75 if k == 0 else 1.0), Vector2(float(s) / segs, y), Color(0.0, 0.0, 0.0, 0.2))
		for s in segs:
			md.quad(base + s, base + s + 1, base + segs + 1 + s + 1, base + segs + 1 + s)
		# Cap dome
		var cap_c := Color(0.78, 0.12, 0.07) if red else Color(0.55, 0.36, 0.2)
		var cbase := md.vertex_count()
		var rings := 3
		for k in rings:
			var f := float(k) / rings
			var ang := f * PI * 0.5
			var r := cr * cos(ang * 0.9)
			var y := h + cr * 0.55 * sin(ang)
			for s in segs + 1:
				var d := _dir(TAU * float(s) / segs)
				var nrm := (d * cos(ang) + Vector3.UP * sin(ang) + Vector3.UP * 0.3).normalized()
				var col := cap_c * (0.8 + 0.2 * f)
				md.add(pos + d * r + Vector3(0, y, 0), nrm, col, Vector2(d.x * (1.0 - f), d.z * (1.0 - f)), Color(0.0, 0.0, 1.0 if red else 0.0, 0.0))
		var apex := md.add(pos + Vector3(0, h + cr * 0.55, 0), Vector3.UP, cap_c, Vector2(0, 0), Color(0.0, 0.0, 1.0 if red else 0.0, 0.0))
		for k in rings - 1:
			for s in segs:
				var a0 := cbase + k * (segs + 1) + s
				var b0 := cbase + (k + 1) * (segs + 1) + s
				md.quad(a0, a0 + 1, b0 + 1, b0)
		var last := cbase + (rings - 1) * (segs + 1)
		for s in segs:
			md.tri(last + s, last + s + 1, apex)
		# Gills underside (flat, pale)
		var gc := md.add(pos + Vector3(0, h - 0.005, 0), Vector3.DOWN, stem_c * 0.7, Vector2.ZERO, Color(0.0, 0.0, 0.0, 0.0))
		var g0 := md.vertex_count()
		for s in segs + 1:
			var d := _dir(TAU * float(s) / segs)
			md.add(pos + d * cr + Vector3(0, h, 0), Vector3.DOWN, stem_c * 0.8, Vector2.ZERO, Color(0.0, 0.0, 0.0, 0.0))
		for s in segs:
			md.tri(gc, g0 + s, g0 + s + 1)
	return md.commit(mat_grass("mushroom", 22.0, 30.0, 0.0))


static func _build_debris() -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = 9900
	var md := MeshData.new()
	# Pine cones
	for i in 3:
		var pos := _dir(rng.randf() * TAU) * rng.randf_range(0.1, 0.45)
		var yaw := rng.randf() * TAU
		var axis := _dir(yaw)
		var length := rng.randf_range(0.09, 0.13)
		var segs := 6
		var rings := 5
		var base := md.vertex_count()
		var side := axis.cross(Vector3.UP).normalized()
		for k in rings + 1:
			var f := float(k) / rings
			var r := sin(PI * clampf(f * 0.95 + 0.05, 0.0, 1.0)) * length * 0.38 * (1.0 + (0.18 if k % 2 == 1 else 0.0))
			var c := pos + axis * (f - 0.5) * length + Vector3(0, length * 0.3, 0)
			for s in segs + 1:
				var a := TAU * float(s) / segs + (0.5 if k % 2 == 1 else 0.0)
				var d := side * cos(a) + Vector3.UP * sin(a)
				var col := Color(0.42, 0.27, 0.15) * (0.75 + 0.35 * float(k % 2))
				md.add(c + d * r, d, col, Vector2(float(s) / segs, f), Color(0.0, 0.0, 0.0, 0.0))
		for k in rings:
			for s in segs:
				var a0 := base + k * (segs + 1) + s
				var b0 := base + (k + 1) * (segs + 1) + s
				md.quad(a0, a0 + 1, b0 + 1, b0)
	# Twigs
	var bark_c := Color(0.32, 0.22, 0.14)
	for i in 4:
		var p0 := _dir(rng.randf() * TAU) * rng.randf_range(0.0, 0.5)
		p0.y = 0.015
		var d := _dir(rng.randf() * TAU)
		var length := rng.randf_range(0.25, 0.6)
		var p1 := p0 + d * length * 0.55 + Vector3(0, 0.01, 0)
		var p2 := p1 + d.rotated(Vector3.UP, rng.randf_range(-0.4, 0.4)) * length * 0.45
		var tb := md.vertex_count()
		_tube(md, PackedVector3Array([p0, p1, p2]), PackedFloat32Array([0.012, 0.009, 0.004]), 3, PackedFloat32Array([0.8, 0.9, 1.0]), Color(0, 0.0, 0.0, 0.0), 0.0, 1.0, false)
		for k in range(tb, md.vertex_count()):
			md.colors[k] = bark_c * md.colors[k].r
		if rng.randf() < 0.6:
			var f2 := p1 + d.rotated(Vector3.UP, rng.randf_range(0.5, 1.0) * (1.0 if rng.randf() < 0.5 else -1.0)) * length * 0.3
			var tb2 := md.vertex_count()
			_tube(md, PackedVector3Array([p1, f2]), PackedFloat32Array([0.006, 0.003]), 3, PackedFloat32Array([0.85, 1.0]), Color(0, 0.0, 0.0, 0.0), 0.0, 1.0, false)
			for k in range(tb2, md.vertex_count()):
				md.colors[k] = bark_c * md.colors[k].r
	return md.commit(mat_grass("debris", 20.0, 28.0, 0.0))


# =============================================================================
# Rocks
# =============================================================================

static func _rock_noise(variant: int) -> FastNoiseLite:
	var n := FastNoiseLite.new()
	n.seed = 1200 + variant * 31
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.9
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 3
	return n


## Displaced unit-ish sphere points for a rock variant.
static func _rock_points(variant: int, subdiv: int) -> PackedVector3Array:
	var ico: Array = _icosphere(subdiv)
	var src: PackedVector3Array = ico[0]
	var n := _rock_noise(variant)
	var out := PackedVector3Array()
	var squash: float = [0.68, 0.95, 0.42, 0.75][variant]
	var stretch: float = [1.0, 0.8, 1.35, 1.15][variant]
	var rng := RandomNumberGenerator.new()
	rng.seed = 4400 + variant * 13
	var cuts: Array[Vector4] = []
	for k in 9:
		var cn := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.3, 1.0), rng.randf_range(-1, 1)).normalized()
		cuts.append(Vector4(cn.x, cn.y, cn.z, rng.randf_range(0.7, 0.9)))
	for v in src:
		var d := n.get_noise_3dv(v * 1.4) * 0.3 + n.get_noise_3dv(v * 4.0 + Vector3(5, 5, 5)) * 0.06
		if variant == 1:
			d = absf(d) * 1.3 - 0.08
		var p := v * (1.0 + d)
		for c in cuts:
			var cn := Vector3(c.x, c.y, c.z)
			var dd := p.dot(cn) - c.w
			if dd > 0.0:
				p -= cn * dd * 0.92
		p.x *= stretch
		p.y *= squash
		if p.y < -0.12:
			p.y = -0.12 + (p.y + 0.12) * 0.3
		p.y += 0.1
		out.append(p)
	return out


static func _build_rock(variant: int, lod: int) -> ArrayMesh:
	var subdiv := 3 if lod == 0 else 2
	var ico: Array = _icosphere(subdiv)
	var src: PackedVector3Array = ico[0]
	var idx: PackedInt32Array = ico[1]
	var pts := _rock_points(variant, subdiv)
	var md := MeshData.new()
	# Smooth normals from face accumulation.
	var acc := PackedVector3Array()
	acc.resize(pts.size())
	for i in range(0, idx.size(), 3):
		var a := pts[idx[i]]
		var b := pts[idx[i + 1]]
		var c := pts[idx[i + 2]]
		var fn := (b - a).cross(c - a)
		if fn.dot(a + b + c) < 0.0:
			fn = -fn
		acc[idx[i]] += fn
		acc[idx[i + 1]] += fn
		acc[idx[i + 2]] += fn
	for i in pts.size():
		var p := pts[i]
		var nrm := acc[i].normalized()
		var radial := p.length() / maxf(src[i].length(), 0.001)
		var cavity := clampf(0.55 + (radial - 0.85) * 1.6, 0.35, 1.0)
		var ground := clampf((p.y + 0.05) / 0.35, 0.0, 1.0)
		var ao := cavity * lerpf(0.55, 1.0, ground)
		md.add(p, nrm, _ao(ao), Vector2(src[i].x, src[i].z), Color(0, 0, 0, 0))
	for i in range(0, idx.size(), 3):
		md.tri(idx[i], idx[i + 1], idx[i + 2])
	return md.commit(mat_rock())
