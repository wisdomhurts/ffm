extends "res://tests/test_case.gd"

var _gen: WorldGen


func _g() -> WorldGen:
	if _gen == null:
		_gen = WorldGen.new(20261010)
	return _gen


func test_camp_is_flat_and_dry() -> void:
	var g := _g()
	var h0 := g.height_at(0, 0)
	assert_gt(h0, WorldGen.WATER_LEVEL + 1.0, "camp above water")
	for p in [Vector2(8, 0), Vector2(-8, 4), Vector2(0, 10)]:
		assert_near(g.height_at(p.x, p.y), h0, 0.6, "camp flat")
	assert_eq(g.forest_density(0, 0), 0.0, "no trees in camp")


func test_lake_and_lighthouse() -> void:
	var g := _g()
	var lake: Vector3 = g.landmarks["lake"]["pos"]
	assert_true(g.is_water(lake.x, lake.z), "lake centre is water")
	var lh := g.landmark_pos("lighthouse")
	assert_false(g.is_water(lh.x, lh.z), "lighthouse on land")
	assert_gt(Vector2(lh.x, lh.z).length(), 150.0, "lighthouse is a real expedition")


func test_landmarks_reachable_and_dry() -> void:
	var g := _g()
	for id in ["abandoned_camp", "rosies_rest", "brams_dig", "lookout", "elder_grove", "old_mine", "hollow"]:
		var p := g.landmark_pos(id)
		assert_false(g.is_water(p.x, p.z), "%s dry" % id)
		assert_true(g.in_playable(p.x, p.z), "%s inside map" % id)


func test_deterministic() -> void:
	var a := WorldGen.new(5)
	var b := WorldGen.new(5)
	assert_eq(a.height_at(37.5, -81.2), b.height_at(37.5, -81.2))
	assert_eq(a.landmarks["abandoned_camp"]["pos"], b.landmarks["abandoned_camp"]["pos"])
