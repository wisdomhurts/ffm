class_name SafeGlow
extends MeshInstance3D
## Compatibility renderer (browsers, phones) stand-in for two Forward+-only
## camp effects: the night camp haze (a FogVolume, see EnvironmentController)
## and the safe-ring Decal (the Compatibility renderer does not draw decals).
## A soft additive pool of firelight draped on the ground with a glowing band
## at the edge of the safe circle: sized by GameState.fire.light_radius(),
## it fades in at dusk, shrinks with the fire and is gone when the fire is out.
## Added by Campfire (as a child, at the fire) only under Compatibility.
## Cost: one unshaded draw call (~5k triangles), no shadows.

const SHADER := "res://shaders/safe_glow.gdshader"
## Mesh reach (m): the level 3 fire's 23 m light radius plus the band halo.
const MAX_RADIUS := 26.5
const RINGS := 40
const SEGMENTS := 64
## Height above the ground (m): keeps the disc above the terrain triangles.
const LIFT := 0.08
## Look: wash strength at the fire, edge band strength (scaled by night).
const POOL := 0.14
const RING := 0.6

var _mat: ShaderMaterial
var _radius := 14.0
var _t := 0.0
var _built_at := Vector3.INF


func _ready() -> void:
	name = "SafeGlow"
	# World-aligned (the fire pit may be turned): follows the parent's position only.
	top_level = true
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_mat = ShaderMaterial.new()
	_mat.shader = load(SHADER) as Shader
	material_override = _mat
	visible = false
	_radius = maxf(GameState.fire.light_radius(), 1.0)


func _process(delta: float) -> void:
	var fire := GameState.fire
	var lit := fire.is_lit()
	_radius = lerpf(_radius, fire.light_radius() if lit else 0.0, clampf(delta * 1.5, 0.0, 1.0))
	var vis := fire.strength()
	var night := smoothstep(0.2, 0.75, GameState.day_cycle.darkness())
	var a := night * clampf(vis * 1.6, 0.0, 1.0)
	visible = lit and a > 0.01 and _radius > 1.0
	if not visible:
		return
	var host := get_parent() as Node3D
	if host != null:
		global_position = host.global_position
	if global_position.distance_to(_built_at) > 0.5:
		_rebuild()
	_t += delta
	var pulse := 0.85 + 0.15 * sin(_t * 1.6)
	_mat.set_shader_parameter("radius", _radius)
	_mat.set_shader_parameter("pool", a * POOL * (0.6 + 0.4 * vis))
	_mat.set_shader_parameter("ring", a * RING * pulse)


## A polar grid around the fire whose vertices sit LIFT above the terrain.
func _rebuild() -> void:
	_built_at = global_position
	var gen := GameState.world_gen
	var o := global_position
	var verts := PackedVector3Array()
	var idx := PackedInt32Array()
	var y0 := (gen.height_at(o.x, o.z) if gen != null else o.y) - o.y + LIFT
	verts.append(Vector3(0.0, y0, 0.0))
	for r in range(1, RINGS + 1):
		var rad := MAX_RADIUS * float(r) / RINGS
		for s in SEGMENTS:
			var ang := TAU * float(s) / SEGMENTS
			var x := cos(ang) * rad
			var z := sin(ang) * rad
			var y := (gen.height_at(o.x + x, o.z + z) if gen != null else o.y) - o.y + LIFT
			verts.append(Vector3(x, y, z))
	for s in SEGMENTS:
		idx.append_array(PackedInt32Array([0, 1 + (s + 1) % SEGMENTS, 1 + s]))
	for r in range(1, RINGS):
		var a0 := 1 + (r - 1) * SEGMENTS
		var b0 := 1 + r * SEGMENTS
		for s in SEGMENTS:
			var s1 := (s + 1) % SEGMENTS
			idx.append_array(PackedInt32Array([a0 + s, a0 + s1, b0 + s1, a0 + s, b0 + s1, b0 + s]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh = m
