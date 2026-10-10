extends "res://tests/test_case.gd"


func _inv(cap: int = 7) -> Inventory:
	return Inventory.new(cap, func(id: String) -> int: return 1 if id.ends_with("axe") else 20)


func test_starting_sack_has_seven_slots() -> void:
	assert_eq(DB.item("old_sack").get("capacity"), 7, "old sack capacity")
	assert_eq(_inv(7).slots.size(), 7)


func test_sack_capacities_grow() -> void:
	var caps := [DB.item("old_sack")["capacity"], DB.item("good_sack")["capacity"],
		DB.item("mega_sack")["capacity"], DB.item("best_sack")["capacity"]]
	assert_eq(caps, [7, 12, 20, 32], "sack ladder")


func test_add_stacks_then_fills_slots() -> void:
	var inv := _inv(3)
	assert_eq(inv.add("wood", 25), 0)
	assert_eq(inv.count_of("wood"), 25)
	assert_eq(inv.used_slots(), 2)
	assert_eq(inv.add("wood", 40), 5, "leftover when full")
	assert_eq(inv.count_of("wood"), 60)
	assert_true(inv.is_full())


func test_tools_do_not_stack() -> void:
	var inv := _inv(3)
	inv.add("rusty_axe", 2)
	assert_eq(inv.used_slots(), 2)


func test_remove_and_has() -> void:
	var inv := _inv(4)
	inv.add("stone", 5)
	assert_true(inv.has("stone", 5))
	assert_false(inv.remove_exact("stone", 6))
	assert_eq(inv.count_of("stone"), 5, "remove_exact must not partially remove")
	assert_eq(inv.remove("stone", 3), 3)
	assert_eq(inv.count_of("stone"), 2)


func test_capacity_grow_keeps_items() -> void:
	var inv := _inv(2)
	inv.add("wood", 40)
	inv.set_capacity(12)
	assert_eq(inv.capacity, 12)
	assert_eq(inv.count_of("wood"), 40)


func test_capacity_shrink_never_deletes() -> void:
	var inv := _inv(5)
	inv.add("wood", 20)
	inv.add("stone", 20)
	inv.add("coal", 20)
	inv.set_capacity(2)
	assert_eq(inv.count_of("coal"), 20)
	assert_eq(inv.capacity, 3)


func test_meta_items_do_not_merge() -> void:
	var inv := _inv(4)
	inv.add("flashlight", 1, {"charge": 50.0})
	inv.add("flashlight", 1, {"charge": 100.0})
	assert_eq(inv.used_slots(), 2)
	assert_eq(inv.get_meta_value(0, "charge"), 50.0)


func test_transfer_between_inventories() -> void:
	var a := _inv(2)
	var b := _inv(1)
	a.add("wood", 30)
	var moved := a.transfer_slot_to(b, 0)
	assert_eq(moved, 20)
	assert_eq(b.count_of("wood"), 20)
	assert_eq(a.count_of("wood"), 10)


func test_serialization_roundtrip() -> void:
	var a := _inv(5)
	a.add("wood", 7)
	a.add("flashlight", 1, {"charge": 33.0})
	var b := _inv(1)
	b.from_dict(a.to_dict())
	assert_eq(b.capacity, 5)
	assert_eq(b.count_of("wood"), 7)
	assert_eq(b.get_meta_value(1, "charge"), 33.0)
