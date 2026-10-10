class_name GroundCover
extends Node3D
## Grass clumps, wildflowers, ferns, mushrooms, pine cones and twigs.
##
## Streamed in 32 m chunks around the active camera (built a few per frame,
## freed when far away) so the whole map never sits in memory. Each chunk is
## generated deterministically from GameState.seed and the chunk coordinates.
## Density follows Settings.quality() (low 35%, medium 65%, high 100%) by
## trimming each MultiMesh's visible_instance_count (instances are stored in
## random order, so any prefix is an even thinning).

const CHUNK := 32.0
const BUILD_RADIUS := 100.0
const FREE_RADIUS := 135.0
const SEED_COVER := 7411
const DENSITY := {"low": 0.35, "medium": 0.65, "high": 1.0}

## name -> visibility end (m), shadow casting
const LAYERS := {
	"grass": {"vis": 64.0, "shadow": false},
	"grass_tall": {"vis": 64.0, "shadow": false},
	"flowers": {"vis": 52.0, "shadow": false},
	"ferns": {"vis": 90.0, "shadow": false},
	"mush_red": {"vis": 34.0, "shadow": false},
	"mush_brown": {"vis": 34.0, "shadow": false},
	"debris": {"vis": 30.0, "shadow": false},
}

var veg: Vegetation
var gen: WorldGen
var _chunks: Dictionary = {}  # Vector2i -> Node3D
var _queue: Array[Vector2i] = []
var _density := 1.0
var _timer := 0.0
var _job: CoverJob = null
# Site values for the current candidate (see _sample).
var _s_meadow := 0.0
var _s_clear := 0.0
var _s_rock := 0.0
var _s_canopy := 0.0
var _s_slope := 0.0
var _s_stream := 99.0
var _half_n := 0
var _grove := Vector3.INF
var _grove_r := 0.0
var _hollow := Vector3.INF
var _hollow_r := 0.0


func setup(p_veg: Vegetation) -> void:
	veg = p_veg
	gen = p_veg.gen if p_veg else null
	if gen == null:
		return
	_half_n = int(WorldGen.HALF / CHUNK)
	if gen.landmarks.has("elder_grove"):
		_grove = gen.landmarks["elder_grove"]["pos"]
		_grove_r = gen.landmarks["elder_grove"]["radius"]
	if gen.landmarks.has("hollow"):
		_hollow = gen.landmarks["hollow"]["pos"]
		_hollow_r = gen.landmarks["hollow"]["radius"]
	_density = float(DENSITY.get(Settings.quality(), 1.0))
	# Pre-build around the camp so the first frame is lush.
	_update_needed(Vector3(3.0, 0.0, 4.0))
	var t0 := Time.get_ticks_msec()
	while not _queue.is_empty():
		_build_chunk(_queue.pop_front())
		if Time.get_ticks_msec() - t0 > 40:
			await get_tree().process_frame
			t0 = Time.get_ticks_msec()


func chunk_count() -> int:
	return _chunks.size()


## Average chunk build time in ms (for perf checks).
var build_ms_total := 0.0
var build_count := 0


func apply_quality() -> void:
	_density = float(DENSITY.get(Settings.quality(), 1.0))
	for key in _chunks:
		var holder: Node3D = _chunks[key]
		for c in holder.get_children():
			var mmi := c as MultiMeshInstance3D
			if mmi:
				var total := mmi.multimesh.instance_count
				mmi.multimesh.visible_instance_count = clampi(int(ceil(float(total) * _density)), 0, total)


# =============================================================================
# Streaming
# =============================================================================

func _focus() -> Vector3:
	var vp := get_viewport()
	var cam := vp.get_camera_3d() if vp else null
	if cam:
		return cam.global_position
	if GameState.player and is_instance_valid(GameState.player):
		return GameState.player.global_position
	return Vector3.ZERO


func _key_center(k: Vector2i) -> Vector2:
	return Vector2((float(k.x) + 0.5) * CHUNK, (float(k.y) + 0.5) * CHUNK)


