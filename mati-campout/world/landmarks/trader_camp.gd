class_name TraderCamp
extends LandmarkSite
## The three trader camps (visual sets; the traders themselves are NPCs from
## another system who stand at the landmark centre, so a 2.5 m circle there
## is always kept clear):
##   "rosie"  Rosie's Rest: a cosy canvas cabin-tent on a plank deck with a
##            porch, a stew pot over glowing embers, a bench, flower pots,
##            firewood and a lantern post.
##   "pip"    Pip's Dock: a gangway down the bank and a plank dock into the
##            lake, a moored rowboat, fishing rods, a net drying frame,
##            fish crates and a lantern post.
##   "bram"   Bram's Dig: mine-cart tracks climbing to a timber-framed adit in
##            the ridge foot, a cart of ore, pickaxes, ore bags, a spoil heap
##            with a shovel, a lean-to and a lantern.
## Local frame: +Z toward the trail.

const CLEAR := 2.5

var style := "rosie"


func _init(p_style: String = "rosie") -> void:
	style = p_style
	keep_clear = CLEAR
	far_range = 200.0
	near_range = 85.0
	marker_kind = "trader"


func build_site() -> void:
	match style:
		"pip":
			_pip()
		"bram":
			_bram()
		_:
			_rosie()


# =============================================================================
# Rosie's Rest
# =============================================================================

func _rosie() -> void:
	var tent_z := -5.8
	_cabin_tent(Vector3(0, 0, tent_z))
	# Stew pot over glowing embers.
	var pot := lxf(3.5, -1.2, 0.3, 0.8)
	add_shapes(LandmarkProps.cooking_tripod(detail, pot, 9500))
	lantern_light(pot * Vector3(0, 0.35, 0), 0.7, 4.5, Color(1.0, 0.55, 0.25))
	zone(3.5, -1.2, 0.85)
	# Bench facing the trader spot, with a pot of flowers at its end.
	var bench_t := lxf(-3.5, -0.6, PI * 0.5 + 0.25, 0.8)
	add_shapes(LandmarkProps.bench(detail, bench_t, 1.6, Color("#a07a52")))
	zone(-3.5, -0.6, 0.9)
	LandmarkProps.flower_pot(detail, bench_t * Transform3D(Basis.IDENTITY, Vector3(0.68, 0.47, 0.0)), 9510, Color("#e8566b"))
	# Flower pots by the deck steps and along the front.
	var flowers := [[-1.2, tent_z + 2.95, "#f2c84b"], [1.2, tent_z + 2.95, "#9a6bd1"], [-2.35, tent_z + 2.9, "#e8566b"], [2.4, tent_z + 2.85, "#f39b4a"]]
	for i in flowers.size():
		var fx: float = flowers[i][0]
		var fz: float = flowers[i][1]
		add_shapes(LandmarkProps.flower_pot(detail, lxf(fx, fz, float(i), 0.2), 9520 + i, Color(str(flowers[i][2]))))
		zone(fx, fz, 0.25)
	# Firewood stack beside the tent.
	add_shapes(CampProps.firewood_stack(detail, lxf(-3.4, tent_z + 0.4, PI * 0.5, 0.9), 9530))
	zone(-3.4, tent_z + 0.4, 0.9)
	# Lantern post by the path, sign.
	var lp := LandmarkProps.lantern_post(detail, lxf(2.9, 2.7, PI, 0.2), 9540, true, 2.2)
	add_shapes(lp["shapes"])
	lantern_light(lp["flame"], 1.0, 6.0)
	zone(2.9, 2.7, 0.3)
	sign_board(Vector3(-2.7, 0, 3.9), 0.35, "Rosie's\nRest", Color("#8a3b33"), 1.3, 1.6)
	# A cosy little table with mugs by the bench.
	var tt := lxf(-3.6, 1.2, 0.2, 0.4)
	CampProps.stump_seat(detail, tt, 0.28, 0.5, 9550)
	CampProps.mug(detail, tt * Transform3D(Basis.IDENTITY, Vector3(-0.08, 0.5, 0.05)), Color("#b5483a"))
	CampProps.mug(detail, tt * Transform3D(Basis(Vector3.UP, 1.4), Vector3(0.1, 0.5, -0.06)), Color("#3f6e8f"))
	add_shapes([LandmarkProps.cyl_shape(0.3, 0.5, tt * Transform3D(Basis.IDENTITY, Vector3(0, 0.25, 0)))])
	zone(-3.6, 1.2, 0.35)


