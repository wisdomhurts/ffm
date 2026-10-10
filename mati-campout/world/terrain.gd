class_name Terrain
extends Node3D
## The ground of the world and everything around it:
## - chunked terrain meshes (64 m chunks, 2 m cells near, 4 m cells far, skirts
##   so LOD seams never crack) painted by shaders/terrain.gdshader from
##   per-vertex masks (TerrainMasks),
## - an outer ring to the horizon (forested hills, the open lake, the far shore),
## - HeightMapShape3D collision (layer 1) aligned with the 2 m mesh, and
##   invisible boundary walls at WorldGen.PLAYABLE_HALF,
## - Moonmirror Lake and the stream (Water), footbridges (Bridges) and the
##   distant mountain ranges (Backdrop),
## - get_map_image(px): a painted top-down map for the map UI (cached).
##
## Public helpers for other systems: surface_at(pos), water_height_at(x, z),
## bridge_at(x, z).

const CHUNK := 64.0
const CHUNK_CELLS := 32
const CHUNKS := 10
## Near (2 m) chunks are drawn up to this distance, 4 m chunks beyond.
const NEAR_RANGE := {"low": 95.0, "medium": 135.0, "high": 175.0}
## Distance over which close-up ground detail fades out.
const DETAIL_DISTANCE := {"low": 45.0, "medium": 60.0, "high": 75.0}
const RING_A := 640.0
const RING_B := 2048.0

static var _noise_tex: Texture2D = null
static var _normal_tex: Texture2D = null

var gen: WorldGen
var masks: TerrainMasks
var material: ShaderMaterial
var outer_material: ShaderMaterial
var far_material: ShaderMaterial
var body: StaticBody3D
var water: Water
var bridges: Bridges
var backdrop: Backdrop
var _near: Array[MeshInstance3D] = []
var _far: Array[MeshInstance3D] = []
var _outer: Array[MeshInstance3D] = []
var _map_cache: Dictionary = {}


func setup(game: Game) -> void:
	if game != null:
		gen = game.gen
	if gen == null:
		gen = GameState.world_gen
	if gen == null:
		push_warning("Terrain: no WorldGen, nothing to build")
		return
	_make_materials()
	masks = TerrainMasks.new(gen)
	for i in TerrainMasks.PHASES:
		masks.build_phase(i)
		await get_tree().process_frame
		if not is_inside_tree():
			return
	_build_collision()
	_build_bounds()
	await _build_chunks()
	if not is_inside_tree():
		return
	await _build_outer()
	if not is_inside_tree():
		return
	water = Water.new()
	water.name = "Water"
	add_child(water)
	water.setup(game, self)
	await get_tree().process_frame
	if not is_inside_tree():
		return
	bridges = Bridges.new()
	bridges.name = "Bridges"
	add_child(bridges)
	bridges.setup(game, self)
	backdrop = Backdrop.new()
	backdrop.name = "Backdrop"
	add_child(backdrop)
	await backdrop.setup(game, self)
	if not is_inside_tree():
		return
	backdrop.add_haze_material(far_material)
	_apply_quality()
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)


# --- Materials ------------------------------------------------------------------------

## Shared tiling noise textures: [RGBA noise atlas, detail normal map].
## Built once per session (static cache).
static func noise_textures() -> Array:
	if _noise_tex == null:
		_noise_tex = _build_noise_atlas(256)
	if _normal_tex == null:
		var nt := NoiseTexture2D.new()
		nt.width = 512
		nt.height = 512
		nt.seamless = true
		nt.as_normal_map = true
		nt.bump_strength = 5.0
		var fn := FastNoiseLite.new()
		fn.seed = 913
		fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		fn.frequency = 0.035
		fn.fractal_type = FastNoiseLite.FRACTAL_FBM
		fn.fractal_octaves = 4
		nt.noise = fn
		_normal_tex = nt
	return [_noise_tex, _normal_tex]


