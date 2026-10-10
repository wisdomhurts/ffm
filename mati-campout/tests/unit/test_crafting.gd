extends "res://tests/test_case.gd"


func test_costs_are_deducted_from_storage_first() -> void:
	var storage := Inventory.new(5)
	var sack := Inventory.new(5)
	storage.add("wood", 4)
	sack.add("wood", 5)
	sack.add("stone", 6)
	var costs := {"wood": 6, "stone": 6, "scrap_metal": 0}
	assert_true(Crafting.can_afford(costs, [storage, sack]))
	assert_true(Crafting.consume_items(costs, [storage, sack]))
	assert_eq(storage.count_of("wood"), 0)
	assert_eq(sack.count_of("wood"), 3)
	assert_eq(sack.count_of("stone"), 0)


func test_unaffordable_changes_nothing() -> void:
	var sack := Inventory.new(5)
	sack.add("wood", 2)
	assert_false(Crafting.consume_items({"wood": 3}, [sack]))
	assert_eq(sack.count_of("wood"), 2)
	assert_eq(Crafting.missing({"wood": 3, "coins": 10}, [sack], 4), {"wood": 1, "coins": 6})


func test_every_recipe_uses_known_items() -> void:
	for rid in DB.recipes:
		var r: Dictionary = DB.recipes[rid]
		assert_true(DB.has_item(str(r["result"])), "recipe %s result" % rid)
		for id in r["costs"]:
			assert_true(DB.has_item(id) or id == "coins", "recipe %s cost %s" % [rid, id])


func test_game_state_pay_deducts_coins_and_items() -> void:
	GameState.new_run(1234)
	GameState.coins = 50
	GameState.storage.add("wood", 10)
	var before_wood := Crafting.available("wood", GameState.crafting_sources())
	assert_true(GameState.pay({"wood": 3, "coins": 20}))
	assert_eq(GameState.coins, 30)
	assert_eq(Crafting.available("wood", GameState.crafting_sources()), before_wood - 3)
	assert_false(GameState.pay({"coins": 999}))
	assert_eq(GameState.coins, 30)
