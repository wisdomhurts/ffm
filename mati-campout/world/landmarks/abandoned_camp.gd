class_name AbandonedCamp
extends LandmarkSite
## The Abandoned Campsite: somebody left in a hurry long ago. A collapsed
## A-frame tent with a broken ridge pole, a dome tent fallen into a torn
## heap, a cold fire pit with charred logs, a broken hand cart that lost a
## wheel, scattered crates and barrels, a sagging washing line with faded
## cloth, a soggy diary to read, a faded "Camp Sunnyside" sign and the old
## common chest. A little eerie, never scary: no bones or blood, just things
## left behind. Local frame: +Z toward the trail.

const CANVAS_OLIVE := Color("#7d7f58")
const CANVAS_RUST := Color("#a66a45")


func _init() -> void:
	far_range = 220.0
	near_range = 85.0


func build_site() -> void:
	_fire_pit()
	_collapsed_tent(Transform3D(Basis(Vector3.UP, 0.35), Vector3(-4.6, 0, -2.8)))
	_heap_tent(Vector3(4.2, 0, -3.4), -0.4)
	_cart_and_clutter()
	_washing_line(Vector3(5.0, 0, 0.8), Vector3(7.2, 0, 5.6))
	_lean_to(Vector3(-8.1, 0, -5.7), 0.5)
	_canoe(Vector3(6.6, 0, -6.4), -0.3)
	_broken_table(Vector3(2.6, 0, 6.9), 0.35)
	_flagpole(Vector3(1.6, 0, -7.6))
	sign_board(Vector3(-2.6, 0, 8.4), 0.15, "Camp\nSunnyside", Color("#7a6a52"), 1.4, 1.6, Color(0.93, 0.88, 0.74))
	chest_spot(Vector3(-0.9, gy(-0.9, -5.0), -5.0), 0.2, Vector3(-0.9, 0.0, -3.6))
	zone(-0.9, -5.0, 0.7)


func _fire_pit() -> void:
	var t := lxf(0.0, 0.0, 0.0, 0.6)
	LandmarkProps.stone_ring(detail, t, 0.62, 10, 9000)
	LandmarkProps.charred_logs(detail, t, 9010, 0.0)
	# A toppled cooking pot.
	var pt := lxf(0.95, 0.45, 0.0, 0.2) * Transform3D(Basis(Vector3.FORWARD, 1.35), Vector3(0.0, 0.13, 0.0))
	detail.paint(Color("#38383b"), 0.6, 0.4, 0.0, MeshKit.Pat.RUST)
	detail.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.13, 0.01), Vector2(0.16, 0.08), Vector2(0.155, 0.2), Vector2(0.145, 0.2),
		Vector2(0.145, 0.03), Vector2(0.0, 0.025)]), pt, 14)
	# Log benches: one sound, one rotted and sunk.
	add_shapes(CampProps.log_bench(detail, lxf(0.0, 2.4, 0.15, 0.9), 2.0, 9020))
	zone(0.0, 2.4, 1.0)
	var rot := lxf(-2.3, -0.4, PI * 0.5 + 0.2, 0.8) * Transform3D(Basis.IDENTITY, Vector3(0, -0.07, 0))
	detail.log_piece(rot * Vector3(-0.9, 0.17, 0), rot * Vector3(0.9, 0.15, 0), 0.19, 9030, true, Color("#4f4234"), Color("#8a7458"))
	add_shapes([LandmarkProps.cyl_shape(0.2, 1.8, rot * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0, 0.17, 0)))])
	zone(-2.3, -0.4, 0.9)
	add_shapes(CampProps.stump_seat(detail, lxf(2.1, -1.3, 0.0, 0.3), 0.24, 0.38, 9040))
	zone(2.1, -1.3, 0.35)
	zone(0.0, 0.0, 0.8)


