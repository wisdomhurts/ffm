class_name StorageBox
extends Node3D
## The camp storage box (GameState.storage): a wooden chest with iron bands
## and a rounded lid. Interact: "Open Storage Box" opens the storage window
## (Events.request_modal("storage", {})). Faces local +Z.

var interact_radius := 2.2
var _mesh: MeshInstance3D


func _init() -> void:
	name = "StorageBox"


func _ready() -> void:
	add_to_group("interactable")
	var k := CampKit.new()
	_build(k)
	_mesh = CampKit.instance(k, null, "BoxMesh")
	add_child(_mesh)
	var body := StaticBody3D.new()
	body.name = "BoxBody"
	body.collision_layer = 1
	body.collision_mask = 0
	body.set_meta("surface", "wood")
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.05, 0.75, 0.65)
	cs.shape = box
	cs.position = Vector3(0, 0.37, 0)
	body.add_child(cs)
	add_child(body)


func get_interact_point() -> Vector3:
	return global_transform * Vector3(0.0, 0.55, 0.35)


func get_interact_text(_player: Node) -> String:
	var used := GameState.storage.used_slots()
	if used > 0:
		return "Open Storage Box (%d/%d)" % [used, GameState.storage.capacity]
	return "Open Storage Box"


func interact(_player: Node) -> void:
	Events.request_modal.emit("storage", {})


func _build(k: CampKit) -> void:
	var w := 1.0
	var h := 0.48
	var d := 0.6
	var wood := Color("#9a6a3e")
	for i in 3:
		var y := 0.05 + (h - 0.05) * (float(i) + 0.5) / 3.0
		var c := wood.lerp(Color("#7e5432"), 0.3 * float(i % 2))
		k.plank(Transform3D(Basis.IDENTITY, Vector3(0, y, d * 0.5)), Vector3(w, h / 3.0 - 0.006, 0.035), c, 0, 0.01)
		k.plank(Transform3D(Basis.IDENTITY, Vector3(0, y, -d * 0.5)), Vector3(w, h / 3.0 - 0.006, 0.035), c, 0, 0.01)
	k.plank(Transform3D(Basis.IDENTITY, Vector3(w * 0.5, h * 0.5 + 0.02, 0)), Vector3(0.04, h, d), wood, 2, 0.01)
	k.plank(Transform3D(Basis.IDENTITY, Vector3(-w * 0.5, h * 0.5 + 0.02, 0)), Vector3(0.04, h, d), wood, 2, 0.01)
	k.plank(Transform3D(Basis.IDENTITY, Vector3(0, 0.025, 0)), Vector3(w, 0.05, d), Color("#6e4a2c"), 0)
	# Rounded lid (barrel-top) along X.
	k.paint(wood.lerp(Color("#b5824f"), 0.3), 0.8, 0.0, 0.0, CampKit.P.PLANK_X)
	var lid_y := h + 0.02
	var prof := PackedVector2Array()
	for i in 9:
		var a := PI * float(i) / 8.0
		prof.append(Vector2(cos(a) * d * 0.52, sin(a) * 0.17))
	var lid_f := func(u: float, v: float) -> Vector3:
		var idx := clampf(v * 8.0, 0.0, 8.0)
		var i0 := int(floor(idx))
		var i1 := mini(i0 + 1, 8)
		var p := prof[i0].lerp(prof[i1], idx - float(i0))
		return Vector3(lerpf(-w * 0.52, w * 0.52, u), lid_y + p.y, p.x)
	k.surface(lid_f, 4, 16)
	# Lid end caps.
	for sx in [-1.0, 1.0]:
		var poly := PackedVector2Array()
		for p in prof:
			poly.append(Vector2(p.x, p.y))
		k.paint(wood.darkened(0.1), 0.8, 0.0, 0.0, CampKit.P.PLANK_Z)
		k.extrude(poly, 0.03, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(float(sx) * w * 0.52, lid_y, 0.0)))
	# Iron bands, corners and a latch.
	k.paint(CampKit.IRON_COLOR, 0.45, 0.65, 0.0, CampKit.P.IRON)
	for x in [-w * 0.32, w * 0.32]:
		var xx: float = x
		k.rbox(Transform3D(Basis.IDENTITY, Vector3(xx, h * 0.5 + 0.02, d * 0.5 + 0.02)), Vector3(0.06, h, 0.012), 0.004, 1)
		k.rbox(Transform3D(Basis.IDENTITY, Vector3(xx, h * 0.5 + 0.02, -d * 0.5 - 0.02)), Vector3(0.06, h, 0.012), 0.004, 1)
		var band := func(u: float, v: float) -> Vector3:
			var idx := clampf(v * 8.0, 0.0, 8.0)
			var i0 := int(floor(idx))
			var i1 := mini(i0 + 1, 8)
			var p := prof[i0].lerp(prof[i1], idx - float(i0))
			return Vector3(xx + (u - 0.5) * 0.06, lid_y + p.y * 1.06 + 0.004, p.x * 1.04)
		k.surface(band, 1, 16)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, h - 0.02, d * 0.5 + 0.03)), Vector3(0.1, 0.12, 0.02), 0.01, 2)
	k.paint(Color("#c9a24a"), 0.3, 0.9, 0.0)
	k.torus(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, h - 0.06, d * 0.5 + 0.045)), 0.025, 0.006, 12, 4)
