class_name FernHollow
extends LandmarkSite
## Fern Hollow: a hidden mossy glade. The ruins of an old stone gateway
## (one pillar still carries half of its arch, the other has tumbled),
## crumbling low walls, fallen column drums, giant ferns, and clusters of
## softly glowing blue mushrooms (emissive, brighter at night, plus a soft
## blue light near the chest). The epic chest rests under the arch. Props
## are placed around the trees that grow here (Vegetation has no removal
## API). Local frame: +Z toward the trail.

const STONE := Color("#a29d90")


func _init() -> void:
	far_range = 160.0
	near_range = 80.0


## First local point from the candidates whose circle (r) is free of trunks
## and dry; falls back to the first candidate.
func _clear_spot(cands: Array, r: float) -> Vector3:
	for c in cands:
		var p: Vector3 = c
		if veg_clear(p.x, p.z, r) and is_dry(p.x, p.z):
			return p
	return cands[0]


func build_site() -> void:
	var cands: Array = []
	for ring in [4.5, 6.0, 3.5, 7.5]:
		for k in 9:
			var a := PI + (float(k) - 4.0) * 0.32
			cands.append(Vector3(sin(a) * float(ring), 0, cos(a) * float(ring)))
	var arch_c := _clear_spot(cands, 2.4)
	var arch_yaw := atan2(-arch_c.x, -arch_c.z)
	_arch(arch_c, arch_yaw)
	_walls(arch_c, arch_yaw)
	_drums()
	_ferns()
	_mushrooms(arch_c, arch_yaw)


## Stacked masonry pillar (local to t), `blocks` shaft courses; returns the top y.
func _pillar(t: Transform3D, blocks: int, seed_v: int, mossy: bool = true) -> float:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var m := 1.0 if mossy else 0.0
	LandmarkProps.block(big, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.12, 0)), Vector3(1.0, 0.5, 1.0), STONE.darkened(0.08), LandmarkKit.LP.MASONRY, 0.92, m, 0.04)
	var y := 0.37
	for i in blocks:
		var hgt := rng.randf_range(0.42, 0.52)
		var off := Vector3(rng.randf_range(-0.04, 0.04), y + hgt * 0.5, rng.randf_range(-0.04, 0.04))
		LandmarkProps.block(big, t * Transform3D(Basis(Vector3.UP, rng.randf_range(-0.06, 0.06)), off), Vector3(0.74, hgt - 0.02, 0.74), STONE.lerp(Color("#8f8a7e"), rng.randf()), LandmarkKit.LP.MASONRY, 0.92, m, 0.05)
		y += hgt
	return y


