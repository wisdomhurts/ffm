class_name DustPuff
extends CPUParticles3D
## Soft, lit dust/smoke puff (tree impacts, a felled trunk vanishing, heavy
## landings). Billboards with a radial falloff that fade in and out; frees
## itself when done.
##   DustPuff.spawn(parent, pos, size_m, amount, color)

static var _mesh: QuadMesh
static var _ramp: Gradient


static func _shared() -> void:
	if _mesh:
		return
	var tex := GradientTexture2D.new()
	tex.width = 64
	tex.height = 64
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.45, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0)])
	tex.gradient = g
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true
	mat.albedo_texture = tex
	mat.roughness = 1.0
	mat.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.proximity_fade_enabled = true
	mat.proximity_fade_distance = 0.6
	mat.disable_receive_shadows = true
	_mesh = QuadMesh.new()
	_mesh.size = Vector2(1, 1)
	_mesh.material = mat
	_ramp = Gradient.new()
	_ramp.offsets = PackedFloat32Array([0.0, 0.18, 0.6, 1.0])
	_ramp.colors = PackedColorArray([Color(1, 1, 1, 0.0), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0.3), Color(1, 1, 1, 0.0)])


static func spawn(parent: Node, pos: Vector3, size: float = 1.5, amount: int = 8, color: Color = Color(0.66, 0.59, 0.48)) -> DustPuff:
	if parent == null or not is_instance_valid(parent) or not parent.is_inside_tree():
		return null
	_shared()
	var p := DustPuff.new()
	p.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	p.mesh = _mesh
	p.amount = maxi(QualityPresets.particle_count(amount), 1)
	p.one_shot = true
	p.explosiveness = 0.85
	p.lifetime = 1.7
	p.lifetime_randomness = 0.3
	p.local_coords = true
	p.emitting = false
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = size * 0.35
	p.direction = Vector3.UP
	p.spread = 80.0
	p.initial_velocity_min = 0.4 * size
	p.initial_velocity_max = 1.2 * size
	p.gravity = Vector3(0, 0.35, 0)
	p.damping_min = 1.2
	p.damping_max = 2.2
	p.angle_min = 0.0
	p.angle_max = 360.0
	p.scale_amount_min = 0.7 * size
	p.scale_amount_max = 1.2 * size
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 0.35))
	curve.add_point(Vector2(1.0, 1.25))
	p.scale_amount_curve = curve
	p.color = color
	p.color_ramp = _ramp
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.finished.connect(p.queue_free)
	parent.add_child(p)
	p.global_position = pos
	p.emitting = true
	return p
