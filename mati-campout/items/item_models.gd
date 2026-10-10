class_name ItemModels
extends RefCounted
## Procedural 3D models for every item in data/items.json (plus "coins").
##
## Model convention (so the same node works in a hand and as a pickup):
##   origin  = where the hand grips the item (centre for small things)
##   +Y      = out of the top of the fist (shaft / handle direction)
##   -Z      = forward: blade edge, gun barrel, flashlight beam
## Meshes are cached per id; build() returns a fresh Node3D every call.
##
## Extra child nodes some models carry:
##   flashlight: "Beam" (SpotLight3D, hidden), "Lens" (glowing disc, hidden)
##   torch:      "Flame" (flame sprite), "FlameLight" (OmniLight3D), both hidden
##               until set_lit(node, true)
##   glowing gems / starsteel / mega axe: "Halo" (additive glow sprite)
##   guns:       meta "muzzle" (Vector3, model space)

const FLAME_SHADER := "res://shaders/character_flame.gdshader"

static var _mesh_cache: Dictionary = {}
static var _sprite_mats: Dictionary = {}
static var _quad: QuadMesh = null


## A fresh model node for an item id. Unknown ids get a small crate.
static func build(id: String) -> Node3D:
	var root := Node3D.new()
	root.name = "Item_%s" % id
	root.set_meta("item_id", id)
	var mesh := mesh_for(id)
	if mesh:
		var mi := MeshInstance3D.new()
		mi.name = "Mesh"
		mi.mesh = mesh
		root.add_child(mi)
	_add_extras(root, id)
	return root


## The cached ArrayMesh for an item.
static func mesh_for(id: String) -> ArrayMesh:
	if _mesh_cache.has(id):
		return _mesh_cache[id]
	var k := MeshKit.new()
	_build_into(k, id)
	var m := k.to_mesh()
	_mesh_cache[id] = m
	return m


## How the character holds it: "axe", "melee", "gun", "flashlight", "torch", "small".
static func hold_type(id: String) -> String:
	var def := DB.item(id)
	match str(def.get("kind", "")):
		"tool":
			return "axe"
		"weapon":
			return "gun" if str(def.get("weapon", "")) == "gun" else "melee"
		"light":
			return "flashlight" if str(def.get("light", "")) == "flashlight" else "torch"
	return "small"


## Turn a torch's flame or a flashlight's beam on/off on a built model.
static func set_lit(node: Node3D, on: bool) -> void:
	if node == null:
		return
	for child_name in ["Flame", "FlameLight", "Beam", "Lens", "Ember"]:
		var c := node.get_node_or_null(child_name) as Node3D
		if c:
			c.visible = on


## Where a gun's muzzle is (model space), or the tip of a long item.
static func muzzle(id: String) -> Vector3:
	match id:
		"revolver":
			return Vector3(0.0, 0.058, -0.2)
		"rifle":
			return Vector3(0.0, 0.05, -0.79)
		"flashlight":
			return Vector3(0.0, 0.0, -0.14)
		"torch":
			return Vector3(0.0, 0.6, 0.0)
	return Vector3(0.0, 0.3, 0.0)


# --- Sprites & lights ------------------------------------------------------------------

static func sprite_material(kind: String) -> ShaderMaterial:
	if _sprite_mats.has(kind):
		return _sprite_mats[kind]
	var m := ShaderMaterial.new()
	m.shader = load(FLAME_SHADER)
	match kind:
		"flame":
			m.set_shader_parameter("mode", 0)
			m.set_shader_parameter("intensity", 2.2)
		"glow_amber":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("core_color", Color(1.0, 0.85, 0.55))
			m.set_shader_parameter("edge_color", Color(1.0, 0.55, 0.15))
			m.set_shader_parameter("intensity", 0.9)
		"glow_violet":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("core_color", Color(0.85, 0.7, 1.0))
			m.set_shader_parameter("edge_color", Color(0.45, 0.25, 0.95))
			m.set_shader_parameter("intensity", 0.9)
		"glow_cyan":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("core_color", Color(0.8, 0.97, 1.0))
			m.set_shader_parameter("edge_color", Color(0.25, 0.7, 1.0))
			m.set_shader_parameter("intensity", 0.9)
		"glow_warm":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("core_color", Color(1.0, 0.95, 0.8))
			m.set_shader_parameter("edge_color", Color(1.0, 0.7, 0.35))
			m.set_shader_parameter("intensity", 0.7)
		"glow_disc":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("billboard", 0)
			m.set_shader_parameter("core_color", Color(1.0, 0.92, 0.7))
			m.set_shader_parameter("edge_color", Color(1.0, 0.7, 0.3))
			m.set_shader_parameter("intensity", 0.38)
		"glow_disc_gold":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("billboard", 0)
			m.set_shader_parameter("core_color", Color(1.0, 0.85, 0.45))
			m.set_shader_parameter("edge_color", Color(1.0, 0.6, 0.15))
			m.set_shader_parameter("intensity", 0.7)
		"flash":
			m.set_shader_parameter("mode", 2)
			m.set_shader_parameter("core_color", Color(1.0, 0.95, 0.75))
			m.set_shader_parameter("edge_color", Color(1.0, 0.6, 0.2))
			m.set_shader_parameter("intensity", 2.5)
		"lens":
			m.set_shader_parameter("mode", 1)
			m.set_shader_parameter("core_color", Color(1.0, 0.98, 0.9))
			m.set_shader_parameter("edge_color", Color(1.0, 0.9, 0.6))
			m.set_shader_parameter("intensity", 1.6)
		_:
			m.set_shader_parameter("mode", 1)
	_sprite_mats[kind] = m
	return m


static func quad() -> QuadMesh:
	if _quad == null:
		_quad = QuadMesh.new()
		_quad.size = Vector2(1.0, 1.0)
	return _quad


