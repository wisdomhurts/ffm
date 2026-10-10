class_name Bridges
extends Node3D
## Small wooden footbridges where the trails (WorldGen.paths) cross the
## stream: a gently arched plank deck on two stringers, posts and hand rails,
## sill logs at both ends. One mesh per bridge (vertex-coloured wood with a
## procedural grain texture) and collision on layer 1: tilted deck segments
## that ramp into the ground at the ends, plus rail walls so nobody tumbles
## into the water.
##
## deck_height_at(x, z) -> float  deck top at (x, z), or -INF off the bridges.

const WIDTH := 1.9
const HALF_SPAN := 4.9
const ARCH := 0.55
const RAIL_H := 0.95

## Each: {"center": Vector3, "axis": Vector3 (along the span), "side": Vector3,
##        "y0": float, "y1": float (deck ends), "len": float}
var bridges: Array[Dictionary] = []
var gen: WorldGen
static var _wood_mat: StandardMaterial3D = null


func setup(_game: Game, terrain: Terrain) -> void:
	if terrain != null:
		gen = terrain.gen
	if gen == null:
		gen = GameState.world_gen
	if gen == null:
		return
	for c in find_crossings(gen):
		_build_bridge(c)


## Where trails cross the stream: Array of {"pos": Vector2, "trail_dir": Vector2,
## "stream_i": int}. Crossings closer than 12 m to each other are merged.
static func find_crossings(g: WorldGen) -> Array:
	var out: Array = []
	var st := g.stream
	for poly in g.paths:
		var pl: PackedVector2Array = poly
		for i in pl.size() - 1:
			var a := pl[i]
			var b := pl[i + 1]
			for j in st.size() - 1:
				var c := st[j]
				var d := st[j + 1]
				if maxf(a.x, b.x) < minf(c.x, d.x) or minf(a.x, b.x) > maxf(c.x, d.x):
					continue
				if maxf(a.y, b.y) < minf(c.y, d.y) or minf(a.y, b.y) > maxf(c.y, d.y):
					continue
				var hit: Variant = Geometry2D.segment_intersects_segment(a, b, c, d)
				if hit == null:
					continue
				var p: Vector2 = hit
				var dup := false
				for e in out:
					if (e["pos"] as Vector2).distance_to(p) < 12.0:
						dup = true
				if dup:
					continue
				# Trail direction over a few points either side (smoother).
				var ta := pl[maxi(i - 1, 0)]
				var tb := pl[mini(i + 2, pl.size() - 1)]
				out.append({"pos": p, "trail_dir": (tb - ta).normalized(), "stream_i": j})
	return out


func _build_bridge(c: Dictionary) -> void:
	var p: Vector2 = c["pos"]
	var j: int = c["stream_i"]
	var st := gen.stream
	var flow := (st[mini(j + 1, st.size() - 1)] - st[j]).normalized()
	var across := Vector2(-flow.y, flow.x)
	var td: Vector2 = c["trail_dir"]
	if across.dot(td) < 0.0:
		across = -across
	# Follow the trail, but never cross the water at more than 28 degrees.
	var ang := across.angle_to(td)
	var lim := deg_to_rad(28.0)
	var dir2 := across.rotated(clampf(ang, -lim, lim))
	var axis := Vector3(dir2.x, 0.0, dir2.y).normalized()
	var side := axis.cross(Vector3.UP).normalized()
	var water_y := gen.stream_water_height(p.x, p.y)
	var e0 := Vector2(p.x, p.y) - dir2 * HALF_SPAN
	var e1 := Vector2(p.x, p.y) + dir2 * HALF_SPAN
	var y0 := gen.height_at(e0.x, e0.y) + 0.06
	var y1 := gen.height_at(e1.x, e1.y) + 0.06
	var mid_y := maxf(maxf(y0, y1) + ARCH, water_y + 1.05)
	var center := Vector3(p.x, mid_y, p.y)
	var info := {"center": center, "axis": axis, "side": side, "y0": y0, "y1": y1,
		"mid": mid_y, "len": HALF_SPAN * 2.0, "water": water_y}
	bridges.append(info)
	var holder := Node3D.new()
	holder.name = "Bridge%d" % bridges.size()
	add_child(holder)
	# Local frame: x = along the span, z = across, origin at the deck centre (ground level).
	holder.global_transform = Transform3D(Basis(axis, Vector3.UP, side), Vector3(p.x, 0.0, p.y))
	var mi := MeshInstance3D.new()
	mi.name = "Mesh"
	mi.mesh = _build_mesh(info, bridges.size())
	mi.material_override = wood_material()
	holder.add_child(mi)
	_build_collision(holder, info)


## Deck top height at local position t (-HALF_SPAN..HALF_SPAN along the span).
static func deck_y(info: Dictionary, t: float) -> float:
	var hs: float = float(info["len"]) * 0.5
	var u := clampf(t / hs, -1.0, 1.0)
	var end_y: float = lerpf(float(info["y0"]), float(info["y1"]), u * 0.5 + 0.5)
	var arch := 1.0 - u * u
	return lerpf(end_y, float(info["mid"]), arch)


