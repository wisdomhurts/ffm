class_name LandmarkProps
extends RefCounted
## Procedural prop builders shared by the landmarks. Each appends to a kit
## (mesh space = the site's local space; pass the prop transform `t`) and
## returns its collision shapes as [{"shape": Shape3D, "xform": Transform3D}]
## where a prop is solid. Kept small and readable at a distance: chunky
## silhouettes, baked AO, colour variation.

const WOOD := Color("#9c7148")
const DARK_WOOD := Color("#6e4c30")
const GREY_WOOD := Color("#8d8476")
const IRON := Color("#34343a")
const RUST := Color("#7a4a2c")
const BURLAP := Color("#b39a70")
const TERRACOTTA := Color("#b8643c")


static func box_shape(size: Vector3, xform: Transform3D) -> Dictionary:
	var b := BoxShape3D.new()
	b.size = size
	return {"shape": b, "xform": xform}


static func cyl_shape(r: float, h: float, xform: Transform3D) -> Dictionary:
	var c := CylinderShape3D.new()
	c.radius = r
	c.height = h
	return {"shape": c, "xform": xform}


## A plank / slat with its wood grain along its longest side (whatever the
## mesh axis that ends up being).
static func slat(k: MeshKit, t: Transform3D, size: Vector3, c: Color, r: float = 0.008) -> void:
	var long_ax := 0
	if size.y >= size.x and size.y >= size.z:
		long_ax = 1
	elif size.z >= size.x:
		long_ax = 2
	var dir := t.basis[long_ax].normalized()
	var ax := 0
	if absf(dir.y) >= absf(dir.x) and absf(dir.y) >= absf(dir.z):
		ax = 1
	elif absf(dir.z) >= absf(dir.x):
		ax = 2
	var pat: int = [CampKit.P.PLANK_X, CampKit.P.PLANK_Y, CampKit.P.PLANK_Z][ax]
	k.paint(c, 0.84, 0.0, 0.0, pat)
	k.rbox(t, size, minf(r, minf(size.x, minf(size.y, size.z)) * 0.45), 1)


## A plain painted / metal box (no grain).
static func block(k: MeshKit, t: Transform3D, size: Vector3, c: Color, pat: int, rough: float = 0.8, metal: float = 0.0, r: float = 0.01) -> void:
	k.paint(c, rough, metal, 0.0, pat)
	k.rbox(t, size, minf(r, minf(size.x, minf(size.y, size.z)) * 0.45), 1)


# --- Lights --------------------------------------------------------------------------------

## A small iron lantern (origin at its base, ~0.32 m tall). `lit` = the glass
## glows at night; `always` = it glows by day too (indoors, in a mine).
## Returns the flame position.
static func lantern(k: MeshKit, t: Transform3D, lit: bool = true, s: float = 1.0, always: bool = false) -> Vector3:
	var st := t * Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * s), Vector3.ZERO)
	k.paint(Color("#2f3033"), 0.45, 0.7, 0.0, CampKit.P.IRON)
	k.cylinder(st * Vector3(0, 0.0, 0), st * Vector3(0, 0.035, 0), 0.075 * s, 0.07 * s, 12, true, 0.01)
	k.lathe(PackedVector2Array([Vector2(0.0, 0.2), Vector2(0.075, 0.2), Vector2(0.06, 0.24), Vector2(0.02, 0.26), Vector2(0.0, 0.265)]), st, 12)
	for i in 4:
		var a := TAU * float(i) / 4.0 + PI * 0.25
		k.cylinder(st * Vector3(cos(a) * 0.062, 0.03, sin(a) * 0.062), st * Vector3(cos(a) * 0.062, 0.205, sin(a) * 0.062), 0.006 * s, 0.006 * s, 5, false)
	k.torus(st * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.27, 0)), 0.05, 0.005, 12, 4, PI)
	if lit and always:
		k.paint(Color("#ffd690"), 0.1, 0.0, 2.6, MeshKit.Pat.NONE)
	elif lit:
		k.paint(Color("#ffe2a8"), 0.1, 0.0, 1.0, CampKit.P.GLASS)
	else:
		k.paint(Color("#6d6250"), 0.3, 0.0, 0.0, CampKit.P.GLASS)
	k.lathe(PackedVector2Array([Vector2(0.0, 0.035), Vector2(0.05, 0.035), Vector2(0.058, 0.1), Vector2(0.056, 0.17), Vector2(0.045, 0.2), Vector2(0.0, 0.2)]), st, 12)
	return st * Vector3(0, 0.12, 0)


