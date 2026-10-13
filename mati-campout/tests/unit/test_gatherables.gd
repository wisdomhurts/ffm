extends "res://tests/test_case.gd"
## Gatherables: procedural pieces, deterministic placement rules, gathering,
## depletion, overflow and dawn regrowth (data-only, no rendering).

const SEED := 20261010


func _make(seed_v: int) -> Array:
	GameState.new_run(seed_v)
	var gen := WorldGen.new(seed_v)
	var g := Gatherables.new()
	g.setup_data(gen, null)
	return [g, gen]


func test_pieces_build_with_sane_data() -> void:
	for k in GatherableMeshes.KIND_COUNT:
		for v in GatherableMeshes.VARIANTS:
			var p := GatherableMeshes.piece(k, v)
			var n := p.verts.size()
			assert_gt(float(n), 20.0, "kind %d/%d has vertices" % [k, v])
			assert_lt(float(n), 3000.0, "kind %d/%d vertex budget (%d)" % [k, v, n])
			assert_eq(p.normals.size(), n, "normals")
			assert_eq(p.colors.size(), n, "colors")
			assert_eq(p.mats.size(), n, "mats")
			assert_eq(p.pivots.size(), n, "pivots")
			assert_eq(p.orders.size(), n, "orders")
			assert_eq(p.indices.size() % 3, 0, "triangles")
			var bad := 0
			for i in p.indices:
				if i < 0 or i >= n:
					bad += 1
			assert_eq(bad, 0, "indices in range")
			assert_gt(float(p.glints.size()), 0.0, "kind %d/%d has glints" % [k, v])
			assert_gt(p.radius, 0.15, "radius")
			assert_lt(p.radius, 1.2, "radius")
			assert_gt(p.height, 0.05, "height")
			assert_lt(p.height, 1.3, "height")
			# Every kind has parts that disappear when gathered.
			var removable := 0
			for o in p.orders:
				if o >= 0.0:
					removable += 1
				assert_lt(o, 1.0, "order < 1")
			assert_gt(float(removable), 0.0, "kind %d/%d removable parts" % [k, v])
	assert_true(GatherableMeshes.piece(0, 0) == GatherableMeshes.piece(0, 0), "pieces are cached")
	var mesh := GatherableMeshes.preview_mesh(GatherableMeshes.Kind.BERRY, 1)
	assert_true(mesh != null and mesh.get_surface_count() == 1, "preview mesh builds")


func test_order_bands() -> void:
	# Two charges: the first gather removes orders >= 0.5, the second the rest.
	var hi := GatherableMeshes.remap_order(0.9, 2)
	var lo := GatherableMeshes.remap_order(0.1, 2)
	assert_gt(hi, 0.5, "high band above half")
	assert_lt(hi + 0.04, 1.0, "high band fully visible at fill 1")
	assert_lt(lo + 0.04, 0.5, "low band fully visible at fill 0.5")
	assert_gt(lo, 0.0, "low band hidden at fill 0")
	assert_eq(GatherableMeshes.remap_order(-1.0, 2), -1.0, "permanent stays permanent")


func test_placement_is_deterministic_and_follows_rules() -> void:
	var a: Array = _make(SEED)
	var g: Gatherables = a[0]
	var gen: WorldGen = a[1]
	var n := g.node_count()
	assert_gt(float(n), 250.0, "a few hundred nodes (%d)" % n)
	assert_lt(float(n), 600.0, "not too many nodes (%d)" % n)
	for kind in Gatherables.KINDS:
		assert_gt(float(g.count_kind(kind)), 0.0, "some %s" % kind)
	var on_trail := 0
	var in_camp := 0
	var wet := 0
	var in_stream := 0
	for id in n:
		var p: Vector3 = g.node_info(id)["pos"]
		if Vector2(p.x, p.z).length() < Gatherables.CAMP_CLEAR:
			in_camp += 1
		if gen.distance_to_path(p.x, p.z) < 1.8:
			on_trail += 1
		if gen.is_water(p.x, p.z):
			wet += 1
		if gen.distance_to_stream(p.x, p.z) < 3.0:
			in_stream += 1
	assert_eq(in_camp, 0, "nothing in the camp clearing")
	assert_eq(on_trail, 0, "nothing on trails")
	assert_eq(wet, 0, "nothing in water")
	assert_eq(in_stream, 0, "nothing in the stream")
	# Coal sits on the ridge or by the old mine.
	var mine: Vector3 = gen.landmarks["old_mine"]["pos"]
	var stray := 0
	for id in g.nodes_near(Vector3.ZERO, 1000.0, "coal_vein"):
		var p: Vector3 = g.node_info(id)["pos"]
		if gen.biome_at(p.x, p.z) != "ridge" and Vector2(p.x - mine.x, p.z - mine.z).length() > 45.0:
			stray += 1
	assert_eq(stray, 0, "coal only on the ridge / at the mine")
	var b: Array = _make(SEED)
	var g2: Gatherables = b[0]
	assert_eq(g2.node_count(), n, "same seed, same count")
	var same := true
	for id in mini(n, g2.node_count()):
		if (g.node_info(id)["pos"] as Vector3).distance_to(g2.node_info(id)["pos"] as Vector3) > 0.001:
			same = false
			break
	assert_true(same, "same seed, same positions")
	g.free()
	g2.free()