## RGBA8 tiling noise: r fbm, g cellular distance (pebbles), b fbm, a grain.
static func _build_noise_atlas(size: int) -> Texture2D:
	var chans: Array[PackedByteArray] = []
	for k in 4:
		var fn := FastNoiseLite.new()
		fn.seed = 501 + k * 97
		match k:
			0:
				fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
				fn.frequency = 8.0 / size
				fn.fractal_type = FastNoiseLite.FRACTAL_FBM
				fn.fractal_octaves = 5
			1:
				fn.noise_type = FastNoiseLite.TYPE_CELLULAR
				fn.frequency = 22.0 / size
				fn.fractal_type = FastNoiseLite.FRACTAL_NONE
				fn.cellular_distance_function = FastNoiseLite.DISTANCE_EUCLIDEAN
				fn.cellular_return_type = FastNoiseLite.RETURN_DISTANCE
			2:
				fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
				fn.frequency = 5.0 / size
				fn.fractal_type = FastNoiseLite.FRACTAL_FBM
				fn.fractal_octaves = 4
			_:
				fn.noise_type = FastNoiseLite.TYPE_VALUE_CUBIC
				fn.frequency = 70.0 / size
				fn.fractal_type = FastNoiseLite.FRACTAL_FBM
				fn.fractal_octaves = 2
		var img := fn.get_seamless_image(size, size, false, false, 0.12, true)
		img.convert(Image.FORMAT_L8)
		chans.append(img.get_data())
	var n := size * size
	var data := PackedByteArray()
	data.resize(n * 4)
	var c0 := chans[0]
	var c1 := chans[1]
	var c2 := chans[2]
	var c3 := chans[3]
	for i in n:
		var o := i * 4
		data[o] = c0[i]
		data[o + 1] = c1[i]
		data[o + 2] = c2[i]
		data[o + 3] = c3[i]
	var atlas := Image.create_from_data(size, size, false, Image.FORMAT_RGBA8, data)
	atlas.generate_mipmaps()
	return ImageTexture.create_from_image(atlas)


func _make_materials() -> void:
	var tex := noise_textures()
	material = _terrain_material("res://shaders/terrain.gdshader", tex)
	outer_material = _terrain_material("res://shaders/terrain_outer.gdshader", tex)
	far_material = _terrain_material("res://shaders/terrain_far.gdshader", tex)


func _terrain_material(path: String, tex: Array) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path) as Shader
	m.set_shader_parameter("noise_tex", tex[0])
	m.set_shader_parameter("normal_tex", tex[1])
	m.set_shader_parameter("water_level", WorldGen.WATER_LEVEL)
	return m


# --- Collision ---------------------------------------------------------------------------

func _build_collision() -> void:
	body = StaticBody3D.new()
	body.name = "TerrainBody"
	body.collision_layer = 1
	body.collision_mask = 0
	add_child(body)
	var shape := HeightMapShape3D.new()
	shape.map_width = WorldGen.GRID
	shape.map_depth = WorldGen.GRID
	var data := PackedFloat32Array()
	data.resize(WorldGen.GRID * WorldGen.GRID)
	var inv := 1.0 / WorldGen.CELL
	for i in data.size():
		data[i] = gen.heights[i] * inv
	shape.map_data = data
	var cs := CollisionShape3D.new()
	cs.name = "HeightMap"
	cs.shape = shape
	cs.scale = Vector3.ONE * WorldGen.CELL
	body.add_child(cs)


## Invisible walls just outside the playable square (layer 1).
func _build_bounds() -> void:
	var bounds := StaticBody3D.new()
	bounds.name = "Bounds"
	bounds.collision_layer = 1
	bounds.collision_mask = 0
	add_child(bounds)
	var ph := WorldGen.PLAYABLE_HALF
	var thick := 4.0
	var tall := 600.0
	var span := ph * 2.0 + thick * 2.0
	for k in 4:
		var box := BoxShape3D.new()
		var cs := CollisionShape3D.new()
		cs.name = "Wall%d" % k
		if k < 2:
			box.size = Vector3(thick, tall, span)
			cs.position = Vector3((ph + thick * 0.5) * (1.0 if k == 0 else -1.0), 100.0, 0.0)
		else:
			box.size = Vector3(span, tall, thick)
			cs.position = Vector3(0.0, 100.0, (ph + thick * 0.5) * (1.0 if k == 2 else -1.0))
		cs.shape = box
		bounds.add_child(cs)


# --- Meshes ---------------------------------------------------------------------------------

func _build_chunks() -> void:
	var holder := Node3D.new()
	holder.name = "Chunks"
	add_child(holder)
	for cz in CHUNKS:
		for cx in CHUNKS:
			var origin := Vector3(-WorldGen.HALF + (cx + 0.5) * CHUNK, 0.0, -WorldGen.HALF + (cz + 0.5) * CHUNK)
			var ix0 := cx * CHUNK_CELLS
			var iz0 := cz * CHUNK_CELLS
			var near := MeshInstance3D.new()
			near.name = "Near_%d_%d" % [cx, cz]
			near.mesh = TerrainMesher.build_chunk(gen, masks, ix0, iz0, CHUNK_CELLS, 1, 1.6, origin)
			near.material_override = material
			near.position = origin
			holder.add_child(near)
			_near.append(near)
			var far := MeshInstance3D.new()
			far.name = "Far_%d_%d" % [cx, cz]
			far.mesh = TerrainMesher.build_chunk(gen, masks, ix0, iz0, CHUNK_CELLS, 2, 3.0, origin)
			far.material_override = material
			far.position = origin
			holder.add_child(far)
			_far.append(far)
		await get_tree().process_frame
		if not is_inside_tree():
			return