## A wooden post with an arm and a hanging lantern (origin at the foot).
## Returns {"shapes": Array, "flame": Vector3}.
static func lantern_post(k: CampKit, t: Transform3D, seed_v: int, lit: bool = true, height: float = 2.2) -> Dictionary:
	k.log_piece(t * Vector3(0, -0.3, 0), t * Vector3(0, height + 0.05, 0), 0.06, seed_v, true, Color("#5a4232"))
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0.27, height - 0.12, 0.0)), Vector3(0.6, 0.06, 0.07), DARK_WOOD)
	slat(k, t * Transform3D(Basis(Vector3.FORWARD, -0.75), Vector3(0.14, height - 0.3, 0.0)), Vector3(0.3, 0.045, 0.05), DARK_WOOD)
	k.paint(IRON, 0.45, 0.7, 0.0, CampKit.P.IRON)
	k.cylinder(t * Vector3(0.5, height - 0.15, 0.0), t * Vector3(0.5, height - 0.3, 0.0), 0.006, 0.006, 5, false)
	for i in 4:
		var a := TAU * float(i) / 4.0 + 0.4
		k.stone(t * Vector3(cos(a) * 0.15, 0.03, sin(a) * 0.15), Vector3(0.08, 0.05, 0.07), seed_v + i, CampKit.STONE_COLOR, -a, 0.2, 8, 5)
	var flame := lantern(k, t * Transform3D(Basis.IDENTITY, Vector3(0.5, height - 0.6, 0.0)), lit)
	return {"shapes": [cyl_shape(0.1, height, t * Transform3D(Basis.IDENTITY, Vector3(0, height * 0.5, 0)))], "flame": flame}


# --- Containers --------------------------------------------------------------------------

## A slatted wooden crate (origin at the bottom centre). `broken` drops some
## slats and the lid.
static func crate(k: MeshKit, t: Transform3D, size: Vector3, seed_v: int, broken: bool = false, tint: Color = WOOD) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var h := size.y
	# Dark inside.
	block(k, t * Transform3D(Basis.IDENTITY, Vector3(0, h * 0.5, 0)), size * 0.94, Color("#3a2c20"), MeshKit.Pat.NONE, 0.95)
	var rows := maxi(int(round(h / 0.16)), 2)
	var gap := 0.012
	var sh := (h - gap * (rows - 1)) / rows
	for side in 4:
		var along_x := side < 2
		var sgn := 1.0 if side % 2 == 0 else -1.0
		var w := size.x if along_x else size.z
		var off := (size.z if along_x else size.x) * 0.5
		for r in rows:
			if broken and rng.randf() < 0.3:
				continue
			var y := sh * 0.5 + r * (sh + gap)
			var col := tint.lerp(tint.darkened(0.25), rng.randf() * 0.6)
			var pos := Vector3(0, y, sgn * off) if along_x else Vector3(sgn * off, y, 0)
			var sz := Vector3(w, sh, 0.022) if along_x else Vector3(0.022, sh, w)
			slat(k, t * Transform3D(Basis.IDENTITY, pos), sz, col)
	# Corner battens.
	for cx in [-1.0, 1.0]:
		for cz in [-1.0, 1.0]:
			slat(k, t * Transform3D(Basis.IDENTITY, Vector3(cx * (size.x * 0.5 - 0.02), h * 0.5, cz * (size.z * 0.5 + 0.008))), Vector3(0.05, h, 0.03), tint.darkened(0.2))
	if not broken:
		for i in 3:
			var z := (float(i) - 1.0) * size.z / 3.0
			slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, h + 0.012, z)), Vector3(size.x + 0.02, 0.024, size.z / 3.0 - 0.012), tint.lerp(Color("#c49a6c"), rng.randf() * 0.4))
	return [box_shape(size, t * Transform3D(Basis.IDENTITY, Vector3(0, h * 0.5, 0)))]


## A coopered barrel standing up (origin at the bottom centre).
static func barrel(k: MeshKit, t: Transform3D, seed_v: int, h: float = 0.9, r: float = 0.3, tint: Color = Color("#8a5d38")) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var inv := t.affine_inverse()
	var staves := 14
	var light := tint.lightened(0.08)
	var dark := tint.darkened(0.18)
	k.paint(tint, 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		var lp := inv * p
		var a := atan2(lp.z, lp.x)
		var idx := int(floor((a + PI) / TAU * staves))
		var f := fposmod((a + PI) / TAU * staves, 1.0)
		var c := light if idx % 2 == 0 else dark.lerp(tint, 0.5)
		return c.darkened(smoothstep(0.42, 0.5, absf(f - 0.5)) * 0.35)
	k.ao_grad = 0.3
	var prof := PackedVector2Array()
	for i in 9:
		var y := h * float(i) / 8.0
		var bulge := sin(PI * float(i) / 8.0)
		prof.append(Vector2(r * (0.86 + 0.14 * bulge), y))
	k.lathe(prof, t, 28)
	k.ao_grad = 0.0
	k.color_fn = Callable()
	k.paint(tint.darkened(0.1), 0.85, 0.0, 0.0, CampKit.P.END_GRAIN)
	k.disc(t * Vector3(0, h - 0.03, 0), t.basis.y, r * 0.84, 20)
	k.paint(Color("#3a3634"), 0.5, 0.55, 0.0, CampKit.P.IRON)
	for y in [0.1, 0.32, 0.68, 0.9]:
		var yy: float = y * h
		var rr := r * (0.86 + 0.14 * sin(PI * y)) + 0.006
		k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, yy, 0)), rr, 0.012, 28, 4)
	return [cyl_shape(r, h, t * Transform3D(Basis.IDENTITY, Vector3(0, h * 0.5, 0)))]