func _update_needed(focus: Vector3) -> void:
	var f := Vector2(focus.x, focus.z)
	var reach := int(ceil(BUILD_RADIUS / CHUNK)) + 1
	var fk := Vector2i(int(floor(f.x / CHUNK)), int(floor(f.y / CHUNK)))
	var wanted: Array = []
	for dz in range(-reach, reach + 1):
		for dx in range(-reach, reach + 1):
			var k := fk + Vector2i(dx, dz)
			if k.x < -_half_n or k.y < -_half_n or k.x >= _half_n or k.y >= _half_n:
				continue
			var d := _key_center(k).distance_to(f)
			if d > BUILD_RADIUS:
				continue
			if _chunks.has(k) or _queue.has(k):
				continue
			wanted.append([d, k])
	wanted.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]))
	for w in wanted:
		_queue.append(w[1])
	# Drop queued chunks that are no longer needed and free far ones.
	var keep: Array[Vector2i] = []
	for k in _queue:
		if _key_center(k).distance_to(f) <= FREE_RADIUS:
			keep.append(k)
	_queue = keep
	for k: Vector2i in _chunks.keys():
		if _key_center(k).distance_to(f) > FREE_RADIUS:
			var n: Node3D = _chunks[k]
			if is_instance_valid(n):
				n.queue_free()
			_chunks.erase(k)


func _process(delta: float) -> void:
	if gen == null:
		return
	_timer -= delta
	var focus := _focus()
	if _timer <= 0.0:
		_timer = 0.2
		_update_needed(focus)
	# After a teleport the chunk under the camera is missing: catch up now
	# (synchronously, ~0.1 s); otherwise build one chunk at a time, one stage
	# per frame, so walking never hitches.
	var fk := Vector2i(int(floor(focus.x / CHUNK)), int(floor(focus.z / CHUNK)))
	if not _chunks.has(fk) and _queue.has(fk):
		var t0 := Time.get_ticks_msec()
		while not _queue.is_empty() and Time.get_ticks_msec() - t0 < 120:
			_build_chunk(_queue.pop_front())
		return
	if _job == null:
		while _job == null and not _queue.is_empty():
			_job = _start_job(_queue.pop_front())
	if _job != null and _step_job(_job):
		_job = null


# =============================================================================
# Generation
# =============================================================================

class CoverJob:
	var key := Vector2i.ZERO
	var stage := 0
	var holder: Node3D
	var rng := RandomNumberGenerator.new()
	var x0 := 0.0
	var z0 := 0.0
	var site := PackedFloat32Array()
	var layers := {}
	var work_us := 0


## Build one chunk right now.
func _build_chunk(k: Vector2i) -> void:
	var job := _start_job(k)
	if job == null:
		return
	if _job != null and _job.key == k:
		_job = null
	while not _step_job(job):
		pass


func _start_job(k: Vector2i) -> CoverJob:
	if _chunks.has(k):
		return null
	var t0 := Time.get_ticks_usec()
	var job := CoverJob.new()
	job.key = k
	job.holder = Node3D.new()
	job.holder.name = "Cover%d_%d" % [k.x, k.y]
	add_child(job.holder)
	_chunks[k] = job.holder
	job.rng.seed = hash(Vector3i(k.x, k.y, int(GameState.seed) + SEED_COVER))
	job.x0 = float(k.x) * CHUNK
	job.z0 = float(k.y) * CHUNK
	# Coarse site samples (5 x 5, 8 m) for the slower WorldGen queries.
	job.site = _site_grid(job.x0, job.z0)
	for name in LAYERS:
		var xs: Array[Transform3D] = []
		job.layers[name] = {"x": xs, "c": PackedColorArray()}
	job.work_us += Time.get_ticks_usec() - t0
	return job


