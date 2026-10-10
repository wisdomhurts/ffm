class_name CampProps
extends RefCounted
## Procedural builders for the camp's static props. Each builder appends to a
## CampKit in mesh space (pass the prop's transform `t`) and returns its
## collision shapes as [{"shape": Shape3D, "xform": Transform3D}] so the
## Campsite can put every static prop into one mesh and one StaticBody3D.
##
##   log_bench, stump_seat, picnic_table, firewood_stack, chopping_block,
##   bucket, kettle, mug, plate, backpack, camp_sign, lantern (glass is
##   lit through the `lamp` instance uniform), wood_chips, loose_log.

const TABLE_WOOD := Color("#b0814f")
const DARK_WOOD := Color("#7d5735")
const ENAMEL_BLUE := Color("#3f6e8f")
const ENAMEL_RED := Color("#b5483a")


static func _box_shape(size: Vector3, xform: Transform3D) -> Dictionary:
	var b := BoxShape3D.new()
	b.size = size
	return {"shape": b, "xform": xform}


static func _cyl_shape(r: float, h: float, xform: Transform3D) -> Dictionary:
	var c := CylinderShape3D.new()
	c.radius = r
	c.height = h
	return {"shape": c, "xform": xform}


## A log to sit on (lying along local X), resting on two little chocks.
static func log_bench(k: CampKit, t: Transform3D, length: float, seed_v: int) -> Array:
	var r := 0.2
	var y := r * 0.92
	k.log_piece(t * Vector3(-length * 0.5, y, 0.0), t * Vector3(length * 0.5, y + 0.02, 0.0), r, seed_v, true,
		CampKit.BARK_COLOR.lerp(Color("#6b5240"), 0.3))
	for s in [-0.32, 0.32]:
		var sx: float = s * length
		k.stone(t * Vector3(sx, 0.05, 0.17), Vector3(0.09, 0.06, 0.07), seed_v + int(sx * 10.0), CampKit.STONE_COLOR, 0.0, 0.2, 8, 5)
	return [_cyl_shape(r, length, t * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.0, y, 0.0)))]


## A tree stump seat with a root flare, bark and growth rings on top.
static func stump_seat(k: CampKit, t: Transform3D, r: float, h: float, seed_v: int) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	k.paint(CampKit.BARK_COLOR.lerp(Color("#4a3628"), rng.randf()), 0.95, 0.0, 0.0, CampKit.P.BARK)
	var prof := PackedVector2Array([Vector2(r * 1.3, -0.05), Vector2(r * 1.18, 0.04), Vector2(r * 1.05, 0.12),
		Vector2(r, h * 0.5), Vector2(r * 0.98, h - 0.01), Vector2(r * 0.96, h)])
	k.ao_grad = 0.35
	k.lathe(prof, t, 16)
	k.ao_grad = 0.0
	# Roots.
	for i in 4:
		var a := TAU * float(i) / 4.0 + rng.randf_range(-0.4, 0.4)
		var d := Vector3(cos(a), 0.0, sin(a))
		k.tube(PackedVector3Array([t * (d * r * 0.8 + Vector3(0, 0.12, 0)), t * (d * r * 1.35 + Vector3(0, 0.02, 0)), t * (d * r * 1.7 + Vector3(0, -0.04, 0))]),
			PackedFloat32Array([0.07, 0.05, 0.025]), 8, true)
	k.paint(CampKit.WOOD_COLOR, 0.85, 0.0, 0.0, CampKit.P.END_GRAIN)
	var top := t * Vector3(0.0, h, 0.0)
	var rim := CampKit.WOOD_COLOR.darkened(0.12)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		return CampKit.WOOD_COLOR.lerp(rim, smoothstep(r * 0.72, r * 0.95, p.distance_to(top)))
	k.disc(top, t.basis.y, r * 0.965, 18)
	k.color_fn = Callable()
	return [_cyl_shape(r * 1.05, h, t * Transform3D(Basis.IDENTITY, Vector3(0.0, h * 0.5, 0.0)))]


