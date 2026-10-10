class_name LighthouseSite
extends LandmarkSite
## Moonmirror Lighthouse on the lake headland: a ~22 m whitewashed tower
## with red bands, a gallery with a railing, a glazed lantern room with a
## Fresnel lens, and a walkable keeper's room on the ground floor (desk,
## the island map on the wall, shelves, a glowing display case, the keeper's
## chest). At night the lens blazes and a beam sweeps slowly over the lake:
## two soft additive light cones + a lamp flare that flashes when the beam
## passes the camera, plus an unshadowed SpotLight3D (not on "phone").
## Local frame: door toward the trail (+Z), floor raised 0.45 m (steps up).

const R0 := 3.7          # outer radius at the ground
const R1 := 2.5          # outer radius under the gallery
const TOP := 17.6        # top of the tower shaft
const WALL := 0.45
const FLOOR := 0.45
const CEIL := 3.3
const DOOR_W := 1.3
const DOOR_H := 2.3
const LAMP_Y := 19.85
const BANDS := [[5.0, 7.4], [11.0, 13.4]]

var beam_pivot: Node3D = null
var beam_mesh: MeshInstance3D = null
var flare: MeshInstance3D = null
var spot: SpotLight3D = null
var lamp_light: OmniLight3D = null
var beam_angle := 0.0
## Screenshots: hold the beam at this pivot angle (NAN = rotate normally).
var hold_angle := NAN
var _beam_mat: ShaderMaterial = null
var _flare_mat: ShaderMaterial = null
var _night := 0.0


func _init() -> void:
	far_range = 0.0
	near_range = 95.0


static func outer_r(y: float) -> float:
	return R0 - (R0 - R1) * clampf(y / TOP, 0.0, 1.0)


func build_site() -> void:
	_tower()
	_gallery_and_lantern()
	_door_and_steps()
	_interior()
	_grounds()
	_collision()
	_beam()


# --- Tower ------------------------------------------------------------------------------------

func _band_color(y0: float, y1: float) -> Color:
	for b in BANDS:
		if y0 >= float(b[0]) - 0.01 and y1 <= float(b[1]) + 0.01:
			return LandmarkKit.RED_PAINT
	return LandmarkKit.WHITE_PAINT


func _shaft_piece(y0: float, y1: float, a0: float, arc: float, seg: int) -> void:
	big.paint(_band_color(y0, y1), 0.8, 0.0, 0.0, LandmarkKit.LP.WHITEWASH)
	big.lathe(PackedVector2Array([Vector2(outer_r(y0), y0), Vector2(outer_r(y1), y1)]), Transform3D.IDENTITY, seg, 1.0, arc, a0)


