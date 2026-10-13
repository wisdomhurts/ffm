class_name FloatText3D
extends Label3D
## A short world-space word that floats up and fades ("+3 Wood", "Bonk!").
##
## The player connects Events.float_text to FloatText3D.spawn, so any system
## can emit Events.float_text(world_pos, text, color). Set
## FloatText3D.enabled = false if another system (e.g. a 2D HUD layer)
## renders those events instead.

static var enabled := true
static var _live: Array = []

const LIFETIME := 1.25
const MAX_LIVE := 24

var _age := 0.0
var _rise := 1.1
var _drift := Vector3.ZERO
var _start := Vector3.ZERO


## Spawn under GameState.game.fx (falls back to the current scene).
static func spawn(world_pos: Vector3, text: String, color: Color = Color(1.0, 0.92, 0.7)) -> FloatText3D:
	if not enabled or text == "":
		return null
	var parent: Node = null
	var game: Node = GameState.game
	if game and is_instance_valid(game):
		parent = game.get("fx") as Node
	if parent == null:
		var tree := Engine.get_main_loop() as SceneTree
		if tree == null or tree.current_scene == null:
			return null
		parent = tree.current_scene
	# Keep the count bounded (rapid pickups).
	for i in range(_live.size() - 1, -1, -1):
		if not is_instance_valid(_live[i]):
			_live.remove_at(i)
	if _live.size() >= MAX_LIVE:
		var oldest: Node = _live.pop_front()
		if is_instance_valid(oldest):
			oldest.queue_free()
	var ft := FloatText3D.new()
	ft.text = text
	ft.modulate = color
	parent.add_child(ft)
	ft.global_position = world_pos
	ft._start = world_pos
	# Stack texts spawned at the same spot.
	var stacked := 0
	for other in _live:
		if is_instance_valid(other) and (other as FloatText3D)._start.distance_to(world_pos) < 0.8 and (other as FloatText3D)._age < 0.5:
			stacked += 1
	ft._start.y += stacked * 0.28
	ft._drift = Vector3(sin(float(Time.get_ticks_msec()) * 0.013) * 0.15, 0.0, cos(float(Time.get_ticks_msec()) * 0.011) * 0.15)
	_live.append(ft)
	return ft


func _ready() -> void:
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	billboard = BaseMaterial3D.BILLBOARD_ENABLED
	fixed_size = true
	pixel_size = 0.0014
	font_size = 34
	outline_size = 10
	outline_modulate = Color(0.08, 0.06, 0.05, 0.85)
	no_depth_test = true
	render_priority = 10
	outline_render_priority = 9
	shaded = false
	double_sided = true
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scale = Vector3.ONE * 0.6


func _process(delta: float) -> void:
	_age += delta
	var t := clampf(_age / LIFETIME, 0.0, 1.0)
	var ease_up := 1.0 - pow(1.0 - t, 3.0)
	global_position = _start + Vector3(0.0, _rise * ease_up, 0.0) + _drift * t
	# Pop in, then fade out.
	var pop := minf(_age / 0.12, 1.0)
	scale = Vector3.ONE * lerpf(0.6, 1.0, pop) * (1.0 + 0.15 * (1.0 - pop))
	var a := 1.0 - smoothstep(0.6, 1.0, t)
	modulate.a = a
	outline_modulate.a = 0.85 * a
	if _age >= LIFETIME:
		queue_free()