## An additive sprite (flame, glow, flash) as a MeshInstance3D.
static func make_sprite(kind: String, size: Vector2, node_name: String = "Sprite") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = quad()
	mi.material_override = sprite_material(kind)
	mi.scale = Vector3(size.x, size.y, 1.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	return mi


static func _add_extras(root: Node3D, id: String) -> void:
	match id:
		"flashlight":
			var lens := make_sprite("lens", Vector2(0.09, 0.09), "Lens")
			lens.position = Vector3(0.0, 0.0, -0.142)
			lens.visible = false
			root.add_child(lens)
			var beam := SpotLight3D.new()
			beam.name = "Beam"
			beam.position = Vector3(0.0, 0.0, -0.145)
			beam.light_color = Color(1.0, 0.95, 0.84)
			beam.light_energy = 3.2
			beam.spot_range = DB.bf("flashlight.range", 22.0)
			beam.spot_angle = DB.bf("flashlight.angle_deg", 28.0)
			beam.spot_attenuation = 0.9
			beam.spot_angle_attenuation = 1.6
			beam.light_volumetric_fog_energy = 0.6
			beam.shadow_enabled = true
			beam.visible = false
			root.add_child(beam)
		"torch":
			var flame := make_sprite("flame", Vector2(0.2, 0.38), "Flame")
			flame.position = Vector3(0.0, 0.66, 0.0)
			flame.visible = false
			root.add_child(flame)
			var ember := make_sprite("glow_amber", Vector2(0.5, 0.5), "Ember")
			ember.position = Vector3(0.0, 0.6, 0.0)
			ember.visible = false
			root.add_child(ember)
			var light := OmniLight3D.new()
			light.name = "FlameLight"
			light.position = Vector3(0.0, 0.68, 0.0)
			light.light_color = Color(1.0, 0.62, 0.28)
			light.light_energy = 1.8
			light.omni_range = DB.bf("torch.light_radius", 6.5)
			light.omni_attenuation = 1.3
			light.light_volumetric_fog_energy = 1.2
			light.visible = false
			root.add_child(light)
		"mega_axe":
			var halo := make_sprite("glow_amber", Vector2(0.55, 0.55), "Halo")
			halo.position = Vector3(0.0, 0.52, 0.0)
			root.add_child(halo)
		"starsteel_sword":
			var halo2 := make_sprite("glow_cyan", Vector2(0.5, 0.9), "Halo")
			halo2.position = Vector3(0.0, 0.48, 0.0)
			root.add_child(halo2)
		"shadow_shard":
			var h3 := make_sprite("glow_violet", Vector2(0.42, 0.42), "Halo")
			root.add_child(h3)
		"starstone":
			var h4 := make_sprite("glow_cyan", Vector2(0.4, 0.4), "Halo")
			root.add_child(h4)
		"amber":
			var h5 := make_sprite("glow_amber", Vector2(0.3, 0.3), "Halo")
			root.add_child(h5)


# --- Model recipes ---------------------------------------------------------------------

## Blade-plane basis: polygon x -> forward (-Z), polygon y -> up, thickness along X.
static func _blade_t(offset: Vector3 = Vector3.ZERO) -> Transform3D:
	return Transform3D(Basis(Vector3(0, 0, -1), Vector3(0, 1, 0), Vector3(1, 0, 0)), offset)


static func _build_into(k: MeshKit, id: String) -> void:
	match id:
		"rusty_axe":
			_axe(k, 1)
		"good_axe":
			_axe(k, 2)
		"mega_axe":
			_axe(k, 3)
		"wooden_bat":
			_bat(k)
		"sword":
			_sword(k, false)
		"starsteel_sword":
			_sword(k, true)
		"revolver":
			_revolver(k)
		"rifle":
			_rifle(k)
		"flashlight":
			_flashlight(k)
		"torch":
			_torch(k)
		"wood":
			_log(k)
		"kindling":
			_kindling(k)
		"stone":
			k.paint(Color("#8d8f91"), 0.88, 0.0, 0.0, MeshKit.Pat.NONE)
			k.color_fn = func(p: Vector3, n: Vector3) -> Color:
				var moss := smoothstep(0.55, 0.9, n.y) * 0.5
				return Color("#8d8f91").lerp(Color("#6f8f4e"), moss)
			k.blob(Vector3.ZERO, Vector3(0.11, 0.075, 0.095), 17, 0.28, 16, 10)
		"coal":
			k.paint(Color("#2b2b30"), 0.38, 0.15, 0.0, MeshKit.Pat.CRYSTAL)
			k.blob(Vector3.ZERO, Vector3(0.075, 0.06, 0.07), 29, 0.35, 9, 6, true)
			k.blob(Vector3(0.07, -0.02, 0.03), Vector3(0.04, 0.035, 0.04), 31, 0.3, 7, 5, true)
		"cloth":
			_cloth(k)
		"scrap_metal":
			_scrap(k)
		"bone":
			_bone(k)
		"shadow_shard":
			_crystal(k, Color("#6a55b8"), 1.4, 41)
		"starstone":
			k.paint(Color("#7fd6ff"), 0.15, 0.2, 0.75, MeshKit.Pat.CRYSTAL)
			k.blob(Vector3.ZERO, Vector3(0.065, 0.06, 0.06), 53, 0.3, 8, 6, true)
		"amber":
			k.paint(Color("#e8952f"), 0.1, 0.0, 0.7, MeshKit.Pat.NONE)
			k.lathe(PackedVector2Array([Vector2(0, -0.045), Vector2(0.03, -0.038), Vector2(0.044, -0.008),
				Vector2(0.04, 0.025), Vector2(0.022, 0.055), Vector2(0.0, 0.068)]), Transform3D.IDENTITY, 14, 0.8)
		"battery":
			_battery(k)
		"berries":
			_berries(k)
		"mushroom":
			_mushroom(k, false)
		"roasted_mushroom":
			_mushroom(k, true)
		"raw_meat":
			_meat(k, false)
		"cooked_meat":
			_meat(k, true)
		"jerky":
			_jerky(k)
		"canned_beans":
			_can(k)
		"trail_mix":
			_trail_mix(k)
		"bandage":
			_bandage(k)
		"medkit":
			_medkit(k)
		"old_sack", "good_sack", "mega_sack", "best_sack":
			_sack(k, id)
		"map":
			_map(k)
		"revolver_rounds":
			_ammo(k, false)
		"rifle_rounds":
			_ammo(k, true)
		"coins":
			_coins(k)
		_:
			var c := Color(str(DB.item(id).get("color", "#b08a5a")))
			k.paint(c, 0.7, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(Transform3D.IDENTITY, Vector3(0.14, 0.12, 0.14), 0.025)


static func _axe(k: MeshKit, tier: int) -> void:
	var s := 1.0 if tier < 3 else 1.18
	# Handle with a gentle curve.
	var pts := PackedVector3Array([Vector3(0, -0.16, 0.0), Vector3(0, 0.02, 0.006), Vector3(0, 0.22, 0.002),
		Vector3(0, 0.4, -0.006), Vector3(0, 0.53 * s, -0.004)])
	var radii := PackedFloat32Array([0.021, 0.018, 0.017, 0.018, 0.019])
	match tier:
		1:
			k.paint(Color("#6e4a2c"), 0.86, 0.0, 0.0, MeshKit.Pat.WOOD)
		2:
			k.paint(Color("#a3653a"), 0.42, 0.0, 0.0, MeshKit.Pat.WOOD)
		_:
			k.paint(Color("#3b2a22"), 0.5, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.tube(pts, radii, 10)
	# Grip wrap.
	match tier:
		1:
			k.paint(Color("#8b7760"), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.cylinder(Vector3(0, -0.13, 0.0), Vector3(0, 0.03, 0.006), 0.0225, 0.0215, 12, false)
			k.torus(Transform3D(Basis.IDENTITY, Vector3(0, -0.02, 0.005)), 0.0225, 0.004, 12, 5)
		2:
			k.paint(Color("#2e2420"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.cylinder(Vector3(0, -0.14, 0.0), Vector3(0, 0.05, 0.006), 0.0225, 0.0215, 12, false)
			k.paint(Color("#c9ced4"), 0.3, 0.9, 0.0)
			k.cylinder(Vector3(0, -0.175, 0.0), Vector3(0, -0.15, 0.0), 0.022, 0.023, 12, true, 0.004)
		_:
			k.paint(Color("#2a1e1a"), 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.cylinder(Vector3(0, -0.14, 0.0), Vector3(0, 0.06, 0.006), 0.0225, 0.0215, 12, false)
			k.paint(Color("#f2b53a"), 0.22, 1.0, 0.25)
			for y in [-0.15, 0.07, 0.3]:
				k.torus(Transform3D(Basis.IDENTITY, Vector3(0, y, 0.003)), 0.021, 0.0055, 14, 6)
			k.sphere(Vector3(0, -0.175, 0.0), 0.026, 12, 8)
	# Head.
	var head := PackedVector2Array([Vector2(-0.042, 0.43), Vector2(0.025, 0.425), Vector2(0.075, 0.405),
		Vector2(0.122, 0.368), Vector2(0.136, 0.36), Vector2(0.133, 0.42), Vector2(0.134, 0.5),
		Vector2(0.136, 0.58), Vector2(0.122, 0.572), Vector2(0.075, 0.54), Vector2(0.025, 0.515),
		Vector2(-0.042, 0.512)])
	var edge := PackedVector2Array([Vector2(0.126, 0.36), Vector2(0.148, 0.342), Vector2(0.162, 0.39),
		Vector2(0.169, 0.465), Vector2(0.163, 0.54), Vector2(0.149, 0.598), Vector2(0.126, 0.585), Vector2(0.128, 0.47)])
	var ht := Transform3D(_blade_t().basis.scaled(Vector3(s, s, 1.0)), Vector3(0, 0.03 * (s - 1.0), 0))
	match tier:
		1:
			k.paint(Color("#57534f"), 0.82, 0.45, 0.0, MeshKit.Pat.RUST)
			k.extrude(head, 0.034, ht, 0.006)
			k.paint(Color("#8c867c"), 0.62, 0.55, 0.0, MeshKit.Pat.RUST)
			k.extrude(edge, 0.018, ht, 0.004)
		2:
			k.paint(Color("#a7b0ba"), 0.32, 0.9, 0.0)
			k.extrude(head, 0.034, ht, 0.006)
			k.paint(Color("#f1f5f8"), 0.14, 1.0, 0.0)
			k.extrude(edge, 0.018, ht, 0.004)
			# Little red paint band on the poll.
			k.paint(Color("#b8392b"), 0.5, 0.0, 0.0)
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.471, 0.03)), Vector3(0.037, 0.075, 0.018), 0.005)
		_:
			# Double-bit golden head with glowing edges and an amber gem.
			var back := PackedVector2Array()
			for p in head:
				back.append(Vector2(-p.x, p.y))
			var back_edge := PackedVector2Array()
			for p in edge:
				back_edge.append(Vector2(-p.x, p.y))
			back.reverse()
			back_edge.reverse()
			k.paint(Color("#f0b13a"), 0.24, 1.0, 0.12)
			k.extrude(head, 0.036, ht, 0.007)
			k.extrude(back, 0.036, ht, 0.007)
			k.paint(Color("#ffd27a"), 0.18, 0.6, 2.4)
			k.extrude(edge, 0.02, ht, 0.004)
			k.extrude(back_edge, 0.02, ht, 0.004)
			k.paint(Color("#ff9a2a"), 0.1, 0.0, 2.8, MeshKit.Pat.CRYSTAL)
			var gem_y := 0.47 * s + 0.03 * (s - 1.0)
			for sx in [-1.0, 1.0]:
				k.ellipsoid(Vector3(0.019 * sx, gem_y, 0.0), Vector3(0.008, 0.03, 0.03), 12, 8)
			k.paint(Color("#b8862a"), 0.3, 1.0, 0.0)
			for sx in [-1.0, 1.0]:
				k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.018 * sx, gem_y, 0.0)), 0.032, 0.005, 18, 5)


static func _bat(k: MeshKit) -> void:
	k.paint(Color("#c08a4c"), 0.5, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.lathe(PackedVector2Array([Vector2(0, -0.175), Vector2(0.024, -0.172), Vector2(0.029, -0.16),
		Vector2(0.022, -0.148), Vector2(0.0165, -0.125), Vector2(0.0165, 0.05), Vector2(0.021, 0.18),
		Vector2(0.031, 0.32), Vector2(0.037, 0.45), Vector2(0.038, 0.53), Vector2(0.032, 0.553),
		Vector2(0.0, 0.558)]), Transform3D.IDENTITY, 16)
	k.paint(Color("#2b2a2e"), 0.7, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.cylinder(Vector3(0, -0.145, 0), Vector3(0, 0.07, 0), 0.0185, 0.0182, 14, false)
	k.paint(Color("#c0392b"), 0.5, 0.0, 0.0)
	k.cylinder(Vector3(0, 0.33, 0), Vector3(0, 0.36, 0), 0.0318, 0.0328, 16, false)


static func _sword(k: MeshKit, star: bool) -> void:
	var length := 0.82 if star else 0.7
	var w := 0.026 if star else 0.024
	var blade := PackedVector2Array([Vector2(-w, 0.085), Vector2(w, 0.085), Vector2(w * 0.95, length - 0.11),
		Vector2(0.0, length), Vector2(-w * 0.95, length - 0.11)])
	if star:
		k.paint(Color("#8be0ff"), 0.18, 0.7, 1.3, MeshKit.Pat.CRYSTAL)
	else:
		k.paint(Color("#d4dce5"), 0.2, 1.0, 0.0)
	k.extrude(blade, 0.012, _blade_t(), 0.005)
	# Fuller (central ridge) for a forged look.
	if star:
		k.paint(Color("#e8fbff"), 0.1, 0.4, 2.2)
	else:
		k.paint(Color("#aeb8c4"), 0.28, 1.0, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, (0.12 + length - 0.16) * 0.5, 0)), Vector3(0.0135, length - 0.26, 0.008), 0.003)
	# Crossguard, grip, pommel.
	if star:
		k.paint(Color("#2a3560"), 0.35, 0.8, 0.0)
	else:
		k.paint(Color("#7a6a4a"), 0.35, 0.85, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.075, 0)), Vector3(0.032, 0.026, 0.17), 0.01)
	k.paint(Color("#1f2a44") if star else Color("#4a3326"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.cylinder(Vector3(0, -0.085, 0), Vector3(0, 0.066, 0), 0.0175, 0.016, 12, false)
	for y in [-0.05, -0.01, 0.03]:
		k.torus(Transform3D(Basis.IDENTITY, Vector3(0, y, 0)), 0.017, 0.003, 12, 4)
	if star:
		k.paint(Color("#9ff0ff"), 0.1, 0.0, 2.6, MeshKit.Pat.CRYSTAL)
		k.sphere(Vector3(0, -0.1, 0), 0.025, 12, 8)
		k.sphere(Vector3(0, 0.075, -0.0), 0.019, 10, 6)
	else:
		k.paint(Color("#8a7a5a"), 0.3, 0.9, 0.0)
		k.sphere(Vector3(0, -0.1, 0), 0.024, 12, 8)


static func _revolver(k: MeshKit) -> void:
	k.paint(Color("#7a4a2a"), 0.48, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, -0.28), Vector3(0, -0.035, 0.016)), Vector3(0.03, 0.1, 0.042), 0.012)
	k.paint(Color("#45474f"), 0.32, 0.8, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.036, -0.008)), Vector3(0.026, 0.05, 0.078), 0.008)
	k.cylinder(Vector3(0, 0.046, 0.006), Vector3(0, 0.046, -0.046), 0.026, 0.026, 14, true, 0.006)
	k.cylinder(Vector3(0, 0.06, -0.04), Vector3(0, 0.06, -0.2), 0.0095, 0.009, 12, true, 0.002)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.07, -0.12)), Vector3(0.008, 0.008, 0.16), 0.003)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.078, -0.192)), Vector3(0.004, 0.01, 0.008), 0.0015)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.4), Vector3(0, 0.07, 0.036)), Vector3(0.008, 0.024, 0.012), 0.003)
	k.paint(Color("#2f3036"), 0.4, 0.8, 0.0)
	k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0, 0.002, -0.012)), 0.019, 0.0035, 14, 5, PI)


