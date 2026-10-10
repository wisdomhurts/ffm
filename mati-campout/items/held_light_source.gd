class_name HeldLightSource
extends Node3D
## A protective light carried by the player (flashlight cone or torch glow),
## registered with the Lights autoload while `active`.
##
## Light-source contract (autoload/light_registry.gd):
##   light_intensity_at(pos) -> float   ~1 bright, 0.35 edge of safety, 0 none
##   light_origin() -> Vector3
## Cone mode shines along this node's -Z axis.

enum Mode { RADIUS, CONE }

var mode: int = Mode.RADIUS
## Radius (RADIUS) or beam range (CONE) in metres.
var reach := 6.5
## Half-angle of the cone in degrees.
var angle_deg := 28.0
## Intensity at the heart of the light (balance flashlight/torch fear_strength).
var strength := 0.6
var active := false:
	set(v):
		if v == active:
			return
		active = v
		if not is_inside_tree():
			return
		if active:
			Lights.register(self)
		else:
			Lights.unregister(self)


func _enter_tree() -> void:
	if active:
		Lights.register(self)


func _exit_tree() -> void:
	Lights.unregister(self)


func light_origin() -> Vector3:
	return global_position


func light_intensity_at(pos: Vector3) -> float:
	if not active or not is_inside_tree():
		return 0.0
	var origin := global_position
	if mode == Mode.CONE:
		# Test the creature's body (not its feet) against the beam.
		var target := pos + Vector3(0.0, 0.9, 0.0)
		var d := target - origin
		var dist := d.length()
		if dist > reach:
			return 0.0
		if dist < 1.2:
			return strength
		var fwd := -global_basis.z.normalized()
		var cos_a := fwd.dot(d / dist)
		var edge := cos(deg_to_rad(angle_deg))
		if cos_a < edge:
			return 0.0
		var centre := smoothstep(edge, lerpf(edge, 1.0, 0.35), cos_a)
		var falloff := 1.0 - smoothstep(reach * 0.7, reach, dist)
		return maxf(strength * centre * falloff, 0.36 * falloff) if centre > 0.0 else 0.0
	var dr := Vector2(pos.x - origin.x, pos.z - origin.z).length()
	if dr > reach:
		return 0.0
	return lerpf(strength, 0.3, smoothstep(reach * 0.4, reach, dr))
