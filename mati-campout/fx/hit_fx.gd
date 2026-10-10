class_name HitFx
extends Node3D
## Short, kid-friendly impact effects: a bright star flash, a burst of soft
## sparks and an optional quick light pulse. Never gory: hits read as
## "bonk!" sparkles and puffs.
##
##   HitFx.burst(pos, color, strength)     enemy / creature hit
##   HitFx.puff(pos, color)                dust puff (bullet into dirt, clang)
##   HitFx.muzzle(pos, dir)                gun muzzle flash
## Effects are parented under GameState.game.fx and free themselves.

const SPARK_TEX_SIZE := 64

static var _spark_mat: StandardMaterial3D = null
static var _spark_mesh: QuadMesh = null

var _life := 0.4
var _age := 0.0
var _light: OmniLight3D = null
var _light_energy := 0.0
var _flash: MeshInstance3D = null
var _flash_size := 0.5


static func _parent() -> Node:
	var game: Node = GameState.game
	if game and is_instance_valid(game):
		var fx: Node = game.get("fx") as Node
		if fx:
			return fx
	var tree := Engine.get_main_loop() as SceneTree
	return tree.current_scene if tree else null


static func _material() -> StandardMaterial3D:
	if _spark_mat == null:
		var grad := Gradient.new()
		grad.set_color(0, Color(1, 1, 1, 1))
		grad.set_color(1, Color(1, 1, 1, 0))
		var tex := GradientTexture2D.new()
		tex.gradient = grad
		tex.fill = GradientTexture2D.FILL_RADIAL
		tex.fill_from = Vector2(0.5, 0.5)
		tex.fill_to = Vector2(1.0, 0.5)
		tex.width = SPARK_TEX_SIZE
		tex.height = SPARK_TEX_SIZE
		_spark_mat = StandardMaterial3D.new()
		_spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_spark_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_spark_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_spark_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		_spark_mat.vertex_color_use_as_albedo = true
		_spark_mat.albedo_texture = tex
		_spark_mat.disable_fog = true
		_spark_mat.no_depth_test = false
	return _spark_mat


static func _mesh() -> QuadMesh:
	if _spark_mesh == null:
		_spark_mesh = QuadMesh.new()
		_spark_mesh.size = Vector2(0.09, 0.09)
		_spark_mesh.material = _material()
	return _spark_mesh


static func _make(pos: Vector3, life: float) -> HitFx:
	var parent := _parent()
	if parent == null:
		return null
	var fx := HitFx.new()
	fx._life = life
	parent.add_child(fx)
	fx.global_position = pos
	return fx


## Sparkly impact burst. strength ~0.5 (tap) .. 1.5 (big hit).
static func burst(pos: Vector3, color: Color = Color(1.0, 0.85, 0.45), strength: float = 1.0) -> HitFx:
	var fx := _make(pos, 0.55)
	if fx == null:
		return null
	var count := 10 if Settings.quality() == "low" else 18
	fx._add_sparks(int(count * clampf(strength, 0.4, 1.6)), color, 3.2 * strength, 0.45)
	fx._add_flash(color.lerp(Color.WHITE, 0.5), 0.55 * clampf(strength, 0.5, 1.6))
	if Settings.quality() != "low":
		fx._add_light(color, 2.2 * strength, 3.0)
	return fx


## Soft dust puff (bullet into the ground, a dull "clang" on an Elder Tree).
static func puff(pos: Vector3, color: Color = Color(0.82, 0.74, 0.6)) -> HitFx:
	var fx := _make(pos, 0.6)
	if fx == null:
		return null
	fx._add_sparks(8, color, 1.2, 0.5, 2.0)
	return fx


static func muzzle(pos: Vector3, dir: Vector3) -> HitFx:
	var fx := _make(pos, 0.12)
	if fx == null:
		return null
	fx._add_flash(Color(1.0, 0.85, 0.5), 0.45)
	fx._add_light(Color(1.0, 0.75, 0.4), 4.0, 6.0)
	fx._add_sparks(6, Color(1.0, 0.8, 0.4), 4.0, 0.12, 0.0, dir)
	return fx


func _add_sparks(n: int, color: Color, speed: float, life: float, gravity: float = 6.0, dir: Vector3 = Vector3.ZERO) -> void:
	var p := CPUParticles3D.new()
	p.mesh = _mesh()
	p.amount = maxi(n, 1)
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 1.0
	p.local_coords = false
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.08
	if dir.length_squared() > 0.0:
		p.direction = dir.normalized()
		p.spread = 25.0
	else:
		p.direction = Vector3.UP
		p.spread = 180.0
	p.initial_velocity_min = speed * 0.5
	p.initial_velocity_max = speed
	p.gravity = Vector3(0.0, -gravity, 0.0)
	p.damping_min = 2.0
	p.damping_max = 4.0
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.4
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.r, color.g, color.b, 1.0))
	ramp.set_color(1, Color(color.r, color.g, color.b, 0.0))
	p.color_ramp = ramp
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 1.0))
	curve.add_point(Vector2(1.0, 0.2))
	p.scale_amount_curve = curve
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(p)
	p.emitting = true


func _add_flash(_color: Color, size: float) -> void:
	_flash = ItemModels.make_sprite("flash", Vector2(size, size), "Flash")
	_flash_size = size
	_flash.set_instance_shader_parameter("seed", randf() * 10.0)
	add_child(_flash)


func _add_light(color: Color, energy: float, light_range: float) -> void:
	_light = OmniLight3D.new()
	_light.light_color = color
	_light.light_energy = energy
	_light.omni_range = light_range
	_light.shadow_enabled = false
	_light_energy = energy
	add_child(_light)


func _ready() -> void:
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF


func _process(delta: float) -> void:
	_age += delta
	var t := clampf(_age / maxf(_life, 0.001), 0.0, 1.0)
	if _flash:
		var ft := clampf(_age / 0.12, 0.0, 1.0)
		var s := _flash_size * (0.6 + 0.6 * ft)
		_flash.scale = Vector3(s, s, 1.0)
		_flash.set_instance_shader_parameter("fade", 1.0 - ft)
		if ft >= 1.0:
			_flash.visible = false
	if _light:
		_light.light_energy = _light_energy * (1.0 - smoothstep(0.0, 0.6, t))
	if _age >= _life + 0.6:
		queue_free()