static func _rifle(k: MeshKit) -> void:
	# One-piece wooden stock (side profile, x = backwards along +Z).
	var stock := PackedVector2Array([Vector2(-0.47, -0.004), Vector2(0.0, -0.01), Vector2(0.035, -0.02),
		Vector2(0.06, -0.065), Vector2(0.1, -0.068), Vector2(0.115, -0.036), Vector2(0.2, -0.042),
		Vector2(0.38, -0.088), Vector2(0.425, -0.086), Vector2(0.428, 0.038), Vector2(0.4, 0.046),
		Vector2(0.2, 0.026), Vector2(0.1, 0.022), Vector2(0.04, 0.034), Vector2(-0.47, 0.034)])
	var st := Transform3D(Basis(Vector3(0, 0, 1), Vector3(0, 1, 0), Vector3(-1, 0, 0)), Vector3(0, 0.0, 0.0))
	k.paint(Color("#7a5236"), 0.48, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.extrude(stock, 0.036, st, 0.009)
	k.paint(Color("#2b2320"), 0.7, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.05), Vector3(0, -0.024, 0.428)), Vector3(0.038, 0.13, 0.012), 0.005)
	k.paint(Color("#3d3f46"), 0.3, 0.85, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.046, -0.02)), Vector3(0.03, 0.04, 0.2), 0.008)
	k.cylinder(Vector3(0, 0.05, -0.1), Vector3(0, 0.05, -0.79), 0.0105, 0.0095, 12, true, 0.002)
	k.tube(PackedVector3Array([Vector3(0.012, 0.052, 0.04), Vector3(0.035, 0.045, 0.045), Vector3(0.042, 0.032, 0.05)]),
		PackedFloat32Array([0.004, 0.004, 0.004]), 6)
	k.sphere(Vector3(0.044, 0.03, 0.05), 0.008, 8, 6)
	k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0, -0.012, 0.03)), 0.018, 0.0035, 12, 5, PI)
	for z in [-0.3, -0.52]:
		k.torus(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.03, z)), 0.023, 0.004, 14, 5)
	# Scope.
	k.paint(Color("#26272c"), 0.35, 0.6, 0.0)
	k.cylinder(Vector3(0, 0.094, 0.06), Vector3(0, 0.094, -0.17), 0.0135, 0.0135, 14, true, 0.003)
	k.cylinder(Vector3(0, 0.094, -0.17), Vector3(0, 0.094, -0.2), 0.0135, 0.019, 14, true, 0.003)
	k.cylinder(Vector3(0, 0.094, 0.09), Vector3(0, 0.094, 0.06), 0.017, 0.0135, 14, true, 0.003)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.072, -0.02)), Vector3(0.012, 0.024, 0.12), 0.004)
	k.paint(Color("#5fa8d8"), 0.05, 0.3, 0.25)
	k.cylinder(Vector3(0, 0.094, -0.199), Vector3(0, 0.094, -0.201), 0.016, 0.016, 14, true)


