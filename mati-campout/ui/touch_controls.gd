class_name TouchControls
extends Control
## On-screen controls for phones and tablets. The HUD adds this on touch
## devices (Platform.is_touch_device()) as the bottom-most child of its
## ScaledRoot and it shows itself only in touch mode (Platform.is_touch(),
## i.e. the last input was a touch), so the hotbar, prompts and modals stay
## above it and taps on them still reach them.
##
## - Left ~42 % of the screen: a floating joystick. It appears where the
##   thumb lands (a faint ghost shows where to put it), follows the thumb if
##   it wanders past the rim, and drives the move_* actions with analog
##   strength (gentle push = walk slowly).
## - Drag anywhere else to look around (Player.add_look_input()).
## - Right side: USE (shows the held item: CHOP / HIT / EAT ...; the same path
##   as a left click, plus a gentle aim assist toward the nearest tree or
##   creature in front), JUMP, RUN (a toggle, lit while on, switches itself
##   off when you stop) and a context button with the current prompt ("Add
##   Wood to fire") that calls player.interact_nearest(). A greyed button
##   explains what is missing ("Need Kindling...").
## - Top-right: Pause, plus Map and Build when those windows exist. The sack
##   badge on the hotbar toggles the extra sack rows; slots are tappable.
##
## Every finger is tracked by its touch index (Godot routes each touch to the
## Control under it), so moving, looking and pressing buttons all work at the
## same time. Mouse events emulated from touches are swallowed here so they
## never reach the game as clicks.

const JOY_ZONE := 0.42          # fraction of the width that starts the joystick
const JOY_TOP := 0.24           # ... below this fraction of the height
const JOY_RADIUS := 104.0
const KNOB_RADIUS := 46.0
const JOY_DEADZONE := 0.14
const LOOK_SENS := 2.8          # radians per screen-height of drag (x setting)
const MARGIN := 28.0
const SPRINT_IDLE_OFF := 1.2    # RUN switches off after standing still this long

var hud: Node = null
var hotbar: Hotbar = null

var use_btn: TouchButton
var jump_btn: TouchButton
var run_btn: TouchButton
var act_btn: TouchButton
var pause_btn: TouchButton
var map_btn: TouchButton
var build_btn: TouchButton
var buttons: Array[TouchButton] = []

var _joy_index := -1
var _joy_center := Vector2.ZERO
var _joy_knob := Vector2.ZERO
var _joy_vec := Vector2.ZERO
var _look_index := -1
var _look_last := Vector2.ZERO
var _sprint := false
var _idle_t := 0.0
var _shown := false
var _alpha := 0.0
var _moved_once := false
var _looked_once := false
var _hint_t := 0.0
var _use_down := false
var _jump_t := 0.0
var _act_text := ""
var _act_hint := false
var _pressed_actions: Dictionary = {}
var _avail_t := 0.0


func _init() -> void:
	name = "TouchControls"
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_NONE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _ready() -> void:
	use_btn = _add_button("use", 82.0, "USE")
	use_btn.pressed.connect(_on_use_down)
	use_btn.released.connect(_on_use_up)
	jump_btn = _add_button("jump", 56.0, "JUMP")
	jump_btn.glyph = "jump"
	jump_btn.pressed.connect(_on_jump)
	jump_btn.released.connect(func() -> void: _release_action("jump"))
	run_btn = _add_button("run", 48.0, "RUN", "ui_boot")
	run_btn.pressed.connect(_on_run)
	act_btn = _add_button("act", 46.0, "")
	act_btn.pill = true
	act_btn.accent = ThemeFactory.AMBER
	act_btn.pressed.connect(_on_act)
	pause_btn = _add_button("pause", 38.0, "", "")
	pause_btn.glyph = "pause"
	pause_btn.small = true
	pause_btn.pressed.connect(func() -> void: _open("pause"))
	map_btn = _add_button("map", 38.0, "", "ui_map")
	map_btn.small = true
	map_btn.pressed.connect(func() -> void: _open("map"))
	build_btn = _add_button("build", 38.0, "", "ui_tent")
	build_btn.small = true
	build_btn.pressed.connect(func() -> void: _open("build"))
	Events.input_mode_changed.connect(func(_t: bool) -> void: _sync_visibility(true))
	Events.ui_modal_opened.connect(func(_n: String) -> void: release_all())
	Events.player_died.connect(func(_c: String) -> void: release_all())
	Events.device_paused.connect(func(p: bool, _r: String) -> void:
		if p:
			release_all())
	_sync_visibility(true)


