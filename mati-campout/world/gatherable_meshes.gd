class_name GatherableMeshes
extends RefCounted
## Procedural meshes for gatherable resource nodes (stone heaps, coal seams,
## berry bushes, mushrooms, twig bundles, old bones, cloth scraps, scrap
## metal). Every kind has VARIANTS hand-shaped variations built once from a
## fixed seed and cached as `Piece`s (plain vertex arrays).
##
## Gatherables bakes the pieces of all nodes in a 64 m chunk into one mesh
## (`Accum`, bulk packed-array operations only) so the whole chunk is a single
## draw call. Per vertex:
##   COLOR    rgb = albedo (sRGB), a = baked ambient occlusion
##   UV       surface coordinates in metres (cloth weave, bark streaks...)
##   UV2      x = material id (Mat), y = removal threshold (-1 = permanent)
##   CUSTOM0  xyz = the part's pivot (chunk space)
##   CUSTOM1  x = node id (texel in the state texture)
## The shader collapses a part onto its pivot once the node's fill drops
## below the part's (remapped) threshold, so berries, stones and coal lumps
## disappear one by one while gathering and pop back when the node regrows.

enum Kind { STONE, COAL, BERRY, MUSHROOM, TWIGS, BONES, CLOTH, SCRAP }
enum Mat { GROUND, STONE, COAL, LEAF, BERRY, CAP, STEM, WOOD, BONE, CLOTH, METAL, MOSS, TWINE, GILLS, SPOT, LITTER, CORE, ROCK }

const KIND_COUNT := 8
const VARIANTS := 6
const SHADER_PATH := "res://shaders/gatherable.gdshader"

static var _cache: Dictionary = {}
static var _ico_cache: Dictionary = {}
static var _noise: FastNoiseLite = null


## One variant of a kind: plain arrays ready to be transformed and appended.
class Piece:
	extends RefCounted
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uvs := PackedVector2Array()
	var mats := PackedFloat32Array()
	## pivot - vertex for every vertex (the part collapses onto its pivot).
	var pivots := PackedVector3Array()
	## Removal order 0..1 (higher = taken first), -1 = never removed.
	var orders := PackedFloat32Array()
	var indices := PackedInt32Array()
	## Footprint radius (m) and height (m) at scale 1.
	var radius := 0.5
	var height := 0.5
	## Points where sparkles twinkle (piece space).
	var glints := PackedVector3Array()
	## Big pieces go into the shadow-casting chunk mesh.
	var casts_shadow := true
	## verts + pivots: each vertex's part pivot in piece space.
	var pivot_pts := PackedVector3Array()
	var _uv2_cache: Dictionary = {}

	func vertex_count() -> int:
		return verts.size()

	## UV2 (material, threshold remapped into `charges` bands), cached.
	func uv2_for(charges: int) -> PackedVector2Array:
		if _uv2_cache.has(charges):
			return _uv2_cache[charges]
		var out := PackedVector2Array()
		out.resize(verts.size())
		for i in verts.size():
			out[i] = Vector2(mats[i], GatherableMeshes.remap_order(orders[i], charges))
		_uv2_cache[charges] = out
		return out


## Accumulates many transformed pieces into one chunk mesh.
class Accum:
	extends RefCounted
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uvs := PackedVector2Array()
	var uv2s := PackedVector2Array()
	var pivots := PackedFloat32Array()
	var ids := PackedFloat32Array()
	var indices := PackedInt32Array()

	func is_empty() -> bool:
		return indices.is_empty()

	## Append `p` placed by `xf` (rotation + uniform scale) for node `node_id`.
	## Removal thresholds are remapped into `charges` bands so each gather
	## takes exactly one band of parts.
	func add(p: Piece, xf: Transform3D, node_id: int, charges: int) -> void:
		var n := p.verts.size()
		if n == 0:
			return
		var base := verts.size()
		verts.append_array(xf * p.verts)
		normals.append_array(Transform3D(xf.basis.orthonormalized(), Vector3.ZERO) * p.normals)
		colors.append_array(p.colors)
		uvs.append_array(p.uvs)
		uv2s.append_array(p.uv2_for(maxi(charges, 1)))
		pivots.append_array((xf * p.pivot_pts).to_byte_array().to_float32_array())
		var idv := PackedFloat32Array()
		idv.resize(n)
		idv.fill(float(node_id))
		ids.append_array(idv)
		var ib := indices.size()
		indices.append_array(p.indices)
		for i in range(ib, indices.size()):
			indices[i] += base

	func commit(mat: Material) -> ArrayMesh:
		if indices.is_empty():
			return null
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = verts
		arr[Mesh.ARRAY_NORMAL] = normals
		arr[Mesh.ARRAY_COLOR] = colors
		arr[Mesh.ARRAY_TEX_UV] = uvs
		arr[Mesh.ARRAY_TEX_UV2] = uv2s
		arr[Mesh.ARRAY_CUSTOM0] = pivots
		arr[Mesh.ARRAY_CUSTOM1] = ids
		arr[Mesh.ARRAY_INDEX] = indices
		var mesh := ArrayMesh.new()
		var flags := (Mesh.ARRAY_CUSTOM_RGB_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
		if mat:
			mesh.surface_set_material(0, mat)
		return mesh


## Map a part's raw removal order (0..1) into the band of the charge that
## removes it. fill = charges_left / charges; band k is visible while
## fill > k / charges.
static func remap_order(t: float, charges: int) -> float:
	if t < 0.0:
		return -1.0
	var c := float(maxi(charges, 1))
	var k := floorf(clampf(t, 0.0, 0.9999) * c)
	var f := t * c - k
	var lo := k / c + 0.02
	var hi := (k + 1.0) / c - 0.07
	return lerpf(lo, hi, clampf(f, 0.0, 1.0))


## The cached piece for a kind/variant.
static func piece(kind: int, variant: int) -> Piece:
	var key := kind * 100 + posmod(variant, VARIANTS)
	if _cache.has(key):
		return _cache[key]
	var p := _build(kind, posmod(variant, VARIANTS))
	_cache[key] = p
	return p


## A standalone mesh of one piece (node id 0), e.g. for tests and previews.
static func preview_mesh(kind: int, variant: int, mat: Material = null) -> ArrayMesh:
	var acc := Accum.new()
	acc.add(piece(kind, variant), Transform3D.IDENTITY, 0, 1)
	return acc.commit(mat)


static func _build(kind: int, variant: int) -> Piece:
	var b := Builder.new()
	b.rng.seed = 7919 + kind * 1013 + variant * 131
	match kind:
		Kind.STONE:
			_stone_pile(b, variant)
		Kind.COAL:
			_coal_vein(b, variant)
		Kind.BERRY:
			_berry_bush(b, variant)
		Kind.MUSHROOM:
			_mushrooms(b, variant)
		Kind.TWIGS:
			_twigs(b, variant)
		Kind.BONES:
			_bones(b, variant)
		Kind.CLOTH:
			_cloth(b, variant)
		_:
			_scrap(b, variant)
	return b.to_piece()


static func noise() -> FastNoiseLite:
	if _noise == null:
		_noise = FastNoiseLite.new()
		_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		_noise.frequency = 1.0
		_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
		_noise.fractal_octaves = 3
		_noise.seed = 4242
	return _noise


## Unit icosphere: [PackedVector3Array verts, PackedInt32Array tris].
static func ico(level: int) -> Array:
	if _ico_cache.has(level):
		return _ico_cache[level]
	var t := (1.0 + sqrt(5.0)) * 0.5
	var vs := PackedVector3Array([
		Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0),
		Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t),
		Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)])
	for i in vs.size():
		vs[i] = vs[i].normalized()
	var fs := PackedInt32Array([0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4,
		11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5,
		2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1])
	for _l in level:
		var mid := {}
		var nf := PackedInt32Array()
		for f in range(0, fs.size(), 3):
			var a := fs[f]
			var bb := fs[f + 1]
			var c := fs[f + 2]
			var ab := _mid(vs, mid, a, bb)
			var bc := _mid(vs, mid, bb, c)
			var ca := _mid(vs, mid, c, a)
			nf.append_array(PackedInt32Array([a, ab, ca, bb, bc, ab, c, ca, bc, ab, bc, ca]))
		fs = nf
	var out := [vs, fs]
	_ico_cache[level] = out
	return out


