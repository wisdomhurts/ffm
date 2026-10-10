extends "res://tests/test_case.gd"


func _dc() -> DayCycle:
	var d := DayCycle.new()
	d.setup({"day_seconds": 100, "dusk_seconds": 20, "night_seconds": 60, "dawn_seconds": 20, "dusk_warning_seconds": 10})
	return d


func test_full_cycle_counts_one_night() -> void:
	var d := _dc()
	var nights := []
	d.night_survived.connect(func(n: int) -> void: nights.append(n))
	d.advance(100.0 + 20.0 + 60.0 + 1.0)
	assert_eq(d.phase, DayCycle.Phase.DAWN)
	assert_eq(d.nights_survived, 1)
	assert_eq(nights, [1])
	d.advance(20.0)
	assert_eq(d.phase, DayCycle.Phase.DAY)
	assert_eq(d.day, 2)


func test_fast_forward_many_cycles() -> void:
	var d := _dc()
	d.advance(200.0 * 5.0 + 1.0)
	assert_eq(d.nights_survived, 5)
	assert_eq(d.day, 6)


func test_dusk_warning_fires_once() -> void:
	var d := _dc()
	var warned := [0]
	d.dusk_warning.connect(func() -> void: warned[0] += 1)
	d.advance(95.0)
	d.advance(1.0)
	assert_eq(warned[0], 1)


func test_hours_and_darkness() -> void:
	var d := _dc()
	assert_near(d.hour(), 7.0, 0.01)
	assert_eq(d.darkness(), 0.0)
	d.skip_to(DayCycle.Phase.NIGHT)
	assert_eq(d.darkness(), 1.0)
	assert_true(d.monsters_active())
	assert_lt(d.sun_height(), 0.0)


func test_skip_to_dawn_counts_night() -> void:
	var d := _dc()
	d.skip_to(DayCycle.Phase.DAWN)
	assert_eq(d.nights_survived, 1)
