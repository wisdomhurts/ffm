class_name Crafting
extends RefCounted
## Cost checking and payment across several inventories plus coins.
##
## A cost is a Dictionary of item_id -> count; the special key "coins" is paid
## from the wallet. Sources are checked/paid in the order given, so pass the
## camp storage before the player's sack to spare what the player carries.


static func available(id: String, sources: Array) -> int:
	var n := 0
	for inv in sources:
		if inv != null:
			n += (inv as Inventory).count_of(id)
	return n


## item_id -> how many more are needed (empty when affordable).
static func missing(costs: Dictionary, sources: Array, coins: int = 0) -> Dictionary:
	var out := {}
	for id in costs:
		var need := int(costs[id])
		var have := coins if id == "coins" else available(id, sources)
		if have < need:
			out[id] = need - have
	return out


static func can_afford(costs: Dictionary, sources: Array, coins: int = 0) -> bool:
	return missing(costs, sources, coins).is_empty()


## Remove the item costs from the sources (in order). Coins are NOT touched:
## the caller deducts them (GameState owns the wallet). Returns false and
## changes nothing when the items are not all available.
static func consume_items(costs: Dictionary, sources: Array) -> bool:
	for id in costs:
		if id == "coins":
			continue
		if available(id, sources) < int(costs[id]):
			return false
	for id in costs:
		if id == "coins":
			continue
		var left := int(costs[id])
		for inv in sources:
			if left <= 0:
				break
			if inv != null:
				left -= (inv as Inventory).remove(id, left)
	return true


## Human readable "3 Wood, 2 Stone" using a name lookup Callable(id)->String.
static func describe(costs: Dictionary, name_of: Callable) -> String:
	var parts: PackedStringArray = []
	for id in costs:
		parts.append("%d %s" % [int(costs[id]), str(name_of.call(id))])
	return ", ".join(parts)