static func _mid(vs: PackedVector3Array, cache: Dictionary, a: int, b: int) -> int:
	var key := mini(a, b) * 100000 + maxi(a, b)
	if cache.has(key):
		return int(cache[key])
	vs.append(((vs[a] + vs[b]) * 0.5).normalized())
	var i := vs.size() - 1
	cache[key] = i
	return i


## A basis whose +Y axis points along `dir`.
static func basis_y(dir: Vector3) -> Basis:
	var y := dir.normalized()
	if y.length_squared() < 0.5:
		return Basis.IDENTITY
	var ref := Vector3.FORWARD if absf(y.dot(Vector3.FORWARD)) < 0.95 else Vector3.RIGHT
	var x := ref.cross(y).normalized()
	var z := x.cross(y).normalized()
	return Basis(x, y, z)


static func _hex(s: String) -> Color:
	return Color(s)


# =============================================================================
# Builder
# =============================================================================

class Builder:
	extends RefCounted
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var c := PackedColorArray()
	var uv := PackedVector2Array()
	var m := PackedFloat32Array()
	var pv := PackedVector3Array()
	var th := PackedFloat32Array()
	var idx := PackedInt32Array()
	var rng := RandomNumberGenerator.new()
	var glints := PackedVector3Array()
	var radius := 0.5
	var height := 0.5
	var casts_shadow := true
	## Current part (pivot + removal order) and material.
	var pivot := Vector3.ZERO
	var order := -1.0
	var mat := 0

	func part(p: Vector3, o: float) -> void:
		pivot = p
		order = o

	func add(p: Vector3, nrm: Vector3, col: Color, tex: Vector2 = Vector2.ZERO) -> int:
		v.append(p)
		n.append(nrm)
		c.append(col)
		uv.append(tex)
		m.append(float(mat))
		pv.append(pivot - p)
		th.append(order)
		return v.size() - 1

	## Triangle wound so that its face points along the vertex normals.
	func tri(a: int, b: int, cc: int) -> void:
		var g := (v[b] - v[a]).cross(v[cc] - v[a])
		if g.length_squared() < 1e-16:
			return
		if g.dot(n[a] + n[b] + n[cc]) < 0.0:
			var t := b
			b = cc
			cc = t
		# Godot treats clockwise triangles as front faces.
		idx.append(a)
		idx.append(cc)
		idx.append(b)

	## Triangle in both windings (thin double-sided cards: leaves, cloth).
	func tri2(a: int, b: int, cc: int) -> void:
		idx.append_array(PackedInt32Array([a, b, cc, a, cc, b]))

	func quad(a: int, b: int, cc: int, d: int) -> void:
		tri(a, b, cc)
		tri(a, cc, d)

	func to_piece() -> Piece:
		var p := Piece.new()
		p.verts = v
		p.normals = n
		p.colors = c
		p.uvs = uv
		p.mats = m
		p.pivots = pv
		p.orders = th
		p.indices = idx
		p.radius = radius
		p.height = height
		p.glints = glints
		p.casts_shadow = casts_shadow
		var pts := PackedVector3Array()
		pts.resize(v.size())
		for i in v.size():
			pts[i] = v[i] + pv[i]
		p.pivot_pts = pts
		return p

	# --- Primitives -------------------------------------------------------------

	## Noise-displaced ellipsoid (stones, rock cores, bush cores, pebbles).
	## `col_fn(local_pos: Vector3, unit_dir: Vector3) -> Color` overrides `col`.
	func blob(center: Vector3, radii: Vector3, basis: Basis, level: int, amp: float, freq: float,
			nseed: float, col: Color, ao_bottom: float = 0.55, flat_y: float = -9.0,
			col_fn: Callable = Callable()) -> void:
		var sph: Array = GatherableMeshes.ico(level)
		var dirs: PackedVector3Array = sph[0]
		var faces: PackedInt32Array = sph[1]
		var nz := GatherableMeshes.noise()
		var off := Vector3(nseed * 17.3, nseed * 5.1, nseed * 11.7)
		var loc := PackedVector3Array()
		loc.resize(dirs.size())
		for i in dirs.size():
			var d := dirs[i]
			var q := d * freq + off
			var disp := 1.0 + amp * nz.get_noise_3d(q.x, q.y, q.z)
			var p := Vector3(d.x * radii.x, d.y * radii.y, d.z * radii.z) * disp
			if p.y < flat_y * radii.y:
				p.y = lerpf(p.y, flat_y * radii.y, 0.85)
			loc[i] = p
		var acc := PackedVector3Array()
		acc.resize(loc.size())
		for f in range(0, faces.size(), 3):
			var a := faces[f]
			var b2 := faces[f + 1]
			var c2 := faces[f + 2]
			var fn := (loc[b2] - loc[a]).cross(loc[c2] - loc[a])
			# Faces of a sphere point outward: orient by the centroid.
			if fn.dot(loc[a] + loc[b2] + loc[c2]) < 0.0:
				fn = -fn
			acc[a] += fn
			acc[b2] += fn
			acc[c2] += fn
		var base := v.size()
		for i in loc.size():
			var nrm := (basis * acc[i]).normalized()
			var d := dirs[i]
			var ao := lerpf(ao_bottom, 1.0, smoothstep(-0.9, 0.55, d.y))
			var cc: Color = col
			if col_fn.is_valid():
				cc = col_fn.call(loc[i], d)
			cc.a = ao
			add(center + basis * loc[i], nrm, cc, Vector2(atan2(d.z, d.x) * maxf(radii.x, radii.z), loc[i].y))
		for f in range(0, faces.size(), 3):
			tri(base + faces[f], base + faces[f + 1], base + faces[f + 2])

	## Faceted (flat-shaded) jittered icosahedron: coal lumps, nuts.
	func facet(center: Vector3, size: Vector3, basis: Basis, jitter: float, col: Color, level: int = 0) -> void:
		var sph: Array = GatherableMeshes.ico(level)
		var dirs: PackedVector3Array = sph[0]
		var faces: PackedInt32Array = sph[1]
		var loc := PackedVector3Array()
		for d in dirs:
			var k := 1.0 + rng.randf_range(-jitter, jitter)
			loc.append(Vector3(d.x * size.x, d.y * size.y, d.z * size.z) * k)
		for f in range(0, faces.size(), 3):
			var a := loc[faces[f]]
			var b2 := loc[faces[f + 1]]
			var c2 := loc[faces[f + 2]]
			var fn := (b2 - a).cross(c2 - a)
			if fn.dot(a + b2 + c2) < 0.0:
				fn = -fn
			fn = (basis * fn).normalized()
			var shade := 0.8 + 0.2 * clampf(fn.y, -1.0, 1.0)
			var cc := Color(col.r, col.g, col.b, shade)
			var i0 := add(center + basis * a, fn, cc, Vector2(a.x, a.y) * 4.0)
			var i1 := add(center + basis * b2, fn, cc, Vector2(b2.x, b2.y) * 4.0)
			var i2 := add(center + basis * c2, fn, cc, Vector2(c2.x, c2.y) * 4.0)
			tri(i0, i1, i2)

	## Tube along a polyline with per-point radii (twigs, stems, bones, pipes).
	func tube(pts: PackedVector3Array, radii: PackedFloat32Array, seg: int, col: Color,
			cap_a: bool = true, cap_b: bool = true, cap_col: Color = Color(-1, 0, 0),
			ao_a: float = 1.0, ao_b: float = 1.0) -> void:
		var np := pts.size()
		if np < 2:
			return
		var cc_cap := col if cap_col.r < 0.0 else cap_col
		var tangents := PackedVector3Array()
		for i in np:
			var t := (pts[mini(i + 1, np - 1)] - pts[maxi(i - 1, 0)]).normalized()
			tangents.append(t)
		var ref := Vector3.UP if absf(tangents[0].dot(Vector3.UP)) < 0.9 else Vector3.RIGHT
		var nx := tangents[0].cross(ref).normalized()
		var length := 0.0
		var rings: Array[PackedInt32Array] = []
		for i in np:
			if i > 0:
				length += pts[i].distance_to(pts[i - 1])
				# Parallel transport the frame.
				var tprev := tangents[i - 1]
				var tcur := tangents[i]
				var ax := tprev.cross(tcur)
				if ax.length_squared() > 1e-10:
					nx = nx.rotated(ax.normalized(), tprev.angle_to(tcur))
			var ny := tangents[i].cross(nx).normalized()
			var ring := PackedInt32Array()
			var ao := lerpf(ao_a, ao_b, float(i) / float(np - 1))
			for j in seg + 1:
				var a := TAU * float(j) / float(seg)
				var dir := (nx * cos(a) + ny * sin(a)).normalized()
				var cc := Color(col.r, col.g, col.b, ao * (0.82 + 0.18 * clampf(dir.y * 0.5 + 0.5, 0.0, 1.0)))
				ring.append(add(pts[i] + dir * radii[i], dir, cc, Vector2(float(j) / float(seg) * TAU * radii[i], length)))
			rings.append(ring)
		for i in np - 1:
			var r0 := rings[i]
			var r1 := rings[i + 1]
			for j in seg:
				quad(r0[j], r1[j], r1[j + 1], r0[j + 1])
		if cap_a:
			_cap(pts[0], -tangents[0], rings[0], cc_cap, ao_a)
		if cap_b:
			_cap(pts[np - 1], tangents[np - 1], rings[np - 1], cc_cap, ao_b)

	func _cap(center: Vector3, nrm: Vector3, ring: PackedInt32Array, col: Color, ao: float) -> void:
		var cc := Color(col.r, col.g, col.b, ao)
		var ci := add(center + nrm * 0.002, nrm, cc, Vector2.ZERO)
		var rim := PackedInt32Array()
		for j in ring.size():
			rim.append(add(v[ring[j]], nrm, cc, Vector2.ZERO))
		for j in rim.size() - 1:
			tri(ci, rim[j], rim[j + 1])

	## Surface of revolution around local +Y placed by `xf` (profile: (r, y)
	## from bottom to top). UV = (angle 0..1, profile 0..1).
	func lathe(profile: PackedVector2Array, xf: Transform3D, seg: int, col: Color,
			ao_lo: float = 1.0, ao_hi: float = 1.0, flip: bool = false) -> void:
		var np := profile.size()
		var nb := xf.basis.inverse().transposed()
		var base := v.size()
		for i in np:
			var a2 := profile[maxi(i - 1, 0)]
			var b2 := profile[mini(i + 1, np - 1)]
			var tg := (b2 - a2)
			if tg.length_squared() < 1e-12:
				tg = Vector2(0.0, 1.0)
			tg = tg.normalized()
			var pn := Vector2(tg.y, -tg.x)
			if flip:
				pn = -pn
			var ao := lerpf(ao_lo, ao_hi, float(i) / float(maxi(np - 1, 1)))
			for j in seg + 1:
				var ang := TAU * float(j) / float(seg)
				var ca := cos(ang)
				var sa := sin(ang)
				var lp := Vector3(profile[i].x * ca, profile[i].y, profile[i].x * sa)
				var ln := Vector3(pn.x * ca, pn.y, pn.x * sa)
				add(xf * lp, (nb * ln).normalized(), Color(col.r, col.g, col.b, ao),
					Vector2(float(j) / float(seg), float(i) / float(maxi(np - 1, 1))))
		var cols := seg + 1
		for i in np - 1:
			for j in seg:
				var a := base + i * cols + j
				var b3 := base + (i + 1) * cols + j
				quad(a, b3, b3 + 1, a + 1)

	func sphere(center: Vector3, r: float, seg: int, rings: int, col: Color, ao_lo: float = 0.7) -> void:
		var prof := PackedVector2Array()
		for i in rings + 1:
			var a := -PI * 0.5 + PI * float(i) / float(rings)
			prof.append(Vector2(cos(a) * r, sin(a) * r))
		prof[0] = Vector2(0.0, prof[0].y)
		prof[rings] = Vector2(0.0, prof[rings].y)
		lathe(prof, Transform3D(Basis.IDENTITY, center), seg, col, ao_lo, 1.0)

	## Smooth low-poly sphere (icosphere) for tiny round things (berries, knobs).
	func ball(center: Vector3, r: float, col: Color, level: int = 0, ao_lo: float = 0.7) -> void:
		var sph: Array = GatherableMeshes.ico(level)
		var dirs: PackedVector3Array = sph[0]
		var faces: PackedInt32Array = sph[1]
		var base := v.size()
		for d in dirs:
			var ao := lerpf(ao_lo, 1.0, d.y * 0.5 + 0.5)
			add(center + d * r, d, Color(col.r, col.g, col.b, ao), Vector2(d.x, d.y))
		for f in range(0, faces.size(), 3):
			tri(base + faces[f], base + faces[f + 1], base + faces[f + 2])

	## A pointed leaf card (double-sided). `nrm` is the shading normal for
	## both sides (usually pointing out of the bush for soft volume shading).
	func leaf(base_p: Vector3, along: Vector3, face: Vector3, length: float, width: float,
			col: Color, nrm: Vector3, ao: float = 1.0, cup: float = 0.25) -> void:
		var ax := along.normalized()
		var side := face.cross(ax)
		if side.length_squared() < 1e-6:
			side = ax.cross(Vector3.UP if absf(ax.y) < 0.9 else Vector3.RIGHT)
		side = side.normalized()
		var up := ax.cross(side).normalized()
		var tip := base_p + ax * length
		var mid := base_p + ax * length * 0.42
		var l := mid + side * width * 0.5 + up * width * cup
		var r := mid - side * width * 0.5 + up * width * cup
		var cb := Color(col.r * 0.82, col.g * 0.86, col.b * 0.8, ao * 0.9)
		var ct := Color(col.r * 1.08, col.g * 1.06, col.b, ao)
		var i0 := add(base_p, nrm, cb, Vector2(0.0, 0.0))
		var i1 := add(l, nrm, col * Color(1, 1, 1, ao), Vector2(-0.5, 0.42))
		var i2 := add(tip, nrm, ct, Vector2(0.0, 1.0))
		var i3 := add(r, nrm, col * Color(1, 1, 1, ao), Vector2(0.5, 0.42))
		tri2(i0, i1, i2)
		tri2(i0, i2, i3)

	## Ground mound (soil, gravel, litter) whose rim dips below the ground so
	## the terrain hides its edge.
	func bed(r: float, h: float, seg: int, col_c: Color, col_e: Color, wobble: float = 0.18, nseed: float = 0.0) -> void:
		var nz := GatherableMeshes.noise()
		var base := v.size()
		add(Vector3(0.0, h, 0.0), Vector3.UP, Color(col_c.r, col_c.g, col_c.b, 0.85), Vector2.ZERO)
		var rings := 3
		for ri in range(1, rings + 1):
			var f := float(ri) / float(rings)
			for j in seg:
				var a := TAU * float(j) / float(seg)
				var w := 1.0 + wobble * nz.get_noise_2d(cos(a) * 1.6 + nseed, sin(a) * 1.6 + nseed * 2.0)
				var rr := r * f * w
				var y := h * (1.0 - f * f) - 0.07 * pow(f, 3.0)
				var nrm := Vector3(cos(a) * f * 0.35, 1.0, sin(a) * f * 0.35).normalized()
				var col := col_c.lerp(col_e, f)
				add(Vector3(cos(a) * rr, y, sin(a) * rr), nrm, Color(col.r, col.g, col.b, lerpf(0.85, 1.0, f)), Vector2(cos(a) * rr, sin(a) * rr))
		for j in seg:
			tri(base, base + 1 + j, base + 1 + (j + 1) % seg)
		for ri in rings - 1:
			var a0 := base + 1 + ri * seg
			var a1 := base + 1 + (ri + 1) * seg
			for j in seg:
				var j1 := (j + 1) % seg
				quad(a0 + j, a1 + j, a1 + j1, a0 + j1)

	## A grid surface pos_fn(u, v) -> Vector3 (u, v in 0..1), double-sided.
	## `keep_fn(i, j) -> bool` can punch torn holes; normals from the grid.
	func sheet(nu: int, nv: int, pos_fn: Callable, col_fn: Callable, uv_scale: Vector2,
			keep_fn: Callable = Callable()) -> void:
		var grid := PackedVector3Array()
		for j in nv + 1:
			for i in nu + 1:
				var gp: Vector3 = pos_fn.call(float(i) / nu, float(j) / nv)
				grid.append(gp)
		var cols := nu + 1
		var base := v.size()
		for j in nv + 1:
			for i in nu + 1:
				var p := grid[j * cols + i]
				var du := grid[j * cols + mini(i + 1, nu)] - grid[j * cols + maxi(i - 1, 0)]
				var dv := grid[mini(j + 1, nv) * cols + i] - grid[maxi(j - 1, 0) * cols + i]
				var nrm := du.cross(dv).normalized()
				if nrm.y < 0.0:
					nrm = -nrm
				if nrm.length_squared() < 0.5:
					nrm = Vector3.UP
				var cc: Color = col_fn.call(float(i) / nu, float(j) / nv, p)
				add(p, nrm, cc, Vector2(float(i) / nu * uv_scale.x, float(j) / nv * uv_scale.y))
		for j in nv:
			for i in nu:
				if keep_fn.is_valid() and not bool(keep_fn.call(i, j)):
					continue
				var a := base + j * cols + i
				tri2(a, a + 1, a + cols + 1)
				tri2(a, a + cols + 1, a + cols)

	## Axis-aligned box (in `basis`) with flat faces.
	func box(center: Vector3, size: Vector3, basis: Basis, col: Color, ao_bottom: float = 0.7) -> void:
		var h := size * 0.5
		var dirs := [Vector3.RIGHT, Vector3.LEFT, Vector3.UP, Vector3.DOWN, Vector3.BACK, Vector3.FORWARD]
		for dd in dirs:
			var d: Vector3 = dd
			var u := Vector3.UP if absf(d.y) < 0.5 else Vector3.RIGHT
			var w := d.cross(u)
			var corners: Array[Vector3] = []
			for s in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
				var sv: Vector2 = s
				corners.append((d + u * sv.y + w * sv.x) * h)
			var nrm := (basis * d).normalized()
			var ids := PackedInt32Array()
			for cp in corners:
				var ao := ao_bottom if cp.y < 0.0 and d.y < 0.5 else 1.0
				if d.y < -0.5:
					ao = ao_bottom * 0.8
				ids.append(add(center + basis * cp, nrm, Color(col.r, col.g, col.b, ao), Vector2(cp.x + cp.z, cp.y) * 2.0))
			quad(ids[0], ids[1], ids[2], ids[3])

	## Torus in the XZ plane of `xf` (twine bands, gear rings).
	func torus(xf: Transform3D, big_r: float, r: float, seg: int, seg2: int, col: Color) -> void:
		var base := v.size()
		var nb := xf.basis.inverse().transposed()
		for i in seg + 1:
			var a := TAU * float(i) / float(seg)
			var ca := cos(a)
			var sa := sin(a)
			for j in seg2 + 1:
				var b2 := TAU * float(j) / float(seg2)
				var ln := Vector3(ca * cos(b2), sin(b2), sa * cos(b2))
				var lp := Vector3(ca * big_r, 0.0, sa * big_r) + ln * r
				var ao := 0.75 + 0.25 * clampf(ln.y * 0.5 + 0.5, 0.0, 1.0)
				add(xf * lp, (nb * ln).normalized(), Color(col.r, col.g, col.b, ao), Vector2(float(i) / float(seg) * 6.0, float(j) / float(seg2)))
		var cols := seg2 + 1
		for i in seg:
			for j in seg2:
				var a := base + i * cols + j
				var b3 := base + (i + 1) * cols + j
				quad(a, b3, b3 + 1, a + 1)