## A barrel lying on its side (axis along local X), resting on the ground.
static func barrel_lying(k: MeshKit, t: Transform3D, seed_v: int, h: float = 0.9, r: float = 0.3) -> Array:
	var lt := t * Transform3D(Basis(Vector3.BACK, PI * 0.5), Vector3(h * 0.5, r * 0.97, 0))
	barrel(k, lt, seed_v, h, r, Color("#7c5838"))
	return [cyl_shape(r, h, t * Transform3D(Basis(Vector3.BACK, PI * 0.5), Vector3(0, r, 0)))]


## A tied burlap sack (ore, flour, potatoes...). Origin at the bottom.
static func sack(k: MeshKit, t: Transform3D, seed_v: int, col: Color = BURLAP, s: float = 1.0) -> Array:
	k.paint(col, 0.95, 0.0, 0.0, CampKit.P.FABRIC)
	k.ao_grad = 0.4
	k.blob(t * Vector3(0, 0.24 * s, 0), Vector3(0.26, 0.26, 0.22) * s, seed_v, 0.16, 12, 8)
	k.ao_grad = 0.0
	k.cylinder(t * Vector3(0, 0.44 * s, 0), t * Vector3(0, 0.56 * s, 0), 0.07 * s, 0.1 * s, 10, true, 0.02)
	k.rope(t * Vector3(-0.07 * s, 0.47 * s, 0.0), t * Vector3(0.07 * s, 0.47 * s, 0.0), -0.05 * s, 0.01 * s)
	return [cyl_shape(0.26 * s, 0.5 * s, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.25 * s, 0)))]


# --- Wheels, carts, tracks ------------------------------------------------------------------

## A spoked wooden wheel lying in the plane of t's XY (axle along t's Z).
static func wheel(k: MeshKit, t: Transform3D, r: float = 0.45, spokes: int = 8) -> void:
	var axle := t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO)
	k.paint(Color("#7a5534"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	k.torus(axle, r - 0.03, 0.035, 26, 6, TAU, 1.4)
	k.paint(Color("#3b3a3c"), 0.5, 0.6, 0.0, CampKit.P.IRON)
	k.torus(axle, r + 0.008, 0.016, 26, 4, TAU, 2.2)
	k.paint(Color("#6e4c30"), 0.85, 0.0, 0.0, CampKit.P.PLANK_X)
	for i in spokes:
		var a := TAU * float(i) / spokes
		var d := Vector3(cos(a), sin(a), 0.0)
		k.cylinder(t * (d * 0.07), t * (d * (r - 0.05)), 0.018, 0.014, 6, false)
	k.cylinder(t * Vector3(0, 0, -0.08), t * Vector3(0, 0, 0.08), 0.075, 0.075, 12, true, 0.015)


## A two-wheeled hand cart (bed along local X, wheels on ±Z). `broken` =
## tipped onto one corner, with the -Z wheel off and lying beside it.
static func cart(k: MeshKit, t: Transform3D, seed_v: int, broken: bool = false) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var wr := 0.48
	var bed_y := wr + 0.08
	var bt := t
	if broken:
		# Tip over the missing wheel's side: that edge rests on the ground.
		bt = t * Transform3D(Basis(Vector3.RIGHT, -0.36), Vector3(0, -0.2, -0.05))
	for i in 6:
		var x := -0.75 + 0.3 * i
		if broken and i == 5:
			continue
		slat(k, bt * Transform3D(Basis.IDENTITY, Vector3(x, bed_y, 0)), Vector3(0.28, 0.04, 1.0), GREY_WOOD.lerp(WOOD, rng.randf() * 0.5))
	for s in [-1.0, 1.0]:
		var sd: float = s
		slat(k, bt * Transform3D(Basis.IDENTITY, Vector3(0, bed_y + 0.16, sd * 0.5)), Vector3(1.7, 0.28, 0.035), GREY_WOOD.darkened(0.08))
		# Shafts reaching forward.
		var a := bt * Vector3(0.85, bed_y - 0.02, sd * 0.32)
		var b := bt * Vector3(2.0, bed_y - 0.25 - (0.32 if broken else 0.0), sd * 0.36)
		k.paint(DARK_WOOD, 0.85, 0.0, 0.0, CampKit.P.PLANK_X)
		k.cylinder(a, b, 0.035, 0.03, 8, true, 0.01)
	slat(k, bt * Transform3D(Basis.IDENTITY, Vector3(-0.85, bed_y + 0.16, 0)), Vector3(0.035, 0.28, 1.0), GREY_WOOD)
	k.paint(IRON, 0.5, 0.6, 0.0, CampKit.P.IRON)
	k.cylinder(bt * Vector3(0, wr, -0.62), bt * Vector3(0, wr, 0.62), 0.03, 0.03, 8, true)
	wheel(k, bt * Transform3D(Basis.IDENTITY, Vector3(0, wr, 0.62)), wr)
	if broken:
		# The lost wheel lies flat in the grass nearby.
		wheel(k, t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.6, 0.06, -1.25)), wr)
	else:
		wheel(k, bt * Transform3D(Basis.IDENTITY, Vector3(0, wr, -0.62)), wr)
	return [box_shape(Vector3(1.8, 0.9, 1.2), t * Transform3D(Basis.IDENTITY, Vector3(0.1, 0.45, 0)))]


