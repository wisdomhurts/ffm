class_name LocalLeaderboard
extends RefCounted
## Top runs stored on this computer. This is a LOCAL leaderboard only.
##
## The interface (submit/top/best) is what a future online provider would
## implement too; an online version must validate scores server-side and must
## never trust a client-submitted number on its own.

var entries: Array = []
var max_entries: int = 10


## entry: {"nights": int, "name": String, "date": String, "stats": Dictionary, "seed": int}
## Returns the 1-based rank the entry earned, or 0 if it did not place.
func submit(entry: Dictionary) -> int:
	var e := entry.duplicate(true)
	e["nights"] = int(e.get("nights", 0))
	entries.append(e)
	entries.sort_custom(_better)
	var rank := entries.find(e) + 1
	if entries.size() > max_entries:
		entries.resize(max_entries)
	if rank > max_entries:
		return 0
	return rank


static func _better(a: Dictionary, b: Dictionary) -> bool:
	var na := int(a.get("nights", 0))
	var nb := int(b.get("nights", 0))
	if na != nb:
		return na > nb
	var sa: Dictionary = a.get("stats", {})
	var sb: Dictionary = b.get("stats", {})
	var ka := int(sa.get("enemies_defeated", 0))
	var kb := int(sb.get("enemies_defeated", 0))
	if ka != kb:
		return ka > kb
	return str(a.get("date", "")) < str(b.get("date", ""))


func top(n: int = 10) -> Array:
	return entries.slice(0, mini(n, entries.size()))


func best() -> int:
	if entries.is_empty():
		return 0
	return int(entries[0].get("nights", 0))


func to_array() -> Array:
	return entries.duplicate(true)


func from_array(a: Array) -> void:
	entries = []
	for e in a:
		if e is Dictionary:
			entries.append((e as Dictionary).duplicate(true))
	entries.sort_custom(_better)
	if entries.size() > max_entries:
		entries.resize(max_entries)