## Canvas wall tent on a raised plank deck with a porch awning; door flaps
## tied open, a warm lantern inside. Door faces +Z.
func _cabin_tent(c: Vector3) -> void:
	var w := 3.4          # width (x)
	var d := 3.0          # depth (z)
	var deck_h := 0.32
	var wall_h := 1.75
	var ridge_h := 2.9
	var deck_w := w + 0.6
	var deck_d := d + 1.2  # porch in front
	var g := gmin(c.x, c.z, 2.4)
	var base := Vector3(c.x, g, c.z)
	var t := Transform3D(Basis.IDENTITY, base)
	# Deck: joists on stone footings, planks across, two steps in front.
	for x in [-deck_w * 0.5 + 0.15, 0.0, deck_w * 0.5 - 0.15]:
		var xx: float = x
		big.beam(t * Vector3(xx, deck_h - 0.12, -d * 0.5 - 0.1), t * Vector3(xx, deck_h - 0.12, d * 0.5 + 1.1), 0.12, 0.16, Color("#6e4c30"))
		for zz in [-d * 0.5, d * 0.5 + 1.0]:
			var fz: float = zz
			var gp := gy(c.x + xx, c.z + fz) - g
			big.stone(t * Vector3(xx, gp + 0.05, fz), Vector3(0.2, 0.16, 0.2), 9600 + int(xx * 5.0 + fz), Color("#8b877f"), 0.0, 0.2, 8, 5)
			big.log_piece(t * Vector3(xx, gp - 0.2, fz), t * Vector3(xx, deck_h - 0.15, fz), 0.07, 9610, true, Color("#5a4232"))
	var n := 16
	var z0 := -d * 0.5 - 0.1
	for i in n:
		var z := z0 + (float(i) + 0.5) * deck_d / n
		LandmarkProps.slat(big, t * Transform3D(Basis.IDENTITY, Vector3(0, deck_h, z)), Vector3(deck_w, 0.05, deck_d / n - 0.012), Color("#b08658").lerp(Color("#9a7550"), float(i % 3) * 0.35))
	for i in 2:
		var sh := deck_h * float(2 - i) / 3.0
		LandmarkProps.slat(big, t * Transform3D(Basis.IDENTITY, Vector3(0, sh - 0.02, z0 + deck_d + 0.17 + 0.3 * i)), Vector3(1.4, 0.05, 0.3), Color("#9a7550"))
	box(Vector3(deck_w, deck_h + 0.4, deck_d), t * Transform3D(Basis.IDENTITY, Vector3(0, deck_h * 0.5 - 0.2, z0 + deck_d * 0.5)))
	box_between(t * Vector3(0, gy(c.x, c.z + z0 + deck_d + 0.65) - g - 0.04, z0 + deck_d + 0.65), t * Vector3(0, deck_h - 0.04, z0 + deck_d - 0.05), 1.4, 0.1)
	# Canvas: roof, side walls, back wall with gable, front with the door.
	var y0 := deck_h + 0.02
	var hw := w * 0.5
	var hd := d * 0.5
	var cream := Color("#e6d9b8")
	big_cloth.paint(cream, 0.95, 0.0, 0.0, CampKit.P.CANVAS)
	for s in [-1.0, 1.0]:
		var sd: float = s
		# Roof slope (front/back eaves overhang a little).
		big_cloth.sheet(t * Vector3(0, ridge_h, -hd - 0.15), t * Vector3(0, ridge_h, hd + 0.15),
			t * Vector3(sd * (hw + 0.18), wall_h + y0 - 0.06, -hd - 0.15), t * Vector3(sd * (hw + 0.18), wall_h + y0 - 0.06, hd + 0.15),
			6, 4, 0.05, Vector3.DOWN, 0.3, 15, Vector3(sd, 1.0, 0.0))
		# Side wall.
		big_cloth.sheet(t * Vector3(sd * hw, wall_h + y0, -hd), t * Vector3(sd * hw, wall_h + y0, hd),
			t * Vector3(sd * hw, y0, -hd), t * Vector3(sd * hw, y0, hd), 6, 3, 0.03, Vector3(-sd, 0, 0), 0.5, 15, Vector3(sd, 0, 0))
	# Back wall + gable.
	big_cloth.sheet(t * Vector3(-hw, wall_h + y0, -hd), t * Vector3(hw, wall_h + y0, -hd), t * Vector3(-hw, y0, -hd), t * Vector3(hw, y0, -hd),
		6, 3, 0.03, Vector3(0, 0, 1), 0.4, 15, Vector3(0, 0, -1))
	big_cloth.tri_panel(t * Vector3(0, ridge_h, -hd), t * Vector3(-hw, wall_h + y0, -hd), t * Vector3(hw, wall_h + y0, -hd), 3, 0.0, Vector3.ZERO, Vector3(0, 0, -1))
	# Front: wall panels either side of the door, gable above.
	var door := 0.55
	for s in [-1.0, 1.0]:
		var sd: float = s
		big_cloth.sheet(t * Vector3(sd * hw, wall_h + y0, hd), t * Vector3(sd * door, wall_h + y0 + 0.25, hd), t * Vector3(sd * hw, y0, hd), t * Vector3(sd * door, y0, hd),
			3, 3, 0.02, Vector3(0, 0, -1), 0.4, 15, Vector3(0, 0, 1))
		# Rolled, tied-back door flaps.
		big_cloth.paint(cream.darkened(0.08), 0.95, 0.0, 0.0, CampKit.P.CANVAS)
		big_cloth.cylinder(t * Vector3(sd * (door + 0.08), y0 + 0.3, hd + 0.08), t * Vector3(sd * (door + 0.05), ridge_h - 0.25, hd + 0.08), 0.1, 0.07, 8, true, 0.03)
		big_cloth.paint(cream, 0.95, 0.0, 0.0, CampKit.P.CANVAS)
		detail.rope(t * Vector3(sd * (door + 0.08), 1.2 + y0, hd + 0.2), t * Vector3(sd * (door + 0.08), 1.2 + y0, hd - 0.02), 0.0, 0.012)
	big_cloth.tri_panel(t * Vector3(0, ridge_h, hd), t * Vector3(-hw, wall_h + y0, hd), t * Vector3(hw, wall_h + y0, hd), 3, 0.0, Vector3.ZERO, Vector3(0, 0, 1))
	# Rust trim along the eaves.
	big_cloth.paint(Color("#a24a33"), 0.95, 0.0, 0.0, CampKit.P.FABRIC)
	for s in [-1.0, 1.0]:
		var sd: float = s
		big_cloth.sheet(t * Vector3(sd * (hw + 0.18), wall_h + y0 - 0.06, -hd - 0.15), t * Vector3(sd * (hw + 0.18), wall_h + y0 - 0.06, hd + 0.15),
			t * Vector3(sd * (hw + 0.2), wall_h + y0 - 0.26, -hd - 0.15), t * Vector3(sd * (hw + 0.2), wall_h + y0 - 0.26, hd + 0.15), 8, 1, 0.0, Vector3.ZERO, 0.8, 7, Vector3(sd, 0, 0))
	# Porch awning on two poles.
	big_cloth.paint(Color("#c9824f"), 0.95, 0.0, 0.0, CampKit.P.CANVAS)
	big_cloth.sheet(t * Vector3(-hw * 0.8, ridge_h - 0.45, hd), t * Vector3(hw * 0.8, ridge_h - 0.45, hd),
		t * Vector3(-hw * 0.8, ridge_h - 0.85, hd + 1.15), t * Vector3(hw * 0.8, ridge_h - 0.85, hd + 1.15), 6, 3, 0.06, Vector3.DOWN, 0.7, 1, Vector3(0, 1, 0.3))
	var pole := Color("#6b5a46")
	for s in [-1.0, 1.0]:
		var sd: float = s
		big.log_piece(t * Vector3(sd * hw * 0.8, deck_h, hd + 1.15), t * Vector3(sd * hw * 0.8, ridge_h - 0.8, hd + 1.15), 0.04, 9620, true, pole)
	# Frame poles at the corners and the ridge.
	for s in [-1.0, 1.0]:
		for e in [-1.0, 1.0]:
			big.log_piece(t * Vector3(float(s) * hw, y0 - 0.02, float(e) * hd), t * Vector3(float(s) * hw, wall_h + y0, float(e) * hd), 0.035, 9630, true, pole)
	big.log_piece(t * Vector3(0, ridge_h + 0.02, -hd - 0.2), t * Vector3(0, ridge_h + 0.02, hd + 0.2), 0.04, 9640, true, pole)
	# Stove pipe through the roof.
	detail.paint(Color("#3a3a3d"), 0.5, 0.6, 0.0, CampKit.P.IRON)
	var sp := t * Vector3(-hw * 0.45, ridge_h - 0.3, -hd * 0.3)
	detail.cylinder(sp, sp + Vector3(0, 1.05, 0), 0.07, 0.07, 10, false)
	detail.cone(sp + Vector3(0, 1.0, 0), sp + Vector3(0, 1.22, 0), 0.14, 10)
	# Inside: rug, a cot, a crate, a hanging lantern.
	detail.paint(Color("#7c3b46"), 0.95, 0.0, 0.0, CampKit.P.FABRIC)
	detail.disc(t * Vector3(0, deck_h + 0.04, 0.1), Vector3.UP, 1.1, 20, 0.6)
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(-hw + 0.5, deck_h + 0.32, -0.2)), Vector3(0.75, 0.1, 1.9), Color("#7a5534"))
	detail.paint(Color("#5d7a8c"), 0.95, 0.0, 0.0, CampKit.P.FABRIC)
	detail.rbox(t * Transform3D(Basis.IDENTITY, Vector3(-hw + 0.5, deck_h + 0.43, -0.2)), Vector3(0.7, 0.12, 1.8), 0.05, 2)
	LandmarkProps.crate(detail, t * Transform3D(Basis(Vector3.UP, 0.3), Vector3(hw - 0.55, deck_h + 0.03, -hd + 0.6)), Vector3(0.6, 0.5, 0.5), 9650)
	var flame := LandmarkProps.lantern(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, ridge_h - 0.75, 0.0)), true)
	lantern_light(flame, 0.9, 5.0, Color(1.0, 0.72, 0.42))
	# Walls collide (the door stays open: walk in and look around).
	box(Vector3(0.12, 2.0, d), t * Transform3D(Basis.IDENTITY, Vector3(-hw, deck_h + 1.0, 0)))
	box(Vector3(0.12, 2.0, d), t * Transform3D(Basis.IDENTITY, Vector3(hw, deck_h + 1.0, 0)))
	box(Vector3(w, 2.0, 0.12), t * Transform3D(Basis.IDENTITY, Vector3(0, deck_h + 1.0, -hd)))
	for s in [-1.0, 1.0]:
		box(Vector3(hw - door, 2.0, 0.12), t * Transform3D(Basis.IDENTITY, Vector3(float(s) * (hw + door) * 0.5, deck_h + 1.0, hd)))
	box(Vector3(0.75, 0.5, 1.9), t * Transform3D(Basis.IDENTITY, Vector3(-hw + 0.5, deck_h + 0.25, -0.2)))
	for zz in [-1.6, -0.4, 0.8, 1.9]:
		zone(c.x - 1.2, c.z + float(zz), 1.3)
		zone(c.x + 1.2, c.z + float(zz), 1.3)


