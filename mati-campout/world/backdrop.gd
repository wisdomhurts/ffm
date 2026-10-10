class_name Backdrop
extends Node3D
## The world beyond the map: three layered mountain ranges ringing the north,
## east and south (650-1700 m out, snow-capped further back), low hills behind
## the far shore of the lake in the west, and forest silhouettes (instanced
## low-poly firs) on the outer ring and the far shore.
##
## Cheap by design: 3 mountain meshes, <= 16 MultiMesh chunks, no shadows.
## Far materials use their own distance haze (engine fog disabled) so the
## ranges stay readable and layered; every frame the haze colour/density are
## matched to the active Environment's fog (or a time-of-day palette when fog
## is off). Other far materials can join via add_haze_material().

## r: ridge radius, depth: half-width of the range, h / hv: mean peak height
## and variation, massif: number of big mountain masses around a full circle.
const LAYERS := [
	{"r": 730.0, "depth": 200.0, "h": 115.0, "hv": 55.0, "massif": 22.0, "seed": 11, "west_cut": true,
		"snow": 330.0, "trees": 175.0, "haze": 0.0, "steps": 420},
	{"r": 1090.0, "depth": 300.0, "h": 235.0, "hv": 95.0, "massif": 17.0, "seed": 23, "west_cut": true,
		"snow": 255.0, "trees": 150.0, "haze": 0.08, "steps": 480},
	{"r": 1560.0, "depth": 360.0, "h": 360.0, "hv": 140.0, "massif": 14.0, "seed": 37, "west_cut": false,
		"snow": 275.0, "trees": 160.0, "haze": 0.16, "steps": 600},
]
## Azimuth (from +X toward +Z) beyond which the inner ranges stop (the lake).
const WEST_CUT_DEG := 118.0
## Share of forest silhouettes shown per quality.
const TREE_SHARE := {"low": 0.35, "medium": 0.65, "high": 1.0}

var gen: WorldGen
var mountains: Array[MeshInstance3D] = []
var tree_chunks: Array[MultiMeshInstance3D] = []
var _tree_counts: Array[int] = []
var _haze_mats: Array[ShaderMaterial] = []
var _haze_t := 1.0


func setup(_game: Game, terrain: Terrain) -> void:
	if terrain != null:
		gen = terrain.gen
	if gen == null:
		gen = GameState.world_gen
	if gen == null:
		return
	var tex := Terrain.noise_textures()
	for i in LAYERS.size():
		_build_layer(LAYERS[i], i, tex[0])
		await get_tree().process_frame
		if not is_inside_tree():
			return
	_build_forest()
	_update_haze()


func add_haze_material(m: ShaderMaterial) -> void:
	if m != null and not _haze_mats.has(m):
		_haze_mats.append(m)
		_update_haze()


func apply_quality(q: String) -> void:
	var share: float = TREE_SHARE.get(q, 1.0)
	for i in tree_chunks.size():
		var mm := tree_chunks[i].multimesh
		if mm:
			mm.visible_instance_count = int(_tree_counts[i] * share)


func _process(delta: float) -> void:
	_haze_t += delta
	if _haze_t >= 0.1:
		_haze_t = 0.0
		_update_haze()


# --- Haze ---------------------------------------------------------------------------------

## Match the far haze to the current fog (colour, density, sun scatter).
func _update_haze() -> void:
	if _haze_mats.is_empty() or not is_inside_tree():
		return
	var env: Environment = null
	var w3d := get_world_3d()
	if w3d:
		env = w3d.environment
	var col := Color(0.62, 0.70, 0.80)
	var dens := 0.0009
	var energy := 1.0
	var hmax := 0.8
	var dark := 0.0
	if GameState.day_cycle:
		dark = GameState.day_cycle.darkness()
	if env != null and env.fog_enabled:
		col = env.fog_light_color
		energy = env.fog_light_energy
		dens = clampf(env.fog_density * 0.55, 0.00035, 0.0032)
	else:
		var hour := GameState.day_cycle.hour() if GameState.day_cycle else 12.0
		var golden := smoothstep(16.0, 18.3, hour) * (1.0 - smoothstep(19.2, 20.0, hour))
		golden = maxf(golden, smoothstep(5.0, 6.2, hour) * (1.0 - smoothstep(7.0, 8.0, hour)))
		col = Color(0.64, 0.72, 0.82).lerp(Color(0.86, 0.66, 0.55), golden).lerp(Color(0.07, 0.09, 0.18), dark)
	hmax = lerpf(0.78, 0.9, dark)
	var sun_dir := Vector3(0.0, 0.5, 0.8)
	var scatter := Color(0, 0, 0)
	var envc: Node = GameState.environment
	if envc != null and is_instance_valid(envc):
		var sun: Variant = envc.get("sun")
		if sun is DirectionalLight3D and (sun as DirectionalLight3D).visible:
			var s := sun as DirectionalLight3D
			sun_dir = s.global_transform.basis.z.normalized()
			var k := (env.fog_sun_scatter if env != null and env.fog_enabled else 0.3) * clampf(s.light_energy, 0.0, 2.0)
			scatter = s.light_color * k * 0.6
	for m in _haze_mats:
		m.set_shader_parameter("haze_color", col)
		m.set_shader_parameter("haze_density", dens)
		m.set_shader_parameter("haze_energy", energy)
		m.set_shader_parameter("haze_max", hmax)
		m.set_shader_parameter("sun_dir", sun_dir)
		m.set_shader_parameter("sun_scatter", scatter)


