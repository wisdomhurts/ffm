class_name FireSparks
extends Node3D
## Short, self-freeing celebration and camp effects:
##   FireSparks.celebrate(pos, radius)   confetti + golden sparkles + dust ring
##                                       (tent / fire upgrades)
##   FireSparks.puff(pos, size, color)   a soft puff of smoke or dust
##   FireSparks.sparks(pos, amount)      a small shower of fire sparks
## Parented under GameState.game.fx (or the given parent) and freed after
## their particles finish.

const SPARK_SHADER := "res://shaders/fire_sparks.gdshader"
const SMOKE_SHADER := "res://shaders/smoke_puff.gdshader"

static var _confetti_mat: StandardMaterial3D = null
static var _spark_mat: ShaderMaterial = null

var _life := 2.0
var _age := 0.0


static func _parent(fallback: Node) -> Node:
	if fallback and is_instance_valid(fallback):
		return fallback
	var game: Node = GameState.game
	if game and is_instance_valid(game):
		var fx := game.get("fx") as Node
		if fx:
			return fx
	return null


static func _make(pos: Vector3, life: float, parent: Node) -> FireSparks:
	var p := _parent(parent)
	if p == null:
		return null
	var n := FireSparks.new()
	n._life = life
	p.add_child(n)
	n.global_position = pos
	return n


func _process(delta: float) -> void:
	_age += delta
	if _age >= _life:
		queue_free()


func _burst(pm: ParticleProcessMaterial, mesh: Mesh, amount: int, life: float, explosive: float = 0.95) -> GPUParticles3D:
	var g := GPUParticles3D.new()
	g.process_material = pm
	g.draw_pass_1 = mesh
	g.amount = maxi(amount, 1)
	g.lifetime = life
	g.one_shot = true
	g.explosiveness = explosive
	g.local_coords = false
	g.visibility_aabb = AABB(Vector3(-6, -2, -6), Vector3(12, 10, 12))
	g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(g)
	g.emitting = true
	return g


static func _particle_mult() -> float:
	match Settings.quality():
		"low":
			return 0.5
		"medium":
			return 0.75
	return 1.0


## Confetti, sparkles and a dust ring: "Upgraded!"
static func celebrate(pos: Vector3, radius: float = 2.0, parent: Node = null) -> FireSparks:
	var n := _make(pos, 3.2, parent)
	if n == null:
		return null
	var m := _particle_mult()
	# Confetti.
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = radius * 0.5
	pm.emission_shape_offset = Vector3(0, radius * 0.5, 0)
	pm.direction = Vector3.UP
	pm.spread = 50.0
	pm.initial_velocity_min = 3.0
	pm.initial_velocity_max = 6.0
	pm.gravity = Vector3(0, -5.5, 0)
	pm.damping_min = 1.0
	pm.damping_max = 2.2
	pm.angle_min = -180.0
	pm.angle_max = 180.0
	pm.angular_velocity_min = -360.0
	pm.angular_velocity_max = 360.0
	pm.scale_min = 0.06
	pm.scale_max = 0.11
	pm.color_initial_ramp = _rainbow()
	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 0.6)
	quad.material = _confetti_material()
	n._burst(pm, quad, int(70 * m), 2.6)
	# Golden sparkles.
	var ps := ParticleProcessMaterial.new()
	ps.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	ps.emission_sphere_radius = radius
	ps.emission_shape_offset = Vector3(0, radius * 0.6, 0)
	ps.direction = Vector3.UP
	ps.spread = 180.0
	ps.initial_velocity_min = 0.3
	ps.initial_velocity_max = 1.2
	ps.gravity = Vector3(0, 0.4, 0)
	ps.scale_min = 0.05
	ps.scale_max = 0.09
	var sq := QuadMesh.new()
	sq.material = _spark_material()
	n._burst(ps, sq, int(40 * m), 1.8, 0.7)
	# Dust ring around the base.
	n._dust(Vector3.ZERO, radius, Color(0.86, 0.8, 0.7), int(16 * m))
	return n