func _tower() -> void:
	var gap := (DOOR_W * 0.5 + 0.06) / R0
	var door_a := PI * 0.5           # local +Z (lathe angles run from +X toward +Z)
	var a0 := door_a + gap
	var arc := TAU - gap * 2.0
	# Stone base course (with the door gap) and its chamfered top.
	big.paint(Color("#a39d92"), 0.9, 0.0, 0.0, LandmarkKit.LP.MASONRY)
	big.ao_grad = 0.25
	big.lathe(PackedVector2Array([Vector2(R0 + 0.3, -0.9), Vector2(R0 + 0.3, 0.95)]), Transform3D.IDENTITY, 44, 1.0, arc, a0)
	big.ao_grad = 0.0
	big.lathe(PackedVector2Array([Vector2(R0 + 0.3, 0.95), Vector2(outer_r(1.2) + 0.01, 1.2)]), Transform3D.IDENTITY, 44, 1.0, arc, a0)
	# Whitewashed shaft: the door zone with a gap, then full rings with bands.
	_shaft_piece(1.2, FLOOR + DOOR_H, a0, arc, 44)
	var cuts := [FLOOR + DOOR_H, 5.0, 7.4, 11.0, 13.4, TOP]
	for i in cuts.size() - 1:
		_shaft_piece(float(cuts[i]), float(cuts[i + 1]), 0.0, TAU, 48)
	# Wall thickness at the door: stone jambs and lintel (dressed masonry).
	var r_in := R0 - WALL
	var jamb_c := Color("#b9b2a6")
	var zb := r_in - 0.05
	var zf := R0 + 0.34
	for s in [-1.0, 1.0]:
		var sd: float = s
		LandmarkProps.block(big, Transform3D(Basis.IDENTITY, Vector3(sd * (DOOR_W * 0.5 + 0.13), FLOOR + DOOR_H * 0.5 - 0.3, (zb + zf) * 0.5)),
			Vector3(0.26, DOOR_H + 0.6, zf - zb), jamb_c, LandmarkKit.LP.MASONRY, 0.9)
	LandmarkProps.block(big, Transform3D(Basis.IDENTITY, Vector3(0, (FLOOR + DOOR_H + CEIL + 0.04) * 0.5, (zb + zf) * 0.5 + 0.02)),
		Vector3(DOOR_W + 0.6, CEIL + 0.04 - FLOOR - DOOR_H, zf - zb + 0.04), jamb_c, LandmarkKit.LP.MASONRY, 0.9)
	# Threshold through the wall.
	LandmarkProps.block(big, Transform3D(Basis.IDENTITY, Vector3(0, FLOOR - 0.12, (zb + zf) * 0.5)), Vector3(DOOR_W + 0.1, 0.24, zf - zb), Color("#8f8a80"), LandmarkKit.LP.MASONRY, 0.9)
	# A little red hood over the door, sloping outward.
	LandmarkProps.slat(big, Transform3D(Basis(Vector3.RIGHT, 0.32), Vector3(0, CEIL + 0.14, zf + 0.22)), Vector3(DOOR_W + 0.9, 0.06, 0.6), Color("#8e2f27"))
	for s in [-1.0, 1.0]:
		var sd: float = s
		LandmarkProps.slat(big, Transform3D(Basis(Vector3.RIGHT, -0.75), Vector3(sd * (DOOR_W * 0.5 + 0.3), CEIL - 0.1, zf + 0.16)), Vector3(0.06, 0.06, 0.5), Color("#5a3a22"))
	# Windows climbing the tower.
	var wins := [[6.3, 0.9], [9.6, -2.2], [13.0, 2.6], [15.6, -0.6], [2.0, 3.6]]
	for w in wins:
		_window(float(w[0]), float(w[1]))
	# Inside walls (plaster over a plank wainscot) up to the ceiling.
	big.paint(Color("#e9e0cf"), 0.9, 0.0, 0.0, LandmarkKit.LP.WHITEWASH)
	big.lathe(PackedVector2Array([Vector2(r_in, CEIL), Vector2(r_in, FLOOR + 1.0)]), Transform3D.IDENTITY, 40, 1.0, arc, a0)
	big.paint(Color("#8a6040"), 0.85, 0.0, 0.0, CampKit.P.PLANK_Y)
	big.lathe(PackedVector2Array([Vector2(r_in - 0.03, FLOOR + 1.0), Vector2(r_in - 0.03, FLOOR)]), Transform3D.IDENTITY, 40, 1.0, arc, a0)
	big.paint(Color("#6e4c30"), 0.85, 0.0, 0.0, CampKit.P.PLANK_X)
	big.torus(Transform3D(Basis(Vector3.UP, -a0), Vector3(0, FLOOR + 1.0, 0)), r_in - 0.04, 0.03, 40, 4, arc - 0.02, 1.0)
	# Ceiling (plaster with beams) and the floor (planks).
	big.paint(Color("#dcd2bf"), 0.92, 0.0, 0.0, MeshKit.Pat.NONE)
	big.disc(Vector3(0, CEIL, 0), Vector3.DOWN, r_in + 0.02, 32)
	for i in 3:
		var x := (float(i) - 1.0) * 1.4
		var half := sqrt(maxf(r_in * r_in - x * x, 0.1))
		LandmarkProps.slat(big, Transform3D(Basis.IDENTITY, Vector3(x, CEIL - 0.1, 0)), Vector3(0.18, 0.2, half * 2.0), Color("#6e4c30"))
	big.paint(Color("#9a6c44"), 0.8, 0.0, 0.0, CampKit.P.PLANK_X)
	big.disc(Vector3(0, FLOOR, 0), Vector3.UP, r_in + 0.02, 32)
	# The underside of the lintel band (inside the door opening top).
	big.paint(Color("#d8d0c0"), 0.9, 0.0, 0.0, MeshKit.Pat.NONE)
	big.disc(Vector3(0, FLOOR + DOOR_H + 0.01, R0 - WALL * 0.5), Vector3.DOWN, 0.1, 4)


## A small window (dark glass, white frame) on the shaft at height y.
func _window(y: float, ang: float) -> void:
	var r := outer_r(y)
	var d := Vector3(sin(ang), 0.0, cos(ang))
	var b := Basis(Vector3.UP, ang)
	var p := d * (r + 0.02) + Vector3(0, y, 0)
	LandmarkProps.block(big, Transform3D(b, p), Vector3(0.82, 1.24, 0.12), Color("#2f5d4a"), CampKit.P.PAINT, 0.7)
	big.paint(Color("#1d2630"), 0.08, 0.3, 0.0, MeshKit.Pat.NONE)
	big.rbox(Transform3D(b, p + d * 0.035), Vector3(0.62, 1.04, 0.08), 0.01, 1)
	LandmarkProps.block(big, Transform3D(b, p + d * 0.08), Vector3(0.05, 1.04, 0.03), Color("#f1ece2"), MeshKit.Pat.NONE, 0.7)
	LandmarkProps.block(big, Transform3D(b, p + d * 0.08), Vector3(0.62, 0.05, 0.03), Color("#f1ece2"), MeshKit.Pat.NONE, 0.7)
	LandmarkProps.block(big, Transform3D(b, p + d * 0.1 + Vector3(0, -0.66, 0)), Vector3(0.95, 0.08, 0.22), Color("#d9d2c4"), LandmarkKit.LP.MASONRY, 0.85)


# --- Gallery, lantern room, lens ----------------------------------------------------------------

