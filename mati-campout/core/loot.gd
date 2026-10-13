class_name Loot
extends RefCounted
## Deterministic loot rolls from loot_tables.json definitions.
##
## Table format:
##   {"rolls": [min, max], "guaranteed": [{id, min, max}], "entries": [{id, weight, min, max}]}
## The id "nothing" is a blank roll; "coins" is currency, not an item.
## Returns a merged Array of {"id": String, "count": int}.


static func roll(table: Dictionary, rng: RandomNumberGenerator) -> Array:
	var bag := {}
	for g in table.get("guaranteed", []):
		_add(bag, str(g["id"]), rng.randi_range(int(g.get("min", 1)), int(g.get("max", 1))))
	var entries: Array = table.get("entries", [])
	var total_weight := 0.0
	for e in entries:
		total_weight += float(e.get("weight", 1.0))
	if total_weight > 0.0:
		var rolls_range: Array = table.get("rolls", [1, 1])
		var rolls := rng.randi_range(int(rolls_range[0]), int(rolls_range[1]))
		for _i in rolls:
			var pick := rng.randf() * total_weight
			for e in entries:
				pick -= float(e.get("weight", 1.0))
				if pick <= 0.0:
					_add(bag, str(e["id"]), rng.randi_range(int(e.get("min", 1)), int(e.get("max", 1))))
					break
	var out: Array = []
	for id in bag:
		out.append({"id": id, "count": int(bag[id])})
	return out


static func _add(bag: Dictionary, id: String, count: int) -> void:
	if id == "nothing" or count <= 0:
		return
	bag[id] = int(bag.get(id, 0)) + count