## A classic picnic table with attached benches (long axis = local X).
static func picnic_table(k: CampKit, t: Transform3D) -> Array:
	var length := 1.9
	var top_y := 0.76
	# Tabletop planks along X.
	for i in 5:
		var z := -0.34 + 0.17 * i
		k.plank(t * Transform3D(Basis.IDENTITY, Vector3(0.0, top_y, z)), Vector3(length, 0.045, 0.155), TABLE_WOOD.lerp(DARK_WOOD, 0.12 * float(i % 2)), 0)
	# Bench planks.
	for side in [-1.0, 1.0]:
		var s: float = side
		for j in 2:
			k.plank(t * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.45, s * (0.66 + 0.13 * float(j) - 0.065))), Vector3(length, 0.04, 0.12), TABLE_WOOD, 0)
	# A-frame legs and cross supports at both ends.
	for end in [-1.0, 1.0]:
		var ex: float = end * (length * 0.5 - 0.22)
		for side in [-1.0, 1.0]:
			var s: float = side
			var a := t * Vector3(ex, 0.0, s * 0.72)
			var b := t * Vector3(ex, top_y - 0.03, s * 0.2)
			var dirv := (b - a)
			var bas := MeshKit.basis_y(dirv)
			k.plank(Transform3D(bas, (a + b) * 0.5), Vector3(0.11, dirv.length(), 0.05), DARK_WOOD, 1)
		k.plank(t * Transform3D(Basis.IDENTITY, Vector3(ex, 0.4, 0.0)), Vector3(0.06, 0.09, 1.5), DARK_WOOD, 2)
		k.plank(t * Transform3D(Basis.IDENTITY, Vector3(ex, top_y - 0.06, 0.0)), Vector3(0.06, 0.07, 0.82), DARK_WOOD, 2)
	return [
		_box_shape(Vector3(length, 0.1, 0.86), t * Transform3D(Basis.IDENTITY, Vector3(0, top_y, 0))),
		_box_shape(Vector3(length, 0.45, 0.3), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.235, 0.66))),
		_box_shape(Vector3(length, 0.45, 0.3), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.235, -0.66))),
		_box_shape(Vector3(length * 0.9, 0.5, 0.5), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.45, 0))),
	]


## Split firewood stacked between posts under a little plank roof (long axis X).
static func firewood_stack(k: CampKit, t: Transform3D, seed_v: int) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var w := 1.5
	var depth := 0.55
	# Base rails.
	for z in [-0.18, 0.18]:
		k.plank(t * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.05, z)), Vector3(w + 0.1, 0.08, 0.08), DARK_WOOD, 0)
	# Posts.
	for x in [-w * 0.5 - 0.04, w * 0.5 + 0.04]:
		for z in [-0.24, 0.24]:
			k.log_piece(t * Vector3(x, -0.05, z), t * Vector3(x, 1.12, z), 0.045, seed_v + int(x * 10.0 + z * 100.0), true, Color("#5c4330"))
	# Logs: rows of split rounds, end grain toward +Z/-Z.
	var rows := 4
	for row in rows:
		var n := 6 - (row % 2)
		var y := 0.17 + 0.165 * row
		for i in n:
			var x := -w * 0.5 + 0.13 + (w - 0.26) * float(i) / float(maxi(n - 1, 1)) + (0.06 if row % 2 == 1 else 0.0)
			var r := rng.randf_range(0.068, 0.085)
			k.log_piece(t * Vector3(x, y, -depth * 0.5), t * Vector3(x + rng.randf_range(-0.02, 0.02), y + rng.randf_range(-0.01, 0.01), depth * 0.5),
				r, seed_v + row * 10 + i, true, CampKit.BARK_COLOR.lerp(Color("#6e5643"), rng.randf()), CampKit.WOOD_COLOR.lerp(Color("#d8b183"), rng.randf()))
	# Little lean-to roof.
	var roof_t := t * Transform3D(Basis(Vector3.RIGHT, 0.32), Vector3(0.0, 1.2, 0.0))
	for i in 4:
		var z := -0.36 + 0.24 * i
		k.plank(roof_t * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, z)), Vector3(w + 0.35, 0.035, 0.23), Color("#8c6a47").lerp(DARK_WOOD, 0.3 * float(i % 2)), 0)
	return [_box_shape(Vector3(w + 0.2, 1.2, depth + 0.1), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.6, 0)))]


## A chopping stump with an axe stuck in it and chips around.
static func chopping_block(k: CampKit, t: Transform3D, seed_v: int) -> Array:
	var shapes := stump_seat(k, t, 0.3, 0.48, seed_v)
	# Axe: handle leaning out of the top, head buried in the wood.
	var head_c := t * Vector3(0.05, 0.5, 0.0)
	var handle_end := t * Vector3(0.55, 0.92, 0.12)
	k.paint(Color("#c49a66"), 0.75, 0.0, 0.0, CampKit.P.PLANK_X)
	k.tube(PackedVector3Array([head_c, head_c.lerp(handle_end, 0.5) + t.basis * Vector3(0, 0.02, 0), handle_end]), PackedFloat32Array([0.022, 0.02, 0.024]), 8, true)
	k.paint(Color("#6c7177"), 0.4, 0.75, 0.0, CampKit.P.IRON)
	var hb := MeshKit.basis_y(handle_end - head_c)
	k.rbox(Transform3D(hb, head_c + (handle_end - head_c).normalized() * 0.03), Vector3(0.05, 0.16, 0.2), 0.012, 2)
	wood_chips(k, t, seed_v + 5, 0.75, 12)
	return shapes


