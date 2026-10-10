class_name Pickup
extends Node3D
## A dropped item in the world. STUB: replaced by the player/items build.

var item_id := ""
var count := 1


static func spawn(id: String, n: int, pos: Vector3, _impulse: Vector3 = Vector3.ZERO) -> Pickup:
	var p := Pickup.new()
	p.item_id = id
	p.count = n
	var parent: Node = GameState.game.get("pickups") if GameState.game else null
	if parent == null:
		return null
	parent.add_child(p)
	p.global_position = pos
	return p
