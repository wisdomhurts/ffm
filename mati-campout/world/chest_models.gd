class_name ChestModels
extends RefCounted
## Procedural treasure chest meshes and materials (one body + one lid per
## tier, built once and cached).
##
##   common  warm honey planks, forged iron corner brackets, a hasp and ring
##   rare    dark stained planks, wrap-around iron bands, studs, a padlock
##   epic    royal plum lacquer in an ornate gold frame: gold bands, studs,
##           ball feet, a star crest and a glowing gem lock
##
## Local space: origin on the ground at the chest centre, front = +Z, the lid
## hinges on the back top edge. The lid mesh is built around its hinge (lid
## local origin = hinge) so a node can swing it open by rotating around X.
## Vertex layout = MeshKit (COLOR albedo + AO, UV metres, CUSTOM0 = rough,
## metal, emission, pattern) rendered by shaders/chest.gdshader. Materials
## use plain uniforms only (no instance uniforms: free on Compatibility).

const SHADER_PATH := "res://shaders/chest.gdshader"

## Pattern ids understood by shaders/chest.gdshader.
const PAT_PLANK_X := 20
const PAT_PLANK_Y := 21
const PAT_PLANK_Z := 22
const PAT_IRON := 28
const PAT_GOLD := 40
const PAT_GEM := 41
const PAT_VELVET := 42
const PAT_BRASS := 43
const PAT_LACQUER := 45

## Per tier: w (x), d (z), h (body height), rise (barrel lid), rail (lid
## frame), t (plank thickness), feet (raise the body).
const DIMS := {
	"common": {"w": 0.92, "d": 0.58, "h": 0.42, "rise": 0.17, "rail": 0.045, "t": 0.045, "feet": 0.0},
	"rare": {"w": 1.0, "d": 0.62, "h": 0.45, "rise": 0.19, "rail": 0.05, "t": 0.048, "feet": 0.0},
	"epic": {"w": 1.06, "d": 0.66, "h": 0.46, "rise": 0.22, "rail": 0.055, "t": 0.05, "feet": 0.075},
}

const IRON := Color("#4a4541")
const IRON_DARK := Color("#36322f")
const GOLD := Color("#f2c35b")
const GOLD_DEEP := Color("#c98f2c")
const BRASS := Color("#c9a24f")

static var _cache: Dictionary = {}
static var _mats: Dictionary = {}


## {"body": ArrayMesh, "lid": ArrayMesh, "hinge": Vector3, "size": Vector3,
##  "glints": PackedVector3Array (local), "mouth": Vector3, "front": float}
static func get_model(tier: String, variant: int = 0) -> Dictionary:
	if not DIMS.has(tier):
		tier = "common"
	var key := "%s_%d" % [tier, variant]
	if _cache.has(key):
		return _cache[key]
	var m := _build(tier, variant)
	_cache[key] = m
	return m


static func dims(tier: String) -> Dictionary:
	return DIMS.get(tier, DIMS["common"])


## Shared material per tier and state (closed chests glint, opened ones rest).
static func material(tier: String, opened: bool = false) -> ShaderMaterial:
	var key := tier + ("_open" if opened else "")
	if _mats.has(key):
		return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = load(SHADER_PATH)
	var glint := {"common": 0.55, "rare": 0.75, "epic": 1.0}
	m.set_shader_parameter("glint", 0.0 if opened else float(glint.get(tier, 0.5)))
	m.set_shader_parameter("glow", (0.3 if opened else 1.0) if tier == "epic" else 0.0)
	m.set_shader_parameter("gem_glow", 0.45 if opened else 1.0)
	m.set_shader_parameter("glint_color", Color(0.75, 0.88, 1.0) if tier == "rare" else Color(1.0, 0.86, 0.55))
	_mats[key] = m
	return m


static func _mesh(k: MeshKit, mat: Material) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if k.is_empty():
		return mesh
	var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, k.to_arrays(), [], {}, flags)
	mesh.surface_set_material(0, mat)
	return mesh


# --- Building blocks ------------------------------------------------------------------------

## A board (rounded box) whose inward-facing sides are darkened toward the
## bottom, so the open chest reads as a deep box.
static func _board(k: MeshKit, t: Transform3D, size: Vector3, c: Color, pat: int, r: float = 0.01,
		inner: Callable = Callable(), rough: float = 0.82) -> void:
	k.paint(c, rough, 0.0, 0.0, pat)
	k.color_fn = inner
	k.rbox(t, size, r, 1)
	k.color_fn = Callable()