static func wood_chips(k: CampKit, t: Transform3D, seed_v: int, radius: float, n: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	for i in n:
		var a := rng.randf() * TAU
		var d := rng.randf_range(0.35, radius)
		var c := CampKit.WOOD_COLOR.lerp(Color("#e0c294"), rng.randf())
		k.plank(t * Transform3D(Basis(Vector3.UP, rng.randf() * TAU), Vector3(cos(a) * d, 0.01, sin(a) * d)),
			Vector3(rng.randf_range(0.05, 0.1), 0.012, rng.randf_range(0.025, 0.04)), c, 0, 0.004)


## A spare log lying on the ground.
static func loose_log(k: CampKit, t: Transform3D, length: float, r: float, seed_v: int) -> void:
	k.log_piece(t * Vector3(-length * 0.5, r * 0.9, 0.0), t * Vector3(length * 0.5, r * 0.9, 0.0), r, seed_v)


## A wooden water bucket (fire safety!) with a rope handle.
static func bucket(k: CampKit, t: Transform3D) -> Array:
	k.paint(Color("#9b7048"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	k.ao_grad = 0.3
	k.lathe(PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.17, 0.0), Vector2(0.17, 0.0), Vector2(0.21, 0.36),
		Vector2(0.21, 0.36), Vector2(0.19, 0.36), Vector2(0.19, 0.36), Vector2(0.155, 0.04)]), t, 18)
	k.ao_grad = 0.0
	k.paint(Color("#3a3a3c"), 0.5, 0.6, 0.0, CampKit.P.IRON)
	for y in [0.07, 0.29]:
		var yy: float = y
		var rr := lerpf(0.17, 0.21, yy / 0.36) + 0.006
		k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, yy, 0)), rr, 0.01, 24, 4)
	k.paint(Color("#4f7f9c"), 0.06, 0.0, 0.0)
	k.disc(t * Vector3(0, 0.3, 0), t.basis.y, 0.19, 18)
	k.rope(t * Vector3(-0.2, 0.34, 0), t * Vector3(0.2, 0.34, 0), -0.18, 0.009)
	return [_cyl_shape(0.21, 0.36, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.18, 0)))]


## An enamel camp kettle.
static func kettle(k: CampKit, t: Transform3D, col: Color = ENAMEL_BLUE) -> void:
	k.paint(col, 0.32, 0.15, 0.0)
	k.lathe(PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.09, 0.0), Vector2(0.115, 0.04), Vector2(0.12, 0.09),
		Vector2(0.1, 0.15), Vector2(0.055, 0.175), Vector2(0.05, 0.19), Vector2(0.0, 0.195)]), t, 18)
	k.paint(Color("#2b2b2e"), 0.35, 0.5, 0.0)
	k.sphere(t * Vector3(0, 0.205, 0), 0.018, 8, 5)
	k.paint(col, 0.32, 0.15, 0.0)
	k.tube(PackedVector3Array([t * Vector3(0.09, 0.06, 0), t * Vector3(0.15, 0.11, 0), t * Vector3(0.19, 0.15, 0)]), PackedFloat32Array([0.022, 0.015, 0.011]), 8, false)
	k.paint(Color("#2b2b2e"), 0.4, 0.6, 0.0, CampKit.P.IRON)
	k.torus(t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.17, 0)), 0.085, 0.007, 18, 4, PI)


static func mug(k: CampKit, t: Transform3D, col: Color = ENAMEL_BLUE) -> void:
	k.paint(col, 0.3, 0.1, 0.0)
	k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.04, 0), Vector2(0.042, 0.09), Vector2(0.036, 0.09), Vector2(0.034, 0.012), Vector2(0, 0.012)]), t, 14)
	k.paint(Color("#f1ece0"), 0.3, 0.1, 0.0)
	k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, 0.09, 0)), 0.039, 0.0045, 16, 4)
	k.paint(col, 0.3, 0.1, 0.0)
	k.torus(t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0.045, 0.05, 0)), 0.024, 0.006, 12, 4, PI)


static func plate(k: CampKit, t: Transform3D) -> void:
	k.paint(Color("#d8dde0"), 0.3, 0.5, 0.0)
	k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.09, 0), Vector2(0.12, 0.02), Vector2(0.115, 0.022), Vector2(0.085, 0.006), Vector2(0, 0.006)]), t, 18)