# =============================================================================
# Kinds
# =============================================================================

static func _grey(b: Builder, lo: float, hi: float) -> Color:
	var g := b.rng.randf_range(lo, hi)
	var warm := b.rng.randf_range(0.0, 0.05)
	return Color(g + 0.025 + warm, g + warm * 0.4, g - 0.03 - warm * 0.6)


## Mossy stone heap on a bed of disturbed earth and gravel.
static func _stone_pile(b: Builder, variant: int) -> void:
	var rng := b.rng
	var bed_r := rng.randf_range(0.74, 0.88)
	b.mat = Mat.GROUND
	b.part(Vector3.ZERO, -1.0)
	b.bed(bed_r, 0.045, 14, _hex("#6b5a46"), _hex("#7d6d55"), 0.22, float(variant) * 3.1)
	# Gravel that stays when the heap is gone.
	b.mat = Mat.STONE
	for i in 9:
		var a := rng.randf() * TAU
		var r := rng.randf_range(0.42, 0.85) * bed_r
		var s := rng.randf_range(0.03, 0.058)
		var p := Vector3(cos(a) * r, s * 0.25, sin(a) * r)
		b.blob(p, Vector3(s, s * 0.6, s * 0.85), Basis(Vector3.UP, rng.randf() * TAU), 0, 0.2, 2.0,
			float(i) + variant * 7.0, _grey(b, 0.34, 0.5), 0.7, -0.4)
	# The heap: a bottom ring, a middle ring and a cap stone.
	var specs: Array = []
	var n0 := 5 + (variant % 2)
	var a0 := rng.randf() * TAU
	for k in n0:
		var a := a0 + TAU * float(k) / n0 + rng.randf_range(-0.25, 0.25)
		var rr := rng.randf_range(0.31, 0.4)
		var rad := Vector3(rng.randf_range(0.19, 0.25), rng.randf_range(0.12, 0.16), rng.randf_range(0.16, 0.21))
		specs.append([Vector3(cos(a) * rr, rad.y * 0.52, sin(a) * rr), rad])
	var n1 := 3 if variant % 3 != 0 else 2
	var a1 := rng.randf() * TAU
	for k in n1:
		var a := a1 + TAU * float(k) / n1 + rng.randf_range(-0.3, 0.3)
		var rr := rng.randf_range(0.1, 0.16)
		var rad := Vector3(rng.randf_range(0.15, 0.19), rng.randf_range(0.105, 0.13), rng.randf_range(0.13, 0.17))
		specs.append([Vector3(cos(a) * rr, 0.19 + rad.y * 0.6, sin(a) * rr), rad])
	var top_r := Vector3(rng.randf_range(0.11, 0.14), rng.randf_range(0.085, 0.105), rng.randf_range(0.1, 0.13))
	specs.append([Vector3(rng.randf_range(-0.05, 0.05), 0.36 + top_r.y * 0.45, rng.randf_range(-0.05, 0.05)), top_r])
	# Higher stones are taken first.
	specs.sort_custom(func(x: Array, y: Array) -> bool: return (x[0] as Vector3).y > (y[0] as Vector3).y)
	var count := specs.size()
	var top_y := 0.0
	for i in count:
		var sp: Array = specs[i]
		var p: Vector3 = sp[0]
		var rad: Vector3 = sp[1]
		b.part(p - Vector3(0, rad.y * 0.5, 0), 0.97 - 0.94 * (float(i) + 0.5) / count)
		var col := _grey(b, 0.33, 0.5)
		var tilt := Basis(Vector3(rng.randf_range(-1, 1), 0, rng.randf_range(-1, 1)).normalized(), rng.randf_range(0.0, 0.3))
		var bs := tilt * Basis(Vector3.UP, rng.randf() * TAU)
		var lvl := 2 if rad.x > 0.225 or i == 0 else 1
		b.blob(p, rad, bs, lvl, 0.26, 1.5, float(i) * 3.7 + variant * 13.0, col, 0.38, -0.55)
		top_y = maxf(top_y, p.y + rad.y)
		if i == 0 or i == 2:
			b.glints.append(p + Vector3(0, rad.y * 0.9, 0))
	b.radius = bed_r * 0.85
	b.height = top_y