## A small iron mine cart on four wheels, heaped with ore (along local X).
static func mine_cart(k: MeshKit, t: Transform3D, seed_v: int, ore: Color = Color("#3a3533")) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	k.paint(Color("#5a4a3e"), 0.55, 0.55, 0.0, MeshKit.Pat.RUST)
	k.ao_grad = 0.3
	k.lathe(PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.42, 0.0), Vector2(0.42, 0.0), Vector2(0.56, 0.55),
		Vector2(0.56, 0.55), Vector2(0.52, 0.55), Vector2(0.52, 0.55), Vector2(0.39, 0.06), Vector2(0.0, 0.06)]),
		t * Transform3D(Basis.IDENTITY, Vector3(0, 0.2, 0)), 4, 0.72, TAU, PI * 0.25, true)
	k.ao_grad = 0.0
	k.paint(Color("#2e2d2f"), 0.45, 0.7, 0.0, CampKit.P.IRON)
	for x in [-0.3, 0.3]:
		for z in [-0.27, 0.27]:
			var c := t * Vector3(x, 0.13, z)
			k.cylinder(c - t.basis.z * 0.03, c + t.basis.z * 0.03, 0.12, 0.12, 12, true, 0.02)
	for i in 9:
		var p := Vector3(rng.randf_range(-0.3, 0.3), 0.72 + rng.randf_range(-0.05, 0.08), rng.randf_range(-0.2, 0.2))
		k.stone(t * p, Vector3(0.13, 0.1, 0.12) * rng.randf_range(0.8, 1.3), seed_v + i, ore.lerp(Color("#58504a"), rng.randf() * 0.5), rng.randf() * TAU, 0.3, 8, 5)
	return [box_shape(Vector3(1.0, 0.85, 0.8), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.42, 0)))]


# --- Furniture ---------------------------------------------------------------------------------

## A plank bench (seat along local X).
static func bench(k: MeshKit, t: Transform3D, length: float = 1.4, c: Color = WOOD) -> Array:
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.44, 0)), Vector3(length, 0.05, 0.32), c)
	for x in [-length * 0.38, length * 0.38]:
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(x, 0.21, 0)), Vector3(0.06, 0.42, 0.3), c.darkened(0.15))
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.18, 0)), Vector3(length * 0.8, 0.05, 0.04), c.darkened(0.2))
	return [box_shape(Vector3(length, 0.46, 0.34), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.23, 0)))]


## A ring of stones (fire pit). Returns nothing (walkable).
static func stone_ring(k: CampKit, t: Transform3D, r: float, n: int, seed_v: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	for i in n:
		var a := TAU * float(i) / n + rng.randf_range(-0.1, 0.1)
		var s := rng.randf_range(0.8, 1.25)
		k.stone(t * Vector3(cos(a) * r, 0.06 * s, sin(a) * r), Vector3(0.16, 0.12, 0.13) * s, seed_v + i,
			CampKit.STONE_COLOR.lerp(Color("#6c6862"), rng.randf()), -a, 0.25, 10, 6)


## Charred logs in a fire pit; `glow` > 0 = warm embers (always on).
static func charred_logs(k: CampKit, t: Transform3D, seed_v: int, glow: float = 0.0) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	k.paint(Color("#4a4744"), 0.98, 0.0, 0.0, MeshKit.Pat.NONE)
	k.disc(t * Vector3(0, 0.015, 0), t.basis.y, 0.42, 16)
	for i in 4:
		var a := TAU * float(i) / 4.0 + rng.randf_range(-0.3, 0.3)
		var d := Vector3(cos(a), 0.0, sin(a))
		var a0 := t * (d * 0.36 + Vector3(0, 0.05, 0))
		var a1 := t * (-d * 0.08 + Vector3(0, 0.12 + rng.randf() * 0.06, 0))
		k.log_piece(a0, a1, 0.055, seed_v + i, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	if glow > 0.0:
		# log_piece paints charred logs without emission: add a glowing bed.
		k.paint(Color("#2a2420"), 0.95, 0.0, glow, CampKit.P.CHAR)
		for i in 6:
			var p := t * Vector3(rng.randf_range(-0.18, 0.18), 0.03, rng.randf_range(-0.18, 0.18))
			k.sphere(p, rng.randf_range(0.035, 0.06), 6, 4)


## A plank desk with a drawer (top at ~0.76 m, along local X).
static func desk(k: MeshKit, t: Transform3D, w: float = 1.3, d: float = 0.62) -> Array:
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.76, 0)), Vector3(w, 0.05, d), Color("#8a5f3a"))
	for x in [-w * 0.45, w * 0.45]:
		for z in [-d * 0.4, d * 0.4]:
			slat(k, t * Transform3D(Basis.IDENTITY, Vector3(x, 0.37, z)), Vector3(0.06, 0.74, 0.06), Color("#6e4c30"))
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(w * 0.22, 0.64, 0.0)), Vector3(w * 0.42, 0.16, d * 0.92), Color("#7d5735"))
	block(k, t * Transform3D(Basis.IDENTITY, Vector3(w * 0.22, 0.64, d * 0.47)), Vector3(0.08, 0.03, 0.02), Color("#c9a25a"), MeshKit.Pat.NONE, 0.35, 0.8)
	return [box_shape(Vector3(w, 0.8, d), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0)))]