func _add_button(id: String, radius: float, label: String, icon_id: String = "") -> TouchButton:
	var b := TouchButton.new()
	b.name = "Btn_" + id
	b.id = id
	b.radius = radius
	b.label = label
	if icon_id != "":
		b.icon = ThemeFactory.icon(icon_id)
	add_child(b)
	buttons.append(b)
	return b


# --- Visibility -----------------------------------------------------------------------

## Shown while touch mode is on and the run is being played with no modal.
func wants_visible() -> bool:
	if not Platform.is_touch():
		return false
	if not GameState.is_playing() or GameState.survival.dead:
		return false
	if hud and hud.has_method("is_modal_open") and bool(hud.call("is_modal_open")):
		return false
	return true


func _sync_visibility(instant: bool = false) -> void:
	var want := wants_visible()
	if want != _shown:
		_shown = want
		if not want:
			release_all()
	visible = _shown or _alpha > 0.01
	mouse_filter = Control.MOUSE_FILTER_STOP if _shown else Control.MOUSE_FILTER_IGNORE
	if instant:
		_alpha = 1.0 if _shown else 0.0
		modulate.a = _alpha


## Let go of everything (modal opened, paused, died, touch mode off).
func release_all() -> void:
	_end_joy()
	_look_index = -1
	for b in buttons:
		b.force_release()
	if _use_down:
		_use_down = false
		_send_action("use", false)
	for a in _pressed_actions.keys():
		_release_action(str(a))
	_set_sprint(false)


# --- Input ------------------------------------------------------------------------------

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		if t.pressed:
			if _joy_index < 0 and _in_joy_zone(t.position):
				_start_joy(t.index, t.position)
			elif _look_index < 0 and t.index != _joy_index:
				_look_index = t.index
				_look_last = t.position
		else:
			if t.index == _joy_index:
				_end_joy()
			elif t.index == _look_index:
				_look_index = -1
		accept_event()
	elif event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		if d.index == _joy_index:
			_move_joy(d.position)
		elif d.index == _look_index:
			_look(d.position)
		accept_event()
	elif event is InputEventMouse:
		# Mouse events emulated from touches: never a game click.
		accept_event()


func _in_joy_zone(p: Vector2) -> bool:
	return p.x < size.x * JOY_ZONE and p.y > size.y * JOY_TOP


## Where the joystick ghost rests (and where it starts if it can't fit).
func joy_rest() -> Vector2:
	return Vector2(MARGIN + JOY_RADIUS + 26.0, size.y - MARGIN - JOY_RADIUS - 34.0)


func _start_joy(index: int, p: Vector2) -> void:
	_joy_index = index
	var r := JOY_RADIUS
	_joy_center = Vector2(clampf(p.x, r + 8.0, size.x - r - 8.0), clampf(p.y, r + 8.0, size.y - r - 8.0))
	_joy_knob = p
	_moved_once = true
	_update_joy()


func _move_joy(p: Vector2) -> void:
	# The base follows a thumb that slides past the rim (no "dead" joystick).
	var off := p - _joy_center
	var lim := JOY_RADIUS * 1.25
	if off.length() > lim:
		_joy_center += off.normalized() * (off.length() - lim)
	_joy_knob = p
	_update_joy()


func _end_joy() -> void:
	_joy_index = -1
	_joy_vec = Vector2.ZERO
	for a in ["move_left", "move_right", "move_forward", "move_back"]:
		Input.action_release(a)
	queue_redraw()