static func _metal(k: MeshKit, c: Color, pat: int, rough: float = 0.45, metal: float = 0.9) -> void:
	k.paint(c, rough, metal, 0.0, pat)


## A thin metal plate: a crisp 12-triangle box (r is kept for call sites).
static func _plate(k: MeshKit, pos: Vector3, size: Vector3, _r: float = 0.004) -> void:
	var h := size * 0.5
	var faces := [
		[Vector3.RIGHT, Vector3.BACK, Vector3.UP], [Vector3.LEFT, Vector3.FORWARD, Vector3.UP],
		[Vector3.UP, Vector3.RIGHT, Vector3.BACK], [Vector3.DOWN, Vector3.RIGHT, Vector3.FORWARD],
		[Vector3.BACK, Vector3.RIGHT, Vector3.UP], [Vector3.FORWARD, Vector3.LEFT, Vector3.UP],
	]
	for f in faces:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		var hn := absf(h.dot(n))
		var hu := absf(h.dot(u))
		var hv := absf(h.dot(v))
		var c := pos + n * hn
		var a0 := k._add(c - u * hu - v * hv, n, Vector2(-hu, -hv), k.ao)
		var a1 := k._add(c + u * hu - v * hv, n, Vector2(hu, -hv), k.ao)
		var a2 := k._add(c + u * hu + v * hv, n, Vector2(hu, hv), k.ao)
		var a3 := k._add(c - u * hu + v * hv, n, Vector2(-hu, hv), k.ao)
		k._quad(a0, a1, a2, a3)


static func _rivet(k: MeshKit, pos: Vector3, r: float = 0.009) -> void:
	k.ellipsoid(pos, Vector3(r, r, r), 6, 3)


## Interior shading for the body: faces pointing into the box get darker
## the deeper they are.
static func _inner_fn(c: Color, w: float, d: float, h: float, base_y: float) -> Callable:
	return func(p: Vector3, n: Vector3) -> Color:
		var inward := Vector3(-p.x, 0.0, -p.z)
		var into := 0.0
		if inward.length_squared() > 1e-6:
			into = n.dot(inward.normalized())
		var inside := absf(p.x) < w * 0.5 + 0.006 and absf(p.z) < d * 0.5 + 0.006 and p.y > base_y + 0.01
		if (into > 0.55 or n.y > 0.8) and inside:
			var depth := clampf((p.y - base_y) / maxf(h, 0.01), 0.0, 1.0)
			return c * (0.32 + 0.4 * depth)
		return c


## Barrel arc of the lid: circle radius and centre (z, y) in lid space.
static func _barrel(d: float, rise: float, rail: float) -> Dictionary:
	var r := (d * d * 0.25 + rise * rise) / (2.0 * rise)
	var beta := asin(clampf(d * 0.5 / r, 0.0, 1.0))
	return {"r": r, "zc": d * 0.5, "yc": rail + rise - r, "beta": beta}


## Transform for MeshKit.lathe so that the revolution axis is the lid's X
## axis and lathe angle a maps to the point C + R (cos a Z + sin a Y).
static func _barrel_xf(b: Dictionary) -> Transform3D:
	var basis := Basis(Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0))
	return Transform3D(basis, Vector3(0.0, float(b["yc"]), float(b["zc"])))


## An arc band over the barrel lid between x0 and x1 (radius r0..r1), from
## lathe angle a0 to a1.
static func _arc_band(k: MeshKit, b: Dictionary, x0: float, x1: float, r0: float, r1: float, a0: float, a1: float, seg: int = 10) -> void:
	var prof := PackedVector2Array([
		Vector2(r0, x0), Vector2(r1, x0), Vector2(r1, x0), Vector2(r1, x1),
		Vector2(r1, x1), Vector2(r0, x1), Vector2(r0, x1), Vector2(r0, x0)])
	k.lathe(prof, _barrel_xf(b), seg, 1.0, a1 - a0, a0)


## Point on the barrel surface at lathe angle a, radius r, lid-local x.
static func _barrel_point(b: Dictionary, a: float, r: float, x: float) -> Vector3:
	return Vector3(x, float(b["yc"]) + sin(a) * r, float(b["zc"]) + cos(a) * r)


