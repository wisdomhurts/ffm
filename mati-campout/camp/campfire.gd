class_name Campfire
extends Node3D
## The campfire: drives GameState.fire, emits light/warmth, feeds & relights.
## STUB: replaced by the campfire build.

var light: OmniLight3D
var interact_radius := 2.6


func setup(_game: Game) -> void:
	GameState.campfire = self
	add_to_group("interactable")
	light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.62, 0.3)
	light.position.y = 1.0
	add_child(light)
	Lights.register(self)


func _exit_tree() -> void:
	Lights.unregister(self)


func _process(delta: float) -> void:
	if not GameState.is_playing():
		return
	var raining: bool = GameState.environment != null and GameState.environment.get("raining")
	GameState.fire.burn(delta * GameState.time_scale, raining)
	light.light_energy = GameState.fire.visual_intensity() * 3.0
	light.omni_range = maxf(GameState.fire.light_radius(), 0.1)


func light_intensity_at(pos: Vector3) -> float:
	var d := Vector2(pos.x - global_position.x, pos.z - global_position.z).length()
	return GameState.fire.light_at_distance(d, DB.bf("fire.light_fear_edge", 0.35))


## 0..1 heat felt at a position.
func heat_at(pos: Vector3) -> float:
	var d := Vector2(pos.x - global_position.x, pos.z - global_position.z).length()
	return GameState.fire.heat_at_distance(d)


func get_interact_text(_player: Node) -> String:
	if GameState.fire.is_lit():
		for id in ["coal", "wood"]:
			if GameState.inventory.has(id):
				return "Add %s to fire" % DB.item_name(id)
		return ""
	return "Relight fire (1 Kindling + 1 Wood)"


func interact(_player: Node) -> void:
	var fire := GameState.fire
	if fire.is_lit():
		for id in ["coal", "wood"]:
			if GameState.inventory.has(id) and fire.add_fuel(id):
				GameState.inventory.remove(id, 1)
				Events.fire_fed.emit(id)
				return
	else:
		var srcs := GameState.crafting_sources()
		if Crafting.available("kindling", srcs) >= 1 and Crafting.available("wood", srcs) >= 1:
			Crafting.consume_items({"kindling": 1, "wood": 1}, srcs)
			fire.relight("kindling", "wood")
