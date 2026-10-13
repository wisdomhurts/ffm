class_name Tent
extends Node3D
## The player's tent (groups "shelter" and "interactable"). Eight visual
## levels from data/upgrades.json (see TentBuilder), each visibly better but
## always clearly a tent. Shelters from rain and cold; resting inside heals
## faster.
##
## API:
##   set_level(n)        rebuild with a celebratory puff, Events.tent_upgraded,
##                       GameState.tent_level + stat_max("highest_tent"),
##                       grows camp storage by the level's storage_bonus
##   contains(pos) -> bool        inside the tent (Player shelter check)
##   tent_warmth() -> float       level "warmth" (55..100)
##   rest_heal_mult() -> float    level "rest_heal" (also rest_mult())
##   level_name() -> String, max_level() -> int, rest_spot() -> Vector3
## Interact: "Rest in tent" sits the player inside (player.resting = true).
## Placement: the Campsite sets door_anchor (where the door should be, in the
## parent's space) and facing (direction from the tent to the fire); the tent
## keeps its door there as it grows.

var level := 1
var interact_radius := 2.3
## Door position in the parent's space (on the ground) and the direction the
## door faces (toward the fire), set by the Campsite before adding the tent.
var door_anchor := Vector3(3.3, 0.0, -3.3)
var facing := Vector3(-0.7071, 0.0, 0.7071)
## Last build result from TentBuilder (w, d, h, rest, door, front).
var info: Dictionary = {}

var _mesh: MeshInstance3D
var _body: StaticBody3D
var _lights: Array = []
var _glow := 0.0
var _t := 0.0
var _rest_hint_shown := false


func _init() -> void:
	name = "Tent"


func _ready() -> void:
	add_to_group("shelter")
	add_to_group("interactable")
	_body = StaticBody3D.new()
	_body.name = "TentBody"
	_body.collision_layer = 1
	_body.collision_mask = 0
	add_child(_body)
	level = clampi(GameState.tent_level, 1, max_level())
	_rebuild()


## Upgrade (or set) the tent level, with a celebration when it changes
## (celebrate = false for screenshots / loading).
func set_level(n: int, celebrate: bool = true) -> void:
	n = clampi(n, 1, max_level())
	var changed := n != level
	level = n
	_rebuild()
	GameState.tent_level = n
	GameState.stat_max("highest_tent", n)
	_apply_storage_bonus()
	if changed and celebrate:
		var r := maxf(float(info.get("w", 2.5)), float(info.get("d", 2.5))) * 0.55
		FireSparks.celebrate(global_position, r)
		Events.tent_upgraded.emit(n)
		Events.float_text.emit(global_position + Vector3(0, float(info.get("h", 2.0)) + 0.6, 0), level_name() + "!", Color(1.0, 0.86, 0.45))


func max_level() -> int:
	var t: Dictionary = DB.upgrades.get("tent", {})
	return clampi(int(t.get("max_level", 8)), 1, TentBuilder.LEVELS.size())


func level_def() -> Dictionary:
	var lv: Array = (DB.upgrades.get("tent", {}) as Dictionary).get("levels", [])
	if level - 1 < lv.size():
		return lv[level - 1]
	return {}


func level_name() -> String:
	return str(level_def().get("name", "Tent"))


func tent_warmth() -> float:
	return float(level_def().get("warmth", 55.0))


func rest_heal_mult() -> float:
	return float(level_def().get("rest_heal", 1.5))


## Same as rest_heal_mult() (the Player asks for rest_mult()).
func rest_mult() -> float:
	return rest_heal_mult()


func rain_shelter() -> bool:
	return bool(level_def().get("rain_shelter", true))


## True when a world position is inside the tent.
func contains(pos: Vector3) -> bool:
	if info.is_empty():
		return false
	var p := to_local(pos)
	var hw := float(info["w"]) * 0.5
	var hd := float(info["d"]) * 0.5
	return absf(p.x) < hw - 0.05 and p.z > -hd and p.z < hd + 0.15 and p.y > -0.6 and p.y < float(info["h"])


func rest_spot() -> Vector3:
	return global_transform * (info.get("rest", Vector3.ZERO) as Vector3)


# --- Interactable --------------------------------------------------------------------------

func get_interact_point() -> Vector3:
	return global_transform * (info.get("door", Vector3(0, 0.9, 1.3)) as Vector3)


func _resting_inside(player: Node) -> bool:
	var p3 := player as Node3D
	if p3 == null or not is_instance_valid(p3):
		return false
	return p3.get("resting") == true and contains(p3.global_position)