## Dark rock outcrop studded with glittering coal lumps (dark veins around
## each lump, so it still reads as a coal seam when picked clean).
static func _coal_vein(b: Builder, variant: int) -> void:
	var rng := b.rng
	var rad := Vector3(rng.randf_range(0.62, 0.76), rng.randf_range(0.44, 0.56), rng.randf_range(0.5, 0.62))
	var center := Vector3(0, rad.y * 0.55, 0)
	var host_basis := Basis(Vector3.UP, rng.randf() * TAU)
	var amp := 0.22
	var freq := 1.35
	var nseed := float(variant) * 5.3
	var flat_y := -0.5
	# Pick lump spots first (on the displaced host surface) so the host can
	# paint dark veins around them.
	var lumps: Array = []
	var tries := 0
	while lumps.size() < 11 and tries < 400:
		tries += 1
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(0.05, 1.0), rng.randf_range(-1, 1)).normalized()
		var lp := blob_point(d, rad, amp, freq, nseed, flat_y)
		var p := center + host_basis * (lp * 0.96)
		var ok := true
		for q in lumps:
			if (q[0] as Vector3).distance_to(p) < 0.16:
				ok = false
				break
		if ok:
			lumps.append([p, (host_basis * d).normalized(), 0.35 + 0.6 * rng.randf()])
	var dark := _hex("#141316")
	var gv := rng.randf_range(0.28, 0.34)
	var slate := Color(gv + 0.02, gv, gv - 0.02)
	var col_fn := func(lp: Vector3, _d: Vector3) -> Color:
		var wp := center + host_basis * lp
		var k := 0.0
		for q in lumps:
			var dd := (q[0] as Vector3).distance_to(wp)
			k = maxf(k, smoothstep(0.24, 0.08, dd))
		return slate.lerp(dark, k * 0.92)
	b.mat = Mat.GROUND
	b.part(Vector3.ZERO, -1.0)
	b.bed(rad.x * 1.25, 0.02, 16, _hex("#5a5048"), _hex("#6e6455"), 0.2, float(variant) * 2.3)
	b.mat = Mat.ROCK
	b.blob(center, rad, host_basis, 2, amp, freq, nseed, slate, 0.45, flat_y, col_fn)
	# A smaller companion rock.
	var side := Vector3(rng.randf_range(0.55, 0.7), 0.0, rng.randf_range(-0.4, 0.4))
	var r2 := rad * rng.randf_range(0.38, 0.48)
	b.blob(side + Vector3(0, r2.y * 0.45, 0), r2, Basis(Vector3.UP, rng.randf() * TAU), 1, 0.22, 1.6, float(variant) * 9.1 + 3.0, slate * 1.05, 0.5, -0.5)
	# Loose lumps at the foot of the rock are taken first.
	var nl := rng.randi_range(2, 3)
	for i in nl:
		var a := rng.randf() * TAU
		var p := Vector3(cos(a) * rad.x * 1.1, 0.04, sin(a) * rad.z * 1.1)
		lumps.append([p, Vector3.UP, 0.8 + 0.15 * rng.randf()])
	b.mat = Mat.COAL
	for i in lumps.size():
		var lp: Vector3 = lumps[i][0]
		var ld: Vector3 = lumps[i][1]
		var order: float = lumps[i][2]
		b.part(lp, clampf(order, 0.02, 0.98))
		var s := rng.randf_range(0.085, 0.13)
		var bs := basis_y(ld) * Basis(Vector3.UP, rng.randf() * TAU)
		var shade := rng.randf_range(0.9, 1.15)
		b.facet(lp + ld * s * 0.2, Vector3(s * 1.15, s * 0.85, s), bs, 0.3, Color(0.075 * shade, 0.075 * shade, 0.085 * shade))
		if i < 2:
			b.glints.append(lp + ld * s)
	b.radius = rad.x * 1.05
	b.height = center.y + rad.y