## Runs the next stage of a chunk job; true when the chunk is finished (or
## was freed meanwhile).
func _step_job(job: CoverJob) -> bool:
	if not is_instance_valid(job.holder) or not _chunks.has(job.key):
		return true
	var t0 := Time.get_ticks_usec()
	match job.stage:
		0:
			_scatter_grass(job.rng, job.x0, job.z0, job.site, job.layers, 0, 600)
		1:
			_scatter_grass(job.rng, job.x0, job.z0, job.site, job.layers, 600, 1150)
		2:
			_scatter_flowers(job.rng, job.x0, job.z0, job.site, job.layers)
			_scatter_forest_floor(job.rng, job.x0, job.z0, job.site, job.layers)
		_:
			_finish_job(job)
	job.stage += 1
	job.work_us += Time.get_ticks_usec() - t0
	if job.stage > 3:
		build_ms_total += float(job.work_us) / 1000.0
		build_count += 1
		return true
	return false


func _finish_job(job: CoverJob) -> void:
	for name in job.layers:
		var ld: Dictionary = job.layers[name]
		var xs: Array = ld["x"]
		if xs.is_empty():
			continue
		var mesh: Mesh
		match name:
			"grass":
				mesh = TreeMeshes.grass(0)
			"grass_tall":
				mesh = TreeMeshes.grass(1)
			"flowers":
				mesh = TreeMeshes.flowers()
			"ferns":
				mesh = TreeMeshes.fern()
			"mush_red":
				mesh = TreeMeshes.mushrooms(true)
			"mush_brown":
				mesh = TreeMeshes.mushrooms(false)
			_:
				mesh = TreeMeshes.debris()
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = true
		mm.mesh = mesh
		mm.instance_count = xs.size()
		var cs: PackedColorArray = ld["c"]
		for i in xs.size():
			mm.set_instance_transform(i, xs[i])
			mm.set_instance_custom_data(i, cs[i])
		mm.visible_instance_count = clampi(int(ceil(float(xs.size()) * _density)), 0, xs.size())
		var mmi := MultiMeshInstance3D.new()
		mmi.name = name
		mmi.multimesh = mm
		var spec: Dictionary = LAYERS[name]
		mmi.visibility_range_end = float(spec["vis"])
		mmi.visibility_range_end_margin = 6.0
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if bool(spec["shadow"]) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mmi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		mmi.extra_cull_margin = 1.0
		mmi.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
		job.holder.add_child(mmi)


const SITE_CH := 6

## 5x5 samples over the chunk (8 m apart) of the slower queries:
## [meadow, clearing, rock, canopy, slope, stream distance].
func _site_grid(x0: float, z0: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(25 * SITE_CH)
	for j in 5:
		for i in 5:
			var x := x0 + float(i) * CHUNK / 4.0
			var z := z0 + float(j) * CHUNK / 4.0
			var o := (j * 5 + i) * SITE_CH
			out[o] = gen.meadow_factor(x, z)
			out[o + 1] = gen.clearing_factor(x, z)
			out[o + 2] = gen.rock_factor(x, z)
			out[o + 3] = veg.canopy_at(x, z)
			out[o + 4] = gen.slope_at(x, z)
			out[o + 5] = gen.distance_to_stream(x, z)
	return out


## Bilinear sample of every site channel at (x, z) into the _s_* fields.
func _sample(site: PackedFloat32Array, x0: float, z0: float, x: float, z: float) -> void:
	var fx := clampf((x - x0) * (4.0 / CHUNK), 0.0, 3.999)
	var fz := clampf((z - z0) * (4.0 / CHUNK), 0.0, 3.999)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - float(i)
	var tz := fz - float(j)
	var w00 := (1.0 - tx) * (1.0 - tz)
	var w10 := tx * (1.0 - tz)
	var w01 := (1.0 - tx) * tz
	var w11 := tx * tz
	var o00 := (j * 5 + i) * SITE_CH
	var o10 := o00 + SITE_CH
	var o01 := o00 + 5 * SITE_CH
	var o11 := o01 + SITE_CH
	_s_meadow = site[o00] * w00 + site[o10] * w10 + site[o01] * w01 + site[o11] * w11
	_s_clear = site[o00 + 1] * w00 + site[o10 + 1] * w10 + site[o01 + 1] * w01 + site[o11 + 1] * w11
	_s_rock = site[o00 + 2] * w00 + site[o10 + 2] * w10 + site[o01 + 2] * w01 + site[o11 + 2] * w11
	_s_canopy = site[o00 + 3] * w00 + site[o10 + 3] * w10 + site[o01 + 3] * w01 + site[o11 + 3] * w11
	_s_slope = site[o00 + 4] * w00 + site[o10 + 4] * w10 + site[o01 + 4] * w01 + site[o11 + 4] * w11
	_s_stream = site[o00 + 5] * w00 + site[o10 + 5] * w10 + site[o01 + 5] * w01 + site[o11 + 5] * w11


## Shared ground suitability: 0 on water/trails/camp hearth/steep rock.
func _ground_ok(x: float, z: float, h: float, path_d: float, min_path: float, slope: float, stream_d: float) -> float:
	if h < WorldGen.WATER_LEVEL + 0.25:
		return 0.0
	var f := smoothstep(WorldGen.WATER_LEVEL + 0.25, WorldGen.WATER_LEVEL + 0.9, h)
	f *= smoothstep(min_path, min_path + 1.4, path_d)
	var camp_d := sqrt(x * x + z * z)
	f *= smoothstep(3.5, 10.0, camp_d)
	f *= 1.0 - smoothstep(0.32, 0.55, slope)
	if stream_d < 2.4:
		f *= 0.0
	return f


func _place_xf(x: float, z: float, h: float, yaw: float, s: float) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * s), Vector3(x, h - 0.02, z))


