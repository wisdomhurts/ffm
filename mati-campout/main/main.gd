extends Node
## Scene router: title screen -> loading -> game -> game over.
##
## Command-line options (pass after `--`):
##   --autostart       skip the title screen
##   --seed=N          use a fixed world seed
##   --smoke           run the automated smoke test, then quit
##   --shots=a,b,c     run the screenshot tour, then quit
##   --dev             enable dev tools (handled by Settings)
##   --touch           force touch mode on a desktop (mouse clicks become
##                     touches; see core/platform.gd), --dpr=N previews the
##                     phone UI scale, --quality=phone picks a preset (unsaved)
##
## Always adds the DeviceGuard (portrait card, pause while the app/tab is
## hidden). In a browser with `window.matiDebug = true` it publishes a small
## JSON state snapshot as `window.matiState` twice a second (web QA).

var current_screen: Node = null
var game: Game = null
var device_guard: DeviceGuard = null
var _args: Dictionary = {}
var _web_debug := false
var _swings := 0


func _ready() -> void:
	_args = parse_args()
	if _args.has("touch"):
		Platform.force_touch = true
		# Desktop testing: mouse clicks and drags become touches.
		Input.emulate_touch_from_mouse = true
		Controls.strip_mouse_bindings()
	device_guard = DeviceGuard.new()
	add_child(device_guard)
	if Platform.is_web():
		_web_debug = bool(JavaScriptBridge.eval("!!window.matiDebug", true))
		if _web_debug:
			Events.tool_swung.connect(func(_id: String) -> void: _swings += 1)
			# Keeps publishing while the game is paused (menus, portrait card).
			var t := Timer.new()
			t.name = "WebDebug"
			t.wait_time = 0.5
			t.process_mode = Node.PROCESS_MODE_ALWAYS
			t.timeout.connect(_publish_web_state)
			add_child(t)
			t.start()
		print("MATI web: renderer=%s touch=%s mobile=%s quality=%s dpr=%.2f window=%s" % [
			RenderingServer.get_current_rendering_method(), str(Platform.is_touch()), str(Platform.is_mobile_web()),
			Settings.quality(), Platform.dpr(), str(DisplayServer.window_get_size())])
	Events.player_died.connect(_on_player_died)
	if _args.has("smoke"):
		var smoke: Node = load("res://tests/smoke_test.gd").new()
		add_child(smoke)
		return
	if _args.has("shots"):
		var tour: Node = load("res://tools/screenshot_tour.gd").new()
		tour.set("shot_list", str(_args["shots"]).split(","))
		add_child(tour)
		return
	if _args.has("autostart"):
		start_run(int(_args.get("seed", -1)))
	else:
		show_title()


static func parse_args() -> Dictionary:
	var out := {}
	for a in OS.get_cmdline_user_args():
		var s := str(a).trim_prefix("--")
		if "=" in s:
			var kv := s.split("=", true, 1)
			out[kv[0]] = kv[1]
		else:
			out[s] = true
	return out


func _set_screen(node: Node) -> void:
	if current_screen and is_instance_valid(current_screen):
		current_screen.queue_free()
	current_screen = node
	if node:
		add_child(node)


func show_title() -> void:
	_free_game()
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var title: Node = load("res://ui/title_screen.gd").new()
	title.connect("play_pressed", func() -> void: start_run(int(_args.get("seed", -1))))
	_set_screen(title)
	Audio.set_music_mood("title")
	_web_ready()


## Start a fresh run. Returns once the world is built and play has begun.
func start_run(p_seed: int = -1) -> void:
	_free_game()
	get_tree().paused = false
	var loading: Node = load("res://ui/loading_screen.gd").new()
	_set_screen(loading)
	await get_tree().process_frame
	GameState.new_run(p_seed)
	game = Game.new()
	game.name = "Game"
	add_child(game)
	move_child(game, 0)
	await game.build(func(frac: float, text: String) -> void: loading.call("set_progress", frac, text))
	if not is_instance_valid(game):
		return
	_set_screen(null)
	GameState.begin_play()
	_web_ready()


## Tell the web page's boot screen (web/shell) that the game is up.
func _web_ready() -> void:
	if Platform.is_web():
		JavaScriptBridge.eval("window.matiGameReady && window.matiGameReady();", true)


func _free_game() -> void:
	if game and is_instance_valid(game):
		game.queue_free()
	game = null
	GameState.clear_scene_refs()