func deck_height_at(x: float, z: float) -> float:
	for info in bridges:
		var c: Vector3 = info["center"]
		var d := Vector3(x - c.x, 0.0, z - c.z)
		var t := d.dot(info["axis"])
		var s := d.dot(info["side"])
		if absf(t) <= float(info["len"]) * 0.5 + 0.2 and absf(s) <= WIDTH * 0.5 + 0.15:
			return deck_y(info, t)
	return -INF


# --- Mesh -----------------------------------------------------------------------------------

static func wood_material() -> StandardMaterial3D:
	if _wood_mat != null:
		return _wood_mat
	var img := Image.create(256, 64, true, Image.FORMAT_L8)
	var fn := FastNoiseLite.new()
	fn.seed = 7
	fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	fn.frequency = 1.0
	fn.fractal_octaves = 3
	for y in 64:
		for x in 256:
			# Stretched noise -> long grain lines, wrapped so it tiles.
			var ax := float(x) / 256.0 * TAU
			var v := fn.get_noise_3d(cos(ax) * 0.9, sin(ax) * 0.9, float(y) * 0.32)
			var g := 0.72 + 0.28 * (0.5 + 0.5 * sin(v * 9.0))
			img.set_pixel(x, y, Color(g, g, g))
	img.generate_mipmaps()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.roughness = 0.82
	m.metallic_specular = 0.3
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_wood_mat = m
	return m


class Box:
	var st: SurfaceTool
	var uv_offset := 0.0

	func _init(p_st: SurfaceTool) -> void:
		st = p_st

	## An oriented box: centre, unit axes and half extents along them. The
	## wood grain runs along the longest axis.
	func add(c: Vector3, ax: Vector3, ay: Vector3, az: Vector3, h: Vector3, col: Color, _uv_len: float = 1.0) -> void:
		var axes: Array[Vector3] = [ax, ay, az]
		var ext: Array[float] = [h.x, h.y, h.z]
		var gi := 0
		for k in 3:
			if ext[k] > ext[gi]:
				gi = k
		var g := axes[gi]
		uv_offset += 0.37
		for a in 3:
			for sgn: float in [-1.0, 1.0]:
				var n := axes[a] * sgn
				var u := axes[(a + 1) % 3]
				var v := axes[(a + 2) % 3]
				var hu := ext[(a + 1) % 3]
				var hv := ext[(a + 2) % 3]
				var o := c + n * ext[a]
				var shade := 0.84 + 0.16 * clampf(n.y, 0.0, 1.0) - 0.14 * clampf(-n.y, 0.0, 1.0)
				var cc := Color(col.r * shade, col.g * shade, col.b * shade)
				var across := n.cross(g)
				if across.length_squared() < 0.01:
					across = u
				across = across.normalized()
				_quad(o - u * hu - v * hv, o + u * hu - v * hv, o + u * hu + v * hv, o - u * hu + v * hv, n, cc, g, across, c)

	func _quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, col: Color, g: Vector3, across: Vector3, origin: Vector3) -> void:
		# Godot front faces are clockwise as seen from outside: (b-a)x(c-a) points inward.
		var pts: Array[Vector3] = [a, b, c, a, c, d]
		if (b - a).cross(c - a).dot(n) > 0.0:
			pts = [a, c, b, a, d, c]
		for p in pts:
			st.set_color(col)
			st.set_normal(n)
			st.set_uv(Vector2((p - origin).dot(g) * 0.55 + uv_offset, (p - origin).dot(across) * 2.5 + uv_offset * 3.0))
			st.add_vertex(p)