## An iron/gold half-ring handle hanging from `c` (on a +-X side), the ring
## in the YZ plane.
static func _handle(k: MeshKit, c: Vector3, radius: float, tube: float) -> void:
	var b := Basis(Vector3(0, 0, 1), Vector3(-1, 0, 0), Vector3(0, -1, 0))
	k.torus(Transform3D(b, c), radius, tube, 14, 6, PI)


static func _star(outer: float, inner: float, points: int = 5) -> PackedVector2Array:
	var poly := PackedVector2Array()
	for i in points * 2:
		var a := PI * 0.5 + PI * float(i) / points
		var rr := outer if i % 2 == 0 else inner
		poly.append(Vector2(cos(a), sin(a)) * rr)
	return poly


## A rounded "shield" outline for lock plates (XY plane, CCW).
static func _shield(w: float, h: float) -> PackedVector2Array:
	var poly := PackedVector2Array()
	var steps := 10
	# Top edge with soft corners, then the sides curving into a point.
	for i in steps + 1:
		var u := float(i) / steps
		var x := lerpf(w * 0.5, -w * 0.5, u)
		var y := h * 0.5 - 0.012 * sin(u * PI) * 0.0
		poly.append(Vector2(x, y))
	for i in range(1, steps + 1):
		var u := float(i) / steps
		var x := -w * 0.5 * cos(u * PI * 0.5) * (1.0 - 0.15 * u)
		var y := h * 0.5 - h * (0.55 * u + 0.45 * u * u)
		poly.append(Vector2(x, y))
	for i in range(steps - 1, 0, -1):
		var u := float(i) / steps
		var x := w * 0.5 * cos(u * PI * 0.5) * (1.0 - 0.15 * u)
		var y := h * 0.5 - h * (0.55 * u + 0.45 * u * u)
		poly.append(Vector2(x, y))
	poly.reverse()
	return poly


# --- The chests ---------------------------------------------------------------------------

static func _build(tier: String, variant: int) -> Dictionary:
	var dm: Dictionary = dims(tier)
	var w := float(dm["w"])
	var d := float(dm["d"])
	var h := float(dm["h"])
	var rise := float(dm["rise"])
	var rail := float(dm["rail"])
	var t := float(dm["t"])
	var feet := float(dm["feet"])
	var body := MeshKit.new()
	var lid := MeshKit.new()
	var glints := PackedVector3Array()
	var hinge := Vector3(0.0, feet + h, -d * 0.5)
	match tier:
		"rare":
			_rare(body, lid, w, d, h, rise, rail, t, glints)
		"epic":
			_epic(body, lid, w, d, h, rise, rail, t, feet, glints)
		_:
			_common(body, lid, w, d, h, rise, rail, t, variant, glints)
	var mat := material(tier, false)
	return {
		"body": _mesh(body, mat),
		"lid": _mesh(lid, mat),
		"hinge": hinge,
		"size": Vector3(w, feet + h + rail + rise, d),
		"glints": glints,
		"mouth": Vector3(0.0, feet + h - 0.05, 0.0),
		"front": d * 0.5,
		"tris": (body.to_arrays()[Mesh.ARRAY_INDEX] as PackedInt32Array).size() / 3 + (lid.to_arrays()[Mesh.ARRAY_INDEX] as PackedInt32Array).size() / 3,
	}


## Plank walls (front/back along X, sides along Z) + floor. Returns nothing;
## `cols` gives a colour per plank row (bottom to top).
static func _box_walls(k: MeshKit, w: float, d: float, h: float, t: float, y0: float, rows: int, cols: Array, pat_scale: float = 1.0, lacquer: bool = false) -> void:
	var ph := (h - 0.0) / rows
	var interior: Color = (cols[0] as Color).darkened(0.35)
	var fn := _inner_fn(Color.WHITE, w - t * 2.0, d - t * 2.0, h, y0)
	# Each board a little darker toward its lower edge: the seams read.
	k.ao_grad = 0.22 if lacquer else 0.32
	for i in rows:
		var y := y0 + ph * (float(i) + 0.5)
		var base_c: Color = cols[i % cols.size()]
		var px := PAT_LACQUER if lacquer else PAT_PLANK_X
		var pz := PAT_LACQUER if lacquer else PAT_PLANK_Z
		for s: float in [1.0, -1.0]:
			var j := 0.9 + 0.2 * fposmod(sin(float(i) * 12.9898 + s * 78.233) * 43758.5453, 1.0)
			var c := Color(base_c.r * j, base_c.g * j, base_c.b * j)
			var tinted := func(p: Vector3, n: Vector3) -> Color:
				return c * (fn.call(p, n) as Color)
			_board(k, Transform3D(Basis.IDENTITY, Vector3(0.0, y, s * (d * 0.5 - t * 0.5))),
				Vector3(w, ph - 0.005 * pat_scale, t), c, px, 0.011, tinted, 0.5 if lacquer else 0.82)
			_board(k, Transform3D(Basis.IDENTITY, Vector3(s * (w * 0.5 - t * 0.5), y, 0.0)),
				Vector3(t, ph - 0.005 * pat_scale, d - t * 2.0 + 0.004), c.darkened(0.04), pz, 0.011, tinted, 0.5 if lacquer else 0.82)
	k.ao_grad = 0.0
	# Floor boards (dark: deep inside the box).
	var fc := interior.darkened(0.3)
	for i in 3:
		var bz := -d * 0.5 + t + (d - t * 2.0) * (float(i) + 0.5) / 3.0
		_board(k, Transform3D(Basis.IDENTITY, Vector3(0.0, y0 + 0.02, bz)),
			Vector3(w - t * 2.0, 0.03, (d - t * 2.0) / 3.0 - 0.004), fc.lightened(0.04 * i), PAT_PLANK_X, 0.006)