## An A-frame tent whose rear pole gave way: the ridge slopes to the
## ground, the canvas sags and is torn in places. Local X = tent length.
func _collapsed_tent(t: Transform3D) -> void:
	var g := gmin(t.origin.x, t.origin.z, 1.6)
	t.origin.y = g
	var length := 3.3
	var front_h := 1.8
	var noise := FastNoiseLite.new()
	noise.seed = 9100
	noise.frequency = 1.0
	var ridge := func(u: float) -> Vector3:
		# Broken in the middle: the front half still slopes up to the
		# standing pole, the rear half has dropped to the ground.
		var x := lerpf(-length * 0.5, length * 0.5, u)
		var h_mid := 1.15
		var h := lerpf(h_mid, front_h, (u - 0.5) * 2.0) if u >= 0.5 else lerpf(0.16, h_mid, pow(u * 2.0, 1.6))
		return Vector3(x, h, 0.0)
	for side in [-1.0, 1.0]:
		var sd: float = side
		var f := func(u: float, v: float) -> Vector3:
			var r: Vector3 = ridge.call(u)
			var w := 1.2 + 0.4 * (1.0 - u)
			var edge := Vector3(r.x + (0.15 * (1.0 - u)), 0.04, sd * w)
			var p := r.lerp(edge, v)
			p.y -= sin(v * PI) * 0.12 * (0.5 + u)
			p.y = maxf(p.y, 0.03)
			return t * p
		var keep := func(u: float, v: float) -> bool:
			var n := noise.get_noise_2d(u * 5.0 + sd * 3.0, v * 3.5)
			if v > 0.88 and noise.get_noise_2d(u * 12.0, sd * 5.0) > 0.15:
				return false
			return n < 0.42
		var fl := func(u: float, v: float) -> float:
			return smoothstep(0.0, 0.4, v) * (0.3 + 0.7 * u) * 0.8
		big_cloth.paint(CANVAS_OLIVE.lerp(Color("#8a8a6a"), 0.3 if sd > 0.0 else 0.0), 0.95, 0.0, 0.0, CampKit.P.CANVAS)
		big_cloth.torn_surface(f, 14, 7, keep, fl)
	# Front pole (still standing), the broken ridge pole, the fallen rear pole.
	var pole := Color("#7d6447")
	big.log_piece(t * Vector3(length * 0.5 + 0.02, -0.1, 0), t * Vector3(length * 0.5 + 0.02, front_h + 0.08, 0), 0.03, 9110, true, pole)
	var r_mid: Vector3 = ridge.call(0.5)
	big.log_piece(t * Vector3(length * 0.5, front_h + 0.03, 0), t * (r_mid + Vector3(0, 0.03, 0)), 0.025, 9111, true, pole)
	big.log_piece(t * (r_mid + Vector3(0.05, 0.0, 0.04)), t * Vector3(-length * 0.5, 0.16, 0.05), 0.025, 9112, true, pole)
	big.log_piece(t * Vector3(-length * 0.5 - 0.2, 0.03, 0.4), t * Vector3(-length * 0.5 + 0.9, 0.03, 0.95), 0.028, 9113, true, pole)
	# Guy ropes, one still pegged.
	big.rope(t * Vector3(length * 0.5 + 0.02, front_h, 0), t * Vector3(length * 0.5 + 1.3, 0.02, 0.0), 0.06, 0.006)
	big.paint(Color("#8a7458"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	big.cylinder(t * Vector3(length * 0.5 + 1.3, -0.05, 0.0), t * Vector3(length * 0.5 + 1.32, 0.12, 0.0), 0.02, 0.015, 6, true)
	var c := t.origin
	add_shapes([LandmarkProps.box_shape(Vector3(length, 1.0, 2.2), t * Transform3D(Basis.IDENTITY, Vector3(0.3, 0.5, 0)))])
	zone(c.x, c.z, 2.0)


## A dome tent fallen into a lumpy, torn heap with two bent poles.
func _heap_tent(c: Vector3, yaw_l: float) -> void:
	var t := lxf(c.x, c.z, yaw_l, 1.3)
	var noise := FastNoiseLite.new()
	noise.seed = 9200
	noise.frequency = 1.2
	var f := func(u: float, v: float) -> Vector3:
		var a := u * TAU
		var r := v
		var h := 0.78 * (1.0 - r * r) + noise.get_noise_2d(cos(a) * r * 2.0, sin(a) * r * 2.0) * 0.2 * (1.0 - r)
		return t * Vector3(cos(a) * r * 1.7, maxf(h, 0.02) + 0.02, sin(a) * r * 1.4)
	var keep := func(u: float, v: float) -> bool:
		return not (noise.get_noise_2d(u * 9.0 + 20.0, v * 4.0) > 0.5 and v > 0.3)
	var fl := func(_u: float, v: float) -> float:
		return smoothstep(0.5, 1.0, v) * 0.6
	big_cloth.paint(CANVAS_RUST, 0.95, 0.0, 0.0, CampKit.P.CANVAS)
	big_cloth.torn_surface(f, 20, 6, keep, fl)
	# Bent poles poking out.
	big.paint(Color("#4a4a4f"), 0.5, 0.6, 0.0, CampKit.P.IRON)
	for i in 2:
		var a := 0.6 + float(i) * 2.2
		var pts := PackedVector3Array()
		var radii := PackedFloat32Array()
		for k in 7:
			var s := float(k) / 6.0
			var r := lerpf(0.5, 2.0, s)
			pts.append(t * Vector3(cos(a + s * 0.3) * r, 0.7 * sin(s * PI * 0.8) + 0.25 - s * 0.2, sin(a + s * 0.3) * r * 0.8))
			radii.append(0.012)
		big.tube(pts, radii, 5, true)
	add_shapes([LandmarkProps.cyl_shape(1.35, 0.8, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0)))])
	zone(c.x, c.z, 1.7)


