class_name HUD
extends CanvasLayer
## In-game HUD and modal host.
##
## Always visible: survival bars (top-left), campfire widget + home compass
## (top-centre), day/night clock, coins and best (top-right), the hotbar with
## inline sack rows (bottom-centre), interaction prompt, toasts, pickup feed,
## captions, banners and phase cards, screen effects, crosshair, FPS and the
## dev overlay.
##
## Modals: Events.request_modal(name, args) opens res://ui/<name>_ui.gd (or
## crafting/storage/pause/settings, see MODAL_SCRIPTS). While one is open the
## HUD sets GameState.ui_blocking, shows the mouse and emits
## Events.ui_modal_opened/closed. The pause menu pauses the tree; the HUD runs
## with PROCESS_MODE_ALWAYS. The HUD owns Esc (pause), Tab (sack), M (map),
## B (build), 1-7 and next/prev item (mouse wheel, LB/RB).
##
## Phones and tablets: on touch devices the HUD adds TouchControls (joystick,
## look, USE/JUMP/RUN, context button, Pause/Map/Build) under everything else,
## never captures the mouse in touch mode, keeps the hotbar tappable, moves
## toasts to the left and shrinks the top row to make room.

const MODAL_SCRIPTS := {
	"crafting": "res://ui/crafting_ui.gd",
	"storage": "res://ui/storage_ui.gd",
	"pause": "res://ui/pause_menu.gd",
	"settings": "res://ui/settings_menu.gd",
	"leaderboard": "res://ui/leaderboard_screen.gd",
	"locker": "res://ui/locker.gd",
}

var game: Node = null
var root: ScaledRoot
var fx: ScreenFX
var stats: StatBars
var fire_widget: FireWidget
var clock: ClockWidget
var hotbar: Hotbar
var prompt: InteractPrompt
var feed: ToastFeed
var banners: BannerLayer
var modal_host: Control
var dev_overlay: DevOverlay
var fps_label: Label
var crosshair: Control
var float_layer: Control
## On-screen touch controls (null on devices without a touchscreen).
var touch: TouchControls = null
var _touch_layout := false

var _modal: Control = null
var _modal_name := ""
var _paused_by_modal := false
var _floats: Array = []
var _dead_fade := 0.0


func _init() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS


func setup(p_game: Node) -> void:
	game = p_game
	if not is_inside_tree():
		await ready
	_build()


func _build() -> void:
	if root != null:
		return
	fx = ScreenFX.new()
	add_child(fx)
	float_layer = Control.new()
	float_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	float_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	float_layer.draw.connect(_draw_floats)
	add_child(float_layer)
	root = ScaledRoot.new(true)
	add_child(root)
	if Platform.is_touch_device():
		touch = TouchControls.new()
		touch.hud = self
		root.add_child(touch)

	stats = StatBars.new()
	stats.position = Vector2(26, 22)
	root.add_child(stats)
	fire_widget = FireWidget.new()
	root.add_child(fire_widget)
	clock = ClockWidget.new()
	root.add_child(clock)
	hotbar = Hotbar.new()
	root.add_child(hotbar)
	hotbar.expanded_changed.connect(func(_e: bool) -> void: _update_mouse())
	if touch:
		touch.hotbar = hotbar
	prompt = InteractPrompt.new()
	prompt.hotbar = hotbar
	prompt.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(prompt)
	feed = ToastFeed.new()
	feed.hotbar = hotbar
	feed.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(feed)
	banners = BannerLayer.new()
	root.add_child(banners)

	crosshair = _Crosshair.new()
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	crosshair.visible = false
	root.add_child(crosshair)

	fps_label = UIKit.label("", "HudSmall")
	fps_label.add_theme_font_size_override("font_size", 18)
	root.add_child(fps_label)

	dev_overlay = DevOverlay.new()
	dev_overlay.position = Vector2(26, 220)
	dev_overlay.visible = Dev.overlay_visible
	root.add_child(dev_overlay)

	modal_host = Control.new()
	modal_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	modal_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(modal_host)

	Events.request_modal.connect(open_modal)
	Events.player_died.connect(_on_player_died)
	Events.run_started.connect(func(_s: int) -> void: _update_mouse())
	Events.float_text.connect(_on_float_text)
	Events.sack_upgraded.connect(func(id: String, cap: int) -> void:
		feed.toast("New sack: %s! It holds %d things." % [DB.item_name(id), cap], "good"))
	Events.map_unlocked.connect(func() -> void:
		feed.toast("Map unlocked! Press %s to open it." % Controls.prompt("map"), "good"))
	Dev.overlay_toggled.connect(func(v: bool) -> void: dev_overlay.visible = v)
	Settings.changed.connect(_on_setting)
	Events.input_mode_changed.connect(func(_t: bool) -> void: _update_mouse())
	_update_mouse()


func _on_setting(key: String) -> void:
	if key in ["high_contrast", "colorblind_mode"]:
		ThemeFactory.invalidate()


# --- Modals ---------------------------------------------------------------------

