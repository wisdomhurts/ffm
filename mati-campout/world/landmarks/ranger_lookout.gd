class_name RangerLookout
extends LandmarkSite
## Ranger Lookout: a log watchtower (~8 m to the platform, ~10 m with the
## roof) with switchback stairs (two flights and a landing) up to a railed
## platform holding the rare chest, a table with binoculars and a lantern.
## Notice board with ranger notes, sign, water barrel and firewood below.
## Local frame: +Z toward the trail; stairs on the -X side, then along the back.

const H := 5.8            # platform deck height
const MID := 2.9          # landing height
const HALF := 2.3         # platform half size
const LEG := 1.85         # leg offset at the ground
const LEG_TOP := 1.6      # leg offset at the platform
const LANE := 1.0         # stair width
const ROOF := 8.0         # roof eaves height

var _base := 0.0


func _init() -> void:
	far_range = 300.0
	near_range = 90.0


func build_site() -> void:
	_base = gmin(0.0, 0.0, LEG + 0.3)
	_tower()
	_stairs()
	_platform()
	_roof()
	_ground_props()


func _tower() -> void:
	var wood := Color("#6b4d34")
	var corners := [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
	var feet: Array[Vector3] = []
	var tops: Array[Vector3] = []
	for c in corners:
		var cv: Vector2 = c
		var foot := Vector3(cv.x * LEG, gy(cv.x * LEG, cv.y * LEG) - 0.4, cv.y * LEG)
		var top := Vector3(cv.x * LEG_TOP, H + 1.15, cv.y * LEG_TOP)
		feet.append(foot)
		tops.append(top)
		big.log_piece(foot, top, 0.14, 7000 + feet.size(), true, wood)
		# Stone footing.
		big.stone(Vector3(foot.x, gy(foot.x, foot.z) + 0.05, foot.z), Vector3(0.36, 0.2, 0.34), 7010 + feet.size(), Color("#8b877f"), 0.0, 0.2, 10, 6)
		cyl(0.18, H - 0.1 - _base, Transform3D(Basis.IDENTITY, Vector3(foot.x, (_base + H - 0.1) * 0.5, foot.z)))
	# Girts and X braces on every face (two storeys).
	var levels := [_base + 0.35, MID - 0.05, H - 0.1]
	for i in 4:
		var a := feet[i]
		var b := feet[(i + 1) % 4]
		var ta := tops[i]
		var tb := tops[(i + 1) % 4]
		for li in levels.size():
			var y: float = levels[li]
			var pa := a.lerp(ta, (y - a.y) / (ta.y - a.y))
			var pb := b.lerp(tb, (y - b.y) / (tb.y - b.y))
			big.log_piece(pa, pb, 0.075, 7100 + i * 10 + li, true, wood.lightened(0.05))
		for li in levels.size() - 1:
			var y0: float = levels[li]
			var y1: float = levels[li + 1]
			var a0 := a.lerp(ta, (y0 - a.y) / (ta.y - a.y))
			var b0 := b.lerp(tb, (y0 - b.y) / (tb.y - b.y))
			var a1 := a.lerp(ta, (y1 - a.y) / (ta.y - a.y))
			var b1 := b.lerp(tb, (y1 - b.y) / (tb.y - b.y))
			big.log_piece(a0, b1, 0.05, 7200 + i * 10 + li, true, wood.darkened(0.05))
			big.log_piece(b0, a1, 0.05, 7300 + i * 10 + li, true, wood.darkened(0.05))
	zone(0.0, 0.0, LEG + 0.3)


## A straight flight of stairs from a to b (bottom to top), `side` = unit
## vector across the lane toward its outer edge. Adds treads, stringers,
## handrails and a ramp collider with an outer rail wall.
func _flight(a: Vector3, b: Vector3, side: Vector3, rails_both: bool) -> void:
	var rise := b.y - a.y
	var steps := maxi(int(round(rise / 0.24)), 2)
	var run := Vector3(b.x - a.x, 0.0, b.z - a.z)
	var dir := run.normalized()
	var half := side * LANE * 0.5
	var tread_c := Color("#9a7550")
	for i in steps:
		var t := (float(i) + 0.5) / steps
		var p := a + run * t + Vector3(0, rise * (float(i) + 1.0) / steps - 0.03, 0)
		var yaw_b := Basis(Vector3.UP, atan2(dir.x, dir.z))
		LandmarkProps.slat(big, Transform3D(yaw_b, p), Vector3(LANE, 0.05, run.length() / steps + 0.04), tread_c.lerp(Color("#8a6a48"), float(i % 3) * 0.3))
	# Stringers.
	for s in [-1.0, 1.0]:
		var sd: float = s
		big.beam(a + half * sd + Vector3(0, -0.1, 0) - dir * 0.15, b + half * sd + Vector3(0, -0.1, 0) + dir * 0.05, 0.06, 0.22, Color("#6e4c30"))
	# Handrails: posts + a rail on the outer side (and the inner one if asked).
	var rail_sides := [1.0, -1.0] if rails_both else [1.0]
	for s in rail_sides:
		var sd: float = s
		var off := half * sd * 0.94
		var post_n := maxi(int(run.length() / 1.3), 1)
		for i in post_n + 1:
			var t := float(i) / post_n
			var p := a.lerp(b, t) + off
			big.log_piece(p + Vector3(0, -0.05, 0), p + Vector3(0, 1.0, 0), 0.04, 7400 + i, true, Color("#7a5a3c"))
		big.log_piece(a + off + Vector3(0, 0.98, 0), b + off + Vector3(0, 0.98, 0), 0.035, 7450, true, Color("#8a6a48"))
		rail_wall(a + off, b + off, 0.08, 1.1)
	# Walkable ramp (top surface just above the treads' nosing line).
	box_between(a + Vector3(0, -0.05, 0), b + Vector3(0, -0.05, 0), LANE, 0.12)
	var steps_zone := int(run.length() / 1.6) + 1
	for i in steps_zone + 1:
		var p := a.lerp(b, float(i) / steps_zone)
		zone(p.x, p.z, 0.75)


func _landing(c: Vector3, size: Vector2, posts_to: float) -> void:
	for i in 4:
		var z := c.z + (float(i) - 1.5) * size.y / 4.0
		LandmarkProps.slat(big, Transform3D(Basis.IDENTITY, Vector3(c.x, c.y - 0.03, z)), Vector3(size.x, 0.06, size.y / 4.0 - 0.02), Color("#9a7550"))
	big.beam(Vector3(c.x - size.x * 0.5, c.y - 0.12, c.z), Vector3(c.x + size.x * 0.5, c.y - 0.12, c.z), 0.12, 0.16, Color("#6e4c30"))
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var p := Vector3(c.x + sx * size.x * 0.5, 0, c.z + sz * size.y * 0.5)
			big.log_piece(Vector3(p.x, gy(p.x, p.z) - 0.3, p.z), Vector3(p.x, posts_to, p.z), 0.07, 7500 + int(sx + sz * 3.0), true, Color("#6b4d34"))
	box(Vector3(size.x, 0.14, size.y), Transform3D(Basis.IDENTITY, Vector3(c.x, c.y - 0.07, c.z)))


func _stairs() -> void:
	var lx := -(HALF + LANE * 0.5)       # flight 1 lane centre (x)
	var lz := -(HALF + LANE * 0.5)       # flight 2 lane centre (z)
	var foot_z := HALF + 0.6
	var g0 := gy(lx, foot_z + 0.3)
	# Flight 1: west side, front -> back, ground -> landing.
	_flight(Vector3(lx, g0, foot_z), Vector3(lx, MID, -HALF), Vector3(-1, 0, 0), true)
	# Landing at the back-left corner.
	_landing(Vector3(lx, MID, lz), Vector2(LANE, LANE), MID + 1.1)
	# Flight 2: along the back, left -> right, landing -> platform level.
	var top_x := 0.9
	_flight(Vector3(-HALF, MID, lz), Vector3(top_x, H, lz), Vector3(0, 0, -1), true)
	# Top landing joining the platform's back edge.
	_landing(Vector3((top_x + HALF) * 0.5, H, lz), Vector2(HALF - top_x, LANE), H)
	# Rail walls on the open ends of the landings.
	box(Vector3(0.08, 1.2, LANE), Transform3D(Basis.IDENTITY, Vector3(lx - LANE * 0.5, MID + 0.55, lz)))
	box(Vector3(LANE + 0.08, 1.2, 0.08), Transform3D(Basis.IDENTITY, Vector3(lx, MID + 0.55, lz - LANE * 0.5)))
	box(Vector3(0.08, 1.2, LANE), Transform3D(Basis.IDENTITY, Vector3(HALF, H + 0.55, lz)))
	box(Vector3(HALF - top_x, 1.2, 0.08), Transform3D(Basis.IDENTITY, Vector3((top_x + HALF) * 0.5, H + 0.55, lz - LANE * 0.5)))
	for p in [Vector3(lx - LANE * 0.5, 0, lz - LANE * 0.5), Vector3(HALF, 0, lz - LANE * 0.5)]:
		var pv: Vector3 = p
		var y: float = MID if pv.x < 0.0 else H
		big.log_piece(Vector3(pv.x, y - 0.1, pv.z), Vector3(pv.x, y + 1.05, pv.z), 0.045, 7600, true, Color("#7a5a3c"))
	big.log_piece(Vector3(lx - LANE * 0.5, MID + 1.0, lz + LANE * 0.5), Vector3(lx - LANE * 0.5, MID + 1.0, lz - LANE * 0.5), 0.035, 7610, true, Color("#8a6a48"))
	big.log_piece(Vector3(lx - LANE * 0.5, MID + 1.0, lz - LANE * 0.5), Vector3(lx + LANE * 0.5, MID + 1.0, lz - LANE * 0.5), 0.035, 7611, true, Color("#8a6a48"))
	big.log_piece(Vector3(HALF, H + 1.0, lz - LANE * 0.5), Vector3(top_x, H + 1.0, lz - LANE * 0.5), 0.035, 7612, true, Color("#8a6a48"))
	big.log_piece(Vector3(HALF, H + 1.0, lz - LANE * 0.5), Vector3(HALF, H + 1.0, lz + LANE * 0.5), 0.035, 7613, true, Color("#8a6a48"))


func _platform() -> void:
	# Deck planks along X over joists.
	var n := 12
	for i in n:
		var z := -HALF + (float(i) + 0.5) * HALF * 2.0 / n
		LandmarkProps.slat(big, Transform3D(Basis.IDENTITY, Vector3(0, H - 0.03, z)), Vector3(HALF * 2.0, 0.06, HALF * 2.0 / n - 0.015), Color("#a07a52").lerp(Color("#8d6a47"), float(i % 3) * 0.35))
	for x in [-1.4, 0.0, 1.4]:
		big.beam(Vector3(x, H - 0.16, -HALF), Vector3(x, H - 0.16, HALF), 0.12, 0.18, Color("#6e4c30"))
	box(Vector3(HALF * 2.0, 0.16, HALF * 2.0), Transform3D(Basis.IDENTITY, Vector3(0, H - 0.08, 0)))
	# Railing with a gap on the back edge where the stairs arrive.
	var gap0 := 0.85
	var rail_c := Color("#7a5a3c")
	var edges := [
		[Vector3(-HALF, H, HALF), Vector3(HALF, H, HALF)],
		[Vector3(HALF, H, HALF), Vector3(HALF, H, -HALF)],
		[Vector3(-HALF, H, -HALF), Vector3(-HALF, H, HALF)],
		[Vector3(-HALF, H, -HALF), Vector3(gap0, H, -HALF)],
	]
	for e in edges:
		var a: Vector3 = e[0]
		var b: Vector3 = e[1]
		var posts := maxi(int(a.distance_to(b) / 1.15), 1)
		for i in posts + 1:
			var p := a.lerp(b, float(i) / posts)
			big.log_piece(p + Vector3(0, -0.05, 0), p + Vector3(0, 1.08, 0), 0.05, 7700 + i, true, rail_c)
		big.log_piece(a + Vector3(0, 1.05, 0), b + Vector3(0, 1.05, 0), 0.04, 7750, true, Color("#8a6a48"))
		big.log_piece(a + Vector3(0, 0.55, 0), b + Vector3(0, 0.55, 0), 0.03, 7751, true, Color("#8a6a48"))
		var mid := (a + b) * 0.5
		var size := Vector3(absf(b.x - a.x) + 0.08, 1.2, absf(b.z - a.z) + 0.08)
		box(size, Transform3D(Basis.IDENTITY, mid + Vector3(0, 0.6, 0)))
	# Table with binoculars and a map; a lantern hangs from the roof beam.
	var tt := Transform3D(Basis(Vector3.UP, 0.0), Vector3(1.35, H, 1.1))
	LandmarkProps.slat(detail, tt * Transform3D(Basis.IDENTITY, Vector3(0, 0.78, 0)), Vector3(1.0, 0.05, 0.6), Color("#8a5f3a"))
	for x in [-0.42, 0.42]:
		for z in [-0.24, 0.24]:
			LandmarkProps.slat(detail, tt * Transform3D(Basis.IDENTITY, Vector3(x, 0.38, z)), Vector3(0.05, 0.76, 0.05), Color("#6e4c30"))
	LandmarkProps.block(detail, tt * Transform3D(Basis(Vector3.UP, 0.25), Vector3(-0.15, 0.81, 0.02)), Vector3(0.5, 0.01, 0.36), LandmarkKit.PAPER_COLOR, LandmarkKit.LP.PAPER, 0.95)
	detail.paint(Color("#2b2b2e"), 0.4, 0.5, 0.0, MeshKit.Pat.LEATHER)
	for s in [-0.045, 0.045]:
		detail.cylinder(tt * Vector3(0.25 + s, 0.83, -0.05), tt * Vector3(0.25 + s, 0.83, 0.1), 0.035, 0.03, 10, true, 0.008)
	box(Vector3(1.0, 0.8, 0.6), tt * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0)))
	var flame := LandmarkProps.lantern(detail, Transform3D(Basis.IDENTITY, Vector3(-0.2, ROOF - 1.05, 0.3)), true)
	detail.paint(LandmarkKit.DARK_METAL, 0.5, 0.6, 0.0, CampKit.P.IRON)
	detail.cylinder(Vector3(-0.2, ROOF - 0.78, 0.3), Vector3(-0.2, ROOF - 0.1, 0.3), 0.006, 0.006, 4, false)
	lantern_light(flame, 1.2, 7.5)
	# The rare chest stands at the front, facing the stairs' arrival.
	chest_spot(Vector3(-0.55, H, 1.25), PI, Vector3(-(HALF + LANE * 0.5), 0.0, HALF + 1.8))


