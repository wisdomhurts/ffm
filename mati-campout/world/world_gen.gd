class_name WorldGen
extends RefCounted
## Deterministic world layout for a seed: terrain height, water, paths,
## forest density and landmark positions. Pure logic (no nodes), so terrain,
## vegetation, the map, spawning and AI all agree on the same world.
##
## Axes: +X = east, -Z = north, +Y = up. The camp is at the origin.
## The terrain spans -HALF..HALF on X and Z; the player is kept inside
## PLAYABLE_HALF. Moonmirror Lake fills the west; the lighthouse stands on a
## headland on its north-east shore; the Rocky Ridge rises in the north-east.

const HALF := 320.0
const PLAYABLE_HALF := 290.0
const CELL := 2.0                      # height cache resolution (metres)
const GRID := int(HALF * 2.0 / CELL) + 1
const WATER_LEVEL := -1.6
const LAKE_FLOOR := -7.5

var seed: int = 0
var heights := PackedFloat32Array()
var _n_base := FastNoiseLite.new()
var _n_detail := FastNoiseLite.new()
var _n_ridge := FastNoiseLite.new()
var _n_forest := FastNoiseLite.new()
var _n_shore := FastNoiseLite.new()
var _n_meadow := FastNoiseLite.new()

## id -> {"pos": Vector3, "radius": float, "name": String, "kind": String}
var landmarks: Dictionary = {}
## Array of PackedVector2Array polylines (x, z) for walking trails.
var paths: Array = []
## Stream polyline (x, z) from the ridge spring to the lake.
var stream: PackedVector2Array = PackedVector2Array()
var stream_width := 3.2
var stream_depth := 1.3

var _ridge_a := Vector2(40, -195)
var _ridge_b := Vector2(175, -140)
var _peninsula_a := Vector2(-168, -130)
var _peninsula_b := Vector2(-212, -78)


func _init(p_seed: int = 20261010) -> void:
	seed = p_seed
	_setup_noise()
	_setup_layout()
	_build_height_cache()


func _setup_noise() -> void:
	_n_base.seed = seed
	_n_base.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_n_base.frequency = 0.0075
	_n_base.fractal_type = FastNoiseLite.FRACTAL_FBM
	_n_base.fractal_octaves = 4
	_n_detail.seed = seed + 11
	_n_detail.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_n_detail.frequency = 0.045
	_n_detail.fractal_octaves = 2
	_n_ridge.seed = seed + 23
	_n_ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_n_ridge.frequency = 0.02
	_n_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	_n_ridge.fractal_octaves = 3
	_n_forest.seed = seed + 37
	_n_forest.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_n_forest.frequency = 0.012
	_n_forest.fractal_octaves = 3
	_n_shore.seed = seed + 41
	_n_shore.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_n_shore.frequency = 0.018
	_n_shore.fractal_octaves = 2
	_n_meadow.seed = seed + 53
	_n_meadow.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_n_meadow.frequency = 0.02


func _lm(id: String, x: float, z: float, r: float, name: String, kind: String) -> void:
	landmarks[id] = {"pos": Vector3(x, 0.0, z), "radius": r, "name": name, "kind": kind}


