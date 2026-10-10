class_name DayCycle
extends RefCounted
## Day/night clock. Pure logic: advance(dt) and read the derived values.
##
## A day is four phases: DAY (07:00-18:00), DUSK (18:00-20:00),
## NIGHT (20:00-05:00) and DAWN (05:00-07:00). Phase lengths in seconds come
## from balance.day_cycle so the whole cycle is easy to tune (default 7.5 min).
## A night counts as survived the moment DAWN begins.

signal phase_changed(phase: int)
signal night_survived(total: int)
signal dusk_warning()

enum Phase { DAY, DUSK, NIGHT, DAWN }

const PHASE_NAMES := ["Day", "Dusk", "Night", "Dawn"]
## Clock hour at the start of each phase and the hours each phase spans.
const PHASE_START_HOUR := [7.0, 18.0, 20.0, 5.0]
const PHASE_HOURS := [11.0, 2.0, 9.0, 2.0]

var durations: Array = [230.0, 40.0, 150.0, 30.0]
var phase: int = Phase.DAY
var phase_time: float = 0.0
## Current day number, starting at 1. The night of day N is "Night N".
var day: int = 1
var nights_survived: int = 0
var dusk_warning_seconds: float = 30.0
var _warned_today := false


func setup(cfg: Dictionary) -> void:
	durations = [
		float(cfg.get("day_seconds", 230.0)),
		float(cfg.get("dusk_seconds", 40.0)),
		float(cfg.get("night_seconds", 150.0)),
		float(cfg.get("dawn_seconds", 30.0)),
	]
	dusk_warning_seconds = float(cfg.get("dusk_warning_seconds", 30.0))
	phase = Phase.DAY
	phase_time = durations[Phase.DAY] * float(cfg.get("start_phase_progress", 0.0))
	day = 1
	nights_survived = 0
	_warned_today = false


func cycle_length() -> float:
	return durations[0] + durations[1] + durations[2] + durations[3]


func phase_duration() -> float:
	return maxf(float(durations[phase]), 0.001)


func phase_progress() -> float:
	return clampf(phase_time / phase_duration(), 0.0, 1.0)


func phase_name() -> String:
	return PHASE_NAMES[phase]


## Advance the clock. Handles several phase changes in one call (fast-forward).
func advance(dt: float) -> void:
	if dt <= 0.0:
		return
	phase_time += dt
	if phase == Phase.DAY and not _warned_today:
		if phase_duration() - phase_time <= dusk_warning_seconds:
			_warned_today = true
			dusk_warning.emit()
	var guard := 0
	while phase_time >= phase_duration() and guard < 64:
		guard += 1
		phase_time -= phase_duration()
		_enter_next_phase()


func _enter_next_phase() -> void:
	match phase:
		Phase.DAY:
			phase = Phase.DUSK
		Phase.DUSK:
			phase = Phase.NIGHT
		Phase.NIGHT:
			phase = Phase.DAWN
			nights_survived += 1
			night_survived.emit(nights_survived)
		Phase.DAWN:
			phase = Phase.DAY
			day += 1
			_warned_today = false
	phase_changed.emit(phase)


## Jump straight to the start of a phase (dev tools / tests). Passing through
## NIGHT -> DAWN still counts the night.
func skip_to(target: int) -> void:
	var guard := 0
	while phase != target and guard < 8:
		guard += 1
		phase_time = 0.0
		_enter_next_phase()
	phase_time = 0.0


## Clock time in hours, 0..24.
func hour() -> float:
	var h: float = PHASE_START_HOUR[phase] + PHASE_HOURS[phase] * phase_progress()
	return fposmod(h, 24.0)


func clock_text() -> String:
	var h := hour()
	var hh := int(h)
	var mm := int((h - hh) * 60.0)
	return "%02d:%02d" % [hh, mm]


func is_night() -> bool:
	return phase == Phase.NIGHT


## True from late dusk until early dawn, when monsters are out.
func monsters_active() -> bool:
	if phase == Phase.NIGHT:
		return true
	if phase == Phase.DUSK and phase_progress() > 0.6:
		return true
	if phase == Phase.DAWN and phase_progress() < 0.25:
		return true
	return false


## 0 = full daylight, 1 = deep night. Smooth through dusk and dawn.
func darkness() -> float:
	match phase:
		Phase.DAY:
			return 0.0
		Phase.DUSK:
			return smoothstep(0.0, 1.0, phase_progress())
		Phase.NIGHT:
			return 1.0
		Phase.DAWN:
			return 1.0 - smoothstep(0.0, 1.0, phase_progress())
	return 0.0


## Sun elevation in -1..1 (sin of the sun angle). 0 at 06:00 and 18:30-ish.
func sun_height() -> float:
	# Map hour so that sunrise is at 6:00 and sunset at 19:00.
	var h := hour()
	var day_frac := (h - 6.0) / 13.0  # 0 at sunrise, 1 at sunset
	if day_frac >= 0.0 and day_frac <= 1.0:
		return sin(day_frac * PI)
	# Night: sun below the horizon.
	var night_len := 11.0
	var t := fposmod(h - 19.0, 24.0) / night_len
	return -sin(clampf(t, 0.0, 1.0) * PI)


## Seconds until NIGHT begins (0 while it is night).
func seconds_until_night() -> float:
	match phase:
		Phase.DAY:
			return (phase_duration() - phase_time) + durations[Phase.DUSK]
		Phase.DUSK:
			return phase_duration() - phase_time
		Phase.NIGHT:
			return 0.0
		Phase.DAWN:
			return (phase_duration() - phase_time) + durations[Phase.DAY] + durations[Phase.DUSK]
	return 0.0


## The night currently happening, or the next one coming (1-based).
func night_number() -> int:
	if phase == Phase.DAWN:
		return day  # dawn belongs to the night that just ended
	return day


func to_dict() -> Dictionary:
	return {"phase": phase, "phase_time": phase_time, "day": day,
		"nights_survived": nights_survived, "warned": _warned_today}


func from_dict(d: Dictionary) -> void:
	phase = int(d.get("phase", Phase.DAY))
	phase_time = float(d.get("phase_time", 0.0))
	day = int(d.get("day", 1))
	nights_survived = int(d.get("nights_survived", 0))
	_warned_today = bool(d.get("warned", false))
