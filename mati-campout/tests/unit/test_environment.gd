extends "res://tests/test_case.gd"
## Lighting/weather rules: look table, sun & moon paths, weather schedule,
## lightning curve and quality presets (pure logic, no rendering).


func test_sky_keys_cover_the_day() -> void:
	assert_gt(float(SkyKeys.key_count()), 6.0, "enough keyframes")
	for h in [0.0, 3.0, 5.5, 6.2, 9.0, 12.0, 17.4, 18.7, 19.5, 22.0, 23.99]:
		var k := SkyKeys.sample(h)
		for key in SkyKeys.COLOR_KEYS:
			assert_true(k.has(key) and k[key] is Color, "colour %s at %.1f" % [key, h])
		for key in SkyKeys.FLOAT_KEYS:
			assert_true(k.has(key), "float %s at %.1f" % [key, h])


func test_sky_keys_wrap_smoothly_at_midnight() -> void:
	var a := SkyKeys.sample(23.999)
	var b := SkyKeys.sample(0.0)
	assert_near((a["zenith"] as Color).r, (b["zenith"] as Color).r, 0.01, "zenith continuous")
	assert_near(float(a["amb_e"]), float(b["amb_e"]), 0.01, "ambient continuous")


func test_night_is_never_pitch_black() -> void:
	for h in [21.0, 0.0, 2.5, 4.0]:
		var k := SkyKeys.sample(h)
		var hz: Color = k["horizon"]
		assert_gt(hz.get_luminance(), 0.05, "horizon readable at %.1f" % h)
		assert_gt(float(k["amb_e"]), 0.2, "ambient floor at %.1f" % h)
		assert_gt(float(k["stars"]), 0.5, "stars out at %.1f" % h)


func test_day_is_bright_and_starless() -> void:
	var k := SkyKeys.sample(12.0)
	assert_gt(float(k["sun_e"]), 1.2, "noon sun energy")
	assert_lt(float(k["sun_e"]), 1.7, "noon sun not blown out")
	assert_eq(float(k["stars"]), 0.0, "no stars at noon")


func test_sun_path_east_south_west() -> void:
	var rise := EnvironmentController.sun_dir_at(6.0)
	var noon := EnvironmentController.sun_dir_at(12.5)
	var set_dir := EnvironmentController.sun_dir_at(19.0)
	assert_gt(rise.x, 0.9, "rises in the east (+X)")
	assert_near(rise.y, 0.0, 0.02, "on the horizon at sunrise")
	assert_gt(noon.y, 0.8, "high at noon")
	assert_gt(noon.z, 0.3, "noon sun in the south (+Z)")
	assert_lt(set_dir.x, -0.9, "sets in the west over the lake (-X)")
	assert_lt(EnvironmentController.sun_dir_at(0.0).y, -0.5, "below ground at midnight")
	assert_gt(EnvironmentController.sun_dir_at(18.6).y, 0.03, "still up at sunset shot time")


func test_moon_up_at_night_down_at_noon() -> void:
	assert_gt(EnvironmentController.moon_dir_at(0.0).y, 0.4, "moon high around midnight")
	assert_gt(EnvironmentController.moon_dir_at(22.0).y, 0.2, "moon up in the evening")
	assert_lt(EnvironmentController.moon_dir_at(12.0).y, 0.0, "moon down at noon")
	assert_near(EnvironmentController.moon_dir_at(5.0).length(), 1.0, 0.001, "unit vector")


func test_run_hour_is_monotonic_through_the_night() -> void:
	assert_near(Weather.run_hour(1, 7.0), 7.0, 0.0001)
	assert_near(Weather.run_hour(1, 23.0), 23.0, 0.0001)
	assert_near(Weather.run_hour(1, 3.0), 27.0, 0.0001, "after midnight still day 1")
	assert_near(Weather.run_hour(2, 7.0), 31.0, 0.0001)


func test_weather_schedule_is_deterministic() -> void:
	var cfg: Dictionary = Weather.DEFAULT_CFG
	for day in range(1, 9):
		var a := Weather.day_segments(1234, day, cfg)
		var b := Weather.day_segments(1234, day, cfg)
		assert_eq(a, b, "same seed+day -> same weather (day %d)" % day)


func test_first_day_is_dry_and_storms_come_later() -> void:
	var cfg: Dictionary = Weather.DEFAULT_CFG
	for s in range(0, 60):
		for seg in Weather.day_segments(s, 1, cfg):
			assert_true(str(seg["kind"]) in ["clear", "cloudy"], "day 1 stays dry (seed %d)" % s)
		for seg in Weather.day_segments(s, 2, cfg):
			assert_true(str(seg["kind"]) != "storm", "no storm on day 2 (seed %d)" % s)


func test_weather_mix_over_many_days() -> void:
	var cfg: Dictionary = Weather.DEFAULT_CFG
	var counts := {"clear": 0, "cloudy": 0, "rain": 0, "storm": 0, "fog": 0}
	var rainy_days := 0
	var days := 0
	for s in range(0, 40):
		for day in range(3, 13):
			days += 1
			var wet := false
			for seg in Weather.day_segments(s, day, cfg):
				counts[str(seg["kind"])] += 1
				if str(seg["kind"]) in ["rain", "storm"]:
					wet = true
					assert_gt(float(seg["to"]), float(seg["from"]), "rain has a duration")
			if wet:
				rainy_days += 1
	var frac := float(rainy_days) / float(days)
	assert_gt(frac, 0.1, "it does rain sometimes (%.2f)" % frac)
	assert_lt(frac, 0.4, "mostly dry (%.2f)" % frac)
	assert_gt(float(counts["fog"]), 0.0, "some foggy mornings")
	assert_gt(float(counts["storm"]), 0.0, "occasional storms")


func test_lightning_flash_curve() -> void:
	assert_gt(Weather.flash_curve(0.0, false), 0.9, "bright strike")
	assert_lt(Weather.flash_curve(2.0, false), 0.01, "fades out")
	var peak_soft := 0.0
	var t := 0.0
	while t < 2.5:
		peak_soft = maxf(peak_soft, Weather.flash_curve(t, true))
		t += 0.02
	assert_lt(peak_soft, 0.3, "reduce_flashing keeps it gentle")
	assert_lt(Weather.flash_curve(0.0, true), 0.01, "reduce_flashing never starts with a pop")


func test_quality_profiles_complete() -> void:
	var keys := (QualityPresets.PROFILES["high"] as Dictionary).keys()
	for q in ["low", "medium", "high"]:
		var p := QualityPresets.profile(q)
		for k in keys:
			assert_true(p.has(k), "%s has %s" % [q, k])
	assert_false(bool(QualityPresets.profile("low")["volumetric_fog"]), "low skips volumetric fog")
	assert_true(bool(QualityPresets.profile("high")["ssil"]), "high has SSIL")
	assert_eq(QualityPresets.profile("nonsense"), QualityPresets.profile("high"), "unknown -> high")


func test_firefly_habitat() -> void:
	var gen := WorldGen.new(20261010)
	assert_eq(Fireflies.habitat(gen, 0.0, 0.0), 0.0, "none in the middle of camp")
	assert_gt(Fireflies.habitat(gen, 0.0, 20.0), 0.5, "camp edge")
	var meadow: Vector3 = gen.landmarks["meadow"]["pos"]
	assert_gt(Fireflies.habitat(gen, meadow.x, meadow.z), 0.5, "meadow")
	assert_eq(Fireflies.habitat(gen, -200.0, 30.0), 0.0, "not over the lake")
