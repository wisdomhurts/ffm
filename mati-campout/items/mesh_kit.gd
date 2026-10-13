class_name MeshKit
extends RefCounted
## Small procedural mesh toolkit shared by the character, held items and
## pickups.
##
## Primitives are appended into one indexed triangle list. Each vertex carries
##   COLOR   rgb = albedo (sRGB), a = baked ambient occlusion (1 = open)
##   UV      surface coordinates in metres (patterns stay the same size)
##   CUSTOM0 (roughness, metallic, emission, pattern id)
## which shaders/character.gdshader reads, so a whole character part or item
## is a single draw call with one shared material.
##
## Usage:
##   var k := MeshKit.new()
##   k.paint(Color("#8a5a33"), 0.8, 0.0, 0.0, MeshKit.Pat.WOOD)
##   k.capsule(Vector3.ZERO, Vector3(0, 0.6, 0), 0.02, 0.018)
##   var mesh := k.to_mesh()

const SHADER_PATH := "res://shaders/character.gdshader"

## Surface patterns understood by the shader (CUSTOM0.w).
enum Pat { NONE, PLAID, RIBBED, QUILTED, WOOD, HAIR, DENIM, RUST, LEATHER, CRYSTAL, CANVAS, GRILL, KNIT }

static var _material: ShaderMaterial = null

var color := Color(0.8, 0.8, 0.8)
var rough := 0.75
var metal := 0.0
var emit := 0.0
var pattern: int = Pat.NONE
## Baked occlusion multiplier for the next primitives (1 = none).
var ao := 1.0
## Extra darkening toward the primitive's own bottom (0..1).
var ao_grad := 0.0
## Optional per-vertex colour: func(pos: Vector3, normal: Vector3) -> Color,
## both in mesh space. Overrides `color` while set.
var color_fn: Callable = Callable()

var _v := PackedVector3Array()
var _n := PackedVector3Array()
var _c := PackedColorArray()
var _uv := PackedVector2Array()
var _m := PackedFloat32Array()
var _i := PackedInt32Array()


## The shared character/item material.
static func material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = ShaderCompat.shader(SHADER_PATH)
	return _material


## Set the paint for the next primitives. Returns self for chaining.
func paint(c: Color, r: float = 0.75, m: float = 0.0, e: float = 0.0, pat: int = Pat.NONE) -> MeshKit:
	color = c
	rough = r
	metal = m
	emit = e
	pattern = pat
	color_fn = Callable()
	return self


func vertex_count() -> int:
	return _v.size()


func is_empty() -> bool:
	return _i.is_empty()


# --- Low level -----------------------------------------------------------------------

func _add(p: Vector3, n: Vector3, uv: Vector2, a: float) -> int:
	var c := color
	if color_fn.is_valid():
		c = color_fn.call(p, n)
	_v.append(p)
	_n.append(n)
	_c.append(Color(c.r, c.g, c.b, clampf(a, 0.0, 1.0)))
	_uv.append(uv)
	_m.append(rough)
	_m.append(metal)
	_m.append(emit)
	_m.append(float(pattern))
	return _v.size() - 1


## Triangle whose winding is fixed so its face points along the vertex normals.
func _tri(a: int, b: int, c: int) -> void:
	var g := (_v[b] - _v[a]).cross(_v[c] - _v[a])
	if g.length_squared() < 1e-14:
		return
	var avg := _n[a] + _n[b] + _n[c]
	if g.dot(avg) < 0.0:
		var t := b
		b = c
		c = t
	# Godot treats clockwise triangles as front faces.
	_i.append(a)
	_i.append(c)
	_i.append(b)


func _quad(a: int, b: int, c: int, d: int) -> void:
	_tri(a, b, c)
	_tri(a, c, d)


static func _normal_basis(t: Transform3D) -> Basis:
	return t.basis.inverse().transposed()


