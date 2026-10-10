class_name Water
extends Node3D
## Moonmirror Lake and the stream.
## - Lake: one large water plane at WorldGen.WATER_LEVEL from just east of the
##   lake out past the far shore ~1.6 km west (shaders/water.gdshader: depth
##   colour, refraction, shoreline foam, waves, fresnel + screen-space
##   reflections, sun/moon glints).
## - Stream: a flowing ribbon along WorldGen.stream at the stream's water
##   height (shaders/water_stream.gdshader) with looping "stream" audio
##   emitters along it.
## The Compatibility renderer (browser/phones) gets shaders/water_simple.gdshader.

const LAKE_EAST := -30.0
const LAKE_WEST := -1950.0
const LAKE_HALF_NS := 1700.0
## Screen-space reflection march steps per quality.
const SSR_STEPS := {"low": 0, "medium": 14, "high": 24}

var gen: WorldGen
var lake: MeshInstance3D
var stream_ribbon: MeshInstance3D
var lake_material: ShaderMaterial
var stream_material: ShaderMaterial
var emitters: Array[Node3D] = []
var _compat := false


func setup(_game: Game, terrain: Terrain) -> void:
	if terrain != null:
		gen = terrain.gen
	if gen == null:
		gen = GameState.world_gen
	if gen == null:
		return
	_compat = RenderingServer.get_current_rendering_method() == "gl_compatibility"
	_make_materials(Terrain.noise_textures())
	_build_lake()
	_build_stream()
	_place_emitters()


func _exit_tree() -> void:
	for e in emitters:
		if is_instance_valid(e):
			Audio.stop_loop("stream", e)


func apply_quality(q: String) -> void:
	if lake_material and not _compat:
		lake_material.set_shader_parameter("ssr_steps", int(SSR_STEPS.get(q, 24)))


func _make_materials(tex: Array) -> void:
	lake_material = ShaderMaterial.new()
	stream_material = ShaderMaterial.new()
	if _compat:
		var simple := load("res://shaders/water_simple.gdshader") as Shader
		lake_material.shader = simple
		stream_material.shader = simple
		stream_material.set_shader_parameter("flow", true)
	else:
		lake_material.shader = load("res://shaders/water.gdshader") as Shader
		stream_material.shader = load("res://shaders/water_stream.gdshader") as Shader
	for m: ShaderMaterial in [lake_material, stream_material]:
		m.set_shader_parameter("normal_tex", tex[1])
		m.set_shader_parameter("noise_tex", tex[0])
	# Transparent sort order: the lake first, then the stream over it at the
	# mouth, then everything else (particles, fireflies...).
	lake_material.render_priority = -2
	stream_material.render_priority = -1


func _build_lake() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(LAKE_EAST - LAKE_WEST, LAKE_HALF_NS * 2.0)
	pm.subdivide_width = 3
	pm.subdivide_depth = 3
	lake = MeshInstance3D.new()
	lake.name = "Lake"
	lake.mesh = pm
	lake.material_override = lake_material
	lake.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lake.position = Vector3((LAKE_EAST + LAKE_WEST) * 0.5, WorldGen.WATER_LEVEL, 0.0)
	add_child(lake)


## Index of the last stream point the ribbon covers (a little into the lake).
func _ribbon_end() -> int:
	var pts := gen.stream
	for i in pts.size():
		if gen.lake_mask(pts[i].x, pts[i].y) > 0.35:
			return mini(i + 2, pts.size() - 1)
	return pts.size() - 1


func _build_stream() -> void:
	var pts := gen.stream
	var n := pts.size()
	if n < 2:
		return
	var last := _ribbon_end()
	var across := 4
	var row := across + 1
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var cols := PackedColorArray()
	var idx := PackedInt32Array()
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for i in last + 1:
		lo = Vector2(minf(lo.x, pts[i].x), minf(lo.y, pts[i].y))
		hi = Vector2(maxf(hi.x, pts[i].x), maxf(hi.y, pts[i].y))
	var mid := (lo + hi) * 0.5
	var origin := Vector3(mid.x, 0.0, mid.y)
	# The waterline sits halfway up the linear banks; reach a little past it
	# so the ribbon's edges tuck under the banks.
	var edge := WorldGen.STREAM_BED + (gen.stream_width - WorldGen.STREAM_BED) * WorldGen.STREAM_SURFACE_DROP / gen.stream_depth
	var half := edge + 0.55
	var along := 0.0
	var total := 0.0
	for i in last:
		total += pts[i].distance_to(pts[i + 1])
	for i in last + 1:
		var p := pts[i]
		var tdir := (pts[mini(i + 1, n - 1)] - pts[maxi(i - 1, 0)]).normalized()
		var side := Vector2(-tdir.y, tdir.x)
		if i > 0:
			along += p.distance_to(pts[i - 1])
		var y := maxf(gen.stream_surface_at_index(i), WorldGen.WATER_LEVEL + 0.04)
		var ia := maxi(i - 2, 0)
		var ib := mini(i + 2, n - 1)
		var drop := gen.stream_surface_at_index(ia) - gen.stream_surface_at_index(ib)
		var steep := clampf(drop / maxf(pts[ia].distance_to(pts[ib]), 0.5) * 5.0, 0.0, 1.0)
		var alpha := smoothstep(0.0, 5.0, along) * (1.0 - smoothstep(total - 7.0, total, along))
		var w := half * lerpf(0.55, 1.0, smoothstep(0.0, 30.0, along))
		for k in row:
			var u := float(k) / across
			var off := side * (u - 0.5) * 2.0 * w
			verts.append(Vector3(p.x + off.x - origin.x, y, p.y + off.y - origin.z))
			norms.append(Vector3.UP)
			uvs.append(Vector2(u, along))
			cols.append(Color(steep, 0.0, 0.0, alpha))
	for i in last:
		for k in across:
			var v00 := i * row + k
			var v10 := v00 + 1
			var v01 := v00 + row
			var v11 := v01 + 1
			idx.append_array(PackedInt32Array([v00, v01, v11, v00, v11, v10]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	stream_ribbon = MeshInstance3D.new()
	stream_ribbon.name = "Stream"
	stream_ribbon.mesh = mesh
	stream_ribbon.material_override = stream_material
	stream_ribbon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	stream_ribbon.position = origin
	add_child(stream_ribbon)


## Looping "stream" sounds at a few points along the water.
func _place_emitters() -> void:
	var pts := gen.stream
	if pts.size() < 4:
		return
	var last := _ribbon_end()
	for f in [0.12, 0.42, 0.72, 0.93]:
		var i := clampi(int(f * last), 0, pts.size() - 1)
		var e := Node3D.new()
		e.name = "StreamSound%d" % emitters.size()
		add_child(e)
		e.global_position = Vector3(pts[i].x, gen.stream_surface_at_index(i) + 0.3, pts[i].y)
		emitters.append(e)
		Audio.start_loop("stream", e)
