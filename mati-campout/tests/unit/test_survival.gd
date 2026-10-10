extends "res://tests/test_case.gd"


func _s() -> SurvivalModel:
	var s := SurvivalModel.new()
	s.setup(DB.b("survival", {}))
	return s


func test_hunger_zero_eventually_kills() -> void:
	var s := _s()
	s.hunger = 0.0
	for i in 2000:
		s.tick(0.5, {"ambient": 80.0})
	assert_true(s.dead)
	assert_eq(s.death_cause, "hunger")


func test_cold_kills_without_fire() -> void:
	var s := _s()
	for i in 4000:
		s.tick(0.5, {"ambient": 0.0})
	assert_true(s.dead)
	assert_eq(s.death_cause, "cold")


func test_fire_heat_warms_up() -> void:
	var s := _s()
	s.warmth = 10.0
	for i in 40:
		s.tick(0.25, {"ambient": 5.0, "heat": 1.0})
	assert_gt(s.warmth, 60.0)


func test_tent_shelter_is_warm() -> void:
	var s := _s()
	s.warmth = 20.0
	for i in 200:
		s.tick(0.25, {"ambient": 5.0, "sheltered": true, "tent_warmth": 60.0})
	assert_near(s.warmth, 60.0, 0.5)


func test_eating_cooked_meat_beats_raw() -> void:
	var a := _s()
	var b := _s()
	a.hunger = 10.0
	b.hunger = 10.0
	a.eat(DB.item("cooked_meat"), 1.0)
	b.eat(DB.item("raw_meat"), 1.0)
	assert_gt(a.hunger, b.hunger)


func test_raw_meat_sickness_never_kills() -> void:
	var s := _s()
	s.health = 2.0
	s.eat(DB.item("raw_meat"), 0.0)
	assert_false(s.dead)
	assert_gt(s.health, 0.0)


func test_regen_when_fed_and_warm() -> void:
	var s := _s()
	s.health = 50.0
	s.hunger = 90.0
	s.warmth = 90.0
	for i in 20:
		s.tick(1.0, {"ambient": 90.0})
	assert_gt(s.health, 50.0)