## A basis whose +Y axis points along `dir`.
static func basis_y(dir: Vector3) -> Basis:
	var y := dir.normalized()
	if y.length_squared() < 0.5:
		return Basis.IDENTITY
	var ref := Vector3.FORWARD if absf(y.dot(Vector3.FORWARD)) < 0.95 else Vector3.RIGHT
	var x := ref.cross(y).normalized()
	var z := x.cross(y).normalized()
	return Basis(x, y, z)


## Transform that places local +Y from a toward b (origin at a).
static func along(a: Vector3, b: Vector3) -> Transform3D:
	return Transform3D(basis_y(b - a), a)


# --- Surfaces of revolution --------------------------------------------------------------

## Revolve a profile (Vector2(radius, height), listed from bottom to top) around
## local +Y. Repeat a point to make a hard crease. `rz` squashes the depth
## (elliptical cross-section). `arc` < TAU makes an open shell (start angle
## `arc_start`, measured from +X toward +Z; -PI/2 is the front, -Z).
## `flat` gives faceted shading (crystals). `deform` (optional) maps every
## mesh-space point to a new position; normals are rebuilt from the grid.
func lathe(profile: PackedVector2Array, t: Transform3D = Transform3D.IDENTITY, seg: int = 16,
		rz: float = 1.0, arc: float = TAU, arc_start: float = 0.0, flat: bool = false,
		deform: Callable = Callable()) -> void:
	var np := profile.size()
	if np < 2:
		return
	var nb := _normal_basis(t)
	# Profile normals (x = radial, y = axial).
	var pn := PackedVector2Array()
	pn.resize(np)
	for i in np:
		var a := profile[maxi(i - 1, 0)]
		var b := profile[mini(i + 1, np - 1)]
		if i > 0 and profile[i].is_equal_approx(profile[i - 1]):
			a = profile[i]
		if i < np - 1 and profile[i].is_equal_approx(profile[i + 1]):
			b = profile[i]
		var tg := b - a
		if tg.length_squared() < 1e-12:
			tg = Vector2(0.0, 1.0)
		tg = tg.normalized()
		pn[i] = Vector2(tg.y, -tg.x)
	var max_r := 0.001
	var vlen := PackedFloat32Array()
	vlen.resize(np)
	var acc := 0.0
	for i in np:
		max_r = maxf(max_r, profile[i].x)
		if i > 0:
			acc += profile[i].distance_to(profile[i - 1])
		vlen[i] = acc
	var circ := arc * max_r
	var h0 := profile[0].y
	var h1 := profile[np - 1].y
	var hspan := maxf(absf(h1 - h0), 0.0001)
	# Build the grid of mesh-space points and normals.
	var cols := seg + 1
	var gp := PackedVector3Array()
	var gn := PackedVector3Array()
	gp.resize(np * cols)
	gn.resize(np * cols)
	for i in np:
		var r := profile[i].x
		var h := profile[i].y
		for j in cols:
			var ang := arc_start + arc * float(j) / seg
			var ca := cos(ang)
			var sa := sin(ang)
			var lp := Vector3(r * ca, h, r * sa * rz)
			var ln := Vector3(pn[i].x * ca, pn[i].y, pn[i].x * sa / maxf(rz, 0.001))
			gp[i * cols + j] = t * lp
			gn[i * cols + j] = (nb * ln).normalized()
	if deform.is_valid():
		for k in gp.size():
			gp[k] = deform.call(gp[k])
		_rebuild_grid_normals(gp, gn, np, cols, arc >= TAU - 0.001)
	if flat:
		for i in np - 1:
			for j in seg:
				var p00 := gp[i * cols + j]
				var p01 := gp[i * cols + j + 1]
				var p10 := gp[(i + 1) * cols + j]
				var p11 := gp[(i + 1) * cols + j + 1]
				var fnrm := (gn[i * cols + j] + gn[i * cols + j + 1] + gn[(i + 1) * cols + j] + gn[(i + 1) * cols + j + 1])
				var g1 := (p10 - p00).cross(p11 - p00)
				var g2 := (p11 - p00).cross(p01 - p00)
				var face := g1 + g2
				if face.length_squared() < 1e-14:
					continue
				face = face.normalized()
				if face.dot(fnrm) < 0.0:
					face = -face
				var aa := ao * (1.0 - ao_grad * (1.0 - (profile[i].y - h0) / hspan))
				var a0 := _add(p00, face, Vector2(circ * j / seg, vlen[i]), aa)
				var a1 := _add(p10, face, Vector2(circ * j / seg, vlen[i + 1]), aa)
				var a2 := _add(p11, face, Vector2(circ * (j + 1) / seg, vlen[i + 1]), aa)
				var a3 := _add(p01, face, Vector2(circ * (j + 1) / seg, vlen[i]), aa)
				_quad(a0, a1, a2, a3)
	else:
		var base := _v.size()
		for i in np:
			var aa := ao * (1.0 - ao_grad * (1.0 - (profile[i].y - h0) / hspan))
			for j in cols:
				_add(gp[i * cols + j], gn[i * cols + j], Vector2(circ * float(j) / seg, vlen[i]), aa)
		for i in np - 1:
			for j in seg:
				var a := base + i * cols + j
				var b := base + (i + 1) * cols + j
				_quad(a, b, b + 1, a + 1)
	if arc < TAU - 0.001:
		_lathe_end_cap(profile, t, rz, arc_start)
		_lathe_end_cap(profile, t, rz, arc_start + arc)