func _cart_and_clutter() -> void:
	add_shapes(LandmarkProps.cart(big, lxf(-6.3, 3.4, 0.75, 1.2), 9300, true))
	zone(-6.3, 3.4, 1.4)
	add_shapes(LandmarkProps.sack(detail, lxf(-5.0, 4.6, 0.4, 0.3) * Transform3D(Basis(Vector3.FORWARD, 1.2), Vector3(0, 0.22, 0)), 9310, Color("#a08c66")))
	zone(-5.0, 4.6, 0.35)
	add_shapes(LandmarkProps.crate(detail, lxf(-2.8, 4.4, 0.5, 0.45), Vector3(0.7, 0.55, 0.6), 9320, true, Color("#8a7458")))
	zone(-2.8, 4.4, 0.5)
	var note := LandmarkNote.new("Read the soggy diary", notes_for("abandoned_camp"))
	note.position = Vector3(-2.8, gy(-2.8, 4.4) + 0.7, 4.4)
	add_child(note)
	LandmarkProps.block(detail, lxf(-2.75, 4.35, 0.3, 0.3) * Transform3D(Basis(Vector3.BACK, 0.05), Vector3(0, 0.58, 0)), Vector3(0.22, 0.04, 0.3), Color("#6b3b2c"), MeshKit.Pat.LEATHER, 0.8)
	# A crate stack with a dead lantern on top.
	var st := lxf(3.0, 4.6, -0.3, 0.5)
	add_shapes(LandmarkProps.crate(detail, st, Vector3(0.8, 0.62, 0.7), 9330, false, Color("#8d7a62")))
	var st2 := st * Transform3D(Basis(Vector3.UP, 0.5), Vector3(0.05, 0.66, 0.0))
	LandmarkProps.crate(detail, st2, Vector3(0.55, 0.42, 0.48), 9331, false, Color("#7d6a52"))
	LandmarkProps.lantern(detail, st2 * Transform3D(Basis(Vector3.BACK, 0.12), Vector3(0.1, 0.45, 0.05)), false)
	zone(3.0, 4.6, 0.6)
	# Barrels: one standing, one lying in the grass.
	add_shapes(LandmarkProps.barrel(detail, lxf(-6.7, -0.3, 0.3, 0.32), 9340, 0.9, 0.3, Color("#6f5a42")))
	zone(-6.7, -0.3, 0.4)
	add_shapes(LandmarkProps.barrel_lying(detail, lxf(1.6, -5.4, 0.9, 0.6), 9341))
	zone(1.6, -5.4, 0.6)
	# Loose planks and a forgotten boot... and a bucket.
	for i in 4:
		var px := -1.6 + float(i) * 0.5
		var pz := 6.0 + sin(float(i) * 2.3) * 0.4
		var pt := lxf_tilt(px, pz, 0.6 + float(i) * 0.7, 0.4, 0.02)
		LandmarkProps.slat(detail, pt, Vector3(1.1, 0.03, 0.14), Color("#8d7a62").darkened(0.1 * float(i % 2)))
	add_shapes(CampProps.bucket(detail, lxf(2.6, 1.8, 0.0, 0.25) * Transform3D(Basis(Vector3.FORWARD, 1.5), Vector3(0, 0.21, 0))))
	zone(2.6, 1.8, 0.3)