static func _flashlight(k: MeshKit) -> void:
	k.paint(Color("#3d6fb4"), 0.32, 0.1, 0.0)
	k.cylinder(Vector3(0, 0, 0.085), Vector3(0, 0, -0.07), 0.0195, 0.0195, 16, true, 0.004)
	k.paint(Color("#273041"), 0.75, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.cylinder(Vector3(0, 0, 0.06), Vector3(0, 0, -0.02), 0.0205, 0.0205, 16, false)
	k.paint(Color("#3a3d45"), 0.35, 0.7, 0.0)
	k.cylinder(Vector3(0, 0, -0.07), Vector3(0, 0, -0.135), 0.021, 0.0285, 16, true, 0.003)
	k.paint(Color("#d6dbe0"), 0.2, 1.0, 0.0)
	k.torus(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0, -0.135)), 0.026, 0.0035, 18, 5)
	k.paint(Color("#cfd8de"), 0.08, 0.2, 0.15)
	k.cylinder(Vector3(0, 0, -0.131), Vector3(0, 0, -0.1345), 0.024, 0.024, 16, true)
	k.paint(Color("#e8892b"), 0.45, 0.0, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.02, 0.02)), Vector3(0.012, 0.008, 0.018), 0.003)
	k.paint(Color("#22252b"), 0.5, 0.3, 0.0)
	k.cylinder(Vector3(0, 0, 0.083), Vector3(0, 0, 0.095), 0.0175, 0.016, 14, true, 0.003)