## A red hiking backpack leaning back slightly.
static func backpack(k: CampKit, t: Transform3D) -> void:
	var lean := t * Transform3D(Basis(Vector3.RIGHT, -0.22), Vector3.ZERO)
	k.paint(Color("#b9473a"), 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	k.ao_grad = 0.25
	k.rbox(lean * Transform3D(Basis.IDENTITY, Vector3(0, 0.27, 0)), Vector3(0.36, 0.52, 0.22), 0.08, 3)
	k.ao_grad = 0.0
	k.paint(Color("#a53b30"), 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	k.rbox(lean * Transform3D(Basis(Vector3.RIGHT, 0.15), Vector3(0, 0.47, 0.05)), Vector3(0.34, 0.06, 0.24), 0.03, 2)
	k.rbox(lean * Transform3D(Basis.IDENTITY, Vector3(0, 0.18, 0.12)), Vector3(0.24, 0.18, 0.06), 0.04, 2)
	k.paint(Color("#3d3a36"), 0.8, 0.0, 0.0, MeshKit.Pat.LEATHER)
	for x in [-0.1, 0.1]:
		k.rbox(lean * Transform3D(Basis.IDENTITY, Vector3(x, 0.38, 0.115)), Vector3(0.025, 0.2, 0.01), 0.005, 1)
	# Rolled sleeping mat on top.
	k.paint(Color("#6f8f4e"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	k.cylinder(lean * Vector3(-0.22, 0.58, 0.0), lean * Vector3(0.22, 0.58, 0.0), 0.07, 0.07, 14, true, 0.02)


## The camp sign: two bark posts, a crossbar, and a painted board. The text
## is a Label3D added by the caller (see Campsite._build_sign).
static func camp_sign(k: CampKit, t: Transform3D, w: float, board_h: float, top: float) -> Array:
	for x in [-w * 0.5 - 0.06, w * 0.5 + 0.06]:
		var xx: float = x
		k.log_piece(t * Vector3(xx, -0.15, 0.0), t * Vector3(xx, top + 0.18, 0.0), 0.075, 7100 + int(xx * 10.0), true, Color("#5a4232"))
	k.log_piece(t * Vector3(-w * 0.5 - 0.25, top + 0.1, 0.0), t * Vector3(w * 0.5 + 0.25, top + 0.12, 0.0), 0.06, 7110, true, Color("#5a4232"))
	k.plank(t * Transform3D(Basis.IDENTITY, Vector3(0.0, top - board_h * 0.5, 0.0)), Vector3(w, board_h, 0.06), Color("#6e4527"), 0, 0.02)
	k.paint(Color("#4d2f1a"), 0.8, 0.0, 0.0, CampKit.P.PLANK_X)
	k.rbox(t * Transform3D(Basis.IDENTITY, Vector3(0.0, top - board_h * 0.5, -0.005)), Vector3(w + 0.08, board_h + 0.08, 0.05), 0.02, 2)
	# Little ropes the board hangs from.
	for x in [-w * 0.35, w * 0.35]:
		k.rope(t * Vector3(x, top + 0.08, 0.035), t * Vector3(x, top - 0.02, 0.035), 0.0, 0.01)
	return [_box_shape(Vector3(w + 0.3, 0.25, 0.25), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.1, 0))),
		_cyl_shape(0.09, top, t * Transform3D(Basis.IDENTITY, Vector3(-w * 0.5 - 0.06, top * 0.5, 0))),
		_cyl_shape(0.09, top, t * Transform3D(Basis.IDENTITY, Vector3(w * 0.5 + 0.06, top * 0.5, 0)))]


## A small camp lantern (iron frame, glass that glows with the `lamp`
## instance uniform). Origin at the bottom; ~0.3 m tall with the handle.
static func lantern(k: CampKit, t: Transform3D) -> void:
	k.paint(Color("#2f3033"), 0.45, 0.7, 0.0, CampKit.P.IRON)
	k.cylinder(t * Vector3(0, 0.0, 0), t * Vector3(0, 0.035, 0), 0.075, 0.07, 14, true, 0.01)
	k.lathe(PackedVector2Array([Vector2(0.0, 0.2), Vector2(0.075, 0.2), Vector2(0.06, 0.24), Vector2(0.02, 0.26), Vector2(0.0, 0.265)]), t, 14)
	for i in 4:
		var a := TAU * float(i) / 4.0 + PI * 0.25
		k.cylinder(t * Vector3(cos(a) * 0.062, 0.03, sin(a) * 0.062), t * Vector3(cos(a) * 0.062, 0.205, sin(a) * 0.062), 0.006, 0.006, 5, false)
	k.torus(t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.27, 0)), 0.05, 0.005, 14, 4, PI)
	k.paint(Color("#ffe2a8"), 0.1, 0.0, 0.25, CampKit.P.GLASS)
	k.lathe(PackedVector2Array([Vector2(0.0, 0.035), Vector2(0.05, 0.035), Vector2(0.058, 0.1), Vector2(0.056, 0.17), Vector2(0.045, 0.2), Vector2(0.0, 0.2)]), t, 14)
