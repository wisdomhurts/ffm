class_name CookingRack
extends Node3D
## A spit over the campfire (every fire level). Interact at either stake:
##   "Cook Raw Meat" / "Cook Mushroom"  puts one cookable item (has "cook_to")
##                                      from the sack on a free skewer slot
##   "Take Cooked Meat (2)"             gives the finished food (GameState.give)
## Food cooks over balance.fire.cook_seconds while the fire is lit (paused
## when it is out), turning from raw to browned while it slowly turns. It
## never burns. Progress shows in the prompt ("Cooking... 60%").
## Child of the Campfire; configure(level) re-fits it to the fire level.

const SMOKE_SHADER := "res://shaders/smoke_puff.gdshader"

var interact_radius := 1.6
## One entry per skewer: {"id", "out", "t" (0..1), "done", "node"}; id "" = empty.
var slots: Array = []
var level := 1

var _cfg: Dictionary = FirePit.cfg(1)
var _frame: MeshInstance3D
var _food_root: Node3D
var _smoke: GPUParticles3D
var _smoke_mat: ShaderMaterial
var _loop_on := false
var _spin := 0.0
var _cook_seconds := 14.0


func _init() -> void:
	name = "CookingRack"


func _ready() -> void:
	add_to_group("interactable")
	_cook_seconds = maxf(DB.bf("fire.cook_seconds", 14.0), 1.0)
	var n := clampi(DB.bi("fire.rack_slots", 3), 1, 6)
	slots.clear()
	for i in n:
		slots.append({"id": "", "out": "", "t": 0.0, "done": false, "node": null})
	_food_root = Node3D.new()
	_food_root.name = "Food"
	add_child(_food_root)
	_build_smoke()
	configure(level)


func _exit_tree() -> void:
	if _loop_on:
		Audio.stop_loop("cooking", self)
		_loop_on = false


## Re-fit the stakes and spit to the fire level (1..3).
func configure(p_level: int) -> void:
	level = clampi(p_level, 1, 3)
	_cfg = FirePit.cfg(level)
	if not is_inside_tree():
		return
	if _frame:
		_frame.queue_free()
	_frame = CampKit.instance(_build_frame(), null, "RackFrame")
	add_child(_frame)
	_food_root.position = Vector3(0.0, float(_cfg["rack_y"]), 0.0)
	for i in slots.size():
		var s: Dictionary = slots[i]
		var node: Node3D = s["node"]
		if node and is_instance_valid(node):
			node.position = Vector3(_slot_x(i), 0.0, 0.0)
	if _smoke:
		_smoke.position = Vector3(0.0, float(_cfg["rack_y"]) + 0.05, 0.0)
		(_smoke.process_material as ParticleProcessMaterial).emission_box_extents = Vector3(_span() + 0.1, 0.05, 0.08)


# --- Pure helpers -------------------------------------------------------------------------

static func cookable(id: String) -> bool:
	return id != "" and str(DB.item(id).get("cook_to", "")) != ""


static func cooked_id(id: String) -> String:
	return str(DB.item(id).get("cook_to", ""))


func slot_count() -> int:
	return slots.size()


func free_slot() -> int:
	for i in slots.size():
		if str((slots[i] as Dictionary)["id"]) == "":
			return i
	return -1


func cooking_count() -> int:
	var n := 0
	for s in slots:
		var d: Dictionary = s
		if str(d["id"]) != "" and not bool(d["done"]):
			n += 1
	return n


## Average progress (0..1) of the food still cooking.
func cook_progress() -> float:
	var n := 0
	var t := 0.0
	for s in slots:
		var d: Dictionary = s
		if str(d["id"]) != "" and not bool(d["done"]):
			n += 1
			t += float(d["t"])
	return t / n if n > 0 else 0.0


