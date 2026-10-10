extends "res://tests/test_case.gd"
## Phones & browsers: the phone quality preset, Compatibility-renderer
## fallbacks, the phone UI scale boost and the instance-uniform rewrite
## (pure logic, no rendering).


func test_phone_quality_level_exists_and_is_lightest() -> void:
	assert_eq(Settings.QUALITY_LEVELS[0], "phone", "phone is the lightest level")
	assert_true("phone" in Settings.QUALITY_LEVELS and "high" in Settings.QUALITY_LEVELS, "levels")
	var keys := (QualityPresets.PROFILES["high"] as Dictionary).keys()
	var p := QualityPresets.profile("phone")
	for k in keys:
		assert_true(p.has(k), "phone has %s" % k)
	assert_eq(int(p["dir_shadow_size"]), 1024, "phone sun shadows 1024")
	assert_false(bool(p["fire_shadows"]), "phone: no fire shadows")
	assert_false(bool(p["volumetric_fog"]), "phone: no volumetric fog")
	assert_lt(float(p["grass_density"]), 0.2, "phone: grass mostly off")
	assert_near(float(p["tree_distance"]), 110.0, 0.01, "phone: trees to ~110 m")
	assert_lt(float(p["sun_shadow_distance"]), 40.0, "phone: short shadow distance")
	assert_lt(float(p["particles"]), float(QualityPresets.profile("low")["particles"]), "phone: fewer particles")
	assert_eq(str(p["water"]), "simple", "phone: simple water")
	for q in ["low", "medium", "high"]:
		for k in p.keys():
			assert_true(QualityPresets.profile(q).has(k), "%s has %s" % [q, k])


func test_compat_profile_drops_forward_plus_effects() -> void:
	var p := QualityPresets.effective_profile("high", true)
	for k in ["volumetric_fog", "ssao", "ssil", "ssr", "sdfgi", "taa"]:
		assert_false(bool(p[k]), "compat high has no %s" % k)
	assert_eq(int(p["screen_aa"]), 0, "compat: no FXAA/SMAA")
	assert_eq(int(p["dir_shadow_size"]), 4096, "compat keeps the shadow size")
	var f := QualityPresets.effective_profile("high", false)
	assert_true(bool(f["ssil"]), "forward+ high keeps SSIL")
	assert_true(bool(QualityPresets.profile("high")["ssil"]), "table itself unchanged")


func test_low_quality_helper_includes_phone() -> void:
	var before := Settings.quality_override
	Settings.quality_override = "phone"
	assert_true(Settings.is_low_quality(), "phone counts as low")
	assert_true(Settings.is_phone_quality(), "phone preset")
	Settings.quality_override = "low"
	assert_true(Settings.is_low_quality(), "low counts as low")
	Settings.quality_override = "medium"
	assert_false(Settings.is_low_quality(), "medium is not low")
	Settings.quality_override = before


func test_phone_render_scale_is_capped() -> void:
	var before := Settings.quality_override
	var rs: Variant = Settings.data.get("render_scale")
	Settings.data["render_scale"] = 1.0
	Settings.quality_override = "phone"
	# iPhone 14 at DPR 3: 1170 px tall canvas -> 3D no taller than 720 px.
	var s := Settings.effective_render_scale(Vector2(2532, 1170))
	assert_lt(s * 1170.0, 721.0, "3D height capped (%.2f)" % s)
	assert_gt(s, 0.34, "never absurdly low")
	assert_near(Settings.effective_render_scale(Vector2(1280, 600)), 0.7, 0.001, "small canvas: 70 %")
	Settings.quality_override = "high"
	assert_near(Settings.effective_render_scale(Vector2(2532, 1170)), 1.0, 0.001, "desktop presets unchanged")
	Settings.quality_override = before
	Settings.data["render_scale"] = rs


func test_ui_boost_for_phones() -> void:
	# iPhone 14 landscape: 2532x1170 px at DPR 3 -> canvas 2337x1080.
	var b := Platform.boost_for(Vector2(2532, 1170), Vector2(2337, 1080), 3.0)
	assert_gt(b, 1.4, "phone text gets bigger (%.2f)" % b)
	assert_lt(b, 1.76, "within the max boost")
	# The layout never gets narrower than MIN_LOGICAL.
	var se := Platform.boost_for(Vector2(1334, 750), Vector2(1921, 1080), 2.0)
	assert_true(1921.0 / se >= Platform.MIN_LOGICAL.x - 0.5, "iPhone SE keeps room for the HUD (%.2f)" % se)
	# Desktop window at DPR 1 and an iPad: no boost.
	assert_near(Platform.boost_for(Vector2(1280, 720), Vector2(1920, 1080), 1.0), 1.0, 0.001, "desktop 720p")
	assert_near(Platform.boost_for(Vector2(2360, 1640), Vector2(1920, 1334), 2.0), 1.0, 0.001, "iPad")
	assert_near(Platform.boost_for(Vector2.ZERO, Vector2(1920, 1080), 2.0), 1.0, 0.001, "degenerate input")


func test_desktop_is_not_touch_by_default() -> void:
	# Headless test runs are a desktop without a touchscreen.
	assert_false(Platform.is_web(), "not web")
	assert_false(Platform.is_touch_device() and not Platform.force_touch, "no touchscreen")
	assert_near(Platform.ui_scale_boost(), 1.0, 0.001, "no UI boost on desktop")
	assert_eq(Platform.device_word(), "computer", "desktop wording")


func test_instance_uniforms_rewritten_for_compat() -> void:
	var src := "shader_type spatial;\ninstance uniform float dissolve : instance_index(0) = 0.0;\n" + \
		"instance uniform vec4 glow_color : source_color, instance_index(2) = vec4(1.0);\n" + \
		"instance uniform float hit_flash = 0.0;\nuniform float other = 1.0;\n"
	var out := ShaderCompat.convert_source(src)
	assert_false("instance uniform" in out, "no instance uniforms left")
	assert_false("instance_index" in out, "no instance_index hints left")
	assert_true("uniform float dissolve = 0.0;" in out, "plain uniform keeps its default")
	assert_true("uniform vec4 glow_color : source_color = vec4(1.0);" in out, "other hints kept")
	assert_true("uniform float hit_flash = 0.0;" in out, "simple one")
	assert_true("uniform float other = 1.0;" in out, "regular uniforms untouched")


func test_touch_prompts() -> void:
	var was := Platform.force_touch
	Platform.force_touch = true
	Platform.set_touch_active(true)
	assert_eq(Controls.prompt("use"), "USE", "touch: Use button name")
	assert_eq(Controls.prompt("jump"), "JUMP", "touch: Jump button name")
	Platform.set_touch_active(false)
	assert_eq(Controls.prompt("use"), "Click", "keyboard/mouse again")
	Platform.force_touch = was