func _update_joy() -> void:
	var off := _joy_knob - _joy_center
	var v := off / JOY_RADIUS
	var l := v.length()
	if l > 1.0:
		v /= l
		l = 1.0
	if l < JOY_DEADZONE:
		v = Vector2.ZERO
	else:
		# Rescale past the deadzone; gentle curve for fine walking control.
		var k := (l - JOY_DEADZONE) / (1.0 - JOY_DEADZONE)
		v = v / l * clampf(k * (0.6 + 0.4 * k) + 0.05, 0.0, 1.0)
	set_move_vector(v)
	queue_redraw()


## Drive the move_* actions so Input.get_vector() returns `v` (length 0..1).
## Public for tests and other touch widgets.
func set_move_vector(v: Vector2) -> void:
	_joy_vec = v
	var dz := Controls.DEADZONE
	var l := v.length()
	if l <= 0.001:
		for a in ["move_left", "move_right", "move_forward", "move_back"]:
			Input.action_release(a)
		return
	# Input.get_vector() maps raw length dz..1 -> 0..1; undo that.
	var raw := v / l * (dz + (1.0 - dz) * clampf(l, 0.0, 1.0))
	_axis("move_left", "move_right", raw.x)
	_axis("move_forward", "move_back", raw.y)


func _axis(neg: String, pos: String, value: float) -> void:
	if value > 0.0005:
		Input.action_release(neg)
		Input.action_press(pos, minf(value, 1.0))
	elif value < -0.0005:
		Input.action_release(pos)
		Input.action_press(neg, minf(-value, 1.0))
	else:
		Input.action_release(neg)
		Input.action_release(pos)


func _look(p: Vector2) -> void:
	var d := p - _look_last
	_look_last = p
	if d == Vector2.ZERO:
		return
	_looked_once = true
	var sens := float(Settings.get_value("touch_sensitivity"))
	var k := LOOK_SENS * sens / maxf(size.y, 1.0)
	var pl := GameState.player
	if pl and is_instance_valid(pl) and pl.has_method("add_look_input"):
		pl.call("add_look_input", Vector2(d.x * k, d.y * k * 0.8))


# --- Buttons -------------------------------------------------------------------------

func _player() -> Node:
	var p := GameState.player
	return p if p and is_instance_valid(p) else null


func _on_use_down() -> void:
	var p := _player()
	if p and p.has_method("aim_assist"):
		p.call("aim_assist")
	_use_down = true
	_send_action("use", true)


func _on_use_up() -> void:
	if _use_down:
		_use_down = false
		_send_action("use", false)


func _on_jump() -> void:
	_send_action("jump", true)
	_pressed_actions["jump"] = true
	_jump_t = 0.25


func _on_run() -> void:
	_set_sprint(not _sprint)
	Audio.play_ui("ui_click")


func _set_sprint(on: bool) -> void:
	_sprint = on
	_idle_t = 0.0
	if run_btn:
		run_btn.lit = on
		run_btn.queue_redraw()
	var p := _player()
	if p and "touch_sprint" in p:
		p.set("touch_sprint", on)


func _on_act() -> void:
	var p := _player()
	if p and p.has_method("interact_nearest"):
		p.call("interact_nearest")


func _open(modal: String) -> void:
	release_all()
	if hud and hud.has_method("open_modal"):
		hud.call("open_modal", modal)


## Send an action through the input pipeline exactly like a key press, so
## the player's _unhandled_input / is_action_* checks see it.
func _send_action(action: String, pressed: bool) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = pressed
	ev.strength = 1.0 if pressed else 0.0
	Input.parse_input_event(ev)


func _release_action(action: String) -> void:
	if _pressed_actions.has(action):
		_pressed_actions.erase(action)
		_send_action(action, false)


# --- Per frame ------------------------------------------------------------------------

