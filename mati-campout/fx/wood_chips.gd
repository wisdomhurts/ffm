class_name WoodChips
extends CPUParticles3D
## One-shot burst of tumbling wood chips (light heartwood + dark bark) for
## axe hits. Frees itself when done.
##   WoodChips.burst(parent, hit_point, toward_player_dir, amount)

static var _mesh: Mesh
static var _ramp: Gradient


static func _shared() -> void:
	if _mesh:
		return
	var box := BoxMesh.new()
	box.size = Vector3(0.09, 0.028, 0.055)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true
	mat.roughness = 0.85
	mat.albedo_color = Color(1, 1, 1)
	# A faint warm glow keeps fresh chips readable even in the shade.
	mat.emission_enabled = true
	mat.emission = Color(0.85, 0.66, 0.42)
	mat.emission_energy_multiplier = 0.3
	box.material = mat
	_mesh = box
	_ramp = Gradient.new()
	_ramp.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	_ramp.colors = PackedColorArray([Color(0.93, 0.78, 0.55), Color(0.78, 0.6, 0.38), Color(0.34, 0.22, 0.13)])


## Spawns a burst at `pos` flying mostly along `toward` (and up).
static func burst(parent: Node, pos: Vector3, toward: Vector3, amount: int = 14) -> WoodChips:
	if parent == null or not is_instance_valid(parent) or not parent.is_inside_tree():
		return null
	_shared()
	var p := WoodChips.new()
	p.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	p.mesh = _mesh
	p.amount = maxi(QualityPresets.particle_count(amount), 1)
	p.one_shot = true
	p.explosiveness = 0.92
	p.lifetime = 0.8
	p.local_coords = true
	p.emitting = false
	var dir := toward
	dir.y = 0.0
	if dir.length_squared() < 0.0001:
		dir = Vector3.BACK
	p.direction = (dir.normalized() + Vector3.UP * 0.75).normalized()
	p.spread = 38.0
	p.initial_velocity_min = 2.4
	p.initial_velocity_max = 4.6
	p.gravity = Vector3(0, -13.0, 0)
	p.damping_min = 0.5
	p.damping_max = 1.5
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.08
	p.particle_flag_rotate_y = true
	p.angle_min = 0.0
	p.angle_max = 360.0
	p.angular_velocity_min = -720.0
	p.angular_velocity_max = 720.0
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.35
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 1.0))
	curve.add_point(Vector2(0.75, 0.9))
	curve.add_point(Vector2(1.0, 0.0))
	p.scale_amount_curve = curve
	p.color_initial_ramp = _ramp
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.finished.connect(p.queue_free)
	parent.add_child(p)
	p.global_position = pos
	p.emitting = true
	return p
