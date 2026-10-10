class_name Gatherables
extends Node3D
## Gatherable resource nodes: stone heaps, coal seams, berry bushes,
## mushrooms, twig bundles (kindling), old bones, cloth scraps and scrap
## metal.
##
## Placement is deterministic from GameState.seed: a stone heap and twigs
## within ~25 m of camp and a berry bush within ~35 m (first reward inside a
## minute), coal on the Rocky Ridge and around the Old Mine, cloth / scrap /
## bones at the Abandoned Campsite, Ranger Lookout and Old Mine, mushrooms in
## shady forest and Fern Hollow, berries on meadows and forest edges, twigs
## everywhere in the woods. Never on trails, water, the stream or the camp
## clearing, never on trunks or boulders (Vegetation obstacle hash).
##
## Rendering: every node's procedural piece (GatherableMeshes) is baked into
## two meshes per 64 m chunk (shadow-casting big things, shadowless small
## things) that share one shader. A small RGBA8 "state" texture (one texel
## per node: fill, shake, hidden, random) drives depletion in the shader, so
## gathering and regrowth never rebuild meshes. A Sparkle MultiMesh twinkles
## on the nodes around the player.
##
## Interaction: only nodes within REGISTER_R of the player get a
## GatherableNode in the "interactable" group. One E press starts a short
## gather (balance.gatherables.gather_seconds) with a progress ring; parts
## pop off as it runs; then the items go to the sack (overflow drops as a
## Pickup), "+3 Stone" floats up and Events.resource_gathered fires. Empty
## nodes regrow on the dawn `respawn_days` after their last gather.
##
## Public API (see docs/ARCHITECTURE.md "Gatherables"):
##   node_count(), count_kind(kind), kind_name(id), node_info(id),
##   nodes_near(pos, r, kind := ""), nearest(pos, kind := "", max_r, available_only),
##   begin_gather(id, player), gather_now(id, player := null), cancel_gather(),
##   is_gathering(id), gather_progress(), regrow_step(), clear_area(pos, r),
##   add_node(kind, pos), is_clear(pos, r), debug_stats()

const KINDS := ["stone_pile", "coal_vein", "berry_bush", "mushrooms", "twigs", "bones", "cloth", "scrap"]
const ITEMS := ["stone", "coal", "berries", "mushroom", "kindling", "bone", "cloth", "scrap_metal"]
const AMOUNT_KEYS := ["stone_pile_amount", "coal_vein_amount", "berry_bush_amount", "mushroom_amount",
	"twigs_amount", "bone_amount", "cloth_amount", "scrap_metal_amount"]
const DEFAULT_AMOUNTS := [[2, 3], [2, 3], [2, 4], [2, 3], [2, 3], [1, 2], [2, 3], [2, 3]]
const DEFAULT_COUNTS := {"stone_pile": 72, "coal_vein": 36, "berry_bush": 48, "mushrooms": 60,
	"twigs": 90, "bones": 16, "cloth": 13, "scrap": 18}
const DEFAULT_CHARGES := {"stone_pile": 2, "coal_vein": 2}
const VERBS := ["Gather Stones", "Dig Coal", "Pick Berries", "Pick Mushrooms", "Gather Twigs",
	"Pick up Bones", "Take Cloth Scraps", "Collect Scrap Metal"]
const BUSY := ["Gathering stones", "Digging coal", "Picking berries", "Picking mushrooms",
	"Gathering twigs", "Picking up bones", "Taking cloth", "Collecting scrap"]
const REGROW_WORDS := ["Stones come back", "Coal comes back", "Berries grow back", "Mushrooms grow back",
	"Twigs come back", "Bones come back", "Cloth comes back", "Scrap comes back"]
## Kinds that leave something visible when picked clean (gravel, rock, bush).
const KEEPS_BASE := [true, true, true, false, false, false, false, false]
const FLOAT_COLORS := [Color(0.86, 0.9, 0.95), Color(1.0, 0.78, 0.5), Color(1.0, 0.58, 0.64),
	Color(0.97, 0.84, 0.64), Color(0.97, 0.84, 0.56), Color(1.0, 0.97, 0.88), Color(1.0, 0.7, 0.58), Color(0.78, 0.88, 0.98)]
const TICK_SOUNDS := ["footstep_stone", "footstep_stone", "footstep_grass", "footstep_grass",
	"footstep_wood", "footstep_dirt", "footstep_grass", "footstep_stone"]
const DUST_COLORS := [Color(0.64, 0.6, 0.54), Color(0.28, 0.27, 0.27), Color(0.42, 0.55, 0.3), Color(0.5, 0.45, 0.32),
	Color(0.62, 0.52, 0.38), Color(0.85, 0.82, 0.72), Color(0.7, 0.6, 0.5), Color(0.52, 0.42, 0.34)]
const SCALES := [[0.85, 1.2], [0.85, 1.15], [0.85, 1.15], [1.15, 1.5], [0.95, 1.15], [0.95, 1.15], [0.9, 1.15], [0.9, 1.1]]
## How much a node leans with the slope (bushes and mushrooms grow upright).
const TILTS := [0.75, 0.6, 0.25, 0.35, 0.9, 0.9, 0.9, 0.8]
const SINKS := [0.035, 0.09, 0.04, 0.02, 0.012, 0.018, 0.008, 0.02]
const SAME_SPACING := [11.0, 6.0, 10.0, 9.0, 8.0, 16.0, 3.5, 3.5]
## Big kinds are registered as round obstacles with Vegetation.
const OBSTACLE := [true, true, true, false, false, false, false, true]

const SEED_GATHER := 7607
const CHUNK := 64.0
const CELL := 16.0
const STATE_W := 64
const CAMP_CLEAR := 20.5
const REGISTER_R := 8.5
const UNREGISTER_R := 11.0
const SPARKLE_R := 26.0
const SPARKLE_MAX_NODES := 28
const MIN_SPACING := 2.6
## Shader fade distances (small kinds, big kinds) per quality.
const FADE := {"high": [58.0, 115.0], "medium": [48.0, 95.0], "low": [38.0, 75.0]}
const STRUCTURE_LANDMARKS := ["lighthouse", "abandoned_camp", "lookout", "rosies_rest", "pips_dock", "brams_dig", "old_mine"]
const SHADER_PATH := "res://shaders/gatherable.gdshader"
const RING_SHADER_PATH := "res://shaders/gatherable_ring.gdshader"

var game: Game
var gen: WorldGen
var veg: Node = null

