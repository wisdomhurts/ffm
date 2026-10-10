extends "res://tests/test_case.gd"
## Landmarks: discovery bookkeeping, chest settings and fallback loot, map
## markers, and the procedural sites themselves (built without a game: on
## the ground, deterministic, collision, clear trader spots, budgets).

const SEED := 20261010

static var _gen: WorldGen = null


func _world() -> WorldGen:
	if _gen == null:
		_gen = WorldGen.new(SEED)
	return _gen


func _build(id: String) -> LandmarkSite:
	GameState.seed = SEED
	var s := Landmarks.make_site(id)
	s.setup_site(id, _world(), null)
	s.build_site()
	return s


func test_discovery_fires_once_per_landmark() -> void:
	var d := LandmarkDiscovery.new()
	d.add("a", Vector3(10, 0, 0), 5.0)
	d.add("b", Vector3(-20, 3, 0), 8.0)
	assert_eq(d.check(Vector3.ZERO).size(), 0, "nothing in range at the origin")
	assert_eq(d.check(Vector3(14.9, 9.0, 0)), ["a"], "a found inside its radius (height ignored)")
	assert_eq(d.check(Vector3(12, 0, 0)).size(), 0, "a is not reported again")
	assert_true(d.is_found("a") and not d.is_found("b"), "only a found")
	assert_false(d.mark("a"), "mark() of a found id is false")
	assert_true(d.mark("b"), "mark() of a new id is true")
	assert_eq(d.found_ids(), ["a", "b"], "found ids sorted")
	assert_eq(LandmarkDiscovery.radius_for(4.0, 1.0, 10.0), 10.0, "minimum radius")
	assert_eq(LandmarkDiscovery.radius_for(14.0, 1.0, 10.0), 14.0, "landmark radius")


func test_chest_settings_and_tables() -> void:
	var lh := Landmarks.chest_config("lighthouse")
	assert_eq(lh.get("table", ""), "lighthouse", "lighthouse table")
	assert_eq(lh.get("restock_table", ""), "lighthouse_restock", "lighthouse restock table")
	assert_eq(int(lh.get("restock_days", 0)), 3, "restock every 3 days")
	assert_eq(lh.get("label", ""), "Keeper's Chest", "label")
	assert_eq(Landmarks.chest_config("abandoned_camp").get("tier", ""), "common", "common at the abandoned camp")
	assert_eq(Landmarks.chest_config("lookout").get("tier", ""), "rare", "rare on the lookout")
	assert_eq(Landmarks.chest_config("old_mine").get("tier", ""), "epic", "epic in the mine")
	assert_eq(Landmarks.chest_config("hollow").get("tier", ""), "epic", "epic in the hollow")
	assert_true(Landmarks.chest_config("rosies_rest").is_empty(), "trader camps have no chest")
	for id in ["lighthouse", "abandoned_camp", "lookout", "old_mine", "hollow"]:
		var cfg := Landmarks.chest_config(id)
		assert_false(DB.loot_table(str(cfg["table"])).is_empty(), "%s table exists" % id)
		if cfg.has("restock_table"):
			assert_false(DB.loot_table(str(cfg["restock_table"])).is_empty(), "%s restock table exists" % id)


func test_fallback_loot_is_deterministic() -> void:
	var a := Landmarks.fallback_loot(SEED, "lighthouse")
	var b := Landmarks.fallback_loot(SEED, "lighthouse")
	assert_eq(a, b, "same seed, same loot")
	var ids: Array = []
	for e in a:
		ids.append((e as Dictionary)["id"])
	assert_true("flashlight" in ids and "battery" in ids and "starstone" in ids, "lighthouse loot has the guaranteed finds")
	assert_true(Landmarks.fallback_loot(SEED, "rosies_rest").is_empty(), "no loot without a chest")
	assert_false(Landmarks.fallback_seed(SEED, "old_mine") == Landmarks.fallback_seed(SEED, "hollow"), "per-landmark seeds differ")


