class_name Vegetation
extends Node3D
## The forest: regular trees (4 pine/fir variants + dead snags), giant Elder
## Trees, bushes, fallen logs, natural stumps and saplings, plus the Rocks and
## GroundCover children. Owns tree chopping, regrowth, tree collision
## (layer 4) and the obstacle spatial hash used by creatures.
##
## Rendering: static 64 m chunks, one MultiMeshInstance3D per chunk and
## variant with a near (full) and far (cheap) LOD selected by visibility
## ranges that follow Settings.quality(). Everything is placed
## deterministically from GameState.seed.
##
## Public API (see docs/ARCHITECTURE.md "Trees"):
##   find_tree(pos, radius) -> int
##   tree_info(id) -> {pos, kind, hp, max_hp, alive, height, radius, state}
##   hit_tree(id, power, can_fell_giant, from) -> {ok, felled, reason}
##   obstacles_near(pos, radius) -> Array[Vector4(x, y, z, r)]
## Helpers for other world systems:
##   path_distance(x, z), canopy_at(x, z), add_obstacle(pos, r),
##   set_obstacle_enabled(id, on), is_clear(pos, radius)

const CHUNK := 64.0
const HASH_CELL := 8.0
## Largest obstacle radius (Elder Tree trunk) used to widen hash queries.
const MAX_OBSTACLE_R := 3.6
const SEED_TREES := 7101
const SEED_DECOR := 7303
const STARTER_MIN_R := 20.5
const STARTER_MAX_R := 31.5
const REGROW_CLEARANCE := 6.0

enum TreeState { ALIVE, FALLING, STUMP, SAPLING }

## Layer keys inside a chunk.
const LAYER_ELDER := 10
const LAYER_BUSH := 20
const LAYER_LOG := 30
const LAYER_STUMP := 40
const LAYER_SAPLING := 50
const LAYER_FELLED := 60

## Visibility ranges per quality: [near_end, far_end] (0 = unlimited).
const RANGES := {
	"tree": {"high": [85.0, 280.0], "medium": [70.0, 200.0], "low": [55.0, 140.0]},
	"elder": {"high": [170.0, 0.0], "medium": [140.0, 0.0], "low": [110.0, 420.0]},
	"bush": {"high": [115.0, 0.0], "medium": [90.0, 0.0], "low": [65.0, 0.0]},
	"log": {"high": [120.0, 0.0], "medium": [95.0, 0.0], "low": [70.0, 0.0]},
	"decor": {"high": [90.0, 0.0], "medium": [75.0, 0.0], "low": [55.0, 0.0]},
}

var gen: WorldGen
var game: Game
var rocks: Rocks
var cover: GroundCover

# --- Tree data (index = tree id) ---------------------------------------------
var _tree_count := 0
var _pos := PackedVector3Array()
var _basis: Array[Basis] = []
var _variant := PackedByteArray()
var _giant := PackedByteArray()
var _hp := PackedInt32Array()
var _state := PackedByteArray()
var _chunk := PackedInt32Array()
var _slot := PackedInt32Array()
var _shape := PackedInt32Array()
var _custom := PackedColorArray()
var _felled_dawn := PackedInt32Array()
var _fell_count := PackedInt32Array()
var _trunk_r := PackedFloat32Array()
var _height := PackedFloat32Array()
var _felled: Array[int] = []

# --- Decor placement (bushes, logs, stumps, saplings) ------------------------
## Array of [layer_key, Transform3D, Color custom]
var _decor: Array = []

# --- Obstacles (spatial hash) --------------------------------------------------
var _obs := PackedVector4Array()
var _obs_on := PackedByteArray()
var _grid: Array[PackedInt32Array] = []
var _grid_n := 0

# --- Rasters -------------------------------------------------------------------
var _path_n := 0
var _path_d := PackedFloat32Array()
const CANOPY_CELL := 4.0
var _canopy_n := 0
var _canopy := PackedByteArray()

# --- Chunks --------------------------------------------------------------------
var _chunks: Dictionary = {}  # int -> VegChunk
var _nch := 0

var _anims: Dictionary = {}  # tree id -> TreeAnim
var _dawns := 0
var _rng := RandomNumberGenerator.new()
var _shape_cache: Dictionary = {}
var _last_giant_msg := -10.0
var _ready_done := false


class VegLayer:
	var key := 0
	var kind := "tree"
	var ids := PackedInt32Array()
	var xforms: Array[Transform3D] = []
	var customs := PackedColorArray()
	var near: MultiMeshInstance3D
	var far: MultiMeshInstance3D
	## Cheap LOD drawn only into shadow maps while the detailed mesh is shown.
	var shadow: MultiMeshInstance3D


class VegChunk:
	var index := 0
	var node: Node3D
	var body: StaticBody3D
	var decor_body: StaticBody3D
	var layers: Dictionary = {}  # key -> VegLayer


class TreeAnim:
	const SHAKE := 0
	const FALL := 1
	var mode := SHAKE
	var pivot: Node3D
	var mesh: MeshInstance3D
	var t := 0.0
	var amp := 0.0
	var axis := Vector3.RIGHT
	var dir := Vector3.FORWARD
	var angle_end := 1.5
	var duration := 1.3
	var impacted := false
	var dropped := false
	var vanishing := false
	var from := Vector3.ZERO
	## > 0 while a regrown tree rises from sapling size (seconds).
	var grow_dur := 0.0


# =============================================================================
# Setup
# =============================================================================

func setup(p_game: Game) -> void:
	GameState.vegetation = self
	game = p_game
	gen = p_game.gen if p_game else GameState.world_gen
	if gen == null:
		push_warning("Vegetation: no WorldGen; forest skipped")
		return
	var t0 := Time.get_ticks_msec()
	_rng.seed = int(GameState.seed) * 31 + SEED_TREES
	_build_path_raster()
	_init_grid()
	await get_tree().process_frame
	_place_starter_trees()
	_place_elder_trees()
	await _place_regular_trees()
	_build_canopy()
	await get_tree().process_frame
	_place_decor()
	await get_tree().process_frame
	_build_chunks()
	await get_tree().process_frame
	rocks = Rocks.new()
	rocks.name = "Rocks"
	add_child(rocks)
	await rocks.setup(self)
	cover = GroundCover.new()
	cover.name = "GroundCover"
	add_child(cover)
	await cover.setup(self)
	if not Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.connect(_on_phase_changed)
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)
	_ready_done = true
	print("Vegetation: %d trees (%d giant), %d decor, %d rocks in %d ms" % [
		_tree_count, giant_count(), _decor.size(), rocks.rock_count() if rocks else 0, Time.get_ticks_msec() - t0])


func _exit_tree() -> void:
	if Events.phase_changed.is_connected(_on_phase_changed):
		Events.phase_changed.disconnect(_on_phase_changed)
	if Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.disconnect(_on_setting_changed)