func _rebuild_grid_normals(gp: PackedVector3Array, gn: PackedVector3Array, rows: int, cols: int, wrap: bool) -> void:
	for i in rows:
		for j in cols:
			var jl := j - 1
			var jr := j + 1
			if wrap:
				if jl < 0:
					jl = cols - 2
				if jr > cols - 1:
					jr = 1
			else:
				jl = maxi(jl, 0)
				jr = mini(jr, cols - 1)
			var iu := mini(i + 1, rows - 1)
			var id := maxi(i - 1, 0)
			var du := gp[i * cols + jr] - gp[i * cols + jl]
			var dv := gp[iu * cols + j] - gp[id * cols + j]
			var n := dv.cross(du)
			if n.length_squared() > 1e-12:
				n = n.normalized()
				if n.dot(gn[i * cols + j]) < 0.0:
					n = -n
				gn[i * cols + j] = n


## Flat cap closing one end of an open-arc lathe (the profile must be closed).
func _lathe_end_cap(profile: PackedVector2Array, t: Transform3D, rz: float, ang: float) -> void:
	var poly := profile.duplicate()
	# Remove duplicates (creases) for triangulation.
	var clean := PackedVector2Array()
	for p in poly:
		if clean.is_empty() or not clean[clean.size() - 1].is_equal_approx(p):
			clean.append(p)
	if clean.size() > 2 and clean[0].is_equal_approx(clean[clean.size() - 1]):
		clean.remove_at(clean.size() - 1)
	if clean.size() < 3:
		return
	var idx := Geometry2D.triangulate_polygon(clean)
	if idx.is_empty():
		return
	var ca := cos(ang)
	var sa := sin(ang)
	var nb := _normal_basis(t)
	# The cap faces along the tangent direction of the revolution.
	var tangent := Vector3(-sa, 0.0, ca * rz).normalized()
	var center := Vector3.ZERO
	for p in clean:
		center += Vector3(p.x * ca, p.y, p.x * sa * rz)
	center /= clean.size()
	var outward := tangent
	# Pick the side facing away from the shell interior.
	var probe := Vector3(cos(ang + 0.01), 0.0, sin(ang + 0.01) * rz) - Vector3(ca, 0.0, sa * rz)
	if probe.dot(tangent) > 0.0:
		outward = -tangent
	var n := (nb * outward).normalized()
	var base := _v.size()
	for p in clean:
		_add(t * Vector3(p.x * ca, p.y, p.x * sa * rz), n, Vector2(p.x, p.y), ao)
	for k in range(0, idx.size(), 3):
		_tri(base + idx[k], base + idx[k + 1], base + idx[k + 2])


