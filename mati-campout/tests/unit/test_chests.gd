extends "res://tests/test_case.gd"
## Chests & the map: procedural models, deterministic placement rules for
## several seeds, loot rolls, opening, restocking at dawn, map markers and
## the map helpers (data-only, no rendering).

const SEED := 20261010

var _plans: Dictionary = {}


func _plan(seed_v: int) -> Array:
	if not _plans.has(seed_v):
		_plans[seed_v] = ChestManager.plan_chests(WorldGen.new(seed_v), seed_v, null, null, ChestManager.avoid_zones(WorldGen.new(seed_v), null))
	return _plans[seed_v]


func _chest(tier: String, table: String = "", opts: Dictionary = {}, index: int = 0) -> Chest:
	var c := Chest.new()
	c.configure(tier, table, opts)
	c.index = index
	c.loot_seed = 777
	return c


func test_models_build_for_every_tier() -> void:
	for tier in ChestManager.TIERS:
		var m := ChestModels.get_model(tier)
		assert_true(m["body"] is ArrayMesh and (m["body"] as ArrayMesh).get_surface_count() == 1, "%s body mesh" % tier)
		assert_true(m["lid"] is ArrayMesh and (m["lid"] as ArrayMesh).get_surface_count() == 1, "%s lid mesh" % tier)
		var tris := int(m["tris"])
		assert_gt(float(tris), 800.0, "%s has detail (%d tris)" % [tier, tris])
		assert_lt(float(tris), 12000.0 if tier == "epic" else 9000.0, "%s triangle budget (%d tris)" % [tier, tris])
		assert_gt(float((m["glints"] as PackedVector3Array).size()), 0.0, "%s glint points" % tier)
		var hinge: Vector3 = m["hinge"]
		var sz: Vector3 = m["size"]
		assert_gt(hinge.y, 0.35, "%s hinge height" % tier)
		assert_lt(hinge.z, 0.0, "%s hinge at the back" % tier)
		assert_true(sz.x > 0.8 and sz.x < 1.3 and sz.y > 0.55 and sz.y < 0.95, "%s size %s" % [tier, str(sz)])
		var aabb := (m["body"] as ArrayMesh).get_aabb()
		assert_lt(aabb.position.y, 0.02, "%s body sits on the ground" % tier)
	assert_true(ChestModels.get_model("common") == ChestModels.get_model("common"), "models are cached")
	assert_true(ChestModels.material("epic", false) != ChestModels.material("epic", true), "open/closed materials differ")
	assert_eq(float(ChestModels.material("rare", true).get_shader_parameter("glint")), 0.0, "opened chests stop glinting")