# --- Mountains ------------------------------------------------------------------------------

func _build_layer(spec: Dictionary, li: int, noise_tex: Texture2D) -> void:
	# Big smooth massifs + finer ridged sub-peaks along the range.
	var n_mass := FastNoiseLite.new()
	n_mass.seed = gen.seed + int(spec["seed"])
	n_mass.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n_mass.fractal_type = FastNoiseLite.FRACTAL_FBM
	n_mass.fractal_octaves = 2
	n_mass.frequency = 1.0
	var n_ridge := FastNoiseLite.new()
	n_ridge.seed = gen.seed + int(spec["seed"]) + 3
	n_ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	n_ridge.fractal_octaves = 3
	n_ridge.frequency = 1.0
	var n_line := FastNoiseLite.new()
	n_line.seed = gen.seed + int(spec["seed"]) + 5
	n_line.frequency = 1.0
	n_line.fractal_octaves = 2
	var n_face := FastNoiseLite.new()
	n_face.seed = gen.seed + int(spec["seed"]) + 9
	n_face.frequency = 0.005
	n_face.fractal_octaves = 3
	var r0: float = spec["r"]
	var depth: float = spec["depth"]
	var west_cut: bool = spec["west_cut"]
	var steps: int = spec["steps"]
	var rad_m: float = float(spec["massif"]) / TAU
	var rows := 10
	var a0 := -PI
	var a1 := PI
	if west_cut:
		a0 = -deg_to_rad(WEST_CUT_DEG)
		a1 = deg_to_rad(WEST_CUT_DEG)
	var closed := not west_cut
	var cols := steps if closed else steps + 1
	var pos := PackedVector3Array()
	pos.resize(rows * cols)
	for s in cols:
		var t := float(s) / float(steps)
		var a := lerpf(a0, a1, t)
		var westness := -cos(a)
		var w := 1.0
		if west_cut:
			# Taper the ends of the arc into the hills.
			w = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t)
		else:
			w = lerpf(1.0, 0.32, smoothstep(0.35, 0.8, westness))
		var ca := cos(a)
		var sa := sin(a)
		var ridge_r := r0 + n_line.get_noise_2d(ca * rad_m * 0.8, sa * rad_m * 0.8) * depth * 0.3
		var mass := n_mass.get_noise_2d(ca * rad_m + float(li) * 31.0, sa * rad_m)
		var sub := n_ridge.get_noise_2d(ca * rad_m * 4.0, sa * rad_m * 4.0 + float(li) * 13.0)
		var hh: float = spec["h"]
		var peak: float = (hh + float(spec["hv"]) * mass * 1.5 + hh * 0.06 * sub) * w
		for k in rows:
			var tk := float(k) / float(rows - 1)
			var rr := r0 - depth + tk * depth * 2.0
			var x := ca * rr
			var z := sa * rr
			var cross := clampf(1.0 - absf(rr - ridge_r) / (depth * 1.02), 0.0, 1.0)
			var prof := pow(cross, 1.5) * (1.25 - 0.25 * cross)
			var base := gen.outer_height(x, z) - 16.0
			var face := n_face.get_noise_2d(x, z) * maxf(peak, 0.0) * 0.16
			pos[k * cols + s] = Vector3(x, base + prof * (maxf(peak, 0.0) + face + 16.0 * minf(prof * 4.0, 1.0)), z)
	var nrm := PackedVector3Array()
	nrm.resize(pos.size())
	for k in rows:
		for s in cols:
			var sl := s - 1
			var sr := s + 1
			if closed:
				sl = posmod(sl, cols)
				sr = posmod(sr, cols)
			else:
				sl = maxi(sl, 0)
				sr = mini(sr, cols - 1)
			var ka := maxi(k - 1, 0)
			var kb := mini(k + 1, rows - 1)
			var da := pos[k * cols + sr] - pos[k * cols + sl]
			var dr := pos[kb * cols + s] - pos[ka * cols + s]
			var nn := da.cross(dr).normalized()
			if nn.y < 0.0:
				nn = -nn
			nrm[k * cols + s] = nn
	var idx := PackedInt32Array()
	var quads := cols if closed else cols - 1
	for k in rows - 1:
		for s in quads:
			var s2 := (s + 1) % cols
			var v00 := k * cols + s
			var v01 := k * cols + s2
			var v10 := (k + 1) * cols + s
			var v11 := (k + 1) * cols + s2
			_tri(idx, pos, v00, v10, v01)
			_tri(idx, pos, v10, v11, v01)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/backdrop.gdshader") as Shader
	mat.set_shader_parameter("noise_tex", noise_tex)
	mat.set_shader_parameter("layer_haze", float(spec["haze"]))
	mat.set_shader_parameter("snow_line", float(spec["snow"]))
	mat.set_shader_parameter("tree_line", float(spec["trees"]))
	var mi := MeshInstance3D.new()
	mi.name = "Range%d" % li
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mountains.append(mi)
	_haze_mats.append(mat)