## Ellipsoid centred at c with radii r. `b` rotates it.
func ellipsoid(c: Vector3, r: Vector3, seg: int = 16, rings: int = 10, b: Basis = Basis.IDENTITY) -> void:
	var prof := PackedVector2Array()
	for k in rings + 1:
		var phi := -PI * 0.5 + PI * float(k) / rings
		prof.append(Vector2(cos(phi), sin(phi)))
	prof[0].x = 0.0
	prof[rings].x = 0.0
	lathe(prof, Transform3D(b * Basis.from_scale(r), c), seg)


func sphere(c: Vector3, r: float, seg: int = 14, rings: int = 9) -> void:
	ellipsoid(c, Vector3(r, r, r), seg, rings)


## Tapered capsule from a (radius ra) to b (radius rb).
func capsule(a: Vector3, b: Vector3, ra: float, rb: float, seg: int = 14, cap_rings: int = 4, rz: float = 1.0) -> void:
	var length := a.distance_to(b)
	var prof := PackedVector2Array()
	for k in cap_rings + 1:
		var th := -PI * 0.5 + PI * 0.5 * float(k) / cap_rings
		prof.append(Vector2(ra * cos(th), ra * sin(th)))
	for k in cap_rings + 1:
		var th := PI * 0.5 * float(k) / cap_rings
		prof.append(Vector2(rb * cos(th), length + rb * sin(th)))
	prof[0].x = 0.0
	prof[prof.size() - 1].x = 0.0
	lathe(prof, along(a, b), seg, rz)


## Cylinder / truncated cone from a to b. bevel > 0 rounds the rims.
func cylinder(a: Vector3, b: Vector3, ra: float, rb: float, seg: int = 16, caps: bool = true, bevel: float = 0.0, rz: float = 1.0) -> void:
	var length := a.distance_to(b)
	var prof := PackedVector2Array()
	if not caps:
		prof.append(Vector2(ra, 0.0))
		prof.append(Vector2(rb, length))
	elif bevel > 0.0:
		var bv := minf(bevel, minf(minf(ra, rb) * 0.5, length * 0.3))
		prof.append(Vector2(0.0, 0.0))
		prof.append(Vector2(ra - bv, 0.0))
		prof.append(Vector2(ra - bv, 0.0))
		prof.append(Vector2(ra - bv * 0.3, bv * 0.3))
		prof.append(Vector2(ra, bv))
		prof.append(Vector2(rb, length - bv))
		prof.append(Vector2(rb - bv * 0.3, length - bv * 0.3))
		prof.append(Vector2(rb - bv, length))
		prof.append(Vector2(rb - bv, length))
		prof.append(Vector2(0.0, length))
	else:
		prof.append(Vector2(0.0, 0.0))
		prof.append(Vector2(ra, 0.0))
		prof.append(Vector2(ra, 0.0))
		prof.append(Vector2(rb, length))
		prof.append(Vector2(rb, length))
		prof.append(Vector2(0.0, length))
	lathe(prof, along(a, b), seg, rz)


func cone(a: Vector3, b: Vector3, r: float, seg: int = 12) -> void:
	var length := a.distance_to(b)
	lathe(PackedVector2Array([Vector2(0, 0), Vector2(r, 0), Vector2(r, 0), Vector2(0, length)]), along(a, b), seg)


## Torus in the local XZ plane (major radius R, tube radius r). arc < TAU for
## a partial ring starting at +X.
func torus(t: Transform3D, big_r: float, r: float, seg: int = 24, seg2: int = 8, arc: float = TAU, r_z: float = 1.0) -> void:
	var nb := _normal_basis(t)
	var cols := seg2 + 1
	var base := _v.size()
	for i in seg + 1:
		var a := arc * float(i) / seg
		var ca := cos(a)
		var sa := sin(a)
		for j in cols:
			var b := TAU * float(j) / seg2
			var cb := cos(b)
			var sb := sin(b)
			var lp := Vector3((big_r + r * cb) * ca, r * sb * r_z, (big_r + r * cb) * sa)
			var ln := Vector3(cb * ca, sb / maxf(r_z, 0.001), cb * sa)
			_add(t * lp, (nb * ln).normalized(), Vector2(a * big_r, b * r), ao)
	for i in seg:
		for j in seg2:
			var p := base + i * cols + j
			var q := base + (i + 1) * cols + j
			_quad(p, q, q + 1, p + 1)
	if arc < TAU - 0.001:
		sphere(t * Vector3(big_r, 0.0, 0.0), r * 0.98, 8, 5)
		sphere(t * Vector3(big_r * cos(arc), 0.0, big_r * sin(arc)), r * 0.98, 8, 5)


