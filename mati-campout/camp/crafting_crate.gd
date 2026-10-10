class_name CraftingCrate
extends Node3D
## The big crafting crate at camp: a sturdy plank crate with iron corners,
## tools on top (hand saw, hammer, a coil of rope), a little lantern and a
## chalkboard that says "CRAFT". Interact: "Open Crafting Crate" opens the
## crafting window (Events.request_modal("crafting", {})).
## Faces local +Z (the side with the chalkboard).

const BOARD_T := Transform3D(Basis(Vector3.RIGHT, -0.26), Vector3(0.2, 0.2, 0.48))

var interact_radius := 2.4
var _mesh: MeshInstance3D
var _lamp_on := 0.0


func _init() -> void:
	name = "CraftingCrate"


func _ready() -> void:
	add_to_group("interactable")
	var k := CampKit.new()
	_build(k)
	_mesh = CampKit.instance(k, null, "CrateMesh")
	add_child(_mesh)
	var sign_label := Label3D.new()
	sign_label.name = "ChalkText"
	sign_label.text = "CRAFT"
	sign_label.font = ThemeFactory.font("display_bold")
	sign_label.font_size = 64
	sign_label.pixel_size = 0.0021
	sign_label.modulate = Color(0.94, 0.94, 0.9)
	sign_label.outline_size = 0
	sign_label.shaded = true
	sign_label.double_sided = false
	sign_label.alpha_cut = Label3D.ALPHA_CUT_DISCARD
	sign_label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	# On the chalkboard leaning against the front of the crate.
	sign_label.transform = BOARD_T * Transform3D(Basis.IDENTITY, Vector3(0.0, 0.0, 0.021))
	add_child(sign_label)
	var body := StaticBody3D.new()
	body.name = "CrateBody"
	body.collision_layer = 1
	body.collision_mask = 0
	body.set_meta("surface", "wood")
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.4, 0.95, 0.9)
	cs.shape = box
	cs.position = Vector3(0, 0.47, 0)
	body.add_child(cs)
	add_child(body)


func get_interact_point() -> Vector3:
	return global_transform * Vector3(0.0, 0.7, 0.5)


func get_interact_text(_player: Node) -> String:
	return "Open Crafting Crate"


func interact(_player: Node) -> void:
	Events.request_modal.emit("crafting", {})


func _process(delta: float) -> void:
	var want := 0.0
	if GameState.fire.is_lit():
		want = smoothstep(0.15, 0.6, GameState.day_cycle.darkness())
	_lamp_on = move_toward(_lamp_on, want, delta * 0.7)
	_mesh.set_instance_shader_parameter("lamp", _lamp_on * 0.8)