## Barrel lid staves + end caps + bottom rails, in hinge space (lid spans
## z = 0 (back) .. d (front)).
static func _barrel_lid(k: MeshKit, w: float, d: float, rise: float, rail: float, t: float, staves: int,
		cols: Array, lacquer: bool = false, cap_col: Color = Color(0, 0, 0, 0)) -> Dictionary:
	var b := _barrel(d, rise, rail)
	var r := float(b["r"])
	var beta := float(b["beta"])
	var a_front := PI * 0.5 - beta
	var span := beta * 2.0
	var gap := span * 0.012
	var th := t * 0.8
	var bc := Vector3(0.0, float(b["yc"]), float(b["zc"]))
	# Inner faces (toward the barrel centre) are darker: seen when open.
	var inner_dark := func(p: Vector3, n: Vector3) -> Color:
		var to_c := Vector3(0.0, bc.y - p.y, bc.z - p.z)
		if to_c.length_squared() > 1e-6 and n.dot(to_c.normalized()) > 0.6:
			return Color(0.42, 0.42, 0.42)
		return Color.WHITE
	for i in staves:
		var a0 := a_front + span * float(i) / staves + (gap * 0.5 if i > 0 else 0.0)
		var a1 := a_front + span * float(i + 1) / staves - (gap * 0.5 if i < staves - 1 else 0.0)
		var c: Color = cols[i % cols.size()]
		k.paint(c, 0.5 if lacquer else 0.82, 0.0, 0.0, PAT_LACQUER if lacquer else PAT_PLANK_X)
		k.color_fn = func(p: Vector3, n: Vector3) -> Color: return c * (inner_dark.call(p, n) as Color)
		_arc_band(k, b, -w * 0.5, w * 0.5, r - th, r, a0, a1, 4)
		k.color_fn = Callable()
	# End caps: circle segments under the staves.
	var capc: Color = cap_col if cap_col.a > 0.0 else (cols[0] as Color).darkened(0.08)
	var steps := 14
	# A simple polygon: arc from front (z = d) over the top to the back
	# (z = 0), then along the bottom back to the front.
	var poly := PackedVector2Array()
	poly.append(Vector2(d, 0.0))
	for i in steps + 1:
		var a := a_front + span * float(i) / steps
		poly.append(Vector2(bc.z + cos(a) * (r - th * 0.98), bc.y + sin(a) * (r - th * 0.98)))
	poly.append(Vector2(0.0, 0.0))
	for s: float in [1.0, -1.0]:
		k.paint(capc, 0.5 if lacquer else 0.82, 0.0, 0.0, PAT_LACQUER if lacquer else PAT_PLANK_Z)
		var xf := Transform3D(Basis(Vector3(0, 0, 1), Vector3(0, 1, 0), Vector3(-1, 0, 0)), Vector3(s * (w * 0.5 - t * 0.5), 0.0, 0.0))
		k.extrude(poly, t, xf, 0.006)
	# Bottom rails front and back (the lid's frame sitting on the walls).
	var rc: Color = (cols[0] as Color).darkened(0.12)
	_board(k, Transform3D(Basis.IDENTITY, Vector3(0.0, rail * 0.5, d - t * 0.5)), Vector3(w, rail, t), rc, PAT_LACQUER if lacquer else PAT_PLANK_X, 0.009)
	_board(k, Transform3D(Basis.IDENTITY, Vector3(0.0, rail * 0.5, t * 0.5)), Vector3(w, rail, t), rc, PAT_LACQUER if lacquer else PAT_PLANK_X, 0.009)
	b["a_front"] = a_front
	b["span"] = span
	return b