## The point on a `blob()` surface in direction `d` (same displacement).
static func blob_point(d: Vector3, radii: Vector3, amp: float, freq: float, nseed: float, flat_y: float) -> Vector3:
	var nz := noise()
	var off := Vector3(nseed * 17.3, nseed * 5.1, nseed * 11.7)
	var q := d * freq + off
	var disp := 1.0 + amp * nz.get_noise_3d(q.x, q.y, q.z)
	var p := Vector3(d.x * radii.x, d.y * radii.y, d.z * radii.z) * disp
	if p.y < flat_y * radii.y:
		p.y = lerpf(p.y, flat_y * radii.y, 0.85)
	return p


## Round shrub of leaves dotted with clusters of red berries.
static func _berry_bush(b: Builder, variant: int) -> void:
	var rng := b.rng
	var hull := Vector3(rng.randf_range(0.5, 0.6), rng.randf_range(0.38, 0.46), rng.randf_range(0.5, 0.6))
	var c := Vector3(0, hull.y * 0.98, 0)
	b.part(Vector3.ZERO, -1.0)
	b.mat = Mat.WOOD
	for i in 4:
		var a := rng.randf() * TAU
		var foot := Vector3(cos(a) * 0.06, -0.04, sin(a) * 0.06)
		var top := c + Vector3(cos(a) * 0.18, -0.05, sin(a) * 0.18)
		b.tube(PackedVector3Array([foot, foot.lerp(top, 0.5) + Vector3(0, 0.02, 0), top]),
			PackedFloat32Array([0.024, 0.018, 0.012]), 5, _hex("#4a3826"), false, false, Color(-1, 0, 0), 0.5, 0.7)
	b.mat = Mat.CORE
	for i in 5:
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.2, 0.8), rng.randf_range(-1, 1)).normalized()
		var p := c + Vector3(d.x * hull.x, d.y * hull.y, d.z * hull.z) * 0.38
		var r := hull * rng.randf_range(0.5, 0.62)
		b.blob(p, r, Basis(Vector3.UP, rng.randf() * TAU), 1, 0.25, 2.0, float(i) + variant * 3.0, _hex("#203a1b"), 0.35)
	b.mat = Mat.LEAF
	var greens := [_hex("#2f5a28"), _hex("#3b6a2d"), _hex("#4a7a33"), _hex("#567f36"), _hex("#2a4f25")]
	var nleaf := 118
	var golden := PI * (3.0 - sqrt(5.0))
	for i in nleaf:
		var y := 1.0 - (float(i) + 0.5) / nleaf * 1.42
		var rr := sqrt(maxf(1.0 - y * y, 0.0))
		var th := golden * i + rng.randf_range(-0.2, 0.2)
		var d := Vector3(cos(th) * rr, y, sin(th) * rr).normalized()
		var p := c + Vector3(d.x * hull.x, d.y * hull.y, d.z * hull.z) * rng.randf_range(0.84, 1.03)
		var tang := d.cross(Vector3.UP)
		if tang.length_squared() < 0.01:
			tang = Vector3.RIGHT
		tang = tang.normalized().rotated(d, rng.randf_range(-PI, PI))
		var along := (tang * 0.75 + d * 0.45 + Vector3.UP * 0.2).normalized()
		var face := (d + Vector3(rng.randf_range(-0.4, 0.4), 0.3, rng.randf_range(-0.4, 0.4))).normalized()
		var col: Color = greens[rng.randi() % greens.size()]
		if rng.randf() < 0.07:
			col = _hex("#7d8a3a")
		col = col.lightened(rng.randf_range(-0.05, 0.08))
		var ao := lerpf(0.55, 1.0, smoothstep(-0.7, 0.8, d.y))
		var sn := (d * 0.75 + face * 0.25).normalized()
		b.leaf(p - along * 0.05, along, face, rng.randf_range(0.13, 0.18), rng.randf_range(0.07, 0.09), col, sn, ao)
	# Berry clusters on the upper/outer surface, each berry its own part.
	b.mat = Mat.BERRY
	var reds := [_hex("#cf2a26"), _hex("#e03a2c"), _hex("#b81e22"), _hex("#e8483a"), _hex("#a3182a")]
	var clusters := 9 + (variant % 3)
	var cl_done := 0
	var tries := 0
	var centers: Array[Vector3] = []
	while cl_done < clusters and tries < 300:
		tries += 1
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.15, 1.0), rng.randf_range(-1, 1)).normalized()
		var cp := c + Vector3(d.x * hull.x, d.y * hull.y, d.z * hull.z) * 1.03
		var far := true
		for q in centers:
			if q.distance_to(cp) < 0.17:
				far = false
				break
		if not far:
			continue
		centers.append(cp)
		cl_done += 1
		var t1 := d.cross(Vector3.UP)
		if t1.length_squared() < 0.01:
			t1 = Vector3.RIGHT
		t1 = t1.normalized()
		var t2 := d.cross(t1).normalized()
		var nb := rng.randi_range(3, 5)
		for k in nb:
			var a := TAU * float(k) / nb + rng.randf()
			var off := (t1 * cos(a) + t2 * sin(a)) * rng.randf_range(0.025, 0.05)
			var r := rng.randf_range(0.036, 0.048)
			var bp := cp + off + d * r * 0.3 - Vector3(0, float(k) * 0.006, 0)
			b.part(bp, rng.randf_range(0.03, 0.96))
			var col: Color = reds[rng.randi() % reds.size()]
			b.ball(bp, r, col, 0, 0.7)
		if cl_done <= 2:
			b.glints.append(cp + d * 0.05)
	b.radius = hull.x * 1.05
	b.height = c.y + hull.y


