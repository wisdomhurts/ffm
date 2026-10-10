extends Node
## Registers every input action in code (keyboard/mouse + gamepad) so the
## bindings live in one readable place.
##
## Actions:
##   move_forward/back/left/right   WASD / left stick
##   look_left/right/up/down        right stick (mouse look is handled by the camera)
##   sprint                         Shift / left trigger or L3
##   jump                           Space / A
##   interact                       E / X (Xbox) - Square (PS)
##   use                            Left mouse / right trigger
##   slot_1 .. slot_7               1-7
##   next_item / prev_item          wheel down/up, RB/LB
##   toggle_sack                    Tab / d-pad down   (show the extra sack row)
##   map                            M / Y
##   build                          B / d-pad up
##   drop_item                      Q / d-pad left (hold)
##   flashlight                     F / d-pad right
##   pause                          Esc / Start
##   ui_* actions keep Godot's defaults for menus.

const DEADZONE := 0.22

## True if the last input came from a gamepad (for button prompts).
var using_gamepad := false


func _ready() -> void:
	_key("move_forward", [KEY_W, KEY_UP])
	_key("move_back", [KEY_S, KEY_DOWN])
	_key("move_left", [KEY_A, KEY_LEFT])
	_key("move_right", [KEY_D, KEY_RIGHT])
	_axis("move_forward", JOY_AXIS_LEFT_Y, -1.0)
	_axis("move_back", JOY_AXIS_LEFT_Y, 1.0)
	_axis("move_left", JOY_AXIS_LEFT_X, -1.0)
	_axis("move_right", JOY_AXIS_LEFT_X, 1.0)

	_ensure("look_left"); _axis("look_left", JOY_AXIS_RIGHT_X, -1.0)
	_ensure("look_right"); _axis("look_right", JOY_AXIS_RIGHT_X, 1.0)
	_ensure("look_up"); _axis("look_up", JOY_AXIS_RIGHT_Y, -1.0)
	_ensure("look_down"); _axis("look_down", JOY_AXIS_RIGHT_Y, 1.0)

	_key("sprint", [KEY_SHIFT])
	_axis("sprint", JOY_AXIS_TRIGGER_LEFT, 1.0)
	_joy("sprint", JOY_BUTTON_LEFT_STICK)
	_key("jump", [KEY_SPACE])
	_joy("jump", JOY_BUTTON_A)
	_key("interact", [KEY_E])
	_joy("interact", JOY_BUTTON_X)
	_mouse("use", MOUSE_BUTTON_LEFT)
	_axis("use", JOY_AXIS_TRIGGER_RIGHT, 1.0)
	for i in 7:
		_key("slot_%d" % (i + 1), [KEY_1 + i])
	_mouse("next_item", MOUSE_BUTTON_WHEEL_DOWN)
	_mouse("prev_item", MOUSE_BUTTON_WHEEL_UP)
	_joy("next_item", JOY_BUTTON_RIGHT_SHOULDER)
	_joy("prev_item", JOY_BUTTON_LEFT_SHOULDER)
	_key("toggle_sack", [KEY_TAB])
	_joy("toggle_sack", JOY_BUTTON_DPAD_DOWN)
	_key("map", [KEY_M])
	_joy("map", JOY_BUTTON_Y)
	_key("build", [KEY_B])
	_joy("build", JOY_BUTTON_DPAD_UP)
	_key("drop_item", [KEY_Q])
	_joy("drop_item", JOY_BUTTON_DPAD_LEFT)
	_key("flashlight", [KEY_F])
	_joy("flashlight", JOY_BUTTON_DPAD_RIGHT)
	_key("pause", [KEY_ESCAPE])
	_joy("pause", JOY_BUTTON_START)
	_joy("ui_cancel", JOY_BUTTON_B)
	# Dev tools (ignored unless dev mode is on)
	for k in [KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F9, KEY_F10]:
		_key("dev_f%d" % (k - KEY_F1 + 1), [k])


func _ensure(action: String) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, DEADZONE)


func _key(action: String, keys: Array) -> void:
	_ensure(action)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)


func _mouse(action: String, button: int) -> void:
	_ensure(action)
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)


func _joy(action: String, button: int) -> void:
	_ensure(action)
	var ev := InputEventJoypadButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)


func _axis(action: String, axis: int, dir: float) -> void:
	_ensure(action)
	var ev := InputEventJoypadMotion.new()
	ev.axis = axis
	ev.axis_value = dir
	InputMap.action_add_event(action, ev)


func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton or (event is InputEventJoypadMotion and absf(event.axis_value) > 0.4):
		using_gamepad = true
	elif event is InputEventKey or event is InputEventMouseButton:
		using_gamepad = false


## Button label for prompts, e.g. prompt("interact") -> "E" or "X".
func prompt(action: String) -> String:
	if using_gamepad:
		return {"interact": "X", "use": "RT", "jump": "A", "sprint": "LT", "map": "Y",
			"build": "D-Pad Up", "toggle_sack": "D-Pad Down", "pause": "Start",
			"flashlight": "D-Pad Right", "drop_item": "D-Pad Left"}.get(action, action)
	return {"interact": "E", "use": "Click", "jump": "Space", "sprint": "Shift", "map": "M",
		"build": "B", "toggle_sack": "Tab", "pause": "Esc", "flashlight": "F", "drop_item": "Q"}.get(action, action)