func _process(delta: float) -> void:
	_sync_visibility()
	_alpha = move_toward(_alpha, 1.0 if _shown else 0.0, delta * 6.0)
	modulate.a = _alpha
	if not visible:
		return
	_hint_t += delta
	if _jump_t > 0.0:
		_jump_t -= delta
		if _jump_t <= 0.0 and not jump_btn.is_down():
			_release_action("jump")
	# RUN turns itself off after standing still for a moment.
	if _sprint:
		if _joy_vec.length() < 0.1 and Input.get_vector("move_left", "move_right", "move_forward", "move_back").length() < 0.1:
			_idle_t += delta
			if _idle_t > SPRINT_IDLE_OFF:
				_set_sprint(false)
		else:
			_idle_t = 0.0
	_update_use_button()
	_update_act_button()
	_avail_t -= delta
	if _avail_t <= 0.0:
		_avail_t = 2.0
		map_btn.visible = ResourceLoader.exists("res://ui/map_ui.gd")
		build_btn.visible = ResourceLoader.exists("res://ui/build_ui.gd")
	_layout()
	queue_redraw()


func _update_use_button() -> void:
	var id := GameState.selected_item_id()
	var kind := DB.item_kind(id) if id != "" else ""
	var def := DB.item(id) if id != "" else {}
	var label := "USE"
	var dim := false
	match kind:
		"tool":
			label = "CHOP"
		"weapon":
			label = "SHOOT" if str(def.get("weapon", "")) == "gun" else "HIT"
		"food":
			label = "EAT"
		"medical":
			label = "HEAL"
		"light":
			label = "LIGHT"
		"":
			dim = true
		_:
			dim = id != "battery"
	use_btn.label = label
	use_btn.icon = ThemeFactory.icon(id) if id != "" else null
	use_btn.dim = dim


func _update_act_button() -> void:
	var p := _player()
	var text := ""
	var hint := false
	if p and p.has_method("get_interact_text_full") and not GameState.ui_blocking:
		var full: Variant = p.call("get_interact_text_full")
		if full is Dictionary:
			text = str((full as Dictionary).get("text", ""))
			if text == "":
				text = str((full as Dictionary).get("hint", ""))
				hint = text != ""
	if text != _act_text or hint != _act_hint:
		_act_text = text
		_act_hint = hint
		act_btn.label = text
		act_btn.dim = hint
		act_btn.icon = ThemeFactory.icon(_context_icon(text))
		if text == "":
			act_btn.force_release()
	act_btn.visible = text != ""


static func _context_icon(text: String) -> String:
	var t := text.to_lower()
	if "fire" in t or "relight" in t or "kindling" in t:
		return "ui_fire"
	if "chest" in t or "open" in t:
		return "ui_chest"
	if "tent" in t or "sleep" in t or "rest" in t:
		return "ui_tent"
	if "craft" in t or "crate" in t or "storage" in t or "box" in t:
		return "ui_star"
	if "pick" in t or "take" in t:
		return "ui_sack"
	if "eat" in t or "cook" in t:
		return "ui_hunger"
	return "ui_check"


func _layout() -> void:
	var w := size.x
	var h := size.y
	var uc := Vector2(w - MARGIN - use_btn.radius, h - MARGIN - use_btn.radius)
	use_btn.place(uc)
	jump_btn.place(uc + Vector2.from_angle(deg_to_rad(232.0)) * 152.0)
	run_btn.place(uc + Vector2.from_angle(deg_to_rad(282.0)) * 146.0)
	# Context button: a pill above the cluster, right-aligned.
	var pw := act_btn.pill_width()
	var top := minf(jump_btn.position.y, run_btn.position.y)
	act_btn.place_rect(Rect2(Vector2(w - MARGIN - pw, top - 22.0 - act_btn.radius * 2.0), Vector2(pw, act_btn.radius * 2.0)))
	# Small buttons: top-right column.
	var c := Vector2(w - MARGIN * 0.6 - pause_btn.radius, MARGIN * 0.6 + pause_btn.radius)
	pause_btn.place(c)
	var y := c.y + pause_btn.radius * 2.0 + 16.0
	for b in [map_btn, build_btn]:
		if b.visible:
			b.place(Vector2(c.x, y))
			y += b.radius * 2.0 + 16.0