# --- Node data (index = node id) ----------------------------------------------
var _kind := PackedByteArray()
var _variant := PackedByteArray()
var _xf: Array[Transform3D] = []
var _radius := PackedFloat32Array()
var _height := PackedFloat32Array()
var _charges := PackedByteArray()
var _max_charges := PackedByteArray()
var _dawns := PackedByteArray()
var _removed := PackedByteArray()
var _gathers := PackedInt32Array()
var _fill := PackedFloat32Array()
var _shake := PackedFloat32Array()
var _obstacle := PackedInt32Array()
var _grid: Dictionary = {}  # Vector2i -> PackedInt32Array
var _chunk_nodes: Dictionary = {}  # int -> PackedInt32Array
var _kind_count := PackedInt32Array()
## Vegetation decor (bushes, stumps, saplings) footprints: Vector2i -> PackedVector3Array(x, z, r).
var _decor_grid: Dictionary = {}

# --- Rendering -------------------------------------------------------------------
var _state_img: Image = null
var _state_tex: ImageTexture = null
var _state_dirty := false
var _mat_big: ShaderMaterial = null
var _mat_small: ShaderMaterial = null
var _chunks: Dictionary = {}  # int -> Node3D
var _nch := 10
var _vertex_total := 0
var _render := false
var _sparkle: Sparkle = null
var _sparkle_t := 0.0
var _ring: MeshInstance3D = null
var _ring_mat: ShaderMaterial = null

# --- Interaction -----------------------------------------------------------------
var _proxies: Dictionary = {}  # id -> GatherableNode
var _prox_t := 0.0
var _g_idx := -1
var _g_player: Node3D = null
var _g_t := 0.0
var _g_dur := 1.0
var _g_from := 1.0
var _g_to := 0.0
var _g_tick := 0.0
var _g_reach_done := false
var _anims: Dictionary = {}  # id -> PackedFloat32Array [from, to, t, dur]
var _flyers: Array = []
var _rng := RandomNumberGenerator.new()
var _ready_done := false
## Screenshot tour: freeze the gather pose (no timing, no completion).
var debug_hold := false


class Flyer:
	var node: Node3D
	var from := Vector3.ZERO
	var t := 0.0
	var delay := 0.0
	var dur := 0.45
	var side := Vector3.ZERO


# =============================================================================
# Setup
# =============================================================================

func setup(p_game: Game) -> void:
	game = p_game
	gen = p_game.gen if p_game else GameState.world_gen
	if gen == null:
		push_warning("Gatherables: no WorldGen; nothing placed")
		return
	if p_game and p_game.vegetation:
		veg = p_game.vegetation
	elif GameState.vegetation:
		veg = GameState.vegetation
	var t0 := Time.get_ticks_msec()
	place_all()
	await get_tree().process_frame
	_render = true
	_init_state()
	_make_materials()
	await _build_chunks()
	_make_ring()
	_sparkle = Sparkle.new(SPARKLE_MAX_NODES * 3)
	add_child(_sparkle)
	_connect_signals()
	_ready_done = true
	print("Gatherables: %d nodes %s, %d chunks, %d verts in %d ms" % [
		node_count(), str(counts_by_kind()), _chunks.size(), _vertex_total, Time.get_ticks_msec() - t0])


## Data-only setup for tests and tools: places nodes and prepares the state
## (no meshes, no proxies until the node is in the tree with a player).
func setup_data(p_gen: WorldGen, p_veg: Node = null) -> void:
	gen = p_gen
	veg = p_veg
	place_all()
	_init_state()
	_connect_signals()
	_ready_done = true


func _connect_signals() -> void:
	if not Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.connect(_on_phase_changed)
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)


func _exit_tree() -> void:
	if Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.disconnect(_on_phase_changed)
	if Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.disconnect(_on_setting_changed)
	for f in _flyers:
		var fl := f as Flyer
		if fl and is_instance_valid(fl.node):
			fl.node.queue_free()
	_flyers.clear()


# =============================================================================
# Placement
# =============================================================================

func place_all() -> void:
	_clear_data()
	_rng.seed = int(GameState.seed) * 61 + SEED_GATHER
	_nch = int(ceil(WorldGen.HALF * 2.0 / CHUNK))
	var counts := _counts()
	_index_decor()
	# 1. First minutes: stones and twigs just outside the clearing, berries close by.
	_place_starters(GatherableMeshes.Kind.TWIGS, 3, 21.2, 25.0)
	_place_starters(GatherableMeshes.Kind.STONE, 2, 21.5, 25.0)
	_place_starters(GatherableMeshes.Kind.BERRY, 2, 23.5, 34.0)
	_place_starters(GatherableMeshes.Kind.MUSHROOM, 1, 26.0, 42.0)
	# 2. Landmarks.
	_place_at_landmark(GatherableMeshes.Kind.CLOTH, "abandoned_camp", 6, 0.66, 1.3)
	_place_at_landmark(GatherableMeshes.Kind.SCRAP, "abandoned_camp", 5, 0.66, 1.4)
	_place_at_landmark(GatherableMeshes.Kind.BONES, "abandoned_camp", 4, 0.75, 1.7)
	_place_at_landmark(GatherableMeshes.Kind.CLOTH, "lookout", 4, 0.7, 2.1)
	_place_at_landmark(GatherableMeshes.Kind.SCRAP, "lookout", 3, 0.7, 2.3)
	_place_at_landmark(GatherableMeshes.Kind.COAL, "old_mine", 7, 0.7, 2.8, 0.48)
	_place_at_landmark(GatherableMeshes.Kind.SCRAP, "old_mine", 5, 0.66, 1.9)
	_place_at_landmark(GatherableMeshes.Kind.SCRAP, "brams_dig", 2, 0.7, 2.2)
	_place_at_landmark(GatherableMeshes.Kind.STONE, "brams_dig", 2, 0.8, 2.6)
	_place_at_landmark(GatherableMeshes.Kind.MUSHROOM, "hollow", 8, 0.0, 1.25)
	# 3. Everything else, weighted by the terrain.
	var h := WorldGen.HALF
	_scatter(GatherableMeshes.Kind.COAL, int(counts["coal_vein"]) - count_kind("coal_vein"), _w_coal, 0.46, Rect2(10.0, -250.0, 210.0, 150.0))
	_scatter(GatherableMeshes.Kind.STONE, int(counts["stone_pile"]) - count_kind("stone_pile"), _w_stone, 0.42, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.BERRY, int(counts["berry_bush"]) - count_kind("berry_bush"), _w_berry, 0.32, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.MUSHROOM, int(counts["mushrooms"]) - count_kind("mushrooms"), _w_mushroom, 0.35, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.TWIGS, int(counts["twigs"]) - count_kind("twigs"), _w_twigs, 0.4, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.BONES, int(counts["bones"]) - count_kind("bones"), _w_bones, 0.35, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.SCRAP, int(counts["scrap"]) - count_kind("scrap"), _w_scrap, 0.35, Rect2(-h, -h, h * 2.0, h * 2.0))
	_scatter(GatherableMeshes.Kind.CLOTH, int(counts["cloth"]) - count_kind("cloth"), _w_scrap, 0.35, Rect2(-h, -h, h * 2.0, h * 2.0))