func _setup_layout() -> void:
	# A small, seed-dependent jitter keeps runs feeling fresh while the overall
	# geography (lake west, ridge north-east) stays learnable.
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var j := func(v: float) -> float: return v + rng.randf_range(-8.0, 8.0)
	_lm("camp", 0.0, 0.0, 20.0, "Home Camp", "camp")
	_lm("lighthouse", -212.0, -78.0, 14.0, "Moonmirror Lighthouse", "lighthouse")
	_lm("ridge", 110.0, -170.0, 60.0, "Rocky Ridge", "ridge")
	_lm("abandoned_camp", j.call(185.0), j.call(40.0), 18.0, "Abandoned Campsite", "ruin")
	_lm("elder_grove", j.call(125.0), j.call(175.0), 40.0, "Elder Grove", "grove")
	_lm("lookout", j.call(-30.0), j.call(-205.0), 10.0, "Ranger Lookout", "ruin")
	_lm("rosies_rest", j.call(70.0), j.call(105.0), 9.0, "Rosie's Rest", "trader")
	_lm("pips_dock", -98.0, 58.0, 9.0, "Pip's Dock", "trader")
	_lm("brams_dig", j.call(75.0), -122.0, 9.0, "Bram's Dig", "trader")
	_lm("lake", -200.0, 30.0, 110.0, "Moonmirror Lake", "lake")
	_lm("meadow", 20.0, 70.0, 45.0, "Sunny Meadow", "meadow")
	_lm("hollow", j.call(-120.0), j.call(150.0), 16.0, "Fern Hollow", "hidden")
	_lm("old_mine", j.call(165.0), -95.0, 12.0, "Old Mine", "hidden")

	stream = PackedVector2Array([
		Vector2(112, -150), Vector2(85, -118), Vector2(55, -92), Vector2(22, -62),
		Vector2(-12, -48), Vector2(-48, -40), Vector2(-80, -28), Vector2(-112, -16),
	])

	var camp := Vector2.ZERO
	paths = [
		_trail([camp, Vector2(-40, 25), Vector2(-75, 50), _xz("pips_dock")]),
		_trail([_xz("pips_dock"), Vector2(-86, 20), Vector2(-88, -35), Vector2(-112, -92), Vector2(-150, -124), Vector2(-172, -127), Vector2(-198, -94), _xz("lighthouse")]),
		_trail([camp, Vector2(18, -40), Vector2(48, -80), _xz("brams_dig"), Vector2(100, -150)]),
		_trail([camp, Vector2(55, 10), Vector2(120, 30), _xz("abandoned_camp")]),
		_trail([camp, Vector2(25, 50), _xz("rosies_rest"), Vector2(105, 140), _xz("elder_grove")]),
		_trail([camp, Vector2(-12, -60), Vector2(-25, -130), _xz("lookout")]),
		_trail([_xz("abandoned_camp"), Vector2(175, -40), _xz("old_mine")]),
		_trail([_xz("rosies_rest"), Vector2(-20, 130), Vector2(-80, 145), _xz("hollow")]),
	]


func _xz(id: String) -> Vector2:
	var p: Vector3 = landmarks[id]["pos"]
	return Vector2(p.x, p.z)


