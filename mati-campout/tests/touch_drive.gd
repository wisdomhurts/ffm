extends Node
## Headless integration test for phone / tablet play: forces touch mode,
## starts a real run and drives the on-screen TouchControls by feeding
## screen-touch events to the controls (headless has no GUI picking, so the
## events go straight to the control a finger would land on).
##
## Run: godot --headless --path . res://tests/touch_drive.tscn
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.
## Real-browser checks (Chromium + touch emulation): tests/web/web_check.cjs.

var failures := 0
var passes := 0
var main: Node


class FakeTrees:
	extends Node3D
	var trees: Array = []

	func add_tree(pos: Vector3) -> void:
		trees.append({"pos": pos, "kind": "regular", "hp": 30, "max_hp": 30, "alive": true})

	func find_tree(pos: Vector3, radius: float) -> int:
		var best := -1
		var bd := radius
		for i in trees.size():
			var tp: Vector3 = trees[i]["pos"]
			var d := Vector2(tp.x - pos.x, tp.z - pos.z).length()
			if d <= bd and bool(trees[i]["alive"]):
				bd = d
				best = i
		return best

	func tree_info(id: int) -> Dictionary:
		return trees[id] if id >= 0 and id < trees.size() else {}

	func hit_tree(id: int, power: int, _giant: bool, _from: Vector3) -> Dictionary:
		trees[id]["hp"] = int(trees[id]["hp"]) - power
		return {"ok": true, "felled": false, "reason": ""}

	func obstacles_near(_pos: Vector3, _radius: float) -> Array:
		return []


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	Platform.force_touch = true
	Platform.set_touch_active(true)
	main = load("res://main/main.gd").new()
	main.name = "Main"
	# Like main.tscn: the game pauses with the tree (this test node does not).
	main.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(main)
	# Watchdog: a script error in the middle must not hang CI.
	get_tree().create_timer(420.0, true, false, true).timeout.connect(func() -> void:
		failures += 1
		print("FAIL watchdog: the test did not finish in time")
		_finish())
	_run.call_deferred()


func check(cond: bool, what: String) -> void:
	if cond:
		passes += 1
		print("PASS ", what)
	else:
		failures += 1
		print("FAIL ", what)


func frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func seconds(s: float) -> void:
	await frames(int(s * Engine.physics_ticks_per_second))


func touch(c: Control, index: int, pos: Vector2, pressed: bool) -> void:
	var t := InputEventScreenTouch.new()
	t.index = index
	t.position = pos
	t.pressed = pressed
	c._gui_input(t)


func drag(c: Control, index: int, pos: Vector2, rel: Vector2) -> void:
	var d := InputEventScreenDrag.new()
	d.index = index
	d.position = pos
	d.relative = rel
	c._gui_input(d)


func tap(b: Control, index: int = 3) -> void:
	touch(b, index, b.size * 0.5, true)
	await frames(2)
	touch(b, index, b.size * 0.5, false)
	await frames(2)


func flat_dist(a: Vector3, b: Vector3) -> float:
	return Vector2(a.x - b.x, a.z - b.z).length()


