class_name CampKit
extends MeshKit
## MeshKit plus the primitives and materials the camp needs: bark-covered
## logs with end grain, sawn planks with real 3D grain, rounded stones,
## sagging canvas sheets, ropes, discs.
##
## Same vertex layout as MeshKit (COLOR = albedo + baked AO, UV in metres,
## CUSTOM0 = roughness, metallic, emission, pattern), rendered by
## shaders/wood_camp.gdshader (solid) or shaders/canvas_camp.gdshader
## (double-sided cloth; the metallic channel is the flutter weight there).
##
##   var k := CampKit.new()
##   k.log_piece(Vector3(-1, 0.2, 0), Vector3(1, 0.2, 0), 0.2, 7)
##   var mesh := CampKit.build_mesh(k)          # one draw call

## Camp pattern ids (shaders/wood_camp.gdshaderinc). 0..12 = MeshKit.Pat.
enum P {
	PLANK_X = 20, PLANK_Y = 21, PLANK_Z = 22, BARK = 23, END_GRAIN = 24, STONE = 25,
	CANVAS = 26, CHAR = 27, IRON = 28, ROPE = 29, GLASS = 30, CHALK = 31, PAINT = 32,
	FOOD = 33, STAR = 34, FABRIC = 35, BULB = 36,
}

const SOLID_SHADER := "res://shaders/wood_camp.gdshader"
const CLOTH_SHADER := "res://shaders/canvas_camp.gdshader"

const BARK_COLOR := Color("#5a4232")
const WOOD_COLOR := Color("#c99a62")
const PLANK_COLOR := Color("#a77a4c")
const STONE_COLOR := Color("#8d8a84")
const IRON_COLOR := Color("#2e2d2f")
const ROPE_COLOR := Color("#c2a77a")

static var _solid: ShaderMaterial = null
static var _cloth: ShaderMaterial = null


static func solid_material() -> ShaderMaterial:
	if _solid == null:
		_solid = ShaderMaterial.new()
		_solid.shader = load(SOLID_SHADER)
	return _solid


static func cloth_material() -> ShaderMaterial:
	if _cloth == null:
		_cloth = ShaderMaterial.new()
		_cloth.shader = load(CLOTH_SHADER)
	return _cloth


## Build one ArrayMesh from a solid kit and an optional cloth kit (two
## surfaces, two draw calls). Returns null if both are empty.
static func build_mesh(solid: MeshKit, cloth: MeshKit = null) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if solid and not solid.is_empty():
		_append(mesh, solid, solid_material())
	if cloth and not cloth.is_empty():
		_append(mesh, cloth, cloth_material())
	return mesh if mesh.get_surface_count() > 0 else null


static func _append(mesh: ArrayMesh, k: MeshKit, mat: Material) -> void:
	var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, k.to_arrays(), [], {}, flags)
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)


