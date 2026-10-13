extends Node
## Headless self-test for the UI: drives the title screen, HUD, modals,
## settings and game-over flow through real input events and public APIs.
##
## Run: godot --headless --path . -s res://ui/ui_selftest_launcher.gd
## Prints "UITEST PASS/FAIL ..." lines and exits 0 when everything passed.
## Settings it touches are restored at the end.

var passes := 0
var failures := 0
var main: Node


func check(cond: bool, what: String) -> void:
	if cond:
		passes += 1
		print("UITEST PASS ", what)
	else:
		failures += 1
		print("UITEST FAIL ", what)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_run.call_deferred()


func frames(n: int) -> void:
	for _i in n:
		await get_tree().process_frame


func key(keycode: Key) -> void:
	# Real players never press twice within a few milliseconds; modals ignore
	# close keys for a moment after opening, so wait like a person would.
	await get_tree().create_timer(0.2, true, false, true).timeout
	var down := InputEventKey.new()
	down.physical_keycode = keycode
	down.keycode = keycode
	down.pressed = true
	Input.parse_input_event(down)
	await frames(2)
	var up := InputEventKey.new()
	up.physical_keycode = keycode
	up.keycode = keycode
	up.pressed = false
	Input.parse_input_event(up)
	await frames(2)


func _run() -> void:
	var saved := {}
	for k in ["ui_scale", "high_contrast", "colorblind_mode", "reduce_flashing", "sound_captions"]:
		saved[k] = Settings.get_value(k)
	main = (load("res://main/main.tscn") as PackedScene).instantiate()
	get_tree().root.add_child(main)
	await frames(5)

	# --- Title screen ------------------------------------------------------------
	var title: Node = main.get("current_screen")
	check(title != null and title.has_signal("play_pressed"), "title screen shown with play_pressed")
	check(title != null and title.get("art") is TitleArt, "title has the animated illustration")
	if title:
		title.call("_open_leaderboard")
		await frames(3)
		check(UIModal.stack.size() >= 1 and UIModal.stack[-1] is LeaderboardScreen, "leaderboard overlay opens from title")
		(UIModal.stack[-1] as UIModal).close()
		await frames(3)
		title.call("_open_settings")
		await frames(3)
		check(UIModal.stack.size() >= 1 and UIModal.stack[-1] is SettingsMenu, "settings overlay opens from title")
		await key(KEY_ESCAPE)
		check(UIModal.stack.is_empty(), "Esc closes the settings overlay")

	# --- Start a run ---------------------------------------------------------------
	await main.call("start_run", 4321)
	await frames(5)
	var game: Node = GameState.game
	var hud: HUD = game.get("hud") if game else null
	check(hud != null and hud.root != null, "HUD built by Game")
	check(GameState.is_playing(), "run is playing")
	if hud == null:
		_finish(saved)
		return
	check(hud.hotbar.slots.size() == GameState.inventory.capacity, "hotbar has a slot per sack slot")

	# Pause with Esc and resume with Esc
	await key(KEY_ESCAPE)
	check(hud.modal_name() == "pause", "Esc opens the pause menu")
	check(get_tree().paused and GameState.ui_blocking, "pause menu pauses and blocks gameplay input")
	await key(KEY_ESCAPE)
	check(hud.modal_name() == "" and not get_tree().paused and not GameState.ui_blocking, "Esc resumes")

	# Crafting via the request_modal event, craft kindling, close with E
	GameState.storage.add("wood", 3)
	var wood_before := Crafting.available("wood", GameState.crafting_sources())
	var kind_before := Crafting.available("kindling", GameState.crafting_sources())
	Events.request_modal.emit("crafting", {})
	await frames(3)
	check(hud.modal_name() == "crafting" and GameState.ui_blocking and not get_tree().paused, "crafting opens without pausing")
	var crafting := hud._modal as CraftingUI
	check(crafting != null and crafting.craft("kindling"), "craft kindling succeeds")
	check(Crafting.available("wood", GameState.crafting_sources()) == wood_before - 1, "crafting paid 1 wood")
	check(Crafting.available("kindling", GameState.crafting_sources()) == kind_before + 3, "crafting gave 3 kindling")
	check(int(GameState.stats.get("items_crafted", 0)) >= 1, "items_crafted stat counted")
	await frames(10)
	await key(KEY_E)
	check(hud.modal_name() == "" and not GameState.ui_blocking, "E closes crafting")

	# Storage: store all resources, close with Tab
	GameState.inventory.add("stone", 4)
	Events.request_modal.emit("storage", {})
	await frames(3)
	var storage := hud._modal as StorageUI
	check(storage != null, "storage opens")
	if storage:
		storage.store_all_resources()
		check(GameState.inventory.count_of("stone") == 0 and GameState.storage.count_of("stone") >= 4, "store all moves resources to the camp box")
		check(GameState.inventory.has("rusty_axe"), "tools stay in the sack")
	await frames(10)
	await key(KEY_TAB)
	check(hud.modal_name() == "", "Tab closes storage")

	# Hotbar: number keys, sack rows, inventory full
	await key(KEY_2)
	check(GameState.selected_slot == 1, "key 2 selects slot 2")
	GameState.upgrade_sack("good_sack")
	await frames(3)
	check(hud.hotbar.slots.size() == 12, "hotbar rebuilt for a 12-slot sack")
	await key(KEY_TAB)
	check(hud.hotbar.expanded, "Tab shows the extra sack row")
	await key(KEY_TAB)
	check(not hud.hotbar.expanded, "Tab hides the extra sack row")
	var id0 := GameState.inventory.slot_id(0)
	var id1 := GameState.inventory.slot_id(1)
	hud.hotbar._on_slot_dropped(GameState.inventory, 0, hud.hotbar.slots[1] as ItemSlot)
	check(GameState.inventory.slot_id(0) == id1 and GameState.inventory.slot_id(1) == id0, "drag-and-drop swaps hotbar slots")
	hud.hotbar._on_slot_activated(hud.hotbar.slots[4] as ItemSlot)
	check(GameState.selected_slot == 4, "clicking a slot selects it")
	Events.inventory_full.emit("wood")
	await frames(2)
	check(hud.hotbar._shake > 0.0, "inventory_full shakes the hotbar")

	# Feedback layers
	Events.notify.emit("Test toast", "good")
	Events.item_picked_up.emit("wood", 2)
	Events.big_message.emit("THE FIRE IS OUT. YOU ARE NO LONGER SAFE.", Color.RED, 4.0)
	Events.player_damaged.emit(20.0, "test")
	await frames(2)
	check(hud.feed._toasts.size() >= 1 and hud.feed._pickups.size() >= 1, "toast and pickup feed show")
	check(hud.banners._items.any(func(e: Dictionary) -> bool: return e["kind"] == "fire_out"), "fire-out banner shows")
	check(hud.fx._hurt > 0.0, "damage flash triggers")
	Settings.set_value("sound_captions", true)
	Events.caption.emit("[test sound]")
	await frames(1)
	check(hud.feed._captions.size() == 1, "captions show when enabled")

	# Settings: UI scale and accessibility
	Settings.set_value("ui_scale", 1.25)
	await frames(2)
	check(is_equal_approx(hud.root.scale.x, 1.25), "ui_scale scales the HUD")
	var normal_theme := ThemeFactory.get_theme()
	Settings.set_value("high_contrast", true)
	await frames(1)
	check(ThemeFactory.get_theme() != normal_theme and ThemeFactory.panel_color().a > 0.95, "high contrast rebuilds an opaque theme")
	var base_health: Array = ThemeFactory.bar_colors("health")
	Settings.set_value("colorblind_mode", "deuteranopia")
	check(ThemeFactory.bar_colors("health")[0] != base_health[0], "colour-blind palette changes bar colours")
	Events.request_modal.emit("settings", {})
	await frames(3)
	check(hud.modal_name() == "settings", "settings opens in game")
	await key(KEY_ESCAPE)
	check(hud.modal_name() == "", "Esc closes in-game settings")
	Events.request_modal.emit("no_such_window", {})
	await frames(1)
	check(hud.modal_name() == "", "unknown modal is ignored with a toast")

	# Death -> game over
	GameState.survival.damage(9999.0, "cold")
	await get_tree().create_timer(3.4, true, false, true).timeout
	await frames(3)
	var over: Node = main.get("current_screen")
	check(over != null and over.has_signal("retry_pressed") and over.has_signal("title_pressed"), "game-over screen shown")
	if over:
		var summary: Dictionary = over.get("summary")
		check(summary.has("nights") and summary.has("rank"), "game over has the run summary")
		check(str(over.call("cause_text", "cold")) == "You got too cold.", "cold cause line")
		over.call("_open_leaderboard")
		await frames(2)
		check(UIModal.stack.size() >= 1 and UIModal.stack[-1] is LeaderboardScreen, "leaderboard opens from game over")
		(UIModal.stack[-1] as UIModal).close()
		await frames(2)
		# Try Again: a second run must get a fresh HUD and no stale listeners.
		over.emit_signal("retry_pressed")
		var waited := 0
		while not GameState.is_playing() and waited < 600:
			await frames(1)
			waited += 1
		await frames(5)
		var hud2: HUD = GameState.game.get("hud") if GameState.game else null
		check(hud2 != null and hud2 != hud and is_instance_valid(hud2), "Try Again starts a new run with a fresh HUD")
		Events.notify.emit("Second run toast", "info")
		GameState.add_coins(3)
		Events.big_message.emit("Hello again", Color.WHITE, 2.0)
		await frames(3)
		check(hud2 != null and hud2.feed._toasts.size() >= 1, "events reach the new HUD")
	_finish(saved)


func _finish(saved: Dictionary) -> void:
	for k in saved:
		Settings.set_value(k, saved[k])
	print("UITEST RESULT: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
