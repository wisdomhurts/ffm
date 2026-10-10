class_name Vegetation
extends Node3D
## Trees (regular + giant Elder Trees), bushes, ferns, flowers, grass, rocks.
## STUB: replaced by the vegetation build. Keep the public API below.

func setup(_game: Game) -> void:
	GameState.vegetation = self


func find_tree(_pos: Vector3, _radius: float) -> int:
	return -1


func tree_info(_id: int) -> Dictionary:
	return {}


func hit_tree(_id: int, _power: int, _can_fell_giant: bool, _from: Vector3) -> Dictionary:
	return {"ok": false, "felled": false, "reason": "no trees yet"}


func obstacles_near(_pos: Vector3, _radius: float) -> Array:
	return []