func _arch(c: Vector3, yaw_l: float) -> void:
	var t := lxf(c.x, c.z, yaw_l, 1.8, -0.15)
	var span := 1.35
	var left := t * Transform3D(Basis.IDENTITY, Vector3(-span, 0, 0))
	var right := t * Transform3D(Basis.IDENTITY, Vector3(span, 0, 0))
	var top := _pillar(left, 5, 12000)
	LandmarkProps.block(big, left * Transform3D(Basis.IDENTITY, Vector3(0, top + 0.12, 0)), Vector3(0.95, 0.24, 0.95), STONE, LandmarkKit.LP.MASONRY, 0.92, 1.0, 0.04)
	var rtop := _pillar(right, 3, 12010)
	# Half an arch on the standing pillar: voussoirs around a semicircle.
	var spring := top + 0.24
	var arch_r := span
	for i in 5:
		var a0 := PI - float(i) * PI / 9.0
		var a1 := PI - float(i + 1) * PI / 9.0
		var am := (a0 + a1) * 0.5
		var p := Vector3(cos(am) * (arch_r + 0.0), spring + sin(am) * arch_r, 0.0)
		var bb := Basis(Vector3.BACK, am - PI * 0.5)
		LandmarkProps.block(big, t * Transform3D(bb, p), Vector3(0.48, 0.62, 0.7), STONE.lerp(Color("#b3ae9f"), float(i % 2) * 0.4), LandmarkKit.LP.MASONRY, 0.92, 1.0, 0.04)
	# Tumbled blocks from the broken side.
	var rng := RandomNumberGenerator.new()
	rng.seed = 12020
	for i in 5:
		var p := Vector3(span + 0.7 + rng.randf_range(0.0, 1.4), 0.0, rng.randf_range(-0.9, 1.1))
		var w := t * p
		var y := gy(w.x, w.z)
		var lt := Transform3D(t.basis * Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.RIGHT, rng.randf_range(-0.3, 0.3)), Vector3(w.x, y + 0.18, w.z))
		LandmarkProps.block(detail, lt, Vector3(0.7, 0.45, 0.7) * rng.randf_range(0.75, 1.0), STONE.lerp(Color("#8f8a7e"), rng.randf()), LandmarkKit.LP.MASONRY, 0.92, 1.0, 0.05)
		add_shapes([LandmarkProps.box_shape(Vector3(0.6, 0.4, 0.6), lt)])
	# Flagstones under the arch.
	for i in 6:
		var p := t * Vector3(-0.9 + 0.6 * float(i % 3) + rng.randf_range(-0.05, 0.05), 0, -0.4 + 0.7 * float(i / 3))
		big.stone(Vector3(p.x, gy(p.x, p.z) + 0.01, p.z), Vector3(0.3, 0.05, 0.3), 12030 + i, STONE.darkened(0.15), rng.randf(), 0.1, 8, 4)
	# Collision: the two pillars.
	for p in [left, right]:
		var pt: Transform3D = p
		box(Vector3(0.85, (top if pt == left else rtop) + 0.4, 0.85), pt * Transform3D(Basis.IDENTITY, Vector3(0, ((top if pt == left else rtop) + 0.4) * 0.5 - 0.2, 0)))
	var lp := left.origin
	var rp := right.origin
	zone(lp.x, lp.z, 0.7)
	zone(rp.x, rp.z, 0.7)
	zone(c.x, c.z, 1.0)
	# The epic chest under the arch, facing the glade.
	var cpos := t * Vector3(0, 0, 0.15)
	chest_spot(Vector3(cpos.x, gmin(cpos.x, cpos.z, 0.5), cpos.z), yaw_l, Vector3(cpos.x, 0.0, cpos.z))
	lantern_light(t * Vector3(0.0, 0.9, 1.0), 0.8, 6.0, Color(0.45, 0.72, 1.0), false, "glow")


## Crumbling low walls either side of the gateway with gaps and moss.
func _walls(c: Vector3, yaw_l: float) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 12100
	var t := Transform3D(Basis(Vector3.UP, yaw_l), Vector3(c.x, 0, c.z))
	for s in [-1.0, 1.0]:
		var sd: float = s
		var x := sd * 2.1
		var segs := 7
		for i in segs:
			var lx := x + sd * float(i) * 0.82
			var lz := -0.2 * float(i) * float(i) * 0.1
			var w := t * Vector3(lx, 0, lz)
			if not veg_clear(w.x, w.z, 0.55):
				continue
			var courses := rng.randi_range(0, 2) + (1 if i < 3 else 0)
			var g := gmin(w.x, w.z, 0.4)
			for k in courses:
				var bh := 0.36
				var bt := Transform3D(t.basis * Basis(Vector3.UP, rng.randf_range(-0.05, 0.05)), Vector3(w.x, g + 0.17 + bh * float(k), w.z))
				LandmarkProps.block(big, bt, Vector3(0.78, bh - 0.02, 0.6), STONE.lerp(Color("#8f8a7e"), rng.randf()), LandmarkKit.LP.MASONRY, 0.92, 1.0, 0.05)
			if courses > 0:
				box(Vector3(0.8, 0.36 * courses + 0.2, 0.6), Transform3D(t.basis, Vector3(w.x, g + 0.18 * courses, w.z)))
				zone(w.x, w.z, 0.5)
			elif rng.randf() < 0.6:
				# A fallen block, half sunk in the moss.
				var bt := Transform3D(t.basis * Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.FORWARD, rng.randf_range(-0.25, 0.25)), Vector3(w.x + sd * 0.4, g + 0.1, w.z + 0.5))
				LandmarkProps.block(detail, bt, Vector3(0.7, 0.32, 0.55), STONE.darkened(0.1), LandmarkKit.LP.MASONRY, 0.92, 1.0, 0.05)