## A little cluster of brown (or cream) mushrooms with pale spots on a patch
## of moss and fallen leaves.
static func _mushrooms(b: Builder, variant: int) -> void:
	var rng := b.rng
	var bed_r := rng.randf_range(0.3, 0.38)
	b.part(Vector3.ZERO, -1.0)
	b.mat = Mat.LITTER
	b.bed(bed_r, 0.03, 16, _hex("#46502a"), _hex("#5a4f36"), 0.25, float(variant) * 1.7)
	var count := 3 + (variant % 3)
	var brown := variant % 3 != 2
	var spots_on := brown
	var placed: Array[Vector3] = []
	var tallest := 0.0
	var tall_p := Vector3.ZERO
	for i in count:
		var p := Vector3.ZERO
		for _t in 30:
			var a := rng.randf() * TAU
			var r := rng.randf_range(0.0, 0.18) if i > 0 else rng.randf_range(0.0, 0.05)
			p = Vector3(cos(a) * r, 0.0, sin(a) * r)
			var ok := true
			for q in placed:
				if q.distance_to(p) < 0.1:
					ok = false
					break
			if ok:
				break
		placed.append(p)
		var big := 1.0 if i == 0 else rng.randf_range(0.55, 0.85)
		var hgt := rng.randf_range(0.13, 0.19) * big
		var cap_r := rng.randf_range(0.09, 0.125) * big
		var cap_h := cap_r * rng.randf_range(0.5, 0.7)
		var sr := cap_r * rng.randf_range(0.28, 0.34)
		var lean := Vector3(rng.randf_range(-1, 1), 0, rng.randf_range(-1, 1)).normalized() * rng.randf_range(0.05, 0.22)
		var up := (Vector3.UP + lean).normalized()
		var bs := basis_y(up) * Basis(Vector3.UP, rng.randf() * TAU)
		var xf := Transform3D(bs, p)
		b.part(p, 0.95 - 0.9 * float(i) / float(maxi(count, 1)) if i > 0 else 0.04)
		b.mat = Mat.STEM
		var stem_col := _hex("#e6dcc4").lerp(_hex("#d2c3a2"), rng.randf())
		b.lathe(PackedVector2Array([Vector2(sr * 1.45, -0.03), Vector2(sr * 1.3, 0.0), Vector2(sr * 1.05, hgt * 0.3),
			Vector2(sr * 0.95, hgt * 0.75), Vector2(sr * 0.9, hgt + 0.005)]), xf, 8, stem_col, 0.45, 0.8)
		var cap_col: Color
		if brown:
			cap_col = _hex("#6e4527").lerp(_hex("#9a6236"), rng.randf())
		else:
			cap_col = _hex("#d9c6a0").lerp(_hex("#c8ad80"), rng.randf())
		b.mat = Mat.GILLS
		b.lathe(PackedVector2Array([Vector2(sr * 0.92, hgt - cap_h * 0.05), Vector2(cap_r * 0.6, hgt - 0.004),
			Vector2(cap_r * 0.99, hgt + 0.004)]), xf, 11, _hex("#ead9b8"), 0.6, 0.85, true)
		b.mat = Mat.CAP
		var cap := PackedVector2Array([Vector2(cap_r * 0.99, hgt + 0.004), Vector2(cap_r * 1.02, hgt + cap_h * 0.22),
			Vector2(cap_r * 0.9, hgt + cap_h * 0.58), Vector2(cap_r * 0.6, hgt + cap_h * 0.88), Vector2(cap_r * 0.25, hgt + cap_h * 0.99), Vector2(0.0, hgt + cap_h)])
		b.lathe(cap, xf, 11, cap_col, 0.8, 1.0)
		if spots_on:
			b.mat = Mat.SPOT
			var ns := rng.randi_range(5, 8)
			for k in ns:
				var t := rng.randf_range(0.25, 0.85)
				var seg_f := t * (cap.size() - 1)
				var si := mini(int(seg_f), cap.size() - 2)
				var pp := cap[si].lerp(cap[si + 1], seg_f - si)
				var ang := TAU * float(k) / ns + rng.randf_range(-0.4, 0.4)
				var tg := (cap[si + 1] - cap[si]).normalized()
				var pn := Vector2(tg.y, -tg.x)
				var lp := Vector3(pp.x * cos(ang), pp.y, pp.x * sin(ang))
				var ln := Vector3(pn.x * cos(ang), pn.y, pn.x * sin(ang)).normalized()
				var sp_r := cap_r * rng.randf_range(0.1, 0.16)
				var wp := xf * (lp + ln * 0.003)
				var wn := (bs * ln).normalized()
				_spot(b, wp, wn, sp_r, _hex("#f2e8d2"))
		var top := xf * Vector3(0, hgt + cap_h, 0)
		if top.y > tallest:
			tallest = top.y
			tall_p = top
	b.glints.append(tall_p + Vector3(0, 0.02, 0))
	b.radius = bed_r
	b.height = tallest
	b.casts_shadow = false


static func _spot(b: Builder, p: Vector3, nrm: Vector3, r: float, col: Color) -> void:
	var bs := basis_y(nrm)
	var ci := b.add(p + nrm * r * 0.18, nrm, Color(col.r, col.g, col.b, 1.0), Vector2.ZERO)
	var rim := PackedInt32Array()
	for j in 6:
		var a := TAU * float(j) / 6.0
		var q := p + bs * Vector3(cos(a) * r, 0.0, sin(a) * r * 0.85)
		rim.append(b.add(q, nrm, Color(col.r, col.g, col.b, 0.95), Vector2.ZERO))
	for j in 6:
		b.tri(ci, rim[j], rim[(j + 1) % 6])