## Two posts and a sagging line with faded laundry flapping in the wind.
func _washing_line(a: Vector3, b: Vector3) -> void:
	var top := 1.9
	var pa := Vector3(a.x, gmin(a.x, a.z, 0.2), a.z)
	var pb := Vector3(b.x, gmin(b.x, b.z, 0.2), b.z)
	for p in [pa, pb]:
		var pv: Vector3 = p
		detail.log_piece(pv + Vector3(0, -0.3, 0), pv + Vector3(0, top + 0.15, 0), 0.05, 9400 + int(pv.x), true, Color("#6b5a46"))
		add_shapes([LandmarkProps.cyl_shape(0.08, top, Transform3D(Basis.IDENTITY, pv + Vector3(0, top * 0.5, 0)))])
		zone(pv.x, pv.z, 0.3)
	# The second post leans a little (tired old line).
	var ta := pa + Vector3(0, top, 0)
	var tb := pb + Vector3(0, top - 0.12, 0)
	var sag := 0.38
	detail.rope(ta, tb, sag, 0.007, Color("#b8a888"), 14)
	var line := func(s: float) -> Vector3:
		return ta.lerp(tb, s) + Vector3(0, -sag * 4.0 * s * (1.0 - s), 0)
	var items := [[0.14, 0.62, 0.75, "#c4ab82"], [0.33, 0.7, 0.62, "#7f9aa8"], [0.5, 0.16, 0.38, "#c98a7a"],
		[0.57, 0.16, 0.36, "#c98a7a"], [0.76, 1.05, 0.85, "#a8b07a"]]
	var along := (tb - ta)
	along.y = 0.0
	along = along.normalized()
	var out := Vector3(-along.z, 0, along.x)
	for it in items:
		var s: float = it[0]
		var w: float = it[1]
		var h: float = it[2]
		var c := Color(str(it[3]))
		var p0: Vector3 = line.call(s - w * 0.5 / ta.distance_to(tb))
		var p1: Vector3 = line.call(s + w * 0.5 / ta.distance_to(tb))
		detail_cloth.paint(c, 0.95, 0.0, 0.0, CampKit.P.FABRIC)
		detail_cloth.sheet(p0 + Vector3(0, -0.01, 0), p1 + Vector3(0, -0.01, 0), p0 + Vector3(0, -h, 0) + out * 0.05, p1 + Vector3(0, -h, 0) + out * 0.05,
			4, 4, 0.04, out, 1.0, 1)
		# Clothes pegs.
		for q in [p0, p1]:
			var qv: Vector3 = q
			LandmarkProps.block(detail, Transform3D(Basis.IDENTITY, qv + Vector3(0, -0.02, 0)), Vector3(0.025, 0.08, 0.03), Color("#c9b08a"), CampKit.P.PLANK_Y, 0.8)


## A torn tarp lean-to: two leaning poles, a cross pole, a faded blue tarp
## half fallen down.
func _lean_to(c: Vector3, yaw_l: float) -> void:
	var t := lxf(c.x, c.z, yaw_l, 1.4)
	var pole := Color("#6b5a46")
	for x in [-1.3, 1.3]:
		big.log_piece(t * Vector3(x, -0.2, 0.9), t * Vector3(x * 0.95, 1.75, 0.55), 0.045, 9500 + int(x), true, pole)
	big.log_piece(t * Vector3(-1.5, 1.72, 0.56), t * Vector3(1.5, 1.68, 0.56), 0.04, 9502, true, pole)
	var noise := FastNoiseLite.new()
	noise.seed = 9510
	noise.frequency = 1.0
	var f := func(u: float, v: float) -> Vector3:
		var x := lerpf(-1.45, 1.45, u)
		var top := Vector3(x, 1.7, 0.6)
		var bottom := Vector3(x, 0.03, -1.2)
		var p := top.lerp(bottom, v)
		p.y -= sin(v * PI) * 0.18
		# The right half has torn loose and droops.
		p.y -= smoothstep(0.55, 1.0, u) * sin(v * PI * 0.5) * 0.5
		p.y = maxf(p.y, 0.03)
		return t * p
	var keep := func(u: float, v: float) -> bool:
		return noise.get_noise_2d(u * 6.0, v * 4.0) < 0.38
	var fl := func(_u: float, v: float) -> float:
		return smoothstep(0.0, 0.5, v) * 0.9
	big_cloth.paint(Color("#5d7f95"), 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	big_cloth.torn_surface(f, 10, 6, keep, fl)
	add_shapes([LandmarkProps.box_shape(Vector3(2.8, 1.2, 0.3), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.6, 0.7)))])
	zone(c.x, c.z, 1.6)


