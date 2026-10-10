class_name TentBuilder
extends RefCounted
## Procedural tents for the 8 tent levels (data/upgrades.json "tent").
## Every level is clearly a tent, and each is visibly grander:
##   1 Pup Tent       small olive A-frame, guy ropes and pegs
##   2 Ridge Tent     taller cream A-frame with short walls and a ground sheet
##   3 Cozy Tent      rust canvas, rug, lantern, a little stone hearth ring
##   4 Explorer Tent  khaki wall tent with a porch awning
##   5 Ranger Tent    double-wall (olive fly over cream inner) and a flag
##   6 Grand Tent     twin-peaked pavilion, bunting and a little stove pipe
##   7 Lodge Tent     huge canvas lodge, wooden deck, string lights
##   8 Starlight Pavilion  royal twin-peaked lodge, starstone lamps, lights
## Local frame: door faces +Z, origin = footprint centre on the ground.
##
## TentBuilder.new().build(level) -> {
##   "solid": CampKit, "cloth": CampKit, "shapes": [{shape, xform}],
##   "lights": [{pos, color, range, energy, kind ("warm"|"star")}],
##   "w", "d", "h", "rest": Vector3, "door": Vector3, "front": float}

const LEVELS := {
	1: {"style": "a", "w": 2.3, "d": 2.6, "h": 1.78, "wall": 0.0, "canvas": "7d8a55", "trim": "55603a", "door": 0.6},
	2: {"style": "a", "w": 2.6, "d": 3.0, "h": 2.0, "wall": 0.35, "canvas": "e3d6bf", "trim": "b5653f", "door": 0.66,
		"groundsheet": true},
	3: {"style": "a", "w": 2.9, "d": 3.2, "h": 2.15, "wall": 0.42, "canvas": "c8794a", "trim": "efe2c6", "door": 0.7,
		"groundsheet": true, "rug": true, "lantern": true, "hearth": true, "light": true},
	4: {"style": "wall", "w": 3.2, "d": 3.6, "h": 2.5, "wall": 1.15, "canvas": "cdbd94", "trim": "7d5735", "door": 0.5,
		"porch": 1.4, "rug": true, "lantern": true, "light": true},
	5: {"style": "wall", "w": 3.4, "d": 3.8, "h": 2.65, "wall": 1.2, "canvas": "ebdfc6", "fly": "6e7b4a", "trim": "6e7b4a",
		"door": 0.5, "porch": 1.5, "flag": true, "rug": true, "lantern": true, "light": true},
	6: {"style": "twin", "w": 4.6, "d": 3.8, "h": 3.3, "wall": 1.9, "canvas": "efe4cc", "trim": "b5483a", "door": 0.5,
		"bunting": true, "stove": true, "rug": true, "lantern": true, "light": true},
	7: {"style": "wall", "w": 4.4, "d": 5.0, "h": 3.35, "wall": 1.5, "canvas": "e6d7b6", "fly": "5d7a4a", "trim": "5d7a4a",
		"door": 0.55, "porch": 1.8, "deck": true, "string_lights": true, "rug": true, "lantern": true, "light": true},
	8: {"style": "twin", "w": 5.4, "d": 4.4, "h": 3.8, "wall": 2.0, "canvas": "f1e8d4", "trim": "2f4a7a", "door": 0.55,
		"deck": true, "string_lights": true, "bunting": true, "starstones": true, "gold": true, "rug": true,
		"lantern": true, "light": true},
}

const BUNTING_COLORS := ["e05a4f", "f2c14e", "4f8fd1", "7cbf6a", "f08a3c"]
const BULB_COLORS := ["ffe7b0", "ffc56b", "fff3d6", "ffd28a"]

var s: CampKit
var c: CampKit
var shapes: Array = []
var lights: Array = []
var L: Dictionary = {}
var W := 2.3
var D := 2.6
var H := 1.8
var ww := 0.0
var hw := 1.15
var hd := 1.3
var canvas := Color.WHITE
var trim := Color.WHITE
var front := 1.3
var _rng := RandomNumberGenerator.new()


static func level_def(level: int) -> Dictionary:
	return LEVELS[clampi(level, 1, 8)]