## A bundle of dry sticks tied with twine, plus a few loose twigs.
static func _twigs(b: Builder, variant: int) -> void:
	var rng := b.rng
	var bark := [_hex("#7a5f45"), _hex("#8b6d4e"), _hex("#6b5440"), _hex("#957657"), _hex("#80684f")]
	var end_col := _hex("#d8bf8c")
	var yaw := Basis(Vector3.UP, rng.randf_range(-0.3, 0.3))
	var center := Vector3(0, 0.07, 0)
	b.part(center, 0.06)
	b.mat = Mat.WOOD
	var nstick := 10 + variant % 4
	var bundle_r := 0.065
	for i in nstick:
		var a := rng.randf() * TAU
		var rr := sqrt(rng.randf()) * bundle_r
		var off := Vector3(0, sin(a) * rr * 0.8, cos(a) * rr)
		var length := rng.randf_range(0.55, 0.74)
		var x0 := -length * 0.5 + rng.randf_range(-0.06, 0.06)
		var bend := Vector3(0, rng.randf_range(-0.012, 0.012), rng.randf_range(-0.018, 0.018))
		var r := rng.randf_range(0.015, 0.024)
		var pts := PackedVector3Array([center + yaw * (off + Vector3(x0, 0, 0)), center + yaw * (off + Vector3(x0 + length * 0.5, 0, 0) + bend),
			center + yaw * (off + Vector3(x0 + length, 0, 0) + bend * 0.3)])
		var col: Color = bark[rng.randi() % bark.size()]
		b.tube(pts, PackedFloat32Array([r, r * 0.95, r * 0.85]), 5, col, true, true, end_col, 0.7, 0.85)
		if rng.randf() < 0.3:
			var fp := pts[1].lerp(pts[2], 0.4)
			var fd := (yaw * Vector3(1.0, rng.randf_range(0.2, 0.6), rng.randf_range(-0.8, 0.8))).normalized()
			b.tube(PackedVector3Array([fp, fp + fd * rng.randf_range(0.08, 0.13)]), PackedFloat32Array([r * 0.6, r * 0.4]), 4, col, false, true, end_col)
	b.mat = Mat.TWINE
	for sx in [-0.15, 0.16]:
		var tx := Transform3D(yaw * Basis(Vector3.BACK, PI * 0.5), center + yaw * Vector3(float(sx), 0, 0))
		b.torus(tx, bundle_r + 0.02, 0.011, 10, 3, _hex("#cfae6a"))
	b.glints.append(center + Vector3(0, bundle_r + 0.04, 0))
	# Loose twigs taken first.
	b.mat = Mat.WOOD
	var nl := 2 + variant % 3
	for i in nl:
		var a := rng.randf() * TAU
		var dist := rng.randf_range(0.22, 0.4)
		var p := Vector3(cos(a) * dist, 0.0, sin(a) * dist)
		var dir := Vector3(cos(a + rng.randf_range(0.8, 2.2)), 0, sin(a + rng.randf_range(0.8, 2.2))).normalized()
		var length := rng.randf_range(0.28, 0.42)
		var r := rng.randf_range(0.012, 0.017)
		b.part(p, 0.4 + 0.5 * float(i) / float(nl))
		var col: Color = bark[rng.randi() % bark.size()]
		var p0 := p - dir * length * 0.5 + Vector3(0, r * 0.7, 0)
		var p1 := p + dir * length * 0.5 + Vector3(0, r * 0.7, 0)
		var mid := p0.lerp(p1, 0.5) + Vector3(0, 0.01, 0) + dir.cross(Vector3.UP) * rng.randf_range(-0.02, 0.02)
		b.tube(PackedVector3Array([p0, mid, p1]), PackedFloat32Array([r, r * 0.9, r * 0.75]), 5, col, true, true, end_col, 0.7, 0.8)
		if rng.randf() < 0.6:
			var fd := (dir + dir.cross(Vector3.UP) * rng.randf_range(-0.9, 0.9)).normalized()
			b.tube(PackedVector3Array([mid, mid + fd * 0.1 + Vector3(0, 0.005, 0)]), PackedFloat32Array([r * 0.6, r * 0.4]), 4, col, false, true, end_col)
	b.radius = 0.45
	b.height = 0.2
	b.casts_shadow = false


## Two or three old, sun-bleached cartoon bones lying in the grass.
static func _bones(b: Builder, variant: int) -> void:
	var rng := b.rng
	var ivory := [_hex("#d9d0b6"), _hex("#cfc4a6"), _hex("#e0d8c2")]
	var count := 2 + variant % 2
	var a0 := rng.randf() * TAU
	b.mat = Mat.BONE
	var top := 0.0
	for i in count:
		var a := a0 + TAU * float(i) / count + rng.randf_range(-0.4, 0.4)
		var c := Vector3(cos(a), 0.0, sin(a)) * rng.randf_range(0.06, 0.18)
		var length := rng.randf_range(0.27, 0.4)
		var dir := Vector3(cos(a + PI * 0.5 + rng.randf_range(-0.6, 0.6)), 0, sin(a + PI * 0.5 + rng.randf_range(-0.6, 0.6))).normalized()
		var side := dir.cross(Vector3.UP).normalized()
		var r := rng.randf_range(0.022, 0.028)
		var y := r + 0.004 + float(i) * 0.012
		var col: Color = ivory[rng.randi() % ivory.size()]
		b.part(c, 0.15 + 0.8 * float(i) / float(count))
		var p0 := c - dir * length * 0.5 + Vector3(0, y, 0)
		var p1 := c + dir * length * 0.5 + Vector3(0, y, 0)
		b.tube(PackedVector3Array([p0, p0.lerp(p1, 0.5), p1]), PackedFloat32Array([r * 1.05, r * 0.88, r * 1.05]), 8, col, false, false, Color(-1, 0, 0), 0.7, 0.7)
		var kr := r * rng.randf_range(1.5, 1.75)
		for end in [p0, p1]:
			var e: Vector3 = end
			for s in [-1.0, 1.0]:
				var kp := e + side * kr * 0.72 * float(s) + (e - c).normalized() * kr * 0.25
				b.ball(Vector3(kp.x, maxf(kp.y, kr * 0.7), kp.z), kr, col, 1, 0.65)
		top = maxf(top, y + kr)
		b.glints.append(c + Vector3(0, y + r, 0))
	b.radius = 0.32
	b.height = top
	b.casts_shadow = false


## Torn canvas scraps / an old tarp.
static func _cloth(b: Builder, variant: int) -> void:
	var rng := b.rng
	var palette := [_hex("#a4442e"), _hex("#b08a3e"), _hex("#d3c6a2"), _hex("#6a6c45"), _hex("#4f6a8a"), _hex("#93402e")]
	var col: Color = palette[(variant * 2 + 1) % palette.size()] if variant % 3 != 2 else palette[2]
	var col2: Color = palette[(variant + 4) % palette.size()]
	var nz := GatherableMeshes.noise()
	var seed_f := float(variant) * 4.1
	b.mat = Mat.CLOTH
	var top := 0.0
	if variant % 3 == 1:
		# Draped over a small rock.
		b.part(Vector3.ZERO, -1.0)
		b.mat = Mat.STONE
		var rr := Vector3(0.28, 0.2, 0.24)
		b.blob(Vector3(0.05, 0.1, 0.0), rr, Basis(Vector3.UP, rng.randf() * TAU), 2, 0.2, 1.8, seed_f, _grey(b, 0.45, 0.55), 0.5, -0.5)
		b.mat = Mat.CLOTH
		b.part(Vector3(0, 0.1, 0), 0.5)
		var w := 0.95
		var d := 0.8
		var pos_fn := func(u: float, vv: float) -> Vector3:
			var x := (u - 0.5) * w
			var z := (vv - 0.5) * d
			var q := Vector2((x - 0.05) / 0.42, z / 0.38)
			var dome := pow(maxf(0.0, 1.0 - q.length_squared()), 0.6) * 0.37
			var fold := 0.025 + 0.03 * sin(u * 9.0 + seed_f) * sin(vv * 6.0 + seed_f * 0.5) + 0.02 * nz.get_noise_2d(u * 4.0 + seed_f, vv * 4.0)
			var edge := minf(minf(u, 1.0 - u), minf(vv, 1.0 - vv))
			var y := maxf(fold * smoothstep(0.0, 0.18, edge), dome + 0.012 * nz.get_noise_2d(u * 7.0, vv * 7.0 + seed_f))
			var tear := 0.06 * maxf(0.0, nz.get_noise_2d(u * 9.0 + seed_f, vv * 9.0)) * (1.0 - smoothstep(0.0, 0.12, edge))
			return Vector3(x * (1.0 - tear), y + 0.008, z * (1.0 - tear))
		b.sheet(10, 9, pos_fn, _cloth_col_fn(col, col2, nz, seed_f), Vector2(w, d), _cloth_keep(rng, 10, 9))
		top = 0.36
	elif variant % 3 == 2:
		# A small stack of folded scraps + one crumpled piece.
		var y := 0.0
		for i in 3:
			var sz := Vector3(rng.randf_range(0.32, 0.4), rng.randf_range(0.028, 0.04), rng.randf_range(0.24, 0.3))
			var cc: Color = palette[(variant + i * 2) % palette.size()]
			var p := Vector3(rng.randf_range(-0.03, 0.03), y + sz.y * 0.5, rng.randf_range(-0.03, 0.03))
			b.part(p, 0.1 + 0.3 * float(i))
			b.box(p, sz, Basis(Vector3.UP, rng.randf_range(-0.35, 0.35)) * Basis(Vector3.RIGHT, rng.randf_range(-0.04, 0.04)), cc, 0.75)
			y += sz.y * 0.92
		top = y
		b.part(Vector3(0.3, 0.02, 0.15), 0.9)
		var pos_fn2 := func(u: float, vv: float) -> Vector3:
			var x := (u - 0.5) * 0.42
			var z := (vv - 0.5) * 0.36
			var edge := minf(minf(u, 1.0 - u), minf(vv, 1.0 - vv))
			var h := (0.03 + 0.03 * sin(u * 11.0 + seed_f) * cos(vv * 8.0)) * smoothstep(0.0, 0.2, edge) + 0.006
			return Vector3(0.32 + x, h, 0.16 + z)
		b.sheet(6, 5, pos_fn2, _cloth_col_fn(col2, col, nz, seed_f + 3.0), Vector2(0.42, 0.36))
	else:
		# A crumpled tarp lying on the ground.
		b.part(Vector3(0, 0.05, 0), 0.5)
		var w := rng.randf_range(0.95, 1.1)
		var d := rng.randf_range(0.72, 0.85)
		var pos_fn3 := func(u: float, vv: float) -> Vector3:
			var x := (u - 0.5) * w
			var z := (vv - 0.5) * d
			var edge := minf(minf(u, 1.0 - u), minf(vv, 1.0 - vv))
			var ridge := 0.04 * maxf(0.0, sin(u * 5.0 + seed_f) * sin(vv * 3.5 + seed_f * 0.7))
			var folds := 0.022 * sin(u * 15.0 + 2.5 * sin(vv * 4.0 + seed_f)) + 0.012 * sin(vv * 21.0 + u * 6.0)
			var crumple := 0.028 * nz.get_noise_2d(u * 9.0 + seed_f, vv * 9.0) + 0.022
			var y := maxf(ridge + folds + crumple, 0.004) * smoothstep(0.0, 0.16, edge) + 0.006
			var tear := 0.12 * maxf(0.0, nz.get_noise_2d(u * 13.0 + seed_f * 2.0, vv * 13.0)) * (1.0 - smoothstep(0.0, 0.14, edge))
			return Vector3(x * (1.0 - tear), y, z * (1.0 - tear))
		b.sheet(15, 12, pos_fn3, _cloth_col_fn(col, col2, nz, seed_f), Vector2(w, d), _cloth_keep(rng, 15, 12))
		top = 0.12
	b.glints.append(Vector3(0, top + 0.04, 0))
	b.radius = 0.5
	b.height = top
	b.casts_shadow = true


