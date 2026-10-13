class_name Fireflies
extends Node3D
## Warm-green blinking fireflies around the player at dusk and night, only
## where they belong: meadows, along the stream and around the camp edge.
## One GPUParticles3D; every ~1.5 s it re-picks emission points near the
## player from the WorldGen masks (cheap: a few dozen noise lookups).

const SHADER := preload("res://env/fireflies.gdshader")
const MAX_POINTS := 48
const REPICK_SECONDS := 1.5

var particles: GPUParticles3D
var material: ShaderMaterial
## 0..1, set by the EnvironmentController (darkness, no rain).
var visibility := 0.0

var _pm: ParticleProcessMaterial
var _img: Image
var _tex: ImageTexture
var _timer := 0.0
var _rng := RandomNumberGenerator.new()
var _point_count := 0
var _amount := 64


func setup(p_seed: int, amount: int) -> void:
	_rng.seed = hash([p_seed, 3131])
	particles = GPUParticles3D.new()
	particles.name = "FireflyParticles"
	particles.local_coords = false
	particles.lifetime = 7.0
	particles.randomness = 0.35
	particles.preprocess = 4.0
	particles.visibility_aabb = AABB(Vector3(-34.0, -8.0, -34.0), Vector3(68.0, 20.0, 68.0))
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	particles.emitting = false
	_pm = ParticleProcessMaterial.new()
	_pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINTS
	_pm.direction = Vector3(0.0, 0.3, 0.0)
	_pm.spread = 180.0
	_pm.initial_velocity_min = 0.1
	_pm.initial_velocity_max = 0.35
	_pm.gravity = Vector3(0.0, 0.015, 0.0)
	_pm.damping_min = 0.05
	_pm.damping_max = 0.15
	_pm.turbulence_enabled = true
	_pm.turbulence_noise_strength = 1.4
	_pm.turbulence_noise_scale = 3.5
	_pm.turbulence_noise_speed = Vector3(0.12, 0.05, 0.1)
	_pm.turbulence_influence_min = 0.03
	_pm.turbulence_influence_max = 0.08
	_pm.scale_min = 0.7
	_pm.scale_max = 1.2
	_img = Image.create(MAX_POINTS, 1, false, Image.FORMAT_RGBF)
	_tex = ImageTexture.create_from_image(_img)
	_pm.emission_point_texture = _tex
	_pm.emission_point_count = 1
	particles.process_material = _pm
	var quad := QuadMesh.new()
	quad.size = Vector2(0.24, 0.24)
	material = ShaderMaterial.new()
	material.shader = SHADER
	quad.material = material
	particles.draw_pass_1 = quad
	add_child(particles)
	set_amount(amount)


func set_amount(amount: int) -> void:
	_amount = maxi(amount, 8)
	if particles and particles.amount != _amount:
		particles.amount = _amount


## How much a spot wants fireflies (0..1).
static func habitat(gen: WorldGen, x: float, z: float) -> float:
	if gen == null or not gen.in_playable(x, z) or gen.is_water(x, z):
		return 0.0
	var meadow := gen.meadow_factor(x, z)
	var stream := 1.0 - smoothstep(3.0, 11.0, gen.distance_to_stream(x, z))
	var d_camp := Vector2(x, z).length()
	var camp_edge := smoothstep(11.0, 16.0, d_camp) * (1.0 - smoothstep(26.0, 36.0, d_camp))
	var shore := smoothstep(0.02, 0.12, gen.lake_mask(x, z)) * (1.0 - smoothstep(0.3, 0.45, gen.lake_mask(x, z)))
	var not_at_fire := smoothstep(6.0, 11.0, d_camp)
	return clampf(maxf(maxf(meadow, stream), maxf(camp_edge * 0.9, shore * 0.6)) * not_at_fire, 0.0, 1.0)


func tick(delta: float, vis: float, center: Vector3) -> void:
	if particles == null:
		return
	visibility = vis
	_timer -= delta
	if vis > 0.01 and _timer <= 0.0:
		_timer = REPICK_SECONDS
		_repick(center)
	var on := vis > 0.01 and _point_count > 0
	if particles.emitting != on:
		particles.emitting = on
	material.set_shader_parameter("visibility", clampf(vis, 0.0, 1.0))
	particles.amount_ratio = clampf(vis * float(_point_count) / float(MAX_POINTS) * 2.0, 0.0, 1.0)


func _repick(center: Vector3) -> void:
	var gen: WorldGen = GameState.world_gen
	if gen == null:
		_point_count = 0
		return
	var origin := Vector3(snappedf(center.x, 2.0), center.y, snappedf(center.z, 2.0))
	particles.global_position = origin
	var n := 0
	for _i in MAX_POINTS * 2:
		if n >= MAX_POINTS:
			break
		var a := _rng.randf() * TAU
		var r := sqrt(_rng.randf_range(9.0, 900.0))
		var x := origin.x + cos(a) * r
		var z := origin.z + sin(a) * r
		if _rng.randf() > habitat(gen, x, z):
			continue
		var y := gen.height_at(x, z) + _rng.randf_range(0.4, 2.4)
		_img.set_pixel(n, 0, Color(x - origin.x, y - origin.y, z - origin.z))
		n += 1
	_point_count = n
	if n > 0:
		_tex.update(_img)
		_pm.emission_point_count = n