## A simple wooden chair facing local +Z.
static func chair(k: MeshKit, t: Transform3D) -> void:
	slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.45, 0)), Vector3(0.44, 0.04, 0.42), Color("#8a5f3a"))
	for x in [-0.19, 0.19]:
		for z in [-0.18, 0.18]:
			slat(k, t * Transform3D(Basis.IDENTITY, Vector3(x, 0.22, z)), Vector3(0.04, 0.45, 0.04), Color("#6e4c30"))
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(x, 0.72, -0.19)), Vector3(0.04, 0.55, 0.04), Color("#6e4c30"))
	for y in [0.62, 0.86]:
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, y, -0.19)), Vector3(0.42, 0.07, 0.025), Color("#8a5f3a"))


## Wall shelves (local X along the wall, +Z = out of the wall) with books,
## jars and bottles.
static func shelves(k: MeshKit, t: Transform3D, seed_v: int, w: float = 1.2, levels: int = 3) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var book_cols := [Color("#7a2f2a"), Color("#2f4f6e"), Color("#3e5c34"), Color("#8a6a2e"), Color("#5a3a5e"), Color("#a0522d")]
	for side in [-1.0, 1.0]:
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(side * w * 0.5, 0.75, 0.15)), Vector3(0.04, 1.5, 0.3), Color("#6e4c30"))
	for lv in levels:
		var y := 0.3 + lv * 0.48
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, y, 0.15)), Vector3(w, 0.035, 0.3), Color("#8a5f3a"))
		var x := -w * 0.5 + 0.06
		while x < w * 0.5 - 0.08:
			var roll := rng.randf()
			if roll < 0.55:
				var bw := rng.randf_range(0.035, 0.06)
				var bh := rng.randf_range(0.2, 0.3)
				var c: Color = book_cols[rng.randi() % book_cols.size()]
				var lean := rng.randf_range(-0.08, 0.08) if rng.randf() < 0.3 else 0.0
				block(k, t * Transform3D(Basis(Vector3.BACK, lean), Vector3(x + bw * 0.5, y + 0.02 + bh * 0.5, 0.15)), Vector3(bw, bh, 0.2), c, MeshKit.Pat.LEATHER, 0.7)
				x += bw + 0.006
			elif roll < 0.8:
				k.paint(Color("#a8c4b8").lerp(Color("#c9b78a"), rng.randf()), 0.12, 0.0, 0.0, MeshKit.Pat.NONE)
				var jh := rng.randf_range(0.12, 0.2)
				k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.05, 0), Vector2(0.055, jh * 0.8), Vector2(0.03, jh), Vector2(0, jh)]), t * Transform3D(Basis.IDENTITY, Vector3(x + 0.06, y + 0.02, 0.17)), 10)
				x += 0.13
			else:
				x += rng.randf_range(0.08, 0.16)


