extends "res://tests/test_case.gd"


func _fire() -> FireModel:
	var f := FireModel.new()
	f.setup(DB.b("fire", {}), DB.upgrades["fire"]["levels"], {"wood": 40.0, "coal": 110.0, "kindling": 10.0})
	return f


func test_fire_caps_at_level_three() -> void:
	var f := _fire()
	assert_eq(DB.upgrades["fire"]["max_level"], 3)
	assert_true(f.upgrade())
	assert_true(f.upgrade())
	assert_false(f.upgrade(), "no level 4")
	assert_eq(f.level, 3)


func test_fire_burns_out_and_needs_relight() -> void:
	var f := _fire()
	assert_eq(f.state(), FireModel.State.STRONG)
	f.burn(10000.0)
	assert_eq(f.state(), FireModel.State.OUT)
	assert_false(f.add_fuel("wood"), "cannot just feed a dead fire")
	assert_true(f.relight("kindling", "wood"))
	assert_true(f.is_lit())
	assert_near(f.fuel, 50.0, 0.01)


func test_low_state_and_shrinking_light() -> void:
	var f := _fire()
	var strong_r := f.light_radius()
	f.fuel = f.max_fuel() * 0.2
	f.burn(0.01)
	assert_eq(f.state(), FireModel.State.LOW)
	assert_lt(f.light_radius(), strong_r, "light shrinks when low")
	assert_gt(f.light_radius(), 0.0)


func test_light_falloff_edge() -> void:
	var f := _fire()
	f.fuel = f.max_fuel()
	var r := f.light_radius()
	assert_near(f.light_at_distance(0.0), 1.0, 0.001)
	assert_near(f.light_at_distance(r), 0.35, 0.001)
	assert_eq(f.light_at_distance(r * 1.4), 0.0)
	f.extinguish()
	assert_eq(f.light_at_distance(0.0), 0.0, "no light when out")
	assert_eq(f.heat_at_distance(0.5), 0.0, "no heat when out")


func test_fuel_never_exceeds_max() -> void:
	var f := _fire()
	for i in 50:
		f.add_fuel("coal")
	assert_near(f.fuel, f.max_fuel(), 0.01)


func test_upgrade_keeps_fraction() -> void:
	var f := _fire()
	f.fuel = f.max_fuel() * 0.5
	f.upgrade()
	assert_near(f.fraction(), 0.5, 0.001)
	assert_gt(f.light_radius(), 0.0)