func _counts() -> Dictionary:
	var out := DEFAULT_COUNTS.duplicate()
	var cfg: Variant = DB.b("gatherables.counts", {})
	if cfg is Dictionary:
		for k in (cfg as Dictionary):
			out[str(k)] = int((cfg as Dictionary)[k])
	return out


func _clear_data() -> void:
	_kind = PackedByteArray()
	_variant = PackedByteArray()
	_xf.clear()
	_radius = PackedFloat32Array()
	_height = PackedFloat32Array()
	_charges = PackedByteArray()
	_max_charges = PackedByteArray()
	_dawns = PackedByteArray()
	_removed = PackedByteArray()
	_gathers = PackedInt32Array()
	_fill = PackedFloat32Array()
	_shake = PackedFloat32Array()
	_obstacle = PackedInt32Array()
	_grid.clear()
	_chunk_nodes.clear()
	_kind_count = PackedInt32Array()
	_kind_count.resize(GatherableMeshes.KIND_COUNT)


func _place_starters(k: int, want: int, r_min: float, r_max: float) -> void:
	var placed := _place_ring(k, want, r_min, r_max, Vector2.ZERO, 0.32, 3.0, 4.0, want * 70)
	if placed < want:
		# Crowded rim: relax trail clearance and spacing a little.
		placed += _place_ring(k, want - placed, r_min, r_max + 1.5, Vector2.ZERO, 0.4, 1.8, 2.8, want * 120)


func _place_at_landmark(k: int, lm_id: String, want: int, f_min: float, f_max: float, max_slope: float = 0.42) -> void:
	if not gen.landmarks.has(lm_id):
		return
	var lm: Dictionary = gen.landmarks[lm_id]
	var c: Vector3 = lm["pos"]
	var rad := float(lm["radius"])
	_place_ring(k, want, rad * f_min, rad * f_max, Vector2(c.x, c.z), max_slope, 2.2, minf(SAME_SPACING[k], 4.0), want * 60)


## Place up to `want` nodes in a ring around `center` (golden-angle sweep).
func _place_ring(k: int, want: int, r_min: float, r_max: float, center: Vector2, max_slope: float,
		min_path: float, same: float, tries: int) -> int:
	var placed := 0
	var a0 := _rng.randf() * TAU
	for attempt in tries:
		if placed >= want:
			break
		var a := a0 + float(attempt) * 2.39996 + _rng.randf_range(-0.15, 0.15)
		var r := sqrt(_rng.randf_range(r_min * r_min, r_max * r_max))
		var x := center.x + cos(a) * r
		var z := center.y + sin(a) * r
		if not _site_ok(x, z, k, max_slope, min_path, same):
			continue
		_add(k, x, z)
		placed += 1
	return placed


func _scatter(k: int, want: int, weight: Callable, max_slope: float, region: Rect2) -> int:
	if want <= 0:
		return 0
	var placed := 0
	for attempt in want * 90:
		if placed >= want:
			break
		var x := _rng.randf_range(region.position.x, region.end.x)
		var z := _rng.randf_range(region.position.y, region.end.y)
		var roll := _rng.randf()
		if absf(x) > WorldGen.PLAYABLE_HALF - 6.0 or absf(z) > WorldGen.PLAYABLE_HALF - 6.0:
			continue
		if Vector2(x, z).length() < CAMP_CLEAR + 1.0 or gen.height_at(x, z) < WorldGen.WATER_LEVEL + 0.45:
			continue
		var w: float = weight.call(x, z)
		if roll > w:
			continue
		if not _site_ok(x, z, k, max_slope, 2.6, SAME_SPACING[k]):
			continue
		_add(k, x, z)
		placed += 1
	return placed


# --- Weights (0..1 acceptance probability) ----------------------------------------

func _w_stone(x: float, z: float) -> float:
	return (0.16 + 0.8 * gen.rock_factor(x, z)) * (1.0 - gen.meadow_factor(x, z) * 0.4)


func _w_coal(x: float, z: float) -> float:
	if gen.biome_at(x, z) != "ridge":
		return 0.0
	return smoothstep(0.45, 0.9, gen.rock_factor(x, z))


func _w_berry(x: float, z: float) -> float:
	var can := _canopy(x, z)
	var edge := smoothstep(0.02, 0.15, can) * (1.0 - smoothstep(0.4, 0.7, can))
	var w := 0.06 + gen.meadow_factor(x, z) * 0.55 + edge * 0.5
	return w * (1.0 - gen.rock_factor(x, z) * 0.7)


func _w_mushroom(x: float, z: float) -> float:
	var can := _canopy(x, z)
	var w := smoothstep(0.3, 0.75, can) * 0.8
	if gen.is_elder_grove(x, z):
		w += 0.25
	return w * (1.0 - gen.rock_factor(x, z) * 0.8) * (1.0 - gen.meadow_factor(x, z))


func _w_twigs(x: float, z: float) -> float:
	var can := _canopy(x, z)
	return (0.08 + 0.85 * smoothstep(0.08, 0.55, can)) * (1.0 - gen.meadow_factor(x, z) * 0.7) * (1.0 - gen.rock_factor(x, z) * 0.6)


func _w_bones(x: float, z: float) -> float:
	if Vector2(x, z).length() < 70.0:
		return 0.0
	return smoothstep(0.2, 0.6, _canopy(x, z)) * 0.25


## Stray bits: near trails far from camp (lost by earlier campers).
func _w_scrap(x: float, z: float) -> float:
	if Vector2(x, z).length() < 80.0:
		return 0.0
	var pd := _path_d(x, z)
	return 0.25 * smoothstep(9.0, 4.0, pd)


# --- Site checks -------------------------------------------------------------------

func _path_d(x: float, z: float) -> float:
	if veg and veg.has_method("path_distance"):
		return float(veg.call("path_distance", x, z))
	return gen.distance_to_path(x, z)


func _canopy(x: float, z: float) -> float:
	if veg and veg.has_method("canopy_at"):
		return float(veg.call("canopy_at", x, z))
	return clampf(gen.forest_density(x, z) * 1.2, 0.0, 1.0)


func _veg_clear(p: Vector3, r: float) -> bool:
	if veg and veg.has_method("is_clear"):
		return bool(veg.call("is_clear", p, r))
	return true


func _in_structure(x: float, z: float) -> bool:
	for id in STRUCTURE_LANDMARKS:
		if not gen.landmarks.has(id):
			continue
		var lm: Dictionary = gen.landmarks[id]
		var c: Vector3 = lm["pos"]
		if Vector2(x - c.x, z - c.z).length() < float(lm["radius"]) * 0.62:
			return true
	return false


