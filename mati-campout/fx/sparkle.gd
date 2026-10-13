class_name Sparkle
extends MultiMeshInstance3D
## A set of tiny twinkling star glints (one MultiMesh, one draw call) that
## make interesting things noticeable: gatherables use it around the player.
## Glints are mostly dark and flash briefly at random times; a bit stronger
## at dusk (global `night_factor`). Fades out 18-30 m from the camera.
##
##   var s := Sparkle.new(64)
##   add_child(s)
##   s.set_points(points, sizes, strengths)   # world positions
##
## Shader: shaders/gatherable_sparkle.gdshader.

const SHADER_PATH := "res://shaders/gatherable_sparkle.gdshader"

static var _material: ShaderMaterial = null
static var _quad: QuadMesh = null

var capacity := 64
var _count := 0


func _init(p_capacity: int = 64) -> void:
	capacity = maxi(p_capacity, 1)
	name = "Sparkle"
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	top_level = true
	if _quad == null:
		_quad = QuadMesh.new()
		_quad.size = Vector2(1, 1)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = _quad
	mm.instance_count = capacity
	mm.visible_instance_count = 0
	multimesh = mm
	material_override = shared_material()
	# Glints are tiny; never let a stale AABB cull them.
	custom_aabb = AABB(Vector3(-1e5, -1e3, -1e5), Vector3(2e5, 2e3, 2e5))


static func shared_material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = load(SHADER_PATH)
	return _material


## Show glints at world positions. `sizes` (metres) and `strengths` (0..1)
## are optional per point; phases come from the position so a glint keeps
## its rhythm when the set is refreshed.
func set_points(points: PackedVector3Array, sizes: PackedFloat32Array = PackedFloat32Array(),
		strengths: PackedFloat32Array = PackedFloat32Array()) -> void:
	var n := mini(points.size(), capacity)
	var mm := multimesh
	for i in n:
		var p := points[i]
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, p))
		var h := fposmod(sin(p.x * 12.9898 + p.z * 78.233 + p.y * 37.719) * 43758.5453, 1.0)
		var h2 := fposmod(h * 91.7 + 0.31, 1.0)
		var sz := sizes[i] if i < sizes.size() else 0.2
		var st := strengths[i] if i < strengths.size() else 1.0
		mm.set_instance_custom_data(i, Color(h, sz, 0.75 + h2 * 0.9, st))
	mm.visible_instance_count = n
	_count = n


func point_count() -> int:
	return _count


func clear_points() -> void:
	multimesh.visible_instance_count = 0
	_count = 0