func get_interact_text(player: Node) -> String:
	if _resting_inside(player):
		return ""
	return "Rest in tent"


func get_interact_hint(player: Node) -> String:
	if _resting_inside(player):
		return "Resting... move to get up"
	return ""


func interact(player: Node) -> void:
	var p3 := player as Node3D
	if p3 == null or not is_instance_valid(p3):
		return
	var spot := rest_spot()
	if p3.has_method("teleport"):
		p3.call("teleport", spot)
	if p3.has_method("look_at_point"):
		p3.call("look_at_point", spot + global_transform.basis.z * 3.0 + Vector3(0, 0.8, 0))
	if "resting" in p3:
		p3.set("resting", true)
	Events.float_text.emit(spot + Vector3(0, 1.4, 0), "Zzz...", Color(0.85, 0.9, 1.0))
	if not _rest_hint_shown:
		_rest_hint_shown = true
		Events.notify.emit("Resting in the tent keeps you warm and heals you faster.", "info")


# --- Building ------------------------------------------------------------------------------

func _rebuild() -> void:
	var b := TentBuilder.new()
	info = b.build(level)
	_place()
	if _mesh:
		_mesh.queue_free()
	_mesh = CampKit.instance(b.s, b.c, "TentMesh")
	add_child(_mesh)
	for ch in _body.get_children():
		ch.queue_free()
	for e in b.shapes:
		var d: Dictionary = e
		var cs := CollisionShape3D.new()
		cs.shape = d["shape"]
		cs.transform = d["xform"]
		_body.add_child(cs)
	for l in _lights:
		(l as Node).queue_free()
	_lights.clear()
	for e in b.lights:
		var d: Dictionary = e
		var ol := OmniLight3D.new()
		ol.light_color = d["color"]
		ol.omni_range = float(d["range"])
		ol.omni_attenuation = 1.3
		ol.shadow_enabled = false
		ol.light_specular = 0.15
		ol.light_volumetric_fog_energy = 0.5
		ol.position = d["pos"]
		ol.set_meta("energy", float(d["energy"]))
		ol.set_meta("kind", str(d["kind"]))
		ol.visible = false
		add_child(ol)
		_lights.append(ol)


## Keep the door at door_anchor, facing the fire, snapped to the ground.
func _place() -> void:
	var dir := Vector3(facing.x, 0.0, facing.z)
	if dir.length() < 0.01:
		dir = Vector3.BACK
	dir = dir.normalized()
	var hd := float(info.get("d", 2.6)) * 0.5
	var c := door_anchor - dir * hd
	var gen := GameState.world_gen
	var parent3 := get_parent() as Node3D
	var base_y := parent3.global_position.y if parent3 else 0.0
	if gen:
		var hw := float(info.get("w", 2.3)) * 0.5
		var right := Vector3.UP.cross(dir).normalized()
		var lowest := INF
		for p in [Vector3.ZERO, right * hw + dir * hd, -right * hw + dir * hd, right * hw - dir * hd, -right * hw - dir * hd]:
			var q: Vector3 = c + (p as Vector3)
			var wq := q + Vector3(0, base_y, 0) if parent3 == null else parent3.global_transform * q
			lowest = minf(lowest, gen.height_at(wq.x, wq.z))
		c.y = lowest - base_y - 0.02
	position = c
	basis = Basis(Vector3.UP, atan2(dir.x, dir.z))


func _apply_storage_bonus() -> void:
	var base := DB.bi("camp.storage_slots", 16)
	var bonus := int(level_def().get("storage_bonus", 0))
	var want := base + bonus
	if GameState.storage.capacity < want:
		GameState.storage.set_capacity(want)


func _process(delta: float) -> void:
	_t += delta
	var dark := GameState.day_cycle.darkness()
	var lit := GameState.fire.is_lit()
	var want := smoothstep(0.15, 0.6, dark) * (1.0 if lit else 0.0)
	_glow = move_toward(_glow, want, delta * 0.7)
	if _mesh:
		_mesh.set_instance_shader_parameter("lamp", _glow)
	for l in _lights:
		var ol := l as OmniLight3D
		var e := float(ol.get_meta("energy", 0.6))
		var amt := _glow
		if str(ol.get_meta("kind", "warm")) == "star":
			amt = smoothstep(0.15, 0.6, dark) * (1.0 if lit else 0.55)
		ol.light_energy = e * amt * (1.0 + 0.05 * sin(_t * 3.1 + ol.position.x))
		ol.visible = amt > 0.01