## Fallen column drums lying in the glade.
func _drums() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 12200
	var spots := [Vector3(3.6, 0, -1.5), Vector3(-3.8, 0, 2.2), Vector3(4.6, 0, 2.6), Vector3(-1.2, 0, 5.4)]
	var placed := 0
	for sp in spots:
		var p: Vector3 = sp
		if placed >= 3 or not veg_clear(p.x, p.z, 0.9) or Vector2(p.x, p.z).length() < 2.6:
			continue
		var yaw_d := rng.randf() * TAU
		var t := lxf(p.x, p.z, yaw_d, 0.7)
		var r := rng.randf_range(0.34, 0.42)
		var length := rng.randf_range(0.8, 1.2)
		big.paint(STONE.lerp(Color("#b3ae9f"), rng.randf()), 0.92, 1.0, 0.0, LandmarkKit.LP.MASONRY)
		big.lathe(PackedVector2Array([Vector2(0, 0), Vector2(r, 0), Vector2(r, 0), Vector2(r * 0.97, length), Vector2(r * 0.97, length), Vector2(0, length)]),
			t * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(-length * 0.5, r * 0.9, 0)), 14)
		box(Vector3(length, r * 1.8, r * 1.8), t * Transform3D(Basis.IDENTITY, Vector3(0, r * 0.9, 0)))
		zone(p.x, p.z, 0.7)
		placed += 1


func _ferns() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 12300
	var placed := 0
	for i in 40:
		if placed >= 9:
			break
		var a := rng.randf() * TAU
		var r := rng.randf_range(4.5, 11.0)
		var x := sin(a) * r
		var z := cos(a) * r
		if z > 3.0 and absf(x) < 2.5:
			continue  # keep the way in from the trail open
		if not veg_clear(x, z, 0.9) or not is_dry(x, z):
			continue
		var size := rng.randf_range(1.2, 1.9)
		LandmarkProps.giant_fern(detail_cloth, lxf(x, z, rng.randf() * TAU, 0.4, -0.05), 12310 + i, size, Color("#4b7a32").lerp(Color("#5d8a3a"), rng.randf()))
		placed += 1


func _mushrooms(arch_c: Vector3, yaw_l: float) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 12400
	var t := Transform3D(Basis(Vector3.UP, yaw_l), arch_c)
	var spots: Array = [t * Vector3(-1.9, 0, 0.6), t * Vector3(1.9, 0, 0.7), t * Vector3(-0.8, 0, 1.3), t * Vector3(0.9, 0, 1.4),
		t * Vector3(-3.2, 0, 0.4), t * Vector3(3.4, 0, 0.9)]
	# Also at the feet of the trees growing in the hollow.
	var veg: Variant = game.get("vegetation") if game else null
	if veg is Node and (veg as Node).has_method("obstacles_near"):
		for o in (veg as Node).call("obstacles_near", center, 11.0):
			var ov: Vector4 = o
			if ov.w > 0.9:
				continue
			var lp := to_local_point(Vector3(ov.x, ov.y, ov.z))
			var out := Vector3(lp.x, 0, lp.z).normalized() if Vector2(lp.x, lp.z).length() > 0.1 else Vector3.BACK
			spots.append(lp - out * (ov.w + 0.25))
			if spots.size() >= 13:
				break
	for i in spots.size():
		var p: Vector3 = spots[i]
		if not is_dry(p.x, p.z):
			continue
		LandmarkProps.glow_mushrooms(detail, lxf_tilt(p.x, p.z, rng.randf() * TAU, 0.3, -0.02), 12410 + i, rng.randi_range(3, 7), rng.randf_range(0.8, 1.3))
