class_name LandmarkKit
extends CampKit
## CampKit (logs, planks, stones, canvas, ropes) plus the patterns and
## materials the landmarks need: whitewash, masonry, painted metal, lantern
## glass that lights up at night, the lighthouse lens, paper, earth, leaves,
## glowing mushrooms and dark tunnel openings.
##
## Rendered by shaders/landmark.gdshader (solid) and
## shaders/landmark_cloth.gdshader (double-sided, flutter = metallic channel).
## These shaders have no instance uniforms (the Compatibility renderer has
## very few): night glow follows the global `night_factor`, and the emission
## channel scales it (paint a lantern's glass with emission 0 for a dead one).
##
##   var k := LandmarkKit.new()
##   k.paint(Color("#f1ede4"), 0.8, 0.0, 0.0, LandmarkKit.LP.WHITEWASH)
##   k.lathe(profile, xf, 40)
##   var mesh := LandmarkKit.build(k, cloth_kit)

## Landmark pattern ids (shaders/landmark.gdshaderinc). CampKit.P ids work too.
enum LP {
	WHITEWASH = 40, MASONRY = 41, GLOW_CAP = 42, PAPER = 43, EARTH = 44, LEAF = 45,
	METAL = 46, LENS = 47, DARK = 48, NET = 49, SHINGLE = 50,
}

const SHADER := "res://shaders/landmark.gdshader"
const CLOTH := "res://shaders/landmark_cloth.gdshader"
const BEAM := "res://shaders/lighthouse_beam.gdshader"
const FLARE := "res://shaders/lighthouse_flare.gdshader"

const PAPER_COLOR := Color("#e6d6b2")
const RED_PAINT := Color("#b8352c")
const WHITE_PAINT := Color("#efe9dd")
const DARK_METAL := Color("#2c2e31")

static var _solid_mat: ShaderMaterial = null
static var _cloth_mat: ShaderMaterial = null
static var _glass_mat: StandardMaterial3D = null


static func solid_mat() -> ShaderMaterial:
	if _solid_mat == null:
		_solid_mat = ShaderMaterial.new()
		_solid_mat.shader = load(SHADER) as Shader
	return _solid_mat


static func cloth_mat() -> ShaderMaterial:
	if _cloth_mat == null:
		_cloth_mat = ShaderMaterial.new()
		_cloth_mat.shader = load(CLOTH) as Shader
	return _cloth_mat


## Clear window glass (lantern room panes, display case): faint blue tint,
## sharp reflections, alpha blended (sorted after the opaque landmark).
static func glass_mat() -> StandardMaterial3D:
	if _glass_mat == null:
		_glass_mat = StandardMaterial3D.new()
		_glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_glass_mat.albedo_color = Color(0.78, 0.88, 0.92, 0.16)
		_glass_mat.roughness = 0.04
		_glass_mat.metallic = 0.1
		_glass_mat.metallic_specular = 0.9
		_glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_glass_mat.vertex_color_use_as_albedo = false
	return _glass_mat


## One ArrayMesh from a solid kit and an optional cloth kit (up to two
## surfaces). Returns null when both are empty.
static func build(solid: MeshKit, cloth: MeshKit = null) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if solid and not solid.is_empty():
		_append_surface(mesh, solid, solid_mat())
	if cloth and not cloth.is_empty():
		_append_surface(mesh, cloth, cloth_mat())
	return mesh if mesh.get_surface_count() > 0 else null


static func _append_surface(mesh: ArrayMesh, k: MeshKit, mat: Material) -> void:
	var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, k.to_arrays(), [], {}, flags)
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)


## A MeshInstance3D for one or two kits (null if both are empty).
static func instance(solid: MeshKit, cloth: MeshKit = null, node_name: String = "Mesh", shadows: bool = true) -> MeshInstance3D:
	var mesh := build(solid, cloth)
	if mesh == null:
		return null
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


# --- Extra primitives -------------------------------------------------------------------

