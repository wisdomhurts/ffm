extends "res://tests/test_case.gd"
## Campsite & campfire: fuel choice, relight rules, procedural builders for
## every fire and tent level, cooking helpers.


func _fire() -> FireModel:
	var f := FireModel.new()
	f.setup(DB.b("fire", {}), DB.upgrades["fire"]["levels"], {"wood": 40.0, "coal": 110.0, "kindling": 10.0})
	return f


func _inv(items: Dictionary, cap: int = 7) -> Inventory:
	var inv := Inventory.new(cap)
	inv.stack_lookup = DB.stack_size
	for id in items:
		inv.add(str(id), int(items[id]))
	return inv


func test_fuel_prefers_selected_then_wood_then_coal() -> void:
	var f := _fire()
	var sack := _inv({"wood": 2, "coal": 1})
	var c := Campfire.pick_fuel(f, "", sack, [])
	assert_eq(c.get("id", ""), "wood", "wood before coal")
	c = Campfire.pick_fuel(f, "coal", sack, [])
	assert_eq(c.get("id", ""), "coal", "selected fuel wins")
	c = Campfire.pick_fuel(f, "rusty_axe", sack, [])
	assert_eq(c.get("id", ""), "wood", "non-fuel selection is ignored")
	var only_coal := _inv({"coal": 3})
	assert_eq(Campfire.pick_fuel(f, "", only_coal, []).get("id", ""), "coal", "coal when no wood")
	var kindling_only := _inv({"kindling": 3})
	assert_true(Campfire.pick_fuel(f, "", kindling_only, []).is_empty(), "kindling is never burned automatically")
	assert_eq(Campfire.pick_fuel(f, "kindling", kindling_only, []).get("id", ""), "kindling", "unless the player selects it")


func test_fuel_from_storage_when_sack_is_empty() -> void:
	var f := _fire()
	var sack := _inv({"rusty_axe": 1})
	var storage := _inv({"wood": 4}, 16)
	var c := Campfire.pick_fuel(f, "", sack, [storage])
	assert_eq(c.get("id", ""), "wood")
	assert_true(c.get("inv") == storage, "taken from the storage box")
	var both := _inv({"wood": 1})
	assert_true(Campfire.pick_fuel(f, "", both, [storage]).get("inv") == both, "the sack is used first")
	assert_true(Campfire.pick_fuel(f, "", _inv({}), [_inv({}, 16)]).is_empty(), "nothing to burn")


func test_relight_needs_kindling_and_fuel() -> void:
	var f := _fire()
	f.extinguish()
	var r := Campfire.pick_relight(f, "", _inv({"wood": 1}), [])
	assert_true((r.get("missing", []) as Array).has("kindling"), "missing kindling")
	assert_false((r.get("missing", []) as Array).has("fuel"))
	r = Campfire.pick_relight(f, "", _inv({"kindling": 2}), [])
	assert_true((r.get("missing", []) as Array).has("fuel"), "kindling alone is not enough")
	var storage := _inv({"kindling": 1}, 16)
	r = Campfire.pick_relight(f, "", _inv({"coal": 1}), [storage])
	assert_false(r.has("missing"), "kindling from storage + coal from the sack")
	assert_eq(r.get("fuel_id", ""), "coal")
	assert_true(r.get("kindling_inv") == storage)
	assert_true(f.relight(str(r["kindling_id"]), str(r["fuel_id"])), "the model accepts that relight")


func test_fire_pit_builds_every_level() -> void:
	for lv in [1, 2, 3]:
		var m := FirePit.build(lv)
		assert_true(m != null and m.get_surface_count() >= 1, "fire pit mesh for level %d" % lv)
		var c := FirePit.cfg(lv)
		assert_gt(float(c["interact"]), float(c["col_r"]), "interact radius reaches past the collider (L%d)" % lv)
		assert_gt(float(c["rack_x"]), float(c["col_r"]) - 0.1, "rack stakes stand outside the pit (L%d)" % lv)
	assert_gt(float(FirePit.cfg(3)["light_y"]), float(FirePit.cfg(1)["light_y"]), "beacon light sits higher")
	assert_gt(FirePit.build(3).get_aabb().size.y, FirePit.build(1).get_aabb().size.y, "level 3 is taller")