func _build_mesh(info: Dictionary, seed_i: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = gen.seed + 9000 + seed_i * 31
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var box := Box.new(st)
	var hs: float = float(info["len"]) * 0.5
	var wood := Color(0.55, 0.40, 0.27)
	var dark := Color(0.38, 0.27, 0.18)
	var X := Vector3.RIGHT
	var Y := Vector3.UP
	var Z := Vector3.BACK
	# Deck planks across the span, following the arch.
	var plank := 0.24
	var n := int(hs * 2.0 / plank)
	for i in n:
		var t := -hs + (float(i) + 0.5) * (hs * 2.0 / n)
		var y := deck_y(info, t)
		var slope := (deck_y(info, t + 0.1) - deck_y(info, t - 0.1)) / 0.2
		var ax := Vector3(1.0, slope, 0.0).normalized()
		var ay := Z.cross(ax).normalized()
		var tint := rng.randf_range(0.85, 1.12)
		var col := Color(wood.r * tint, wood.g * tint, wood.b * tint * rng.randf_range(0.95, 1.05))
		var jit := rng.randf_range(-0.04, 0.04)
		box.add(Vector3(t, y - 0.035, jit), ax, ay, Z, Vector3(plank * 0.44, 0.035, WIDTH * 0.5 + rng.randf_range(-0.03, 0.06)), col, WIDTH)
	# Stringers under the deck (segmented along the arch).
	var segs := 8
	for sgn in [-1.0, 1.0]:
		for i in segs:
			var ta := -hs + float(i) / segs * hs * 2.0
			var tb := -hs + float(i + 1) / segs * hs * 2.0
			var pa := Vector3(ta, deck_y(info, ta) - 0.17, sgn * (WIDTH * 0.5 - 0.22))
			var pb := Vector3(tb, deck_y(info, tb) - 0.17, sgn * (WIDTH * 0.5 - 0.22))
			var ax := (pb - pa).normalized()
			var ay := Z.cross(ax).normalized()
			box.add((pa + pb) * 0.5, ax, ay, Z, Vector3(pa.distance_to(pb) * 0.5 + 0.02, 0.1, 0.08), dark, 2.0)
	# Posts and rails on both sides.
	var posts := [-hs + 0.15, -hs * 0.5, 0.0, hs * 0.5, hs - 0.15]
	for sgn in [-1.0, 1.0]:
		var zz: float = sgn * (WIDTH * 0.5 + 0.04)
		for t: float in posts:
			var y := deck_y(info, t)
			var hgt := RAIL_H + 0.08
			box.add(Vector3(t, y + hgt * 0.5 - 0.1, zz), X, Y, Z, Vector3(0.065, hgt * 0.5 + 0.05, 0.065), dark, 1.0)
		for i in posts.size() - 1:
			var ta: float = posts[i]
			var tb: float = posts[i + 1]
			for rh in [RAIL_H, RAIL_H * 0.52]:
				var pa := Vector3(ta, deck_y(info, ta) + rh, zz)
				var pb := Vector3(tb, deck_y(info, tb) + rh, zz)
				var ax := (pb - pa).normalized()
				var ay := Z.cross(ax).normalized()
				var thick := 0.05 if rh > RAIL_H * 0.6 else 0.035
				box.add((pa + pb) * 0.5, ax, ay, Z, Vector3(pa.distance_to(pb) * 0.5 + 0.04, thick, thick * 0.9), wood * 0.92, 2.0)
	# Sill logs at both ends, half sunk into the bank.
	for sgn in [-1.0, 1.0]:
		var t: float = sgn * (hs - 0.25)
		var gy := deck_y(info, t) - 0.22
		box.add(Vector3(t, gy, 0.0), X, Y, Z, Vector3(0.17, 0.17, WIDTH * 0.5 + 0.35), dark * 0.9, 2.5)
	st.generate_tangents()
	return st.commit()


# --- Collision ---------------------------------------------------------------------------------

func _build_collision(holder: Node3D, info: Dictionary) -> void:
	var body := StaticBody3D.new()
	body.name = "Body"
	body.collision_layer = 1
	body.collision_mask = 0
	holder.add_child(body)
	var hs: float = float(info["len"]) * 0.5
	var segs := 8
	for i in segs:
		var ta := -hs - 0.6 + float(i) / segs * (hs * 2.0 + 1.2)
		var tb := -hs - 0.6 + float(i + 1) / segs * (hs * 2.0 + 1.2)
		# Past the ends the deck ramps slightly into the ground.
		var ya := deck_y(info, ta) - (0.12 if absf(ta) > hs else 0.0)
		var yb := deck_y(info, tb) - (0.12 if absf(tb) > hs else 0.0)
		var pa := Vector3(ta, ya, 0.0)
		var pb := Vector3(tb, yb, 0.0)
		var ax := (pb - pa).normalized()
		var box := BoxShape3D.new()
		box.size = Vector3(pa.distance_to(pb) + 0.06, 0.3, WIDTH)
		var cs := CollisionShape3D.new()
		cs.shape = box
		var ay := Vector3.BACK.cross(ax).normalized()
		cs.transform = Transform3D(Basis(ax, ay, Vector3.BACK), (pa + pb) * 0.5 - ay * 0.15)
		body.add_child(cs)
	# Rails: thin walls along both sides so nobody falls in.
	for sgn in [-1.0, 1.0]:
		for i in 4:
			var ta := -hs + float(i) / 4.0 * hs * 2.0
			var tb := -hs + float(i + 1) / 4.0 * hs * 2.0
			var pa := Vector3(ta, deck_y(info, ta) + RAIL_H * 0.5, sgn * (WIDTH * 0.5 + 0.05))
			var pb := Vector3(tb, deck_y(info, tb) + RAIL_H * 0.5, sgn * (WIDTH * 0.5 + 0.05))
			var ax := (pb - pa).normalized()
			var box := BoxShape3D.new()
			box.size = Vector3(pa.distance_to(pb) + 0.1, RAIL_H + 0.3, 0.12)
			var cs := CollisionShape3D.new()
			cs.shape = box
			cs.transform = Transform3D(Basis(ax, Vector3.BACK.cross(ax).normalized(), Vector3.BACK), (pa + pb) * 0.5)
			body.add_child(cs)