func build(level: int) -> Dictionary:
	L = level_def(level)
	s = CampKit.new()
	c = CampKit.new()
	shapes = []
	lights = []
	_rng.seed = 9100 + level
	W = float(L["w"])
	D = float(L["d"])
	H = float(L["h"])
	ww = float(L["wall"])
	hw = W * 0.5
	hd = D * 0.5
	canvas = Color(str(L["canvas"]))
	trim = Color(str(L["trim"]))
	front = hd + 0.4
	match str(L["style"]):
		"a":
			_a_frame()
		"wall":
			_wall_tent()
		"twin":
			_twin()
	_interior()
	if L.get("groundsheet", false):
		s.paint(Color("#3f5236"), 0.7, 0.0, 0.0, CampKit.P.FABRIC)
		s.rbox(Transform3D(Basis.IDENTITY, Vector3(0.0, 0.03, 0.25)), Vector3(W + 0.1, 0.012, D + 0.5), 0.004, 1)
	if L.get("rug", false):
		_rug(Vector3(0.0, 0.045 + (0.13 if L.get("deck", false) else 0.0), hd + 0.75), Vector2(1.3, 0.85))
	if L.get("deck", false):
		_deck()
	if L.get("lantern", false):
		_door_lantern()
	if L.get("hearth", false):
		_hearth_ring(Vector3(-hw - 0.75, 0.0, hd + 0.55))
	if L.get("light", false):
		lights.append({"pos": Vector3(0.0, minf(H * 0.55, 1.7), -hd * 0.15), "color": Color(1.0, 0.72, 0.42),
			"range": maxf(W, D) * 0.95, "energy": 0.75, "kind": "warm"})
	return {"solid": s, "cloth": c, "shapes": shapes, "lights": lights, "w": W, "d": D, "h": H,
		"rest": Vector3(0.0, 0.05, -hd * 0.22), "door": Vector3(0.0, 0.9, hd + 0.3), "front": front}


# --- Styles --------------------------------------------------------------------------------