## A wooden ladder from a (foot) to b (top), rungs every 0.3 m.
static func ladder(k: MeshKit, a: Vector3, b: Vector3, side: Vector3, w: float = 0.45) -> void:
	var half := side.normalized() * w * 0.5
	k.paint(Color("#7d5735"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	k.cylinder(a - half, b - half, 0.03, 0.028, 6, true)
	k.cylinder(a + half, b + half, 0.03, 0.028, 6, true)
	var n := int((b - a).length() / 0.3)
	for i in range(1, n + 1):
		var p := a.lerp(b, float(i) / (n + 1))
		k.cylinder(p - half, p + half, 0.018, 0.018, 6, false)


# --- Tools ------------------------------------------------------------------------------------

## A pickaxe: handle from a (bottom) to b (head).
static func pickaxe(k: MeshKit, a: Vector3, b: Vector3, side: Vector3) -> void:
	k.paint(Color("#a07a4e"), 0.75, 0.0, 0.0, CampKit.P.PLANK_X)
	k.cylinder(a, b, 0.022, 0.025, 8, true, 0.01)
	var dir := (b - a).normalized()
	var s := side.normalized()
	k.paint(Color("#55565a"), 0.45, 0.75, 0.0, MeshKit.Pat.RUST)
	var pts := PackedVector3Array()
	var radii := PackedFloat32Array()
	for i in 7:
		var u := float(i) / 6.0 * 2.0 - 1.0
		pts.append(b + s * u * 0.3 - dir * (u * u) * 0.07)
		radii.append(0.028 * (1.0 - absf(u) * 0.75))
	k.tube(pts, radii, 6, true)


## A shovel: handle from a to b (blade at a).
static func shovel(k: MeshKit, a: Vector3, b: Vector3) -> void:
	k.paint(Color("#a07a4e"), 0.75, 0.0, 0.0, CampKit.P.PLANK_X)
	var dir := (b - a).normalized()
	k.cylinder(a + dir * 0.25, b, 0.02, 0.02, 8, true)
	k.torus(Transform3D(MeshKit.basis_y(dir), b + dir * 0.06), 0.05, 0.012, 10, 4, PI)
	k.paint(Color("#6a6c70"), 0.45, 0.7, 0.0, MeshKit.Pat.RUST)
	var bb := MeshKit.basis_y(dir)
	k.rbox(Transform3D(bb, a + dir * 0.13), Vector3(0.24, 0.3, 0.02), 0.01, 1)


## A fishing rod leaning from a (butt) to b (tip), line hanging down.
static func fishing_rod(k: MeshKit, a: Vector3, b: Vector3) -> void:
	k.paint(Color("#6b4a2c"), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
	k.cylinder(a, b, 0.016, 0.004, 6, true)
	k.paint(Color("#3a3c40"), 0.4, 0.7, 0.0, MeshKit.Pat.NONE)
	var reel := a.lerp(b, 0.12)
	k.cylinder(reel - Vector3(0.03, 0, 0), reel + Vector3(0.03, 0, 0), 0.035, 0.035, 10, true)
	k.paint(Color("#e9e4d6"), 0.5, 0.0, 0.0, MeshKit.Pat.NONE)
	k.cylinder(b, b + Vector3(0, -0.7, 0), 0.0025, 0.0025, 3, false)
	k.paint(Color("#d8442f"), 0.4, 0.0, 0.0, MeshKit.Pat.NONE)
	k.sphere(b + Vector3(0, -0.72, 0), 0.025, 8, 5)


# --- Cosy bits -------------------------------------------------------------------------------------

## A terracotta flower pot with a little bunch of flowers.
static func flower_pot(k: MeshKit, t: Transform3D, seed_v: int, flower: Color) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	k.paint(TERRACOTTA.lerp(Color("#9c5232"), rng.randf() * 0.5), 0.8, 0.0, 0.0, MeshKit.Pat.NONE)
	k.ao_grad = 0.25
	k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.12, 0), Vector2(0.15, 0.24), Vector2(0.175, 0.25), Vector2(0.175, 0.3),
		Vector2(0.15, 0.3), Vector2(0.14, 0.26), Vector2(0.0, 0.26)]), t, 16)
	k.ao_grad = 0.0
	k.paint(Color("#4a3426"), 0.95, 0.0, 0.0, CampKit.P.STONE)
	k.disc(t * Vector3(0, 0.27, 0), t.basis.y, 0.14, 12)
	for i in 7:
		var a := rng.randf() * TAU
		var d := rng.randf_range(0.0, 0.1)
		var base := t * Vector3(cos(a) * d, 0.27, sin(a) * d)
		var top := base + t.basis * Vector3(cos(a) * 0.06, rng.randf_range(0.18, 0.32), sin(a) * 0.06)
		k.paint(Color("#4f7a34"), 0.7, 0.0, 0.0, MeshKit.Pat.NONE)
		k.cylinder(base, top, 0.008, 0.006, 4, false)
		k.ellipsoid(base.lerp(top, 0.5) + t.basis * Vector3(0.03, 0, 0), Vector3(0.045, 0.012, 0.022), 6, 3, t.basis * Basis(Vector3.UP, a))
		k.paint(flower.lerp(Color.WHITE, rng.randf() * 0.25), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
		k.ellipsoid(top, Vector3(0.045, 0.022, 0.045), 7, 4)
		k.paint(Color("#f2c84b"), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
		k.sphere(top + t.basis.y * 0.018, 0.015, 6, 4)
	return [cyl_shape(0.17, 0.3, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.15, 0)))]