func _site_ok(x: float, z: float, k: int, max_slope: float, min_path: float, same: float) -> bool:
	var pc := GatherableMeshes.piece(k, 0)
	var r := pc.radius * float(SCALES[k][1])
	if absf(x) > WorldGen.PLAYABLE_HALF - 6.0 or absf(z) > WorldGen.PLAYABLE_HALF - 6.0:
		return false
	if Vector2(x, z).length() < CAMP_CLEAR + r:
		return false
	var h := gen.height_at(x, z)
	if h < WorldGen.WATER_LEVEL + 0.45 or gen.is_water(x, z):
		return false
	if gen.lake_mask(x, z) > 0.3:
		return false
	if gen.distance_to_stream(x, z) < 4.2 + r:
		return false
	if gen.slope_at(x, z) > max_slope:
		return false
	if _in_structure(x, z):
		return false
	if _too_close(x, z, k, MIN_SPACING + r, same):
		return false
	if _path_d(x, z) < min_path + r:
		return false
	if not _veg_clear(Vector3(x, h, z), r * 0.8 + 0.3):
		return false
	if _decor_hit(x, z, r * 0.85):
		return false
	return true


## Index Vegetation's decor (bushes, stumps, saplings) so nodes never grow
## into them. Uses `vegetation.decor_footprints()` (Array of Vector3(x, z, r))
## when it exists, else reads the decor list defensively; never required.
func _index_decor() -> void:
	_decor_grid.clear()
	if veg == null or not is_instance_valid(veg):
		return
	var src: Variant = null
	if veg.has_method("decor_footprints"):
		src = veg.call("decor_footprints")
	else:
		src = veg.get("_decor")
	if not (src is Array):
		return
	for e in (src as Array):
		if e is Vector3:
			var v3: Vector3 = e
			_decor_add(v3.x, v3.y, v3.z)
		elif e is Array and (e as Array).size() >= 2 and (e as Array)[1] is Transform3D:
			var layer := int((e as Array)[0]) if (e as Array)[0] is int else 0
			var xf: Transform3D = (e as Array)[1]
			var sc := xf.basis.get_scale().x
			var r := 0.0
			if layer >= 20 and layer < 30:
				r = 0.95 * sc  # bushes
			elif layer >= 40 and layer < 50:
				r = 0.55 * sc  # stumps
			elif layer >= 50 and layer < 60:
				r = 0.6 * sc  # saplings
			if r > 0.0:
				_decor_add(xf.origin.x, xf.origin.z, r)


func _decor_add(x: float, z: float, r: float) -> void:
	var c := _cell(x, z)
	var arr: PackedVector3Array = _decor_grid.get(c, PackedVector3Array())
	arr.append(Vector3(x, z, r))
	_decor_grid[c] = arr


func _decor_hit(x: float, z: float, r: float) -> bool:
	if _decor_grid.is_empty():
		return false
	var c0 := _cell(x - r - 1.5, z - r - 1.5)
	var c1 := _cell(x + r + 1.5, z + r + 1.5)
	for cz in range(c0.y, c1.y + 1):
		for cx in range(c0.x, c1.x + 1):
			var key := Vector2i(cx, cz)
			if not _decor_grid.has(key):
				continue
			for d in (_decor_grid[key] as PackedVector3Array):
				if Vector2(d.x - x, d.y - z).length() < r + d.z:
					return true
	return false


func _cell(x: float, z: float) -> Vector2i:
	return Vector2i(int(floor((x + WorldGen.HALF) / CELL)), int(floor((z + WorldGen.HALF) / CELL)))


func _too_close(x: float, z: float, k: int, spacing: float, same: float) -> bool:
	var reach := maxf(spacing, same)
	var c0 := _cell(x - reach, z - reach)
	var c1 := _cell(x + reach, z + reach)
	for cz in range(c0.y, c1.y + 1):
		for cx in range(c0.x, c1.x + 1):
			var key := Vector2i(cx, cz)
			if not _grid.has(key):
				continue
			for id in (_grid[key] as PackedInt32Array):
				var o := _xf[id].origin
				var d := Vector2(o.x - x, o.z - z).length()
				if d < spacing + _radius[id]:
					return true
				if int(_kind[id]) == k and d < same:
					return true
	return false


func _add(k: int, x: float, z: float, variant: int = -1, yaw: float = -1.0, s: float = -1.0) -> int:
	var id := _kind.size()
	if variant < 0:
		variant = _rng.randi() % GatherableMeshes.VARIANTS
	if yaw < 0.0:
		yaw = _rng.randf() * TAU
	if s <= 0.0:
		s = _rng.randf_range(float(SCALES[k][0]), float(SCALES[k][1]))
	var pc := GatherableMeshes.piece(k, variant)
	var nrm := gen.normal_at(x, z)
	var b := Basis(Vector3.UP, yaw)
	var ax := Vector3.UP.cross(nrm)
	if ax.length_squared() > 1e-6:
		b = Basis(ax.normalized(), Vector3.UP.angle_to(nrm) * float(TILTS[k])) * b
	b = b.scaled(Vector3.ONE * s)
	# Sit on the lowest nearby ground so nothing floats on slopes.
	var r := pc.radius * s
	var y := gen.height_at(x, z)
	var ymin := y
	for i in 4:
		var a := yaw + float(i) * PI * 0.5 + 0.4
		ymin = minf(ymin, gen.height_at(x + cos(a) * r * 0.75, z + sin(a) * r * 0.75))
	var py := lerpf(y, ymin, 0.7) - float(SINKS[k]) * s
	var xf := Transform3D(b, Vector3(x, py, z))
	_kind.append(k)
	_variant.append(variant)
	_xf.append(xf)
	_radius.append(r)
	_height.append(pc.height * s)
	var ch := _charges_for(k)
	_charges.append(ch)
	_max_charges.append(ch)
	_dawns.append(0)
	_removed.append(0)
	_gathers.append(0)
	_fill.append(1.0)
	_shake.append(0.0)
	var cell := _cell(x, z)
	if not _grid.has(cell):
		_grid[cell] = PackedInt32Array()
	var arr: PackedInt32Array = _grid[cell]
	arr.append(id)
	_grid[cell] = arr
	var ci := _chunk_of(x, z)
	if not _chunk_nodes.has(ci):
		_chunk_nodes[ci] = PackedInt32Array()
	var cn: PackedInt32Array = _chunk_nodes[ci]
	cn.append(id)
	_chunk_nodes[ci] = cn
	_kind_count[k] += 1
	var obs := -1
	if OBSTACLE[k] and veg and veg.has_method("add_obstacle"):
		obs = int(veg.call("add_obstacle", Vector3(x, py, z), r * 0.6))
	_obstacle.append(obs)
	return id


func _charges_for(k: int) -> int:
	var cfg: Variant = DB.b("gatherables.charges", {})
	var d: Dictionary = cfg if cfg is Dictionary else {}
	return clampi(int(d.get(KINDS[k], DEFAULT_CHARGES.get(KINDS[k], 1))), 1, 8)