## Rounded box centred at the transform origin.
func rbox(t: Transform3D, size: Vector3, radius: float, steps: int = 3) -> void:
	var half := size * 0.5
	var rad := minf(radius, minf(half.x, minf(half.y, half.z)) * 0.999)
	rad = maxf(rad, 0.0005)
	var nb := _normal_basis(t)
	var faces := [
		[Vector3.RIGHT, Vector3.BACK, Vector3.UP], [Vector3.LEFT, Vector3.FORWARD, Vector3.UP],
		[Vector3.UP, Vector3.RIGHT, Vector3.BACK], [Vector3.DOWN, Vector3.RIGHT, Vector3.FORWARD],
		[Vector3.BACK, Vector3.RIGHT, Vector3.UP], [Vector3.FORWARD, Vector3.LEFT, Vector3.UP],
	]
	for f in faces:
		var fn: Vector3 = f[0]
		var fu: Vector3 = f[1]
		var fv: Vector3 = f[2]
		var hu := absf(half.dot(fu))
		var hv := absf(half.dot(fv))
		var hn := absf(half.dot(fn))
		var su := _rb_samples(hu, rad, steps)
		var sv := _rb_samples(hv, rad, steps)
		var cols := su.size()
		var base := _v.size()
		var inner := half - Vector3(rad, rad, rad)
		for vi in sv.size():
			for ui in cols:
				var p := fn * hn + fu * su[ui] + fv * sv[vi]
				var c := Vector3(clampf(p.x, -inner.x, inner.x), clampf(p.y, -inner.y, inner.y), clampf(p.z, -inner.z, inner.z))
				var d := p - c
				var n := fn
				if d.length_squared() > 1e-12:
					n = d.normalized()
				var pos := c + n * rad
				var aa := ao * (1.0 - ao_grad * (1.0 - (pos.y + half.y) / maxf(size.y, 0.0001)))
				_add(t * pos, (nb * n).normalized(), Vector2(su[ui], sv[vi]), aa)
		for vi in sv.size() - 1:
			for ui in cols - 1:
				var a := base + vi * cols + ui
				var b := a + cols
				_quad(a, a + 1, b + 1, b)


static func _rb_samples(h: float, r: float, steps: int) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var flat := h - r
	for k in steps + 1:
		var a := PI * 0.5 * (1.0 - float(k) / steps)
		out.append(-(flat + r * sin(a)))
	if flat > 0.0005:
		out.append(0.0)
	for k in steps + 1:
		var a := PI * 0.5 * float(k) / steps
		out.append(flat + r * sin(a))
	# Remove duplicates (when flat ~ 0).
	var clean := PackedFloat32Array()
	for v in out:
		if clean.is_empty() or absf(clean[clean.size() - 1] - v) > 0.00005:
			clean.append(v)
	return clean


func box(t: Transform3D, size: Vector3) -> void:
	rbox(t, size, minf(size.x, minf(size.y, size.z)) * 0.08, 1)