## out_id -> count of finished food waiting on the rack.
func done_summary() -> Dictionary:
	var out := {}
	for s in slots:
		var d: Dictionary = s
		if str(d["id"]) != "" and bool(d["done"]):
			var o := str(d["out"])
			out[o] = int(out.get(o, 0)) + 1
	return out


## The cookable item the player would put on: the selected one, else the
## first in the sack.
func cookable_choice() -> String:
	var sel := GameState.selected_item_id()
	if cookable(sel):
		return sel
	for i in GameState.inventory.capacity:
		var id := GameState.inventory.slot_id(i)
		if cookable(id):
			return id
	return ""


## True when the rack should win the prompt over the fire itself: food is
## ready to take, or the player is holding something to cook.
func wants_priority() -> bool:
	if not done_summary().is_empty():
		return true
	return cookable(GameState.selected_item_id()) and free_slot() >= 0 and GameState.fire.is_lit()


# --- Interactable --------------------------------------------------------------------------

func get_interact_point() -> Vector3:
	var x := float(_cfg["rack_x"])
	var a := global_transform * Vector3(x, 0.75, 0.0)
	var b := global_transform * Vector3(-x, 0.75, 0.0)
	var pl: Node3D = GameState.player
	if pl and is_instance_valid(pl):
		return a if pl.global_position.distance_squared_to(a) <= pl.global_position.distance_squared_to(b) else b
	return a


func get_interact_text(_player: Node) -> String:
	var done := done_summary()
	if not done.is_empty():
		var total := 0
		for k in done:
			total += int(done[k])
		var label := DB.item_name(str(done.keys()[0])) if done.size() == 1 else "Cooked Food"
		return "Take %s (%d)" % [label, total]
	var id := cookable_choice()
	if id != "" and free_slot() >= 0 and GameState.fire.is_lit():
		if cooking_count() > 0:
			return "Cook %s (Cooking... %d%%)" % [DB.item_name(id), int(cook_progress() * 100.0)]
		return "Cook %s" % DB.item_name(id)
	return ""


func get_interact_hint(_player: Node) -> String:
	if cooking_count() > 0:
		if not GameState.fire.is_lit():
			return "Cooking paused: relight the fire"
		return "Cooking... %d%%" % int(cook_progress() * 100.0)
	if cookable_choice() != "":
		if not GameState.fire.is_lit():
			return "Relight the fire to cook"
		if free_slot() < 0:
			return "The rack is full"
	return ""


func interact(_player: Node) -> void:
	if not done_summary().is_empty():
		take_all()
		return
	var id := cookable_choice()
	if id == "" or free_slot() < 0 or not GameState.fire.is_lit():
		Audio.play("deny", global_position, -6.0)
		return
	if GameState.inventory.remove(id, 1) < 1:
		return
	place(id)


## Put one item on the first free skewer (the caller removed it from the sack).
func place(id: String, progress: float = 0.0) -> bool:
	var i := free_slot()
	if i < 0 or not cookable(id):
		return false
	var s: Dictionary = slots[i]
	s["id"] = id
	s["out"] = cooked_id(id)
	s["t"] = clampf(progress, 0.0, 1.0)
	s["done"] = false
	var node := MeshInstance3D.new()
	node.name = "Food%d" % i
	node.mesh = ItemModels.mesh_for(id)
	node.material_override = CampKit.solid_material()
	node.scale = Vector3.ONE * 1.6
	node.position = Vector3(_slot_x(i), 0.0, 0.0)
	node.rotation = Vector3(-PI * 0.5 + _spin, 0.0, 0.0)
	_food_root.add_child(node)
	node.set_instance_shader_parameter("cook", s["t"])
	s["node"] = node
	if s["t"] >= 1.0:
		_finish(i, false)
	var p := node.global_position
	Audio.play("cook_sizzle", p)
	Events.float_text.emit(p + Vector3(0, 0.35, 0), "Cooking %s" % DB.item_name(id), Color(1.0, 0.86, 0.6))
	return true