func _gallery_and_lantern() -> void:
	var deck_r := 3.35
	# Corbels under the gallery.
	for i in 20:
		var a := TAU * float(i) / 20.0
		var d := Vector3(cos(a), 0.0, sin(a))
		var b := Basis(Vector3.UP, -a)
		LandmarkProps.block(big, Transform3D(b, d * (R1 + 0.32) + Vector3(0, TOP - 0.25, 0)), Vector3(0.7, 0.5, 0.18), Color("#d9d2c4"), LandmarkKit.LP.WHITEWASH, 0.85)
	# Deck slab (iron plates).
	big.paint(Color("#55585c"), 0.6, 0.3, 0.0, LandmarkKit.LP.METAL)
	big.ring(Vector3(0, TOP + 0.3, 0), 0.0, deck_r, 48)
	big.paint(Color("#d9d2c4"), 0.85, 0.0, 0.0, LandmarkKit.LP.WHITEWASH)
	big.ring(Vector3(0, TOP, 0), R1 - 0.05, deck_r, 48, true)
	big.paint(Color("#4a4c50"), 0.75, 0.1, 0.0, LandmarkKit.LP.METAL)
	big.wall_arc(Vector3(0, 0, 0), deck_r, TOP, TOP + 0.3, 0.0, TAU, 48)
	# Railing: posts, two rails.
	var rail_r := deck_r - 0.12
	var top_y := TOP + 0.3 + 1.05
	big.paint(LandmarkKit.DARK_METAL, 0.45, 0.6, 0.0, LandmarkKit.LP.METAL)
	for i in 24:
		var a := TAU * float(i) / 24.0
		var p := Vector3(cos(a) * rail_r, 0, sin(a) * rail_r)
		big.cylinder(p + Vector3(0, TOP + 0.3, 0), p + Vector3(0, top_y, 0), 0.025, 0.025, 6, false)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, top_y, 0)), rail_r, 0.035, 64, 6)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, TOP + 0.85, 0)), rail_r, 0.02, 64, 5)
	# Lantern room: low wall, mullions, glass, cornice, dome, ventilator.
	var lr := 1.75
	var y0 := TOP + 0.3
	var y_glass := y0 + 0.9
	var y_top := y_glass + 2.1
	big.paint(LandmarkKit.WHITE_PAINT, 0.7, 0.1, 0.0, LandmarkKit.LP.WHITEWASH)
	big.lathe(PackedVector2Array([Vector2(lr, y0), Vector2(lr, y_glass), Vector2(lr - 0.06, y_glass + 0.04)]), Transform3D.IDENTITY, 32)
	big.paint(Color("#8e2f27"), 0.5, 0.25, 0.0, LandmarkKit.LP.METAL)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, y_glass, 0)), lr - 0.02, 0.05, 32, 5)
	big.paint(LandmarkKit.DARK_METAL, 0.4, 0.6, 0.0, LandmarkKit.LP.METAL)
	var panes := 10
	for i in panes:
		var a := TAU * float(i) / panes
		var p := Vector3(cos(a), 0, sin(a)) * (lr - 0.08)
		big.rbox(Transform3D(Basis(Vector3.UP, -a), p + Vector3(0, (y_glass + y_top) * 0.5, 0)), Vector3(0.07, y_top - y_glass, 0.07), 0.01, 1)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, y_glass + 1.05, 0)), lr - 0.08, 0.018, 40, 4)
	glass.paint(Color(0.8, 0.9, 0.95), 0.05, 0.0, 0.0)
	glass.lathe(PackedVector2Array([Vector2(lr - 0.1, y_glass + 0.02), Vector2(lr - 0.1, y_top - 0.02)]), Transform3D.IDENTITY, panes * 2)
	# Cornice and dome.
	big.paint(Color("#8e2f27"), 0.5, 0.3, 0.0, LandmarkKit.LP.METAL)
	big.lathe(PackedVector2Array([Vector2(0.0, y_top - 0.02), Vector2(lr + 0.12, y_top - 0.02), Vector2(lr + 0.12, y_top - 0.02),
		Vector2(lr + 0.14, y_top + 0.18), Vector2(lr + 0.14, y_top + 0.18), Vector2(lr + 0.02, y_top + 0.22)]), Transform3D.IDENTITY, 40)
	var dome := PackedVector2Array()
	for i in 9:
		var t := float(i) / 8.0
		dome.append(Vector2((lr + 0.02) * cos(t * PI * 0.5) * (1.0 - 0.15 * t), y_top + 0.22 + sin(t * PI * 0.5) * 1.25))
	big.lathe(dome, Transform3D.IDENTITY, 40)
	big.paint(LandmarkKit.DARK_METAL, 0.35, 0.7, 0.0, LandmarkKit.LP.METAL)
	big.sphere(Vector3(0, y_top + 1.55, 0), 0.26, 14, 9)
	big.cylinder(Vector3(0, y_top + 1.7, 0), Vector3(0, y_top + 2.9, 0), 0.03, 0.015, 6, true)
	# Weather vane arrow.
	big.paint(Color("#c9a25a"), 0.35, 0.8, 0.0, MeshKit.Pat.NONE)
	big.rbox(Transform3D(Basis.IDENTITY, Vector3(0.05, y_top + 2.55, 0)), Vector3(0.9, 0.04, 0.02), 0.01, 1)
	big.extrude(PackedVector2Array([Vector2(0.0, 0.12), Vector2(0.22, 0.0), Vector2(0.0, -0.12)]), 0.025, Transform3D(Basis.IDENTITY, Vector3(0.48, y_top + 2.55, 0)))
	big.extrude(PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.18, 0.16), Vector2(0.22, 0.0), Vector2(0.18, -0.16)]), 0.02, Transform3D(Basis.IDENTITY, Vector3(-0.58, y_top + 2.55, 0)))
	# The lens on its pedestal.
	big.paint(Color("#3a3b3e"), 0.4, 0.7, 0.0, LandmarkKit.LP.METAL)
	big.lathe(PackedVector2Array([Vector2(0.0, y0), Vector2(0.42, y0), Vector2(0.3, y0 + 0.2), Vector2(0.18, y0 + 0.9), Vector2(0.3, y0 + 1.0), Vector2(0.0, y0 + 1.02)]), Transform3D.IDENTITY, 16)
	big.paint(Color("#c9a25a"), 0.3, 0.8, 0.0, MeshKit.Pat.NONE)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, LAMP_Y - 0.66, 0)), 0.5, 0.04, 24, 5)
	big.torus(Transform3D(Basis.IDENTITY, Vector3(0, LAMP_Y + 0.66, 0)), 0.42, 0.035, 24, 5)
	big.paint(Color("#ffffff"), 0.05, 0.2, 1.0, LandmarkKit.LP.LENS)
	var lens := PackedVector2Array()
	for i in 11:
		var t := float(i) / 10.0
		lens.append(Vector2(0.36 + 0.16 * sin(t * PI), LAMP_Y - 0.66 + 1.32 * t))
	big.lathe(lens, Transform3D.IDENTITY, 24)
	# Inside the lantern room the beam comes from here.
	lantern_light(Vector3(0, LAMP_Y, 0), 2.4, 13.0, Color(1.0, 0.8, 0.52), false, "lamp")


