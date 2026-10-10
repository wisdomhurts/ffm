class_name ShadowPuff
extends Node3D
## One-shot puff of violet shadow smoke with a few glowing motes. This is the
## kid-friendly "hit" and "defeated" feedback for shadow creatures (never gore):
## a small puff on every hit, a big one when a creature dissolves.
##
##   ShadowPuff.spawn(world_pos, size)   # size ~0.5 hit .. 1.5 defeat
## Parented under GameState.game.fx; frees itself when finished.

const WISP_SHADER: Shader = preload("res://shaders/shadow_creature_wisp.gdshader")
const SPARK_SHADER: Shader = preload("res://shaders/shadow_creature_spark.gdshader")

static var _smoke_mesh: QuadMesh = null
static var _spark_mesh: QuadMesh = null

var size := 1.0
var _life := 2.0


static func spawn(pos: Vector3, p_size: float = 1.0, parent: Node = null) -> ShadowPuff:
	if parent == null and GameState.game != null:
		var fx: Variant = GameState.game.get("fx")
		if fx is Node:
			parent = fx
	if parent == null or not parent.is_inside_tree():
		return null
	var p := ShadowPuff.new()
	p.name = "ShadowPuff"
	p.size = clampf(p_size, 0.2, 3.0)
	parent.add_child(p)
	p.global_position = pos
	return p


func _ready() -> void:
	if Settings.is_low_quality() and size < 0.8:
		# Low quality: only the big defeat puffs.
		_life = 0.0
		return
	_ensure_meshes()
	var q := Settings.quality()
	var density := 1.0 if q == "high" else 0.65
	add_child(_make_smoke(density))
	add_child(_make_sparks(density))
	_life = 1.9


static func _ensure_meshes() -> void:
	if _smoke_mesh != null:
		return
	_smoke_mesh = QuadMesh.new()
	_smoke_mesh.size = Vector2(0.7, 0.7)
	var sm := ShaderMaterial.new()
	sm.shader = WISP_SHADER
	sm.set_shader_parameter("opacity", 0.85)
	sm.set_shader_parameter("glow", 0.35)
	_smoke_mesh.material = sm
	_spark_mesh = QuadMesh.new()
	_spark_mesh.size = Vector2(0.09, 0.09)
	var km := ShaderMaterial.new()
	km.shader = SPARK_SHADER
	_spark_mesh.material = km


func _make_smoke(density: float) -> GPUParticles3D:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.25 * size
	pm.direction = Vector3.UP
	pm.spread = 180.0
	pm.initial_velocity_min = 0.8 * size
	pm.initial_velocity_max = 2.4 * size
	pm.damping_min = 2.5
	pm.damping_max = 4.0
	pm.gravity = Vector3(0.0, 0.7, 0.0)
	pm.angle_min = -180.0
	pm.angle_max = 180.0
	pm.angular_velocity_min = -40.0
	pm.angular_velocity_max = 40.0
	pm.scale_min = 0.7 * size
	pm.scale_max = 1.3 * size
	var sc := Curve.new()
	sc.add_point(Vector2(0.0, 0.4))
	sc.add_point(Vector2(0.35, 1.0))
	sc.add_point(Vector2(1.0, 1.5))
	var sct := CurveTexture.new()
	sct.curve = sc
	pm.scale_curve = sct
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 1.0, 1.0, 0.0))
	g.set_color(1, Color(0.8, 0.75, 1.0, 0.0))
	g.add_point(0.08, Color(1.0, 1.0, 1.0, 0.9))
	g.add_point(0.55, Color(0.9, 0.85, 1.0, 0.5))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var p := GPUParticles3D.new()
	p.process_material = pm
	p.draw_pass_1 = _smoke_mesh
	p.amount = maxi(int(20.0 * size * density), 6)
	p.lifetime = 1.3
	p.one_shot = true
	p.explosiveness = 0.9
	p.randomness = 0.4
	p.local_coords = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-3, -2, -3), Vector3(6, 6, 6))
	p.emitting = true
	return p


func _make_sparks(density: float) -> GPUParticles3D:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.2 * size
	pm.direction = Vector3.UP
	pm.spread = 180.0
	pm.initial_velocity_min = 1.5 * size
	pm.initial_velocity_max = 3.5 * size
	pm.damping_min = 2.0
	pm.damping_max = 3.0
	pm.gravity = Vector3(0.0, 1.2, 0.0)
	pm.scale_min = 0.6
	pm.scale_max = 1.4
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 0.9, 1.0, 1.0))
	g.set_color(1, Color(0.6, 0.4, 1.0, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var p := GPUParticles3D.new()
	p.process_material = pm
	p.draw_pass_1 = _spark_mesh
	p.amount = maxi(int(12.0 * size * density), 4)
	p.lifetime = 0.9
	p.one_shot = true
	p.explosiveness = 0.95
	p.randomness = 0.5
	p.local_coords = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-3, -2, -3), Vector3(6, 6, 6))
	p.emitting = true
	return p


func _process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
