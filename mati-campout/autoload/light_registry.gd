extends Node
## Registry of protective light sources (campfire, lantern posts, flashlight
## beam, torches, starsteel glow) plus global daylight.
##
## A light source is any Object with:
##     func light_intensity_at(pos: Vector3) -> float
## returning roughly 1.0 at full brightness, ~0.35 at the edge of its useful
## radius and 0.0 outside it. Monsters compare intensity_at(their position)
## with their "light_fear" value and back off when it is higher.
## The boss ignores this entirely.

var sources: Array = []
## 0 = night, 1 = full day. Set by the environment controller.
var daylight: float = 1.0


func register(source: Object) -> void:
	if source and not sources.has(source):
		sources.append(source)


func unregister(source: Object) -> void:
	sources.erase(source)


func clear() -> void:
	sources.clear()


## Strongest light at a position. include_daylight=false gives artificial light only.
func intensity_at(pos: Vector3, include_daylight: bool = true) -> float:
	var best := daylight if include_daylight else 0.0
	for i in range(sources.size() - 1, -1, -1):
		var s: Object = sources[i]
		if not is_instance_valid(s):
			sources.remove_at(i)
			continue
		best = maxf(best, float(s.call("light_intensity_at", pos)))
	return best


func is_lit(pos: Vector3, threshold: float = 0.35, include_daylight: bool = true) -> bool:
	return intensity_at(pos, include_daylight) >= threshold


## Direction a light-fearing creature should flee (away from the brightest
## source affecting it). Zero if nothing is shining on it.
func flee_direction(pos: Vector3) -> Vector3:
	var best := 0.0
	var dir := Vector3.ZERO
	for s in sources:
		if not is_instance_valid(s):
			continue
		var v := float(s.call("light_intensity_at", pos))
		if v > best and s is Node3D:
			best = v
			dir = pos - (s as Node3D).global_position
			if s.has_method("light_origin"):
				dir = pos - s.call("light_origin")
	dir.y = 0.0
	return dir.normalized() if dir.length() > 0.01 else Vector3.ZERO
