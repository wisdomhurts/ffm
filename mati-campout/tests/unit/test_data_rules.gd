extends "res://tests/test_case.gd"
## Design rules from the brief that must always hold.


func test_three_axe_tiers() -> void:
	var axes := []
	for id in DB.items:
		if DB.item(id).get("tool", "") == "axe":
			axes.append(id)
	assert_eq(axes.size(), 3)
	assert_false(DB.item("rusty_axe").get("giant", false))
	assert_false(DB.item("good_axe").get("giant", false))
	assert_true(DB.item("mega_axe").get("giant", false))


func test_tent_has_exactly_eight_levels() -> void:
	assert_eq(DB.upgrades["tent"]["max_level"], 8)
	assert_eq((DB.upgrades["tent"]["levels"] as Array).size(), 8)


func test_campfire_has_exactly_three_levels() -> void:
	assert_eq((DB.upgrades["fire"]["levels"] as Array).size(), 3)


func test_start_kit() -> void:
	GameState.new_run(7)
	assert_eq(GameState.inventory.capacity, 7)
	assert_true(GameState.inventory.has("rusty_axe"))
	assert_true(GameState.inventory.has("wooden_bat"))
	assert_eq(GameState.sack_id, "old_sack")


func test_boss_ignores_light_others_fear_it() -> void:
	assert_false(DB.enemy("boss_wolf")["fears_light"])
	assert_true(DB.enemy("night_stalker")["fears_light"])
	assert_true(DB.enemy("watcher")["fears_light"])


func test_trader_goods_exist() -> void:
	for tid in DB.traders:
		if tid.begins_with("_"):
			continue
		var t: Dictionary = DB.traders[tid]
		for e in t["sells"]:
			assert_true(DB.has_item(str(e["id"])), "trader %s sells unknown %s" % [tid, e["id"]])
		for id in t["buys"]:
			assert_true(DB.has_item(str(id)), "trader %s buys unknown %s" % [tid, id])


func test_relight_is_always_possible() -> void:
	# Kindling is craftable from wood and wood comes from regrowing trees.
	assert_eq(DB.recipe("kindling")["costs"], {"wood": 1})
	assert_true(DB.item("kindling").get("ignition", false))
	assert_gt(int(DB.b("camp.start_storage", {}).get("kindling", 0)), 0)


func test_no_real_money() -> void:
	for tid in DB.traders:
		if tid.begins_with("_"):
			continue
		for e in DB.traders[tid]["sells"]:
			assert_true(e.has("price"), "priced in coins")


func test_sack_upgrade_via_give() -> void:
	GameState.new_run(9)
	GameState.give("good_sack")
	assert_eq(GameState.inventory.capacity, 12)
	GameState.give("old_sack")
	assert_eq(GameState.inventory.capacity, 12, "never downgrade")
