class_name FirePit
extends RefCounted
## Procedural campfire structures for the three fire levels:
##   1 Stone Ring  - a ring of rounded stones around a teepee of logs
##   2 Hearth Fire - a wide two-course stone hearth with an iron grate
##   3 Beacon Fire - a stone plinth with a tall iron basket of stacked logs
## One mesh per level (stones, iron and charred logs share the camp material;
## the logs glow through the `ember_glow` instance uniform).

## Per level: ring radius, flame base height, light height, collider, interact
## radius, cooking rack stakes (x) and spit height, soot decal radius.
const CFG := {
	1: {"ring": 0.78, "base_y": 0.1, "light_y": 1.8, "col_r": 0.98, "col_h": 0.9, "interact": 2.6,
		"rack_x": 1.12, "rack_y": 1.05, "soot": 1.55},
	2: {"ring": 1.15, "base_y": 0.34, "light_y": 2.1, "col_r": 1.33, "col_h": 1.0, "interact": 2.95,
		"rack_x": 1.52, "rack_y": 1.24, "soot": 1.95},
	3: {"ring": 1.22, "base_y": 1.02, "light_y": 2.9, "col_r": 1.32, "col_h": 2.3, "interact": 3.2,
		"rack_x": 1.62, "rack_y": 1.98, "soot": 2.0},
}


static func cfg(level: int) -> Dictionary:
	return CFG[clampi(level, 1, 3)]


static func build(level: int) -> ArrayMesh:
	var k := CampKit.new()
	match clampi(level, 1, 3):
		1:
			_stone_ring(k)
		2:
			_hearth(k)
		3:
			_beacon(k)
	return CampKit.build_mesh(k)