## Top of the right-hand button cluster incl. the context button (layout units).
func cluster_top() -> float:
	if act_btn == null:
		return size.y - 400.0
	return act_btn.position.y if act_btn.size.y > 1.0 else size.y - 400.0


## Room the touch buttons need on the right of the top HUD row (layout units).
func top_right_reserve() -> float:
	return MARGIN * 0.6 + pause_btn.radius * 2.0 + 14.0 if pause_btn else 0.0


# --- Drawing -------------------------------------------------------------------------

func _draw() -> void:
	if not _shown and _alpha <= 0.01:
		return
	var f := ThemeFactory.font("display")
	if _joy_index >= 0:
		_draw_joy(_joy_center, _joy_knob, 1.0)
	else:
		var rest := joy_rest()
		var bob := sin(_hint_t * 2.2) * 4.0 if not _moved_once else 0.0
		_draw_joy(rest, rest + Vector2(0, bob), 0.42)
		if not _moved_once:
			_hint_label(f, "Move", rest + Vector2(0, JOY_RADIUS + 30.0))
	if not _looked_once:
		var a := 0.55 + 0.25 * sin(_hint_t * 2.0)
		var p := Vector2(size.x * 0.66, size.y * 0.5)
		_draw_swipe_hint(p, a)
		_hint_label(f, "Drag to look", p + Vector2(0, 58.0))


func _draw_joy(center: Vector2, knob: Vector2, a: float) -> void:
	var hc := ThemeFactory.high_contrast()
	var base := Color(0.04, 0.08, 0.06, (0.42 if not hc else 0.7) * a)
	draw_circle(center, JOY_RADIUS + 6.0, Color(0, 0, 0, 0.18 * a))
	draw_circle(center, JOY_RADIUS, base)
	draw_arc(center, JOY_RADIUS, 0.0, TAU, 72, Color(1.0, 0.85, 0.6, 0.45 * a), 4.0, true)
	draw_arc(center, JOY_RADIUS * 0.55, 0.0, TAU, 48, Color(1.0, 0.85, 0.6, 0.14 * a), 2.0, true)
	# Direction ticks.
	for i in 4:
		var ang := float(i) * PI * 0.5 - PI * 0.5
		var d := Vector2.from_angle(ang)
		var tip := center + d * (JOY_RADIUS - 14.0)
		var side := d.orthogonal() * 9.0
		draw_colored_polygon(PackedVector2Array([tip, tip - d * 13.0 + side, tip - d * 13.0 - side]), Color(1.0, 0.9, 0.7, 0.5 * a))
	var off := knob - center
	if off.length() > JOY_RADIUS:
		off = off.normalized() * JOY_RADIUS
	var kp := center + off
	draw_circle(kp + Vector2(0, 4), KNOB_RADIUS, Color(0, 0, 0, 0.3 * a))
	draw_circle(kp, KNOB_RADIUS, Color(0.97, 0.92, 0.82, 0.9 * a))
	draw_circle(kp - Vector2(0, 3), KNOB_RADIUS - 8.0, Color(1.0, 0.98, 0.93, 0.95 * a))
	draw_arc(kp, KNOB_RADIUS, 0.0, TAU, 48, Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, 0.95 * a), 4.0, true)


func _draw_swipe_hint(p: Vector2, a: float) -> void:
	var col := Color(1.0, 0.95, 0.85, 0.5 * a)
	var t := fposmod(_hint_t * 0.7, 1.0)
	var x := lerpf(-60.0, 60.0, 0.5 - 0.5 * cos(t * TAU))
	draw_line(p + Vector2(-70, 0), p + Vector2(70, 0), Color(col.r, col.g, col.b, 0.35 * a), 3.0, true)
	for s in [-1.0, 1.0]:
		var tip := p + Vector2(84.0 * s, 0)
		draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-14.0 * s, -10), tip + Vector2(-14.0 * s, 10)]), col)
	draw_circle(p + Vector2(x, 0), 15.0, Color(1.0, 0.97, 0.9, 0.75 * a))
	draw_arc(p + Vector2(x, 0), 15.0, 0.0, TAU, 32, Color(ThemeFactory.AMBER, 0.8 * a), 3.0, true)


