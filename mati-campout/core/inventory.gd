class_name Inventory
extends RefCounted
## Slot-based container used for the player's sack and the camp storage box.
##
## A slot is either null or {"id": String, "count": int, "meta": Dictionary}.
## "meta" carries per-instance state such as flashlight charge or loaded ammo.
## Stack sizes come from a lookup Callable (id -> int) so this class stays pure
## and testable; the default lookup reads DB when it is available.

signal changed()

var capacity: int = 7
var slots: Array = []
var stack_lookup: Callable


func _init(cap: int = 7, lookup: Callable = Callable()) -> void:
	stack_lookup = lookup
	capacity = maxi(cap, 0)
	slots.resize(capacity)


func stack_size(id: String) -> int:
	if stack_lookup.is_valid():
		return maxi(int(stack_lookup.call(id)), 1)
	return 20


## Grow (or shrink) the number of slots. Shrinking never deletes items: it only
## removes trailing empty slots, so the result may be larger than requested.
func set_capacity(n: int) -> void:
	n = maxi(n, 0)
	if n >= slots.size():
		slots.resize(n)
	else:
		# Compact items into the first n slots where possible.
		var kept: Array = []
		for s in slots:
			if s != null:
				kept.append(s)
		var new_size := maxi(n, kept.size())
		slots.clear()
		slots.resize(new_size)
		for i in kept.size():
			slots[i] = kept[i]
	capacity = slots.size()
	changed.emit()


func get_slot(i: int) -> Variant:
	if i < 0 or i >= slots.size():
		return null
	return slots[i]


func slot_id(i: int) -> String:
	var s: Variant = get_slot(i)
	return "" if s == null else str(s["id"])


func set_slot(i: int, value: Variant) -> void:
	if i < 0 or i >= slots.size():
		return
	if value != null and int(value.get("count", 0)) <= 0:
		value = null
	slots[i] = value
	changed.emit()


func clear_slot(i: int) -> void:
	set_slot(i, null)


func count_of(id: String) -> int:
	var n := 0
	for s in slots:
		if s != null and s["id"] == id:
			n += int(s["count"])
	return n


func has(id: String, count: int = 1) -> bool:
	return count_of(id) >= count


func first_empty() -> int:
	for i in slots.size():
		if slots[i] == null:
			return i
	return -1


func used_slots() -> int:
	var n := 0
	for s in slots:
		if s != null:
			n += 1
	return n


func is_full() -> bool:
	return first_empty() == -1


## How many of `id` could be added right now.
func space_for(id: String) -> int:
	var max_stack := stack_size(id)
	var room := 0
	for s in slots:
		if s == null:
			room += max_stack
		elif s["id"] == id and s.get("meta", {}).is_empty():
			room += maxi(max_stack - int(s["count"]), 0)
	return room


func can_add(id: String, count: int = 1) -> bool:
	return space_for(id) >= count


## Add items. Fills existing stacks first, then empty slots.
## Returns the number of items that did NOT fit (0 = everything added).
func add(id: String, count: int = 1, meta: Dictionary = {}) -> int:
	if count <= 0 or id == "":
		return 0
	var max_stack := stack_size(id)
	var left := count
	# Items with per-instance meta never merge.
	if meta.is_empty():
		for i in slots.size():
			if left <= 0:
				break
			var s: Variant = slots[i]
			if s != null and s["id"] == id and (s.get("meta", {}) as Dictionary).is_empty():
				var room := max_stack - int(s["count"])
				if room > 0:
					var put := mini(room, left)
					s["count"] = int(s["count"]) + put
					left -= put
	for i in slots.size():
		if left <= 0:
			break
		if slots[i] == null:
			var put := mini(max_stack, left)
			slots[i] = {"id": id, "count": put, "meta": meta.duplicate(true)}
			left -= put
	if left != count:
		changed.emit()
	return left


## Remove up to `count` items of `id`, taking from the last stacks first.
## Returns how many were actually removed.
func remove(id: String, count: int = 1) -> int:
	var left := count
	for i in range(slots.size() - 1, -1, -1):
		if left <= 0:
			break
		var s: Variant = slots[i]
		if s != null and s["id"] == id:
			var take := mini(int(s["count"]), left)
			s["count"] = int(s["count"]) - take
			left -= take
			if int(s["count"]) <= 0:
				slots[i] = null
	if left != count:
		changed.emit()
	return count - left


## Remove exactly `count` or nothing at all.
func remove_exact(id: String, count: int = 1) -> bool:
	if not has(id, count):
		return false
	remove(id, count)
	return true


## Remove `count` from one specific slot. Returns {"id", "count", "meta"} taken
## (count may be smaller than requested) or {} if the slot was empty.
func take_from_slot(i: int, count: int = 1) -> Dictionary:
	var s: Variant = get_slot(i)
	if s == null:
		return {}
	var take := mini(count, int(s["count"]))
	var out := {"id": s["id"], "count": take, "meta": (s.get("meta", {}) as Dictionary).duplicate(true)}
	s["count"] = int(s["count"]) - take
	if int(s["count"]) <= 0:
		slots[i] = null
	changed.emit()
	return out


func swap(a: int, b: int) -> void:
	if a < 0 or b < 0 or a >= slots.size() or b >= slots.size() or a == b:
		return
	var tmp: Variant = slots[a]
	slots[a] = slots[b]
	slots[b] = tmp
	changed.emit()


## Move the whole stack in slot i into another inventory. Whatever does not fit
## stays here. Returns the number moved.
func transfer_slot_to(other: Inventory, i: int) -> int:
	var s: Variant = get_slot(i)
	if s == null or other == null:
		return 0
	var meta: Dictionary = s.get("meta", {})
	var count := int(s["count"])
	var left := other.add(s["id"], count, meta)
	var moved := count - left
	if moved > 0:
		if left <= 0:
			slots[i] = null
		else:
			s["count"] = left
		changed.emit()
	return moved


func get_meta_value(i: int, key: String, default: Variant = null) -> Variant:
	var s: Variant = get_slot(i)
	if s == null:
		return default
	return (s.get("meta", {}) as Dictionary).get(key, default)


func set_meta_value(i: int, key: String, value: Variant) -> void:
	var s: Variant = get_slot(i)
	if s == null:
		return
	if not s.has("meta"):
		s["meta"] = {}
	s["meta"][key] = value
	changed.emit()


## id -> total count
func summary() -> Dictionary:
	var d := {}
	for s in slots:
		if s != null:
			d[s["id"]] = int(d.get(s["id"], 0)) + int(s["count"])
	return d


func to_dict() -> Dictionary:
	return {"capacity": capacity, "slots": slots.duplicate(true)}


func from_dict(d: Dictionary) -> void:
	var cap := int(d.get("capacity", capacity))
	slots.clear()
	slots.resize(cap)
	capacity = cap
	var src: Array = d.get("slots", [])
	for i in mini(src.size(), cap):
		var s: Variant = src[i]
		if s != null and s is Dictionary and int(s.get("count", 0)) > 0:
			slots[i] = {"id": str(s["id"]), "count": int(s["count"]), "meta": (s.get("meta", {}) as Dictionary).duplicate(true)}
	changed.emit()