## An old canoe lying upside down on two stumps.
func _canoe(c: Vector3, yaw_l: float) -> void:
	var t := lxf(c.x, c.z, yaw_l, 1.8)
	for x in [-1.1, 1.1]:
		big.log_piece(t * Vector3(x, -0.1, 0), t * Vector3(x, 0.38, 0), 0.2, 9600 + int(x * 3.0), true)
	var length := 4.0
	var hw := func(u: float) -> float:
		return 0.42 * sqrt(maxf(1.0 - pow(absf(u * 2.0 - 1.0), 2.2), 0.0))
	# Upside down: the keel on top.
	var f := func(u: float, v: float) -> Vector3:
		var x := (u - 0.5) * length
		var phi := v * PI
		var w: float = hw.call(u)
		var rise := 0.18 * pow(absf(u * 2.0 - 1.0), 3.0)
		return t * Vector3(x, 0.42 + sin(phi) * 0.36 - rise, -cos(phi) * w)
	big_cloth.paint(Color("#9c4a32"), 0.75, 0.0, 0.0, CampKit.P.PAINT)
	big_cloth.surface(f, 20, 8)
	add_shapes([LandmarkProps.box_shape(Vector3(length, 0.8, 0.9), t * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0)))])
	zone(c.x, c.z, 2.1)


## A picnic table with a broken leg, slumped onto one end.
func _broken_table(c: Vector3, yaw_l: float) -> void:
	var t := lxf(c.x, c.z, yaw_l, 1.1) * Transform3D(Basis(Vector3.BACK, 0.2), Vector3(0, -0.12, 0))
	add_shapes(CampProps.picnic_table(detail, t))
	zone(c.x, c.z, 1.3)


## A tall flagpole with a torn, faded flag.
func _flagpole(c: Vector3) -> void:
	var g := gmin(c.x, c.z, 0.3)
	var base := Vector3(c.x, g, c.z)
	big.paint(Color("#8f8b84"), 0.5, 0.5, 0.0, MeshKit.Pat.RUST)
	big.cylinder(base + Vector3(0, -0.3, 0), base + Vector3(0, 5.2, 0), 0.05, 0.035, 8, true)
	big.sphere(base + Vector3(0, 5.25, 0), 0.07, 8, 5)
	for i in 3:
		var a := TAU * float(i) / 3.0
		big.stone(base + Vector3(cos(a) * 0.22, 0.05, sin(a) * 0.22), Vector3(0.14, 0.1, 0.12), 9700 + i, CampKit.STONE_COLOR, a, 0.2, 8, 5)
	var noise := FastNoiseLite.new()
	noise.seed = 9710
	noise.frequency = 1.0
	var f := func(u: float, v: float) -> Vector3:
		return base + Vector3(0.05 + u * 1.1, 4.95 - v * 0.7 - u * u * 0.12, sin(u * 3.0) * 0.06)
	var keep := func(u: float, v: float) -> bool:
		return not (u > 0.7 and noise.get_noise_2d(u * 8.0, v * 6.0) > 0.0)
	var fl := func(u: float, _v: float) -> float:
		return smoothstep(0.0, 0.3, u)
	big_cloth.paint(Color("#b98a52"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	big_cloth.torn_surface(f, 8, 4, keep, fl)
	add_shapes([LandmarkProps.cyl_shape(0.08, 5.0, Transform3D(Basis.IDENTITY, base + Vector3(0, 2.5, 0)))])
	zone(c.x, c.z, 0.35)