func _scatter_grass(rng: RandomNumberGenerator, x0: float, z0: float, site: PackedFloat32Array, layers: Dictionary, from_i: int, to_i: int) -> void:
	for i in range(from_i, to_i):
		var x := x0 + rng.randf() * CHUNK
		var z := z0 + rng.randf() * CHUNK
		var roll := rng.randf()
		var tall_roll := rng.randf()
		var yaw := rng.randf() * TAU
		var sr := rng.randf()
		var h := gen.height_at(x, z)
		var pd := veg.path_distance(x, z)
		if h < WorldGen.WATER_LEVEL + 0.25 or pd < 0.9:
			continue
		_sample(site, x0, z0, x, z)
		var ok := _ground_ok(x, z, h, pd, 0.9, _s_slope, _s_stream)
		if ok <= 0.0:
			continue
		var meadow := _s_meadow
		var canopy := _s_canopy
		var rock := _s_rock
		var d := (0.42 + meadow * 0.58) * (1.0 - canopy * 0.75) * (1.0 - rock * 0.55) * ok
		if _in_grove(x, z):
			d *= 0.55
		if roll > d:
			continue
		var tall := tall_roll < meadow * 0.75 + 0.06
		var s := lerpf(0.7, 1.25, sr) * (1.0 + meadow * 0.25) * lerpf(0.75, 1.0, ok)
		var warm := clampf(0.42 + meadow * 0.25 - canopy * 0.15 + rng.randf_range(-0.08, 0.08), 0.0, 1.0)
		var ld: Dictionary = layers["grass_tall" if tall else "grass"]
		(ld["x"] as Array).append(_place_xf(x, z, h, yaw, s))
		var cs: PackedColorArray = ld["c"]
		cs.append(Color(0.0, rng.randf_range(0.4, 0.6), rng.randf(), warm))
		ld["c"] = cs