static func _common(body: MeshKit, lid: MeshKit, w: float, d: float, h: float, rise: float, rail: float, t: float,
		variant: int, glints: PackedVector3Array) -> void:
	var tones := [Color("#a87140"), Color("#9a6537"), Color("#b5834a")]
	if variant % 2 == 1:
		tones = [Color("#957352"), Color("#86664a"), Color("#a07e5a")]
	# Skids under the box.
	for s: float in [1.0, -1.0]:
		_board(body, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.022, s * (d * 0.5 - 0.07))), Vector3(w + 0.04, 0.044, 0.09), (tones[0] as Color).darkened(0.3), PAT_PLANK_X, 0.01)
	_box_walls(body, w, d, h - 0.04, t, 0.04, 3, tones)
	# Iron corner brackets with rivets.
	_metal(body, IRON, PAT_IRON, 0.5, 0.85)
	var bh := h - 0.07
	var by := 0.04 + bh * 0.5 + 0.005
	for sx: float in [1.0, -1.0]:
		for sz: float in [1.0, -1.0]:
			_plate(body, Vector3(sx * (w * 0.5 - 0.034), by, sz * (d * 0.5 + 0.004)), Vector3(0.075, bh, 0.009))
			_plate(body, Vector3(sx * (w * 0.5 + 0.004), by, sz * (d * 0.5 - 0.034)), Vector3(0.009, bh, 0.075))
			for ry: float in [0.25, 0.55, 0.85]:
				var y := 0.04 + bh * ry
				_rivet(body, Vector3(sx * (w * 0.5 - 0.034), y, sz * (d * 0.5 + 0.009)))
				_rivet(body, Vector3(sx * (w * 0.5 + 0.009), y, sz * (d * 0.5 - 0.034)))
	# Hasp plate + ring on the front.
	_metal(body, IRON_DARK, PAT_IRON, 0.45, 0.9)
	_plate(body, Vector3(0.0, h - 0.07, d * 0.5 + 0.006), Vector3(0.085, 0.1, 0.01))
	var ring_xf := Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.0, h - 0.115, d * 0.5 + 0.02))
	body.torus(ring_xf, 0.024, 0.0055, 16, 6)
	_rivet(body, Vector3(-0.025, h - 0.04, d * 0.5 + 0.012), 0.008)
	_rivet(body, Vector3(0.025, h - 0.04, d * 0.5 + 0.012), 0.008)
	# Side handles (iron half rings hanging from mounts).
	for sx: float in [1.0, -1.0]:
		_plate(body, Vector3(sx * (w * 0.5 + 0.007), h * 0.62, 0.0), Vector3(0.012, 0.05, 0.16))
		_handle(body, Vector3(sx * (w * 0.5 + 0.024), h * 0.62, 0.0), 0.055, 0.007)
	glints.append(Vector3(0.0, h - 0.11, d * 0.5 + 0.04))
	glints.append(Vector3(w * 0.5 + 0.01, h - 0.03, d * 0.5 + 0.01))
	# Lid.
	var b := _barrel_lid(lid, w, d, rise, rail, t, 5, [tones[1], tones[2], tones[0], tones[2], tones[1]])
	var r := float(b["r"])
	var a0 := float(b["a_front"])
	var span := float(b["span"])
	_metal(lid, IRON, PAT_IRON, 0.5, 0.85)
	for s: float in [1.0, -1.0]:
		var x0 := s * (w * 0.5 + 0.004)
		var x1 := s * (w * 0.5 - 0.075)
		_arc_band(lid, b, minf(x0, x1), maxf(x0, x1), r - 0.004, r + 0.009, a0 - 0.02, a0 + span + 0.02, 14)
		# Corner plates on the rails.
		_plate(lid, Vector3(s * (w * 0.5 - 0.034), rail * 0.5, d + 0.005), Vector3(0.075, rail + 0.01, 0.009))
		_plate(lid, Vector3(s * (w * 0.5 - 0.034), rail * 0.5, -0.005), Vector3(0.075, rail + 0.01, 0.009))
		for k in 4:
			var a := a0 + span * (0.15 + 0.7 * float(k) / 3.0)
			_rivet(lid, _barrel_point(b, a, r + 0.01, s * (w * 0.5 - 0.037)), 0.0085)
	# Hasp tongue hanging over the front.
	_metal(lid, IRON_DARK, PAT_IRON, 0.45, 0.9)
	_plate(lid, Vector3(0.0, rail * 0.5 - 0.035, d + 0.018), Vector3(0.055, 0.11, 0.009))
	_rivet(lid, Vector3(0.0, rail * 0.5, d + 0.024), 0.009)