static func _cloth_col_fn(col: Color, col2: Color, nz: FastNoiseLite, seed_f: float) -> Callable:
	return func(u: float, vv: float, _p: Vector3) -> Color:
		var edge := minf(minf(u, 1.0 - u), minf(vv, 1.0 - vv))
		var stain := 0.5 + 0.5 * nz.get_noise_2d(u * 3.0 + seed_f, vv * 3.0 - seed_f)
		var cc := col.lerp(col2, 0.1 * stain)
		cc = cc.darkened(0.12 * (1.0 - smoothstep(0.0, 0.12, edge)) + 0.05 * stain)
		return Color(cc.r, cc.g, cc.b, lerpf(0.75, 1.0, smoothstep(0.0, 0.2, edge)))


## Punch one or two small torn holes near the edges of a cloth grid.
static func _cloth_keep(rng: RandomNumberGenerator, nu: int, nv: int) -> Callable:
	var holes: Array[Vector2i] = []
	for _i in rng.randi_range(1, 2):
		var i := rng.randi_range(1, nu - 2)
		var j := rng.randi_range(0, 1) if rng.randf() < 0.5 else rng.randi_range(nv - 2, nv - 1)
		holes.append(Vector2i(i, j))
	return func(i: int, j: int) -> bool:
		for h in holes:
			if h.x == i and h.y == j:
				return false
		return true


## A heap of rusty bits: a bent corrugated sheet, a pipe, a gear, a can, nuts.
static func _scrap(b: Builder, variant: int) -> void:
	var rng := b.rng
	var rust := _hex("#8a4a2a")
	var steel := _hex("#7d7a74")
	var nz := GatherableMeshes.noise()
	var seed_f := float(variant) * 2.9
	b.part(Vector3.ZERO, -1.0)
	b.mat = Mat.GROUND
	b.bed(0.62, 0.035, 12, _hex("#6a5644"), _hex("#7a6a52"), 0.2, seed_f)
	b.mat = Mat.METAL
	# Corrugated sheet leaning on the heap (taken last).
	var sheet_yaw := Basis(Vector3.UP, rng.randf() * TAU)
	var lean := rng.randf_range(0.25, 0.45)
	b.part(Vector3(0, 0.1, 0), 0.08)
	var w := 0.62
	var dd := 0.44
	var pos_fn := func(u: float, vv: float) -> Vector3:
		var x := (u - 0.5) * w
		var z := (vv - 0.5) * dd
		var y := 0.016 * sin(vv * TAU * 4.0) + 0.05 * sin(u * PI) * (1.0 + 0.3 * nz.get_noise_2d(u * 3.0 + seed_f, vv))
		var p := Basis(Vector3.RIGHT, lean) * Vector3(x, y, z)
		return sheet_yaw * (p + Vector3(0, 0.12, 0))
	var col_fn := func(_u: float, _v: float, p: Vector3) -> Color:
		var k := 0.5 + 0.5 * nz.get_noise_3d(p.x * 6.0 + seed_f, p.y * 6.0, p.z * 6.0)
		var cc := rust.lerp(steel, k * 0.6)
		return Color(cc.r, cc.g, cc.b, 0.85)
	b.sheet(9, 8, pos_fn, col_fn, Vector2(w, dd))
	# Pipe.
	var pa := Vector3(rng.randf_range(-0.3, -0.18), 0.045, rng.randf_range(-0.15, 0.2))
	var pb := pa + Vector3(cos(rng.randf() * TAU), 0, sin(rng.randf() * TAU)) * rng.randf_range(0.36, 0.46) + Vector3(0, 0.03, 0)
	b.part(pa.lerp(pb, 0.5), 0.45)
	b.tube(PackedVector3Array([pa, pa.lerp(pb, 0.5), pb]), PackedFloat32Array([0.04, 0.04, 0.04]), 10, _hex("#6e6a64").lerp(rust, 0.4), true, true, _hex("#1e1b19"), 0.75, 0.8)
	# Gear: a ring with teeth.
	var gp := Vector3(rng.randf_range(0.05, 0.2), 0.035, rng.randf_range(-0.25, -0.1))
	b.part(gp, 0.65)
	var gb := Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.RIGHT, rng.randf_range(-0.2, 0.2))
	var gcol := _hex("#4f4b47")
	b.torus(Transform3D(gb, gp), 0.085, 0.022, 16, 5, gcol)
	for k in 9:
		var a := TAU * float(k) / 9.0
		var tp := gp + gb * Vector3(cos(a) * 0.115, 0.0, sin(a) * 0.115)
		b.box(tp, Vector3(0.035, 0.03, 0.028), gb * Basis(Vector3.UP, -a), gcol, 0.8)
	# Old can on its side.
	var cp := Vector3(rng.randf_range(-0.1, 0.15), 0.048, rng.randf_range(0.18, 0.3))
	b.part(cp, 0.85)
	var cb := Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.BACK, PI * 0.5)
	var cans: Array[Color] = [_hex("#5d7a5a"), _hex("#8a3b30"), _hex("#5a6e86")]
	var can_col: Color = cans[variant % 3]
	b.lathe(PackedVector2Array([Vector2(0.0, -0.058), Vector2(0.044, -0.058), Vector2(0.046, -0.05), Vector2(0.045, 0.0),
		Vector2(0.046, 0.05), Vector2(0.044, 0.058), Vector2(0.0, 0.058)]), Transform3D(cb, cp), 10, can_col, 0.7, 0.9)
	# Nuts and bolts.
	for k in 3:
		var a := rng.randf() * TAU
		var np := Vector3(cos(a), 0, sin(a)) * rng.randf_range(0.3, 0.45) + Vector3(0, 0.012, 0)
		b.part(np, 0.7 + 0.1 * k)
		b.lathe(PackedVector2Array([Vector2(0.0, -0.01), Vector2(0.022, -0.01), Vector2(0.022, 0.01), Vector2(0.0, 0.01)]),
			Transform3D(Basis(Vector3.UP, rng.randf()), np), 6, _hex("#6b665f"), 0.7, 1.0)
	b.glints.append(sheet_yaw * (Basis(Vector3.RIGHT, lean) * Vector3(0.15, 0.06, 0.1) + Vector3(0, 0.12, 0)))
	b.glints.append(gp + Vector3(0, 0.04, 0))
	b.radius = 0.55
	b.height = 0.3