# --- Door, steps, path ---------------------------------------------------------------------------

func _door_and_steps() -> void:
	# The door leaf stands open against the outside wall (hinged on the left).
	var hinge := Vector3(-(DOOR_W * 0.5 + 0.02), FLOOR, R0 + 0.42)
	var open_b := Basis(Vector3.UP, -2.75)
	var dt := Transform3D(open_b, hinge)
	for i in 5:
		var x := 0.13 + 0.26 * i
		LandmarkProps.slat(big, dt * Transform3D(Basis.IDENTITY, Vector3(x, DOOR_H * 0.5, 0.0)), Vector3(0.25, DOOR_H - 0.04, 0.05), Color("#2f5d4a").lerp(Color("#3d6e57"), float(i % 2) * 0.5))
	for y in [0.35, DOOR_H - 0.35]:
		LandmarkProps.slat(big, dt * Transform3D(Basis.IDENTITY, Vector3(DOOR_W * 0.5, float(y), -0.04)), Vector3(DOOR_W - 0.06, 0.12, 0.035), Color("#2a5242"))
	big.paint(Color("#c9a25a"), 0.3, 0.8, 0.0, MeshKit.Pat.NONE)
	big.sphere(dt * Vector3(DOOR_W - 0.12, 1.05, 0.05), 0.04, 8, 5)
	# Stone steps up to the raised floor.
	var c := Color("#9b968c")
	for i in 3:
		var h := FLOOR * float(3 - i) / 3.0
		var z0 := R0 + 0.3 + 0.36 * i
		var top := h
		var bottom := gmin(0.0, z0 + 0.18, 0.8) - 0.25
		LandmarkProps.block(detail, Transform3D(Basis.IDENTITY, Vector3(0, (top + bottom) * 0.5, z0 + 0.18)), Vector3(DOOR_W + 0.5 - 0.1 * i, top - bottom, 0.38), c.lerp(Color("#867f74"), float(i) * 0.3), LandmarkKit.LP.MASONRY, 0.92)
	# Flat stepping stones toward the trail.
	var z := R0 + 1.6
	var k := 0
	while z < 13.5:
		var wobble := sin(float(k) * 1.7) * 0.25
		var g := gy(wobble, z)
		if g < -1.4:
			break
		detail.stone(Vector3(wobble, g + 0.02, z), Vector3(0.42, 0.06, 0.34) * (0.9 + 0.2 * sin(float(k) * 2.3)), 5100 + k, Color("#8f8b84"), float(k) * 0.9, 0.12, 10, 5)
		z += 0.85
		k += 1
	zone(0.0, R0 + 0.9, 1.1)


# --- Keeper's room -----------------------------------------------------------------------------------