func _hint_label(f: Font, text: String, center: Vector2) -> void:
	var fs := 26
	var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var p := center + Vector2(-w * 0.5, fs * 0.35)
	draw_string_outline(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.6))
	draw_string(f, p, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1.0, 0.95, 0.85, 0.85))


# =============================================================================
## A round (or pill-shaped) touch button: translucent, rounded, amber accents.
## Handles its own finger (touch index); `pressed` / `released` signals.
class TouchButton:
	extends Control

	signal pressed
	signal released

	var id := ""
	var radius := 60.0
	var icon: Texture2D = null:
		set(v):
			if v != icon:
				icon = v
				queue_redraw()
	var label := "":
		set(v):
			if v != label:
				label = v
				queue_redraw()
	## "jump" (chevron) or "pause" (two bars) drawn instead of an icon.
	var glyph := ""
	var lit := false:
		set(v):
			if v != lit:
				lit = v
				queue_redraw()
	var dim := false:
		set(v):
			if v != dim:
				dim = v
				queue_redraw()
	var pill := false
	var small := false
	var accent := Color(1.0, 0.85, 0.6)
	var _index := -1
	var _down := false
	var _anim := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		focus_mode = Control.FOCUS_NONE

	func is_down() -> bool:
		return _down

	## Centre a round button at `c` (layout units).
	func place(c: Vector2) -> void:
		size = Vector2(radius, radius) * 2.0
		position = c - size * 0.5

	func place_rect(r: Rect2) -> void:
		position = r.position
		size = r.size

	func pill_width() -> float:
		var f := ThemeFactory.font("display")
		var tw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size()).x
		return clampf(tw + radius * 2.0 + 44.0, radius * 3.0, 640.0)

	func _font_size() -> int:
		if pill:
			return 30
		return 22 if radius >= 70.0 else 19

	func _has_point(p: Vector2) -> bool:
		if pill:
			return Rect2(Vector2.ZERO, size).grow(10.0).has_point(p)
		# A slightly bigger hit circle than the drawing: forgiving for thumbs.
		return p.distance_to(size * 0.5) <= radius + (8.0 if small else 14.0)

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			var t := event as InputEventScreenTouch
			if t.pressed and _index < 0:
				_index = t.index
				_down = true
				pressed.emit()
				queue_redraw()
			elif not t.pressed and t.index == _index:
				_index = -1
				_down = false
				released.emit()
				queue_redraw()
			accept_event()
		elif event is InputEventScreenDrag or event is InputEventMouse:
			accept_event()

	func force_release() -> void:
		if _down:
			_index = -1
			_down = false
			released.emit()
			queue_redraw()

	func _process(delta: float) -> void:
		var target := 1.0 if _down else 0.0
		if absf(_anim - target) > 0.001:
			_anim = move_toward(_anim, target, delta * 12.0)
			queue_redraw()
		elif lit:
			queue_redraw()

	func _draw() -> void:
		var hc := ThemeFactory.high_contrast()
		var s := 1.0 - 0.07 * _anim
		var c := size * 0.5
		var t := Time.get_ticks_msec() / 1000.0
		var fill := Color(0.04, 0.08, 0.06, 0.5 if not hc else 0.85)
		var ring := Color(accent.r, accent.g, accent.b, 0.5)
		if lit:
			var pulse := 0.85 + 0.15 * sin(t * 5.0)
			fill = Color(0.55, 0.3, 0.06, 0.75)
			ring = Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, pulse)
		if _anim > 0.0:
			fill = fill.lerp(Color(0.6, 0.38, 0.12, 0.8), _anim)
			ring = ring.lerp(ThemeFactory.AMBER, _anim)
		var alpha := 0.55 if dim else 1.0
		fill.a *= alpha
		ring.a *= alpha
		if pill:
			var r := Rect2(Vector2.ZERO, size)
			r = Rect2(c - r.size * 0.5 * s, r.size * s)
			var sb := StyleBoxFlat.new()
			sb.set_corner_radius_all(int(r.size.y * 0.5))
			sb.corner_detail = 12
			sb.anti_aliasing = true
			sb.bg_color = fill if dim else Color(0.08, 0.13, 0.09, 0.86).lerp(Color(0.6, 0.38, 0.12, 0.9), _anim)
			sb.set_border_width_all(4)
			sb.border_color = ring if dim else Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, 0.85 + 0.15 * sin(t * 3.0))
			sb.shadow_color = Color(0, 0, 0, 0.35)
			sb.shadow_size = 10
			sb.shadow_offset = Vector2(0, 4)
			if not dim:
				draw_texture_rect(ThemeFactory.glow_texture(), r.grow(26.0), false, Color(1.0, 0.62, 0.2, 0.22 + 0.08 * sin(t * 3.0)))
			draw_style_box(sb, r)
			var isz := r.size.y * 0.66
			var ip := Vector2(r.position.x + r.size.y * 0.24, c.y - isz * 0.5)
			if icon:
				draw_texture_rect(icon, Rect2(ip, Vector2(isz, isz)), false, Color(1, 1, 1, alpha))
			var f := ThemeFactory.font("display")
			var fs := _font_size()
			var tp := Vector2(ip.x + isz + 14.0, c.y + fs * 0.36)
			draw_string_outline(f, tp, label, HORIZONTAL_ALIGNMENT_LEFT, r.end.x - tp.x - 18.0, fs, 6, Color(0, 0, 0, 0.6 * alpha))
			draw_string(f, tp, label, HORIZONTAL_ALIGNMENT_LEFT, r.end.x - tp.x - 18.0, fs,
				Color(0.85, 0.82, 0.76, alpha) if dim else ThemeFactory.text_color())
			return
		var rr := radius * s
		draw_circle(c + Vector2(0, 4), rr, Color(0, 0, 0, 0.22 * alpha))
		draw_circle(c, rr, fill)
		draw_arc(c, rr, 0.0, TAU, 64, ring, 4.0 if not small else 3.0, true)
		if lit:
			draw_texture_rect(ThemeFactory.glow_texture(), Rect2(c - Vector2(rr, rr) * 1.6, Vector2(rr, rr) * 3.2), false, Color(1.0, 0.6, 0.2, 0.35))
		var f := ThemeFactory.font("display")
		var fs := _font_size()
		var has_label := label != "" and not small
		var icon_c := c - Vector2(0, fs * 0.42 if has_label else 0.0)
		var isz := rr * (0.95 if not has_label else 0.86)
		if small:
			isz = rr * 1.1
		var tint := Color(1, 1, 1, alpha)
		if glyph == "pause":
			var bw := rr * 0.2
			var bh := rr * 0.78
			for k in [-1.0, 1.0]:
				var br := Rect2(c + Vector2(k * rr * 0.2 - bw * 0.5, -bh * 0.5), Vector2(bw, bh))
				draw_style_box(ThemeFactory.flat(Color(1.0, 0.95, 0.85, alpha), int(bw * 0.4)), br)
		elif glyph == "jump":
			var w2 := rr * 0.42
			for k in 2:
				var y0 := icon_c.y + rr * 0.12 - float(k) * rr * 0.3
				draw_polyline(PackedVector2Array([Vector2(icon_c.x - w2, y0 + w2 * 0.55), Vector2(icon_c.x, y0 - w2 * 0.35),
					Vector2(icon_c.x + w2, y0 + w2 * 0.55)]), Color(1.0, 0.95, 0.85, alpha * (1.0 if k == 1 else 0.6)), rr * 0.14, true)
		elif icon:
			draw_texture_rect(icon, Rect2(icon_c - Vector2(isz, isz) * 0.5, Vector2(isz, isz)), false, tint)
		if has_label:
			var tw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var tp := Vector2(c.x - tw * 0.5, c.y + rr * 0.62)
			draw_string_outline(f, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.75 * alpha))
			draw_string(f, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1.0, 0.95, 0.85, alpha))
