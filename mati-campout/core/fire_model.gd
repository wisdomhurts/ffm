class_name FireModel
extends RefCounted
## The campfire's simulation: fuel, burn rate, level (1..3) and the derived
## light/warmth radii. Visuals live in camp/campfire.gd and read from here.
##
## States:
##   STRONG - fuel fraction above low_fraction
##   LOW    - lit but running out (shrinking light, warnings)
##   OUT    - not burning; no light, no warmth, no protection
## A fire that is OUT stays out until relit with an ignition item (kindling).

signal state_changed(state: int)
signal fuel_changed(fuel: float, max_fuel: float)
signal level_changed(level: int)
signal extinguished()
signal relit()

enum State { STRONG, LOW, OUT }

const MAX_LEVEL := 3

var level: int = 1
var fuel: float = 0.0
var lit: bool = true
## Per-level stats: [{max_fuel, light_radius, warmth_radius, efficiency, intensity}, ...]
var levels: Array = []
var low_fraction: float = 0.3
var rain_burn_mult: float = 1.25
var min_radius_fraction: float = 0.45
var fuel_values: Dictionary = {"wood": 40.0, "kindling": 10.0, "coal": 110.0}
var _last_state: int = State.STRONG


func _init() -> void:
	levels = [
		{"max_fuel": 150.0, "light_radius": 14.0, "warmth_radius": 9.0, "efficiency": 1.0, "intensity": 1.0},
		{"max_fuel": 240.0, "light_radius": 18.0, "warmth_radius": 12.0, "efficiency": 0.85, "intensity": 1.3},
		{"max_fuel": 360.0, "light_radius": 23.0, "warmth_radius": 15.0, "efficiency": 0.7, "intensity": 1.6},
	]


## cfg = balance.fire, level_defs = upgrades.fire.levels, fuels = item_id -> seconds
func setup(cfg: Dictionary, level_defs: Array, fuels: Dictionary) -> void:
	if not level_defs.is_empty():
		levels = []
		for d in level_defs:
			levels.append({
				"max_fuel": float(d.get("max_fuel", 150.0)),
				"light_radius": float(d.get("light_radius", 14.0)),
				"warmth_radius": float(d.get("warmth_radius", 9.0)),
				"efficiency": float(d.get("efficiency", 1.0)),
				"intensity": float(d.get("intensity", 1.0)),
			})
	low_fraction = float(cfg.get("low_fraction", low_fraction))
	rain_burn_mult = float(cfg.get("rain_burn_mult", rain_burn_mult))
	min_radius_fraction = float(cfg.get("min_radius_fraction", min_radius_fraction))
	if not fuels.is_empty():
		fuel_values = fuels.duplicate()
	level = 1
	fuel = max_fuel() * float(cfg.get("start_fuel_fraction", 0.85))
	lit = fuel > 0.0
	_last_state = state()


func stats() -> Dictionary:
	return levels[clampi(level, 1, levels.size()) - 1]


func max_level() -> int:
	return mini(MAX_LEVEL, levels.size())


func max_fuel() -> float:
	return float(stats()["max_fuel"])


func fraction() -> float:
	return clampf(fuel / max_fuel(), 0.0, 1.0)


func state() -> int:
	if not lit or fuel <= 0.0:
		return State.OUT
	if fraction() <= low_fraction:
		return State.LOW
	return State.STRONG


func state_name() -> String:
	return ["Strong", "Low", "Out"][state()]


func is_lit() -> bool:
	return state() != State.OUT


## 0..1 strength of the fire; drives light energy, protection and warmth.
func strength() -> float:
	if not is_lit():
		return 0.0
	var f := fraction()
	# Ramps from min_radius_fraction at empty to 1.0 at 60% fuel and above.
	return lerpf(min_radius_fraction, 1.0, clampf(f / 0.6, 0.0, 1.0))


func light_radius() -> float:
	return float(stats()["light_radius"]) * strength()


func warmth_radius() -> float:
	return float(stats()["warmth_radius"]) * strength()


func visual_intensity() -> float:
	return float(stats()["intensity"]) * strength()


## Protective light at a distance from the fire: 1 at the centre, the
## light_fear_edge value (~0.35) at the light radius, 0 by 1.3x the radius.
func light_at_distance(d: float, edge: float = 0.35) -> float:
	var r := light_radius()
	if r <= 0.0:
		return 0.0
	if d <= r:
		var t := d / r
		return 1.0 - (1.0 - edge) * t * t
	var outer := r * 1.3
	if d >= outer:
		return 0.0
	return edge * (1.0 - (d - r) / (outer - r))


## 0..1 heat felt at a distance (1 near the flames, 0 at the warmth radius).
func heat_at_distance(d: float) -> float:
	var r := warmth_radius()
	if r <= 0.0 or d >= r:
		return 0.0
	return clampf(1.0 - pow(d / r, 1.6), 0.0, 1.0) * clampf(strength() * 1.25, 0.0, 1.0)


func burn(dt: float, raining: bool = false) -> void:
	if not lit or dt <= 0.0:
		return
	var eff := float(stats()["efficiency"])
	var mult := rain_burn_mult if raining else 1.0
	fuel = maxf(fuel - dt * eff * mult, 0.0)
	fuel_changed.emit(fuel, max_fuel())
	if fuel <= 0.0:
		lit = false
		extinguished.emit()
	_check_state()


func fuel_value(item_id: String) -> float:
	return float(fuel_values.get(item_id, 0.0))


func is_fuel(item_id: String) -> bool:
	return fuel_value(item_id) > 0.0


## True when the fire has room for this item's fuel (a nearly full fire still
## accepts it; extra is wasted only beyond the max).
func can_accept(item_id: String) -> bool:
	return is_fuel(item_id) and fuel < max_fuel() - 1.0


## Feed a lit fire. Returns false when the fire is out (use relight) or full.
func add_fuel(item_id: String) -> bool:
	if not lit or not can_accept(item_id):
		return false
	fuel = minf(fuel + fuel_value(item_id), max_fuel())
	fuel_changed.emit(fuel, max_fuel())
	_check_state()
	return true


## Relight a dead fire with one ignition item plus one fuel item.
func relight(ignition_id: String, fuel_id: String) -> bool:
	if lit:
		return false
	if not is_fuel(fuel_id):
		return false
	fuel = minf(fuel + fuel_value(fuel_id) + fuel_value(ignition_id), max_fuel())
	lit = true
	fuel_changed.emit(fuel, max_fuel())
	relit.emit()
	_check_state()
	return true


func can_upgrade() -> bool:
	return level < max_level()


func upgrade() -> bool:
	if not can_upgrade():
		return false
	var frac := fraction()
	level += 1
	fuel = max_fuel() * frac
	level_changed.emit(level)
	fuel_changed.emit(fuel, max_fuel())
	return true


## Force the fire out (dev tools, storms).
func extinguish() -> void:
	fuel = 0.0
	if lit:
		lit = false
		extinguished.emit()
	fuel_changed.emit(fuel, max_fuel())
	_check_state()


func _check_state() -> void:
	var s := state()
	if s != _last_state:
		_last_state = s
		state_changed.emit(s)


func to_dict() -> Dictionary:
	return {"level": level, "fuel": fuel, "lit": lit}


func from_dict(d: Dictionary) -> void:
	level = clampi(int(d.get("level", 1)), 1, max_level())
	fuel = clampf(float(d.get("fuel", 0.0)), 0.0, max_fuel())
	lit = bool(d.get("lit", fuel > 0.0)) and fuel > 0.0
	_last_state = state()
