class_name SurvivalModel
extends RefCounted
## Player condition: health, hunger and warmth (body heat). Pure logic.
##
## tick() takes an environment Dictionary describing the player's situation:
##   ambient   : float 0..100  warmth the surroundings settle toward
##   heat      : float 0..1    campfire / torch heat felt right now
##   sheltered : bool          inside the tent (tent_warmth applies)
##   tent_warmth: float        warmth target inside the tent
##   resting   : bool          resting in tent / on a bench by the fire
##   rest_mult : float         healing multiplier while resting
##   sprinting : bool
##   raining   : bool
##   cold_mult : float         difficulty scaling for cooling
##   invulnerable : bool       dev god mode
## Hunger or warmth at zero drains health; health at zero is death.

signal died(cause: String)
signal changed()

var max_health := 100.0
var max_hunger := 100.0
var max_warmth := 100.0
var health := 100.0
var hunger := 100.0
var warmth := 100.0
var dead := false
var death_cause := ""
var cfg: Dictionary = {}
## Last computed warmth target; handy for HUD arrows.
var warmth_target := 100.0


func setup(c: Dictionary) -> void:
	cfg = c
	max_health = float(c.get("max_health", 100.0))
	max_hunger = float(c.get("max_hunger", 100.0))
	max_warmth = float(c.get("max_warmth", 100.0))
	health = max_health
	hunger = float(c.get("start_hunger", max_hunger))
	warmth = max_warmth * 0.9
	dead = false
	death_cause = ""


func _c(key: String, default: float) -> float:
	return float(cfg.get(key, default))


func tick(dt: float, env: Dictionary = {}) -> void:
	if dead or dt <= 0.0:
		return
	var sprinting := bool(env.get("sprinting", false))
	var raining := bool(env.get("raining", false))

	# Hunger
	var hunger_rate := _c("hunger_decay", 0.11) * (_c("hunger_sprint_mult", 1.6) if sprinting else 1.0)
	hunger = maxf(hunger - hunger_rate * dt, 0.0)

	# Warmth: settle toward the best available heat source.
	var ambient := float(env.get("ambient", 70.0))
	if raining:
		ambient -= _c("rain_ambient_penalty", 18.0)
	var target := ambient
	var heat := clampf(float(env.get("heat", 0.0)), 0.0, 1.0)
	target = maxf(target, lerpf(ambient, max_warmth, heat))
	if bool(env.get("sheltered", false)):
		target = maxf(target, float(env.get("tent_warmth", 55.0)))
	target = clampf(target, 0.0, max_warmth)
	warmth_target = target
	if warmth < target:
		var warm_speed := _c("warm_rate", 9.0) * (0.35 + 0.65 * maxf(heat, 0.5 if bool(env.get("sheltered", false)) else 0.25))
		warmth = minf(warmth + warm_speed * dt, target)
	elif warmth > target:
		var cool := _c("cool_rate", 1.6) * float(env.get("cold_mult", 1.0))
		if raining:
			cool *= _c("rain_cool_mult", 1.5)
		warmth = maxf(warmth - cool * dt, target)

	# Damage over time
	var dmg := 0.0
	var cause := ""
	if hunger <= 0.0:
		dmg += _c("starve_damage", 1.4)
		cause = "hunger"
	if warmth <= 0.0:
		dmg += _c("frozen_damage", 2.6)
		cause = "cold"
	elif warmth < _c("freezing_threshold", 18.0):
		dmg += _c("freeze_damage", 1.0)
		cause = "cold"
	if dmg > 0.0 and not bool(env.get("invulnerable", false)):
		damage(dmg * dt, cause)
	elif hunger >= _c("regen_hunger_min", 40.0) and warmth >= _c("regen_warmth_min", 45.0):
		var regen := _c("regen_rate", 0.55)
		if bool(env.get("resting", false)):
			regen *= float(env.get("rest_mult", _c("tent_rest_regen_mult", 2.0)))
		health = minf(health + regen * dt, max_health)
	changed.emit()


## Apply damage. Returns the amount actually applied.
func damage(amount: float, cause: String = "") -> float:
	if dead or amount <= 0.0:
		return 0.0
	var applied := minf(amount, health)
	health -= applied
	if health <= 0.0:
		health = 0.0
		dead = true
		death_cause = cause
		died.emit(cause)
	changed.emit()
	return applied


func heal(amount: float) -> void:
	if dead:
		return
	health = minf(health + amount, max_health)
	changed.emit()


## Eat a food item definition (from items.json). `roll` is a 0..1 random value
## used for raw-food sickness so callers control randomness.
## Returns {"food": gained, "sick": bool}.
func eat(def: Dictionary, roll: float = 1.0) -> Dictionary:
	if dead:
		return {"food": 0.0, "sick": false}
	var food := float(def.get("food", 0.0))
	var before := hunger
	hunger = minf(hunger + food, max_hunger)
	var heal_amt := float(def.get("heal", 0.0))
	if heal_amt > 0.0:
		health = minf(health + heal_amt, max_health)
	var sick := false
	if roll < float(def.get("sick_chance", 0.0)):
		sick = true
		# Tummy ache never kills: leave at least 1 health.
		health = maxf(health - float(def.get("sick_damage", 5.0)), minf(health, 1.0))
	changed.emit()
	return {"food": hunger - before, "sick": sick}


func warm_up(amount: float) -> void:
	warmth = clampf(warmth + amount, 0.0, max_warmth)
	changed.emit()


func is_starving() -> bool:
	return hunger <= 0.0


func is_freezing() -> bool:
	return warmth < _c("freezing_threshold", 18.0)


func health_fraction() -> float:
	return health / max_health


func to_dict() -> Dictionary:
	return {"health": health, "hunger": hunger, "warmth": warmth}


func from_dict(d: Dictionary) -> void:
	health = float(d.get("health", max_health))
	hunger = float(d.get("hunger", max_hunger))
	warmth = float(d.get("warmth", max_warmth))
	dead = health <= 0.0