## Append a triangle wound so its front face looks up/outward.
static func _tri(idx: PackedInt32Array, pos: PackedVector3Array, a: int, b: int, c: int) -> void:
	var n := (pos[b] - pos[a]).cross(pos[c] - pos[a])
	if n.y > 0.0:
		idx.append(a)
		idx.append(c)
		idx.append(b)
	else:
		idx.append(a)
		idx.append(b)
		idx.append(c)


# --- Forest silhouettes ------------------------------------------------------------------------

## A low-poly fir: a short trunk and `tiers` stacked, slightly drooping cones
## whose rims zig-zag (alternating radius) for a ragged needle silhouette;
## ~13 m tall.
static func fir_mesh(tiers: int, sides: int) -> ArrayMesh:
	var specs := [[0.9, 2.9, 6.6], [3.9, 2.25, 9.7], [6.9, 1.55, 13.0]] if tiers >= 3 else [[0.8, 2.8, 7.4], [5.0, 1.9, 12.8]]
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var idx := PackedInt32Array()
	var dark := Color(0.07, 0.13, 0.085)
	var light := Color(0.18, 0.26, 0.145)
	var bark := Color(0.22, 0.16, 0.11)
	# Trunk: a 3-sided post from below the ground into the first tier.
	var tb := verts.size()
	for s in 3:
		var a := TAU * float(s) / 3.0
		var d := Vector3(cos(a), 0.0, sin(a))
		for y: float in [-0.8, 2.2]:
			verts.append(d * 0.3 + Vector3(0.0, y, 0.0))
			norms.append(d)
			cols.append(bark)
	for s in 3:
		var a0 := tb + s * 2
		var a1 := tb + ((s + 1) % 3) * 2
		idx.append_array(PackedInt32Array([a0, a1 + 1, a0 + 1, a0, a1, a1 + 1]))
	for ti in specs.size():
		var sp: Array = specs[ti]
		var by: float = sp[0]
		var r: float = sp[1]
		var top: float = sp[2]
		var apex := verts.size()
		verts.append(Vector3(0.0, top, 0.0))
		norms.append(Vector3.UP)
		cols.append(light.lerp(Color(0.24, 0.32, 0.18), float(ti) / specs.size()))
		var ring := verts.size()
		for s in sides:
			var a := TAU * float(s) / sides + float(ti) * 0.4
			var d := Vector3(cos(a), 0.0, sin(a))
			var rr := r * (1.0 if s % 2 == 0 else 0.74)
			var droop := -0.35 if s % 2 == 0 else 0.0
			verts.append(d * rr + Vector3(0.0, by + droop, 0.0))
			norms.append((d + Vector3(0.0, 0.6, 0.0)).normalized())
			cols.append(dark.lerp(light, 0.22 * float(ti)))
		for s in sides:
			var s2 := (s + 1) % sides
			# Clockwise seen from outside.
			idx.append(apex)
			idx.append(ring + s)
			idx.append(ring + s2)
		# Underside of the lowest tier (seen from below on slopes); the upper
		# tiers' undersides are hidden by the tier beneath.
		if ti > 0:
			continue
		var center := verts.size()
		verts.append(Vector3(0.0, by + 0.3, 0.0))
		norms.append(Vector3.DOWN)
		cols.append(dark * 0.6)
		for s in sides:
			var s2 := (s + 1) % sides
			idx.append(center)
			idx.append(ring + s2)
			idx.append(ring + s)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