func is_modal_open() -> bool:
	return _modal != null and is_instance_valid(_modal)


func modal_name() -> String:
	return _modal_name if is_modal_open() else ""


func open_modal(modal: String, args: Dictionary = {}) -> Control:
	if root == null:
		return null
	if is_modal_open():
		if _modal_name == modal:
			close_modal()
			return null
		close_modal()
	var path: String = MODAL_SCRIPTS.get(modal, "res://ui/%s_ui.gd" % modal)
	if not ResourceLoader.exists(path):
		_missing_modal(modal)
		return null
	var scr: Variant = load(path)
	if not (scr is GDScript):
		return null
	var inst: Variant = (scr as GDScript).new()
	if not (inst is Control):
		if inst is Node:
			(inst as Node).queue_free()
		push_warning("HUD: modal %s is not a Control" % modal)
		return null
	var m := inst as Control
	if "modal_name" in m:
		m.set("modal_name", modal)
	modal_host.add_child(m)
	_modal = m
	_modal_name = modal
	if m.has_signal("closed"):
		m.connect("closed", _on_modal_closed.bind(m))
	if m.has_method("open"):
		m.call("open", args)
	var pauses := false
	if "pauses_game" in m:
		pauses = bool(m.get("pauses_game"))
	if pauses:
		_paused_by_modal = true
		get_tree().paused = true
		Events.game_paused.emit(true)
	GameState.ui_blocking = true
	hotbar.set_expanded(false)
	_update_mouse()
	Audio.play_ui("ui_open")
	Events.ui_modal_opened.emit(modal)
	return m


func close_modal() -> void:
	if not is_modal_open():
		return
	var m := _modal
	if m.has_method("close"):
		m.call("close")
	else:
		_on_modal_closed(m)
		m.queue_free()


func _on_modal_closed(m: Control) -> void:
	if m != _modal:
		return
	var closed_name := _modal_name
	_modal = null
	_modal_name = ""
	if _paused_by_modal:
		_paused_by_modal = false
		get_tree().paused = false
		Events.game_paused.emit(false)
	GameState.ui_blocking = false
	_update_mouse()
	Events.ui_modal_closed.emit(closed_name)


func _missing_modal(modal: String) -> void:
	match modal:
		"map":
			if not bool(GameState.flags.get("has_map", false)):
				feed.toast("You don't have a map yet. Craft one at the crafting crate!", "info")
			else:
				feed.toast("The map is still being drawn. Coming soon!", "info")
		"build":
			feed.toast("Building is coming soon!", "info")
		_:
			feed.toast("Coming soon!", "info")
	Audio.play_ui("deny")


func _update_mouse() -> void:
	if hotbar == null:
		return
	# Touch mode: slots are always tappable and the mouse is never captured.
	var touch_mode := Platform.is_touch()
	var want_visible := is_modal_open() or hotbar.expanded or not GameState.is_playing() or touch_mode
	hotbar.set_interactive(want_visible and not is_modal_open())
	if DisplayServer.get_name() == "headless":
		return
	if GameState.state == GameState.RunState.LOADING:
		return
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if want_visible else Input.MOUSE_MODE_CAPTURED


# --- Input ------------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if root == null or not GameState.is_playing() or is_modal_open():
		return
	if event.is_echo():
		return
	if event.is_action_pressed("pause"):
		open_modal("pause")
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("toggle_sack"):
		hotbar.toggle_expanded()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("map"):
		open_modal("map")
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("build"):
		open_modal("build")
		get_viewport().set_input_as_handled()
		return
	for i in Hotbar.MAIN_SLOTS:
		if event.is_action_pressed("slot_%d" % (i + 1)):
			if i < GameState.inventory.capacity:
				GameState.select_slot(i)
			get_viewport().set_input_as_handled()
			return
	if not GameState.ui_blocking:
		if event.is_action_pressed("next_item"):
			GameState.select_slot(GameState.selected_slot + 1)
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("prev_item"):
			GameState.select_slot(GameState.selected_slot - 1)
			get_viewport().set_input_as_handled()


# --- Per frame ----------------------------------------------------------------------

func _process(delta: float) -> void:
	if root == null:
		return
	_update_touch_layout()
	var vp := root.size
	# FPS
	fps_label.visible = bool(Settings.get_value("show_fps"))
	if fps_label.visible:
		fps_label.text = "%d FPS" % Engine.get_frames_per_second()
		fps_label.position = Vector2(24, vp.y - 40)
	# Crosshair
	var p := GameState.player
	var aiming := false
	if p and is_instance_valid(p) and p.has_method("is_aiming_gun") and not is_modal_open():
		aiming = bool(p.call("is_aiming_gun"))
	crosshair.visible = aiming
	# Death fade
	if GameState.state == GameState.RunState.DEAD:
		_dead_fade = minf(_dead_fade + delta * 0.8, 1.0)
		for c in [stats, fire_widget, clock, hotbar, prompt]:
			(c as CanvasItem).modulate.a = 1.0 - _dead_fade
	# Floating texts
	if not _floats.is_empty():
		for i in range(_floats.size() - 1, -1, -1):
			_floats[i]["t"] = float(_floats[i]["t"]) + delta
			if float(_floats[i]["t"]) > 1.3:
				_floats.remove_at(i)
		float_layer.queue_redraw()


