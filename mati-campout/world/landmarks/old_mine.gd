class_name OldMine
extends LandmarkSite
## The Old Mine: a weathered timber portal in a rocky knoll at the foot of
## the ridge, boarded across the top (you can still squeeze in underneath),
## a short walkable tunnel with timber sets and a lantern, and the epic
## chest just inside. Outside: rusty tracks running out of the mine, a
## tipped-over cart with spilled coal, a timber pile and a kid-friendly
## warning sign. Local frame: +Z toward the trail.

const W := 2.6
const H := 2.5
const DEPTH := 4.6


func _init() -> void:
	far_range = 240.0
	near_range = 85.0


## Furthest distance along u (from min_d) where a tunnel `depth` long stays
## walkable (the ground inside rises at most `max_rise`).
func tunnel_distance(u: Vector3, min_d: float, max_d: float, depth: float, max_rise: float) -> float:
	var best := min_d
	var dd := min_d
	while dd <= max_d:
		var h0 := gy(u.x * dd, u.z * dd)
		var h1 := gy(u.x * (dd + depth), u.z * (dd + depth))
		if h1 - h0 <= max_rise:
			best = dd
		dd += 0.25
	return best


func build_site() -> void:
	var u := uphill_dir(13.0)
	var side := Vector3(-u.z, 0.0, u.x)
	var dp := tunnel_distance(u, 4.0, 8.5, DEPTH, 1.15)
	var floor_y := gmin(u.x * dp, u.z * dp, 0.6)
	var b := facing(-u)
	var pt := Transform3D(b, u * dp + Vector3(0, floor_y, 0))
	MineBits.portal(self, pt, W, H, DEPTH, 1.0, true, 11000)
	MineBits.boards(self, pt, W, H, 11050)
	# Lantern hanging just inside (it glows by day too: the tunnel is dark).
	var lt := pt * Transform3D(Basis.IDENTITY, Vector3(0.55, H - 0.62, -0.9))
	var flame := LandmarkProps.lantern(detail, lt, true)
	detail.paint(LandmarkKit.DARK_METAL, 0.5, 0.6, 0.0, CampKit.P.IRON)
	detail.cylinder(lt * Vector3(0, 0.27, 0), lt * Vector3(0, 0.5, 0), 0.006, 0.006, 4, false)
	lantern_light(flame, 0.9, 5.0, Color(1.0, 0.7, 0.4), true, "indoor")
	# A lantern on the portal post, lit at night.
	var lo := pt * Transform3D(Basis.IDENTITY, Vector3(-W * 0.5 - 0.35, 1.55, 0.25))
	var flame2 := LandmarkProps.lantern(detail, lo, true)
	detail.paint(LandmarkKit.DARK_METAL, 0.5, 0.6, 0.0, CampKit.P.IRON)
	detail.cylinder(lo * Vector3(0, 0.27, 0), lo * Vector3(0.15, 0.45, 0), 0.006, 0.006, 4, false)
	lantern_light(flame2, 1.0, 6.0)
	# The epic chest just inside, facing out.
	var cz := -1.75
	var cl := pt * Vector3(0, 0, cz)
	var cy := gy(cl.x, cl.z)
	chest_spot(Vector3(cl.x, cy, cl.z), atan2(-u.x, -u.z), Vector3(cl.x, 0.0, cl.z))
	# Old planks on the tunnel floor and tracks running out of the mine.
	for i in 4:
		var pz := -0.6 - 0.95 * float(i)
		var pp := pt * Vector3(-0.75 + 0.1 * sin(float(i) * 2.0), 0, pz)
		LandmarkProps.slat(detail, Transform3D(b * Basis(Vector3.UP, 0.1 * sin(float(i))), Vector3(pp.x, gy(pp.x, pp.z) + 0.03, pp.z)), Vector3(0.28, 0.035, 0.9), Color("#6a5a48"))
	var t_in := pt * Vector3(0.55, 0, -DEPTH + 0.6)
	var t_out := pt * Vector3(0.9, 0, 6.5)
	MineBits.tracks(self, Vector3(t_in.x, 0, t_in.z), Vector3(t_out.x, 0, t_out.z), 11100)
	# A tipped cart with spilled coal beside the tracks.
	var cp := pt * Vector3(-1.4, 0, 4.6)
	var ct := lxf(cp.x, cp.z, atan2(-u.x, -u.z) + 0.5, 0.6) * Transform3D(Basis(Vector3.BACK, 1.25), Vector3(0.0, 0.42, 0.0))
	add_shapes(LandmarkProps.mine_cart(detail, ct, 11200, Color("#2a2826")))
	zone(cp.x, cp.z, 0.8)
	for i in 7:
		var a := float(i) * 0.9
		var sp := cp + side * (0.4 + 0.25 * cos(a)) + u * (0.5 + 0.3 * sin(a))
		detail.stone(Vector3(sp.x, gy(sp.x, sp.z) + 0.04, sp.z), Vector3(0.12, 0.09, 0.11), 11210 + i, Color("#2b2927"), a, 0.3, 8, 5)
	# Timber pile and a warning sign.
	var tp := pt * Vector3(3.3, 0, 2.6)
	var tpt := lxf(tp.x, tp.z, atan2(side.x, side.z), 1.0)
	for row in 3:
		for i in 4 - row:
			var x := -0.55 + 0.36 * i + 0.18 * row
			detail.log_piece(tpt * Vector3(x, 0.14 + 0.24 * row, -1.2), tpt * Vector3(x + 0.03, 0.15 + 0.24 * row, 1.2), 0.13, 11300 + row * 10 + i, true, Color("#5d5044"), Color("#a08a6a"))
	add_shapes([LandmarkProps.box_shape(Vector3(1.6, 0.8, 2.5), tpt * Transform3D(Basis.IDENTITY, Vector3(0, 0.4, 0)))])
	zone(tp.x, tp.z, 1.3)
	var sg := pt * Vector3(-3.0, 0, 3.0)
	sign_board(Vector3(sg.x, 0, sg.z), atan2(-u.x, -u.z) + 0.35, "Old Mine\nMind your head!", Color("#7a4a2c"), 1.6, 1.6)