func test_placement_counts_and_rules() -> void:
	var gen := WorldGen.new(SEED)
	var plan := _plan(SEED)
	var want := {"common": DB.bi("chests.common_count"), "rare": DB.bi("chests.rare_count"), "epic": DB.bi("chests.epic_count")}
	var got := {"common": 0, "rare": 0, "epic": 0}
	var spacing := DB.bf("chests.spacing", 26.0)
	var trail := DB.bf("chests.trail_clear", 3.0)
	var starters := 0
	var bad_water := 0
	var bad_trail := 0
	var bad_stream := 0
	var bad_camp := 0
	var bad_spacing := 0
	var bad_slope := 0
	var bad_struct := 0
	var avoid := ChestManager.avoid_zones(gen, null)
	for i in plan.size():
		var e: Dictionary = plan[i]
		var p: Vector3 = e["pos"]
		got[e["tier"]] = int(got[e["tier"]]) + 1
		if bool(e["starter"]):
			starters += 1
		if gen.height_at(p.x, p.z) < WorldGen.WATER_LEVEL + 0.3 or gen.is_water(p.x, p.z):
			bad_water += 1
		if gen.distance_to_path(p.x, p.z) < trail - 0.05:
			bad_trail += 1
		if gen.distance_to_stream(p.x, p.z) < 5.5:
			bad_stream += 1
		if not bool(e["starter"]) and Vector2(p.x, p.z).length() < DB.bf("chests.camp_clear", 26.0) - 0.01:
			bad_camp += 1
		if gen.slope_at(p.x, p.z) > 0.061:
			bad_slope += 1
		for a in avoid:
			var v: Vector4 = a
			if Vector2(v.x - p.x, v.z - p.z).length() < v.w:
				bad_struct += 1
		for j in range(i + 1, plan.size()):
			var q: Vector3 = plan[j]["pos"]
			if Vector2(q.x - p.x, q.z - p.z).length() < spacing - 0.01:
				bad_spacing += 1
		assert_true(gen.in_playable(p.x, p.z), "chest %d inside the playable area" % i)
		assert_true(DB.loot_tables.has(str(e["table"])), "chest %d table %s exists" % [i, e["table"]])
	assert_eq(got, want, "counts per tier")
	assert_eq(starters, 1, "one starter chest")
	assert_eq(bad_water, 0, "no chest in water")
	assert_eq(bad_trail, 0, "no chest on a trail")
	assert_eq(bad_stream, 0, "no chest in the stream")
	assert_eq(bad_camp, 0, "no chest in the camp clearing")
	assert_eq(bad_spacing, 0, "chests are spread out")
	assert_eq(bad_slope, 0, "chests stand on level ground")
	assert_eq(bad_struct, 0, "no chest inside a landmark building")


func test_starter_chest_near_camp_in_view() -> void:
	for seed_v in [SEED, 4242, 99173]:
		var plan := _plan(seed_v)
		var st: Dictionary = {}
		for e in plan:
			if bool(e["starter"]):
				st = e
		assert_false(st.is_empty(), "seed %d has a starter" % seed_v)
		if st.is_empty():
			continue
		var p: Vector3 = st["pos"]
		var d := Vector2(p.x, p.z).length()
		assert_true(d >= 16.0 - 0.01 and d <= 22.0 + 0.01, "seed %d starter 16-22 m from camp (%.1f)" % [seed_v, d])
		var view := (-ChestManager.START_VIEW_FROM).normalized()
		var seen := (Vector2(p.x, p.z) - ChestManager.START_VIEW_FROM).normalized()
		var ang := rad_to_deg(absf(seen.angle_to(view)))
		assert_lt(ang, 32.0, "seed %d starter is inside the opening view (%.0f deg)" % [seed_v, ang])
		assert_gt(ang, 5.0, "seed %d starter is beside the view line, not hidden behind the player (%.0f deg)" % [seed_v, ang])
		assert_eq(str(st["tier"]), "common", "starter is a common chest")
		# It faces the camp.
		var front := Vector3(sin(float(st["rot"])), 0.0, cos(float(st["rot"])))
		assert_gt(front.dot(-p.normalized()), 0.9, "seed %d starter faces the fire" % seed_v)


func test_rare_and_epic_are_far_and_themed() -> void:
	var gen := WorldGen.new(SEED)
	var plan := _plan(SEED)
	var themed := 0
	var far_n := 0
	for e in plan:
		var p: Vector3 = e["pos"]
		var d := Vector2(p.x, p.z).length()
		if str(e["tier"]) == "epic":
			assert_gt(d, DB.bf("chests.epic_min_dist", 115.0) - 0.01, "epic chests are far from camp (%.0f)" % d)
		if str(e["tier"]) == "rare":
			assert_gt(d, DB.bf("chests.rare_min_dist", 70.0) - 0.01, "rare chests are away from camp (%.0f)" % d)
		if str(e["tier"]) != "common":
			far_n += 1
			var anchor := str(e["anchor"])
			if anchor == "shore":
				assert_eq(gen.biome_at(p.x, p.z), "shore", "shore chest on the shore")
			elif anchor == "ridge" or anchor == "ridge_top":
				assert_eq(gen.biome_at(p.x, p.z), "ridge", "ridge chest on the ridge")
			if anchor != "far":
				themed += 1
	assert_gt(float(themed), float(far_n) * 0.7, "most rare/epic chests sit at ruins, the ridge or the shore (%d/%d)" % [themed, far_n])