func _interior() -> void:
	var r_in := R0 - WALL
	var f := FLOOR
	# Desk under the map (west wall), chair, oil lamp, open logbook.
	var desk_t := Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(-(r_in - 0.5), f, 0.25))
	LandmarkProps.desk(detail, desk_t, 1.3, 0.6)
	LandmarkProps.chair(detail, Transform3D(Basis(Vector3.UP, -PI * 0.5), Vector3(-(r_in - 1.2), f, 0.15)))
	_oil_lamp(desk_t * Vector3(-0.42, 0.785, 0.05))
	var book := desk_t * Transform3D(Basis(Vector3.UP, 0.2), Vector3(0.12, 0.8, 0.06))
	LandmarkProps.block(detail, book * Transform3D(Basis(Vector3.BACK, 0.08), Vector3(-0.12, 0.0, 0)), Vector3(0.24, 0.025, 0.32), Color("#efe4c8"), LandmarkKit.LP.PAPER, 0.95)
	LandmarkProps.block(detail, book * Transform3D(Basis(Vector3.BACK, -0.08), Vector3(0.12, 0.0, 0)), Vector3(0.24, 0.025, 0.32), Color("#efe4c8"), LandmarkKit.LP.PAPER, 0.95)
	LandmarkProps.block(detail, book * Transform3D(Basis.IDENTITY, Vector3(0, -0.018, 0)), Vector3(0.52, 0.015, 0.34), Color("#6b2c22"), MeshKit.Pat.LEATHER, 0.7)
	detail.paint(Color("#f3efe6"), 0.6, 0.0, 0.0, MeshKit.Pat.NONE)
	detail.cylinder(book * Vector3(0.3, 0.0, 0.1), book * Vector3(0.38, 0.18, -0.05), 0.006, 0.012, 5, true)
	var note := LandmarkNote.new("Read the Keeper's Log", notes_for("lighthouse"))
	note.position = desk_t * Vector3(0.0, 0.85, 0.2)
	note.interact_radius = 2.2
	add_child(note)
	_wall_map(r_in)
	# Shelves on the east wall.
	LandmarkProps.shelves(detail, Transform3D(Basis(Vector3.UP, -PI * 0.5), Vector3(r_in - 0.36, f, 0.4)), 6200, 1.3, 3)
	# Display case (back right) with a glowing starstone and a little boat.
	var ca := -PI * 0.25
	var cp := Vector3(cos(ca), 0, sin(ca)) * (r_in - 0.62) + Vector3(0, f, 0)
	var case_t := Transform3D(Basis(Vector3.UP, atan2(-cp.x, -cp.z)), cp)
	_display_case(case_t)
	# Ladder to the hatch (back left).
	var la := -PI * 0.75
	var foot := Vector3(cos(la), 0, sin(la)) * (r_in - 0.75) + Vector3(0, f, 0)
	var top := Vector3(cos(la), 0, sin(la)) * (r_in - 0.32) + Vector3(0, CEIL, 0)
	LandmarkProps.ladder(detail, foot, top, Vector3(-sin(la), 0, cos(la)), 0.5)
	LandmarkProps.slat(big, Transform3D(Basis(Vector3.UP, la), Vector3(cos(la), 0, sin(la)) * (r_in - 0.55) + Vector3(0, CEIL - 0.015, 0)), Vector3(0.8, 0.04, 0.8), Color("#6e4c30"))
	# Rug, barrel and a coil of rope by the door.
	var rug_bands := [[0.0, 0.42, "#2f4f6e"], [0.42, 0.52, "#d8b45e"], [0.52, 1.08, "#9c3d33"], [1.08, 1.17, "#d8b45e"], [1.17, 1.45, "#7c2f2a"]]
	for band in rug_bands:
		detail.paint(Color(str(band[2])), 0.95, 0.0, 0.0, CampKit.P.FABRIC)
		detail.ring(Vector3(0, f + 0.012, 0.2), float(band[0]), float(band[1]), 36, false, 0.0, TAU, 0.66)
	var ba := PI * 0.5 + 0.75
	LandmarkProps.barrel(detail, Transform3D(Basis.IDENTITY, Vector3(cos(ba), 0, sin(ba)) * (r_in - 0.45) + Vector3(0, f, 0)), 6301, 0.85, 0.28)
	var ra := PI * 0.5 - 0.8
	var rope_c := Vector3(cos(ra), 0, sin(ra)) * (r_in - 0.45) + Vector3(0, f, 0)
	detail.paint(CampKit.ROPE_COLOR, 1.0, 0.0, 0.0, CampKit.P.ROPE)
	for i in 4:
		detail.torus(Transform3D(Basis.IDENTITY, rope_c + Vector3(0, 0.03 + 0.045 * i, 0)), 0.24 - 0.012 * i, 0.025, 18, 5)
	# The keeper's chest at the back, facing the door.
	chest_spot(Vector3(0, f, -(r_in - 0.78)), 0.0, Vector3(0.8, 0.0, R0 + 2.4))
	# A warm indoor lamp (on by day too: the room has no windows).
	lantern_light(Vector3(0, CEIL - 0.45, 0.3), 0.9, 4.4, Color(1.0, 0.78, 0.5), true, "indoor")


## A brass oil lamp with a glowing glass chimney (glows by day and night).
func _oil_lamp(p: Vector3) -> void:
	detail.paint(Color("#b98d42"), 0.3, 0.85, 0.0, MeshKit.Pat.NONE)
	detail.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.08, 0), Vector2(0.09, 0.03), Vector2(0.07, 0.09), Vector2(0.04, 0.11), Vector2(0, 0.115)]), Transform3D(Basis.IDENTITY, p), 14)
	detail.paint(Color("#ffd28a"), 0.1, 0.0, 2.8, MeshKit.Pat.NONE)
	detail.lathe(PackedVector2Array([Vector2(0, 0.11), Vector2(0.045, 0.12), Vector2(0.055, 0.17), Vector2(0.035, 0.26), Vector2(0.03, 0.3), Vector2(0, 0.3)]), Transform3D(Basis.IDENTITY, p), 14)