func test_marker_contract() -> void:
	var m := LandmarkMarker.new("lighthouse", "Moonmirror Lighthouse", "landmark")
	var d := m.get_map_marker()
	assert_eq(d["kind"], "landmark", "kind")
	assert_eq(d["label"], "Moonmirror Lighthouse", "label")
	assert_eq(d["important"], true, "important")
	assert_eq(d["discovered"], false, "undiscovered at first")
	m.discovered = true
	assert_eq(m.get_map_marker()["discovered"], true, "discovered later")
	m.free()


func test_every_site_builds_on_the_ground() -> void:
	var gen := _world()
	for id in Landmarks.ORDER:
		var s := _build(id)
		assert_near(s.center.y, gen.height_at(s.center.x, s.center.z), 0.001, "%s centre on the ground" % id)
		var verts := s.big.vertex_count() + s.big_cloth.vertex_count() + s.detail.vertex_count() + s.detail_cloth.vertex_count() + s.glass.vertex_count()
		assert_gt(float(verts), 3000.0, "%s has geometry" % id)
		assert_lt(float(verts), 90000.0, "%s vertex budget (%d)" % [id, verts])
		assert_gt(float(s.shapes.size()), 3.0, "%s has collision shapes" % id)
		assert_gt(float(s.zones.size()), 2.0, "%s has footprints" % id)
		# Facing the trail: local +Z points at a path within ~24 m.
		var fwd := s.to_world(Vector3(0, 0, 10)) - s.center
		var best := INF
		for path in gen.paths:
			for q in (path as PackedVector2Array):
				best = minf(best, Vector2(s.center.x + fwd.x, s.center.z + fwd.z).distance_to(q))
		assert_lt(best, 9.0, "%s faces its trail" % id)
		s.free()


func test_sites_are_deterministic() -> void:
	var a := _build("abandoned_camp")
	var b := _build("abandoned_camp")
	assert_eq(a.detail.vertex_count(), b.detail.vertex_count(), "same seed, same props")
	assert_near(a.yaw, b.yaw, 0.0001, "same facing")
	a.free()
	b.free()
	var h := _build("hollow")
	var h2 := _build("hollow")
	assert_eq(h.detail_cloth.vertex_count(), h2.detail_cloth.vertex_count(), "same ferns")
	h.free()
	h2.free()


func test_chest_spots() -> void:
	for id in ["lighthouse", "abandoned_camp", "lookout", "old_mine", "hollow"]:
		var s := _build(id)
		assert_eq(s.chest_spots.size(), 1, "%s has one chest spot" % id)
		var c: Dictionary = s.chest_spots[0]
		var p: Vector3 = c["pos"]
		assert_true(p.y >= s.gy(p.x, p.z) - 0.05, "%s chest not under the ground" % id)
		var fb: Vector3 = c["fallback"]
		assert_true(s.is_dry(fb.x, fb.z), "%s fallback loot spot is on dry land" % id)
		s.free()
	var lk := _build("lookout")
	var lp: Vector3 = lk.chest_spots[0]["pos"]
	assert_near(lp.y, RangerLookout.H, 0.01, "the lookout chest stands on the platform")
	lk.free()
	var lh := _build("lighthouse")
	var hp: Vector3 = lh.chest_spots[0]["pos"]
	assert_near(hp.y, LighthouseSite.FLOOR, 0.01, "the keeper's chest stands on the raised floor")
	assert_lt(Vector2(hp.x, hp.z).length(), LighthouseSite.R0 - LighthouseSite.WALL - 0.4, "the keeper's chest is inside the room")
	lh.free()