func _chunk_of(x: float, z: float) -> int:
	var cx := clampi(int(floor((x + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	var cz := clampi(int(floor((z + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	return cz * _nch + cx


# =============================================================================
# Rendering
# =============================================================================

func _init_state() -> void:
	var rows := int(ceil(float(node_count() + 256) / float(STATE_W)))
	var img := Image.create(STATE_W, maxi(rows, 1), false, Image.FORMAT_RGBA8)
	if _state_img:
		img.blit_rect(_state_img, Rect2i(0, 0, STATE_W, mini(_state_img.get_height(), rows)), Vector2i.ZERO)
	_state_img = img
	for id in node_count():
		_write_state(id)
	if _render:
		_state_tex = ImageTexture.create_from_image(_state_img)
		for m in [_mat_big, _mat_small]:
			if m:
				(m as ShaderMaterial).set_shader_parameter("state_tex", _state_tex)
	_state_dirty = false


func _node_rand(id: int) -> float:
	return fposmod(sin(float(id) * 12.9898 + float(GameState.seed % 1000) * 0.137) * 43758.5453, 1.0)


func _write_state(id: int) -> void:
	if _state_img == null:
		return
	if id / STATE_W >= _state_img.get_height():
		_init_state()
		return
	var hidden := 1.0 if _removed[id] != 0 else 0.0
	_state_img.set_pixel(id % STATE_W, id / STATE_W, Color(clampf(_fill[id], 0.0, 1.0), clampf(_shake[id], 0.0, 1.0), hidden, _node_rand(id)))
	_state_dirty = true


func _set_fill(id: int, f: float) -> void:
	_fill[id] = f
	_write_state(id)


func _make_materials() -> void:
	var shader: Shader = load(SHADER_PATH)
	_mat_big = ShaderMaterial.new()
	_mat_big.shader = shader
	_mat_small = ShaderMaterial.new()
	_mat_small.shader = shader
	for m in [_mat_big, _mat_small]:
		(m as ShaderMaterial).set_shader_parameter("state_width", STATE_W)
		if _state_tex:
			(m as ShaderMaterial).set_shader_parameter("state_tex", _state_tex)
	_apply_quality()


func _fade() -> Array:
	var q := Settings.quality() if Settings.has_method("quality") else "high"
	return FADE.get(q, FADE["high"])


func _apply_quality() -> void:
	var f := _fade()
	if _mat_small:
		_mat_small.set_shader_parameter("fade_far", float(f[0]))
	if _mat_big:
		_mat_big.set_shader_parameter("fade_far", float(f[1]))
	for ci in _chunks:
		var holder: Node3D = _chunks[ci]
		for child in holder.get_children():
			var mi := child as MeshInstance3D
			if mi == null:
				continue
			var big := mi.name == "Big"
			mi.visibility_range_end = float(f[1] if big else f[0]) + CHUNK * 0.75


func _on_setting_changed(key: String) -> void:
	if key == "quality":
		_apply_quality()


func _build_chunks() -> void:
	var t0 := Time.get_ticks_msec()
	for ci in _chunk_nodes.keys():
		_rebuild_chunk(int(ci))
		if Time.get_ticks_msec() - t0 > 30:
			await get_tree().process_frame
			t0 = Time.get_ticks_msec()


func _chunk_origin(ci: int) -> Vector3:
	var cx := ci % _nch
	var cz := ci / _nch
	return Vector3(float(cx) * CHUNK - WorldGen.HALF + CHUNK * 0.5, 0.0, float(cz) * CHUNK - WorldGen.HALF + CHUNK * 0.5)


func _rebuild_chunk(ci: int) -> void:
	if not _render:
		return
	if _chunks.has(ci):
		var old: Node3D = _chunks[ci]
		for child in old.get_children():
			var mi := child as MeshInstance3D
			if mi and mi.mesh:
				_vertex_total -= (mi.mesh as ArrayMesh).surface_get_array_len(0)
		old.queue_free()
		_chunks.erase(ci)
	var ids: PackedInt32Array = _chunk_nodes.get(ci, PackedInt32Array())
	if ids.is_empty():
		return
	var origin := _chunk_origin(ci)
	var big := GatherableMeshes.Accum.new()
	var small := GatherableMeshes.Accum.new()
	for id in ids:
		var pc := GatherableMeshes.piece(_kind[id], _variant[id])
		var xf := _xf[id]
		var local := Transform3D(xf.basis, xf.origin - origin)
		if pc.casts_shadow:
			big.add(pc, local, id, _max_charges[id])
		else:
			small.add(pc, local, id, _max_charges[id])
	var holder := Node3D.new()
	holder.name = "Chunk%d" % ci
	add_child(holder)
	holder.position = origin
	var f := _fade()
	for pair in [[big, "Big", _mat_big, true, float(f[1])], [small, "Small", _mat_small, false, float(f[0])]]:
		var acc: GatherableMeshes.Accum = pair[0]
		if acc.is_empty():
			continue
		var mi := MeshInstance3D.new()
		mi.name = str(pair[1])
		mi.mesh = acc.commit(pair[2] as ShaderMaterial)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if bool(pair[3]) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		mi.extra_cull_margin = 0.6
		mi.visibility_range_end = float(pair[4]) + CHUNK * 0.75
		mi.visibility_range_end_margin = 8.0
		holder.add_child(mi)
		_vertex_total += acc.verts.size()
	_chunks[ci] = holder


func _make_ring() -> void:
	_ring = MeshInstance3D.new()
	_ring.name = "GatherRing"
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	_ring.mesh = q
	_ring_mat = ShaderMaterial.new()
	_ring_mat.shader = load(RING_SHADER_PATH)
	_ring_mat.render_priority = Material.RENDER_PRIORITY_MAX
	_ring.material_override = _ring_mat
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ring.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	_ring.extra_cull_margin = 2.0
	_ring.top_level = true
	_ring.visible = false
	add_child(_ring)


func _show_ring(id: int, progress: float) -> void:
	if _ring == null:
		return
	if id < 0:
		_ring.visible = false
		return
	_ring.visible = true
	_ring.global_position = _top_point(id) + Vector3(0, 0.3, 0)
	_ring_mat.set_shader_parameter("progress", clampf(progress, 0.0, 1.0))


# =============================================================================
# Per-frame
# =============================================================================

func _process(delta: float) -> void:
	if not _ready_done:
		return
	if _g_idx >= 0 and not debug_hold:
		_tick_gather(delta)
	if not _anims.is_empty():
		_tick_anims(delta)
	if not _flyers.is_empty():
		_tick_flyers(delta)
	_prox_t -= delta
	if _prox_t <= 0.0:
		_prox_t = 0.2
		_update_proxies()
	_sparkle_t -= delta
	if _sparkle_t <= 0.0:
		_sparkle_t = 0.4
		_update_sparkle()
	if _state_dirty and _state_tex:
		_state_tex.update(_state_img)
		_state_dirty = false


func _player_node() -> Node3D:
	var p := GameState.player
	if p and is_instance_valid(p) and p.is_inside_tree():
		return p
	return null


func _update_proxies() -> void:
	var pl := _player_node()
	if pl == null:
		if not _proxies.is_empty():
			for id in _proxies.keys():
				_free_proxy(int(id))
		return
	var pp := pl.global_position
	for id in _proxies.keys():
		var i := int(id)
		var o := _xf[i].origin
		if _removed[i] != 0 or Vector2(o.x - pp.x, o.z - pp.z).length() > UNREGISTER_R:
			_free_proxy(i)
	for id in nodes_near(pp, REGISTER_R):
		if _proxies.has(id) or _removed[id] != 0:
			continue
		var gn := GatherableNode.new()
		var o := _xf[id].origin
		var point := o + Vector3(0, minf(_height[id] * 0.5, 0.45), 0)
		gn.setup(self, id, o, point, clampf(1.85 + _radius[id] * 0.8, 2.2, 3.0))
		add_child(gn)
		_proxies[id] = gn


func _free_proxy(id: int) -> void:
	var gn: Node = _proxies.get(id)
	_proxies.erase(id)
	if gn and is_instance_valid(gn):
		gn.queue_free()


func _update_sparkle() -> void:
	if _sparkle == null:
		return
	var pl := _player_node()
	var center := pl.global_position if pl else Vector3.INF
	if pl == null:
		var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
		if cam == null:
			_sparkle.clear_points()
			return
		center = cam.global_position
	var near := nodes_near(center, SPARKLE_R)
	var pairs: Array = []
	for id in near:
		if _removed[id] != 0 or _charges[id] <= 0 or id == _g_idx:
			continue
		var o := _xf[id].origin
		pairs.append([Vector2(o.x - center.x, o.z - center.z).length_squared(), id])
	pairs.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]))
	var pts := PackedVector3Array()
	var sizes := PackedFloat32Array()
	var strengths := PackedFloat32Array()
	for i in mini(pairs.size(), SPARKLE_MAX_NODES):
		var id := int(pairs[i][1])
		var pc := GatherableMeshes.piece(_kind[id], _variant[id])
		var xf := _xf[id]
		var s := xf.basis.get_scale().x
		for g in pc.glints:
			pts.append(xf * g)
			sizes.append(clampf(0.13 + _radius[id] * 0.12, 0.13, 0.24) * clampf(s, 0.8, 1.2))
			strengths.append(1.0)
	_sparkle.set_points(pts, sizes, strengths)


# =============================================================================
# Queries
# =============================================================================

func node_count() -> int:
	return _kind.size()


func count_kind(kind: String) -> int:
	var k := KINDS.find(kind)
	if k < 0 or _kind_count.size() <= k:
		return 0
	return _kind_count[k]


func counts_by_kind() -> Dictionary:
	var out := {}
	for k in KINDS.size():
		out[KINDS[k]] = _kind_count[k] if k < _kind_count.size() else 0
	return out


func kind_name(id: int) -> String:
	return KINDS[_kind[id]] if _valid_id(id) else ""


func _valid_id(id: int) -> bool:
	return id >= 0 and id < _kind.size()


## {kind, item, pos, radius, height, charges, max_charges, available,
##  dawns_left, removed} or {} for an unknown id.
func node_info(id: int) -> Dictionary:
	if not _valid_id(id):
		return {}
	var k := int(_kind[id])
	return {
		"kind": KINDS[k], "item": ITEMS[k], "pos": _xf[id].origin, "radius": _radius[id],
		"height": _height[id], "charges": int(_charges[id]), "max_charges": int(_max_charges[id]),
		"available": _charges[id] > 0 and _removed[id] == 0, "dawns_left": int(_dawns[id]),
		"removed": _removed[id] != 0, "variant": int(_variant[id]),
	}


## Node ids whose centre is within `r` (horizontal) of `pos`.
func nodes_near(pos: Vector3, r: float, kind: String = "") -> PackedInt32Array:
	var out := PackedInt32Array()
	var k := KINDS.find(kind) if kind != "" else -1
	var c0 := _cell(pos.x - r, pos.z - r)
	var c1 := _cell(pos.x + r, pos.z + r)
	var r2 := r * r
	for cz in range(c0.y, c1.y + 1):
		for cx in range(c0.x, c1.x + 1):
			var key := Vector2i(cx, cz)
			if not _grid.has(key):
				continue
			for id in (_grid[key] as PackedInt32Array):
				if k >= 0 and int(_kind[id]) != k:
					continue
				var o := _xf[id].origin
				var dx := o.x - pos.x
				var dz := o.z - pos.z
				if dx * dx + dz * dz <= r2:
					out.append(id)
	return out


## The nearest node (optionally of one kind / still available), or -1.
func nearest(pos: Vector3, kind: String = "", max_r: float = 1e9, available_only: bool = true) -> int:
	var best := -1
	var bd := max_r * max_r
	var k := KINDS.find(kind) if kind != "" else -1
	for id in node_count():
		if k >= 0 and int(_kind[id]) != k:
			continue
		if _removed[id] != 0 or (available_only and _charges[id] <= 0):
			continue
		var o := _xf[id].origin
		var d := Vector2(o.x - pos.x, o.z - pos.z).length_squared()
		if d < bd:
			bd = d
			best = id
	return best


## True when no gatherable overlaps the circle (pos, r).
func is_clear(pos: Vector3, r: float) -> bool:
	for id in nodes_near(pos, r + 1.5):
		if _removed[id] != 0:
			continue
		var o := _xf[id].origin
		if Vector2(o.x - pos.x, o.z - pos.z).length() < r + _radius[id]:
			return false
	return true


func _top_point(id: int) -> Vector3:
	return _xf[id].origin + Vector3(0, maxf(_height[id], 0.15), 0)


# =============================================================================
# Interaction
# =============================================================================

func interact_text(id: int, _player: Node = null) -> String:
	if not _valid_id(id) or _removed[id] != 0:
		return ""
	var k := int(_kind[id])
	if id == _g_idx:
		return "%s... %d%%" % [BUSY[k], int(round(gather_progress() * 100.0))]
	if _charges[id] <= 0:
		return ""
	return VERBS[k]


func interact_hint(id: int, _player: Node = null) -> String:
	if not _valid_id(id) or _removed[id] != 0 or id == _g_idx:
		return ""
	var k := int(_kind[id])
	if _charges[id] > 0 or not KEEPS_BASE[k]:
		return ""
	var d := maxi(int(_dawns[id]), 1)
	if d <= 1:
		return "%s at sunrise" % REGROW_WORDS[k]
	return "%s in %d days" % [REGROW_WORDS[k], d]


func is_gathering(id: int = -1) -> bool:
	return _g_idx >= 0 and (id < 0 or id == _g_idx)


func gather_progress() -> float:
	if _g_idx < 0:
		return 0.0
	return clampf(_g_t / maxf(_g_dur, 0.01), 0.0, 1.0)


## Start the short gather action (one E press). Returns false when the node
## is empty, removed or unknown.
func begin_gather(id: int, player: Node = null) -> bool:
	if not _valid_id(id) or _removed[id] != 0 or _charges[id] <= 0:
		return false
	if GameState.state == GameState.RunState.DEAD:
		return false
	if id == _g_idx:
		return true
	if _g_idx >= 0:
		cancel_gather()
	_g_idx = id
	_g_player = player as Node3D
	_g_t = 0.0
	_g_dur = maxf(DB.bf("gatherables.gather_seconds", 1.0), 0.05)
	var mx := float(maxi(_max_charges[id], 1))
	_g_from = float(_charges[id]) / mx
	_g_to = float(_charges[id] - 1) / mx
	_g_tick = 0.0
	_g_reach_done = false
	_shake[id] = 1.0
	_write_state(id)
	_show_ring(id, 0.0)
	Audio.play(TICK_SOUNDS[_kind[id]], _top_point(id), -6.0, 0.15)
	_sparkle_t = 0.0
	return true


func cancel_gather() -> void:
	if _g_idx < 0:
		return
	var id := _g_idx
	_g_idx = -1
	_g_player = null
	_shake[id] = 0.0
	# Parts that already popped off come back.
	_anims[id] = PackedFloat32Array([_fill[id], float(_charges[id]) / float(maxi(_max_charges[id], 1)), 0.0, 0.25])
	_write_state(id)
	_show_ring(-1, 0.0)
	_sparkle_t = 0.0


func _gather_ok() -> bool:
	if GameState.state == GameState.RunState.DEAD:
		return false
	if _removed[_g_idx] != 0 or _charges[_g_idx] <= 0:
		return false
	if _g_player == null:
		return true
	if not is_instance_valid(_g_player) or not _g_player.is_inside_tree():
		return false
	var o := _xf[_g_idx].origin
	var pp := _g_player.global_position
	return Vector2(o.x - pp.x, o.z - pp.z).length() <= clampf(1.85 + _radius[_g_idx] * 0.8, 2.2, 3.0) + 1.3


func _tick_gather(delta: float) -> void:
	if not _gather_ok():
		cancel_gather()
		return
	_g_t += delta
	var u := gather_progress()
	var id := _g_idx
	_set_fill(id, lerpf(_g_from, _g_to, smoothstep(0.0, 1.0, u)))
	_shake[id] = 1.0 - u * 0.4
	_write_state(id)
	_show_ring(id, u)
	_g_tick += delta
	if _g_tick >= 0.32 and u < 0.95:
		_g_tick = 0.0
		Audio.play(TICK_SOUNDS[_kind[id]], _top_point(id), -8.0, 0.15)
	if not _g_reach_done and u >= 0.45 and _g_player:
		_g_reach_done = true
		var model: Variant = _g_player.get("model")
		if model is Node and (model as Node).has_method("play_action") and (model as Node).has_method("current_action"):
			if str((model as Node).call("current_action")) == "":
				(model as Node).call("play_action", "interact")
	if u >= 1.0:
		var pl := _g_player
		_g_idx = -1
		_g_player = null
		_shake[id] = 0.0
		_show_ring(-1, 0.0)
		_finish(id, pl)


## Gather a node instantly (tests, dev tools, future auto-gather). Returns
## {item, count, given, dropped} or {} when nothing could be gathered.
func gather_now(id: int, player: Node = null) -> Dictionary:
	if not _valid_id(id) or _removed[id] != 0 or _charges[id] <= 0:
		return {}
	if id == _g_idx:
		_g_idx = -1
		_g_player = null
		_show_ring(-1, 0.0)
	_shake[id] = 0.0
	return _finish(id, player as Node3D)


func _roll_amount(id: int) -> int:
	var k := int(_kind[id])
	var cfg: Variant = DB.b("gatherables." + AMOUNT_KEYS[k], DEFAULT_AMOUNTS[k])
	var lo := 1
	var hi := 1
	if cfg is Array and (cfg as Array).size() >= 2:
		lo = int((cfg as Array)[0])
		hi = int((cfg as Array)[1])
	elif cfg is float or cfg is int:
		lo = int(cfg)
		hi = lo
	var r := RandomNumberGenerator.new()
	r.seed = hash([int(GameState.seed), id, int(_gathers[id]), SEED_GATHER])
	return maxi(r.randi_range(mini(lo, hi), maxi(lo, hi)), 1)


func _finish(id: int, player: Node3D) -> Dictionary:
	var k := int(_kind[id])
	var item: String = ITEMS[k]
	var n := _roll_amount(id)
	_charges[id] = maxi(int(_charges[id]) - 1, 0)
	_gathers[id] += 1
	_dawns[id] = clampi(DB.bi("gatherables.respawn_days", 2), 1, 250)
	_anims.erase(id)
	_set_fill(id, float(_charges[id]) / float(maxi(_max_charges[id], 1)))
	var top := _top_point(id)
	var left := GameState.give(item, n)
	var got := n - left
	if left > 0:
		var dir := Vector3.UP * 3.0
		if player and is_instance_valid(player):
			var to := player.global_position - top
			to.y = 0.0
			dir += to.normalized() * 1.2 if to.length_squared() > 0.01 else Vector3.ZERO
		Pickup.spawn(item, left, top + Vector3(0, 0.25, 0), dir)
	if got > 0:
		Events.float_text.emit(top + Vector3(0, 0.35, 0), "+%d %s" % [got, DB.item_name(item)], FLOAT_COLORS[k])
	else:
		Events.float_text.emit(top + Vector3(0, 0.35, 0), "Sack full!", Color(1.0, 0.62, 0.45))
	Audio.play(Pickup.sound_for(item), top)
	Events.resource_gathered.emit(item, n)
	GameState.stat_add("resources_gathered", n)
	if _render and is_inside_tree():
		_fx(id, k, top, player, got)
	_sparkle_t = 0.0
	return {"item": item, "count": n, "given": got, "dropped": left}


func _fx_parent() -> Node:
	if game and is_instance_valid(game) and game.fx and is_instance_valid(game.fx):
		return game.fx
	return self


func _fx(id: int, k: int, top: Vector3, player: Node3D, got: int) -> void:
	var parent := _fx_parent()
	var base := _xf[id].origin + Vector3(0, 0.15, 0)
	if k == GatherableMeshes.Kind.TWIGS:
		var toward := (player.global_position - base) if player and is_instance_valid(player) else Vector3.BACK
		WoodChips.burst(parent, base, toward, 7)
	else:
		var size := 0.55 if k in [GatherableMeshes.Kind.MUSHROOM, GatherableMeshes.Kind.BONES, GatherableMeshes.Kind.BERRY] else 0.85
		DustPuff.spawn(parent, base, size, 5, DUST_COLORS[k])
	# A few items hop out of the node and fly into the player.
	if player == null or not is_instance_valid(player) or not player.is_inside_tree() or got <= 0:
		return
	var item: String = ITEMS[k]
	for i in mini(got, 3):
		var model := ItemModels.build(item)
		if model == null:
			continue
		var fl := Flyer.new()
		fl.node = model
		fl.from = top + Vector3(randf_range(-0.12, 0.12), 0.05, randf_range(-0.12, 0.12))
		fl.delay = float(i) * 0.07
		fl.dur = 0.5
		fl.side = Vector3(randf_range(-0.4, 0.4), 0.0, randf_range(-0.4, 0.4))
		model.scale = Vector3.ONE * 0.001
		parent.add_child(model)
		model.global_position = fl.from
		_flyers.append(fl)


func _tick_flyers(delta: float) -> void:
	var pl := _player_node()
	var keep: Array = []
	for f in _flyers:
		var fl := f as Flyer
		if fl == null or not is_instance_valid(fl.node):
			continue
		fl.t += delta
		var u := clampf((fl.t - fl.delay) / fl.dur, 0.0, 1.0)
		if pl == null or u >= 1.0:
			fl.node.queue_free()
			continue
		var target := pl.global_position + Vector3(0, 1.05, 0)
		var e := u * u * (3.0 - 2.0 * u)
		var p := fl.from.lerp(target, e) + fl.side * sin(u * PI) * 0.6 + Vector3.UP * sin(u * PI) * 0.7
		fl.node.global_position = p
		var s := (0.85 * smoothstep(0.0, 0.2, u)) * (1.0 - 0.6 * smoothstep(0.6, 1.0, u))
		fl.node.scale = Vector3.ONE * maxf(s, 0.001)
		fl.node.rotation.y += delta * 9.0
		keep.append(fl)
	_flyers = keep


func _tick_anims(delta: float) -> void:
	var done: Array = []
	for key in _anims.keys():
		var id := int(key)
		var a: PackedFloat32Array = _anims[key]
		a[2] += delta
		_anims[key] = a
		if a[2] < 0.0:
			continue
		var u := clampf(a[2] / maxf(a[3], 0.01), 0.0, 1.0)
		_set_fill(id, lerpf(a[0], a[1], u))
		if u >= 1.0:
			done.append(key)
	for key in done:
		_anims.erase(key)


# =============================================================================
# Regrowth
# =============================================================================

func _on_phase_changed(phase: int) -> void:
	if phase == DayCycle.Phase.DAWN:
		regrow_step()


## One dawn: count down picked nodes and refill those that are due. Nodes
## near the player grow back with a little pop. Returns how many regrew.
func regrow_step() -> int:
	var regrown := 0
	var pl := _player_node()
	for id in node_count():
		if _removed[id] != 0 or _charges[id] >= _max_charges[id] or id == _g_idx:
			continue
		_dawns[id] = maxi(int(_dawns[id]) - 1, 0)
		if _dawns[id] > 0:
			continue
		_charges[id] = _max_charges[id]
		regrown += 1
		var o := _xf[id].origin
		if _render and pl and Vector2(o.x - pl.global_position.x, o.z - pl.global_position.z).length() < 80.0:
			_anims[id] = PackedFloat32Array([_fill[id], 1.0, -randf_range(0.0, 1.6), 1.2])
		else:
			_anims.erase(id)
			_set_fill(id, 1.0)
	_sparkle_t = 0.0
	return regrown


# =============================================================================
# Editing (other systems) and dev helpers
# =============================================================================

## Permanently remove every node overlapping the circle (pos, r), e.g. where a
## landmark or a camp structure is built. Returns how many were removed.
func clear_area(pos: Vector3, r: float) -> int:
	var removed := 0
	for id in nodes_near(pos, r + 1.5):
		if _removed[id] != 0:
			continue
		var o := _xf[id].origin
		if Vector2(o.x - pos.x, o.z - pos.z).length() >= r + _radius[id] * 0.5:
			continue
		_removed[id] = 1
		if id == _g_idx:
			cancel_gather()
		_write_state(id)
		if _obstacle[id] >= 0 and veg and veg.has_method("set_obstacle_enabled"):
			veg.call("set_obstacle_enabled", _obstacle[id], false)
		_free_proxy(id)
		removed += 1
	if removed > 0:
		_sparkle_t = 0.0
	return removed


## Add a node at runtime (dev tools, scripted placement). Rebuilds its chunk.
func add_node(kind: String, pos: Vector3, variant: int = -1, yaw: float = -1.0) -> int:
	var k := KINDS.find(kind)
	if k < 0 or gen == null:
		return -1
	var id := _add(k, pos.x, pos.z, variant, yaw)
	if _state_img and id / STATE_W >= _state_img.get_height():
		_init_state()
	else:
		_write_state(id)
	_rebuild_chunk(_chunk_of(pos.x, pos.z))
	_sparkle_t = 0.0
	return id


## Screenshot helper: show node `id` mid-gather (ring + parts popping) and
## hold that pose until debug_release().
func debug_pose(id: int, progress: float) -> void:
	if not _valid_id(id):
		return
	debug_hold = true
	_g_idx = id
	_g_player = null
	_g_dur = 1.0
	_g_t = clampf(progress, 0.0, 1.0)
	var mx := float(maxi(_max_charges[id], 1))
	_g_from = float(_charges[id]) / mx
	_g_to = float(_charges[id] - 1) / mx
	_shake[id] = 0.0
	_set_fill(id, lerpf(_g_from, _g_to, smoothstep(0.0, 1.0, _g_t)))
	_show_ring(id, _g_t)


func debug_release() -> void:
	if not debug_hold:
		return
	debug_hold = false
	if _g_idx >= 0:
		cancel_gather()


## Screenshot helper: one node of every kind in a row east of `center`.
## Returns the ids.
func debug_gallery(center: Vector3, spacing: float = 1.9) -> PackedInt32Array:
	var ids := PackedInt32Array()
	for k in KINDS.size():
		var p := center + Vector3((float(k) - 3.5) * spacing, 0.0, 0.0)
		ids.append(add_node(KINDS[k], p, k % GatherableMeshes.VARIANTS, 0.6))
	return ids


func debug_stats() -> Dictionary:
	var meshes := 0
	for ci in _chunks:
		meshes += (_chunks[ci] as Node3D).get_child_count()
	var avail := 0
	for id in node_count():
		if _charges[id] > 0 and _removed[id] == 0:
			avail += 1
	return {
		"nodes": node_count(), "available": avail, "kinds": counts_by_kind(), "chunks": _chunks.size(),
		"chunk_meshes": meshes, "vertices": _vertex_total, "proxies": _proxies.size(),
		"sparkles": _sparkle.point_count() if _sparkle else 0, "gathering": _g_idx,
		"decor_avoided": _decor_count(),
	}


func _decor_count() -> int:
	var n := 0
	for k in _decor_grid:
		n += (_decor_grid[k] as PackedVector3Array).size()
	return n