## Densify a coarse trail and add a gentle meander.
func _trail(points: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in points.size() - 1:
		var a: Vector2 = points[i]
		var b: Vector2 = points[i + 1]
		var steps := maxi(int(a.distance_to(b) / 6.0), 1)
		var side := (b - a).orthogonal().normalized()
		for s in steps:
			var t := float(s) / steps
			var p := a.lerp(b, t)
			var wob := _n_shore.get_noise_2d(p.x * 1.7, p.y * 1.7) * 4.0 * sin(t * PI)
			out.append(p + side * wob)
	out.append(points[points.size() - 1])
	return out


# --- Height ---------------------------------------------------------------------

func _build_height_cache() -> void:
	heights.resize(GRID * GRID)
	for iz in GRID:
		var z := -HALF + iz * CELL
		for ix in GRID:
			var x := -HALF + ix * CELL
			heights[iz * GRID + ix] = compute_height(x, z)


## Interpolated height from the cache (fast; use this at runtime).
func height_at(x: float, z: float) -> float:
	var fx := clampf((x + HALF) / CELL, 0.0, GRID - 1.001)
	var fz := clampf((z + HALF) / CELL, 0.0, GRID - 1.001)
	var ix := int(fx)
	var iz := int(fz)
	var tx := fx - ix
	var tz := fz - iz
	var i := iz * GRID + ix
	var h00 := heights[i]
	var h10 := heights[i + 1]
	var h01 := heights[i + GRID]
	var h11 := heights[i + GRID + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)


func height_at_v(p: Vector3) -> float:
	return height_at(p.x, p.z)


## Snap a point onto the ground.
func ground(p: Vector3, offset: float = 0.0) -> Vector3:
	return Vector3(p.x, height_at(p.x, p.z) + offset, p.z)


func normal_at(x: float, z: float) -> Vector3:
	var e := CELL
	var hl := height_at(x - e, z)
	var hr := height_at(x + e, z)
	var hd := height_at(x, z - e)
	var hu := height_at(x, z + e)
	return Vector3(hl - hr, 2.0 * e, hd - hu).normalized()


## 0 = flat, 1 = vertical.
func slope_at(x: float, z: float) -> float:
	return 1.0 - normal_at(x, z).y


## The un-cached height function (slow; used to build the cache).
func compute_height(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var h := _n_base.get_noise_2d(x, z) * 6.0 + _n_detail.get_noise_2d(x, z) * 0.9
	# Gentle bowl toward the camp so it sits in a sheltered clearing.
	h += clampf(p.length() / 220.0, 0.0, 1.0) * 3.0

	# Rocky Ridge: a long raised spine with ridged noise.
	var rd := _dist_to_segment(p, _ridge_a, _ridge_b)
	var ridge_shape := smoothstep(75.0, 8.0, rd)
	var ridged := (_n_ridge.get_noise_2d(x, z) * 0.5 + 0.5)
	h += ridge_shape * (14.0 + ridged * 16.0)

	# Distant walls (north, east, south edges) so the map feels enclosed.
	var edge := maxf(maxf(absf(x), absf(z)), 0.0)
	var wall := smoothstep(262.0, 320.0, edge)
	if x > -230.0:
		h += wall * wall * (38.0 + _n_ridge.get_noise_2d(x * 0.6, z * 0.6) * 10.0)

	# Camp clearing: flat and level.
	var camp_d := p.length()
	var camp_h := 0.35
	h = lerpf(h, camp_h, smoothstep(30.0, 15.0, camp_d))

	# Small flattened pads for landmarks.
	for id in ["abandoned_camp", "rosies_rest", "brams_dig", "lookout", "old_mine", "hollow"]:
		var lm: Dictionary = landmarks[id]
		var lp := Vector2(lm["pos"].x, lm["pos"].z)
		var r: float = lm["radius"]
		var d := p.distance_to(lp)
		var pad_h := _n_base.get_noise_2d(lp.x, lp.y) * 6.0 + 1.0
		h = lerpf(h, pad_h, smoothstep(r * 1.8, r * 0.8, d) * 0.85)

	# Moonmirror Lake.
	var lake := lake_mask(x, z)
	if lake > 0.0:
		h = lerpf(h, LAKE_FLOOR, lake)
		# Beaches: pull the shoreline band toward just above water.
		var shore := smoothstep(0.0, 0.35, lake) * (1.0 - smoothstep(0.35, 0.6, lake))
		h = lerpf(h, WATER_LEVEL + 0.3, shore * 0.6)

	# Lighthouse headland (after the lake so it pokes out of the water).
	var pd := _dist_to_segment(p, _peninsula_a, _peninsula_b)
	var head := smoothstep(22.0, 6.0, pd)
	if head > 0.0:
		var rocky := 2.6 + _n_detail.get_noise_2d(x * 2.0, z * 2.0) * 1.2
		h = lerpf(h, rocky, head)
		var tip := smoothstep(16.0, 4.0, p.distance_to(_peninsula_b))
		h = lerpf(h, 3.4, tip)

	# Stream bed.
	var sf := stream_factor(x, z)
	if sf > 0.0:
		h -= sf * stream_depth
	return h


## 0 outside the lake .. 1 in deep water (with a noisy shoreline).
func lake_mask(x: float, z: float) -> float:
	var wob := _n_shore.get_noise_2d(x, z) * 16.0
	var main_d := Vector2((x + 200.0) / 1.0, (z - 25.0) / 1.15).length() + wob
	var main := smoothstep(118.0, 88.0, main_d)
	# The lake opens west past the map edge toward the open horizon.
	var west := smoothstep(-205.0 + wob, -250.0 + wob, x) * smoothstep(250.0, 190.0, absf(z - 10.0))
	return clampf(maxf(main, west), 0.0, 1.0)


func is_water(x: float, z: float) -> bool:
	return height_at(x, z) < WATER_LEVEL


func water_depth(x: float, z: float) -> float:
	return maxf(WATER_LEVEL - height_at(x, z), 0.0)


## 1 at the stream centre line, fading to 0 at stream_width.
func stream_factor(x: float, z: float) -> float:
	var d := _dist_to_polyline(Vector2(x, z), stream)
	return smoothstep(stream_width, stream_width * 0.25, d)


func distance_to_stream(x: float, z: float) -> float:
	return _dist_to_polyline(Vector2(x, z), stream)


## Height of the stream's water surface near (x, z).
func stream_water_height(x: float, z: float) -> float:
	return compute_height(x, z) + stream_depth * stream_factor(x, z) - 0.55


# --- Paths & density ---------------------------------------------------------------

## 1 on a trail's centre line, fading to 0 about 2.5 m away.
func path_factor(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var best := 1e9
	for poly in paths:
		best = minf(best, _dist_to_polyline(p, poly))
		if best < 0.5:
			break
	return smoothstep(2.6, 0.6, best)


func distance_to_path(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var best := 1e9
	for poly in paths:
		best = minf(best, _dist_to_polyline(p, poly))
	return best


## 0..1: how much a point is a clearing (camp, landmarks, meadow).
func clearing_factor(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var c := smoothstep(30.0, 18.0, p.length())
	for id in ["abandoned_camp", "rosies_rest", "pips_dock", "brams_dig", "lookout", "lighthouse", "old_mine"]:
		var lm: Dictionary = landmarks[id]
		var d := p.distance_to(Vector2(lm["pos"].x, lm["pos"].z))
		c = maxf(c, smoothstep(lm["radius"] * 1.5, lm["radius"] * 0.9, d))
	return c


## 0..1 meadow-ness (open grassy fields with flowers, few trees).
func meadow_factor(x: float, z: float) -> float:
	var lm: Dictionary = landmarks["meadow"]
	var d := Vector2(x, z).distance_to(Vector2(lm["pos"].x, lm["pos"].z))
	var base := smoothstep(lm["radius"] * 1.4, lm["radius"] * 0.5, d)
	var patchy := smoothstep(0.35, 0.65, _n_meadow.get_noise_2d(x, z) * 0.5 + 0.5)
	return clampf(maxf(base, patchy * 0.7), 0.0, 1.0)


## 0..1 probability weight for placing a regular tree.
func forest_density(x: float, z: float) -> float:
	if not in_terrain(x, z):
		return 0.0
	var h := height_at(x, z)
	if h < WATER_LEVEL + 0.6:
		return 0.0
	var f := _n_forest.get_noise_2d(x, z) * 0.5 + 0.55
	f *= 1.0 - clearing_factor(x, z)
	f *= 1.0 - path_factor(x, z)
	f *= 1.0 - meadow_factor(x, z) * 0.85
	f *= 1.0 - smoothstep(4.0, 1.5, distance_to_stream(x, z))
	f *= 1.0 - smoothstep(0.35, 0.6, slope_at(x, z))
	return clampf(f, 0.0, 1.0)


## 0..1 rockiness (boulders, stone piles, coal near the ridge).
func rock_factor(x: float, z: float) -> float:
	var rd := _dist_to_segment(Vector2(x, z), _ridge_a, _ridge_b)
	var ridge := smoothstep(80.0, 20.0, rd)
	var slope := smoothstep(0.15, 0.45, slope_at(x, z))
	var shore := smoothstep(0.15, 0.4, lake_mask(x, z)) * (1.0 - smoothstep(0.45, 0.6, lake_mask(x, z)))
	return clampf(maxf(maxf(ridge, slope), shore * 0.6), 0.0, 1.0)


func is_elder_grove(x: float, z: float) -> bool:
	var lm: Dictionary = landmarks["elder_grove"]
	return Vector2(x, z).distance_to(Vector2(lm["pos"].x, lm["pos"].z)) < lm["radius"]


## Biome tag used for audio/footsteps/spawning: "camp", "meadow", "forest",
## "ridge", "shore", "water", "grove".
func biome_at(x: float, z: float) -> String:
	if Vector2(x, z).length() < 22.0:
		return "camp"
	if is_water(x, z):
		return "water"
	if lake_mask(x, z) > 0.1:
		return "shore"
	if is_elder_grove(x, z):
		return "grove"
	if _dist_to_segment(Vector2(x, z), _ridge_a, _ridge_b) < 55.0:
		return "ridge"
	if meadow_factor(x, z) > 0.5:
		return "meadow"
	return "forest"


func in_terrain(x: float, z: float) -> bool:
	return absf(x) <= HALF and absf(z) <= HALF


func in_playable(x: float, z: float) -> bool:
	return absf(x) <= PLAYABLE_HALF and absf(z) <= PLAYABLE_HALF


## Keep a position inside the playable square.
func clamp_playable(p: Vector3) -> Vector3:
	return Vector3(clampf(p.x, -PLAYABLE_HALF, PLAYABLE_HALF), p.y, clampf(p.z, -PLAYABLE_HALF, PLAYABLE_HALF))


func landmark_pos(id: String) -> Vector3:
	if not landmarks.has(id):
		return Vector3.ZERO
	var p: Vector3 = landmarks[id]["pos"]
	return ground(p)


## A random dry, walkable point in a ring around `center`. Returns
## Vector3.INF if nothing suitable was found.
func random_land_point(rng: RandomNumberGenerator, center: Vector3, min_r: float, max_r: float, tries: int = 24) -> Vector3:
	for _i in tries:
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf_range(min_r * min_r, max_r * max_r))
		var x := center.x + cos(a) * r
		var z := center.z + sin(a) * r
		if not in_playable(x, z):
			continue
		if is_water(x, z) or slope_at(x, z) > 0.45:
			continue
		return Vector3(x, height_at(x, z), z)
	return Vector3.INF


# --- Geometry helpers ---------------------------------------------------------------

static func _dist_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.0001), 0.0, 1.0)
	return p.distance_to(a + ab * t)


static func _dist_to_polyline(p: Vector2, poly: PackedVector2Array) -> float:
	var best := 1e9
	for i in poly.size() - 1:
		var a := poly[i]
		var b := poly[i + 1]
		# Cheap reject: segment bounding box far away.
		if minf(a.x, b.x) - best > p.x or maxf(a.x, b.x) + best < p.x:
			continue
		if minf(a.y, b.y) - best > p.y or maxf(a.y, b.y) + best < p.y:
			continue
		best = minf(best, _dist_to_segment(p, a, b))
	return best


# --- Map image -------------------------------------------------------------------

## A painted top-down map of the terrain (north up). Landmark icons are drawn
## by the map UI on top of this.
func render_map_image(size_px: int = 512) -> Image:
	var img := Image.create(size_px, size_px, false, Image.FORMAT_RGB8)
	var light_dir := Vector3(-0.6, 0.7, -0.4).normalized()
	for py in size_px:
		var z := -HALF + (py + 0.5) / size_px * HALF * 2.0
		for px in size_px:
			var x := -HALF + (px + 0.5) / size_px * HALF * 2.0
			var h := height_at(x, z)
			var c: Color
			if h < WATER_LEVEL:
				var depth := clampf((WATER_LEVEL - h) / 6.0, 0.0, 1.0)
				c = Color(0.36, 0.55, 0.62).lerp(Color(0.16, 0.3, 0.42), depth)
			else:
				var forest := forest_density(x, z)
				var rock := rock_factor(x, z)
				c = Color(0.62, 0.68, 0.42)  # meadow
				c = c.lerp(Color(0.27, 0.42, 0.26), smoothstep(0.25, 0.7, forest))
				c = c.lerp(Color(0.55, 0.52, 0.47), rock * 0.75)
				if h > 22.0:
					c = c.lerp(Color(0.86, 0.86, 0.84), smoothstep(30.0, 45.0, h))
				var pf := path_factor(x, z)
				c = c.lerp(Color(0.74, 0.62, 0.42), pf * 0.85)
				if stream_factor(x, z) > 0.4:
					c = Color(0.36, 0.55, 0.62)
				var n := normal_at(x, z)
				var shade := clampf(n.dot(light_dir) * 1.25, 0.55, 1.15)
				c = Color(c.r * shade, c.g * shade, c.b * shade)
			# Parchment tint
			c = c.lerp(Color(0.86, 0.8, 0.64), 0.18)
			img.set_pixel(px, py, c)
	return img


## World (x, z) -> map UV (0..1) for the map image above.
static func world_to_map_uv(p: Vector3) -> Vector2:
	return Vector2((p.x + HALF) / (HALF * 2.0), (p.z + HALF) / (HALF * 2.0))