static func puff(pos: Vector3, size: float = 1.0, color: Color = Color(0.8, 0.78, 0.75), parent: Node = null) -> FireSparks:
	var n := _make(pos, 2.4, parent)
	if n == null:
		return null
	n._dust(Vector3.ZERO, size, color, maxi(int(10 * _particle_mult()), 4))
	return n


static func sparks(pos: Vector3, amount: int = 24, parent: Node = null) -> FireSparks:
	var n := _make(pos, 1.6, parent)
	if n == null:
		return null
	var ps := ParticleProcessMaterial.new()
	ps.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	ps.emission_sphere_radius = 0.15
	ps.direction = Vector3.UP
	ps.spread = 40.0
	ps.initial_velocity_min = 1.5
	ps.initial_velocity_max = 3.5
	ps.gravity = Vector3(0, -3.0, 0)
	ps.damping_min = 0.5
	ps.damping_max = 1.0
	ps.scale_min = 0.025
	ps.scale_max = 0.05
	var sq := QuadMesh.new()
	sq.material = _spark_material()
	n._burst(ps, sq, int(float(amount) * _particle_mult()), 1.2)
	return n


func _dust(offset: Vector3, radius: float, color: Color, amount: int) -> void:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	pm.emission_ring_axis = Vector3.UP
	pm.emission_ring_radius = radius * 0.8
	pm.emission_ring_inner_radius = radius * 0.4
	pm.emission_ring_height = 0.1
	pm.emission_shape_offset = offset + Vector3(0, 0.25, 0)
	pm.direction = Vector3.UP
	pm.spread = 70.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 1.4
	pm.radial_velocity_min = 0.6
	pm.radial_velocity_max = 1.4
	pm.gravity = Vector3(0, 0.25, 0)
	pm.damping_min = 1.0
	pm.damping_max = 1.6
	pm.scale_min = 0.5 * maxf(radius * 0.5, 0.6)
	pm.scale_max = 0.9 * maxf(radius * 0.5, 0.6)
	pm.scale_curve = FireFX._curve_tex([Vector2(0.0, 0.4), Vector2(1.0, 1.0)])
	pm.color_ramp = FireFX._alpha_ramp([Vector2(0.0, 0.0), Vector2(0.1, 0.7), Vector2(1.0, 0.0)])
	var mat := ShaderMaterial.new()
	mat.shader = load(SMOKE_SHADER)
	mat.set_shader_parameter("day_color", color)
	mat.set_shader_parameter("night_color", color.darkened(0.7))
	mat.set_shader_parameter("darkness", GameState.day_cycle.darkness() * 0.8)
	mat.set_shader_parameter("density", 0.55)
	var quad := QuadMesh.new()
	quad.material = mat
	_burst(pm, quad, amount, 2.0, 0.9)


static func _confetti_material() -> StandardMaterial3D:
	if _confetti_mat == null:
		_confetti_mat = StandardMaterial3D.new()
		_confetti_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		_confetti_mat.vertex_color_use_as_albedo = true
		_confetti_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_confetti_mat.roughness = 0.5
		_confetti_mat.emission_enabled = true
		_confetti_mat.emission = Color(0.25, 0.22, 0.18)
	return _confetti_mat


static func _spark_material() -> ShaderMaterial:
	if _spark_mat == null:
		_spark_mat = ShaderMaterial.new()
		_spark_mat.shader = load(SPARK_SHADER)
		_spark_mat.set_shader_parameter("brightness", 1.3)
	return _spark_mat


static func _rainbow() -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
	g.colors = PackedColorArray([Color("#ffcf4a"), Color("#ff7b54"), Color("#ff5d8f"), Color("#7ec4ff"), Color("#8be08a"), Color("#ffcf4a")])
	var t := GradientTexture1D.new()
	t.gradient = g
	return t