static func _torch(k: MeshKit) -> void:
	k.paint(Color("#6b4a2f"), 0.85, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.tube(PackedVector3Array([Vector3(0, -0.18, 0), Vector3(0, 0.1, 0.003), Vector3(0, 0.42, 0)]),
		PackedFloat32Array([0.018, 0.02, 0.023]), 10)
	k.paint(Color("#6a5240"), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		return Color("#7b604a").lerp(Color("#2a211c"), smoothstep(0.43, 0.53, p.y))
	k.lathe(PackedVector2Array([Vector2(0.022, 0.35), Vector2(0.035, 0.38), Vector2(0.042, 0.43),
		Vector2(0.04, 0.49), Vector2(0.03, 0.525), Vector2(0.0, 0.535)]), Transform3D.IDENTITY, 12)
	k.color_fn = Callable()
	k.paint(Color("#c9b48a"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0, 0.375, 0)), 0.034, 0.005, 12, 5)


static func _log(k: MeshKit) -> void:
	k.paint(Color("#6b4a2f"), 0.92, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.color_fn = func(_p: Vector3, n: Vector3) -> Color:
		if absf(n.x) > 0.75:
			return Color("#d2a875")
		return Color("#6b4a2f").lerp(Color("#57402b"), 0.5 + 0.5 * sin(_p.x * 40.0))
	k.cylinder(Vector3(-0.26, 0, 0), Vector3(0.26, 0, 0), 0.078, 0.07, 16, true, 0.012)
	k.color_fn = Callable()
	k.paint(Color("#5e4129"), 0.9, 0.0, 0.0, MeshKit.Pat.WOOD)
	k.cone(Vector3(0.06, 0.05, 0.0), Vector3(0.1, 0.13, 0.03), 0.022, 8)
	k.paint(Color("#6f8f4e"), 0.95, 0.0, 0.0)
	k.ellipsoid(Vector3(-0.12, 0.066, 0.0), Vector3(0.05, 0.012, 0.035), 10, 5)


static func _kindling(k: MeshKit) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 991
	for i in 7:
		var a := float(i) / 7.0 * TAU
		var off := Vector3(0, cos(a) * 0.018, sin(a) * 0.018)
		var tilt := Vector3(0, rng.randf_range(-0.03, 0.03), rng.randf_range(-0.03, 0.03))
		k.paint(Color("#b88a55").lerp(Color("#7d5a38"), rng.randf()), 0.9, 0.0, 0.0, MeshKit.Pat.WOOD)
		k.tube(PackedVector3Array([Vector3(-0.15, 0, 0) + off - tilt, Vector3(0.0, rng.randf_range(-0.006, 0.006), 0) + off,
			Vector3(0.15, 0, 0) + off + tilt]), PackedFloat32Array([0.009, 0.0085, 0.007]), 6)
	k.paint(Color("#d9c9a0"), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.02, 0, 0)), 0.03, 0.0045, 16, 5)


