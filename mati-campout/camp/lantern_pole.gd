class_name LanternPole
extends Node3D
## A wooden post with an arm and a hanging lantern. It glows warmly at dusk
## and night, but only while the campfire burns (the camp's lights share the
## fire's fate). Decorative: it is not a protective light source.

var light: OmniLight3D
var _mesh: MeshInstance3D
var _lantern: MeshInstance3D
var _on := 0.0
var _t := 0.0
var _phase := 0.0
var _noise := FastNoiseLite.new()


func _init() -> void:
	name = "LanternPole"


func _ready() -> void:
	_phase = float(get_instance_id() % 997) * 0.13
	_noise.seed = 991
	_noise.frequency = 1.0
	var k := CampKit.new()
	k.log_piece(Vector3(0, -0.2, 0), Vector3(0, 2.25, 0), 0.06, 8801, true, Color("#5a4232"))
	k.paint(Color("#7d5735"), 0.85, 0.0, 0.0, CampKit.P.PLANK_X)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.28, 2.1, 0.0)), Vector3(0.62, 0.06, 0.07), 0.015, 2)
	k.plank(Transform3D(Basis(Vector3.FORWARD, -0.75), Vector3(0.14, 1.93, 0.0)), Vector3(0.3, 0.045, 0.05), Color("#7d5735"), 0)
	k.paint(Color("#2f3033"), 0.45, 0.7, 0.0, CampKit.P.IRON)
	k.cylinder(Vector3(0.52, 2.07, 0.0), Vector3(0.52, 1.92, 0.0), 0.006, 0.006, 5, false)
	# Stones packed around the foot.
	for i in 5:
		var a := TAU * float(i) / 5.0
		k.stone(Vector3(cos(a) * 0.14, 0.04, sin(a) * 0.14), Vector3(0.07, 0.05, 0.06), 8810 + i, CampKit.STONE_COLOR, -a, 0.2, 8, 5)
	_mesh = CampKit.instance(k, null, "Pole")
	add_child(_mesh)
	var lk := CampKit.new()
	CampProps.lantern(lk, Transform3D.IDENTITY)
	_lantern = CampKit.instance(lk, null, "Lantern")
	_lantern.position = Vector3(0.52, 1.64, 0.0)
	add_child(_lantern)
	light = OmniLight3D.new()
	light.name = "LanternLight"
	light.light_color = Color(1.0, 0.74, 0.42)
	light.omni_range = 6.0
	light.omni_attenuation = 1.4
	light.light_specular = 0.2
	light.shadow_enabled = false
	light.light_volumetric_fog_energy = 0.6
	light.position = Vector3(0.52, 1.76, 0.0)
	light.visible = false
	add_child(light)
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	var cs := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 0.1
	cyl.height = 2.2
	cs.shape = cyl
	cs.position = Vector3(0, 1.1, 0)
	body.add_child(cs)
	add_child(body)


func _process(delta: float) -> void:
	_t += delta
	var want := 0.0
	if GameState.fire.is_lit():
		want = smoothstep(0.12, 0.55, GameState.day_cycle.darkness())
	_on = move_toward(_on, want, delta * 0.8)
	var flick := 1.0 + _noise.get_noise_1d(_t * 3.0 + _phase) * 0.08
	light.light_energy = 1.1 * _on * flick
	light.visible = _on > 0.01
	_lantern.set_instance_shader_parameter("lamp", _on * flick)
	# A gentle sway of the hanging lantern.
	_lantern.rotation.z = sin(_t * 1.1 + _phase) * 0.04