func _build(k: CampKit) -> void:
	var w := 1.3
	var h := 0.85
	var d := 0.8
	var wood := Color("#a8794a")
	# Side planks (horizontal) on all four sides.
	for i in 4:
		var y := 0.06 + (h - 0.08) * (float(i) + 0.5) / 4.0
		var c := wood.lerp(Color("#8e6440"), 0.25 * float(i % 2))
		k.plank(Transform3D(Basis.IDENTITY, Vector3(0, y, d * 0.5)), Vector3(w, 0.19, 0.035), c, 0, 0.01)
		k.plank(Transform3D(Basis.IDENTITY, Vector3(0, y, -d * 0.5)), Vector3(w, 0.19, 0.035), c, 0, 0.01)
		k.plank(Transform3D(Basis.IDENTITY, Vector3(w * 0.5, y, 0)), Vector3(0.035, 0.19, d), c, 2, 0.01)
		k.plank(Transform3D(Basis.IDENTITY, Vector3(-w * 0.5, y, 0)), Vector3(0.035, 0.19, d), c, 2, 0.01)
	# Lid planks (slightly overhanging) and the bottom.
	for i in 5:
		var z := -d * 0.5 + d * (float(i) + 0.5) / 5.0
		k.plank(Transform3D(Basis.IDENTITY, Vector3(0, h, z)), Vector3(w + 0.08, 0.045, d / 5.0 - 0.012), wood.lerp(Color("#bf905d"), 0.3 * float(i % 2)), 0, 0.01)
	k.plank(Transform3D(Basis.IDENTITY, Vector3(0, 0.02, 0)), Vector3(w, 0.04, d), Color("#7d5735"), 0)
	# Corner posts and iron corner brackets.
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var cx: float = sx * (w * 0.5 + 0.01)
			var cz: float = sz * (d * 0.5 + 0.01)
			k.plank(Transform3D(Basis.IDENTITY, Vector3(cx, h * 0.5, cz)), Vector3(0.07, h, 0.07), Color("#7d5735"), 1, 0.012)
			k.paint(CampKit.IRON_COLOR, 0.5, 0.6, 0.0, CampKit.P.IRON)
			for y in [0.1, h - 0.08]:
				k.rbox(Transform3D(Basis.IDENTITY, Vector3(cx, y, cz)), Vector3(0.1, 0.06, 0.1), 0.01, 1)
	# Rope handles on the sides.
	for sx in [-1.0, 1.0]:
		var x: float = sx * (w * 0.5 + 0.03)
		k.rope(Vector3(x, 0.6, -0.15), Vector3(x, 0.6, 0.15), 0.07, 0.014)
	# Tools on the lid: hand saw, hammer, a coil of rope.
	var top := h + 0.025
	k.paint(Color("#b7bcc2"), 0.32, 0.85, 0.0)
	k.extrude(PackedVector2Array([Vector2(-0.3, 0.0), Vector2(0.18, 0.0), Vector2(0.18, 0.11), Vector2(-0.3, 0.06)]), 0.004,
		Transform3D(Basis(Vector3.RIGHT, -PI * 0.5) * Basis(Vector3.FORWARD, 0.0), Vector3(-0.15, top + 0.003, 0.12)), 0.0)
	k.paint(Color("#8a4b2a"), 0.6, 0.0, 0.0, CampKit.P.PLANK_X)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.1, top + 0.02, 0.16)), Vector3(0.14, 0.035, 0.09), 0.012, 2)
	# Hammer.
	k.paint(Color("#c49a66"), 0.7, 0.0, 0.0, CampKit.P.PLANK_X)
	k.cylinder(Vector3(0.2, top + 0.016, -0.18), Vector3(0.5, top + 0.016, -0.1), 0.014, 0.016, 8, true, 0.004)
	k.paint(Color("#3c3d40"), 0.4, 0.75, 0.0, CampKit.P.IRON)
	k.rbox(Transform3D(Basis(Vector3.UP, -0.26), Vector3(0.52, top + 0.025, -0.095)), Vector3(0.04, 0.04, 0.14), 0.008, 2)
	# Rope coil.
	k.paint(CampKit.ROPE_COLOR, 1.0, 0.0, 0.0, CampKit.P.ROPE)
	for i in 3:
		k.torus(Transform3D(Basis.IDENTITY, Vector3(-0.42, top + 0.015 + 0.022 * i, -0.14)), 0.11 - 0.012 * i, 0.014, 20, 5)
	# Lantern on the back corner of the lid.
	CampProps.lantern(k, Transform3D(Basis.IDENTITY, Vector3(0.5, top, 0.25)))
	# Chalkboard leaning on the front.
	k.plank(BOARD_T, Vector3(0.52, 0.38, 0.03), Color("#6b4a2f"), 0, 0.01)
	k.paint(Color("#2b3430"), 0.95, 0.0, 0.0, CampKit.P.CHALK)
	k.rbox(BOARD_T * Transform3D(Basis.IDENTITY, Vector3(0, 0, 0.012)), Vector3(0.46, 0.32, 0.012), 0.004, 1)