static func _cloth(k: MeshKit) -> void:
	var cols := [Color("#c86b5a"), Color("#e3d6bf"), Color("#b55a4a")]
	for i in 3:
		k.paint(cols[i], 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
		var b := Basis(Vector3.UP, (float(i) - 1.0) * 0.18)
		k.rbox(Transform3D(b, Vector3(0, -0.035 + i * 0.034, 0)), Vector3(0.2, 0.034, 0.15), 0.014, 2)


static func _scrap(k: MeshKit) -> void:
	k.paint(Color("#9aa4ad"), 0.5, 0.7, 0.0, MeshKit.Pat.RUST)
	k.rbox(Transform3D(Basis(Vector3.UP, 0.3) * Basis(Vector3.RIGHT, 0.12), Vector3(-0.02, -0.02, 0.0)), Vector3(0.17, 0.012, 0.11), 0.004)
	k.rbox(Transform3D(Basis(Vector3.FORWARD, 0.9), Vector3(0.06, 0.03, 0.01)), Vector3(0.08, 0.01, 0.06), 0.003)
	k.paint(Color("#b9c1c8"), 0.35, 0.9, 0.0)
	var gt := Transform3D(Basis(Vector3.RIGHT, 1.3), Vector3(-0.04, 0.025, 0.02))
	k.torus(gt, 0.032, 0.011, 18, 6)
	for i in 8:
		var a := TAU * float(i) / 8.0
		k.rbox(gt * Transform3D(Basis(Vector3.UP, -a), Vector3(cos(a) * 0.046, 0.0, sin(a) * 0.046)), Vector3(0.014, 0.018, 0.012), 0.003, 1)
	k.paint(Color("#6d6f75"), 0.4, 0.8, 0.0)
	k.cylinder(Vector3(0.05, -0.01, -0.04), Vector3(0.05, 0.04, -0.04), 0.008, 0.008, 6, true)
	k.cylinder(Vector3(0.05, 0.04, -0.04), Vector3(0.05, 0.052, -0.04), 0.014, 0.014, 6, true)


static func _bone(k: MeshKit) -> void:
	k.paint(Color("#efe6cf"), 0.62, 0.0, 0.0)
	k.capsule(Vector3(-0.085, 0, 0), Vector3(0.085, 0, 0), 0.02, 0.02, 12)
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			k.sphere(Vector3(0.095 * sx, 0.0, 0.019 * sz), 0.029, 12, 8)


static func _crystal(k: MeshKit, c: Color, e: float, _seed_v: int) -> void:
	k.paint(c, 0.15, 0.15, e, MeshKit.Pat.CRYSTAL)
	var prof := PackedVector2Array([Vector2(0, -0.07), Vector2(0.035, -0.035), Vector2(0.032, 0.06), Vector2(0, 0.125)])
	k.lathe(prof, Transform3D(Basis(Vector3.FORWARD, 0.15), Vector3(0, -0.02, 0)), 6, 1.0, TAU, 0.0, true)
	k.lathe(prof, Transform3D(Basis(Vector3.FORWARD, -0.7).scaled(Vector3(0.55, 0.55, 0.55)), Vector3(0.04, -0.04, 0.01)), 5, 1.0, TAU, 0.3, true)
	k.lathe(prof, Transform3D(Basis(Vector3.RIGHT, 0.6).scaled(Vector3(0.45, 0.45, 0.45)), Vector3(-0.03, -0.045, 0.02)), 5, 1.0, TAU, 0.8, true)


static func _battery(k: MeshKit) -> void:
	k.paint(Color("#e8d14b"), 0.35, 0.1, 0.0)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		return Color("#2b2b30") if p.y < -0.015 else Color("#e8d14b")
	k.cylinder(Vector3(0, -0.045, 0), Vector3(0, 0.045, 0), 0.021, 0.021, 16, true, 0.003)
	k.color_fn = Callable()
	k.paint(Color("#d0d4d8"), 0.2, 1.0, 0.0)
	k.cylinder(Vector3(0, 0.044, 0), Vector3(0, 0.053, 0), 0.007, 0.007, 10, true, 0.0015)


static func _berries(k: MeshKit) -> void:
	var pos := [Vector3(0, 0, 0), Vector3(0.036, 0.004, 0.01), Vector3(-0.034, 0.002, 0.012), Vector3(0.012, 0.003, -0.034),
		Vector3(-0.014, 0.0, 0.036), Vector3(0.004, 0.034, 0.004), Vector3(0.024, 0.028, 0.024)]
	var cols := [Color("#c2335d"), Color("#a82a50"), Color("#d6466f")]
	for i in pos.size():
		k.paint(cols[i % 3], 0.3, 0.0, 0.0)
		k.sphere(pos[i], 0.022, 12, 8)
	k.paint(Color("#4f7a3a"), 0.6, 0.0, 0.0)
	k.ellipsoid(Vector3(-0.02, 0.05, -0.012), Vector3(0.036, 0.006, 0.017), 10, 5, Basis(Vector3.FORWARD, 0.5))
	k.ellipsoid(Vector3(0.025, 0.052, -0.016), Vector3(0.03, 0.006, 0.015), 10, 5, Basis(Vector3.FORWARD, -0.6) * Basis(Vector3.UP, 0.8))
	k.paint(Color("#5b4a2a"), 0.8, 0.0, 0.0)
	k.tube(PackedVector3Array([Vector3(0, 0.035, 0), Vector3(0.002, 0.055, -0.01), Vector3(0.0, 0.07, -0.016)]), PackedFloat32Array([0.003, 0.003, 0.0025]), 5)


static func _mushroom(k: MeshKit, roasted: bool) -> void:
	k.paint(Color("#c9a27a") if roasted else Color("#efe3cf"), 0.7, 0.0, 0.0)
	k.lathe(PackedVector2Array([Vector2(0, -0.06), Vector2(0.02, -0.06), Vector2(0.024, -0.045), Vector2(0.018, 0.0),
		Vector2(0.016, 0.03), Vector2(0.0, 0.032)]), Transform3D.IDENTITY, 12)
	var cap := Color("#8f6038") if roasted else Color("#c7a07a")
	k.paint(cap, 0.42 if roasted else 0.6, 0.0, 0.0, MeshKit.Pat.GRILL if roasted else MeshKit.Pat.NONE)
	var under := cap.darkened(0.35)
	k.color_fn = func(_p: Vector3, n: Vector3) -> Color:
		return under if n.y < -0.25 else cap
	k.lathe(PackedVector2Array([Vector2(0, 0.012), Vector2(0.05, 0.01), Vector2(0.06, 0.02), Vector2(0.054, 0.042),
		Vector2(0.034, 0.062), Vector2(0.0, 0.07)]), Transform3D.IDENTITY, 16)
	k.color_fn = Callable()
	if not roasted:
		k.paint(Color("#f3ead8"), 0.6, 0.0, 0.0)
		for p in [Vector3(0.02, 0.064, -0.012), Vector3(-0.026, 0.058, 0.01), Vector3(0.006, 0.062, 0.03), Vector3(-0.012, 0.067, -0.026)]:
			k.ellipsoid(p, Vector3(0.008, 0.004, 0.008), 8, 4)


static func _meat(k: MeshKit, cooked: bool) -> void:
	k.paint(Color("#efe6cf"), 0.55, 0.0, 0.0)
	k.capsule(Vector3(0, 0.0, 0.04), Vector3(0, 0.0, 0.14), 0.014, 0.014, 10)
	k.sphere(Vector3(0.011, 0.0, 0.148), 0.016, 10, 6)
	k.sphere(Vector3(-0.011, 0.0, 0.148), 0.016, 10, 6)
	if cooked:
		k.paint(Color("#9c5530"), 0.48, 0.0, 0.0, MeshKit.Pat.GRILL)
	else:
		k.paint(Color("#d9706e"), 0.35, 0.0, 0.0, MeshKit.Pat.NONE)
		var lean := Color("#d9706e")
		var fat := Color("#f2d0c4")
		k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
			return lean.lerp(fat, smoothstep(0.035, 0.06, p.z + 0.06) * 0.6)
	k.ellipsoid(Vector3(0, 0.0, -0.01), Vector3(0.058, 0.05, 0.075), 16, 10)
	k.color_fn = Callable()


static func _jerky(k: MeshKit) -> void:
	k.paint(Color("#7a3e24"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
	for i in 3:
		var b := Basis(Vector3.UP, (float(i) - 1.0) * 0.35) * Basis(Vector3.RIGHT, 0.1 * (float(i) - 1.0))
		k.rbox(Transform3D(b, Vector3((float(i) - 1.0) * 0.012, float(i) * 0.008, 0)), Vector3(0.036, 0.008, 0.15), 0.004, 2)


static func _can(k: MeshKit) -> void:
	k.paint(Color("#c9ccd1"), 0.28, 0.85, 0.0)
	k.lathe(PackedVector2Array([Vector2(0, -0.055), Vector2(0.035, -0.055), Vector2(0.04, -0.05), Vector2(0.04, -0.05),
		Vector2(0.04, 0.05), Vector2(0.04, 0.05), Vector2(0.035, 0.055), Vector2(0.0, 0.052)]), Transform3D.IDENTITY, 18)
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0, 0.054, 0)), 0.037, 0.004, 18, 5)
	k.paint(Color("#c4562d"), 0.55, 0.0, 0.0)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		if absf(p.y) < 0.012:
			return Color("#f0e2c0")
		if absf(p.y) < 0.016:
			return Color("#7a2e1a")
		return Color("#c4562d")
	k.cylinder(Vector3(0, -0.04, 0), Vector3(0, 0.04, 0), 0.0408, 0.0408, 18, false)
	k.color_fn = Callable()