func test_commons_spread_over_biomes() -> void:
	var plan := _plan(SEED)
	var biomes := {}
	var near_trail := 0
	var commons := 0
	var gen := WorldGen.new(SEED)
	for e in plan:
		if str(e["tier"]) != "common" or bool(e["starter"]):
			continue
		commons += 1
		var p: Vector3 = e["pos"]
		biomes[gen.biome_at(p.x, p.z)] = true
		if gen.distance_to_path(p.x, p.z) < 16.0:
			near_trail += 1
	assert_gt(float(biomes.size()), 2.0, "commons in 3+ biomes (%s)" % str(biomes.keys()))
	assert_gt(float(near_trail), float(commons) * 0.4, "many commons near trails (%d/%d)" % [near_trail, commons])
	# Spread over the map: every quadrant gets some.
	var quads := [0, 0, 0, 0]
	for e in plan:
		var p: Vector3 = e["pos"]
		quads[(1 if p.x > 0.0 else 0) + (2 if p.z > 0.0 else 0)] += 1
	for q in quads:
		assert_gt(float(q), 2.0, "chests in every quadrant %s" % str(quads))


func test_placement_is_deterministic() -> void:
	var a := ChestManager.plan_chests(WorldGen.new(SEED), SEED, null, null, ChestManager.avoid_zones(WorldGen.new(SEED), null))
	var b := _plan(SEED)
	var c := _plan(4242)
	assert_eq(a.size(), b.size(), "same count")
	var same := true
	for i in mini(a.size(), b.size()):
		if (a[i]["pos"] as Vector3).distance_to(b[i]["pos"]) > 0.001 or a[i]["tier"] != b[i]["tier"]:
			same = false
	assert_true(same, "same seed -> same chests")
	var diff := 0
	for i in mini(b.size(), c.size()):
		if (b[i]["pos"] as Vector3).distance_to(c[i]["pos"]) > 1.0:
			diff += 1
	assert_gt(float(diff), float(b.size()) * 0.5, "another seed -> other spots")
	for seed_v in [4242, 99173]:
		var plan := _plan(seed_v)
		var n := {"common": 0, "rare": 0, "epic": 0}
		for e in plan:
			n[e["tier"]] = int(n[e["tier"]]) + 1
		assert_eq(n, {"common": DB.bi("chests.common_count"), "rare": DB.bi("chests.rare_count"), "epic": DB.bi("chests.epic_count")}, "seed %d counts" % seed_v)


func test_open_rolls_loot_and_counts() -> void:
	GameState.new_run(SEED)
	var opened: Array = []
	var cb := func(tier: String, _pos: Vector3) -> void: opened.append(tier)
	Events.chest_opened.connect(cb)
	var c := _chest("rare", "", {}, 3)
	assert_eq(c.table_id, "chest_rare", "default table for the tier")
	assert_eq(c.get_interact_text(null), "Open Rare Chest", "prompt")
	assert_eq(c.get_interact_hint(null), "", "no hint while closed")
	var preview := c.preview_loot()
	var coins_before := GameState.coins
	var loot := c.open_chest(null)
	assert_eq(loot, preview, "loot is deterministic (preview == roll)")
	var has_coins := false
	for e in loot:
		if str(e["id"]) == "coins":
			has_coins = true
			assert_true(int(e["count"]) >= 20 and int(e["count"]) <= 45, "rare coins in range")
	assert_true(has_coins, "rare chests always give coins")
	assert_gt(float(GameState.coins), float(coins_before), "coins went to the wallet")
	assert_eq(int(GameState.stats["chests_opened"]), 1, "stat counted")
	assert_eq(opened, ["rare"], "Events.chest_opened fired once")
	assert_true(c.opened and c.discovered, "opened and discovered")
	assert_eq(c.get_interact_text(null), "", "no Open prompt when empty")
	assert_true(c.get_interact_hint(null).begins_with("Empty"), "empty hint (%s)" % c.get_interact_hint(null))
	assert_eq(c.open_chest(null), [], "a second open gives nothing")
	assert_eq(int(GameState.stats["chests_opened"]), 1, "stat not counted twice")
	Events.chest_opened.disconnect(cb)
	# Same chest index + seed -> same loot; another index -> (usually) different.
	var c2 := _chest("rare", "", {}, 3)
	assert_eq(c2.preview_loot(), preview, "same chest, same loot")
	var differs := 0
	for k in 6:
		var o := _chest("rare", "", {}, 10 + k)
		if o.preview_loot() != preview:
			differs += 1
		o.free()
	assert_gt(float(differs), 3.0, "other chests roll other loot")
	c.free()
	c2.free()


