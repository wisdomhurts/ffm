class_name TerrainMasks
extends RefCounted
## Per-grid-point surface data for the terrain mesh, shader and painted map,
## computed once per world on WorldGen's 2 m height grid:
## smooth normals, cavity (baked AO) and the masks the terrain shader paints
## from (path, forest floor, meadow, camp ground, rock, sand, wet soil).
##
## Build in phases (`build_phase(i)` for i in PHASES) so the caller can yield
## between them and keep the loading screen responsive.

const G := WorldGen.GRID
const CELL := WorldGen.CELL
const HALF := WorldGen.HALF
## Coarse grid (every 2nd point = 4 m) for the slow, smooth fields.
const CG := ((WorldGen.GRID - 1) >> 1) + 1
const PHASES := 4

var gen: WorldGen
var normals := PackedVector3Array()
var cavity := PackedFloat32Array()
var path_dist := PackedFloat32Array()
var stream_dist := PackedFloat32Array()
var path := PackedFloat32Array()
var forest := PackedFloat32Array()
var meadow := PackedFloat32Array()
var camp := PackedFloat32Array()
var rock := PackedFloat32Array()
var sand := PackedFloat32Array()
var wet := PackedFloat32Array()
# Coarse (4 m) fields.
var _c_forest := PackedFloat32Array()
var _c_meadow := PackedFloat32Array()
var _c_clear := PackedFloat32Array()
var _c_lake := PackedFloat32Array()


func _init(p_gen: WorldGen) -> void:
	gen = p_gen


func build_all() -> void:
	for i in PHASES:
		build_phase(i)


func build_phase(i: int) -> void:
	match i:
		0:
			_build_normals()
		1:
			_build_distances()
		2:
			_build_coarse()
		3:
			_compose()


static func idx(ix: int, iz: int) -> int:
	return clampi(iz, 0, G - 1) * G + clampi(ix, 0, G - 1)


## Grid point nearest to a world position.
static func grid_of(x: float, z: float) -> Vector2i:
	return Vector2i(clampi(roundi((x + HALF) / CELL), 0, G - 1), clampi(roundi((z + HALF) / CELL), 0, G - 1))


func _build_normals() -> void:
	var h := gen.heights
	normals.resize(G * G)
	cavity.resize(G * G)
	for iz in G:
		var zu := mini(iz + 1, G - 1) * G
		var zd := maxi(iz - 1, 0) * G
		var z2u := mini(iz + 2, G - 1) * G
		var z2d := maxi(iz - 2, 0) * G
		var row := iz * G
		for ix in G:
			var xl := maxi(ix - 1, 0)
			var xr := mini(ix + 1, G - 1)
			var n := Vector3(h[row + xl] - h[row + xr], 2.0 * CELL, h[zd + ix] - h[zu + ix]).normalized()
			normals[row + ix] = n
			# Cavity: how far this point sits below its 4 m neighbourhood.
			var x2l := maxi(ix - 2, 0)
			var x2r := mini(ix + 2, G - 1)
			var avg := (h[row + x2l] + h[row + x2r] + h[z2d + ix] + h[z2u + ix]
				+ h[z2d + x2l] + h[z2d + x2r] + h[z2u + x2l] + h[z2u + x2r]) * 0.125
			cavity[row + ix] = 1.0 - clampf((avg - h[row + ix]) * 0.55, 0.0, 0.75)


## Distance rasters to trails and the stream (stamped around each segment).
func _build_distances() -> void:
	path_dist = _stamp_polylines(gen.paths, 4.0)
	stream_dist = _stamp_polylines([gen.stream], 13.0)


