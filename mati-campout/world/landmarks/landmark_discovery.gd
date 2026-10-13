class_name LandmarkDiscovery
extends RefCounted
## Pure "have we been here yet?" bookkeeping for the landmarks (unit-tested).
## A landmark is discovered the first time the player comes within its
## discovery radius (XZ distance); each id is reported exactly once.

## id -> {"pos": Vector2 (x, z), "r": float}
var spots: Dictionary = {}
## id -> true once discovered.
var found: Dictionary = {}


## Discovery radius for a WorldGen landmark radius (balance.landmarks:
## discover_radius_mult, discover_min_radius).
static func radius_for(base_r: float, mult: float = 1.0, min_r: float = 10.0) -> float:
	return maxf(base_r * mult, min_r)


func add(id: String, pos: Vector3, r: float) -> void:
	spots[id] = {"pos": Vector2(pos.x, pos.z), "r": r}


## Ids discovered by standing at p (newly found only, sorted for stable order).
func check(p: Vector3) -> Array:
	var out: Array = []
	var q := Vector2(p.x, p.z)
	for id in spots:
		if found.has(id):
			continue
		var s: Dictionary = spots[id]
		if q.distance_to(s["pos"]) <= float(s["r"]):
			found[id] = true
			out.append(id)
	out.sort()
	return out


## Mark as found. Returns true when it was not found before.
func mark(id: String) -> bool:
	if found.has(id):
		return false
	found[id] = true
	return true


func is_found(id: String) -> bool:
	return found.has(id)


func found_ids() -> Array:
	var out: Array = found.keys()
	out.sort()
	return out
