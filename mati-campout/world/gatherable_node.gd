class_name GatherableNode
extends Node3D
## Lightweight interactable stand-in for one gatherable resource node.
##
## Gatherables keeps only the nodes near the player in the "interactable"
## group: it creates a GatherableNode when the player comes within a few
## metres and frees it again when they walk away, so the player's 10 Hz scan
## stays cheap. Rendering is done by the chunk meshes, not by this node.
## Everything is forwarded to the manager (null-safe).

var index := -1
var manager: Gatherables = null
var interact_radius := 2.4
var _point := Vector3.ZERO


func setup(p_manager: Gatherables, p_index: int, pos: Vector3, point: Vector3, radius: float) -> void:
	manager = p_manager
	index = p_index
	interact_radius = radius
	_point = point
	name = "Gatherable%d" % p_index
	position = pos
	add_to_group("interactable")
	add_to_group("gatherable")


func _valid() -> bool:
	return manager != null and is_instance_valid(manager) and index >= 0


func get_interact_text(player: Node) -> String:
	return manager.interact_text(index, player) if _valid() else ""


func get_interact_hint(player: Node) -> String:
	return manager.interact_hint(index, player) if _valid() else ""


func get_interact_point() -> Vector3:
	return _point


func interact(player: Node) -> void:
	if _valid():
		manager.begin_gather(index, player)


## Kind id ("stone_pile", "berry_bush"...) for tools and tests.
func get_kind() -> String:
	return manager.kind_name(index) if _valid() else ""