## Extrude a polygon (XY plane, counter-clockwise) along local Z, centred on
## z = 0. bevel chamfers the front and back edges.
func extrude(poly: PackedVector2Array, depth: float, t: Transform3D = Transform3D.IDENTITY, bevel: float = 0.0) -> void:
	var n := poly.size()
	if n < 3:
		return
	var pts := poly
	if Geometry2D.is_polygon_clockwise(pts):
		pts = pts.duplicate()
		pts.reverse()
	var nb := _normal_basis(t)
	var hz := depth * 0.5
	var bv := minf(bevel, hz * 0.9)
	var inset := _inset_polygon(pts, bv) if bv > 0.0 else pts
	var idx := Geometry2D.triangulate_polygon(inset)
	# Caps.
	for side in [1.0, -1.0]:
		var z: float = hz * side
		var cn := (nb * Vector3(0, 0, side)).normalized()
		var base := _v.size()
		for p in inset:
			_add(t * Vector3(p.x, p.y, z), cn, p, ao)
		for k in range(0, idx.size(), 3):
			_tri(base + idx[k], base + idx[k + 1], base + idx[k + 2])
	# Side walls (+ bevel strips): per-edge normals, smoothed across shallow corners.
	var edge_n := PackedVector2Array()
	edge_n.resize(n)
	for i in n:
		var a := pts[i]
		var b := pts[(i + 1) % n]
		var e := (b - a).normalized()
		edge_n[i] = Vector2(e.y, -e.x)
	var acc := 0.0
	for i in n:
		var i2 := (i + 1) % n
		var a := pts[i]
		var b := pts[i2]
		var en := edge_n[i]
		var na := en
		var nb2 := en
		var prev_n := edge_n[(i - 1 + n) % n]
		var next_n := edge_n[i2]
		if en.dot(prev_n) > 0.85:
			na = (en + prev_n).normalized()
		if en.dot(next_n) > 0.85:
			nb2 = (en + next_n).normalized()
		var len_e := a.distance_to(b)
		var wa := Vector3(na.x, na.y, 0.0)
		var wb := Vector3(nb2.x, nb2.y, 0.0)
		var zf := hz - bv
		var p0 := _add(t * Vector3(a.x, a.y, -zf), (nb * wa).normalized(), Vector2(acc, -zf), ao)
		var p1 := _add(t * Vector3(b.x, b.y, -zf), (nb * wb).normalized(), Vector2(acc + len_e, -zf), ao)
		var p2 := _add(t * Vector3(b.x, b.y, zf), (nb * wb).normalized(), Vector2(acc + len_e, zf), ao)
		var p3 := _add(t * Vector3(a.x, a.y, zf), (nb * wa).normalized(), Vector2(acc, zf), ao)
		_quad(p0, p1, p2, p3)
		if bv > 0.0:
			var ia := inset[i]
			var ib := inset[i2]
			for side in [1.0, -1.0]:
				var s: float = side
				var bn_a := (nb * Vector3(wa.x, wa.y, s).normalized()).normalized()
				var bn_b := (nb * Vector3(wb.x, wb.y, s).normalized()).normalized()
				var q0 := _add(t * Vector3(a.x, a.y, zf * s), bn_a, Vector2(acc, zf * s), ao)
				var q1 := _add(t * Vector3(b.x, b.y, zf * s), bn_b, Vector2(acc + len_e, zf * s), ao)
				var q2 := _add(t * Vector3(ib.x, ib.y, hz * s), bn_b, Vector2(acc + len_e, hz * s), ao)
				var q3 := _add(t * Vector3(ia.x, ia.y, hz * s), bn_a, Vector2(acc, hz * s), ao)
				_quad(q0, q1, q2, q3)
		acc += len_e


static func _inset_polygon(pts: PackedVector2Array, d: float) -> PackedVector2Array:
	var n := pts.size()
	var out := PackedVector2Array()
	out.resize(n)
	for i in n:
		var p0 := pts[(i - 1 + n) % n]
		var p1 := pts[i]
		var p2 := pts[(i + 1) % n]
		var e1 := (p1 - p0).normalized()
		var e2 := (p2 - p1).normalized()
		# Inward normals for a counter-clockwise polygon.
		var n1 := Vector2(-e1.y, e1.x)
		var n2 := Vector2(-e2.y, e2.x)
		var bis := (n1 + n2)
		if bis.length_squared() < 1e-8:
			bis = n1
		bis = bis.normalized()
		var cosh := maxf(bis.dot(n1), 0.35)
		out[i] = p1 + bis * (d / cosh)
	return out


