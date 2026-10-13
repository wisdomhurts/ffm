extends "res://tests/test_case.gd"
## Terrain, stream, outer ring, bridges and the painted map (pure logic; no
## rendering or physics step needed).

var _gen: WorldGen
var _masks: TerrainMasks


func _g() -> WorldGen:
	if _gen == null:
		_gen = WorldGen.new(20261010)
	return _gen


func _m() -> TerrainMasks:
	if _masks == null:
		_masks = TerrainMasks.new(_g())
		_masks.build_all()
	return _masks


func test_height_at_matches_grid_and_triangles() -> void:
	var g := _g()
	var G := WorldGen.GRID
	# Exactly the cached height on grid points.
	for p: Vector2i in [Vector2i(10, 20), Vector2i(160, 160), Vector2i(300, 7)]:
		var x := -WorldGen.HALF + p.x * WorldGen.CELL
		var z := -WorldGen.HALF + p.y * WorldGen.CELL
		assert_near(g.height_at(x, z), g.heights[p.y * G + p.x], 0.0001, "grid point height")
	# Linear along the shared diagonal (x+1, z)-(x, z+1) of a cell.
	var ix := 120
	var iz := 140
	var x0 := -WorldGen.HALF + ix * WorldGen.CELL
	var z0 := -WorldGen.HALF + iz * WorldGen.CELL
	var a := g.heights[iz * G + ix + 1]
	var b := g.heights[(iz + 1) * G + ix]
	assert_near(g.height_at(x0 + WorldGen.CELL * 0.5, z0 + WorldGen.CELL * 0.5), (a + b) * 0.5, 0.0001, "diagonal midpoint")


func test_chunk_mesh_matches_heights() -> void:
	var g := _g()
	var origin := Vector3(-WorldGen.HALF + 3.5 * 64.0, 0.0, -WorldGen.HALF + 5.5 * 64.0)
	var mesh := TerrainMesher.build_chunk(g, _m(), 3 * 32, 5 * 32, 32, 1, 1.5, origin)
	assert_eq(mesh.get_surface_count(), 1, "chunk has a surface")
	var arrays := mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var checked := 0
	for i in range(0, 33 * 33, 97):
		var v := verts[i] + origin
		assert_near(v.y, g.height_at(v.x, v.z), 0.001, "vertex on the ground")
		checked += 1
	assert_gt(checked, 5, "checked vertices")
	var cols: PackedColorArray = arrays[Mesh.ARRAY_COLOR]
	assert_eq(cols.size(), verts.size(), "mask colours per vertex")


func test_masks_in_range_and_camp_is_packed_earth() -> void:
	var m := _m()
	for arr in [m.path, m.forest, m.meadow, m.camp, m.rock, m.sand, m.wet, m.cavity]:
		var a: PackedFloat32Array = arr
		assert_eq(a.size(), WorldGen.GRID * WorldGen.GRID, "mask size")
		for i in range(0, a.size(), 997):
			assert_true(a[i] >= -0.0001 and a[i] <= 1.0001, "mask in 0..1")
	var c := TerrainMasks.grid_of(0.0, 0.0)
	assert_gt(m.camp[c.y * WorldGen.GRID + c.x], 0.9, "camp centre is packed earth")
	assert_lt(m.forest[c.y * WorldGen.GRID + c.x], 0.01, "no forest floor in camp")


func test_stream_flows_downhill_into_the_lake() -> void:
	var g := _g()
	assert_gt(g.stream.size(), 20, "dense stream polyline")
	for i in range(1, g.stream_profile.size()):
		assert_true(g.stream_profile[i] <= g.stream_profile[i - 1] + 0.0001, "never uphill at %d" % i)
	var last := g.stream[g.stream.size() - 1]
	assert_gt(g.lake_mask(last.x, last.y), 0.2, "ends in the lake")
	# Water stays inside the channel: banks above it, bed below it.
	for i in range(4, g.stream.size() - 12, 9):
		var p := g.stream[i]
		var t := (g.stream[i + 1] - g.stream[i - 1]).normalized()
		var side := Vector2(-t.y, t.x)
		var w := g.stream_surface_at_index(i)
		assert_lt(g.height_at(p.x, p.y), w - 0.15, "bed below water at %d" % i)
		var bank := p + side * (g.stream_width + 0.5)
		assert_gt(g.height_at(bank.x, bank.y), w, "bank above water at %d" % i)


func test_no_ponds_away_from_the_lake() -> void:
	var g := _g()
	var wet := 0
	for iz in range(0, WorldGen.GRID, 3):
		for ix in range(0, WorldGen.GRID, 3):
			var x := -WorldGen.HALF + ix * WorldGen.CELL
			var z := -WorldGen.HALF + iz * WorldGen.CELL
			if g.is_water(x, z) and g.lake_mask(x, z) < 0.02 and g.distance_to_stream(x, z) > 8.0:
				wet += 1
	assert_eq(wet, 0, "no stray ponds")


func test_outer_ring_continuous_and_lake_reaches_far_shore() -> void:
	var g := _g()
	for z in [-300.0, -100.0, 0.0, 150.0, 300.0]:
		assert_near(g.outer_height(-WorldGen.HALF - 0.01, z), g.height_at(-WorldGen.HALF, z), 0.2, "west seam")
		assert_near(g.outer_height(WorldGen.HALF + 0.01, z), g.height_at(WorldGen.HALF, z), 0.2, "east seam")
	# Open water westward to the far shore, land beyond it.
	for x in [-500.0, -900.0, -1200.0]:
		assert_lt(g.outer_height(x, 10.0), WorldGen.WATER_LEVEL - 2.0, "open lake at x=%d" % int(x))
	assert_gt(g.outer_height(g.far_shore_x(10.0) - 200.0, 10.0), WorldGen.WATER_LEVEL + 3.0, "far shore is land")
	# Hills (not water) beyond the north, east and south edges.
	assert_gt(g.outer_height(0.0, -700.0), 20.0, "northern hills")
	assert_gt(g.outer_height(700.0, 0.0), 20.0, "eastern hills")
	assert_gt(g.outer_height(100.0, 700.0), 20.0, "southern hills")


func test_bridges_on_every_trail_crossing() -> void:
	var g := _g()
	var crossings := Bridges.find_crossings(g)
	assert_gt(crossings.size(), 1, "trails cross the stream")
	var br := Bridges.new()
	br.gen = g
	for c in crossings:
		br._build_bridge(c)
	assert_eq(br.bridges.size(), crossings.size(), "one bridge per crossing")
	for info in br.bridges:
		var mid: float = info["mid"]
		assert_gt(mid, float(info["water"]) + 0.9, "deck clears the water")
		var c3: Vector3 = info["center"]
		assert_near(br.deck_height_at(c3.x, c3.z), mid, 0.01, "deck height query")
	assert_eq(br.deck_height_at(0.0, 0.0), -INF, "camp is not a bridge")
	br.free()


func test_map_image_is_painted_and_cached() -> void:
	var t := Terrain.new()
	t.gen = _g()
	t.masks = _m()
	var img := t.get_map_image(128)
	assert_eq(img.get_size(), Vector2i(128, 128), "map size")
	assert_true(t.get_map_image(128) == img, "cached per size")
	var lake := img.get_pixelv(Vector2i(WorldGen.world_to_map_uv(Vector3(-200, 0, 30)) * 128.0))
	var meadow := img.get_pixelv(Vector2i(WorldGen.world_to_map_uv(Vector3(20, 0, 70)) * 128.0))
	assert_gt(lake.b, lake.r, "lake is blue")
	assert_gt(meadow.g, meadow.b, "meadow is green")
	t.free()