## A MeshInstance3D for one or two kits.
static func instance(solid: MeshKit, cloth: MeshKit = null, node_name: String = "Mesh", shadows: bool = true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = build_mesh(solid, cloth)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


# --- Primitives ---------------------------------------------------------------------------

## Flat disc facing `normal`; uv.y = distance from the centre (end grain rings).
func disc(center: Vector3, normal: Vector3, radius: float, seg: int = 16, rz: float = 1.0) -> void:
	var b := MeshKit.basis_y(normal)
	var n := normal.normalized()
	var base := _v.size()
	_add(center, n, Vector2(0.0, 0.0), ao)
	for j in seg + 1:
		var a := TAU * float(j) / seg
		var p := center + b.x * cos(a) * radius + b.z * sin(a) * radius * rz
		_add(p, n, Vector2(a * radius, radius), ao)
	for j in seg:
		_tri(base, base + 1 + j, base + 2 + j)


## A log from a to b: bark sides (slightly irregular), end-grain caps.
## `char_amount` > 0 paints it as a charred campfire log instead.
func log_piece(a: Vector3, b: Vector3, r: float, seed_v: int, caps: bool = true,
		bark: Color = BARK_COLOR, wood: Color = WOOD_COLOR, charred: bool = false) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var axis := b - a
	var length := axis.length()
	var steps := clampi(int(length / 0.25) + 2, 3, 9)
	var side := MeshKit.basis_y(axis).x
	var pts := PackedVector3Array()
	var radii := PackedFloat32Array()
	var bend := rng.randf_range(-0.04, 0.04) * length
	for i in steps:
		var t := float(i) / (steps - 1)
		var p := a.lerp(b, t) + side * sin(t * PI) * bend
		pts.append(p)
		radii.append(r * (1.0 + rng.randf_range(-0.05, 0.05)) * lerpf(1.0, 0.9, t))
	if charred:
		paint(Color("#2a2420"), 0.95, 0.0, 0.0, P.CHAR)
	else:
		paint(bark.lerp(bark.darkened(0.25), rng.randf() * 0.5), 0.95, 0.0, 0.0, P.BARK)
	tube(pts, radii, 12, false)
	if caps:
		var rim := Color("#3b2c20") if charred else wood.darkened(0.08)
		var core := Color("#1d1814") if charred else wood
		paint(core, 0.85, 0.0, 0.0, P.CHAR if charred else P.END_GRAIN)
		var ra := radii[0]
		var rb := radii[radii.size() - 1]
		color_fn = func(p: Vector3, _n: Vector3) -> Color:
			var d := minf(p.distance_to(pts[0]) / ra, p.distance_to(pts[pts.size() - 1]) / rb)
			return core.lerp(rim, smoothstep(0.75, 0.98, d))
		disc(pts[0], (pts[0] - pts[1]).normalized(), ra * 0.995, 14)
		disc(pts[pts.size() - 1], (pts[pts.size() - 1] - pts[pts.size() - 2]).normalized(), rb * 0.995, 14)
		color_fn = Callable()


## A sawn board (rounded box) whose grain runs along local axis 0 = X, 1 = Y, 2 = Z
## of the mesh (pick the axis the board is longest along).
func plank(t: Transform3D, size: Vector3, c: Color = PLANK_COLOR, grain_axis: int = 0, radius: float = 0.012) -> void:
	var pat: int = [P.PLANK_X, P.PLANK_Y, P.PLANK_Z][clampi(grain_axis, 0, 2)]
	paint(c, 0.82, 0.0, 0.0, pat)
	rbox(t, size, radius, 2)


## A rounded, slightly lumpy stone (radii r, turned by yaw around Y), with a
## flattened underside so it sits on the ground.
func stone(c: Vector3, r: Vector3, seed_v: int, col: Color = STONE_COLOR, yaw: float = 0.0,
		lumpy: float = 0.22, seg: int = 12, rings: int = 7) -> void:
	paint(col, 0.88, 0.0, 0.0, P.STONE)
	var noise := FastNoiseLite.new()
	noise.seed = seed_v
	noise.frequency = 1.6
	noise.fractal_octaves = 2
	var rot := Basis(Vector3.UP, yaw)
	var inv_rot := rot.inverse()
	var inv := Vector3(1.0 / r.x, 1.0 / r.y, 1.0 / r.z)
	var deform := func(p: Vector3) -> Vector3:
		var d := p - c
		var unit := (inv_rot * d) * inv
		var k := 1.0 + noise.get_noise_3dv(unit * 1.3) * lumpy
		var out := c + d * k
		if d.y < 0.0:
			out.y = c.y + d.y * k * 0.6
		return out
	var prof := PackedVector2Array()
	for i in rings + 1:
		var phi := -PI * 0.5 + PI * float(i) / rings
		prof.append(Vector2(cos(phi), sin(phi)))
	prof[0].x = 0.0
	prof[rings].x = 0.0
	lathe(prof, Transform3D(rot * Basis.from_scale(r), c), seg, 1.0, TAU, 0.0, false, deform)


## A rope between two points sagging by `sag` metres.
func rope(a: Vector3, b: Vector3, sag: float = 0.08, r: float = 0.008, c: Color = ROPE_COLOR, seg_count: int = 8) -> void:
	paint(c, 1.0, 0.0, 0.0, P.ROPE)
	var pts := PackedVector3Array()
	var radii := PackedFloat32Array()
	for i in seg_count + 1:
		var t := float(i) / seg_count
		pts.append(a.lerp(b, t) + Vector3(0.0, -sag * 4.0 * t * (1.0 - t), 0.0))
		radii.append(r)
	tube(pts, radii, 5, false)


## A grid surface from a point function f(u, v) -> Vector3 (u, v in 0..1).
## flutter(u, v) -> 0..1 goes into the metallic channel (cloth shader only).
## UVs are in metres. Normals come from the grid; cull is disabled for cloth.
func surface(f: Callable, nu: int, nv: int, flutter: Callable = Callable()) -> void:
	var cols := nu + 1
	var rows := nv + 1
	var gp := PackedVector3Array()
	gp.resize(cols * rows)
	for j in rows:
		for i in cols:
			gp[j * cols + i] = f.call(float(i) / nu, float(j) / nv)
	# Metric UVs along the first row / column.
	var mid_r := rows >> 1
	var mid_c := cols >> 1
	var us := PackedFloat32Array()
	us.resize(cols)
	var acc := 0.0
	for i in cols:
		if i > 0:
			acc += gp[mid_r * cols + i].distance_to(gp[mid_r * cols + i - 1])
		us[i] = acc
	var vs := PackedFloat32Array()
	vs.resize(rows)
	acc = 0.0
	for j in rows:
		if j > 0:
			acc += gp[j * cols + mid_c].distance_to(gp[(j - 1) * cols + mid_c])
		vs[j] = acc
	var base := _v.size()
	var keep_metal := metal
	for j in rows:
		for i in cols:
			var il := maxi(i - 1, 0)
			var ir := mini(i + 1, cols - 1)
			var jd := maxi(j - 1, 0)
			var ju := mini(j + 1, rows - 1)
			var du := gp[j * cols + ir] - gp[j * cols + il]
			if du.length_squared() < 1e-10:
				var jn := ju if j < rows - 1 else jd
				du = gp[jn * cols + ir] - gp[jn * cols + il]
			var dv := gp[ju * cols + i] - gp[jd * cols + i]
			var n := du.cross(dv)
			n = n.normalized() if n.length_squared() > 1e-12 else Vector3.UP
			if flutter.is_valid():
				metal = clampf(float(flutter.call(float(i) / nu, float(j) / nv)), 0.0, 1.0)
			_add(gp[j * cols + i], n, Vector2(us[i], vs[j]), ao)
	metal = keep_metal
	for j in rows - 1:
		for i in cols - 1:
			var a := base + j * cols + i
			var b := a + cols
			# Explicit winding (no normal-based flip: cloth is double sided).
			_i.append(a)
			_i.append(b)
			_i.append(a + 1)
			_i.append(a + 1)
			_i.append(b)
			_i.append(b + 1)


## Bilinear patch through four corners with a soft sag toward `sag_dir`
## (zero along all four edges). Good for canvas panels and rugs.
func sheet(p00: Vector3, p10: Vector3, p01: Vector3, p11: Vector3, nu: int, nv: int,
		sag: float = 0.0, sag_dir: Vector3 = Vector3.DOWN, flutter_amount: float = 1.0,
		pinned_edges: int = 15, outward: Vector3 = Vector3.ZERO) -> void:
	# Mirror u so the front face (du x dv) points outward when a hint is given.
	if outward != Vector3.ZERO and (p10 - p00).cross(p01 - p00).dot(outward) < 0.0:
		var t0 := p00
		p00 = p10
		p10 = t0
		var t1 := p01
		p01 = p11
		p11 = t1
		pinned_edges = (pinned_edges & 3) | ((pinned_edges & 4) << 1) | ((pinned_edges & 8) >> 1)
	var f := func(u: float, v: float) -> Vector3:
		var p := p00.lerp(p10, u).lerp(p01.lerp(p11, u), v)
		return p + sag_dir * sag * sin(u * PI) * sin(v * PI)
	# pinned_edges bits: 1 = v0 edge, 2 = v1 edge, 4 = u0 edge, 8 = u1 edge.
	var fl := func(u: float, v: float) -> float:
		var w := 1.0
		if pinned_edges & 1:
			w *= smoothstep(0.0, 0.5, v)
		if pinned_edges & 2:
			w *= smoothstep(1.0, 0.5, v)
		if pinned_edges & 4:
			w *= smoothstep(0.0, 0.5, u)
		if pinned_edges & 8:
			w *= smoothstep(1.0, 0.5, u)
		return w * flutter_amount
	surface(f, nu, nv, fl)


## Triangle panel (tent gable ends): p0 = apex, p1/p2 = base corners.
func tri_panel(p0: Vector3, p1: Vector3, p2: Vector3, n: int = 4, sag: float = 0.0,
		sag_dir: Vector3 = Vector3.ZERO, outward: Vector3 = Vector3.ZERO) -> void:
	if outward != Vector3.ZERO and (p2 - p1).cross(p1.lerp(p2, 0.5) - p0).dot(outward) < 0.0:
		var t := p1
		p1 = p2
		p2 = t
	var f := func(u: float, v: float) -> Vector3:
		var base := p1.lerp(p2, u)
		var p := p0.lerp(base, v)
		return p + sag_dir * sag * sin(u * PI) * sin(v * PI) * v
	var fl := func(u: float, v: float) -> float:
		return smoothstep(0.0, 0.6, v) * sin(u * PI) * 0.5
	surface(f, n, n, fl)


## A flat polygon in the XY plane of `t`, facing local +Z (or -Z when
## `flip`). UVs = local XY in metres. `flutter` = constant flutter weight.
func flat_poly(poly: PackedVector2Array, t: Transform3D, flip: bool = false, flutter: float = 0.15) -> void:
	if poly.size() < 3:
		return
	var idx := Geometry2D.triangulate_polygon(poly)
	if idx.is_empty():
		return
	var n := (t.basis * Vector3(0.0, 0.0, -1.0 if flip else 1.0)).normalized()
	var keep_metal := metal
	metal = flutter
	var base := _v.size()
	for p in poly:
		_add(t * Vector3(p.x, p.y, 0.0), n, p, ao)
	metal = keep_metal
	for k in range(0, idx.size(), 3):
		_tri(base + idx[k], base + idx[k + 1], base + idx[k + 2])