# =============================================================================
# Rasters: trail distance (1 m) and canopy density (4 m)
# =============================================================================

func _build_path_raster() -> void:
	_path_n = int(WorldGen.HALF * 2.0)
	_path_d.resize(_path_n * _path_n)
	_path_d.fill(99.0)
	var reach := 9.0
	for poly in gen.paths:
		var pts: PackedVector2Array = poly
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			var x0 := clampi(int(floor(minf(a.x, b.x) - reach + WorldGen.HALF)), 0, _path_n - 1)
			var x1 := clampi(int(ceil(maxf(a.x, b.x) + reach + WorldGen.HALF)), 0, _path_n - 1)
			var z0 := clampi(int(floor(minf(a.y, b.y) - reach + WorldGen.HALF)), 0, _path_n - 1)
			var z1 := clampi(int(ceil(maxf(a.y, b.y) + reach + WorldGen.HALF)), 0, _path_n - 1)
			var ab := b - a
			var len2 := maxf(ab.length_squared(), 0.0001)
			for iz in range(z0, z1 + 1):
				var pz := float(iz) - WorldGen.HALF + 0.5
				var row := iz * _path_n
				for ix in range(x0, x1 + 1):
					var px := float(ix) - WorldGen.HALF + 0.5
					var t := clampf(((px - a.x) * ab.x + (pz - a.y) * ab.y) / len2, 0.0, 1.0)
					var dx := px - (a.x + ab.x * t)
					var dz := pz - (a.y + ab.y * t)
					var d := sqrt(dx * dx + dz * dz)
					if d < _path_d[row + ix]:
						_path_d[row + ix] = d


## Distance (m) to the nearest walking trail (capped at ~99).
func path_distance(x: float, z: float) -> float:
	if _path_n == 0:
		return 99.0
	var ix := int(x + WorldGen.HALF)
	var iz := int(z + WorldGen.HALF)
	if ix < 0 or iz < 0 or ix >= _path_n or iz >= _path_n:
		return 99.0
	return _path_d[iz * _path_n + ix]


func _build_canopy() -> void:
	_canopy_n = int(WorldGen.HALF * 2.0 / CANOPY_CELL)
	_canopy.resize(_canopy_n * _canopy_n)
	_canopy.fill(0)
	for id in _tree_count:
		var p := _pos[id]
		var reach := 2 if _giant[id] == 1 else 1
		var cx := int((p.x + WorldGen.HALF) / CANOPY_CELL)
		var cz := int((p.z + WorldGen.HALF) / CANOPY_CELL)
		for dz in range(-reach, reach + 1):
			for dx in range(-reach, reach + 1):
				var x := cx + dx
				var z := cz + dz
				if x < 0 or z < 0 or x >= _canopy_n or z >= _canopy_n:
					continue
				var w := 2 if dx == 0 and dz == 0 else 1
				var i := z * _canopy_n + x
				_canopy[i] = mini(_canopy[i] + w, 255)


## 0..1 how much tree cover a point has (from the placed trees).
func canopy_at(x: float, z: float) -> float:
	if _canopy_n == 0:
		return 0.0
	var cx := int((x + WorldGen.HALF) / CANOPY_CELL)
	var cz := int((z + WorldGen.HALF) / CANOPY_CELL)
	if cx < 0 or cz < 0 or cx >= _canopy_n or cz >= _canopy_n:
		return 0.0
	return clampf(float(_canopy[cz * _canopy_n + cx]) / 6.0, 0.0, 1.0)


# =============================================================================
# Obstacle spatial hash
# =============================================================================

func _init_grid() -> void:
	_grid_n = int(ceil(WorldGen.HALF * 2.0 / HASH_CELL))
	_grid.clear()
	_grid.resize(_grid_n * _grid_n)
	for i in _grid.size():
		_grid[i] = PackedInt32Array()