## Nothing solid within the 2.5 m circle at a trader camp's centre.
func test_trader_spots_stay_clear() -> void:
	for id in ["rosies_rest", "pips_dock", "brams_dig"]:
		var s := _build(id)
		var worst := INF
		for e in s.shapes:
			var d: Dictionary = e
			var xf: Transform3D = d["xform"]
			var shape: Shape3D = d["shape"]
			var dist := INF
			if shape is BoxShape3D:
				var half := (shape as BoxShape3D).size * 0.5
				# Closest point of the box (in its own frame) to the centre line.
				var lc := xf.affine_inverse() * Vector3(0, xf.origin.y, 0)
				var cp := Vector3(clampf(lc.x, -half.x, half.x), clampf(lc.y, -half.y, half.y), clampf(lc.z, -half.z, half.z))
				var w := xf * cp
				var top := (xf * Vector3(0, half.y, 0)).y
				if top < -0.5 or (xf * Vector3(0, -half.y, 0)).y > 2.0:
					continue
				dist = Vector2(w.x, w.z).length()
			elif shape is CylinderShape3D:
				var cs := shape as CylinderShape3D
				dist = Vector2(xf.origin.x, xf.origin.z).length() - cs.radius
			worst = minf(worst, dist)
		assert_gt(worst, TraderCamp.CLEAR - 0.05, "%s: nothing solid within %.1f m of the centre (closest %.2f)" % [id, TraderCamp.CLEAR, worst])
		s.free()


func test_kit_helpers() -> void:
	# torn_surface keeps only the cells asked for.
	var k := LandmarkKit.new()
	var flat := func(u: float, v: float) -> Vector3: return Vector3(u, 0.0, v)
	k.torn_surface(flat, 4, 4, func(u: float, _v: float) -> bool: return u < 0.5)
	var arr := k.to_arrays()
	assert_eq((arr[Mesh.ARRAY_INDEX] as PackedInt32Array).size(), 8 * 6, "half of 16 cells kept")
	# rail_wall: upright boxes that never reach past the ends of the line.
	var s := LandmarkSite.new()
	s.rail_wall(Vector3(0, 0, 0), Vector3(0, 3, 4), 0.08, 1.0)
	var min_z := INF
	var max_z := -INF
	for e in s.shapes:
		var xf: Transform3D = (e as Dictionary)["xform"]
		var half := ((e as Dictionary)["shape"] as BoxShape3D).size * 0.5
		assert_near(xf.basis.y.dot(Vector3.UP), 1.0, 0.001, "rail segments are upright")
		min_z = minf(min_z, xf.origin.z - half.z)
		max_z = maxf(max_z, xf.origin.z + half.z)
	assert_near(min_z, 0.0, 0.001, "rail starts at a")
	assert_near(max_z, 4.0, 0.001, "rail ends at b")
	s.free()


func test_lighthouse_shape() -> void:
	var s := _build("lighthouse") as LighthouseSite
	var top := 0.0
	for e in s.shapes:
		var xf: Transform3D = (e as Dictionary)["xform"]
		top = maxf(top, xf.origin.y)
	assert_gt(LighthouseSite.TOP + 4.0, 21.0, "tall tower (~22 m)")
	assert_gt(top, 12.0, "collision follows the tower up")
	assert_true(LighthouseSite.outer_r(0.0) > LighthouseSite.outer_r(LighthouseSite.TOP), "the tower tapers")
	var lamps := 0
	var indoor := 0
	for l in s.lanterns:
		if (l as Dictionary)["kind"] == "lamp":
			lamps += 1
		if (l as Dictionary)["always"]:
			indoor += 1
	assert_eq(lamps, 1, "one lantern-room lamp light")
	assert_gt(float(indoor), 0.0, "an indoor lamp for the keeper's room")
	var mesh := LighthouseSite.beam_cones_mesh(100.0, 0.4, 8.0, 0.03)
	assert_true(mesh != null and mesh.get_surface_count() == 1, "beam cone mesh builds")
	var aabb := mesh.get_aabb()
	assert_gt(aabb.size.x, 190.0, "two opposite cones ~100 m each")
	s.free()