func test_starters_near_camp() -> void:
	for s in [SEED, 424242, 7, 991133]:
		var a: Array = _make(int(s))
		var g: Gatherables = a[0]
		assert_true(g.nearest(Vector3.ZERO, "stone_pile", 25.5) >= 0, "seed %d: stones within 25 m" % s)
		assert_true(g.nearest(Vector3.ZERO, "twigs", 25.5) >= 0, "seed %d: twigs within 25 m" % s)
		assert_true(g.nearest(Vector3.ZERO, "berry_bush", 35.5) >= 0, "seed %d: berries within 35 m" % s)
		g.free()


func test_gather_gives_items_depletes_and_regrows() -> void:
	var a: Array = _make(SEED)
	var g: Gatherables = a[0]
	var seen := [0]
	var on_gathered := func(_id: String, c: int) -> void: seen[0] += c
	Events.resource_gathered.connect(on_gathered)
	var id := g.nearest(Vector3.ZERO, "stone_pile", 30.0)
	assert_true(id >= 0, "a stone pile near camp")
	var info := g.node_info(id)
	assert_eq(int(info["max_charges"]), 2, "stone piles take two gathers")
	assert_eq(g.interact_text(id), "Gather Stones", "prompt text")
	var before := GameState.inventory.count_of("stone")
	var r := g.gather_now(id)
	assert_eq(r.get("item", ""), "stone", "gives stone")
	var n := int(r.get("count", 0))
	assert_true(n >= 2 and n <= 3, "2-3 stones per gather (%d)" % n)
	assert_eq(GameState.inventory.count_of("stone"), before + n, "stones in the sack")
	assert_eq(seen[0], n, "resource_gathered emitted")
	assert_eq(int(g.node_info(id)["charges"]), 1, "one gather left")
	g.gather_now(id)
	assert_false(bool(g.node_info(id)["available"]), "depleted")
	assert_eq(g.interact_text(id), "", "no action when empty")
	assert_true(g.interact_hint(id) != "", "hint says when it comes back")
	assert_false(g.begin_gather(id, null), "cannot gather an empty pile")
	assert_true(g.gather_now(id).is_empty(), "gather_now refuses too")
	var days := DB.bi("gatherables.respawn_days", 2)
	for d in days - 1:
		g.regrow_step()
	assert_false(bool(g.node_info(id)["available"]), "not back before %d dawns" % days)
	# A real DAWN on the event bus triggers the last step.
	Events.phase_changed.emit(DayCycle.Phase.DAWN)
	assert_true(bool(g.node_info(id)["available"]), "back after %d dawns" % days)
	assert_eq(int(g.node_info(id)["charges"]), 2, "fully refilled")
	Events.resource_gathered.disconnect(on_gathered)
	g.free()


func test_gather_action_takes_time() -> void:
	var a: Array = _make(SEED)
	var g: Gatherables = a[0]
	var id := g.nearest(Vector3.ZERO, "berry_bush", 40.0)
	assert_true(id >= 0, "a berry bush near camp")
	var before := GameState.inventory.count_of("berries")
	assert_true(g.begin_gather(id, null), "gather starts")
	assert_true(g.is_gathering(id), "is gathering")
	var dur := DB.bf("gatherables.gather_seconds", 1.0)
	var t := 0.0
	while t < dur * 0.5:
		g._process(0.05)
		t += 0.05
	assert_true(g.interact_text(id).ends_with("%"), "progress in the prompt: " + g.interact_text(id))
	assert_eq(GameState.inventory.count_of("berries"), before, "nothing yet halfway")
	while t < dur + 0.2:
		g._process(0.05)
		t += 0.05
	assert_false(g.is_gathering(), "finished")
	assert_gt(float(GameState.inventory.count_of("berries")), float(before), "berries picked")
	assert_false(bool(g.node_info(id)["available"]), "bush picked clean")
	# Cancel restores the node.
	var id2 := g.nearest(Vector3.ZERO, "twigs", 60.0)
	g.begin_gather(id2, null)
	g._process(0.3)
	g.cancel_gather()
	assert_false(g.is_gathering(), "cancelled")
	assert_true(bool(g.node_info(id2)["available"]), "cancelled node still available")
	g.free()


func test_overflow_drops_and_clear_area() -> void:
	var a: Array = _make(SEED)
	var g: Gatherables = a[0]
	# Fill the sack with something else.
	for i in GameState.inventory.capacity:
		GameState.inventory.add("wood", 20)
	var id := g.nearest(Vector3.ZERO, "twigs", 40.0)
	var r := g.gather_now(id)
	assert_eq(int(r.get("given", -1)), 0, "nothing fits")
	assert_eq(int(r.get("dropped", 0)), int(r.get("count", -1)), "everything dropped as a pickup")
	var id2 := g.nearest(Vector3.ZERO, "stone_pile", 40.0)
	var p: Vector3 = g.node_info(id2)["pos"]
	assert_true(g.clear_area(p, 0.5) >= 1, "clear_area removes the node")
	assert_true(bool(g.node_info(id2)["removed"]), "marked removed")
	assert_eq(g.interact_text(id2), "", "removed nodes offer nothing")
	assert_true(g.nearest(p, "stone_pile", 0.5) < 0, "nearest skips removed nodes")
	assert_true(g.is_clear(p, 0.4), "area is clear now")
	g.free()
	GameState.state = GameState.RunState.NONE