func _on_player_died(_cause: String) -> void:
	if _args.has("smoke"):
		return
	# Let the death sequence play before the game-over screen.
	await get_tree().create_timer(2.6, true, false, true).timeout
	var summary := GameState.end_run()
	var over: Node = load("res://ui/game_over.gd").new()
	over.set("summary", summary)
	over.connect("retry_pressed", func() -> void: start_run(-1))
	over.connect("title_pressed", show_title)
	_set_screen(over)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _publish_web_state() -> void:
	JavaScriptBridge.eval("window.matiState = %s;" % JSON.stringify(JSON.stringify(debug_state())), true)


## Small state snapshot for browser QA (window.matiState when matiDebug is set).
func debug_state() -> Dictionary:
	var d := {
		"state": GameState.state, "playing": GameState.is_playing(), "quality": Settings.quality(),
		"renderer": RenderingServer.get_current_rendering_method(), "touch": Platform.is_touch(),
		"touch_device": Platform.is_touch_device(), "fps": Engine.get_frames_per_second(),
		"paused": get_tree().paused, "portrait": device_guard.is_portrait() if device_guard else false,
		"screen": str(current_screen.get_script().resource_path.get_file()) if current_screen and current_screen.get_script() else "",
		"selected_slot": GameState.selected_slot, "selected_item": GameState.selected_item_id(), "swings": _swings,
		"stats": GameState.stats, "window": [DisplayServer.window_get_size().x, DisplayServer.window_get_size().y],
		"render_scale": get_viewport().scaling_3d_scale, "dyn_scale": Settings.dynamic_scale, "mem_mb": snappedf(OS.get_static_memory_usage() / 1048576.0, 0.1), "ui_scale": ThemeFactory.ui_scale() * Platform.ui_scale_boost(get_viewport().get_visible_rect().size),
	}
	var p := GameState.player
	if p and is_instance_valid(p):
		d["player"] = [snappedf(p.global_position.x, 0.01), snappedf(p.global_position.y, 0.01), snappedf(p.global_position.z, 0.01)]
		var rig: Variant = p.get("rig")
		if rig is Node:
			d["yaw"] = snappedf(float((rig as Node).get("yaw")), 0.001)
			d["pitch"] = snappedf(float((rig as Node).get("pitch")), 0.001)
		if p.get("model") is Node:
			d["action"] = str((p.get("model") as Node).call("current_action"))
	# On-screen rects (window pixels) of the controls a browser test taps.
	var ui := {}
	if current_screen and is_instance_valid(current_screen) and current_screen.get("_play") is Control:
		ui["play"] = _rect_px(current_screen.get("_play") as Control)
	if game and is_instance_valid(game) and game.hud:
		var hud := game.hud
		if hud.touch:
			for b in hud.touch.buttons:
				if b.visible:
					ui[b.id] = _rect_px(b)
			var jr := hud.touch.get_viewport().get_final_transform() * hud.touch.get_global_transform_with_canvas() * hud.touch.joy_rest()
			ui["joy_rest"] = [jr.x, jr.y]
		if hud.hotbar:
			for s in hud.hotbar.slots:
				var sl := s as ItemSlot
				if sl.is_visible_in_tree():
					ui["slot_%d" % (sl.index + 1)] = _rect_px(sl)
			ui["sack"] = _rect_px(hud.hotbar.sack_badge)
	d["ui"] = ui
	if game and is_instance_valid(game) and game.hud:
		d["modal"] = game.hud.modal_name()
		d["sack_open"] = game.hud.hotbar.expanded if game.hud.hotbar else false
		if game.hud.touch:
			d["touch_visible"] = game.hud.touch.visible and game.hud.touch.modulate.a > 0.5
			d["sprint"] = game.hud.touch.run_btn.lit
			d["act_text"] = game.hud.touch.act_btn.label if game.hud.touch.act_btn.visible else ""
	return d


## A Control's rect in window pixels [x, y, w, h] (canvas px on the web).
static func _rect_px(c: Control) -> Array:
	var xf := c.get_viewport().get_final_transform() * c.get_global_transform_with_canvas()
	var r := xf * Rect2(Vector2.ZERO, c.size)
	return [snappedf(r.position.x, 0.1), snappedf(r.position.y, 0.1), snappedf(r.size.x, 0.1), snappedf(r.size.y, 0.1)]