## Hand every finished item to the player (overflow drops at the fire).
func take_all() -> int:
	var given := 0
	for i in slots.size():
		var s: Dictionary = slots[i]
		if str(s["id"]) == "" or not bool(s["done"]):
			continue
		var out := str(s["out"])
		var node: Node3D = s["node"]
		var pos := node.global_position if node and is_instance_valid(node) else global_position + Vector3(0, 1, 0)
		var left := GameState.give(out, 1)
		if left > 0:
			Pickup.spawn(out, left, pos + Vector3(0.0, 0.2, 0.9), Vector3(0.0, 2.0, 1.4))
		else:
			given += 1
		if node and is_instance_valid(node):
			node.queue_free()
		s["id"] = ""
		s["out"] = ""
		s["t"] = 0.0
		s["done"] = false
		s["node"] = null
	if given > 0:
		Audio.play("pickup", global_position + Vector3(0, 1, 0))
	return given


## Screenshot / test helper: put food on and set its progress directly.
func debug_fill(id: String, progress: float) -> void:
	place(id, progress)


## Screenshot / test helper: empty every skewer.
func debug_clear() -> void:
	for s in slots:
		var d: Dictionary = s
		var node: Node = d["node"]
		if node and is_instance_valid(node):
			node.queue_free()
		d["id"] = ""
		d["out"] = ""
		d["t"] = 0.0
		d["done"] = false
		d["node"] = null


# --- Update --------------------------------------------------------------------------------

func _process(delta: float) -> void:
	var lit := GameState.fire.is_lit()
	var dt := delta * GameState.time_scale if GameState.is_playing() else 0.0
	var cooking := cooking_count() > 0
	if cooking and lit:
		_spin += delta * 0.8
	for i in slots.size():
		var s: Dictionary = slots[i]
		if str(s["id"]) == "":
			continue
		var node: Node3D = s["node"]
		if not bool(s["done"]):
			if lit and dt > 0.0:
				s["t"] = minf(float(s["t"]) + dt / _cook_seconds, 1.0)
				if node and is_instance_valid(node):
					node.set_instance_shader_parameter("cook", s["t"])
				if float(s["t"]) >= 1.0:
					_finish(i, true)
			if node and is_instance_valid(node):
				node.rotation.x = -PI * 0.5 + _spin + float(i) * 1.3
	var want_loop := cooking and lit
	if want_loop != _loop_on:
		_loop_on = want_loop
		if want_loop:
			Audio.start_loop("cooking", self)
		else:
			Audio.stop_loop("cooking", self)
	if _smoke:
		_smoke.emitting = want_loop
		_smoke_mat.set_shader_parameter("darkness", GameState.day_cycle.darkness())


func _finish(i: int, announce: bool) -> void:
	var s: Dictionary = slots[i]
	s["t"] = 1.0
	s["done"] = true
	var node: MeshInstance3D = s["node"]
	var out := str(s["out"])
	if node and is_instance_valid(node):
		var m := ItemModels.mesh_for(out)
		if m:
			node.mesh = m
		node.set_instance_shader_parameter("cook", 0.12)
		node.rotation.x = -PI * 0.5
	if announce:
		Events.food_cooked.emit(out)
		var p := node.global_position if node and is_instance_valid(node) else global_position
		Events.float_text.emit(p + Vector3(0, 0.4, 0), "%s ready!" % DB.item_name(out), Color(1.0, 0.82, 0.4))
		Audio.play("cook_sizzle", p, -4.0)
		var pl: Node3D = GameState.player
		if pl and is_instance_valid(pl) and pl.global_position.distance_to(global_position) > 7.0:
			Events.notify.emit("%s is ready at the campfire!" % DB.item_name(out), "good")


# --- Building ------------------------------------------------------------------------------

func _span() -> float:
	return float(_cfg["rack_x"]) * 0.42