func _scatter_flowers(rng: RandomNumberGenerator, x0: float, z0: float, site: PackedFloat32Array, layers: Dictionary) -> void:
	var n := 170
	for i in n:
		var x := x0 + rng.randf() * CHUNK
		var z := z0 + rng.randf() * CHUNK
		var roll := rng.randf()
		var yaw := rng.randf() * TAU
		var sr := rng.randf()
		var pick := rng.randf()
		var h := gen.height_at(x, z)
		var pd := veg.path_distance(x, z)
		if h < WorldGen.WATER_LEVEL + 0.25 or pd < 1.6:
			continue
		_sample(site, x0, z0, x, z)
		var ok := _ground_ok(x, z, h, pd, 1.6, _s_slope, _s_stream)
		if ok <= 0.0:
			continue
		var meadow := _s_meadow
		var canopy := _s_canopy
		var camp_d := sqrt(x * x + z * z)
		var d := 0.04 + meadow * 0.55
		if pd < 5.0:
			d += 0.12
		if camp_d > 9.0 and camp_d < 28.0:
			d += 0.22
		d *= (1.0 - canopy * 0.85) * ok
		if roll > d:
			continue
		# Colours come in patches.
		var patch := sin(x * 0.11 + 2.0) * cos(z * 0.09 - 1.0) * 0.5 + 0.5
		var slot := clampi(int(patch * 4.0), 0, 3)
		if pick < 0.3:
			slot = int(pick / 0.3 * 4.0) % 4
		var ld: Dictionary = layers["flowers"]
		(ld["x"] as Array).append(_place_xf(x, z, h, yaw, lerpf(0.8, 1.3, sr)))
		var cs: PackedColorArray = ld["c"]
		cs.append(Color((float(slot) + 0.5) / 4.0, rng.randf_range(0.42, 0.6), rng.randf(), 0.5))
		ld["c"] = cs


func _in_grove(x: float, z: float) -> bool:
	return _grove != Vector3.INF and Vector2(x - _grove.x, z - _grove.z).length() < _grove_r * 1.1


func _scatter_forest_floor(rng: RandomNumberGenerator, x0: float, z0: float, site: PackedFloat32Array, layers: Dictionary) -> void:
	var n := 150
	for i in n:
		var x := x0 + rng.randf() * CHUNK
		var z := z0 + rng.randf() * CHUNK
		var roll := rng.randf()
		var kind := rng.randf()
		var yaw := rng.randf() * TAU
		var sr := rng.randf()
		var h := gen.height_at(x, z)
		var pd := veg.path_distance(x, z)
		if h < WorldGen.WATER_LEVEL + 0.25 or pd < 1.6:
			continue
		_sample(site, x0, z0, x, z)
		var ok := _ground_ok(x, z, h, pd, 1.6, _s_slope, _s_stream)
		if ok <= 0.0:
			continue
		var canopy := _s_canopy
		var meadow := _s_meadow
		var grove := 1.0 if _in_grove(x, z) else 0.0
		var hollow := 0.0
		if _hollow != Vector3.INF:
			hollow = 1.0 - smoothstep(_hollow_r * 0.6, _hollow_r * 2.2, Vector2(x - _hollow.x, z - _hollow.z).length())
		var fern_p := (canopy * 0.42 + grove * 0.5 + hollow * 0.7) * (1.0 - meadow * 0.8) * ok
		var mush_p := (canopy * 0.06 + grove * 0.08) * ok
		var debris_p := canopy * 0.16 * ok
		if roll < fern_p:
			if not veg.is_clear(Vector3(x, 0, z), 0.4):
				continue
			var ld: Dictionary = layers["ferns"]
			(ld["x"] as Array).append(_place_xf(x, z, h, yaw, lerpf(0.75, 1.35, sr) * (1.0 + grove * 0.35 + hollow * 0.3)))
			var cs: PackedColorArray = ld["c"]
			cs.append(Color(0.0, rng.randf_range(0.4, 0.6), rng.randf(), clampf(0.35 + rng.randf_range(-0.1, 0.12), 0.0, 1.0)))
			ld["c"] = cs
			continue
		roll -= fern_p
		if roll < mush_p:
			var name := "mush_red" if kind < 0.4 else "mush_brown"
			var ld: Dictionary = layers[name]
			(ld["x"] as Array).append(_place_xf(x, z, h, yaw, lerpf(0.8, 1.4, sr)))
			var cs: PackedColorArray = ld["c"]
			cs.append(Color(0.0, rng.randf_range(0.42, 0.6), rng.randf(), 0.5))
			ld["c"] = cs
			continue
		roll -= mush_p
		if roll < debris_p:
			var ld: Dictionary = layers["debris"]
			(ld["x"] as Array).append(_place_xf(x, z, h, yaw, lerpf(0.8, 1.2, sr)))
			var cs: PackedColorArray = ld["c"]
			cs.append(Color(0.0, rng.randf_range(0.4, 0.6), rng.randf(), 0.5))
			ld["c"] = cs