static func _trail_mix(k: MeshKit) -> void:
	k.paint(Color("#b98d4a"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.lathe(PackedVector2Array([Vector2(0, -0.06), Vector2(0.04, -0.058), Vector2(0.055, -0.035), Vector2(0.056, 0.015),
		Vector2(0.044, 0.042), Vector2(0.026, 0.05), Vector2(0.0, 0.052)]), Transform3D.IDENTITY, 14, 0.62)
	k.paint(Color("#e3d6bf"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.055, 0)), Vector3(0.07, 0.022, 0.018), 0.005)
	k.paint(Color("#c0392b"), 0.6, 0.0, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.005, -0.034)), Vector3(0.05, 0.03, 0.004), 0.002)
	var nuts := [[Vector3(0.05, -0.05, -0.04), Color("#9a6a3a")], [Vector3(0.068, -0.054, -0.012), Color("#4a2a2a")],
		[Vector3(-0.055, -0.052, -0.035), Color("#c79a5a")], [Vector3(0.03, -0.054, -0.06), Color("#3b2418")]]
	var sd := 61
	for nut in nuts:
		k.paint(nut[1], 0.6, 0.0, 0.0)
		k.blob(nut[0], Vector3(0.012, 0.008, 0.01), sd, 0.25, 8, 5)
		sd += 3


static func _bandage(k: MeshKit) -> void:
	k.paint(Color("#f2efe6"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.cylinder(Vector3(-0.035, 0, 0), Vector3(0.035, 0, 0), 0.033, 0.033, 18, true, 0.008)
	k.paint(Color("#cfc6b4"), 0.9, 0.0, 0.0)
	k.cylinder(Vector3(-0.0362, 0, 0), Vector3(0.0362, 0, 0), 0.011, 0.011, 12, true)
	k.paint(Color("#f2efe6"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.35), Vector3(0, -0.042, -0.03)), Vector3(0.066, 0.004, 0.05), 0.0018, 1)


static func _medkit(k: MeshKit) -> void:
	k.paint(Color("#e04848"), 0.42, 0.0, 0.0)
	k.rbox(Transform3D.IDENTITY, Vector3(0.2, 0.13, 0.08), 0.02)
	k.paint(Color("#f5f2ea"), 0.5, 0.0, 0.0)
	for zs in [1.0, -1.0]:
		k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0, 0.0405 * zs)), Vector3(0.07, 0.022, 0.006), 0.002)
		k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0, 0.0405 * zs)), Vector3(0.022, 0.07, 0.006), 0.002)
	k.paint(Color("#3a3c42"), 0.5, 0.4, 0.0)
	k.torus(Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3(0, 0.065, 0)), 0.036, 0.007, 14, 6, PI)
	k.paint(Color("#c9ced4"), 0.3, 0.9, 0.0)
	for xs in [-0.07, 0.07]:
		k.rbox(Transform3D(Basis.IDENTITY, Vector3(xs, 0.04, 0.041)), Vector3(0.02, 0.016, 0.006), 0.002)