func test_epic_and_common_loot_ranges() -> void:
	for k in 8:
		var e := _chest("epic", "", {}, k)
		var coins := 0
		for it in e.preview_loot():
			if str(it["id"]) == "coins":
				coins = int(it["count"])
		assert_true(coins >= 60 and coins <= 120, "epic coins 60-120 (%d)" % coins)
		e.free()
		var c := _chest("common", "", {}, k)
		var n := 0
		for it in c.preview_loot():
			n += int(it["count"])
		assert_gt(float(n), 2.0, "a common chest is never empty")
		c.free()


func test_restock_after_days() -> void:
	GameState.new_run(SEED)
	var days := DB.bi("chests.restock_days", 3)
	var c := _chest("common", "lighthouse", {"restock_table": "lighthouse_restock"}, 1)
	var first := c.open_chest(null)
	var ids := first.map(func(e: Dictionary) -> String: return str(e["id"]))
	assert_true(ids.has("flashlight"), "first opening uses the main table")
	assert_eq(c.days_until_restock(), days, "days left right after opening")
	for d in days - 1:
		assert_false(c.dawn_tick(), "not yet (dawn %d)" % (d + 1))
		assert_true(c.opened, "still empty after dawn %d" % (d + 1))
	assert_true(c.get_interact_hint(null).contains("sunrise"), "hint says sunrise on the last day (%s)" % c.get_interact_hint(null))
	assert_true(c.dawn_tick(), "restocks on dawn %d" % days)
	assert_false(c.opened, "closed and full again")
	assert_eq(c.get_interact_text(null), "Open Chest", "can be opened again")
	var second := c.open_chest(null)
	var ids2 := second.map(func(e: Dictionary) -> String: return str(e["id"]))
	assert_true(ids2.has("battery") and not ids2.has("flashlight"), "restock table after a refill (%s)" % str(ids2))
	assert_eq(c.open_count, 2, "opened twice")
	c.free()
	var never := _chest("rare", "", {"restock_days": 0}, 2)
	never.open_chest(null)
	for d in 6:
		never.dawn_tick()
	assert_true(never.opened, "restock_days 0 never refills")
	assert_true(never.get_interact_hint(null).begins_with("Empty"), "hint for a one-time chest")
	never.free()


func test_map_marker_contract() -> void:
	var c := _chest("epic", "", {"label": "Lighthouse Gold"}, 5)
	var m := c.get_map_marker()
	assert_eq(str(m["kind"]), "chest", "kind")
	assert_eq(str(m["label"]), "Lighthouse Gold", "label from opts")
	assert_true(bool(m["important"]), "chests are important (hidden while the fire is out)")
	assert_false(bool(m["discovered"]), "undiscovered at first")
	assert_eq(str(m["tier"]), "epic", "tier")
	GameState.new_run(SEED)
	c.open_chest(null)
	m = c.get_map_marker()
	assert_true(bool(m["discovered"]) and bool(m["opened"]), "opening discovers it and greys it")
	c.free()


