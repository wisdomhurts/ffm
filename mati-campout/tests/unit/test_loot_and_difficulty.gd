extends "res://tests/test_case.gd"


func test_loot_is_deterministic() -> void:
	var a := RandomNumberGenerator.new()
	var b := RandomNumberGenerator.new()
	a.seed = 42
	b.seed = 42
	assert_eq(Loot.roll(DB.loot_table("chest_rare"), a), Loot.roll(DB.loot_table("chest_rare"), b))


func test_loot_ids_exist() -> void:
	for tid in DB.loot_tables:
		var t: Dictionary = DB.loot_tables[tid]
		for e in t.get("guaranteed", []) + t.get("entries", []):
			var id := str(e["id"])
			assert_true(id == "coins" or id == "nothing" or DB.has_item(id), "loot %s has unknown %s" % [tid, id])


func test_lighthouse_always_has_flashlight() -> void:
	var rng := RandomNumberGenerator.new()
	for s in 20:
		rng.seed = s
		var ids := Loot.roll(DB.loot_table("lighthouse"), rng).map(func(e: Dictionary) -> String: return e["id"])
		assert_true("flashlight" in ids)


func test_boss_schedule() -> void:
	var cfg: Dictionary = DB.b("boss", {})
	assert_false(Difficulty.is_boss_night(11, cfg))
	assert_true(Difficulty.is_boss_night(12, cfg))
	assert_false(Difficulty.is_boss_night(13, cfg))
	assert_true(Difficulty.is_boss_night(16, cfg))


func test_monster_counts_grow_and_cap() -> void:
	var sp: Dictionary = DB.b("spawning", {})
	var n1: int = Difficulty.monster_counts(1, sp)["night_stalker"]
	var n10: int = Difficulty.monster_counts(10, sp)["night_stalker"]
	var n99: int = Difficulty.monster_counts(99, sp)["night_stalker"]
	assert_gt(n10, n1)
	assert_eq(n99, int(sp["stalker_max"]))
	assert_gt(Difficulty.monster_counts(1, sp, true)["night_stalker"], n1, "fire out adds stalkers")


func test_leaderboard_ranks() -> void:
	var lb := LocalLeaderboard.new()
	lb.max_entries = 3
	assert_eq(lb.submit({"nights": 3}), 1)
	assert_eq(lb.submit({"nights": 7}), 1)
	assert_eq(lb.submit({"nights": 1}), 3)
	assert_eq(lb.submit({"nights": 0}), 0)
	assert_eq(lb.best(), 7)
	assert_eq(lb.entries.size(), 3)