func _a_frame() -> void:
	var eave := maxf(ww, 0.06)
	var dw := W * float(L["door"]) * 0.5
	c.paint(canvas, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	for side in [-1.0, 1.0]:
		var sx: float = side
		var out := Vector3(sx, hw / H, 0.0).normalized()
		c.sheet(Vector3(0, H, -hd), Vector3(0, H, hd), Vector3(sx * hw, eave, -hd), Vector3(sx * hw, eave, hd),
			8, 6, 0.055, -out, 1.0, 3, out)
		if ww > 0.01:
			c.sheet(Vector3(sx * hw, eave + 0.02, -hd), Vector3(sx * hw, eave + 0.02, hd), Vector3(sx * (hw + 0.05), 0.0, -hd),
				Vector3(sx * (hw + 0.05), 0.0, hd), 8, 2, 0.0, Vector3.ZERO, 0.3, 3, Vector3(sx, 0, 0))
	# Back gable and front panels around a triangular door.
	c.flat_poly(PackedVector2Array([Vector2(-hw, 0), Vector2(hw, 0), Vector2(hw, eave), Vector2(0, H), Vector2(-hw, eave)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, -hd)), true)
	c.flat_poly(PackedVector2Array([Vector2(-hw, 0), Vector2(-dw, 0), Vector2(0, H), Vector2(-hw, eave)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, hd)))
	c.flat_poly(PackedVector2Array([Vector2(dw, 0), Vector2(hw, 0), Vector2(hw, eave), Vector2(0, H)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, hd)))
	# Trim: binding along the eaves and the ridge.
	s.paint(trim, 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	for side in [-1.0, 1.0]:
		var sx: float = side
		s.cylinder(Vector3(sx * (hw + 0.01), eave, -hd - 0.02), Vector3(sx * (hw + 0.01), eave, hd + 0.02), 0.022, 0.022, 6, true)
	# Rolled-up door flaps tied back along the door edges.
	for side in [-1.0, 1.0]:
		var sx: float = side
		var a := Vector3(sx * (dw + 0.04), 0.12, hd + 0.05)
		var b := Vector3(sx * 0.12, H - 0.22, hd + 0.05)
		c.paint(canvas.darkened(0.05), 0.9, 0.0, 0.0, CampKit.P.CANVAS)
		c.tube(PackedVector3Array([a, a.lerp(b, 0.5) + Vector3(sx * 0.03, 0, 0.02), b]), PackedFloat32Array([0.07, 0.06, 0.04]), 10, true)
		s.paint(trim.darkened(0.2), 1.0, 0.0, 0.0, CampKit.P.ROPE)
		s.torus(Transform3D(MeshKit.basis_y(b - a), a.lerp(b, 0.42)), 0.075, 0.012, 12, 4)
	# Poles: an A at the door, one at the back, and the ridge.
	_pole(Vector3(-dw * 0.92, -0.05, hd + 0.02), Vector3(0, H + 0.03, hd + 0.02), 0.028)
	_pole(Vector3(dw * 0.92, -0.05, hd + 0.02), Vector3(0, H + 0.03, hd + 0.02), 0.028)
	_pole(Vector3(0, -0.05, -hd - 0.03), Vector3(0, H + 0.1, -hd - 0.03), 0.03)
	_pole(Vector3(0, H + 0.025, -hd - 0.06), Vector3(0, H + 0.025, hd + 0.06), 0.025)
	_finial(Vector3(0, H + 0.12, -hd - 0.03))
	_finial(Vector3(0, H + 0.06, hd + 0.03))
	# Guy ropes.
	for side in [-1.0, 1.0]:
		var sx: float = side
		_guy(Vector3(0, H, hd + 0.03), Vector3(sx * 0.95, 0, hd + 0.95 + H * 0.2))
		_guy(Vector3(sx * hw, eave, -hd), Vector3(sx * (hw + 0.6), 0, -hd - 0.45))
		_guy(Vector3(sx * hw, eave, hd), Vector3(sx * (hw + 0.6), 0, hd + 0.4))
		if D > 2.8:
			_guy(Vector3(sx * hw, eave, 0), Vector3(sx * (hw + 0.75), 0, 0))
	_guy(Vector3(0, H, -hd - 0.03), Vector3(0, 0, -hd - 0.95 - H * 0.2))
	# Walls the player cannot walk through (the door side stays open).
	for side in [-1.0, 1.0]:
		var sx: float = side
		shapes.append(CampProps._box_shape(Vector3(0.12, 1.1, D), Transform3D(Basis.IDENTITY, Vector3(sx * (hw - 0.32), 0.55, 0))))
	shapes.append(CampProps._box_shape(Vector3(W, H * 0.8, 0.14), Transform3D(Basis.IDENTITY, Vector3(0, H * 0.4, -hd - 0.02))))
	front = hd + 1.3


func _wall_tent() -> void:
	var ov := 0.2
	var dw := W * float(L["door"]) * 0.5
	var dh := minf(ww + 0.6, H - 0.55)
	var eave := ww - 0.1
	c.paint(canvas, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	for side in [-1.0, 1.0]:
		var sx: float = side
		c.sheet(Vector3(sx * hw, ww + 0.1, -hd), Vector3(sx * hw, ww + 0.1, hd), Vector3(sx * (hw + 0.03), 0.0, -hd), Vector3(sx * (hw + 0.03), 0.0, hd),
			8, 3, 0.0, Vector3.ZERO, 0.35, 3, Vector3(sx, 0, 0))
	c.flat_poly(PackedVector2Array([Vector2(-hw, 0), Vector2(hw, 0), Vector2(hw, ww + 0.1), Vector2(0, H), Vector2(-hw, ww + 0.1)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, -hd)), true)
	c.flat_poly(PackedVector2Array([Vector2(-hw, 0), Vector2(-dw, 0), Vector2(-dw, dh), Vector2(0, H - 0.22), Vector2(0, H), Vector2(-hw, ww + 0.1)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, hd)))
	c.flat_poly(PackedVector2Array([Vector2(dw, 0), Vector2(hw, 0), Vector2(hw, ww + 0.1), Vector2(0, H), Vector2(0, H - 0.22), Vector2(dw, dh)]),
		Transform3D(Basis.IDENTITY, Vector3(0, 0, hd)))
	var roof_col := Color(str(L["fly"])) if L.has("fly") else canvas
	var fly := L.has("fly")
	c.paint(canvas if not fly else canvas.darkened(0.06), 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	for side in [-1.0, 1.0]:
		var sx: float = side
		var out := Vector3(sx, (hw + ov) / (H - eave), 0.0).normalized()
		c.sheet(Vector3(0, H, -hd - ov), Vector3(0, H, hd + ov), Vector3(sx * (hw + ov), eave, -hd - ov), Vector3(sx * (hw + ov), eave, hd + ov),
			10, 6, 0.06, -out, 0.8, 3, out)
	if fly:
		# Double wall: a darker fly sheet over the roof, reaching further out.
		c.paint(roof_col, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
		var fo := ov + 0.32
		var fe := eave - 0.32
		for side in [-1.0, 1.0]:
			var sx: float = side
			var out := Vector3(sx, (hw + fo) / (H + 0.14 - fe), 0.0).normalized()
			c.sheet(Vector3(0, H + 0.14, -hd - fo), Vector3(0, H + 0.14, hd + fo), Vector3(sx * (hw + fo), fe, -hd - fo), Vector3(sx * (hw + fo), fe, hd + fo),
				10, 6, 0.07, -out, 1.0, 3, out)
			_guy(Vector3(sx * (hw + fo), fe, -hd), Vector3(sx * (hw + fo + 0.55), 0, -hd - 0.3))
			_guy(Vector3(sx * (hw + fo), fe, hd * 0.2), Vector3(sx * (hw + fo + 0.6), 0, hd * 0.2))
	# Eave trim and rolled door flaps.
	s.paint(trim, 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	for side in [-1.0, 1.0]:
		var sx: float = side
		s.cylinder(Vector3(sx * (hw + ov), eave - 0.01, -hd - ov), Vector3(sx * (hw + ov), eave - 0.01, hd + ov), 0.024, 0.024, 6, true)
		var a := Vector3(sx * (dw + 0.05), 0.1, hd + 0.05)
		var m := Vector3(sx * (dw + 0.05), dh, hd + 0.05)
		var b := Vector3(sx * 0.1, H - 0.3, hd + 0.05)
		c.paint(canvas.darkened(0.05), 0.9, 0.0, 0.0, CampKit.P.CANVAS)
		c.tube(PackedVector3Array([a, m, b]), PackedFloat32Array([0.075, 0.065, 0.045]), 10, true)
		s.paint(trim.darkened(0.15), 1.0, 0.0, 0.0, CampKit.P.ROPE)
		s.torus(Transform3D(Basis.IDENTITY, a.lerp(m, 0.5)), 0.085, 0.012, 12, 4)
	# Frame: door posts, back pole, ridge, corner posts.
	_pole(Vector3(-dw - 0.02, -0.05, hd + 0.02), Vector3(-dw - 0.02, dh, hd + 0.02), 0.03)
	_pole(Vector3(dw + 0.02, -0.05, hd + 0.02), Vector3(dw + 0.02, dh, hd + 0.02), 0.03)
	_pole(Vector3(0, H - 0.22, hd + 0.02), Vector3(0, H + 0.12 + (0.14 if fly else 0.0), hd + 0.02), 0.03)
	_pole(Vector3(0, -0.05, -hd - 0.03), Vector3(0, H + 0.14 + (0.14 if fly else 0.0), -hd - 0.03), 0.034)
	_pole(Vector3(0, H + 0.03, -hd - ov - 0.05), Vector3(0, H + 0.03, hd + ov + 0.05), 0.028)
	_finial(Vector3(0, H + 0.2 + (0.14 if fly else 0.0), -hd - 0.03))
	if not L.get("flag", false):
		_finial(Vector3(0, H + 0.18 + (0.14 if fly else 0.0), hd + 0.02))
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_pole(Vector3(sx * (hw + 0.02), -0.05, sz * (hd + 0.02)), Vector3(sx * (hw + 0.02), ww + 0.05, sz * (hd + 0.02)), 0.026)
	if not fly:
		for side in [-1.0, 1.0]:
			var sx: float = side
			_guy(Vector3(sx * (hw + ov), eave, -hd), Vector3(sx * (hw + ov + 0.6), 0, -hd - 0.4))
			_guy(Vector3(sx * (hw + ov), eave, hd * 0.1), Vector3(sx * (hw + ov + 0.7), 0, hd * 0.1))
	_guy(Vector3(0, H, -hd - ov), Vector3(0, 0, -hd - 1.2))
	if L.get("porch", 0.0) > 0.0:
		_porch(float(L["porch"]))
	if L.get("flag", false):
		_flag(Vector3(0, H + 0.12 + (0.14 if fly else 0.0), hd + 0.02))
	if L.get("string_lights", false):
		var p := float(L.get("porch", 0.0))
		var y := maxf(H - 0.35 - 0.38, 2.0) - 0.06
		_string_lights(Vector3(-hw * 0.9, y, hd + p), Vector3(hw * 0.9, y, hd + p), 0.16)
		_string_lights(Vector3(-hw - ov, eave - 0.03, hd + ov), Vector3(-hw * 0.9, y, hd + p), 0.1)
		_string_lights(Vector3(hw + ov, eave - 0.03, hd + ov), Vector3(hw * 0.9, y, hd + p), 0.1)
	# Collision: walls around, a door gap in front.
	_wall_shapes(dw, ww + 0.1)


func _twin() -> void:
	var ov := 0.22
	var dw := W * float(L["door"]) * 0.25
	var dh := ww - 0.12
	var eave := ww - 0.18
	var pk := W * 0.235
	var roof := func(x: float, z: float) -> float:
		var best := 0.0
		for px in [-pk, pk]:
			var ax := (hw + ov - pk) if (x - float(px)) * float(px) >= 0.0 else (hw + ov + pk) * 0.62
			var dx := absf(x - float(px)) / ax
			var dz := absf(z) / (hd + ov)
			var d := pow(pow(dx, 3.0) + pow(dz, 3.0), 1.0 / 3.0)
			best = maxf(best, pow(clampf(1.0 - d, 0.0, 1.0), 1.35))
		return eave + (H - eave) * best
	# Walls whose top follows the roof, so they always tuck under it.
	c.paint(canvas, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	for side in [-1.0, 1.0]:
		var sx: float = side
		var wf := func(u: float, v: float) -> Vector3:
			var z := lerpf(-hd, hd, u)
			var top: float = roof.call(sx * hw, z) + 0.03
			return Vector3(sx * hw, lerpf(top, 0.0, v), z)
		_oriented_surface(wf, 10, 3, Vector3(sx, 0, 0), 0.3)
	var back := func(u: float, v: float) -> Vector3:
		var x := lerpf(hw, -hw, u)
		var top: float = roof.call(x, -hd) + 0.03
		return Vector3(x, lerpf(top, 0.0, v), -hd)
	_oriented_surface(back, 14, 3, Vector3(0, 0, -1), 0.3)
	for side in [-1.0, 1.0]:
		var sx: float = side
		var fr := func(u: float, v: float) -> Vector3:
			var x := lerpf(sx * dw, sx * hw, u)
			var top: float = roof.call(x, hd) + 0.03
			return Vector3(x, lerpf(top, 0.0, v), hd)
		_oriented_surface(fr, 8, 3, Vector3(0, 0, 1), 0.3)
		var lintel := func(u: float, v: float) -> Vector3:
			var x := lerpf(0.0, sx * dw, u)
			var top: float = roof.call(x, hd) + 0.03
			return Vector3(x, lerpf(top, dh, v), hd)
		_oriented_surface(lintel, 3, 1, Vector3(0, 0, 1), 0.1)
	# The twin-peaked roof.
	c.paint(canvas, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	var rf := func(u: float, v: float) -> Vector3:
		var z := lerpf(-hd - ov, hd + ov, u)
		var x := lerpf(-hw - ov, hw + ov, v)
		return Vector3(x, roof.call(x, z), z)
	var edge_fl := func(u: float, v: float) -> float:
		return 0.25 * (1.0 - smoothstep(0.0, 0.15, minf(minf(u, 1.0 - u), minf(v, 1.0 - v))))
	c.surface(rf, 16, 28, edge_fl)
	# Scalloped valance in the trim colour around the eaves.
	c.paint(trim, 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	var corners := [Vector2(-hw - ov, hd + ov), Vector2(hw + ov, hd + ov), Vector2(hw + ov, -hd - ov), Vector2(-hw - ov, -hd - ov)]
	for i in 4:
		var a2: Vector2 = corners[i]
		var b2: Vector2 = corners[(i + 1) % 4]
		var seg_len := a2.distance_to(b2)
		var nsc := maxi(int(seg_len / 0.42), 2)
		var vf := func(u: float, v: float) -> Vector3:
			var p2 := a2.lerp(b2, u)
			var top := eave + 0.01
			var bottom := top - 0.14 - 0.1 * absf(sin(u * PI * float(nsc)))
			return Vector3(p2.x, lerpf(top, bottom, v), p2.y)
		var mid := a2.lerp(b2, 0.5)
		_oriented_surface(vf, nsc * 6, 1, Vector3(mid.x, 0, mid.y), 0.6)
	# King poles with finials (or starstones) poking out of the peaks.
	for px in [-pk, pk]:
		var x: float = px
		_pole(Vector3(x, -0.05, 0), Vector3(x, H + 0.2, 0), 0.045)
		if L.get("starstones", false):
			_starstone(Vector3(x, H + 0.28, 0))
		else:
			_finial(Vector3(x, H + 0.26, 0), 0.07)
	# Door posts + rolled flaps.
	_pole(Vector3(-dw - 0.02, -0.05, hd + 0.03), Vector3(-dw - 0.02, dh + 0.05, hd + 0.03), 0.032)
	_pole(Vector3(dw + 0.02, -0.05, hd + 0.03), Vector3(dw + 0.02, dh + 0.05, hd + 0.03), 0.032)
	for side in [-1.0, 1.0]:
		var sx: float = side
		c.paint(canvas.darkened(0.05), 0.9, 0.0, 0.0, CampKit.P.CANVAS)
		c.tube(PackedVector3Array([Vector3(sx * (dw + 0.09), 0.1, hd + 0.06), Vector3(sx * (dw + 0.09), dh - 0.05, hd + 0.06)]),
			PackedFloat32Array([0.08, 0.07]), 10, true)
		s.paint(trim.darkened(0.15), 1.0, 0.0, 0.0, CampKit.P.ROPE)
		s.torus(Transform3D(Basis.IDENTITY, Vector3(sx * (dw + 0.09), dh * 0.55, hd + 0.06)), 0.09, 0.012, 12, 4)
	# Corner guy ropes.
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			_guy(Vector3(float(sx) * (hw + ov), eave, float(sz) * (hd + ov)), Vector3(float(sx) * (hw + ov + 0.55), 0, float(sz) * (hd + ov + 0.55)))
	if L.get("bunting", false):
		for px in [-pk, pk]:
			var x: float = px
			var sx := signf(x)
			_bunting(Vector3(x, H + 0.05, 0.05), Vector3(sx * (hw + ov + 0.9), 0.0, hd + ov + 1.0))
	if L.get("stove", false):
		_stove_pipe(Vector3(-hw * 0.62, 0, -hd * 0.35), roof)
	if L.get("string_lights", false):
		var y := eave - 0.18
		_string_lights(Vector3(-hw - ov, y, hd + ov + 0.02), Vector3(hw + ov, y, hd + ov + 0.02), 0.2)
		_string_lights(Vector3(-hw - ov, y, hd + ov + 0.02), Vector3(-hw - ov, y, -hd - ov), 0.18)
		_string_lights(Vector3(hw + ov, y, hd + ov + 0.02), Vector3(hw + ov, y, -hd - ov), 0.18)
	_wall_shapes(dw, ww)


# --- Details -----------------------------------------------------------------------------------

## surface() whose front face points along `outward` (flips u if needed).
func _oriented_surface(f: Callable, nu: int, nv: int, outward: Vector3, flutter: float) -> void:
	var p00: Vector3 = f.call(0.0, 0.0)
	var p10: Vector3 = f.call(1.0, 0.0)
	var p01: Vector3 = f.call(0.0, 1.0)
	var g: Callable = f
	if (p10 - p00).cross(p01 - p00).dot(outward) < 0.0:
		g = func(u: float, v: float) -> Vector3: return f.call(1.0 - u, v)
	var fl := func(_u: float, v: float) -> float: return flutter * smoothstep(0.0, 0.6, v)
	c.surface(g, nu, nv, fl)


func _pole(a: Vector3, b: Vector3, r: float) -> void:
	s.paint(Color("#8a6644"), 0.75, 0.0, 0.0, CampKit.P.PLANK_Y)
	s.cylinder(a, b, r, r * 0.92, 8, true, r * 0.3)


func _finial(p: Vector3, r: float = 0.045) -> void:
	if L.get("gold", false):
		s.paint(Color("#d9b04a"), 0.25, 0.9, 0.0)
	else:
		s.paint(Color("#7d5735"), 0.6, 0.0, 0.0, CampKit.P.PLANK_Y)
	s.sphere(p, r, 10, 6)


func _starstone(p: Vector3) -> void:
	s.paint(Color("#d9b04a"), 0.25, 0.9, 0.0)
	s.cylinder(p + Vector3(0, -0.12, 0), p + Vector3(0, -0.02, 0), 0.09, 0.06, 10, true, 0.01)
	s.paint(Color("#bfe2ff"), 0.15, 0.0, 0.3, CampKit.P.STAR)
	s.lathe(PackedVector2Array([Vector2(0, -0.04), Vector2(0.09, 0.06), Vector2(0.06, 0.2), Vector2(0, 0.3)]),
		Transform3D(Basis.IDENTITY, p), 6, 1.0, TAU, 0.0, true)
	lights.append({"pos": p + Vector3(0, 0.15, 0), "color": Color(0.62, 0.8, 1.0), "range": 6.5, "energy": 0.9, "kind": "star"})


## Rope from a high anchor to a wooden peg in the ground.
func _guy(a: Vector3, peg: Vector3) -> void:
	s.rope(a, peg + Vector3(0, 0.12, 0), 0.03 + a.distance_to(peg) * 0.01, 0.0075, Color("#d8c7a2"), 8)
	var lean := (peg - a)
	lean.y = 0.0
	lean = lean.normalized() * 0.06
	s.paint(Color("#b08a5c"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	s.cylinder(peg + Vector3(0, -0.08, 0), peg + Vector3(0, 0.16, 0) + lean, 0.02, 0.018, 6, true, 0.005)
	s.rbox(Transform3D(MeshKit.basis_y(a - peg), a.lerp(peg, 0.86)), Vector3(0.05, 0.08, 0.015), 0.005, 1)


func _interior() -> void:
	# A bedroll with a pillow, seen through the door.
	var z := -hd * 0.22
	s.paint(Color("#b04a3c"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	s.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.07, z)), Vector3(0.78, 0.13, minf(1.9, D - 0.5)), 0.06, 3)
	s.paint(Color("#3c5d7a"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	s.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.15, z + 0.35)), Vector3(0.8, 0.06, minf(1.1, D * 0.4)), 0.04, 2)
	s.paint(Color("#efe6d2"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	s.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.16, z - minf(1.9, D - 0.5) * 0.5 + 0.22)), Vector3(0.5, 0.11, 0.3), 0.05, 2)


func _rug(center: Vector3, size: Vector2) -> void:
	# A woven rug: symmetric stripes across, a cream border.
	var cols := [Color("#efe2c6"), Color("#b5483a"), Color("#e8c26a"), Color("#b5483a"), Color("#3f6e8f"),
		Color("#b5483a"), Color("#e8c26a"), Color("#b5483a"), Color("#efe2c6")]
	var widths := [0.07, 0.16, 0.06, 0.12, 0.18, 0.12, 0.06, 0.16, 0.07]
	var x := -size.x * 0.5
	for i in cols.size():
		var w: float = widths[i] * size.x / 1.0
		s.paint(cols[i], 0.95, 0.0, 0.0, CampKit.P.FABRIC)
		s.rbox(Transform3D(Basis.IDENTITY, center + Vector3(x + w * 0.5, 0.0, 0.0)), Vector3(w + 0.002, 0.02, size.y), 0.004, 1)
		x += w
	# Fringe at both ends.
	s.paint(Color("#efe2c6"), 1.0, 0.0, 0.0, CampKit.P.ROPE)
	for side in [-1.0, 1.0]:
		var z: float = center.z + float(side) * (size.y * 0.5 + 0.03)
		s.rbox(Transform3D(Basis.IDENTITY, Vector3(center.x, center.y - 0.004, z)), Vector3(size.x * 0.96, 0.008, 0.06), 0.003, 1)


func _deck() -> void:
	var dz := 1.7
	var y := 0.12
	var x0 := -hw * 0.82
	var x1 := hw * 0.82
	var n := int((dz) / 0.17)
	for i in n:
		var z := hd + 0.05 + (float(i) + 0.5) * dz / n
		s.plank(Transform3D(Basis.IDENTITY, Vector3(0, y - 0.02, z)), Vector3(x1 - x0, 0.04, dz / n - 0.012), Color("#a9784a").lerp(Color("#8f6440"), 0.3 * float(i % 2)), 0, 0.008)
	s.plank(Transform3D(Basis.IDENTITY, Vector3(0, y * 0.5 - 0.03, hd + 0.05 + dz)), Vector3(x1 - x0 + 0.08, y + 0.02, 0.08), Color("#7d5735"), 0)
	for x in [x0, x1]:
		s.plank(Transform3D(Basis.IDENTITY, Vector3(float(x), y * 0.5 - 0.03, hd + 0.05 + dz * 0.5)), Vector3(0.08, y + 0.02, dz), Color("#7d5735"), 2)
	# A walkable deck: flat top with sloped edges.
	var conv := ConvexPolygonShape3D.new()
	var pts := PackedVector3Array()
	var ex := 0.14
	for p in [Vector3(x0 - ex, 0.0, hd), Vector3(x1 + ex, 0.0, hd), Vector3(x1 + ex, 0.0, hd + dz + ex), Vector3(x0 - ex, 0.0, hd + dz + ex),
			Vector3(x0, y, hd), Vector3(x1, y, hd), Vector3(x1, y, hd + dz), Vector3(x0, y, hd + dz)]:
		pts.append(p)
	conv.points = pts
	shapes.append({"shape": conv, "xform": Transform3D.IDENTITY})
	front = maxf(front, hd + dz + 0.3)


func _porch(depth: float) -> void:
	var back_y := H - 0.35
	var front_y := maxf(back_y - 0.38, 2.0)
	var px := hw * 0.9
	c.paint(Color(str(L["fly"])) if L.has("fly") else canvas, 0.9, 0.0, 0.0, CampKit.P.CANVAS)
	c.sheet(Vector3(-px, back_y, hd + 0.02), Vector3(px, back_y, hd + 0.02), Vector3(-px, front_y, hd + depth), Vector3(px, front_y, hd + depth),
		8, 4, 0.05, Vector3.DOWN, 1.0, 1, Vector3(0, 1, 0.3))
	# Scalloped valance along the front edge.
	c.paint(trim, 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	var nsc := maxi(int(px * 2.0 / 0.4), 3)
	var vf := func(u: float, v: float) -> Vector3:
		var x := lerpf(-px, px, u)
		var bottom := front_y - 0.12 - 0.09 * absf(sin(u * PI * float(nsc)))
		return Vector3(x, lerpf(front_y + 0.01, bottom, v), hd + depth + 0.005)
	_oriented_surface(vf, nsc * 6, 1, Vector3(0, 0, 1), 0.7)
	for sx in [-1.0, 1.0]:
		var x: float = sx * px
		_pole(Vector3(x, -0.05, hd + depth), Vector3(x, front_y + 0.12, hd + depth), 0.035)
		_finial(Vector3(x, front_y + 0.17, hd + depth))
		_guy(Vector3(x, front_y + 0.05, hd + depth), Vector3(x * 1.25, 0, hd + depth + 0.85))
		var cyl := CylinderShape3D.new()
		cyl.radius = 0.07
		cyl.height = front_y
		shapes.append({"shape": cyl, "xform": Transform3D(Basis.IDENTITY, Vector3(x, front_y * 0.5, hd + depth))})
	front = maxf(front, hd + depth + 0.9)


func _flag(base: Vector3) -> void:
	s.paint(Color("#8a6644"), 0.75, 0.0, 0.0, CampKit.P.PLANK_Y)
	s.cylinder(base, base + Vector3(0, 0.95, 0), 0.016, 0.013, 6, true)
	_finial(base + Vector3(0, 0.98, 0), 0.03)
	c.paint(Color("#c8453a"), 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	c.tri_panel(base + Vector3(0.62, 0.78, 0.0), base + Vector3(0.0, 0.92, 0.0), base + Vector3(0.0, 0.6, 0.0), 6, 0.04, Vector3(0, 0, 1), Vector3(0, 0, 1))
	c.paint(Color("#f2c14e"), 0.85, 0.0, 0.0, CampKit.P.FABRIC)
	c.tri_panel(base + Vector3(0.3, 0.765, 0.008), base + Vector3(0.05, 0.83, 0.008), base + Vector3(0.05, 0.69, 0.008), 3, 0.0, Vector3.ZERO, Vector3(0, 0, 1))


func _bunting(a: Vector3, b: Vector3) -> void:
	var sag := a.distance_to(b) * 0.07
	s.rope(a, b + Vector3(0, 0.12, 0), sag, 0.006, Color("#efe2c6"), 12)
	var n := int(a.distance_to(b) / 0.34)
	for i in range(1, n - 1):
		var t := float(i) / float(n)
		var p := a.lerp(b + Vector3(0, 0.12, 0), t) + Vector3(0, -sag * 4.0 * t * (1.0 - t), 0)
		if p.y < 0.5:
			break
		var dirv := (b - a)
		dirv.y = 0.0
		dirv = dirv.normalized() * 0.1
		c.paint(Color(str(BUNTING_COLORS[i % BUNTING_COLORS.size()])), 0.85, 0.0, 0.0, CampKit.P.FABRIC)
		var side := dirv.cross(Vector3.UP).normalized()
		c.tri_panel(p + Vector3(0, -0.24, 0), p - dirv, p + dirv, 3, 0.0, Vector3.ZERO, side)
	var sx := signf(b.x)
	_guy(b + Vector3(0, 0.12, 0), b + Vector3(sx * 0.05, 0, 0.05))


func _string_lights(a: Vector3, b: Vector3, sag: float) -> void:
	s.rope(a, b, sag, 0.005, Color("#3a3530"), 12)
	var n := maxi(int(a.distance_to(b) / 0.32), 2)
	for i in range(1, n):
		var t := float(i) / float(n)
		var p := a.lerp(b, t) + Vector3(0, -sag * 4.0 * t * (1.0 - t), 0)
		s.paint(Color("#2b2b2e"), 0.5, 0.3, 0.0)
		s.cylinder(p, p + Vector3(0, -0.035, 0), 0.012, 0.012, 6, true)
		s.paint(Color(str(BULB_COLORS[i % BULB_COLORS.size()])), 0.2, 0.0, 0.15, CampKit.P.BULB)
		s.sphere(p + Vector3(0, -0.06, 0), 0.03, 8, 5)


func _door_lantern() -> void:
	var p: Vector3
	if str(L["style"]) == "a":
		var dw := W * float(L["door"]) * 0.5
		p = Vector3(-dw * 0.45 - 0.05, H * 0.5 - 0.3, hd + 0.1)
		s.paint(CampKit.IRON_COLOR, 0.5, 0.6, 0.0, CampKit.P.IRON)
		s.cylinder(p + Vector3(0, 0.27, 0), p + Vector3(0.0, 0.42, -0.04), 0.006, 0.006, 5, false)
	else:
		var dw2 := W * float(L["door"]) * (0.25 if str(L["style"]) == "twin" else 0.5)
		p = Vector3(dw2 + 0.32, 1.25, hd + 0.13)
		s.paint(CampKit.IRON_COLOR, 0.5, 0.6, 0.0, CampKit.P.IRON)
		s.cylinder(Vector3(dw2 + 0.05, 1.6, hd + 0.05), Vector3(dw2 + 0.34, 1.6, hd + 0.13), 0.01, 0.01, 5, true)
		s.cylinder(Vector3(dw2 + 0.32, 1.6, hd + 0.13), p + Vector3(0, 0.27, 0), 0.005, 0.005, 5, false)
	CampProps.lantern(s, Transform3D(Basis.IDENTITY, p))
	lights.append({"pos": p + Vector3(0, 0.12, 0.1), "color": Color(1.0, 0.74, 0.42), "range": 3.2, "energy": 0.6, "kind": "warm"})


func _hearth_ring(center: Vector3) -> void:
	for i in 8:
		var a := TAU * float(i) / 8.0 + _rng.randf_range(-0.1, 0.1)
		var sz := Vector3(0.11, 0.08, 0.09) * _rng.randf_range(0.9, 1.15)
		s.stone(center + Vector3(cos(a) * 0.36, sz.y * 0.5, sin(a) * 0.36), sz, 9300 + i, CampKit.STONE_COLOR, -a, 0.2, 9, 6)
	CampProps.kettle(s, Transform3D(Basis(Vector3.UP, 0.6), center + Vector3(0, 0.0, 0)), CampProps.ENAMEL_RED)


func _stove_pipe(at: Vector3, roof: Callable) -> void:
	var ry: float = roof.call(at.x, at.z)
	s.paint(Color("#3a3b3e"), 0.45, 0.7, 0.0, CampKit.P.IRON)
	s.cylinder(Vector3(at.x, ry - 0.3, at.z), Vector3(at.x, ry + 0.95, at.z), 0.065, 0.065, 12, true)
	s.cone(Vector3(at.x, ry + 1.02, at.z), Vector3(at.x, ry + 1.16, at.z), 0.13, 12)
	s.cylinder(Vector3(at.x, ry + 0.94, at.z), Vector3(at.x, ry + 1.02, at.z), 0.02, 0.02, 6, false)
	s.paint(Color("#b5483a"), 0.6, 0.2, 0.0)
	s.cylinder(Vector3(at.x, ry - 0.05, at.z), Vector3(at.x, ry + 0.06, at.z), 0.12, 0.09, 12, true)


func _wall_shapes(dw: float, wall_h: float) -> void:
	var h := maxf(wall_h, 1.0)
	for sx in [-1.0, 1.0]:
		shapes.append(CampProps._box_shape(Vector3(0.12, h, D), Transform3D(Basis.IDENTITY, Vector3(float(sx) * hw, h * 0.5, 0))))
		var fw := hw - dw
		shapes.append(CampProps._box_shape(Vector3(fw, h, 0.12), Transform3D(Basis.IDENTITY, Vector3(float(sx) * (dw + fw * 0.5), h * 0.5, hd))))
	shapes.append(CampProps._box_shape(Vector3(W, h, 0.12), Transform3D(Basis.IDENTITY, Vector3(0, h * 0.5, -hd))))