func _run() -> void:
	await main.call("start_run", 424242)
	var player := GameState.player as Player
	var hud: HUD = GameState.game.hud if GameState.game else null
	check(player != null and hud != null, "run started")
	if player == null or hud == null:
		_finish()
		return
	GameState.time_scale = 1.0
	await frames(10)
	var tc: TouchControls = hud.touch
	check(tc != null, "HUD added touch controls")
	if tc == null:
		_finish()
		return
	await frames(5)
	check(tc.visible and tc.wants_visible(), "touch controls visible in touch mode")
	check(hud.hotbar.compact and hud.hotbar.slots[0].mouse_filter == Control.MOUSE_FILTER_STOP, "hotbar compact and tappable")
	check(not hud.prompt._pill.visible, "keyboard prompt pill hidden (touch has its own button)")

	# --- Joystick -------------------------------------------------------------
	var start := GameState.world_gen.ground(Vector3(20, 0, 14), 0.05)
	player.teleport(start)
	player.rig.yaw = 0.0
	await frames(5)
	var rest := tc.joy_rest()
	touch(tc, 0, rest, true)
	drag(tc, 0, rest + Vector2(0, -60), Vector2(0, -60))
	var v := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	check(v.y < -0.3 and absf(v.x) < 0.05, "joystick up = forward (%s)" % str(v))
	drag(tc, 0, rest + Vector2(0, -JOY_FULL()), Vector2(0, -60))
	v = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	check(v.length() > 0.95, "full push = full speed (%.2f)" % v.length())
	var p0 := player.global_position
	await seconds(1.0)
	var moved := flat_dist(player.global_position, p0)
	check(moved > 2.5, "joystick walks the player (%.2f m in 1 s)" % moved)
	check(player.global_position.z < p0.z, "...forward (camera yaw 0 = -Z)")
	# Thumb slides far past the rim: the base follows, still full forward.
	drag(tc, 0, rest + Vector2(0, -400), Vector2(0, -300))
	check(rest.y - tc._joy_center.y > 100.0, "joystick base follows the thumb")
	touch(tc, 0, rest + Vector2(0, -400), false)
	await frames(2)
	v = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	check(v == Vector2.ZERO, "release stops moving")
	# Gentle push = slow walk.
	touch(tc, 0, rest, true)
	drag(tc, 0, rest + Vector2(0, -38), Vector2(0, -38))
	v = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	check(v.length() > 0.05 and v.length() < 0.5, "gentle push walks slowly (%.2f)" % v.length())
	touch(tc, 0, rest, false)
	# Outside the joystick zone does not start the joystick.
	touch(tc, 5, Vector2(tc.size.x * 0.8, tc.size.y * 0.5), true)
	check(tc._joy_index == -1 and tc._look_index == 5, "right side starts a look drag, not the joystick")
	touch(tc, 5, Vector2(tc.size.x * 0.8, tc.size.y * 0.5), false)

	# --- Look + multi-touch ------------------------------------------------------
	var yaw0 := player.rig.yaw
	var lp := Vector2(tc.size.x * 0.7, tc.size.y * 0.45)
	touch(tc, 1, lp, true)
	drag(tc, 1, lp + Vector2(-120, 0), Vector2(-120, 0))
	var want := 120.0 / tc.size.y * TouchControls.LOOK_SENS
	check(player.rig.yaw > yaw0 + want * 0.8, "dragging left turns the camera left (%.2f -> %.2f)" % [yaw0, player.rig.yaw])
	var pitch0 := player.rig.pitch
	drag(tc, 1, lp + Vector2(-120, 80), Vector2(0, 80))
	check(player.rig.pitch < pitch0, "dragging down tilts the camera down")
	# Second finger on the joystick while the look finger is still down.
	touch(tc, 0, rest, true)
	drag(tc, 0, rest + Vector2(70, 0), Vector2(70, 0))
	v = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	check(v.x > 0.4 and tc._look_index == 1, "joystick and look work at the same time")
	var yaw1 := player.rig.yaw
	drag(tc, 1, lp + Vector2(-60, 80), Vector2(60, 0))
	check(player.rig.yaw < yaw1, "look still turns while moving")
	touch(tc, 1, lp, false)
	touch(tc, 0, rest, false)
	await frames(3)

	# --- USE with aim assist --------------------------------------------------------
	GameState.select_slot(0)
	await frames(2)
	check(tc.use_btn.label == "CHOP" and tc.use_btn.icon != null, "USE shows the axe: CHOP")
	var fake := FakeTrees.new()
	GameState.game.add_child(fake)
	GameState.vegetation = fake
	player.teleport(start)
	player.rig.yaw = 0.0
	await frames(3)
	# A tree 1.8 m away, 35 degrees to the right of where the camera looks.
	var off := Vector3(-sin(deg_to_rad(-35.0)), 0, -cos(deg_to_rad(-35.0))) * 1.8
	fake.add_tree(start + off)
	touch(tc.use_btn, 2, tc.use_btn.size * 0.5, true)
	var swung := false
	for _i in 30:
		await frames(1)
		if player.model.current_action() == "chop":
			swung = true
			break
	check(swung, "tapping USE swings the axe")
	await seconds(0.8)
	touch(tc.use_btn, 2, tc.use_btn.size * 0.5, false)
	check(int(fake.trees[0]["hp"]) < 30, "aim assist: the swing hits the tree off to the side")
	check(absf(wrapf(player.rig.yaw - deg_to_rad(-35.0), -PI, PI)) < 0.25, "aim assist turned the view toward it (yaw %.2f)" % player.rig.yaw)
	# Holding USE keeps chopping.
	var hp_before := int(fake.trees[0]["hp"])
	touch(tc.use_btn, 2, tc.use_btn.size * 0.5, true)
	await seconds(2.0)
	touch(tc.use_btn, 2, tc.use_btn.size * 0.5, false)
	check(int(fake.trees[0]["hp"]) <= hp_before - 2, "holding USE keeps chopping (%d -> %d)" % [hp_before, int(fake.trees[0]["hp"])])
	fake.queue_free()
	GameState.vegetation = null
	await frames(30)

	# --- JUMP and RUN ------------------------------------------------------------------
	player.teleport(start)
	await frames(20)
	var y0 := player.global_position.y
	await tap(tc.jump_btn)
	var peak := y0
	for _i in 20:
		await frames(1)
		peak = maxf(peak, player.global_position.y)
	check(peak > y0 + 0.3, "JUMP jumps (+%.2f m)" % (peak - y0))
	await seconds(1.0)
	await tap(tc.run_btn)
	check(player.touch_sprint and tc.run_btn.lit, "RUN toggles running on (lit)")
	touch(tc, 0, rest, true)
	drag(tc, 0, rest + Vector2(0, -JOY_FULL()), Vector2(0, -100))
	await seconds(0.8)
	var sp := Vector2(player.velocity.x, player.velocity.z).length()
	check(sp > DB.bf("player.walk_speed", 5.0) + 1.0, "running is faster than walking (%.1f m/s)" % sp)
	touch(tc, 0, rest, false)
	await seconds(1.6)
	check(not player.touch_sprint and not tc.run_btn.lit, "RUN switches itself off after stopping")

	# --- Context button near the campfire -------------------------------------------------
	var cf: Node3D = GameState.campfire
	if cf:
		var fpos := cf.global_position
		player.teleport(GameState.world_gen.ground(fpos + Vector3(1.6, 0, 0), 0.05))
		player.look_at_point(fpos)
		GameState.give("wood", 3)
		await frames(15)
		check(tc.act_btn.visible and tc.act_btn.label != "", "context button shows the prompt (\"%s\")" % tc.act_btn.label)
		var fuel0 := GameState.fire.fuel
		var wood0 := GameState.inventory.count_of("wood")
		await tap(tc.act_btn, 4)
		await frames(5)
		check(GameState.inventory.count_of("wood") < wood0 or GameState.fire.fuel > fuel0, "tapping it interacts (feeds the fire)")
	else:
		print("SKIP context button (no campfire)")

	# --- Hotbar taps -------------------------------------------------------------------------
	var s2 := hud.hotbar.slots[1] as ItemSlot
	touch(s2, 1, s2.size * 0.5, true)
	await frames(2)
	check(GameState.selected_slot != 1, "a slot waits for the finger to lift")
	touch(s2, 1, s2.size * 0.5, false)
	await frames(2)
	check(GameState.selected_slot == 1, "tapping hotbar slot 2 selects it (second finger)")
	GameState.upgrade_sack("good_sack")
	await frames(3)
	var badge := hud.hotbar.sack_badge
	touch(badge, 2, badge.size * 0.5, true)
	await frames(10)
	check(hud.hotbar.expanded, "tapping the sack badge opens the extra sack rows")
	var extra := hud.hotbar.slots[8] as ItemSlot
	check(extra.is_visible_in_tree() and extra.mouse_filter == Control.MOUSE_FILTER_STOP, "extra sack slots are tappable")
	touch(extra, 1, extra.size * 0.5, true)
	touch(extra, 1, extra.size * 0.5, false)
	await frames(2)
	check(GameState.selected_slot == 8, "tapping an extra sack slot selects it")
	# A finger that slides (scrolling) does not select.
	s2 = hud.hotbar.slots[1] as ItemSlot   # the bigger sack rebuilt the bar
	touch(s2, 1, s2.size * 0.5, true)
	touch(s2, 1, s2.size * 0.5 + Vector2(0, 60), false)
	await frames(2)
	check(GameState.selected_slot == 8, "a sliding finger does not tap the slot")
	touch(badge, 2, badge.size * 0.5, true)
	await frames(10)
	check(not hud.hotbar.expanded, "tapping the badge again closes them")
	GameState.select_slot(0)

	# --- Pause button, modal fit ---------------------------------------------------------------
	await tap(tc.pause_btn)
	await frames(3)
	check(hud.modal_name() == "pause" and get_tree().paused, "Pause button opens the pause menu")
	check(not tc.wants_visible(), "touch controls step aside while a menu is open")
	hud.close_modal()
	await frames(3)
	check(not get_tree().paused and tc.wants_visible(), "closing it resumes")
	var st: Control = hud.open_modal("settings")
	await frames(3)
	check(st != null and (st as UIModal).fit_scale() <= 1.0, "settings window fits the screen")
	hud.close_modal()
	await frames(3)

	# --- Input mode switching -----------------------------------------------------------------------
	var k := InputEventKey.new()
	k.physical_keycode = KEY_W
	k.pressed = true
	Input.parse_input_event(k)
	await frames(3)
	k = k.duplicate() as InputEventKey
	k.pressed = false
	Input.parse_input_event(k)
	await frames(3)
	check(not Platform.is_touch() and not tc.wants_visible(), "a key press switches to keyboard mode (controls hide)")
	var t := InputEventScreenTouch.new()
	t.index = 0
	t.pressed = true
	t.position = Vector2(400, 300)
	Input.parse_input_event(t)
	await frames(3)
	t = t.duplicate() as InputEventScreenTouch
	t.pressed = false
	Input.parse_input_event(t)
	await frames(3)
	check(Platform.is_touch() and tc.wants_visible(), "a touch brings the touch controls back")

	# --- Device guard: hidden app pauses, return resumes --------------------------------------------
	var guard: DeviceGuard = main.get("device_guard")
	check(guard != null, "device guard exists")
	if guard:
		guard.set_hidden(true)
		await frames(1)
		check(get_tree().paused, "app hidden -> paused")
		var day_t := GameState.day_cycle.phase_time
		await frames(10)
		check(is_equal_approx(GameState.day_cycle.phase_time, day_t), "...and the clock (fire) stands still")
		guard.set_hidden(false)
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().process_frame
		await frames(2)
		check(not get_tree().paused, "back -> resumes")
	_finish()


func JOY_FULL() -> float:
	return TouchControls.JOY_RADIUS


func _finish() -> void:
	print("TOUCH DRIVE: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