func _slot_x(i: int) -> float:
	var n := slots.size()
	if n <= 1:
		return 0.0
	return lerpf(-_span(), _span(), float(i) / float(n - 1))


func _build_frame() -> CampKit:
	var k := CampKit.new()
	var x := float(_cfg["rack_x"])
	var y := float(_cfg["rack_y"])
	# Two forked stakes.
	for side in [-1.0, 1.0]:
		var sx: float = side * x
		var lean: float = 0.03 * float(side)
		var base := Vector3(sx + lean, -0.05, 0.0)
		var fork := Vector3(sx, y - 0.04, 0.0)
		k.log_piece(base, fork, 0.035, 5100 + int(side * 3.0), false, Color("#5c4330"))
		k.paint(Color("#5c4330"), 0.95, 0.0, 0.0, CampKit.P.BARK)
		k.tube(PackedVector3Array([fork, fork + Vector3(0.0, 0.1, -0.07), fork + Vector3(0.0, 0.16, -0.08)]), PackedFloat32Array([0.026, 0.02, 0.016]), 6, true)
		k.tube(PackedVector3Array([fork, fork + Vector3(0.0, 0.1, 0.07), fork + Vector3(0.0, 0.17, 0.085)]), PackedFloat32Array([0.026, 0.02, 0.016]), 6, true)
		k.rope(fork + Vector3(0, -0.02, -0.03), fork + Vector3(0, -0.02, 0.03), 0.0, 0.03, CampKit.ROPE_COLOR, 3)
	# The spit: a peeled pole with a little crank handle.
	k.paint(Color("#c9a273"), 0.8, 0.0, 0.0, CampKit.P.PLANK_X)
	k.cylinder(Vector3(-x - 0.12, y, 0.0), Vector3(x + 0.12, y, 0.0), 0.02, 0.02, 8, true, 0.006)
	k.paint(Color("#8a6644"), 0.85, 0.0, 0.0, CampKit.P.PLANK_X)
	k.cylinder(Vector3(x + 0.12, y, 0.0), Vector3(x + 0.12, y - 0.14, 0.0), 0.015, 0.015, 6, true)
	k.cylinder(Vector3(x + 0.12, y - 0.14, 0.0), Vector3(x + 0.12, y - 0.14, 0.1), 0.015, 0.015, 6, true)
	return k


func _build_smoke() -> void:
	_smoke_mat = ShaderMaterial.new()
	_smoke_mat.shader = load(SMOKE_SHADER)
	_smoke_mat.set_shader_parameter("density", 0.32)
	_smoke_mat.set_shader_parameter("day_color", Color(0.86, 0.85, 0.84))
	_smoke_mat.set_shader_parameter("night_color", Color(0.18, 0.18, 0.22))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.5, 0.05, 0.08)
	pm.direction = Vector3.UP
	pm.spread = 15.0
	pm.initial_velocity_min = 0.3
	pm.initial_velocity_max = 0.6
	pm.gravity = Vector3(0.2, 0.25, 0.1)
	pm.damping_min = 0.1
	pm.damping_max = 0.3
	pm.scale_min = 0.25
	pm.scale_max = 0.45
	pm.scale_curve = FireFX._curve_tex([Vector2(0.0, 0.4), Vector2(1.0, 1.0)])
	pm.color_ramp = FireFX._alpha_ramp([Vector2(0.0, 0.0), Vector2(0.15, 0.7), Vector2(1.0, 0.0)])
	var quad := QuadMesh.new()
	quad.material = _smoke_mat
	_smoke = GPUParticles3D.new()
	_smoke.name = "CookSmoke"
	_smoke.process_material = pm
	_smoke.draw_pass_1 = quad
	_smoke.amount = 10
	_smoke.lifetime = 2.4
	_smoke.local_coords = false
	_smoke.emitting = false
	_smoke.visibility_aabb = AABB(Vector3(-3, -1, -3), Vector3(6, 6, 6))
	_smoke.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_smoke)
