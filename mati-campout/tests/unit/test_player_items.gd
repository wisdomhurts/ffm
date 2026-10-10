extends "res://tests/test_case.gd"
## Player-side content: every item has a model, every cosmetic option builds,
## and the small pure helpers behave.


func test_every_item_has_a_model() -> void:
	var ids: Array = DB.items.keys()
	ids.append("coins")
	for id in ids:
		var mesh := ItemModels.mesh_for(str(id))
		assert_true(mesh != null and mesh.get_surface_count() == 1, "mesh for %s" % id)
		if mesh:
			assert_gt(mesh.get_aabb().size.length(), 0.02, "%s has a visible size" % id)
		var node := ItemModels.build(str(id))
		assert_true(node.get_node_or_null("Mesh") is MeshInstance3D, "model node for %s" % id)
		node.free()


func test_hold_types() -> void:
	assert_eq(ItemModels.hold_type("rusty_axe"), "axe")
	assert_eq(ItemModels.hold_type("mega_axe"), "axe")
	assert_eq(ItemModels.hold_type("wooden_bat"), "melee")
	assert_eq(ItemModels.hold_type("revolver"), "gun")
	assert_eq(ItemModels.hold_type("rifle"), "gun")
	assert_eq(ItemModels.hold_type("flashlight"), "flashlight")
	assert_eq(ItemModels.hold_type("torch"), "torch")
	assert_eq(ItemModels.hold_type("berries"), "small")


func test_light_items_carry_lights() -> void:
	var fl := ItemModels.build("flashlight")
	var beam := fl.get_node_or_null("Beam") as SpotLight3D
	assert_true(beam != null and not beam.visible, "flashlight has a hidden SpotLight3D beam")
	ItemModels.set_lit(fl, true)
	assert_true(beam != null and beam.visible, "set_lit shows the beam")
	fl.free()
	var t := ItemModels.build("torch")
	assert_true(t.get_node_or_null("FlameLight") is OmniLight3D, "torch has an OmniLight3D")
	assert_true(t.get_node_or_null("Flame") is MeshInstance3D, "torch has a flame")
	t.free()


func test_every_cosmetic_option_builds() -> void:
	var base: Dictionary = (DB.cosmetics.get("default", {}) as Dictionary).duplicate()
	for key in ["hair_styles", "jacket_styles", "backpacks", "accessories"]:
		var field: String = {"hair_styles": "hair_style", "jacket_styles": "jacket_style",
			"backpacks": "backpack", "accessories": "accessory"}[key]
		for opt in DB.cosmetics.get(key, []):
			var look := base.duplicate()
			look[field] = str(opt["id"])
			var c := CharacterModel.new()
			c.apply_look(look)
			var parts := c.find_children("Part", "MeshInstance3D", true, false)
			assert_gt(parts.size(), 15.0, "%s=%s builds a full character" % [field, opt["id"]])
			for p in parts:
				assert_true((p as MeshInstance3D).mesh != null, "%s=%s part has a mesh" % [field, opt["id"]])
			c.free()


func test_character_actions_and_hit_timing() -> void:
	for a in ["swing", "chop", "eat", "hurt", "interact", "shoot", "sit", "wave", "die"]:
		assert_true(CharacterModel.ACTIONS.has(a), "action %s exists" % a)
	assert_gt(CharacterModel.hit_delay("chop"), 0.1, "chop has an impact moment")
	assert_lt(CharacterModel.hit_delay("chop", 1.5), CharacterModel.hit_delay("chop"), "faster tools hit sooner")


func test_pickup_rules() -> void:
	assert_false(Pickup.is_important("wood"), "wood is common")
	assert_true(Pickup.is_important("flashlight"), "flashlight never despawns")
	assert_true(Pickup.is_important("coins"), "coins never despawn")
	assert_true(Pickup.is_important("starstone"), "rare finds never despawn")
	assert_eq(Pickup.sound_for("wood"), "wood_pickup")
	assert_eq(Pickup.sound_for("coal"), "stone_pickup")
	assert_eq(Pickup.sound_for("coins"), "coin")
	assert_eq(Pickup.sound_for("berries"), "pickup")


func test_gun_ray_vs_creature() -> void:
	var t := Player._ray_vs_upright(Vector3(0, 1, 5), Vector3(0, 0, -1), Vector3.ZERO, 0.5, 1.6)
	assert_near(t, 4.5, 0.01, "ray hits the near side of the capsule")
	var miss := Player._ray_vs_upright(Vector3(2, 1, 5), Vector3(0, 0, -1), Vector3.ZERO, 0.5, 1.6)
	assert_lt(miss, 0.0, "ray beside the creature misses")
	var over := Player._ray_vs_upright(Vector3(0, 3, 5), Vector3(0, 0, -1), Vector3.ZERO, 0.5, 1.6)
	assert_lt(over, 0.0, "ray over its head misses")
	var behind := Player._ray_vs_upright(Vector3(0, 1, -5), Vector3(0, 0, -1), Vector3.ZERO, 0.5, 1.6)
	assert_lt(behind, 0.0, "creature behind the ray origin is not hit")


func test_mesh_kit_winding_faces_outward() -> void:
	var k := MeshKit.new()
	k.sphere(Vector3.ZERO, 1.0, 12, 8)
	var arr := k.to_arrays()
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	var outward := 0
	for i in range(0, idx.size(), 3):
		var a := v[idx[i]]
		var b := v[idx[i + 1]]
		var c := v[idx[i + 2]]
		# Godot front faces are clockwise: (c - a) x (b - a) points out.
		if (c - a).cross(b - a).dot(a + b + c) > 0.0:
			outward += 1
	assert_eq(outward, idx.size() / 3, "all sphere triangles face outward")