## An iron cooking pot hanging from a three-pole tripod over a small fire
## with glowing embers.
static func cooking_tripod(k: CampKit, t: Transform3D, seed_v: int) -> Array:
	var apex := t * Vector3(0, 1.45, 0)
	for i in 3:
		var a := TAU * float(i) / 3.0 + 0.3
		var foot := t * Vector3(cos(a) * 0.75, -0.05, sin(a) * 0.75)
		k.log_piece(foot, apex + (apex - foot).normalized() * 0.12, 0.035, seed_v + i, true, Color("#5c4330"))
	k.rope(apex + Vector3(0.0, 0.02, 0.0), apex + Vector3(0.0, -0.02, 0.05), 0.0, 0.02)
	k.paint(IRON, 0.5, 0.6, 0.0, CampKit.P.IRON)
	var pot_top := t * Vector3(0, 0.62, 0)
	k.cylinder(apex, pot_top + Vector3(0, 0.12, 0), 0.006, 0.006, 4, false)
	k.torus(Transform3D(t.basis * Basis(Vector3.RIGHT, PI * 0.5), pot_top + Vector3(0, 0.02, 0)), 0.17, 0.008, 14, 4, PI)
	k.paint(Color("#2a2a2c"), 0.55, 0.5, 0.0, CampKit.P.IRON)
	k.ao_grad = 0.2
	k.lathe(PackedVector2Array([Vector2(0, 0.32), Vector2(0.1, 0.33), Vector2(0.17, 0.4), Vector2(0.19, 0.5),
		Vector2(0.18, 0.6), Vector2(0.17, 0.62), Vector2(0.16, 0.6), Vector2(0.0, 0.58)]), t, 18)
	k.ao_grad = 0.0
	k.paint(Color("#a8652c"), 0.4, 0.0, 0.0, MeshKit.Pat.NONE)
	k.disc(t * Vector3(0, 0.585, 0), t.basis.y, 0.155, 14)
	stone_ring(k, t, 0.5, 9, seed_v + 10)
	charred_logs(k, t, seed_v + 20, 0.9)
	return [cyl_shape(0.62, 0.5, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.25, 0)))]


## A rowboat (bow along local +X) sitting on the water or a beach. The hull
## goes into the double-sided kit `hull` (so its inside renders too).
static func rowboat(k: MeshKit, hull: CampKit, t: Transform3D, paint: Color = Color("#3f7a7a")) -> Array:
	var length := 3.2
	var width := 1.15
	var depth := 0.48
	var hw := func(u: float) -> float:
		var x := absf(u * 2.0 - 1.0)
		var bow := u > 0.5
		return width * 0.5 * sqrt(maxf(1.0 - pow(x, 2.6 if bow else 3.6), 0.0)) + (0.0 if bow else 0.06 * x)
	hull.paint(paint, 0.7, 0.0, 0.0, CampKit.P.PAINT)
	var f := func(u: float, v: float) -> Vector3:
		var x := (u - 0.5) * length
		var phi := v * PI
		var w: float = hw.call(u)
		var d := depth * (1.0 - 0.15 * absf(u * 2.0 - 1.0))
		var sheer := 0.12 * pow(absf(u * 2.0 - 1.0), 2.0)
		return t * Vector3(x, depth + sheer - sin(phi) * d, -cos(phi) * w)
	hull.surface(f, 22, 10)
	# Gunwale rails, thwarts, oars.
	k.paint(Color("#c9a26e"), 0.7, 0.0, 0.0, CampKit.P.PLANK_X)
	for side in [0.0, 1.0]:
		var pts := PackedVector3Array()
		var radii := PackedFloat32Array()
		for i in 13:
			var u := 0.02 + 0.96 * float(i) / 12.0
			pts.append(f.call(u, side) + t.basis.y * 0.015)
			radii.append(0.022)
		k.tube(pts, radii, 5, true)
	for x in [-0.55, 0.45]:
		var xx: float = x
		var w: float = hw.call(xx / length + 0.5) * 2.0 - 0.06
		slat(k, t * Transform3D(Basis.IDENTITY, Vector3(xx, depth - 0.12, 0)), Vector3(0.24, 0.035, w), Color("#c9a26e"))
	k.paint(Color("#b08a5a"), 0.7, 0.0, 0.0, CampKit.P.PLANK_X)
	for s in [-1.0, 1.0]:
		var sd: float = s
		var a := t * Vector3(-0.9, depth + 0.02, sd * 0.25)
		var b := t * Vector3(1.0, depth - 0.05, sd * 0.4)
		k.cylinder(a, b, 0.02, 0.02, 6, true)
		k.rbox(Transform3D(t.basis * Basis(Vector3.RIGHT, sd * 0.2), b + t.basis.x * 0.25), Vector3(0.5, 0.012, 0.13), 0.006, 1)
	return [box_shape(Vector3(length, depth + 0.1, width), t * Transform3D(Basis.IDENTITY, Vector3(0, depth * 0.5, 0)))]