## The island map, framed on the wall above the desk (the real painted map
## when the terrain can draw one, else a parchment sketch).
func _wall_map(r_in: float) -> void:
	var c := Vector3(-(r_in - 0.13), FLOOR + 1.75, 0.25)
	var b := Basis(Vector3.UP, PI * 0.5)
	var t := Transform3D(b, c)
	var w := 1.15
	var h := 0.86
	# Frame.
	for e in [[Vector3(0, h * 0.5, 0), Vector3(w + 0.12, 0.06, 0.05)], [Vector3(0, -h * 0.5, 0), Vector3(w + 0.12, 0.06, 0.05)],
			[Vector3(w * 0.5, 0, 0), Vector3(0.06, h, 0.05)], [Vector3(-w * 0.5, 0, 0), Vector3(0.06, h, 0.05)]]:
		LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, e[0]), e[1], Color("#5a3a22"))
	var img: Image = null
	var terr: Variant = game.get("terrain") if game else null
	if terr is Object and (terr as Object).has_method("get_map_image"):
		var v: Variant = (terr as Object).call("get_map_image", 256)
		if v is Image:
			img = v
	if img == null:
		LandmarkProps.block(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, 0, 0.0)), Vector3(w, h, 0.012), LandmarkKit.PAPER_COLOR, LandmarkKit.LP.PAPER, 0.95)
		return
	var quad := QuadMesh.new()
	quad.size = Vector2(w, h)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = ImageTexture.create_from_image(img)
	mat.albedo_color = Color(1.0, 0.93, 0.8)
	mat.roughness = 0.92
	mat.uv1_scale = Vector3(h / w, 1.0, 1.0)
	mat.uv1_offset = Vector3((1.0 - h / w) * 0.5, 0.0, 0.0)
	quad.material = mat
	var mi := MeshInstance3D.new()
	mi.name = "WallMap"
	mi.mesh = quad
	mi.transform = t * Transform3D(Basis.IDENTITY, Vector3(0, 0, 0.012))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.visibility_range_end = 40.0
	add_child(mi)
	LandmarkProps.block(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, 0, -0.004)), Vector3(w, h, 0.012), Color("#3a2c20"), MeshKit.Pat.NONE, 0.95)


## Wooden cabinet with a glass top: a glowing starstone, a toy boat.
func _display_case(t: Transform3D) -> void:
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.42, 0)), Vector3(0.9, 0.84, 0.5), Color("#7a4f2e"))
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, 0.86, 0)), Vector3(0.96, 0.04, 0.56), Color("#5a3a22"))
	for x in [-0.45, 0.45]:
		for z in [-0.25, 0.25]:
			LandmarkProps.block(detail, t * Transform3D(Basis.IDENTITY, Vector3(x, 1.12, z)), Vector3(0.035, 0.48, 0.035), Color("#c9a25a"), MeshKit.Pat.NONE, 0.35, 0.8)
	LandmarkProps.slat(detail, t * Transform3D(Basis.IDENTITY, Vector3(0, 1.37, 0)), Vector3(0.96, 0.04, 0.56), Color("#5a3a22"))
	glass.paint(Color(0.8, 0.9, 0.95), 0.05)
	glass.rbox(t * Transform3D(Basis.IDENTITY, Vector3(0, 1.12, 0)), Vector3(0.9, 0.46, 0.5), 0.005, 1)
	# Velvet cushion and the starstone.
	detail.paint(Color("#4a2a5e"), 0.9, 0.0, 0.0, CampKit.P.FABRIC)
	detail.rbox(t * Transform3D(Basis.IDENTITY, Vector3(-0.15, 0.91, 0)), Vector3(0.3, 0.06, 0.3), 0.03, 2)
	detail.paint(Color("#9fd4ff"), 0.15, 0.0, 1.0, CampKit.P.STAR)
	for i in 5:
		var a := TAU * float(i) / 5.0
		var tip := t * Vector3(-0.15 + cos(a) * 0.05, 1.12 + 0.03 * sin(a * 2.0), sin(a) * 0.05)
		var base := t * Vector3(-0.15, 0.95, 0)
		detail.cylinder(base, tip, 0.04, 0.0, 6, true)
	detail.cylinder(t * Vector3(-0.15, 0.94, 0), t * Vector3(-0.15, 1.17, 0), 0.05, 0.0, 6, true)
	# A toy sailing boat.
	var bt := t * Transform3D(Basis.IDENTITY, Vector3(0.2, 0.9, 0.0))
	detail.paint(Color("#b8352c"), 0.6, 0.0, 0.0, CampKit.P.PAINT)
	detail.ellipsoid(bt * Vector3(0, 0.04, 0), Vector3(0.16, 0.05, 0.05), 10, 5)
	detail.paint(Color("#e9e2d2"), 0.8, 0.0, 0.0, CampKit.P.FABRIC)
	detail.extrude(PackedVector2Array([Vector2(0.0, 0.07), Vector2(0.11, 0.07), Vector2(0.0, 0.3)]), 0.006, bt * Transform3D(Basis.IDENTITY, Vector3(-0.02, 0, 0)))
	lantern_light(t * Vector3(0, 1.2, 0.0), 0.35, 1.8, Color(0.55, 0.75, 1.0), true, "indoor")
	zone(t.origin.x, t.origin.z, 0.6)


# --- Around the tower ------------------------------------------------------------------------------