## Grid surface whose triangles are dropped where `keep(u, v)` is false
## (torn canvas with holes and ragged edges). Same parameters as surface().
func torn_surface(f: Callable, nu: int, nv: int, keep: Callable, flutter: Callable = Callable()) -> void:
	var start_i := _i.size()
	surface(f, nu, nv, flutter)
	# surface() appended 6 indices per cell in row-major order: rebuild the
	# index tail without the cells that are torn away.
	var kept := PackedInt32Array()
	var cell := 0
	for j in nv:
		for i in nu:
			var u := (float(i) + 0.5) / nu
			var v := (float(j) + 0.5) / nv
			if bool(keep.call(u, v)):
				for q in 6:
					kept.append(_i[start_i + cell * 6 + q])
			cell += 1
	_i.resize(start_i)
	_i.append_array(kept)


## A vertical cylinder wall slice from angle a0 to a1 (radians, measured from
## +X toward +Z) between heights y0..y1 with radius r, facing outward (or
## inward). UV = (arc length, height) in metres.
func wall_arc(center: Vector3, r: float, y0: float, y1: float, a0: float, a1: float, seg: int, inward: bool = false) -> void:
	var base := _v.size()
	var cols := seg + 1
	for row in 2:
		var y := y0 if row == 0 else y1
		for j in cols:
			var a := lerpf(a0, a1, float(j) / seg)
			var n := Vector3(cos(a), 0.0, sin(a))
			_add(center + n * r + Vector3(0.0, y, 0.0), -n if inward else n, Vector2(a * r, y), ao)
	for j in seg:
		_quad(base + j, base + cols + j, base + cols + j + 1, base + j + 1)


## Annulus (flat ring) in the XZ plane at height y, facing up (or down).
## `rz` squashes it along Z (oval rugs).
func ring(center: Vector3, r_in: float, r_out: float, seg: int, down: bool = false, a0: float = 0.0, a1: float = TAU, rz: float = 1.0) -> void:
	var base := _v.size()
	var n := Vector3.DOWN if down else Vector3.UP
	var cols := seg + 1
	for j in cols:
		var a := lerpf(a0, a1, float(j) / seg)
		var d := Vector3(cos(a), 0.0, sin(a) * rz)
		_add(center + d * r_in, n, Vector2(d.x * r_in, d.z * r_in), ao)
		_add(center + d * r_out, n, Vector2(d.x * r_out, d.z * r_out), ao)
	for j in seg:
		_quad(base + j * 2, base + j * 2 + 1, base + j * 2 + 3, base + j * 2 + 2)


## One triangle with its own flutter weight per corner (double-sided kits:
## leaves, fronds). `a` is the leaf tip, b and c its base; the normal faces
## upward. UV: x across (0 = midrib), y = 1 at the tip.
func leaf_tri(a: Vector3, b: Vector3, c: Vector3, fa: float, fb: float, fc: float) -> void:
	var n := (b - a).cross(c - a)
	if n.length_squared() < 1e-12:
		return
	n = n.normalized()
	if n.y < 0.0:
		n = -n
	var keep := metal
	var base := _v.size()
	metal = fa
	_add(a, n, Vector2(0.0, 1.0), ao)
	metal = fb
	_add(b, n, Vector2(-0.5, 0.0), ao)
	metal = fc
	_add(c, n, Vector2(0.5, 0.0), ao)
	metal = keep
	_i.append(base)
	_i.append(base + 1)
	_i.append(base + 2)


## A straight beam (rounded box) from a to b with a square-ish section.
func beam(a: Vector3, b: Vector3, w: float, h: float, c: Color, grain: bool = true) -> void:
	var d := b - a
	var length := d.length()
	if length < 0.001:
		return
	var y := d / length
	var ref := Vector3.UP if absf(y.dot(Vector3.UP)) < 0.9 else Vector3.RIGHT
	var x := ref.cross(y).normalized()
	var z := x.cross(y).normalized()
	# The plank pattern runs along a mesh axis: pick the one closest to the beam.
	var ax := 0
	if absf(y.y) >= absf(y.x) and absf(y.y) >= absf(y.z):
		ax = 1
	elif absf(y.z) >= absf(y.x):
		ax = 2
	var pat: int = [CampKit.P.PLANK_X, CampKit.P.PLANK_Y, CampKit.P.PLANK_Z][ax]
	paint(c, 0.85, 0.0, 0.0, pat if grain else MeshKit.Pat.NONE)
	rbox(Transform3D(Basis(x, y, z), (a + b) * 0.5), Vector3(w, length, h), minf(w, h) * 0.12, 1)