func _cell_of(x: float, z: float) -> int:
	var cx := clampi(int(floor((x + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cz := clampi(int(floor((z + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	return cz * _grid_n + cx


## Register a round obstacle (x, z centre, radius r). Returns its id.
func add_obstacle(pos: Vector3, r: float) -> int:
	if _grid_n == 0:
		_init_grid()
	var id := _obs.size()
	_obs.append(Vector4(pos.x, pos.y, pos.z, r))
	_obs_on.append(1)
	var c := _cell_of(pos.x, pos.z)
	_grid[c].append(id)
	return id


func set_obstacle_enabled(id: int, on: bool) -> void:
	if id >= 0 and id < _obs_on.size():
		_obs_on[id] = 1 if on else 0


## Trunks and big boulders whose circle overlaps (pos, radius).
## Returns Array of Vector4(x, y, z, r). Cheap enough to call every frame.
func obstacles_near(pos: Vector3, radius: float) -> Array:
	var out: Array = []
	if _grid_n == 0:
		return out
	var reach := radius + MAX_OBSTACLE_R
	var cx0 := clampi(int(floor((pos.x - reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cx1 := clampi(int(floor((pos.x + reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cz0 := clampi(int(floor((pos.z - reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cz1 := clampi(int(floor((pos.z + reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	for cz in range(cz0, cz1 + 1):
		for cx in range(cx0, cx1 + 1):
			for id in _grid[cz * _grid_n + cx]:
				if _obs_on[id] == 0:
					continue
				var o := _obs[id]
				var dx := o.x - pos.x
				var dz := o.z - pos.z
				var rr := radius + o.w
				if dx * dx + dz * dz <= rr * rr:
					out.append(o)
	return out


## True when no trunk/boulder overlaps the circle (pos, radius).
func is_clear(pos: Vector3, radius: float) -> bool:
	return obstacles_near(pos, radius).is_empty()


func _near_tree(x: float, z: float, min_d: float) -> bool:
	var p := Vector3(x, 0.0, z)
	for o: Vector4 in obstacles_near(p, min_d):
		if Vector2(o.x - x, o.z - z).length() < min_d:
			return true
	return false


# =============================================================================
# Placement
# =============================================================================

func _add_tree(pos: Vector3, variant: int, s: float, yaw: float, giant: bool, cu: Color) -> int:
	var id := _tree_count
	_tree_count += 1
	var tilt := Basis(Vector3(cos(yaw * 3.1), 0.0, sin(yaw * 3.1)).normalized(), _rng.randf_range(-0.025, 0.025))
	var b := tilt * Basis(Vector3.UP, yaw)
	b = b.scaled(Vector3.ONE * s)
	_pos.append(pos)
	_basis.append(b)
	_variant.append(variant)
	_giant.append(1 if giant else 0)
	_hp.append(_max_hp_kind(giant))
	_state.append(TreeState.ALIVE)
	_chunk.append(-1)
	_slot.append(-1)
	_shape.append(-1)
	_custom.append(cu)
	_felled_dawn.append(0)
	_fell_count.append(0)
	var r: float
	var h: float
	if giant:
		r = TreeMeshes.ELDER_COLLIDE * s * (1.0 if variant == 0 else 1.1)
		h = TreeMeshes.ELDER_HEIGHT * s * (1.0 if variant == 0 else 0.9)
	else:
		r = TreeMeshes.tree_trunk_radius(variant) * s * 1.15
		h = TreeMeshes.tree_height(variant) * s
	_trunk_r.append(r)
	_height.append(h)
	var oid := add_obstacle(pos, r)
	assert(oid == id)
	return id


func _max_hp_kind(giant: bool) -> int:
	if giant:
		return maxi(DB.bi("trees.giant_hp", 24), 1)
	return maxi(DB.bi("trees.regular_hp", 5), 1)


func _tree_custom(x: float, z: float, variant: int) -> Color:
	var region := sin(x * 0.021 + 1.3) * cos(z * 0.017 - 0.4)
	var hue := clampf(region * 0.55 + _rng.randf_range(-0.35, 0.35), -1.0, 1.0)
	var bright := clampf(0.5 + _rng.randf_range(-0.13, 0.13) + region * 0.05, 0.2, 0.8)
	var dry := 0.0
	if variant == TreeMeshes.SNAG:
		dry = _rng.randf_range(0.82, 1.0)
	elif _rng.randf() < 0.05:
		dry = _rng.randf_range(0.2, 0.4)
	return Color(hue, bright, _rng.randf(), dry)


func _pick_variant(x: float, z: float) -> int:
	var w := [0.36, 0.24, 0.18, 0.16, 0.06]
	if z < -90.0:
		w[1] += 0.18  # spruce on the cool northern slopes
	if gen.meadow_factor(x, z) > 0.2:
		w[2] += 0.2  # old pines at meadow edges
		w[3] += 0.1
	if gen.rock_factor(x, z) > 0.5:
		w[4] += 0.08  # snags on the rocky ridge
	var total := 0.0
	for v: float in w:
		total += v
	var roll := _rng.randf() * total
	for i in w.size():
		roll -= float(w[i])
		if roll <= 0.0:
			return i
	return 0


func _variant_scale(variant: int) -> float:
	var h := TreeMeshes.tree_height(variant)
	var lo := 9.0 if variant != TreeMeshes.PINE_D else 7.5
	var hi := 18.0
	var s := _rng.randf_range(0.72, 1.12)
	return clampf(s, lo / h, hi / h)


## 6-10 regular trees just outside the camp clearing so the first wood is
## close (the camp sits at the origin).
func _place_starter_trees() -> void:
	var want := _rng.randi_range(7, 9)
	var placed := 0
	var a0 := _rng.randf() * TAU
	var min_path := 4.5
	for attempt in 120:
		if placed >= want:
			break
		if attempt == 60 and placed < 6:
			min_path = 3.4
		var a := a0 + float(attempt) * 2.39996
		var r := _rng.randf_range(STARTER_MIN_R, STARTER_MAX_R)
		var x := cos(a) * r
		var z := sin(a) * r
		if gen.is_water(x, z) or gen.slope_at(x, z) > 0.32:
			continue
		if path_distance(x, z) < min_path or gen.distance_to_stream(x, z) < 4.0:
			continue
		if _near_tree(x, z, 6.0):
			continue
		var variant: int = [TreeMeshes.PINE_A, TreeMeshes.PINE_D, TreeMeshes.PINE_A, TreeMeshes.PINE_B][placed % 4]
		var s := clampf(_rng.randf_range(0.72, 0.95), 9.0 / TreeMeshes.tree_height(variant) if variant != TreeMeshes.PINE_D else 0.7, 1.2)
		var pos := Vector3(x, gen.height_at(x, z) - 0.05, z)
		_add_tree(pos, variant, s, _rng.randf() * TAU, false, _tree_custom(x, z, variant))
		placed += 1


## 12-20 giant Elder Trees, only inside the Elder Grove.
func _place_elder_trees() -> void:
	if not gen.landmarks.has("elder_grove"):
		return
	var lm: Dictionary = gen.landmarks["elder_grove"]
	var c: Vector3 = lm["pos"]
	var radius: float = lm["radius"]
	var want := _rng.randi_range(14, 18)
	var spacing := 14.0
	var placed := 0
	for attempt in 900:
		if placed >= want:
			break
		if attempt == 500 and placed < 12:
			spacing = 11.0
		var a := _rng.randf() * TAU
		var r := sqrt(_rng.randf()) * radius * 0.92
		var x := c.x + cos(a) * r
		var z := c.z + sin(a) * r
		if not gen.is_elder_grove(x, z) or gen.is_water(x, z) or gen.slope_at(x, z) > 0.4:
			continue
		if path_distance(x, z) < 7.0:
			continue
		if _near_tree(x, z, spacing):
			continue
		var variant := _rng.randi_range(0, TreeMeshes.ELDER_VARIANTS - 1)
		var s := _rng.randf_range(0.86, 1.15) if variant == 0 else _rng.randf_range(0.96, 1.25)
		var pos := Vector3(x, gen.height_at(x, z) - 0.1, z)
		var cu := Color(_rng.randf_range(-0.3, 0.2), _rng.randf_range(0.4, 0.6), _rng.randf(), 0.0)
		_add_tree(pos, variant, s, _rng.randf() * TAU, true, cu)
		placed += 1


## The main forest: a jittered 5 m grid thinned by WorldGen.forest_density,
## denser to the north and east.
func _place_regular_trees() -> void:
	var cell := 5.0
	var n := int(WorldGen.HALF * 2.0 / cell)
	var mult := DB.bf("trees.forest_density_mult", 0.97)
	var grove_c := Vector3(1e9, 0, 1e9)
	var grove_r := 0.0
	if gen.landmarks.has("elder_grove"):
		grove_c = gen.landmarks["elder_grove"]["pos"]
		grove_r = gen.landmarks["elder_grove"]["radius"]
	var t0 := Time.get_ticks_msec()
	for iz in n:
		for ix in n:
			var x := -WorldGen.HALF + (float(ix) + _rng.randf_range(0.12, 0.88)) * cell
			var z := -WorldGen.HALF + (float(iz) + _rng.randf_range(0.12, 0.88)) * cell
			var roll := _rng.randf()
			if gen.is_water(x, z) or path_distance(x, z) < 3.2:
				continue
			if gen.clearing_factor(x, z) > 0.22:
				continue
			var d := gen.forest_density(x, z)
			if d <= 0.0:
				continue
			# Denser toward the north (-z) and east (+x).
			d *= 0.82 + 0.3 * clampf((x - z) / 320.0 * 0.5 + 0.5, 0.0, 1.0)
			# The Elder Grove is an open hall of giants; thin the forest around it.
			var gdist := Vector2(x - grove_c.x, z - grove_c.z).length()
			if gdist < grove_r:
				continue
			if gdist < grove_r * 1.3:
				d *= 0.4
			if roll > d * mult:
				continue
			if _near_tree(x, z, 2.3):
				continue
			var variant := _pick_variant(x, z)
			var s := _variant_scale(variant)
			var pos := Vector3(x, gen.height_at(x, z) - 0.05, z)
			_add_tree(pos, variant, s, _rng.randf() * TAU, false, _tree_custom(x, z, variant))
		if Time.get_ticks_msec() - t0 > 40:
			await get_tree().process_frame
			t0 = Time.get_ticks_msec()


## Bushes along trails and forest edges, fallen logs and old stumps in the
## woods, young saplings in sunny gaps.
func _place_decor() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(GameState.seed) * 17 + SEED_DECOR
	var cell := 6.0
	var n := int(WorldGen.HALF * 2.0 / cell)
	for iz in n:
		for ix in n:
			var x := -WorldGen.HALF + (float(ix) + rng.randf_range(0.1, 0.9)) * cell
			var z := -WorldGen.HALF + (float(iz) + rng.randf_range(0.1, 0.9)) * cell
			var roll := rng.randf()
			var kind_roll := rng.randf()
			if gen.is_water(x, z) or gen.height_at(x, z) < WorldGen.WATER_LEVEL + 0.5:
				continue
			var pd := path_distance(x, z)
			if pd < 2.4:
				continue
			var camp_d := Vector2(x, z).length()
			if camp_d < 17.0:
				continue
			if gen.clearing_factor(x, z) > 0.55 and camp_d > 40.0:
				continue
			if gen.slope_at(x, z) > 0.4:
				continue
			var can := canopy_at(x, z)
			var meadow := gen.meadow_factor(x, z)
			var y := gen.height_at(x, z)
			var yaw := rng.randf() * TAU
			# Bushes: trail sides, forest edges, clearing rims.
			var p_bush := 0.04
			if pd < 7.0:
				p_bush += 0.22
			if can > 0.1 and can < 0.5:
				p_bush += 0.14
			if camp_d < 34.0:
				p_bush += 0.25
			p_bush *= 1.0 - meadow * 0.6
			if roll < p_bush:
				if _near_tree(x, z, 1.4):
					continue
				var bs := rng.randf_range(0.75, 1.35)
				var bv := 0 if kind_roll < 0.6 else 1
				var b := Basis(Vector3.UP, yaw).scaled(Vector3(bs, bs * rng.randf_range(0.85, 1.15), bs))
				_decor.append([LAYER_BUSH + bv, Transform3D(b, Vector3(x, y - 0.05, z)), Color(rng.randf_range(-0.5, 0.6), rng.randf_range(0.35, 0.65), rng.randf(), 0.0)])
				continue
			roll -= p_bush
			# Fallen logs and old stumps inside the forest.
			if can > 0.3 and pd > 3.5:
				if roll < 0.035:
					var lv := 0 if kind_roll < 0.55 else 1
					var ls := rng.randf_range(0.85, 1.2)
					var length := (4.2 if lv == 0 else 3.0) * ls
					var dir := Vector3(cos(yaw), 0.0, -sin(yaw))
					var ok := true
					for f in [-0.5, 0.0, 0.5]:
						var q := Vector3(x, 0.0, z) + dir * length * float(f)
						if _near_tree(q.x, q.z, 1.2) or path_distance(q.x, q.z) < 2.6 or gen.is_water(q.x, q.z):
							ok = false
							break
					if not ok:
						continue
					# Sit on the lower of the two ends so it never floats.
					var ya := gen.height_at(x + dir.x * length * 0.45, z + dir.z * length * 0.45)
					var yb := gen.height_at(x - dir.x * length * 0.45, z - dir.z * length * 0.45)
					var ly := minf(minf(ya, yb), y) - 0.06
					var tilt := atan2(ya - yb, length * 0.9)
					var b := Basis(Vector3.UP, yaw) * Basis(Vector3.BACK, tilt * 0.8)
					b = b.scaled(Vector3.ONE * ls)
					_decor.append([LAYER_LOG + lv, Transform3D(b, Vector3(x, ly, z)), Color(0.0, rng.randf_range(0.4, 0.6), rng.randf(), rng.randf_range(0.0, 0.35))])
					continue
				roll -= 0.035
				if roll < 0.02:
					var ss := rng.randf_range(0.7, 1.25)
					var b := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * ss)
					_decor.append([LAYER_STUMP, Transform3D(b, Vector3(x, y - 0.05, z)), Color(0.0, rng.randf_range(0.35, 0.6), rng.randf(), rng.randf_range(0.2, 0.7))])
					continue
				roll -= 0.02
			# Saplings in sunny gaps near the forest.
			if can < 0.35 and meadow < 0.6 and roll < 0.05 and camp_d > 24.0:
				if _near_tree(x, z, 2.0):
					continue
				var sps := rng.randf_range(0.55, 1.3)
				var b := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * sps)
				_decor.append([LAYER_SAPLING, Transform3D(b, Vector3(x, y - 0.05, z)), Color(rng.randf_range(-0.4, 0.5), rng.randf_range(0.4, 0.65), rng.randf(), 0.0)])


# =============================================================================
# Chunks: MultiMeshes + collision
# =============================================================================

func _chunk_index(x: float, z: float) -> int:
	var cx := clampi(int(floor((x + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	var cz := clampi(int(floor((z + WorldGen.HALF) / CHUNK)), 0, _nch - 1)
	return cz * _nch + cx


func _get_chunk(index: int) -> VegChunk:
	if _chunks.has(index):
		return _chunks[index]
	var ch := VegChunk.new()
	ch.index = index
	ch.node = Node3D.new()
	ch.node.name = "Chunk%d_%d" % [index % _nch, index / _nch]
	add_child(ch.node)
	_chunks[index] = ch
	return ch


func _get_layer(ch: VegChunk, key: int, kind: String) -> VegLayer:
	if ch.layers.has(key):
		return ch.layers[key]
	var l := VegLayer.new()
	l.key = key
	l.kind = kind
	ch.layers[key] = l
	return l


func tree_xform(id: int) -> Transform3D:
	return Transform3D(_basis[id], _pos[id])


func _build_chunks() -> void:
	_nch = int(ceil(WorldGen.HALF * 2.0 / CHUNK))
	for id in _tree_count:
		var ci := _chunk_index(_pos[id].x, _pos[id].z)
		var ch := _get_chunk(ci)
		var key := LAYER_ELDER + int(_variant[id]) if _giant[id] == 1 else int(_variant[id])
		var l := _get_layer(ch, key, "elder" if _giant[id] == 1 else "tree")
		_chunk[id] = ci
		_slot[id] = l.ids.size()
		l.ids.append(id)
		l.xforms.append(tree_xform(id))
		l.customs.append(_custom[id])
	for d in _decor:
		var key: int = d[0]
		var xf: Transform3D = d[1]
		var ch := _get_chunk(_chunk_index(xf.origin.x, xf.origin.z))
		var kind := "decor"
		if key >= LAYER_BUSH and key < LAYER_BUSH + 10:
			kind = "bush"
		elif key >= LAYER_LOG and key < LAYER_LOG + 10:
			kind = "log"
		var l := _get_layer(ch, key, kind)
		l.xforms.append(xf)
		l.customs.append(d[2])
	for ci in _chunks:
		var ch: VegChunk = _chunks[ci]
		for key in ch.layers:
			_build_layer_mmis(ch, ch.layers[key])
		_build_chunk_collision(ch)
	_apply_quality()


func _mesh_for(key: int, lod: int) -> Mesh:
	if key < TreeMeshes.TREE_VARIANTS:
		return TreeMeshes.tree(key, lod)
	if key >= LAYER_ELDER and key < LAYER_ELDER + 10:
		return TreeMeshes.elder(key - LAYER_ELDER, lod)
	if key >= LAYER_BUSH and key < LAYER_BUSH + 10:
		return TreeMeshes.bush(key - LAYER_BUSH)
	if key >= LAYER_LOG and key < LAYER_LOG + 10:
		return TreeMeshes.fallen_log(key - LAYER_LOG)
	if key == LAYER_SAPLING:
		return TreeMeshes.sapling()
	return TreeMeshes.stump()


func _new_mmi(mesh: Mesh, xforms: Array[Transform3D], customs: PackedColorArray, parent: Node3D) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
		mm.set_instance_custom_data(i, customs[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.extra_cull_margin = 1.5
	mmi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	mmi.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	parent.add_child(mmi)
	return mmi


func _build_layer_mmis(ch: VegChunk, l: VegLayer) -> void:
	l.near = _new_mmi(_mesh_for(l.key, 0), l.xforms, l.customs, ch.node)
	l.near.name = "L%d_near" % l.key
	if l.kind == "tree" or l.kind == "elder":
		l.far = _new_mmi(_mesh_for(l.key, 1), l.xforms, l.customs, ch.node)
		l.far.name = "L%d_far" % l.key
		l.shadow = _new_mmi(_mesh_for(l.key, 1), l.xforms, l.customs, ch.node)
		l.shadow.name = "L%d_shadow" % l.key


func _cylinder(r: float, h: float) -> CylinderShape3D:
	var key := "%d_%d" % [int(r * 20.0), int(h)]
	if _shape_cache.has(key):
		return _shape_cache[key]
	var s := CylinderShape3D.new()
	s.radius = float(int(r * 20.0)) / 20.0 + 0.025
	s.height = h
	_shape_cache[key] = s
	return s


func _build_chunk_collision(ch: VegChunk) -> void:
	for key in ch.layers:
		var l: VegLayer = ch.layers[key]
		if l.kind == "tree" or l.kind == "elder":
			if ch.body == null:
				ch.body = StaticBody3D.new()
				ch.body.name = "Trunks"
				ch.body.collision_layer = 1 << 3
				ch.body.collision_mask = 0
				ch.node.add_child(ch.body)
			for id in l.ids:
				var h := 14.0 if _giant[id] == 1 else 5.0
				var owner_id := ch.body.create_shape_owner(ch.body)
				ch.body.shape_owner_add_shape(owner_id, _cylinder(_trunk_r[id] * (0.85 if _giant[id] == 1 else 0.8), h))
				ch.body.shape_owner_set_transform(owner_id, Transform3D(Basis(), _pos[id] + Vector3(0.0, h * 0.5 - 0.4, 0.0)))
				_shape[id] = owner_id
		elif l.kind == "log":
			if ch.decor_body == null:
				ch.decor_body = StaticBody3D.new()
				ch.decor_body.name = "Logs"
				ch.decor_body.collision_layer = 1
				ch.decor_body.collision_mask = 0
				ch.node.add_child(ch.decor_body)
			var lv := l.key - LAYER_LOG
			var length := 4.2 if lv == 0 else 3.0
			var r := 0.36 if lv == 0 else 0.27
			for xf in l.xforms:
				var s := xf.basis.get_scale().x
				var cap := CapsuleShape3D.new()
				cap.radius = r * s
				cap.height = length * s + r * s
				var owner_id := ch.decor_body.create_shape_owner(ch.decor_body)
				ch.decor_body.shape_owner_add_shape(owner_id, cap)
				var axis_b := xf.basis.orthonormalized() * Basis(Vector3.BACK, PI * 0.5)
				ch.decor_body.shape_owner_set_transform(owner_id, Transform3D(axis_b, xf * Vector3(0.0, r * 0.75, 0.0)))
				var dir := xf.basis.orthonormalized().x
				for f in [-0.33, 0.0, 0.33]:
					add_obstacle(xf.origin + dir * length * s * float(f), r * s + 0.15)


# =============================================================================
# Quality / visibility
# =============================================================================

func _on_setting_changed(key: String) -> void:
	if key == "quality":
		_apply_quality()
		if cover:
			cover.apply_quality()
		if rocks:
			rocks.apply_quality()


static func range_for(kind: String) -> Array:
	var q := Settings.quality()
	var table: Dictionary = RANGES.get(kind, RANGES["tree"])
	return table.get(q, table["high"])


func _apply_quality() -> void:
	var high := Settings.quality() == "high"
	var med := Settings.quality() == "medium"
	for ci in _chunks:
		var ch: VegChunk = _chunks[ci]
		for key in ch.layers:
			var l: VegLayer = ch.layers[key]
			var r: Array = range_for(l.kind)
			var near_end: float = r[0]
			var far_end: float = r[1]
			if l.near:
				_set_range(l.near, 0.0, near_end, l.far != null)
				l.near.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if (high or med or l.kind != "decor") else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				if l.shadow:
					# Detailed trees take their shadows from the cheap proxy.
					l.near.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
					_set_range(l.shadow, 0.0, near_end, false)
					l.shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
			if l.far:
				_set_range(l.far, near_end, far_end, true)
				l.far.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if (high or l.kind == "elder") else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _set_range(mmi: GeometryInstance3D, begin: float, end: float, fade: bool) -> void:
	mmi.visibility_range_begin = begin
	mmi.visibility_range_end = end
	mmi.visibility_range_begin_margin = 8.0 if begin > 0.0 else 0.0
	mmi.visibility_range_end_margin = 8.0 if end > 0.0 else 0.0
	mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF if fade else GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED


# =============================================================================
# Chopping API
# =============================================================================

func tree_count() -> int:
	return _tree_count


func giant_count() -> int:
	var n := 0
	for g in _giant:
		n += int(g)
	return n


func alive_tree_count() -> int:
	var n := 0
	for s in _state:
		if s == TreeState.ALIVE:
			n += 1
	return n


## Nearest standing tree whose trunk edge is within `radius` of `pos`, or -1.
func find_tree(pos: Vector3, radius: float) -> int:
	if _grid_n == 0:
		return -1
	var best := -1
	var best_d := INF
	var reach := maxf(radius, 0.0) + MAX_OBSTACLE_R
	var cx0 := clampi(int(floor((pos.x - reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cx1 := clampi(int(floor((pos.x + reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cz0 := clampi(int(floor((pos.z - reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	var cz1 := clampi(int(floor((pos.z + reach + WorldGen.HALF) / HASH_CELL)), 0, _grid_n - 1)
	for cz in range(cz0, cz1 + 1):
		for cx in range(cx0, cx1 + 1):
			for id in _grid[cz * _grid_n + cx]:
				if id >= _tree_count or _state[id] != TreeState.ALIVE:
					continue
				var p := _pos[id]
				var d := Vector2(p.x - pos.x, p.z - pos.z).length() - _trunk_r[id]
				if d <= radius and d < best_d:
					best_d = d
					best = id
	return best


func tree_info(id: int) -> Dictionary:
	if id < 0 or id >= _tree_count:
		return {}
	var giant := _giant[id] == 1
	return {
		"pos": _pos[id],
		"kind": "giant" if giant else "regular",
		"hp": _hp[id],
		"max_hp": _max_hp_kind(giant),
		"alive": _state[id] == TreeState.ALIVE,
		"state": ["alive", "falling", "stump", "sapling"][_state[id]],
		"height": _height[id],
		"radius": _trunk_r[id],
	}


## Hit a tree with a tool. Spawns chips, shakes the tree, fells it when its
## HP runs out (fall, dust, drops, stump). Elder Trees need can_fell_giant.
func hit_tree(id: int, power: int, can_fell_giant: bool, from: Vector3) -> Dictionary:
	if id < 0 or id >= _tree_count or _state[id] != TreeState.ALIVE:
		return {"ok": false, "felled": false, "reason": "no_tree"}
	var giant := _giant[id] == 1
	var kind := "giant" if giant else "regular"
	var base := _pos[id]
	var to_from := Vector3(from.x - base.x, 0.0, from.z - base.z)
	if to_from.length_squared() < 0.0001:
		to_from = Vector3.BACK
	to_from = to_from.normalized()
	var hit_point := base + Vector3(0.0, 1.15, 0.0) + to_from * _trunk_r[id] * 0.9
	if giant and not can_fell_giant:
		_start_shake(id, -to_from, 0.006)
		Audio.play("hit", hit_point)
		WoodChips.burst(_fx_parent(), hit_point, to_from, 4)
		var now := Time.get_ticks_msec() / 1000.0
		if now - _last_giant_msg > 2.5:
			_last_giant_msg = now
			Events.float_text.emit(hit_point + Vector3(0, 1.2, 0), "Needs the Mega Axe!", Color(1.0, 0.78, 0.4))
		return {"ok": false, "felled": false, "reason": "needs_mega_axe"}
	var dmg := maxi(power, 1)
	_hp[id] = maxi(_hp[id] - dmg, 0)
	WoodChips.burst(_fx_parent(), hit_point, to_from, 16 if not giant else 24)
	DustPuff.spawn(_fx_parent(), hit_point + to_from * 0.15, 0.32, 4, Color(0.78, 0.66, 0.5))
	Audio.play("chop", hit_point)
	Events.tree_hit.emit(base, kind)
	if _hp[id] <= 0:
		_fell(id, from)
		return {"ok": true, "felled": true, "reason": ""}
	var strength := 0.045 if not giant else 0.012
	_start_shake(id, -to_from, strength)
	return {"ok": true, "felled": false, "reason": ""}


func _fx_parent() -> Node:
	if game and is_instance_valid(game) and game.fx:
		return game.fx
	return self


# =============================================================================
# Instance visibility, shake & fall animation
# =============================================================================

func _layer_of(id: int) -> VegLayer:
	var ci := _chunk[id]
	if not _chunks.has(ci):
		return null
	var ch: VegChunk = _chunks[ci]
	var key := LAYER_ELDER + int(_variant[id]) if _giant[id] == 1 else int(_variant[id])
	return ch.layers.get(key)


func _set_instance_visible(id: int, on: bool) -> void:
	var l := _layer_of(id)
	if l == null:
		return
	var slot := _slot[id]
	var xf := tree_xform(id) if on else Transform3D(Basis.from_scale(Vector3.ZERO), _pos[id])
	for m: MultiMeshInstance3D in [l.near, l.far, l.shadow]:
		if m:
			m.multimesh.set_instance_transform(slot, xf)


func _make_tree_node(id: int) -> TreeAnim:
	var a := TreeAnim.new()
	a.pivot = Node3D.new()
	a.pivot.name = "TreeAnim%d" % id
	a.pivot.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(a.pivot)
	a.pivot.global_position = _pos[id]
	a.mesh = MeshInstance3D.new()
	a.mesh.mesh = TreeMeshes.elder(_variant[id], 0) if _giant[id] == 1 else TreeMeshes.tree(_variant[id], 0)
	a.mesh.basis = _basis[id]
	a.mesh.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	a.pivot.add_child(a.mesh)
	var c := _custom[id]
	a.mesh.set_instance_shader_parameter("use_custom_override", 1.0)
	a.mesh.set_instance_shader_parameter("custom_override", Vector4(c.r, c.g, c.b, c.a))
	_set_instance_visible(id, false)
	return a


## Damped sway after a hit; `dir` is where the top first leans.
func _start_shake(id: int, dir: Vector3, strength: float) -> void:
	var a: TreeAnim = _anims.get(id)
	if a == null:
		a = _make_tree_node(id)
		_anims[id] = a
	if a.mode != TreeAnim.SHAKE:
		return
	a.t = 0.0
	a.grow_dur = 0.0  # a hit finishes any regrow animation at once
	a.amp = strength
	a.dir = dir
	a.axis = Vector3.UP.cross(dir).normalized()
	if a.axis.length_squared() < 0.5:
		a.axis = Vector3.RIGHT


func _fell(id: int, from: Vector3) -> void:
	var giant := _giant[id] == 1
	_state[id] = TreeState.FALLING
	_fell_count[id] += 1
	_felled_dawn[id] = _dawns
	set_obstacle_enabled(id, false)
	_set_collision(id, false)
	var a: TreeAnim = _anims.get(id)
	if a == null:
		a = _make_tree_node(id)
		_anims[id] = a
	a.pivot.basis = Basis()
	a.mode = TreeAnim.FALL
	a.t = 0.0
	a.from = from
	a.duration = 2.1 if giant else 1.4
	var away := Vector3(_pos[id].x - from.x, 0.0, _pos[id].z - from.z)
	if away.length_squared() < 0.0001:
		away = Vector3(cos(float(id)), 0.0, sin(float(id)))
	a.dir = _clear_fall_dir(id, away.normalized())
	a.axis = Vector3.UP.cross(a.dir).normalized()
	a.angle_end = _fall_angle(id, a.dir)
	# The stump appears as the tree breaks off.
	_show_stump(id, true)
	# Count it now so stats/achievements react on the felling blow.
	var kind := "giant" if giant else "regular"
	GameState.stat_add("trees_chopped")
	Events.tree_chopped.emit(_pos[id], kind)
	Events.float_text.emit(_pos[id] + Vector3(0, 2.6, 0), "Timber!", Color(1.0, 0.85, 0.45))


## Pick a fall direction near `away` that crosses the fewest other trunks.
func _clear_fall_dir(id: int, away: Vector3) -> Vector3:
	var h := _height[id]
	var best := away
	var best_hits := 1 << 30
	for off_deg in [0.0, 22.0, -22.0, 45.0, -45.0]:
		var d := away.rotated(Vector3.UP, deg_to_rad(float(off_deg)))
		var hits := 0
		for k in range(1, 5):
			var p := _pos[id] + d * h * float(k) / 5.0
			hits += obstacles_near(p, 1.2).size()
			if gen and gen.is_water(p.x, p.z):
				hits += 1
		hits = hits * 4 + int(absf(float(off_deg)) / 22.0)
		if hits < best_hits:
			best_hits = hits
			best = d
	return best


## Rotation (radians) at which the trunk meets the ground on this slope.
func _fall_angle(id: int, dir: Vector3) -> float:
	if gen == null:
		return deg_to_rad(86.0)
	var base := _pos[id]
	var reach := _height[id] * 0.55
	var deg := 64.0
	while deg <= 100.0:
		var th := deg_to_rad(deg)
		var p := base + (Vector3.UP * cos(th) + dir * sin(th)) * reach
		if p.y <= gen.height_at(p.x, p.z) + _trunk_r[id] * 1.6 + 0.6:
			return th
		deg += 2.0
	return deg_to_rad(100.0)


func _process(delta: float) -> void:
	if _anims.is_empty():
		return
	var done: Array[int] = []
	for id: int in _anims:
		var a: TreeAnim = _anims[id]
		if a.pivot == null or not is_instance_valid(a.pivot):
			done.append(id)
			continue
		a.t += delta
		if a.mode == TreeAnim.SHAKE:
			var dur := maxf(1.1, a.grow_dur)
			var ang := a.amp * exp(-a.t * 4.2) * sin(a.t * TAU * 2.3)
			var sc := 1.0
			if a.grow_dur > 0.0:
				var g := clampf(a.t / a.grow_dur, 0.0, 1.0)
				sc = lerpf(0.25, 1.0, 1.0 - (1.0 - g) * (1.0 - g))
			a.pivot.basis = Basis(a.axis, ang).scaled(Vector3.ONE * sc)
			if a.t >= dur:
				a.pivot.queue_free()
				if _state[id] == TreeState.ALIVE:
					_set_instance_visible(id, true)
				done.append(id)
		else:
			if _update_fall(id, a):
				done.append(id)
	for id in done:
		_anims.erase(id)


## Returns true when the fall sequence is finished.
func _update_fall(id: int, a: TreeAnim) -> bool:
	var giant := _giant[id] == 1
	var T := a.duration
	var ang := 0.0
	if a.t < T:
		var f := a.t / T
		ang = a.angle_end * pow(f, 2.3)
		# Logs pop out just as the trunk hits the ground.
		if f >= 0.92 and not a.dropped:
			a.dropped = true
			_spawn_drops(id, a)
	else:
		if not a.impacted:
			a.impacted = true
			_on_impact(id, a)
		var bt := a.t - T
		var bounce := deg_to_rad(5.0 if not giant else 2.5)
		ang = a.angle_end - bounce * exp(-bt * 7.0) * absf(sin(bt * 11.0))
	a.pivot.basis = Basis(a.axis, ang)
	var vanish_at := T + (0.55 if not giant else 0.9)
	if a.t >= vanish_at:
		if not a.vanishing:
			a.vanishing = true
			_trunk_puff(id, a, 1.0)
		var vf := clampf((a.t - vanish_at) / 0.35, 0.0, 1.0)
		var s := 1.0 - vf * vf
		a.pivot.scale = Vector3(maxf(s, 0.001), maxf(s, 0.001), maxf(s, 0.001))
		if vf >= 1.0:
			a.pivot.queue_free()
			_state[id] = TreeState.STUMP
			if not _felled.has(id):
				_felled.append(id)
			return true
	return false


func _trunk_line(id: int, a: TreeAnim, f: float) -> Vector3:
	var th := a.angle_end
	var p := _pos[id] + (Vector3.UP * cos(th) + a.dir * sin(th)) * _height[id] * f
	if gen:
		p.y = maxf(p.y, gen.height_at(p.x, p.z))
	return p


func _on_impact(id: int, a: TreeAnim) -> void:
	var giant := _giant[id] == 1
	var mid := _trunk_line(id, a, 0.5)
	Audio.play("tree_fall", mid)
	Events.camera_shake.emit(0.45 if giant else 0.25)
	_trunk_puff(id, a, 0.7)
	if not a.dropped:
		a.dropped = true
		_spawn_drops(id, a)


func _trunk_puff(id: int, a: TreeAnim, strength: float) -> void:
	var giant := _giant[id] == 1
	var n := 4 if not giant else 7
	for k in n:
		var f := 0.15 + 0.75 * float(k) / float(n - 1)
		var p := _trunk_line(id, a, f)
		DustPuff.spawn(_fx_parent(), p + Vector3(0, 0.2, 0), (1.3 if not giant else 2.6) * strength * (1.2 - f * 0.4), 8 if strength > 0.8 else 6)


func _spawn_drops(id: int, a: TreeAnim) -> void:
	var giant := _giant[id] == 1
	var rng := RandomNumberGenerator.new()
	rng.seed = int(GameState.seed) * 7919 + id * 104729 + int(_fell_count[id]) * 131
	var table := DB.loot_table("giant_tree" if giant else "regular_tree")
	var drops: Array = Loot.roll(table, rng)
	if drops.is_empty() and not giant:
		drops = [{"id": "wood", "count": 3}]
	var spots: Array[Vector3] = []
	for e in drops:
		var item_id := str(e.get("id", ""))
		var count := int(e.get("count", 0))
		if item_id == "" or count <= 0:
			continue
		var pieces := 1
		if item_id == "wood" or item_id == "kindling":
			pieces = clampi(count, 1, 5 if giant else 3)
		var per := count / pieces
		var extra := count % pieces
		for k in pieces:
			var n := per + (1 if k < extra else 0)
			if n <= 0:
				continue
			var f := rng.randf_range(0.2, 0.8)
			var p := _trunk_line(id, a, f)
			if gen:
				p.y = gen.height_at(p.x, p.z) + 0.45
			p += a.axis * rng.randf_range(-0.6, 0.6)
			spots.append(p)
			var impulse := Vector3(rng.randf_range(-1.0, 1.0), rng.randf_range(2.5, 4.0), rng.randf_range(-1.0, 1.0))
			Pickup.spawn(item_id, n, p, impulse)


func _set_collision(id: int, on: bool) -> void:
	var ci := _chunk[id]
	if not _chunks.has(ci):
		return
	var ch: VegChunk = _chunks[ci]
	if ch.body and _shape[id] >= 0:
		ch.body.shape_owner_set_disabled(_shape[id], not on)


# --- Stumps of felled trees (one lazily built MultiMesh per chunk) -------------

func _felled_layer(ci: int) -> VegLayer:
	var ch: VegChunk = _chunks.get(ci)
	if ch == null:
		return null
	if ch.layers.has(LAYER_FELLED):
		return ch.layers[LAYER_FELLED]
	var l := VegLayer.new()
	l.key = LAYER_FELLED
	l.kind = "log"
	var count := 0
	for key in ch.layers:
		var other: VegLayer = ch.layers[key]
		if other.kind == "tree" or other.kind == "elder":
			count += other.ids.size()
	var zero := Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO)
	for i in count:
		l.xforms.append(zero)
		l.customs.append(Color(0.0, 0.5, 0.0, 0.0))
	l.near = _new_mmi(TreeMeshes.stump(), l.xforms, l.customs, ch.node)
	l.near.name = "FelledStumps"
	var r: Array = range_for("log")
	_set_range(l.near, 0.0, float(r[0]), false)
	ch.layers[LAYER_FELLED] = l
	# One slot per tree of the chunk (slot = position in l.ids).
	for key in ch.layers:
		var other: VegLayer = ch.layers[key]
		if other.kind == "tree" or other.kind == "elder":
			l.ids.append_array(other.ids)
	return l


func _show_stump(id: int, on: bool) -> void:
	var l := _felled_layer(_chunk[id])
	if l == null or l.near == null:
		return
	var slot := l.ids.find(id)
	if slot < 0:
		return
	var xf := Transform3D(Basis.from_scale(Vector3.ZERO), _pos[id])
	if on:
		var s := _trunk_r[id] / 1.15 / 0.4
		if _giant[id] == 1:
			s = _trunk_r[id] / 0.4 * 0.75
		var yaw := _basis[id].get_euler().y
		xf = Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3(s, s * (0.9 if _giant[id] == 0 else 0.6), s)), _pos[id])
		l.near.multimesh.set_instance_custom_data(slot, Color(0.0, 0.5, _custom[id].b, 0.0))
	l.near.multimesh.set_instance_transform(slot, xf)


# =============================================================================
# Regrowth
# =============================================================================

func _on_phase_changed(phase: int) -> void:
	if phase != DayCycle.Phase.DAWN:
		return
	_dawns += 1
	regrow_step()


## Advance regrowth by one dawn (also callable from tests/dev tools).
func regrow_step() -> void:
	var days := maxi(DB.bi("trees.regrow_days", 2), 1)
	var sapling_after := maxi(days - 1, 1)
	var full_after := maxi(days, sapling_after + 1)
	var clearance := DB.bf("trees.regrow_clearance", REGROW_CLEARANCE)
	var player_pos := Vector3(1e9, 0, 1e9)
	if GameState.player and is_instance_valid(GameState.player):
		player_pos = GameState.player.global_position
	for id in _felled.duplicate():
		if _giant[id] == 1:
			continue
		var p := _pos[id]
		if Vector2(p.x - player_pos.x, p.z - player_pos.z).length() < clearance:
			continue
		var age := _dawns - _felled_dawn[id]
		if _state[id] == TreeState.STUMP and age >= sapling_after:
			_state[id] = TreeState.SAPLING
			_show_stump(id, false)
			_show_sapling(id, true)
		elif _state[id] == TreeState.SAPLING and age >= full_after:
			_show_sapling(id, false)
			_state[id] = TreeState.ALIVE
			_hp[id] = _max_hp_kind(false)
			_set_instance_visible(id, true)
			_set_collision(id, true)
			set_obstacle_enabled(id, true)
			_felled.erase(id)
			_grow_in(id)


var _saplings: Dictionary = {}  # tree id -> MeshInstance3D


func _show_sapling(id: int, on: bool) -> void:
	if not on:
		var old: Node3D = _saplings.get(id)
		if old and is_instance_valid(old):
			old.queue_free()
		_saplings.erase(id)
		return
	var mi := MeshInstance3D.new()
	mi.mesh = TreeMeshes.sapling()
	mi.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(mi)
	var c := _custom[id]
	mi.set_instance_shader_parameter("use_custom_override", 1.0)
	mi.set_instance_shader_parameter("custom_override", Vector4(c.r, c.g, c.b, 0.0))
	mi.global_transform = Transform3D(Basis(Vector3.UP, _basis[id].get_euler().y).scaled(Vector3.ONE * 1.1), _pos[id])
	mi.visibility_range_end = 90.0
	_saplings[id] = mi
	var tw := mi.create_tween()
	mi.scale = Vector3.ONE * 0.2
	tw.tween_property(mi, "scale", Vector3.ONE * 1.1, 2.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## A regrown tree rises from sapling size to full size.
func _grow_in(id: int) -> void:
	var old: TreeAnim = _anims.get(id)
	if old and old.pivot and is_instance_valid(old.pivot):
		old.pivot.queue_free()
	var a := _make_tree_node(id)
	a.mode = TreeAnim.SHAKE
	a.amp = 0.0
	a.grow_dur = 3.0
	a.pivot.basis = Basis().scaled(Vector3.ONE * 0.25)
	_anims[id] = a


# =============================================================================
# Debug / tests
# =============================================================================

## Counts used by the verification scripts and the dev overlay.
func debug_stats() -> Dictionary:
	var mmis := 0
	var instances := 0
	for ci in _chunks:
		var ch: VegChunk = _chunks[ci]
		for key in ch.layers:
			var l: VegLayer = ch.layers[key]
			for m in [l.near, l.far, l.shadow]:
				if m:
					mmis += 1
					instances += (m as MultiMeshInstance3D).multimesh.instance_count
	return {
		"trees": _tree_count, "giants": giant_count(), "alive": alive_tree_count(),
		"decor": _decor.size(), "chunks": _chunks.size(), "multimeshes": mmis,
		"instances": instances, "obstacles": _obs.size(),
		"rocks": rocks.rock_count() if rocks else 0,
		"cover_chunks": cover.chunk_count() if cover else 0,
	}