static func _rare(body: MeshKit, lid: MeshKit, w: float, d: float, h: float, rise: float, rail: float, t: float,
		glints: PackedVector3Array) -> void:
	var tones := [Color("#5b3d27"), Color("#523622"), Color("#634329")]
	for s: float in [1.0, -1.0]:
		_board(body, Transform3D(Basis.IDENTITY, Vector3(0.0, 0.024, s * (d * 0.5 - 0.075))), Vector3(w + 0.05, 0.048, 0.1), Color("#2e2118"), PAT_PLANK_X, 0.01)
	_box_walls(body, w, d, h - 0.045, t, 0.045, 4, tones)
	# Wrap-around iron bands (front, back, under) + corner caps + studs.
	_metal(body, IRON, PAT_IRON, 0.42, 0.9)
	var bands := [-w * 0.3, w * 0.3]
	for bx: float in bands:
		for sz: float in [1.0, -1.0]:
			_plate(body, Vector3(bx, 0.045 + (h - 0.045) * 0.5, sz * (d * 0.5 + 0.006)), Vector3(0.07, h - 0.04, 0.012), 0.005)
			if sz > 0.0:
				for ry: float in [0.18, 0.5, 0.82]:
					_rivet(body, Vector3(bx, 0.045 + (h - 0.045) * ry, sz * (d * 0.5 + 0.013)), 0.0095)
	for sx: float in [1.0, -1.0]:
		for sz: float in [1.0, -1.0]:
			# Corner caps along the top edge.
			_plate(body, Vector3(sx * (w * 0.5 - 0.03), h - 0.035, sz * (d * 0.5 + 0.005)), Vector3(0.07, 0.07, 0.011), 0.005)
			_plate(body, Vector3(sx * (w * 0.5 + 0.005), h - 0.035, sz * (d * 0.5 - 0.03)), Vector3(0.011, 0.07, 0.07), 0.005)
		# Horizontal band around the middle of each side.
		_plate(body, Vector3(sx * (w * 0.5 + 0.006), h * 0.5, 0.0), Vector3(0.012, 0.06, d - 0.02), 0.005)
		_handle(body, Vector3(sx * (w * 0.5 + 0.026), h * 0.62, 0.0), 0.06, 0.008)
	# Lock plate + padlock.
	_metal(body, IRON_DARK, PAT_IRON, 0.4, 0.92)
	_plate(body, Vector3(0.0, h - 0.08, d * 0.5 + 0.008), Vector3(0.13, 0.13, 0.012), 0.008)
	var lock_c := Vector3(0.0, h - 0.15, d * 0.5 + 0.038)
	_metal(body, BRASS.darkened(0.15), PAT_BRASS, 0.32, 1.0)
	body.rbox(Transform3D(Basis.IDENTITY, lock_c), Vector3(0.09, 0.075, 0.034), 0.014, 3)
	_metal(body, Color("#9aa3ad"), PAT_IRON, 0.3, 1.0)
	var sh := Transform3D(Basis(Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)), lock_c + Vector3(0.0, 0.035, 0.0))
	body.torus(sh, 0.026, 0.0065, 14, 6, PI)
	body.paint(Color("#16110d"), 0.9, 0.0, 0.0, 0)
	body.rbox(Transform3D(Basis.IDENTITY, lock_c + Vector3(0.0, -0.008, 0.017)), Vector3(0.012, 0.026, 0.004), 0.003, 1)
	glints.append(lock_c + Vector3(0.0, 0.0, 0.03))
	glints.append(Vector3(w * 0.3, h - 0.02, d * 0.5 + 0.02))
	glints.append(Vector3(-w * 0.5 - 0.01, h - 0.03, d * 0.5))
	# Lid.
	var b := _barrel_lid(lid, w, d, rise, rail, t, 6, [tones[1], tones[2], tones[0], tones[2], tones[1], tones[0]])
	var r := float(b["r"])
	var a0 := float(b["a_front"])
	var span := float(b["span"])
	_metal(lid, IRON, PAT_IRON, 0.42, 0.9)
	for bx: float in bands + [w * 0.5 - 0.035, -w * 0.5 + 0.035]:
		var hw := 0.035 if absf(bx) < w * 0.4 else 0.04
		_arc_band(lid, b, bx - hw, bx + hw, r - 0.004, r + 0.011, a0 - 0.02, a0 + span + 0.02, 12)
		for k in 4:
			var a := a0 + span * (0.12 + 0.76 * float(k) / 3.0)
			_rivet(lid, _barrel_point(b, a, r + 0.012, bx), 0.0095)
		_plate(lid, Vector3(bx, rail * 0.5, d + 0.006), Vector3(hw * 2.0, rail + 0.012, 0.011), 0.004)
		_plate(lid, Vector3(bx, rail * 0.5, -0.006), Vector3(hw * 2.0, rail + 0.012, 0.011), 0.004)
	_metal(lid, IRON_DARK, PAT_IRON, 0.4, 0.92)
	_plate(lid, Vector3(0.0, rail * 0.5 - 0.03, d + 0.022), Vector3(0.06, 0.11, 0.01), 0.005)
	var loop_xf := Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.0, -0.075, d + 0.03))
	lid.torus(loop_xf, 0.014, 0.004, 10, 5)