func _grounds() -> void:
	# Lantern post by the steps.
	var lp := LandmarkProps.lantern_post(detail, lxf(1.7, R0 + 1.3, 0.0, 0.2), 6400, true, 2.3)
	add_shapes(lp["shapes"])
	lantern_light(lp["flame"], 1.1, 6.5)
	zone(1.7, R0 + 1.3, 0.35)
	# Oil barrels and a crate against the wall (right of the door).
	for e in [[2.89, 3.45, 0], [3.55, 2.77, 1], [2.3, 3.98, 2]]:
		var ex: float = e[0]
		var ez: float = e[1]
		var i: int = e[2]
		if i < 2:
			add_shapes(LandmarkProps.barrel(detail, lxf(ex, ez, float(i), 0.3), 6500 + i, 0.92, 0.3, Color("#5f6a5a") if i == 0 else Color("#8a5d38")))
			zone(ex, ez, 0.35)
		else:
			add_shapes(LandmarkProps.crate(detail, lxf(ex, ez, 0.4, 0.35), Vector3(0.62, 0.5, 0.55), 6510))
			zone(ex, ez, 0.42)
	# A bench looking out over the lake behind the tower.
	var bz := -(R0 + 2.4)
	add_shapes(LandmarkProps.bench(detail, lxf(0.0, bz, PI, 0.6), 1.6, Color("#8d7a62")))
	zone(0.0, bz, 0.8)
	# Signpost by the path.
	sign_board(Vector3(-2.0, 0, R0 + 4.2), 0.2, "Moonmirror\nLighthouse", Color("#2f5d4a"), 1.5, 1.75)
	# Boulders around the headland edge.
	for i in 9:
		var a := TAU * float(i) / 9.0 + 0.3
		var r := 7.4 + sin(float(i) * 2.1) * 1.2
		var x := cos(a) * r
		var z := sin(a) * r
		if z > R0 + 1.0 and absf(x) < 2.5:
			continue
		var s := 0.5 + 0.35 * absf(sin(float(i) * 3.3))
		big.stone(Vector3(x, gy(x, z) + 0.05, z), Vector3(0.9, 0.55, 0.75) * s, 6600 + i, Color("#8c8880"), a, 0.3, 12, 7)


# --- Collision -------------------------------------------------------------------------------------

func _collision() -> void:
	var r_in := R0 - WALL
	var n := 16
	var rm := (r_in + R0 + 0.3) * 0.5
	var th := R0 + 0.3 - r_in
	var w := TAU * rm / n * 1.08
	for i in n:
		var a := PI * 0.5 + TAU * float(i) / n
		if i == 0:
			continue  # the door
		var d := Vector3(cos(a), 0, sin(a))
		box(Vector3(w, CEIL + 1.2, th), Transform3D(Basis(Vector3.UP, -a + PI * 0.5), d * rm + Vector3(0, (CEIL + 1.2) * 0.5 - 0.6, 0)))
	# Door jambs (narrow the gap to the real opening) and lintel.
	for s in [-1.0, 1.0]:
		var sd: float = s
		box(Vector3(0.3, CEIL + 1.2, th + 0.3), Transform3D(Basis.IDENTITY, Vector3(sd * (DOOR_W * 0.5 + 0.15), (CEIL + 1.2) * 0.5 - 0.6, R0 - WALL * 0.5 + 0.1)))
	box(Vector3(DOOR_W + 0.4, CEIL + 1.0 - (FLOOR + DOOR_H), th + 0.3), Transform3D(Basis.IDENTITY, Vector3(0, (FLOOR + DOOR_H + CEIL + 1.0) * 0.5, R0 - WALL * 0.5 + 0.1)))
	# Upper tower (solid for the camera and creatures), following the taper.
	cyl(r_in + 0.1, 0.5, Transform3D(Basis.IDENTITY, Vector3(0, CEIL + 0.25, 0)))
	var cuts := [CEIL + 0.5, 8.0, 13.0, TOP]
	for i in cuts.size() - 1:
		var y0: float = cuts[i]
		var y1: float = cuts[i + 1]
		cyl(outer_r(y1) - 0.05, y1 - y0, Transform3D(Basis.IDENTITY, Vector3(0, (y0 + y1) * 0.5, 0)))
	# Raised floor + threshold + a ramp over the steps.
	cyl(r_in + 0.05, FLOOR + 0.6, Transform3D(Basis.IDENTITY, Vector3(0, FLOOR - (FLOOR + 0.6) * 0.5, 0)))
	var th_z0 := r_in - 0.1
	var th_z1 := R0 + 0.35
	box(Vector3(DOOR_W + 0.1, 0.6, th_z1 - th_z0), Transform3D(Basis.IDENTITY, Vector3(0, FLOOR - 0.3, (th_z0 + th_z1) * 0.5)))
	var foot_z := R0 + 0.3 + 0.36 * 3.0 + 0.05
	var g := gy(0.0, foot_z)
	box_between(Vector3(0, minf(g, 0.0) - 0.04, foot_z), Vector3(0, FLOOR - 0.06, R0 + 0.3), DOOR_W + 0.4, 0.12)
	# Interior furniture.
	box(Vector3(0.65, 0.8, 1.35), Transform3D(Basis.IDENTITY, Vector3(-(r_in - 0.5), FLOOR + 0.4, 0.25)))
	var ca := -PI * 0.25
	var cp := Vector3(cos(ca), 0, sin(ca)) * (r_in - 0.62)
	box(Vector3(0.95, 1.4, 0.55), Transform3D(Basis(Vector3.UP, atan2(-cp.x, -cp.z)), cp + Vector3(0, FLOOR + 0.7, 0)))
	box(Vector3(1.3, 1.5, 0.32), Transform3D(Basis(Vector3.UP, -PI * 0.5), Vector3(r_in - 0.2, FLOOR + 0.75, 0.4)))
	zone(0.0, 0.0, R0 + 0.35)