# =============================================================================
# Pip's Dock
# =============================================================================

func _pip() -> void:
	var u := water_dir(30.0)
	if u == Vector3.ZERO:
		u = Vector3.FORWARD
	var side := Vector3(-u.z, 0.0, u.x)
	var deck_y := WorldGen.WATER_LEVEL + 0.55 - center.y
	# Where the bank meets the water.
	var shore := 4.0
	while shore < 26.0 and gy(u.x * shore, u.z * shore) > deck_y - 0.1:
		shore += 0.25
	var start := 3.2
	var g_start := gy(u.x * start, u.z * start)
	var b := facing(u)
	var dock_w := 2.0
	var dock_len := 9.0
	var wood := Color("#a0805a")
	# Gangway from the bank top down to the dock.
	var gang_end := maxf(shore - 0.6, start + 1.0)
	var a := u * start + Vector3(0, g_start + 0.08, 0)
	var e := u * gang_end + Vector3(0, deck_y, 0)
	if a.y < e.y:
		a.y = e.y
	var steps := maxi(int(a.distance_to(e) / 0.32), 2)
	for i in steps:
		var p := a.lerp(e, (float(i) + 0.5) / steps)
		LandmarkProps.slat(big, Transform3D(b, p), Vector3(1.5, 0.05, a.distance_to(e) / steps - 0.03), wood.lerp(Color("#8d6e4c"), float(i % 3) * 0.3))
	for s in [-1.0, 1.0]:
		var sd: float = s
		big.beam(a + side * sd * 0.68 + Vector3(0, -0.12, 0), e + side * sd * 0.68 + Vector3(0, -0.12, 0), 0.08, 0.18, Color("#6e4c30"))
		# Rope handrail on posts.
		var pa := a + side * sd * 0.72
		var pe := e + side * sd * 0.72
		var posts := maxi(int(pa.distance_to(pe) / 1.6), 1)
		for i in posts + 1:
			var p := pa.lerp(pe, float(i) / posts)
			big.log_piece(p + Vector3(0, -0.6, 0), p + Vector3(0, 0.95, 0), 0.05, 9700 + i, true, Color("#6b5a46"))
		big.rope(pa + Vector3(0, 0.9, 0), pe + Vector3(0, 0.9, 0), 0.12, 0.015, CampKit.ROPE_COLOR, 12)
		rail_wall(pa, pe, 0.1, 1.0)
	box_between(a + Vector3(0, -0.06, 0), e + Vector3(0, -0.06, 0), 1.5, 0.12)
	# The dock: planks across on stringers, posts down to the lake bed.
	var d0 := gang_end
	var d1 := gang_end + dock_len
	var planks := int(dock_len / 0.24)
	for i in planks:
		var dd := lerpf(d0, d1, (float(i) + 0.5) / planks)
		var p := u * dd + Vector3(0, deck_y, 0)
		var wob := sin(float(i) * 1.7) * 0.012
		LandmarkProps.slat(big, Transform3D(b * Basis(Vector3.UP, wob), p), Vector3(dock_w, 0.05, 0.22), wood.lerp(Color("#8d6e4c"), float((i * 7) % 5) / 5.0 * 0.6))
	for s in [-1.0, 1.0]:
		var sd: float = s
		big.beam(u * d0 + side * sd * (dock_w * 0.5 - 0.12) + Vector3(0, deck_y - 0.12, 0), u * d1 + side * sd * (dock_w * 0.5 - 0.12) + Vector3(0, deck_y - 0.12, 0), 0.1, 0.18, Color("#6e4c30"))
		var k := 0
		var dd := d0 + 0.3
		while dd <= d1 + 0.01:
			var p := u * dd + side * sd * (dock_w * 0.5 - 0.05)
			var bed := minf(gy(p.x, p.z), deck_y - 0.4) - 0.4
			var top := deck_y + (0.35 if k % 2 == 0 else 0.05)
			big.log_piece(Vector3(p.x, bed, p.z), Vector3(p.x, top, p.z), 0.09, 9800 + k, true, Color("#5c4a38"))
			dd += 2.2
			k += 1
	var dock_mid := u * (d0 + d1) * 0.5 + Vector3(0, deck_y - 0.15, 0)
	box(Vector3(dock_w, 0.3, dock_len), Transform3D(b, dock_mid))
	for i in 5:
		var p := u * lerpf(d0, d1, float(i) / 4.0)
		zone(p.x, p.z, 1.3)
	# The rowboat moored alongside the end, its painter rope to a post.
	var boat_c := u * (d1 - 2.2) + side * (dock_w * 0.5 + 0.85) + Vector3(0, WorldGen.WATER_LEVEL - 0.28 - center.y, 0)
	var boat_t := Transform3D(b * Basis(Vector3.UP, PI * 0.5 + 0.05) * Basis(Vector3.FORWARD, 0.03), boat_c)
	add_shapes(LandmarkProps.rowboat(detail, detail_cloth, boat_t, Color("#3f7a7a")))
	detail.rope(boat_t * Vector3(1.5, 0.55, 0), u * (d1 - 1.0) + side * (dock_w * 0.5 - 0.05) + Vector3(0, deck_y + 0.3, 0), 0.25, 0.012)
	# Fishing rod propped on the end of the dock, line in the water.
	var rod_base := u * (d1 - 0.4) - side * 0.6 + Vector3(0, deck_y + 0.03, 0)
	LandmarkProps.fishing_rod(detail, rod_base, rod_base + u * 2.0 + Vector3(0, 1.2, 0) - side * 0.4)
	CampProps.bucket(detail, Transform3D(b, u * (d1 - 1.0) - side * 0.55 + Vector3(0, deck_y + 0.03, 0)))
	# On the bank: rod rack, net drying frame, fish crates, barrel, lantern.
	var rack := lxf_tilt(side.x * 2.9 + u.x * 1.6, side.z * 2.9 + u.z * 1.6, atan2(u.x, u.z), 0.4)
	LandmarkProps.slat(detail, rack * Transform3D(Basis.IDENTITY, Vector3(0, 0.55, 0)), Vector3(1.2, 0.08, 0.1), Color("#7a5a3c"))
	for x in [-0.55, 0.55]:
		detail.log_piece(rack * Vector3(x, -0.2, 0), rack * Vector3(x, 0.7, 0), 0.04, 9900, true, Color("#5a4232"))
	for i in 3:
		var x := -0.4 + 0.4 * i
		LandmarkProps.fishing_rod(detail, rack * Vector3(x, 0.02, 0.2), rack * Vector3(x + 0.1, 2.3, -0.35))
	var rp := rack.origin
	add_shapes([LandmarkProps.box_shape(Vector3(1.3, 1.0, 0.4), rack * Transform3D(Basis.IDENTITY, Vector3(0, 0.5, 0)))])
	zone(rp.x, rp.z, 0.7)
	var nf := -side * 3.9 + u * 0.9
	var nt := lxf(nf.x, nf.z, atan2(u.x, u.z) + 0.15, 1.2)
	for x in [-1.1, 1.1]:
		detail.log_piece(nt * Vector3(x, -0.3, 0), nt * Vector3(x, 2.0, 0), 0.055, 9910, true, Color("#5a4232"))
	detail.log_piece(nt * Vector3(-1.25, 1.92, 0), nt * Vector3(1.25, 1.95, 0), 0.04, 9911, true, Color("#6b5a46"))
	LandmarkProps.net(detail_cloth, nt * Vector3(-1.05, 1.9, 0.02), nt * Vector3(1.05, 1.9, 0.02), 1.5, (nt.basis.z).normalized())
	detail_cloth.paint(Color("#e9e2d2"), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
	for i in 4:
		detail_cloth.sphere(nt * Vector3(-0.8 + 0.5 * i, 1.0 + 0.2 * sin(float(i) * 1.7), 0.06), 0.06, 8, 5)
	add_shapes([LandmarkProps.box_shape(Vector3(2.4, 2.0, 0.25), nt * Transform3D(Basis.IDENTITY, Vector3(0, 1.0, 0)))])
	zone(nf.x, nf.z, 1.2)
	var cr := side * 3.4 - u * 0.4
	add_shapes(LandmarkProps.crate(detail, lxf(cr.x, cr.z, 0.4, 0.4), Vector3(0.6, 0.35, 0.45), 9920, false, Color("#9a8a6c")))
	add_shapes(LandmarkProps.barrel(detail, lxf(cr.x + side.x * 0.8, cr.z + side.z * 0.8, 0.0, 0.3), 9921, 0.85, 0.28, Color("#6f5a42")))
	zone(cr.x, cr.z, 0.5)
	zone(cr.x + side.x * 0.8, cr.z + side.z * 0.8, 0.35)
	var lpos := u * (start - 0.2) - side * 1.25
	var lp := LandmarkProps.lantern_post(detail, lxf(lpos.x, lpos.z, atan2(u.x, u.z) + PI * 0.5, 0.2), 9930, true, 2.2)
	add_shapes(lp["shapes"])
	lantern_light(lp["flame"], 1.0, 6.5)
	zone(lpos.x, lpos.z, 0.3)
	var sp := -side * 3.0 + Vector3(0, 0, 3.0)
	sign_board(Vector3(sp.x, 0, sp.z), 0.0, "Pip's\nDock", Color("#2f5d7a"), 1.2, 1.55)


# =============================================================================
# Bram's Dig
# =============================================================================

func _bram() -> void:
	var u := uphill_dir(12.0)
	var side := Vector3(-u.z, 0.0, u.x)
	var dp := portal_distance(u, 6.5, 12.0)
	var floor_y := gy(u.x * dp, u.z * dp)
	var b := facing(-u)          # the portal faces back toward the centre
	var pc := u * dp + Vector3(0, floor_y, 0)
	MineBits.portal(self, Transform3D(b, pc), 2.2, 2.4, 0.45, 0.25, false, 10000)
	# Tracks from just outside the trader spot up to the portal.
	var t0 := u * 3.2
	MineBits.tracks(self, Vector3(t0.x, 0, t0.z), Vector3(pc.x, 0, pc.z) - u * 0.15, 10100)
	# A cart of ore on the tracks.
	var cd := lerpf(3.0, dp, 0.55)
	var cp := u * cd
	var ct := Transform3D(facing(u) * Basis(Vector3.UP, PI * 0.5), Vector3(cp.x, gy(cp.x, cp.z) + 0.1, cp.z))
	add_shapes(LandmarkProps.mine_cart(detail, ct, 10200, Color("#4a3f38")))
	zone(cp.x, cp.z, 0.7)
	# Pickaxes against a crate, ore bags, a spoil heap with a shovel.
	var crp := u * (dp - 1.6) + side * 2.4
	var crt := lxf(crp.x, crp.z, atan2(-u.x, -u.z), 0.45)
	add_shapes(LandmarkProps.crate(detail, crt, Vector3(0.75, 0.55, 0.6), 10300, false, Color("#8a6a48")))
	LandmarkProps.pickaxe(detail, crt * Vector3(-0.15, 0.0, 0.55), crt * Vector3(-0.05, 0.85, 0.36), crt.basis.x)
	LandmarkProps.pickaxe(detail, crt * Vector3(0.25, 0.0, 0.52), crt * Vector3(0.32, 0.84, 0.35), -crt.basis.x)
	zone(crp.x, crp.z, 0.55)
	for i in 3:
		var sp := u * (dp - 2.8) - side * (2.0 + 0.55 * i) + u * 0.25 * float(i % 2)
		add_shapes(LandmarkProps.sack(detail, lxf(sp.x, sp.z, float(i), 0.3), 10310 + i, Color("#6b665e").lerp(Color("#857a68"), float(i) * 0.3), 0.95))
		zone(sp.x, sp.z, 0.3)
	var hp := -side * 3.6 + u * 1.0
	var hg := gy(hp.x, hp.z)
	detail.paint(Color("#6b5847"), 0.97, 0.0, 0.0, LandmarkKit.LP.EARTH)
	detail.blob(Vector3(hp.x, hg - 0.15, hp.z), Vector3(1.1, 0.65, 0.9), 10320, 0.25, 14, 8)
	detail.paint(Color("#5d5348"), 0.92, 0.0, 0.0, CampKit.P.STONE)
	for i in 5:
		var a := float(i) * 1.3
		detail.stone(Vector3(hp.x + cos(a) * 0.8, hg + 0.05, hp.z + sin(a) * 0.7), Vector3(0.15, 0.1, 0.13), 10330 + i, Color("#6c6862"), a, 0.3, 8, 5)
	LandmarkProps.shovel(detail, Vector3(hp.x, hg + 0.3, hp.z), Vector3(hp.x + 0.15, hg + 1.3, hp.z - 0.1))
	add_shapes([LandmarkProps.cyl_shape(0.9, 0.6, Transform3D(Basis.IDENTITY, Vector3(hp.x, hg + 0.2, hp.z)))])
	zone(hp.x, hp.z, 1.0)
	# A little lean-to with a bedroll.
	var lt_p := side * 4.2 - u * 0.6
	var lt := lxf(lt_p.x, lt_p.z, atan2(-side.x, -side.z), 1.2)
	for x in [-1.0, 1.0]:
		detail.log_piece(lt * Vector3(x, -0.2, 0.6), lt * Vector3(x, 1.45, 0.6), 0.04, 10340, true, Color("#5a4232"))
	detail.log_piece(lt * Vector3(-1.15, 1.42, 0.6), lt * Vector3(1.15, 1.42, 0.6), 0.035, 10341, true, Color("#6b5a46"))
	detail_cloth.paint(Color("#6f7a4a"), 0.95, 0.0, 0.0, CampKit.P.CANVAS)
	detail_cloth.sheet(lt * Vector3(-1.1, 1.44, 0.62), lt * Vector3(1.1, 1.44, 0.62), lt * Vector3(-1.1, 0.03, -0.75), lt * Vector3(1.1, 0.03, -0.75), 6, 4, 0.08, Vector3.DOWN, 0.5, 3, Vector3(0, 1, 0.5))
	detail.paint(Color("#8c3b33"), 0.95, 0.0, 0.0, CampKit.P.FABRIC)
	detail.cylinder(lt * Vector3(-0.8, 0.12, 0.1), lt * Vector3(0.6, 0.12, 0.1), 0.12, 0.12, 12, true, 0.05)
	add_shapes([LandmarkProps.box_shape(Vector3(2.3, 1.4, 1.4), lt * Transform3D(Basis.IDENTITY, Vector3(0, 0.7, 0)))])
	zone(lt_p.x, lt_p.z, 1.3)
	# Lantern post by the portal, sign by the trail.
	var lpp := u * (dp - 1.2) - side * 1.9
	var lp := LandmarkProps.lantern_post(detail, lxf(lpp.x, lpp.z, atan2(side.x, side.z), 0.2), 10350, true, 2.3)
	add_shapes(lp["shapes"])
	lantern_light(lp["flame"], 1.1, 6.5)
	zone(lpp.x, lpp.z, 0.3)
	sign_board(Vector3(2.6, 0, 3.6), -0.3, "Bram's\nDig", Color("#6b4a2f"), 1.2, 1.55)