func test_tent_builder_every_level_grows() -> void:
	var tent_def: Dictionary = DB.upgrades["tent"]
	assert_eq(int(tent_def["max_level"]), TentBuilder.LEVELS.size(), "a look for every tent level")
	var prev_area := 0.0
	var prev_h := 0.0
	for lv in range(1, TentBuilder.LEVELS.size() + 1):
		var info := TentBuilder.new().build(lv)
		var solid: CampKit = info["solid"]
		var cloth: CampKit = info["cloth"]
		assert_false(solid.is_empty(), "solid parts L%d" % lv)
		assert_false(cloth.is_empty(), "canvas L%d" % lv)
		assert_gt((info["shapes"] as Array).size(), 2.0, "walls collide L%d" % lv)
		var area := float(info["w"]) * float(info["d"])
		assert_true(area >= prev_area - 0.01, "L%d is not smaller than the level before" % lv)
		assert_true(float(info["h"]) >= prev_h - 0.01, "L%d is not lower than the level before" % lv)
		assert_gt(float(info["h"]), 1.7, "a child can stand in the L%d tent" % lv)
		var rest: Vector3 = info["rest"]
		assert_lt(absf(rest.z), float(info["d"]) * 0.5, "rest spot inside L%d" % lv)
		prev_area = area
		prev_h = float(info["h"])
		var mesh := CampKit.build_mesh(solid, cloth)
		assert_eq(mesh.get_surface_count(), 2, "solid + canvas surfaces L%d" % lv)
	var top := TentBuilder.new().build(8)
	var stars := 0
	for l in top["lights"]:
		if str((l as Dictionary)["kind"]) == "star":
			stars += 1
	assert_eq(stars, 2, "the Starlight Pavilion has two starstone lamps")


func test_camp_props_build_with_collision() -> void:
	var k := CampKit.new()
	var shapes: Array = []
	shapes.append_array(CampProps.log_bench(k, Transform3D.IDENTITY, 1.8, 1))
	shapes.append_array(CampProps.stump_seat(k, Transform3D.IDENTITY, 0.25, 0.4, 2))
	shapes.append_array(CampProps.picnic_table(k, Transform3D.IDENTITY))
	shapes.append_array(CampProps.firewood_stack(k, Transform3D.IDENTITY, 3))
	shapes.append_array(CampProps.chopping_block(k, Transform3D.IDENTITY, 4))
	shapes.append_array(CampProps.bucket(k, Transform3D.IDENTITY))
	shapes.append_array(CampProps.camp_sign(k, Transform3D.IDENTITY, 2.0, 0.6, 1.9))
	CampProps.kettle(k, Transform3D.IDENTITY)
	CampProps.backpack(k, Transform3D.IDENTITY)
	CampProps.lantern(k, Transform3D.IDENTITY)
	assert_false(k.is_empty())
	assert_gt(shapes.size(), 8.0, "solid props have colliders")
	for e in shapes:
		var d: Dictionary = e
		assert_true(d.get("shape") is Shape3D and d.get("xform") is Transform3D, "shape entries are well formed")


func test_cooking_helpers() -> void:
	assert_true(CookingRack.cookable("raw_meat"))
	assert_true(CookingRack.cookable("mushroom"))
	assert_false(CookingRack.cookable("berries"))
	assert_false(CookingRack.cookable(""))
	assert_eq(CookingRack.cooked_id("raw_meat"), "cooked_meat")
	assert_eq(CookingRack.cooked_id("mushroom"), "roasted_mushroom")
	assert_gt(DB.bf("fire.cook_seconds", 0.0), 0.0, "cook time configured")
	assert_gt(float(DB.bi("fire.rack_slots", 0)), 0.0, "rack slots configured")