# --- The beam ----------------------------------------------------------------------------------------

func _beam() -> void:
	beam_pivot = Node3D.new()
	beam_pivot.name = "BeamPivot"
	beam_pivot.position = Vector3(0, LAMP_Y, 0)
	add_child(beam_pivot)
	_beam_mat = ShaderMaterial.new()
	_beam_mat.shader = load(LandmarkKit.BEAM) as Shader
	_beam_mat.set_shader_parameter("intensity", 0.0)
	var length := DB.bf("landmarks.beam_range", 260.0)
	beam_mesh = MeshInstance3D.new()
	beam_mesh.name = "BeamCones"
	beam_mesh.mesh = beam_cones_mesh(length, 0.45, length * 0.06, -0.012)
	beam_mesh.material_override = _beam_mat
	beam_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam_mesh.visible = false
	beam_mesh.extra_cull_margin = 4.0
	beam_pivot.add_child(beam_mesh)
	_flare_mat = ShaderMaterial.new()
	_flare_mat.shader = load(LandmarkKit.FLARE) as Shader
	_flare_mat.set_shader_parameter("intensity", 0.0)
	var quad := QuadMesh.new()
	quad.size = Vector2(9.0, 9.0)
	flare = MeshInstance3D.new()
	flare.name = "LampFlare"
	flare.mesh = quad
	flare.material_override = _flare_mat
	flare.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flare.position = Vector3(0, LAMP_Y, 0)
	flare.visible = false
	flare.extra_cull_margin = 8.0
	add_child(flare)
	if Settings.quality() != "phone":
		_make_spot()


## The unshadowed SpotLight3D riding on the beam (not on the "phone" preset).
func _make_spot() -> void:
	if spot != null or beam_pivot == null:
		return
	var length := DB.bf("landmarks.spot_range", 110.0)
	spot = SpotLight3D.new()
	spot.name = "BeamSpot"
	spot.light_color = Color(1.0, 0.86, 0.64)
	spot.spot_range = length
	spot.spot_angle = 7.0
	spot.spot_angle_attenuation = 0.8
	spot.spot_attenuation = 0.4
	spot.shadow_enabled = false
	spot.light_specular = 0.4
	spot.light_volumetric_fog_energy = 1.2
	spot.light_energy = 0.0
	spot.visible = false
	# Points along the pivot's +X, a little downward, so its pool of light
	# sweeps the water and the far shore.
	spot.transform = Transform3D(Basis(Vector3.UP, -PI * 0.5) * Basis(Vector3.RIGHT, -0.12), Vector3(0.6, 0, 0))
	beam_pivot.add_child(spot)


func apply_quality() -> void:
	super.apply_quality()
	if Settings.quality() != "phone":
		_make_spot()


## Two opposite open cones along ±X from the lens (UV.y = 0 at the lens,
## 1 at the far end). `tilt` lowers the far end a little.
static func beam_cones_mesh(length: float, r0: float, r1: float, tilt: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var seg := 20
	var rings := 4
	for side in [1.0, -1.0]:
		var sd: float = side
		for i in rings:
			for j in seg:
				for q in 6:
					var di: int = [0, 1, 1, 0, 1, 0][q]
					var dj: int = [0, 0, 1, 0, 1, 1][q]
					var t := float(i + di) / rings
					var a := TAU * float(j + dj) / seg
					var r := lerpf(r0, r1, t)
					var x := sd * length * t
					var n := Vector3(-sd * (r1 - r0) / length, cos(a), sin(a)).normalized()
					st.set_normal(n)
					st.set_uv(Vector2(float(j + dj) / seg, t))
					st.add_vertex(Vector3(x, cos(a) * r - tilt * length * t, sin(a) * r))
	return st.commit()


func update_site(delta: float, darkness: float, cam: Camera3D) -> void:
	if beam_pivot == null:
		return
	_night = move_toward(_night, smoothstep(0.15, 0.6, darkness), delta * 0.5)
	var on := _night > 0.01
	beam_mesh.visible = on
	flare.visible = on
	if spot:
		spot.visible = on and Settings.quality() != "phone"
	if not on:
		return
	var period := maxf(DB.bf("landmarks.beam_period", 14.0), 2.0)
	beam_angle = fposmod(beam_angle + delta * TAU / period, TAU)
	if not is_nan(hold_angle):
		beam_angle = hold_angle
	beam_pivot.rotation.y = beam_angle
	_beam_mat.set_shader_parameter("intensity", 0.4 * _night)
	if spot:
		spot.light_energy = 9.0 * _night
	# Flare: a steady glow plus a flash when one of the beams sweeps past us.
	var flash := 0.0
	if cam:
		var to_cam := cam.global_position - beam_pivot.global_position
		to_cam.y = 0.0
		if to_cam.length_squared() > 1.0:
			var dir := beam_pivot.global_transform.basis.x
			dir.y = 0.0
			var c := absf(dir.normalized().dot(to_cam.normalized()))
			flash = pow(c, 60.0)
	_flare_mat.set_shader_parameter("intensity", _night * (0.55 + 2.2 * flash))


## World direction the (first) beam points to.
func beam_direction() -> Vector3:
	return beam_pivot.global_transform.basis.x if beam_pivot else Vector3.RIGHT