## Touch layout: compact hotbar, toasts on the left, the top row scaled to
## leave room for the Pause button on narrow phones.
func _update_touch_layout() -> void:
	var on := touch != null and Platform.is_touch()
	if on != _touch_layout:
		_touch_layout = on
		hotbar.set_compact(on)
		feed.touch_layout = on
		if not on:
			for c in [stats, fire_widget, clock]:
				(c as Control).scale = Vector2.ONE
			clock.right_inset = 0.0
	if not on:
		return
	var reserve := touch.top_right_reserve()
	var need := stats.size.x + FireWidget.FULL.x + ClockWidget.SIZE.x + 26.0 * 2.0 + 48.0 + reserve
	var k := clampf(root.size.x / need, 0.7, 1.0)
	for c in [stats, fire_widget, clock]:
		(c as Control).scale = Vector2(k, k)
	stats.position = Vector2(26, 22)
	clock.right_inset = reserve
	feed.top_left_y = stats.position.y + stats.size.y * k + 12.0
	feed.pickup_bottom_y = touch.cluster_top() - 14.0


func _on_player_died(_cause: String) -> void:
	close_modal()
	if hotbar:
		hotbar.set_expanded(false)
	if banners:
		banners.clear()


# --- World-space floating text ----------------------------------------------------

func _on_float_text(world_pos: Vector3, text: String, color: Color) -> void:
	_floats.append({"pos": world_pos, "text": text, "color": color, "t": 0.0, "dx": randf_range(-0.3, 0.3)})
	if _floats.size() > 24:
		_floats.pop_front()


func _draw_floats() -> void:
	var cam := get_viewport().get_camera_3d() if get_viewport() else null
	if cam == null:
		return
	var vis := float_layer.get_viewport_rect().size
	var px := Vector2(get_viewport().size)
	var conv := vis / Vector2(maxf(px.x, 1.0), maxf(px.y, 1.0))
	var f := ThemeFactory.font("display_bold")
	for e in _floats:
		var t := float(e["t"])
		var wp: Vector3 = e["pos"] + Vector3(float(e["dx"]) * t, 0.6 + t * 1.1, 0.0)
		if cam.is_position_behind(wp):
			continue
		var sp := cam.unproject_position(wp) * conv
		var a := clampf((1.3 - t) / 0.4, 0.0, 1.0)
		var s := 1.0 + 0.35 * clampf(1.0 - t / 0.15, 0.0, 1.0)
		var fs := int(34 * s)
		var txt := str(e["text"])
		var w := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var col: Color = e["color"]
		float_layer.draw_string_outline(f, sp - Vector2(w * 0.5, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 7, Color(0, 0, 0, 0.75 * a))
		float_layer.draw_string(f, sp - Vector2(w * 0.5, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col.r, col.g, col.b, a))


# --- Screenshot / QA helpers ----------------------------------------------------------

## Show sample feedback for screenshots: "toasts", "fire_out", "night", "dusk",
## "survived", "hurt", "sack", "full", "freeze", "dev", "howto".
func demo(kind: String) -> void:
	match kind:
		"freeze":
			GameState.survival.warmth = 2.0
			GameState.survival.health = 18.0
		"dev":
			dev_overlay.visible = true
			Settings.set_value("show_fps", true, false)
		"howto":
			if is_modal_open() and _modal.has_method("_open_how"):
				_modal.call("_open_how")
		"toasts":
			Events.notify.emit("Crafted 3 Kindling!", "good")
			Events.notify.emit("The fire is getting low. Add wood!", "warn")
			Events.notify.emit("Found a chest: 12 coins and a Battery", "loot")
			Events.item_picked_up.emit("wood", 3)
			Events.item_picked_up.emit("berries", 2)
			Events.caption.emit("[wolf howling far away]")
		"fire_out":
			banners.show_fire_out("")
		"night":
			banners.show_night_card(maxi(GameState.night_number(), 1))
		"dusk":
			banners.show_dusk_warning()
		"survived":
			banners.show_survived(maxi(GameState.day_cycle.nights_survived, 1))
		"hurt":
			Events.player_damaged.emit(30.0, "demo")
		"sack":
			hotbar.set_expanded(true)
		"full":
			Events.inventory_full.emit("wood")


class _Crosshair:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(_d: float) -> void:
		if visible:
			queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var col := Color(1, 0.97, 0.9, 0.9)
		var sh := Color(0, 0, 0, 0.6)
		for d in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
			draw_line(c + d * 9 + Vector2(1, 1), c + d * 20 + Vector2(1, 1), sh, 4.0, true)
			draw_line(c + d * 9, c + d * 20, col, 3.0, true)
		draw_circle(c, 3.0, ThemeFactory.AMBER)