func test_manager_api() -> void:
	GameState.new_run(SEED)
	var gen := WorldGen.new(SEED)
	var cm := ChestManager.new()
	cm.setup_data(gen)
	assert_eq(cm.chest_count(), DB.bi("chests.common_count") + DB.bi("chests.rare_count") + DB.bi("chests.epic_count"), "manager placed every chest")
	assert_true(cm.starter() != null, "starter chest")
	var c := cm.add_chest(Vector3(40, 0, 40), "rare", "chest_rare", {"label": "Test", "restock_days": 2, "rot": 1.2}) as Chest
	assert_true(c != null and c.tier == "rare" and c.label == "Test" and c.restock_days == 2, "add_chest applies opts")
	assert_near(c.position.y, gen.height_at(40, 40) - 0.035, 0.01, "snapped to the ground")
	var k := cm.add_chest(Vector3(41, 7.5, 44), "epic", "", {"keep_y": true}) as Chest
	assert_near(k.position.y, 7.5, 0.001, "keep_y keeps the height")
	assert_eq(k.table_id, "chest_epic", "epic default table")
	assert_eq(cm.nearest(Vector3(40, 0, 40), "rare"), c, "nearest finds it")
	c.open_chest(null)
	assert_true(cm.nearest(Vector3(40, 0, 40), "rare", true) != c, "closed_only skips opened chests")
	assert_eq(cm.restock_step(), 0, "first dawn: nothing refills")
	assert_eq(cm.restock_step(), 1, "second dawn: the 2-day chest refills")
	assert_false(c.opened, "refilled")
	var st := cm.debug_stats()
	assert_eq(int(st["count"]), cm.chest_count(), "stats count")
	cm.free()


func test_coin_piles_split() -> void:
	GameState.new_run(SEED)
	var c := _chest("epic", "", {}, 0)
	c._queue_loot([{"id": "coins", "count": 50}, {"id": "medkit", "count": 1}])
	var coins := 0
	var piles := 0
	for e in c._spawn_queue:
		if str(e["id"]) == "coins":
			coins += int(e["count"])
			piles += 1
	assert_eq(coins, 50, "all coins are spawned")
	assert_true(piles >= 4 and piles <= 5, "coins pop out as several piles (%d)" % piles)
	assert_eq(str(c._spawn_queue[c._spawn_queue.size() - 1]["id"]), "medkit", "items follow")
	c.free()


func test_map_helpers() -> void:
	assert_eq(MapUI.icon_for("chest"), "ui_chest", "chest icon")
	assert_eq(MapUI.icon_for("camp"), "ui_fire", "camp icon")
	assert_eq(MapUI.icon_for("trader"), "ui_coin", "trader icon")
	assert_eq(MapUI.icon_for("pet"), "ui_paw", "pet icon")
	assert_eq(MapUI.collect_markers(null), [], "no tree, no markers")
	GameState.new_run(SEED)
	var prev := GameState.world_gen
	GameState.world_gen = WorldGen.new(SEED)
	var lh := GameState.world_gen.landmark_pos("lighthouse")
	MapUI.track_landmarks(Vector3(0, 0, 0))
	assert_false((GameState.flags.get("map_seen", {}) as Dictionary).has("lighthouse"), "lighthouse not seen from camp")
	MapUI.track_landmarks(lh + Vector3(20, 0, 0))
	assert_true((GameState.flags.get("map_seen", {}) as Dictionary).has("lighthouse"), "lighthouse seen up close")
	MapUI.mark_landmark_seen("old_mine")
	assert_true((GameState.flags["map_seen"] as Dictionary).has("old_mine"), "landmark_discovered marks it")
	GameState.world_gen = prev
	# The beacon follows the campfire.
	GameState.fire.extinguish()
	assert_false(MapUI.beacon_lit(), "beacon dark while the fire is out")
	GameState.fire.relight("kindling", "wood")
	assert_true(MapUI.beacon_lit(), "beacon lit again")