## A smooth tube through `points` with per-point radii (rounded ends).
func tube(points: PackedVector3Array, radii: PackedFloat32Array, seg: int = 10, caps: bool = true) -> void:
	var n := points.size()
	if n < 2:
		return
	var cols := seg + 1
	# Parallel-transport frames.
	var tangents: Array[Vector3] = []
	for i in n:
		var tg := points[mini(i + 1, n - 1)] - points[maxi(i - 1, 0)]
		tangents.append(tg.normalized() if tg.length_squared() > 1e-12 else Vector3.UP)
	var ref := Vector3.UP if absf(tangents[0].dot(Vector3.UP)) < 0.9 else Vector3.RIGHT
	var nrm := tangents[0].cross(ref).normalized()
	var base := _v.size()
	var acc := 0.0
	var max_r := 0.0
	for r in radii:
		max_r = maxf(max_r, r)
	var circ := TAU * max_r
	for i in n:
		if i > 0:
			var axis := tangents[i - 1].cross(tangents[i])
			if axis.length_squared() > 1e-10:
				var ang := tangents[i - 1].angle_to(tangents[i])
				nrm = nrm.rotated(axis.normalized(), ang)
			acc += points[i].distance_to(points[i - 1])
		var bin := tangents[i].cross(nrm).normalized()
		var r: float = radii[mini(i, radii.size() - 1)]
		for j in cols:
			var a := TAU * float(j) / seg
			var dir := nrm * cos(a) + bin * sin(a)
			_add(points[i] + dir * r, dir, Vector2(circ * float(j) / seg, acc), ao)
	for i in n - 1:
		for j in seg:
			var a := base + i * cols + j
			var b := base + (i + 1) * cols + j
			_quad(a, b, b + 1, a + 1)
	if caps:
		sphere(points[0], radii[0] * 0.995, seg, maxi(seg / 2, 4))
		sphere(points[n - 1], radii[mini(n - 1, radii.size() - 1)] * 0.995, seg, maxi(seg / 2, 4))


## A lumpy rock-like blob (deformed ellipsoid). `facets` = low-poly flat look.
func blob(c: Vector3, r: Vector3, seed_v: int, amount: float = 0.25, seg: int = 14, rings: int = 9, facets: bool = false) -> void:
	var noise := FastNoiseLite.new()
	noise.seed = seed_v
	noise.frequency = 1.6
	noise.fractal_octaves = 2
	var inv := Vector3(1.0 / r.x, 1.0 / r.y, 1.0 / r.z)
	var deform := func(p: Vector3) -> Vector3:
		var d := p - c
		var unit := d * inv
		var k := 1.0 + noise.get_noise_3dv(unit * 1.3) * amount
		# Flatten the underside a little so it rests on the ground.
		var out := c + d * k
		if d.y < 0.0:
			out.y = c.y + d.y * k * 0.75
		return out
	var prof := PackedVector2Array()
	for k in rings + 1:
		var phi := -PI * 0.5 + PI * float(k) / rings
		prof.append(Vector2(cos(phi), sin(phi)))
	prof[0].x = 0.0
	prof[rings].x = 0.0
	lathe(prof, Transform3D(Basis.from_scale(r), c), seg, 1.0, TAU, 0.0, facets, deform)


# --- Output ------------------------------------------------------------------------------

func to_arrays() -> Array:
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = _v
	arr[Mesh.ARRAY_NORMAL] = _n
	arr[Mesh.ARRAY_COLOR] = _c
	arr[Mesh.ARRAY_TEX_UV] = _uv
	arr[Mesh.ARRAY_CUSTOM0] = _m
	arr[Mesh.ARRAY_INDEX] = _i
	return arr


## Build the ArrayMesh (null when nothing was added).
func to_mesh(mat: Material = null) -> ArrayMesh:
	if _i.is_empty():
		return null
	var mesh := ArrayMesh.new()
	var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, to_arrays(), [], {}, flags)
	mesh.surface_set_material(0, mat if mat != null else material())
	return mesh


## Convenience: a MeshInstance3D for the built mesh.
func to_instance(node_name: String = "Mesh", shadows: bool = true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = to_mesh()
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi
