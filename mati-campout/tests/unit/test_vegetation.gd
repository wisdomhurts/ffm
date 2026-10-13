extends "res://tests/test_case.gd"
## Vegetation: procedural meshes and the tree/obstacle lookup API.


func test_tree_meshes_build_with_sane_sizes() -> void:
	for v in TreeMeshes.TREE_VARIANTS:
		var near := TreeMeshes.tree(v, 0)
		var far := TreeMeshes.tree(v, 1)
		assert_true(near != null and near.get_surface_count() == 1, "tree %d near mesh" % v)
		assert_true(far != null and far.get_surface_count() == 1, "tree %d far mesh" % v)
		var h := near.get_aabb().end.y
		assert_gt(h, TreeMeshes.tree_height(v) * 0.75, "tree %d tall enough" % v)
		assert_lt(h, TreeMeshes.tree_height(v) * 1.1, "tree %d not too tall" % v)
		# Trunks reach below the ground so they never float on slopes.
		assert_lt(near.get_aabb().position.y, -0.3, "tree %d trunk sunk" % v)
	for v in TreeMeshes.ELDER_VARIANTS:
		var e := TreeMeshes.elder(v, 0)
		assert_gt(e.get_aabb().end.y, 28.0, "elder %d is a giant" % v)
		assert_gt(e.get_aabb().size.x, 10.0, "elder %d has a wide crown" % v)
	assert_true(TreeMeshes.tree(0, 0) == TreeMeshes.tree(0, 0), "meshes are cached")
	for m in [TreeMeshes.sapling(), TreeMeshes.stump(), TreeMeshes.fallen_log(0), TreeMeshes.bush(0),
			TreeMeshes.fern(), TreeMeshes.grass(0), TreeMeshes.grass(1), TreeMeshes.flowers(),
			TreeMeshes.mushrooms(true), TreeMeshes.debris(), TreeMeshes.rock(0, 0), TreeMeshes.rock(3, 1)]:
		assert_true(m != null and (m as ArrayMesh).get_surface_count() == 1, "small mesh builds")
	assert_gt(float(TreeMeshes.rock_hull(1).size()), 10.0, "rock hull points")


func _veg_with_trees() -> Vegetation:
	var veg := Vegetation.new()
	veg._init_grid()
	veg._add_tree(Vector3(10, 0, 10), TreeMeshes.PINE_A, 1.0, 0.0, false, Color(0, 0.5, 0, 0))
	veg._add_tree(Vector3(14, 0, 10), TreeMeshes.PINE_B, 1.0, 0.0, false, Color(0, 0.5, 0, 0))
	veg._add_tree(Vector3(-50, 0, -50), 0, 1.0, 0.0, true, Color(0, 0.5, 0, 0))
	return veg


func test_find_tree_and_info() -> void:
	var veg := _veg_with_trees()
	assert_eq(veg.tree_count(), 3, "three trees")
	assert_eq(veg.find_tree(Vector3(11, 0, 10), 2.0), 0, "nearest tree")
	assert_eq(veg.find_tree(Vector3(13.5, 0, 10), 2.0), 1, "other tree")
	assert_eq(veg.find_tree(Vector3(30, 0, 30), 3.0), -1, "nothing nearby")
	assert_eq(veg.find_tree(Vector3(0, 0, 0), 70.0), 0, "large radius search")
	var info := veg.tree_info(0)
	assert_eq(info["kind"], "regular", "kind")
	assert_eq(int(info["hp"]), DB.bi("trees.regular_hp", 5), "hp from balance")
	assert_true(bool(info["alive"]), "alive")
	assert_eq(veg.tree_info(2)["kind"], "giant", "giant kind")
	assert_eq(int(veg.tree_info(2)["max_hp"]), DB.bi("trees.giant_hp", 24), "giant hp")
	assert_true(veg.tree_info(99).is_empty(), "unknown id -> {}")
	var r := veg.hit_tree(99, 1, false, Vector3.ZERO)
	assert_false(bool(r["ok"]), "hit unknown tree refused")
	veg.free()


func test_obstacles_near() -> void:
	var veg := _veg_with_trees()
	var near := veg.obstacles_near(Vector3(10, 0, 11), 1.0)
	assert_eq(near.size(), 1, "one trunk nearby")
	var o: Vector4 = near[0]
	assert_near(o.x, 10.0, 0.001, "obstacle x")
	assert_gt(o.w, 0.2, "obstacle radius")
	assert_eq(veg.obstacles_near(Vector3(12, 0, 10), 2.5).size(), 2, "both trunks")
	assert_false(veg.is_clear(Vector3(10, 0, 10), 0.5), "trunk blocks")
	assert_true(veg.is_clear(Vector3(100, 0, 100), 2.0), "open ground")
	var id := veg.add_obstacle(Vector3(100, 0, 100), 1.5)
	assert_false(veg.is_clear(Vector3(100, 0, 100), 0.5), "custom obstacle")
	veg.set_obstacle_enabled(id, false)
	assert_true(veg.is_clear(Vector3(100, 0, 100), 0.5), "disabled obstacle")
	# Giant trunk radius reaches beyond its cell.
	assert_eq(veg.obstacles_near(Vector3(-50, 0, -46.5), 0.5).size(), 1, "giant trunk found from the side")
	veg.free()