static func _sack(k: MeshKit, id: String) -> void:
	var c := Color(str(DB.item(id).get("color", "#9b7b55")))
	var s: float = {"old_sack": 0.85, "good_sack": 0.95, "mega_sack": 1.05, "best_sack": 1.15}.get(id, 1.0)
	var t := Transform3D(Basis.from_scale(Vector3(s, s, s)), Vector3.ZERO)
	var noise := FastNoiseLite.new()
	noise.seed = 77
	noise.frequency = 9.0
	var neck_y := 0.138 * s
	var lumpy := func(p: Vector3) -> Vector3:
		var ang := atan2(p.z, p.x)
		var rr := Vector2(p.x, p.z).length()
		var k_lump := 1.0 + noise.get_noise_3d(p.x, p.y, p.z) * 0.12 * smoothstep(neck_y, neck_y - 0.08 * s, p.y)
		# Ruffles above the tie.
		var ruff := 1.0 + 0.22 * sin(ang * 9.0) * smoothstep(neck_y + 0.01 * s, neck_y + 0.05 * s, p.y)
		var f := k_lump * ruff
		return Vector3(p.x * f, p.y, p.z * f) if rr > 0.0001 else p
	k.paint(c, 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.ao_grad = 0.25
	k.lathe(PackedVector2Array([Vector2(0, -0.14), Vector2(0.08, -0.137), Vector2(0.128, -0.105), Vector2(0.15, -0.04),
		Vector2(0.147, 0.02), Vector2(0.125, 0.07), Vector2(0.08, 0.112), Vector2(0.044, 0.134), Vector2(0.04, 0.148),
		Vector2(0.058, 0.172), Vector2(0.078, 0.2), Vector2(0.07, 0.212), Vector2(0.04, 0.2), Vector2(0.0, 0.19)]),
		t, 28, 0.86, TAU, 0.0, false, lumpy)
	k.ao_grad = 0.0
	k.paint(Color("#c9b48a"), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, 0.143, 0)), 0.045, 0.011, 16, 6)
	k.tube(PackedVector3Array([t * Vector3(0.04, 0.14, -0.03), t * Vector3(0.06, 0.1, -0.06), t * Vector3(0.058, 0.06, -0.075)]),
		PackedFloat32Array([0.007 * s, 0.007 * s, 0.006 * s]), 6)
	match id:
		"old_sack":
			k.paint(c.darkened(0.3), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(t * Transform3D(Basis(Vector3.FORWARD, 0.2), Vector3(0.05, -0.03, -0.122)), Vector3(0.06, 0.06, 0.008), 0.003, 1)
			k.paint(Color("#c7a77a"), 0.95, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(t * Transform3D(Basis(Vector3.UP, 0.9), Vector3(-0.1, 0.02, 0.08)), Vector3(0.05, 0.045, 0.008), 0.003, 1)
		"good_sack":
			k.paint(Color("#5a4632"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, -0.04, 0)), 0.147, 0.008, 24, 5, TAU, 1.6)
		"mega_sack":
			k.paint(Color("#2c4a5e"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, -0.04, 0)), 0.148, 0.01, 24, 5, TAU, 1.6)
			k.paint(Color("#d8b04a"), 0.3, 0.9, 0.0)
			k.rbox(t * Transform3D(Basis.IDENTITY, Vector3(0, -0.04, -0.13)), Vector3(0.03, 0.03, 0.01), 0.004)
		"best_sack":
			k.paint(Color("#f2c14e"), 0.25, 1.0, 0.1)
			k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, -0.04, 0)), 0.148, 0.008, 24, 5, TAU, 1.4)
			k.torus(t * Transform3D(Basis.IDENTITY, Vector3(0, 0.05, 0)), 0.122, 0.007, 24, 5, TAU, 1.4)
			k.paint(Color("#ffe08a"), 0.2, 0.0, 1.4, MeshKit.Pat.CRYSTAL)
			k.sphere(t * Vector3(0, -0.01, -0.13), 0.018, 10, 6)


static func _map(k: MeshKit) -> void:
	k.paint(Color("#d6c08f"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.cylinder(Vector3(-0.11, 0, 0), Vector3(0.11, 0, 0), 0.028, 0.028, 16, true, 0.006)
	k.paint(Color("#b89e6a"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
	for xs in [-0.111, 0.111]:
		k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(xs, 0, 0)), 0.02, 0.005, 14, 5)
	k.paint(Color("#b03a2e"), 0.7, 0.0, 0.0)
	k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0, 0, 0)), 0.03, 0.005, 16, 5)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.4), Vector3(0.008, -0.03, -0.022)), Vector3(0.008, 0.035, 0.003), 0.0012, 1)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, -0.3), Vector3(-0.008, -0.03, -0.024)), Vector3(0.008, 0.035, 0.003), 0.0012, 1)


static func _ammo(k: MeshKit, rifle: bool) -> void:
	k.paint(Color("#4d5f3a") if not rifle else Color("#6a3f2a"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.01, 0)), Vector3(0.11, 0.05, 0.07), 0.006)
	k.paint(Color("#efe2bf"), 0.85, 0.0, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.01, -0.0352)), Vector3(0.08, 0.02, 0.002), 0.0008, 1)
	var h := 0.06 if rifle else 0.035
	for i in 4:
		var x := -0.036 + i * 0.024
		k.paint(Color("#d8b04a"), 0.28, 0.95, 0.0)
		k.cylinder(Vector3(x, 0.0, 0.0), Vector3(x, h * 0.75, 0.0), 0.0075, 0.0075, 10, true, 0.001)
		k.paint(Color("#b87333"), 0.3, 0.95, 0.0)
		k.capsule(Vector3(x, h * 0.75, 0.0), Vector3(x, h, 0.0), 0.0075, 0.002, 10, 3)


static func _coins(k: MeshKit) -> void:
	k.paint(Color("#f5c542"), 0.25, 1.0, 0.12)
	var stack := 5
	for i in stack:
		var off := Vector3(sin(i * 1.7) * 0.003, -0.03 + i * 0.0105, cos(i * 2.3) * 0.003)
		k.cylinder(off, off + Vector3(0, 0.0095, 0), 0.03, 0.03, 18, true, 0.002)
	var loose := [[Vector3(0.05, -0.034, 0.022), 0.25], [Vector3(-0.045, -0.032, 0.03), -0.4], [Vector3(0.012, -0.03, -0.055), 0.6]]
	for c in loose:
		var p: Vector3 = c[0]
		var b := Basis(Vector3.FORWARD, float(c[1]))
		k.cylinder(p - b.y * 0.0048, p + b.y * 0.0048, 0.03, 0.03, 18, true, 0.002)
	k.paint(Color("#fff0b0"), 0.2, 1.0, 0.25)
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0, 0.0175, 0)), 0.021, 0.0025, 18, 4)