static func _stone_ring(k: CampKit) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1101
	var n := 13
	var ring := 0.78
	for i in n:
		var a := TAU * (float(i) + rng.randf_range(-0.15, 0.15)) / n
		var rr := ring + rng.randf_range(-0.04, 0.04)
		var sz := Vector3(rng.randf_range(0.15, 0.2), rng.randf_range(0.11, 0.15), rng.randf_range(0.13, 0.17))
		var col := CampKit.STONE_COLOR.lerp(Color("#a39c90") if i % 3 == 0 else Color("#6f6c69"), rng.randf() * 0.6)
		k.stone(Vector3(cos(a) * rr, sz.y * 0.55, sin(a) * rr), sz, 300 + i, col, -a + PI * 0.5)
	# Teepee of charred sticks over two crossed base logs.
	k.ao = 0.85
	k.log_piece(Vector3(-0.42, 0.07, 0.12), Vector3(0.4, 0.08, -0.1), 0.07, 1201, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.log_piece(Vector3(-0.08, 0.13, -0.4), Vector3(0.12, 0.13, 0.42), 0.065, 1202, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	for i in 6:
		var a := TAU * float(i) / 6.0 + 0.4
		var foot := Vector3(cos(a) * 0.44, 0.04, sin(a) * 0.44)
		var top := Vector3(cos(a) * 0.05, 0.66 + 0.05 * float(i % 2), sin(a) * 0.05)
		k.log_piece(foot, top, 0.042 + 0.008 * float(i % 3), 1210 + i, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.ao = 1.0


static func _hearth(k: CampKit) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 2201
	var ring := 1.15
	# Two courses of flattish fitted stones, offset like brickwork, plus a top course.
	for course in 3:
		var n := 16
		var y := 0.1 + 0.15 * course
		var rr := ring - 0.03 * course
		for i in n:
			var a := TAU * (float(i) + 0.5 * float(course % 2) + rng.randf_range(-0.08, 0.08)) / n
			var sz := Vector3(0.25, 0.09 if course < 2 else 0.07, 0.19) * rng.randf_range(0.92, 1.08)
			var col := Color("#9a958c").lerp(Color("#7a756f"), rng.randf())
			k.stone(Vector3(cos(a) * rr, y, sin(a) * rr), sz, 2300 + course * 40 + i, col, -a + PI * 0.5, 0.12, 12, 6)
	# Iron grate: frame ring, cross bars and four legs.
	k.paint(CampKit.IRON_COLOR, 0.55, 0.6, 0.0, CampKit.P.IRON)
	var gy := 0.52
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0, gy, 0)), 0.82, 0.024, 36, 6)
	for i in 9:
		var x := -0.68 + 0.17 * i
		var half := sqrt(maxf(0.82 * 0.82 - x * x, 0.0))
		k.cylinder(Vector3(x, gy, -half), Vector3(x, gy, half), 0.016, 0.016, 6, true)
	k.cylinder(Vector3(-0.82, gy - 0.01, 0), Vector3(0.82, gy - 0.01, 0), 0.02, 0.02, 6, true)
	for i in 4:
		var a := TAU * float(i) / 4.0 + PI * 0.25
		var top := Vector3(cos(a) * 0.8, gy, sin(a) * 0.8)
		var foot := Vector3(cos(a) * 0.86, 0.0, sin(a) * 0.86)
		k.cylinder(foot, top, 0.026, 0.022, 6, true)
	# Log-cabin stack under the grate.
	k.ao = 0.85
	for layer in 2:
		var y := 0.1 + 0.12 * layer
		for side in [-1.0, 1.0]:
			var s: float = side
			if layer == 0:
				k.log_piece(Vector3(-0.5, y, 0.24 * s), Vector3(0.5, y, 0.22 * s), 0.07, 2400 + layer * 2 + int(s), true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
			else:
				k.log_piece(Vector3(0.22 * s, y, -0.48), Vector3(0.24 * s, y, 0.5), 0.065, 2410 + int(s), true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.log_piece(Vector3(-0.3, 0.33, -0.25), Vector3(0.28, 0.38, 0.3), 0.06, 2420, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.ao = 1.0


static func _beacon(k: CampKit) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3301
	# Stone plinth: an eight-sided dressed block with a rim of boulders.
	k.paint(Color("#8f8a82"), 0.9, 0.0, 0.0, CampKit.P.STONE)
	k.cylinder(Vector3(0, 0.0, 0), Vector3(0, 0.44, 0), 1.08, 1.0, 8, true, 0.06)
	k.paint(Color("#a29d94"), 0.9, 0.0, 0.0, CampKit.P.STONE)
	k.cylinder(Vector3(0, 0.42, 0), Vector3(0, 0.5, 0), 0.92, 0.88, 8, true, 0.03)
	for i in 14:
		var a := TAU * (float(i) + rng.randf_range(-0.2, 0.2)) / 14.0
		var sz := Vector3(rng.randf_range(0.16, 0.22), rng.randf_range(0.12, 0.17), rng.randf_range(0.14, 0.18))
		k.stone(Vector3(cos(a) * 1.18, sz.y * 0.5, sin(a) * 1.18), sz, 3400 + i, Color("#857f78").lerp(Color("#a8a297"), rng.randf()), -a + PI * 0.5)
	# Iron basket on four curved legs.
	k.paint(CampKit.IRON_COLOR, 0.5, 0.65, 0.0, CampKit.P.IRON)
	var y0 := 0.5
	var yb := 0.86
	var yt := 1.5
	for i in 4:
		var a := TAU * float(i) / 4.0 + PI * 0.25
		var pts := PackedVector3Array([
			Vector3(cos(a) * 0.62, y0, sin(a) * 0.62),
			Vector3(cos(a) * 0.5, y0 + 0.18, sin(a) * 0.5),
			Vector3(cos(a) * 0.46, yb, sin(a) * 0.46)])
		k.tube(pts, PackedFloat32Array([0.035, 0.03, 0.03]), 6, true)
	for i in 14:
		var a := TAU * float(i) / 14.0
		var p0 := Vector3(cos(a) * 0.44, yb, sin(a) * 0.44)
		var p1 := Vector3(cos(a) * 0.62, (yb + yt) * 0.5, sin(a) * 0.62)
		var p2 := Vector3(cos(a) * 0.74, yt, sin(a) * 0.74)
		k.tube(PackedVector3Array([p0, p1, p2]), PackedFloat32Array([0.016, 0.016, 0.016]), 5, true)
		# Little curls on top of every other bar.
		if i % 2 == 0:
			var out := Vector3(cos(a), 0, sin(a))
			var t := Transform3D(Basis(out.cross(Vector3.UP).normalized(), -0.2) * Basis.looking_at(out.cross(Vector3.UP), Vector3.UP), p2 + out * 0.05 + Vector3(0, 0.06, 0))
			k.torus(t * Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO), 0.055, 0.012, 12, 5, PI * 1.4)
	for ring in [[yb, 0.44, 0.03], [(yb + yt) * 0.5, 0.62, 0.022], [yt, 0.74, 0.03]]:
		var arr: Array = ring
		k.torus(Transform3D(Basis.IDENTITY, Vector3(0, float(arr[0]), 0)), float(arr[1]), float(arr[2]), 32, 6)
	k.cylinder(Vector3(0, yb - 0.02, 0), Vector3(0, yb + 0.02, 0), 0.46, 0.46, 20, true)
	# Stacked logs inside, poking above the rim.
	k.ao = 0.85
	for i in 7:
		var a := TAU * float(i) / 7.0 + 0.3
		var foot := Vector3(cos(a) * 0.36, yb + 0.05, sin(a) * 0.36)
		var top := Vector3(cos(a) * 0.12, yt + 0.12 + 0.08 * float(i % 3), sin(a) * 0.12)
		k.log_piece(foot, top, 0.055 + 0.01 * float(i % 2), 3500 + i, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.log_piece(Vector3(-0.32, yb + 0.12, 0.05), Vector3(0.33, yb + 0.14, -0.04), 0.07, 3520, true, CampKit.BARK_COLOR, CampKit.WOOD_COLOR, true)
	k.ao = 1.0