## A fishing net draped from a to b (top edge) and hanging `drop` metres.
## Goes into a double-sided kit (cut out by the NET pattern).
static func net(cloth: CampKit, a: Vector3, b: Vector3, drop: float, out: Vector3) -> void:
	cloth.paint(Color("#a99b78"), 0.95, 0.0, 0.0, LandmarkKit.LP.NET)
	cloth.sheet(a, b, a + Vector3(0, -drop, 0) + out * 0.1, b + Vector3(0, -drop * 0.9, 0) + out * 0.12, 8, 6, 0.12, out, 0.6, 1)


# --- Nature ------------------------------------------------------------------------------------------

## A giant fern: arching fronds made of leaflet pairs (double-sided kit).
## Flutter grows from the crown (still) to the frond tips.
static func giant_fern(cloth: LandmarkKit, t: Transform3D, seed_v: int, size: float = 1.6, col: Color = Color("#4f7d36")) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var fronds := rng.randi_range(9, 13)
	var steps := 12
	for fi in fronds:
		var a := TAU * float(fi) / fronds + rng.randf_range(-0.2, 0.2)
		var length := size * rng.randf_range(0.75, 1.15)
		var rise := rng.randf_range(0.6, 1.0)
		var dir := Vector3(cos(a), 0.0, sin(a))
		var side := Vector3(-dir.z, 0.0, dir.x)
		var c := col.lerp(Color("#6f9a46"), rng.randf() * 0.5)
		var pts: Array[Vector3] = []
		for i in steps + 1:
			var u := float(i) / steps
			# Rise, then droop toward the tip.
			var h := length * rise * u * (1.0 - u * 0.85)
			pts.append(t * (dir * length * u * (0.6 + 0.4 * u) + Vector3(0, h + 0.04, 0)))
		var tside := (t.basis * side).normalized()
		for i in steps:
			var u0 := float(i) / steps
			var u1 := float(i + 1) / steps
			var f0 := pow(u0, 1.4)
			var f1 := pow(u1, 1.4)
			var p0 := pts[i]
			var p1 := pts[i + 1]
			var along := (p1 - p0).normalized()
			var leaf := length * 0.2 * sin(PI * minf(u0 * 1.1 + 0.1, 1.0)) * (1.0 - u0 * 0.35)
			cloth.paint(c.lerp(c.darkened(0.2), float(i % 2) * 0.5), 0.6, 0.0, 0.0, LandmarkKit.LP.LEAF)
			for s in [-1.0, 1.0]:
				var sd: float = s
				var out := (tside * sd + along * 0.45).normalized()
				var tip := p0.lerp(p1, 0.6) + out * leaf + t.basis.y * (-leaf * 0.3)
				cloth.leaf_tri(tip, p0, p1, minf(f1 + 0.15, 1.0), f0, f1)
			# Midrib strip.
			var w0 := 0.014 * (1.0 - u0)
			var w1 := 0.014 * (1.0 - u1)
			cloth.paint(c.darkened(0.35), 0.7, 0.0, 0.0, LandmarkKit.LP.LEAF)
			cloth.leaf_tri(p1 + tside * w1, p0 - tside * w0, p0 + tside * w0, f1, f0, f0)
			cloth.leaf_tri(p1 - tside * w1, p1 + tside * w1, p0 - tside * w0, f1, f1, f0)


## A cluster of glowing blue mushrooms (emissive caps, brighter at night).
static func glow_mushrooms(k: MeshKit, t: Transform3D, seed_v: int, n: int = 5, s: float = 1.0) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	for i in n:
		var a := rng.randf() * TAU
		var d := rng.randf_range(0.0, 0.28) * s
		var h := rng.randf_range(0.1, 0.32) * s
		var r := rng.randf_range(0.05, 0.13) * s
		var base := Vector3(cos(a) * d, 0.0, sin(a) * d)
		var lean := Vector3(rng.randf_range(-0.04, 0.04), 0.0, rng.randf_range(-0.04, 0.04)) * s
		k.paint(Color("#d9e4e0"), 0.6, 0.0, 0.25, MeshKit.Pat.NONE)
		k.cylinder(t * base, t * (base + Vector3(0, h, 0) + lean), r * 0.28, r * 0.22, 8, false)
		var cap := t * Transform3D(Basis(Vector3.UP, a), base + Vector3(0, h, 0) + lean)
		k.paint(Color("#59b8ff").lerp(Color("#7fe0ff"), rng.randf()), 0.4, 0.0, 1.0, LandmarkKit.LP.GLOW_CAP)
		k.lathe(PackedVector2Array([Vector2(0.0, -r * 0.15), Vector2(r * 0.6, -r * 0.12), Vector2(r, 0.0), Vector2(r * 0.85, r * 0.35),
			Vector2(r * 0.5, r * 0.6), Vector2(0.0, r * 0.68)]), cap, 12)