func _build_forest() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = gen.seed + 4101
	var clump := FastNoiseLite.new()
	clump.seed = gen.seed + 4102
	clump.frequency = 0.012
	clump.fractal_octaves = 2
	var wl := WorldGen.WATER_LEVEL
	var cut := cos(deg_to_rad(WEST_CUT_DEG))
	# sector -> Array of [Transform3D, Color]
	var near_sets: Array = []
	var far_sets: Array = []
	for i in 8:
		near_sets.append([])
		far_sets.append([])
	# Near ring: the map edge out to where the first range begins.
	var sp := 13.0
	var lim := 700.0
	var x := -lim
	while x <= lim:
		var z := -lim
		while z <= lim:
			var px := x + rng.randf_range(-5.0, 5.0)
			var pz := z + rng.randf_range(-5.0, 5.0)
			z += sp
			# Start just past the map edge: right at it on top of the high walls
			# (they form the skyline seen from below), a little further out on
			# low ground where the player could walk up close.
			if absf(px) < WorldGen.HALF + 1.0 and absf(pz) < WorldGen.HALF + 1.0:
				continue
			if absf(px) < WorldGen.HALF + 16.0 and absf(pz) < WorldGen.HALF + 16.0 and gen.outer_height(px, pz) < 18.0:
				continue
			var r := Vector2(px, pz).length()
			var ca := px / maxf(r, 0.001)
			if ca > cut and r > 560.0:
				continue  # inside the first mountain range
			if clump.get_noise_2d(px, pz) < -0.3:
				continue
			_try_tree(near_sets, rng, px, pz, wl, 0.8, 1.35, false)
		x += sp
	# Far: west of the map (lake flanks and the far shore) beyond the near ring.
	sp = 21.0
	x = -1720.0
	while x <= -300.0:
		var z := -1500.0
		while z <= 1500.0:
			var px := x + rng.randf_range(-8.0, 8.0)
			var pz := z + rng.randf_range(-8.0, 8.0)
			z += sp
			if absf(px) <= lim and absf(pz) <= lim:
				continue
			if px / Vector2(px, pz).length() > cut:
				continue  # mountain sectors: the ranges cover this ground
			if clump.get_noise_2d(px, pz) < -0.35:
				continue
			_try_tree(far_sets, rng, px, pz, wl, 1.5, 2.3, true)
		x += sp
	var near_mat := ShaderMaterial.new()
	near_mat.shader = load("res://shaders/backdrop_trees.gdshader") as Shader
	var far_mat := ShaderMaterial.new()
	far_mat.shader = load("res://shaders/backdrop_trees_far.gdshader") as Shader
	_haze_mats.append(far_mat)
	var near_mesh := fir_mesh(3, 8)
	var far_mesh := fir_mesh(2, 6)
	for i in 8:
		_add_tree_chunk(near_sets[i], near_mesh, near_mat, rng, "Firs%d" % i)
		_add_tree_chunk(far_sets[i], far_mesh, far_mat, rng, "FarFirs%d" % i)


func _try_tree(sets: Array, rng: RandomNumberGenerator, px: float, pz: float, wl: float, s0: float, s1: float, far: bool) -> void:
	var h := gen.outer_height(px, pz)
	if h < wl + 1.6:
		return
	var hx := gen.outer_height(px + 6.0, pz)
	var hz := gen.outer_height(px, pz + 6.0)
	var slope := Vector2(hx - h, hz - h).length() / 6.0
	if slope > 0.9:
		return
	if not far and gen.meadow_factor(px, pz) > 0.6:
		return
	var s := rng.randf_range(s0, s1)
	var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s * rng.randf_range(0.85, 1.1), s, s * rng.randf_range(0.85, 1.1)))
	var xf := Transform3D(basis, Vector3(px, h - 0.6, pz))
	var sector := clampi(int((atan2(pz, px) + PI) / TAU * 8.0), 0, 7)
	(sets[sector] as Array).append([xf, Color(rng.randf_range(0.3, 0.7), rng.randf(), 0.0, 0.0)])


func _add_tree_chunk(items: Array, mesh: Mesh, mat: Material, rng: RandomNumberGenerator, nm: String) -> void:
	if items.is_empty():
		return
	# Shuffle so a lower quality share thins evenly instead of cutting areas.
	for i in range(items.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp: Variant = items[i]
		items[i] = items[j]
		items[j] = tmp
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = items.size()
	for i in items.size():
		var it: Array = items[i]
		mm.set_instance_transform(i, it[0])
		mm.set_instance_custom_data(i, it[1])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = nm
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	tree_chunks.append(mmi)
	_tree_counts.append(items.size())