## Outer ring: 8 m cells to 640 m, then 32 m cells to the horizon.
func _build_outer() -> void:
	var holder := Node3D.new()
	holder.name = "Outer"
	add_child(holder)
	var a_patch := 320.0
	var a_cells := 40
	var steps_a := int(RING_A * 2.0 / a_patch)
	for pz in steps_a:
		for px in steps_a:
			var x0 := -RING_A + px * a_patch
			var z0 := -RING_A + pz * a_patch
			_add_outer_patch(holder, x0, z0, a_cells, a_patch / a_cells, WorldGen.HALF, 5.0, outer_material)
		await get_tree().process_frame
		if not is_inside_tree():
			return
	var b_patch := 1024.0
	var b_cells := 32
	var steps_b := int(RING_B * 2.0 / b_patch)
	for pz in steps_b:
		for px in steps_b:
			var x0 := -RING_B + px * b_patch
			var z0 := -RING_B + pz * b_patch
			_add_outer_patch(holder, x0, z0, b_cells, b_patch / b_cells, RING_A, 14.0, far_material)
		await get_tree().process_frame
		if not is_inside_tree():
			return


func _add_outer_patch(holder: Node3D, x0: float, z0: float, cells: int, spacing: float, hole: float, skirt: float, mat: Material) -> void:
	var size := cells * spacing
	if absf(x0 + size * 0.5) + size * 0.5 <= hole + 0.01 and absf(z0 + size * 0.5) + size * 0.5 <= hole + 0.01:
		return
	var origin := Vector3(x0 + size * 0.5, 0.0, z0 + size * 0.5)
	var mesh := TerrainMesher.build_outer_patch(gen, x0, z0, cells, spacing, hole, skirt, origin)
	if mesh.get_surface_count() == 0:
		return
	var mi := MeshInstance3D.new()
	mi.name = "Outer_%d_%d" % [int(x0), int(z0)]
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = origin
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(mi)
	_outer.append(mi)


# --- Quality -----------------------------------------------------------------------------------

func _on_setting_changed(key: String) -> void:
	if key == "quality":
		_apply_quality()


func _apply_quality() -> void:
	var q := Settings.quality()
	var r: float = NEAR_RANGE.get(q, 175.0)
	for mi in _near:
		mi.visibility_range_end = r
		mi.visibility_range_end_margin = 8.0
	for mi in _far:
		mi.visibility_range_begin = r
		mi.visibility_range_begin_margin = 8.0
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if q == "low" else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	if material:
		material.set_shader_parameter("detail_distance", float(DETAIL_DISTANCE.get(q, 75.0)))
	if water:
		water.apply_quality(q)
	if backdrop:
		backdrop.apply_quality(q)


# --- Queries for other systems ----------------------------------------------------------------

## Water surface height at (x, z) if there is water there (lake or stream),
## otherwise -INF. Handy for wading/splash/footstep logic.
func water_height_at(x: float, z: float) -> float:
	if gen == null:
		return -INF
	var g := gen.height_at(x, z)
	if g < WorldGen.WATER_LEVEL:
		return WorldGen.WATER_LEVEL
	if gen.distance_to_stream(x, z) < gen.stream_width:
		var s := gen.stream_water_height(x, z)
		if s > g:
			return s
	return -INF


## The footbridge deck height at (x, z), or -INF if not on a bridge.
func bridge_at(x: float, z: float) -> float:
	if bridges == null:
		return -INF
	return bridges.deck_height_at(x, z)


## Surface type under a world position, for footsteps and effects:
## "wood" (bridge), "water", "sand", "stone", "dirt" or "grass".
func surface_at(pos: Vector3) -> String:
	if gen == null:
		return "grass"
	var bh := bridge_at(pos.x, pos.z)
	if bh > -INF and pos.y > bh - 0.6:
		return "wood"
	var wh := water_height_at(pos.x, pos.z)
	if wh > -INF and pos.y < wh + 0.25:
		return "water"
	if masks == null:
		return "grass"
	var g := TerrainMasks.grid_of(pos.x, pos.z)
	var i := g.y * WorldGen.GRID + g.x
	if masks.rock[i] > 0.55:
		return "stone"
	if masks.sand[i] > 0.5:
		return "sand"
	if masks.path[i] > 0.5 or masks.camp[i] > 0.55:
		return "dirt"
	return "grass"


# --- Map ----------------------------------------------------------------------------------------

## A painted top-down map of the whole terrain (north up, px x px), cached per
## size. World (x, z) maps to pixel (WorldGen.world_to_map_uv(p) * px).
func get_map_image(px: int) -> Image:
	px = clampi(px, 16, 2048)
	if _map_cache.has(px):
		return _map_cache[px]
	if gen == null:
		var blank := Image.create(px, px, false, Image.FORMAT_RGB8)
		blank.fill(Color(0.86, 0.8, 0.64))
		return blank
	if masks == null:
		masks = TerrainMasks.new(gen)
		masks.build_all()
	var img := TerrainMap.paint(gen, masks, px)
	_map_cache[px] = img
	return img
