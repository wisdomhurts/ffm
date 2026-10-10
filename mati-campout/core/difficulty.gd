class_name Difficulty
extends RefCounted
## Night-by-night difficulty scaling. Pure functions of the night number and
## the balance tables, so every system scales consistently.


## Multiplier for monster health on a given night (night 1 = 1.0).
static func hp_mult(night: int, cfg: Dictionary) -> float:
	var g := float(cfg.get("enemy_hp_growth", 0.06))
	return minf(1.0 + g * maxf(night - 1, 0), float(cfg.get("max_mult", 2.2)))


static func damage_mult(night: int, cfg: Dictionary) -> float:
	var g := float(cfg.get("enemy_damage_growth", 0.04))
	return minf(1.0 + g * maxf(night - 1, 0), float(cfg.get("max_mult", 2.2)))


static func cold_mult(night: int, cfg: Dictionary) -> float:
	var g := float(cfg.get("cold_growth", 0.03))
	return minf(1.0 + g * maxf(night - 1, 0), 1.6)


## How many monsters of each kind should be out on this night.
## spawn = balance.spawning, fire_out = campfire currently extinguished.
static func monster_counts(night: int, spawn: Dictionary, fire_out: bool = false) -> Dictionary:
	var n := maxf(night - 1, 0)
	var stalkers := int(floor(float(spawn.get("stalker_base", 2)) + float(spawn.get("stalker_per_night", 0.6)) * n))
	stalkers = mini(stalkers, int(spawn.get("stalker_max", 9)))
	if fire_out:
		stalkers += int(spawn.get("fire_out_extra_stalkers", 2))
	var watchers := int(floor(float(spawn.get("watcher_base", 1)) + float(spawn.get("watcher_per_night", 0.25)) * n))
	watchers = mini(watchers, int(spawn.get("watcher_max", 4)))
	return {"night_stalker": stalkers, "watcher": watchers}


## True if the boss should appear on this night.
static func is_boss_night(night: int, boss_cfg: Dictionary) -> bool:
	var first := int(boss_cfg.get("first_night", 12))
	var every := maxi(int(boss_cfg.get("repeat_every", 4)), 1)
	return night >= first and (night - first) % every == 0


## 0-based count of previous boss appearances before this night.
static func boss_appearance_index(night: int, boss_cfg: Dictionary) -> int:
	var first := int(boss_cfg.get("first_night", 12))
	var every := maxi(int(boss_cfg.get("repeat_every", 4)), 1)
	if night < first:
		return -1
	return int((night - first) / every)