static func _epic(body: MeshKit, lid: MeshKit, w: float, d: float, h: float, rise: float, rail: float, t: float,
		feet: float, glints: PackedVector3Array) -> void:
	var tones := [Color("#3d2252"), Color("#371e4a"), Color("#45285c")]
	# Ball-and-claw feet.
	_metal(body, GOLD_DEEP, PAT_GOLD, 0.3, 1.0)
	for sx: float in [1.0, -1.0]:
		for sz: float in [1.0, -1.0]:
			var fp := Vector3(sx * (w * 0.5 - 0.05), 0.0, sz * (d * 0.5 - 0.05))
			body.ellipsoid(fp + Vector3(0.0, feet * 0.45, 0.0), Vector3(0.045, feet * 0.5, 0.045), 10, 5)
			body.cylinder(fp + Vector3(0.0, feet * 0.7, 0.0), fp + Vector3(0.0, feet + 0.01, 0.0), 0.032, 0.05, 10, true, 0.006)
	# Panels: plum lacquer.
	var y0 := feet + 0.035
	_box_walls(body, w - 0.02, d - 0.02, h - 0.07, t, y0, 3, tones, 1.0, true)
	# Gold frame: corner posts, top + bottom rails, middle bands.
	_metal(body, GOLD, PAT_GOLD, 0.26, 1.0)
	for sx: float in [1.0, -1.0]:
		for sz: float in [1.0, -1.0]:
			body.rbox(Transform3D(Basis.IDENTITY, Vector3(sx * (w * 0.5 - 0.03), feet + h * 0.5, sz * (d * 0.5 - 0.03))), Vector3(0.068, h, 0.068), 0.014, 1)
			body.ellipsoid(Vector3(sx * (w * 0.5 - 0.03), feet + h + 0.004, sz * (d * 0.5 - 0.03)), Vector3(0.026, 0.016, 0.026), 10, 5)
	for ry: float in [feet + 0.03, feet + h - 0.028]:
		for sz: float in [1.0, -1.0]:
			body.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, ry, sz * (d * 0.5 - 0.004))), Vector3(w - 0.05, 0.052, 0.022), 0.009, 1)
		for sx: float in [1.0, -1.0]:
			body.rbox(Transform3D(Basis.IDENTITY, Vector3(sx * (w * 0.5 - 0.004), ry, 0.0)), Vector3(0.022, 0.052, d - 0.05), 0.009, 1)
	# Vertical gold bands on the front/back and studs along the rails.
	for bx: float in [-w * 0.28, w * 0.28]:
		for sz: float in [1.0, -1.0]:
			body.rbox(Transform3D(Basis.IDENTITY, Vector3(bx, feet + h * 0.5, sz * (d * 0.5 + 0.0))), Vector3(0.05, h - 0.06, 0.016), 0.006, 1)
	_metal(body, GOLD.lightened(0.08), PAT_GOLD, 0.22, 1.0)
	for i in 5:
		var x := -w * 0.42 + w * 0.84 * float(i) / 4.0
		for ry: float in [feet + 0.03, feet + h - 0.028]:
			_rivet(body, Vector3(x, ry, d * 0.5 + 0.009), 0.011)
	# Ornate lock plate (shield) with a big gem.
	_metal(body, GOLD, PAT_GOLD, 0.24, 1.0)
	var plate_c := Vector3(0.0, feet + h - 0.11, d * 0.5 + 0.012)
	body.extrude(_shield(0.17, 0.2), 0.02, Transform3D(Basis.IDENTITY, plate_c), 0.006)
	body.paint(Color("#2fe0d0"), 0.08, 0.2, 0.0, PAT_GEM)
	var gem_c := plate_c + Vector3(0.0, 0.012, 0.018)
	body.blob(gem_c, Vector3(0.034, 0.04, 0.022), 7, 0.04, 10, 6, true)
	body.paint(Color("#16110d"), 0.9, 0.0, 0.0, 0)
	body.rbox(Transform3D(Basis.IDENTITY, plate_c + Vector3(0.0, -0.06, 0.012)), Vector3(0.012, 0.028, 0.004), 0.003, 1)
	# Side handles (gold rings).
	_metal(body, GOLD_DEEP, PAT_GOLD, 0.3, 1.0)
	for sx: float in [1.0, -1.0]:
		_handle(body, Vector3(sx * (w * 0.5 + 0.022), feet + h * 0.62, 0.0), 0.06, 0.009)
		body.ellipsoid(Vector3(sx * (w * 0.5 + 0.012), feet + h * 0.62, 0.0), Vector3(0.012, 0.035, 0.035), 10, 5)
	glints.append(gem_c + Vector3(0.0, 0.0, 0.03))
	glints.append(Vector3(w * 0.5, feet + h, d * 0.5))
	glints.append(Vector3(-w * 0.28, feet + h * 0.4, d * 0.5 + 0.02))
	# Lid: lacquer staves with gold bands, rails, a star crest with a gem.
	var b := _barrel_lid(lid, w, d, rise, rail, t, 6, [tones[1], tones[2], tones[0], tones[2], tones[1], tones[0]], true, Color("#331c45"))
	var r := float(b["r"])
	var a0 := float(b["a_front"])
	var span := float(b["span"])
	_metal(lid, GOLD, PAT_GOLD, 0.25, 1.0)
	for bx: float in [-w * 0.5 + 0.035, w * 0.5 - 0.035, -w * 0.28, w * 0.28]:
		var hw := 0.04 if absf(bx) > w * 0.4 else 0.026
		_arc_band(lid, b, bx - hw, bx + hw, r - 0.004, r + 0.013, a0 - 0.02, a0 + span + 0.02, 12)
	# Rails clad in gold.
	for z: float in [d - t * 0.5, t * 0.5]:
		lid.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, rail * 0.5, z + (0.004 if z > d * 0.5 else -0.004))), Vector3(w + 0.006, rail + 0.006, t + 0.01), 0.01, 1)
	_metal(lid, GOLD.lightened(0.08), PAT_GOLD, 0.22, 1.0)
	for bx: float in [-w * 0.28, w * 0.28]:
		for k in 5:
			var a := a0 + span * (0.12 + 0.76 * float(k) / 4.0)
			_rivet(lid, _barrel_point(b, a, r + 0.014, bx), 0.0105)
	# Star crest on the front slope of the lid.
	var ca := a0 + span * 0.32
	var cpos := _barrel_point(b, ca, r + 0.008, 0.0)
	var nrm := Vector3(0.0, sin(ca), cos(ca))
	var cb := Basis(Vector3.RIGHT, nrm.cross(Vector3.RIGHT), nrm).orthonormalized()
	_metal(lid, GOLD, PAT_GOLD, 0.22, 1.0)
	lid.extrude(_star(0.085, 0.04), 0.014, Transform3D(cb, cpos), 0.004)
	lid.paint(Color("#ff5fae"), 0.08, 0.2, 0.0, PAT_GEM)
	lid.blob(cpos + nrm * 0.014, Vector3(0.022, 0.022, 0.014), 11, 0.04, 8, 5, true)
	glints.append(Vector3(0.0, feet + h, -d * 0.5) + cpos + nrm * 0.03)
	# Hasp.
	_metal(lid, GOLD_DEEP, PAT_GOLD, 0.3, 1.0)
	_plate(lid, Vector3(0.0, rail * 0.5 - 0.02, d + 0.016), Vector3(0.05, 0.08, 0.01), 0.005)