func _roof() -> void:
	var corner_c := Color("#6b4d34")
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var p := Vector3(sx * (HALF - 0.12), 0, sz * (HALF - 0.12))
			big.log_piece(Vector3(p.x, H - 0.1, p.z), Vector3(p.x, ROOF + 0.1, p.z), 0.07, 7800 + int(sx * 2.0 + sz), true, corner_c)
	var sq: Array[Vector3] = [Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)]
	for i in 4:
		big.beam(sq[i] * (HALF - 0.1) + Vector3(0, ROOF, 0), sq[(i + 1) % 4] * (HALF - 0.1) + Vector3(0, ROOF, 0), 0.14, 0.16, Color("#6e4c30"))
	big.beam(Vector3(-HALF + 0.1, ROOF + 0.02, 0.3), Vector3(HALF - 0.1, ROOF + 0.02, 0.3), 0.1, 0.12, Color("#6e4c30"))
	# Hip roof of shingles (double-sided so it reads from below too).
	var eave := HALF + 0.55
	var apex := Vector3(0, ROOF + 1.55, 0)
	var cs: Array[Vector3] = [Vector3(-eave, ROOF, -eave), Vector3(eave, ROOF, -eave), Vector3(eave, ROOF, eave), Vector3(-eave, ROOF, eave)]
	big_cloth.paint(Color("#6a4a36"), 0.85, 0.0, 0.0, LandmarkKit.LP.SHINGLE)
	for i in 4:
		big_cloth.leaf_tri(apex, cs[i], cs[(i + 1) % 4], 0.0, 0.0, 0.0)
	for c in cs:
		big.log_piece(c + Vector3(0, 0.05, 0), apex + Vector3(0, 0.08, 0), 0.06, 7900, true, Color("#5a4232"))
	# Flag pole with a little green ranger flag.
	big.paint(Color("#d9d2c4"), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
	big.cylinder(apex, apex + Vector3(0, 1.8, 0), 0.03, 0.022, 6, true)
	big.paint(Color("#c9a25a"), 0.3, 0.8, 0.0, MeshKit.Pat.NONE)
	big.sphere(apex + Vector3(0, 1.84, 0), 0.05, 8, 5)
	big_cloth.paint(Color("#3f7a4a"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	var f0 := apex + Vector3(0.03, 1.72, 0)
	big_cloth.sheet(f0, f0 + Vector3(0.9, -0.08, 0.0), f0 + Vector3(0, -0.5, 0), f0 + Vector3(0.9, -0.5, 0.0), 6, 3, 0.04, Vector3(0, 0, 1), 1.0, 4)


func _ground_props() -> void:
	# Sign at the foot of the stairs.
	sign_board(Vector3(1.8, 0, HALF + 2.6), -0.25, "Ranger\nLookout", Color("#3f5e3a"), 1.3, 1.6)
	# Notice board with ranger notes.
	var nb := lxf(3.4, 0.8, 0.6, 0.4)
	for x in [-0.55, 0.55]:
		detail.log_piece(nb * Vector3(x, -0.2, 0), nb * Vector3(x, 1.9, 0), 0.05, 8000 + int(x * 10.0), true, Color("#5a4232"))
	LandmarkProps.slat(detail, nb * Transform3D(Basis.IDENTITY, Vector3(0, 1.35, 0)), Vector3(1.25, 0.8, 0.05), Color("#7a5a3c"))
	LandmarkProps.slat(detail, nb * Transform3D(Basis(Vector3.RIGHT, 0.3), Vector3(0, 1.85, 0.08)), Vector3(1.4, 0.04, 0.3), Color("#5a3a22"))
	for e in [[-0.3, 1.45, 0.08], [0.22, 1.32, -0.06], [-0.1, 1.15, 0.03]]:
		LandmarkProps.block(detail, nb * Transform3D(Basis(Vector3.BACK, float(e[2])), Vector3(float(e[0]), float(e[1]), 0.03)), Vector3(0.36, 0.28, 0.01), LandmarkKit.PAPER_COLOR, LandmarkKit.LP.PAPER, 0.95)
	add_shapes([LandmarkProps.box_shape(Vector3(1.3, 1.9, 0.2), nb * Transform3D(Basis.IDENTITY, Vector3(0, 0.95, 0)))])
	zone(3.4, 0.8, 0.8)
	var note := LandmarkNote.new("Read the Ranger's Notes", notes_for("lookout"))
	note.position = nb * Vector3(0, 1.3, 0.3)
	add_child(note)
	# Water barrel, firewood, a bench.
	add_shapes(LandmarkProps.barrel(detail, lxf(2.7, -1.7, 0.3, 0.32), 8100, 0.95, 0.32, Color("#6b5a3c")))
	zone(2.7, -1.7, 0.4)
	var fw := lxf(-0.3, -4.2, 0.0, 0.8)
	for row in 3:
		for i in 6 - row:
			var x := -0.75 + 0.3 * i + 0.15 * row
			detail.log_piece(fw * Vector3(x, 0.11 + 0.2 * row, -0.3), fw * Vector3(x + 0.02, 0.12 + 0.2 * row, 0.3), 0.1, 8200 + row * 10 + i, true)
	add_shapes([LandmarkProps.box_shape(Vector3(1.9, 0.7, 0.7), fw * Transform3D(Basis.IDENTITY, Vector3(0, 0.35, 0)))])
	zone(-0.3, -4.2, 1.0)
	add_shapes(LandmarkProps.bench(detail, lxf(3.2, 3.6, PI * 0.15, 0.6), 1.5))
	zone(3.2, 3.6, 0.8)