func _stamp_polylines(polys: Array, radius: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(G * G)
	out.fill(radius + 1.0)
	for poly in polys:
		var pl: PackedVector2Array = poly
		for s in pl.size() - 1:
			var a := pl[s]
			var b := pl[s + 1]
			var ab := b - a
			var inv := 1.0 / maxf(ab.length_squared(), 0.0001)
			var x0 := clampi(int(floor((minf(a.x, b.x) - radius + HALF) / CELL)), 0, G - 1)
			var x1 := clampi(int(ceil((maxf(a.x, b.x) + radius + HALF) / CELL)), 0, G - 1)
			var z0 := clampi(int(floor((minf(a.y, b.y) - radius + HALF) / CELL)), 0, G - 1)
			var z1 := clampi(int(ceil((maxf(a.y, b.y) + radius + HALF) / CELL)), 0, G - 1)
			for iz in range(z0, z1 + 1):
				var pz := -HALF + iz * CELL
				var row := iz * G
				for ix in range(x0, x1 + 1):
					var p := Vector2(-HALF + ix * CELL, pz)
					var t := clampf((p - a).dot(ab) * inv, 0.0, 1.0)
					var d := p.distance_to(a + ab * t)
					if d < out[row + ix]:
						out[row + ix] = d
	return out


func _build_coarse() -> void:
	var n := CG * CG
	_c_forest.resize(n)
	_c_meadow.resize(n)
	_c_clear.resize(n)
	_c_lake.resize(n)
	for cz in CG:
		var z := -HALF + cz * CELL * 2.0
		for cx in CG:
			var x := -HALF + cx * CELL * 2.0
			var i := cz * CG + cx
			_c_forest[i] = gen.forest_density(x, z)
			_c_meadow[i] = gen.meadow_factor(x, z)
			_c_clear[i] = gen.clearing_factor(x, z)
			_c_lake[i] = gen.lake_mask(x, z)


## Bilinear sample of a coarse field at fine grid point (ix, iz).
func _coarse(arr: PackedFloat32Array, ix: int, iz: int) -> float:
	var cx := ix >> 1
	var cz := iz >> 1
	var fx := ix & 1
	var fz := iz & 1
	var i := cz * CG + cx
	if fx == 0 and fz == 0:
		return arr[i]
	var cx1 := mini(cx + 1, CG - 1) - cx
	var cz1 := (mini(cz + 1, CG - 1) - cz) * CG
	if fz == 0:
		return (arr[i] + arr[i + cx1]) * 0.5
	if fx == 0:
		return (arr[i] + arr[i + cz1]) * 0.5
	return (arr[i] + arr[i + cx1] + arr[i + cz1] + arr[i + cz1 + cx1]) * 0.25


func _compose() -> void:
	var n := G * G
	path.resize(n)
	forest.resize(n)
	meadow.resize(n)
	camp.resize(n)
	rock.resize(n)
	sand.resize(n)
	wet.resize(n)
	var wl := WorldGen.WATER_LEVEL
	var ridge_a := Vector2(40, -195)
	var ridge_b := Vector2(175, -140)
	var lh: Vector3 = gen.landmarks["lighthouse"]["pos"] if gen.landmarks.has("lighthouse") else Vector3(-212, 0, -78)
	var lh2 := Vector2(lh.x, lh.z)
	for iz in G:
		var z := -HALF + iz * CELL
		var row := iz * G
		for ix in G:
			var i := row + ix
			var x := -HALF + ix * CELL
			var h := gen.heights[i]
			var slope := 1.0 - normals[i].y
			var p2 := Vector2(x, z)
			var r := p2.length()
			path[i] = smoothstep(3.0, 0.35, path_dist[i])
			var lake := _coarse(_c_lake, ix, iz)
			var clear := _coarse(_c_clear, ix, iz)
			# Home camp: packed earth near the fire, trampled grass to ~17 m.
			var c := smoothstep(12.5, 2.0, r)
			if r > 26.0:
				c = clear * 0.62
			camp[i] = c
			forest[i] = _coarse(_c_forest, ix, iz)
			meadow[i] = _coarse(_c_meadow, ix, iz)
			# Rock: steep slopes, patches along the Rocky Ridge and the headland.
			var rk := smoothstep(0.2, 0.45, slope)
			var rd := WorldGen._dist_to_segment(p2, ridge_a, ridge_b)
			rk = maxf(rk, smoothstep(75.0, 22.0, rd) * 0.26 + smoothstep(0.09, 0.22, slope) * smoothstep(75.0, 30.0, rd) * 0.32)
			rk = maxf(rk, smoothstep(34.0, 12.0, p2.distance_to(lh2)) * 0.4 * smoothstep(wl + 0.6, wl + 1.8, h))
			rock[i] = clampf(rk * (1.0 - c), 0.0, 1.0)
			# Beaches: gentle ground just above the lake.
			var near_lake := smoothstep(0.0, 0.06, lake)
			var sd := smoothstep(wl + 2.3, wl + 0.9, h) * near_lake * (1.0 - smoothstep(0.22, 0.4, slope))
			sand[i] = sd
			# Wet soil: lake margins and stream banks.
			var sw := smoothstep(7.5, 2.4, stream_dist[i])
			var lw := smoothstep(wl + 3.2, wl + 0.6, h) * near_lake
			wet[i] = maxf(sw, lw * (1.0 - sd * 0.5))
