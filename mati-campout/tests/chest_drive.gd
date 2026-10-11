extends Node
## Headless integration test for chests & the map in the real game world:
## builds a full run, checks the placement, walks the player to the starter
## chest and presses E through the Player API, watches the loot fountain,
## the empty hint, discovery, restocking after real dawns, the HUD minimap,
## M before / after crafting the map, and the beacon (fire out hides the
## important markers).
##
## Run: godot --headless --path . res://tests/chest_drive.tscn [-- --seed=N]
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var game: Game
var opened_events: Array = []
var discovered_events: Array = []
var notes: Array = []


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
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
	await frames(int(ceil(s * Engine.physics_ticks_per_second)))


func key(keycode: Key) -> void:
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
	var seed_v := 20261010
	for a in OS.get_cmdline_user_args():
		if str(a).begins_with("--seed="):
			seed_v = int(str(a).trim_prefix("--seed="))
	var t0 := Time.get_ticks_msec()
	GameState.new_run(seed_v)
	game = Game.new()
	game.name = "Game"
	add_child(game)
	await game.build(func(_f: float, _t: String) -> void: pass)
	GameState.begin_play()
	print("CHEST world built in %d ms (seed %d)" % [Time.get_ticks_msec() - t0, seed_v])
	Events.chest_opened.connect(func(tier: String, pos: Vector3) -> void: opened_events.append([tier, pos]))
	Events.chest_discovered.connect(func(tier: String, _pos: Vector3) -> void: discovered_events.append(tier))
	Events.notify.connect(func(text: String, _kind: String) -> void: notes.append(text))
	var cm := game.chests
	var player := GameState.player as Player
	var hud := game.hud
	check(cm != null and cm.chest_count() == DB.bi("chests.common_count") + DB.bi("chests.rare_count") + DB.bi("chests.epic_count"),
		"every chest placed (%s)" % str(cm.counts_by_tier() if cm else {}))
	check(player != null and hud != null, "player and HUD exist")
	if cm == null or player == null or hud == null:
		_finish()
		return
	print("CHEST stats ", cm.debug_stats())
	var st := cm.starter()
	check(st != null, "starter chest exists")
	if st == null:
		_finish()
		return
	var sd := Vector2(st.global_position.x, st.global_position.z).length()
	check(sd >= 16.0 and sd <= 22.0, "starter chest 16-22 m from the fire (%.1f m)" % sd)
	check(st.is_in_group("map_marker") and st.is_in_group("chest"), "chest joins map_marker + chest")
	await frames(20)
	var far_regs := 0
	for c in cm.chests:
		if (c as Node).is_in_group("interactable"):
			far_regs += 1
	check(far_regs == 0, "far chests are not registered as interactables (%d)" % far_regs)
	check(st.body != null and st.lid != null and st.collider != null, "chest has a body, a lid and a collider")
	var grounded := absf(st.global_position.y - GameState.world_gen.height_at(st.global_position.x, st.global_position.z)) < 0.1
	check(grounded, "chest sits on the ground")
	await seconds(0.8)
	check(st.discovered, "the starter chest is seen from the start view")
	check(cm.sparkle != null and cm.sparkle.point_count() > 0, "nearby chests glint (%d sparkles)" % (cm.sparkle.point_count() if cm.sparkle else 0))

	# --- M before the map is crafted -------------------------------------------------
	await key(KEY_M)
	await frames(3)
	check(hud.modal_name() == "", "M without a map opens nothing")
	var hint_shown := false
	for e in hud.feed._toasts:
		if "Campfire Map" in str(e["text"]):
			hint_shown = true
	check(hint_shown, "M shows the 'Craft a Campfire Map' hint")
	var mini := hud.root.get_node_or_null("Minimap") as Control
	check(mini != null and not mini.visible, "minimap hidden before the map is crafted")

	# --- Open the starter chest ----------------------------------------------------
	var front := st.global_transform.basis.z
	front.y = 0.0
	front = front.normalized()
	var stand := st.global_position + front * 1.45
	player.teleport(GameState.world_gen.ground(stand, 0.05))
	await frames(4)
	player.look_at_point(st.global_position + Vector3(0, 0.4, 0))
	await seconds(0.3)
	check(st.is_in_group("interactable"), "a chest near the player becomes interactable")
	check(player.get_interact_target() == st, "the chest is the interact target")
	var full: Dictionary = player.get_interact_text_full()
	check(str(full.get("text", "")) == "Open Chest", "prompt says Open Chest (%s)" % str(full.get("text", "")))
	var coins0 := GameState.coins
	var preview := st.preview_loot()
	check(player.interact_nearest(), "E opens the chest")
	await frames(2)
	check(opened_events.size() == 1 and str(opened_events[0][0]) == "common", "Events.chest_opened(common) fired")
	check(int(GameState.stats.get("chests_opened", 0)) == 1, "chests_opened stat counted")
	check(st.opened and st.is_animating(), "lid is swinging open")
	check(st.last_loot == preview, "loot is the seeded roll")
	await seconds(0.45)
	check(st.lid_pivot.rotation.x < -0.6, "lid swung back (%.2f rad)" % st.lid_pivot.rotation.x)
	var lit := false
	for n in st.find_children("*", "OmniLight3D", true, false):
		if (n as OmniLight3D).light_energy > 0.5:
			lit = true
	check(lit, "a burst of light from the chest")
	await seconds(0.6)
	var around := _pickups_near(st.global_position, 6.0)
	check(around.size() > 0 or GameState.coins > coins0, "loot popped out as pickups (%d)" % around.size())
	var flew_out := true
	for p in around:
		if (p as Node3D).global_position.distance_to(st.global_position) < 0.2:
			flew_out = false
	check(flew_out, "pickups left the chest")
	await seconds(2.0)
	# Walk over whatever did not fly into the sack by itself.
	for p in _pickups_near(st.global_position, 8.0):
		if is_instance_valid(p):
			player.teleport(GameState.world_gen.ground((p as Node3D).global_position, 0.05))
			await seconds(0.5)
			if is_instance_valid(p) and (p as Node).is_in_group("interactable"):
				(p as Pickup).collect()
	await seconds(0.6)
	var want_coins := 0
	for e in preview:
		if str(e["id"]) == "coins":
			want_coins = int(e["count"])
	check(GameState.coins - coins0 == want_coins, "all %d coins collected (%d)" % [want_coins, GameState.coins - coins0])
	var got_items := 0
	for e in preview:
		if str(e["id"]) != "coins" and GameState.inventory.count_of(str(e["id"])) + GameState.storage.count_of(str(e["id"])) > 0:
			got_items += 1
	check(got_items >= preview.size() - 1 - 1, "loot items reached the sack (%d of %d)" % [got_items, preview.size() - 1])
	check(notes.any(func(t: String) -> bool: return t.begins_with("Chest:")), "loot toast shown")

	# --- Empty chest ------------------------------------------------------------------
	player.teleport(GameState.world_gen.ground(stand, 0.05))
	await frames(4)
	player.look_at_point(st.global_position + Vector3(0, 0.4, 0))
	await seconds(0.3)
	full = player.get_interact_text_full()
	check(str(full.get("text", "")) == "", "no Open prompt on an empty chest")
	check(str(full.get("hint", "")).begins_with("Empty"), "greyed hint: %s" % str(full.get("hint", "")))
	check(not player.interact_nearest(), "E on an empty chest does nothing")
	check(opened_events.size() == 1, "still one opening")

	# --- Craft the map: minimap + M opens the map ----------------------------------
	GameState.give("map")
	check(bool(GameState.flags.get("has_map", false)), "the map is unlocked")
	await seconds(0.6)
	check(mini != null and mini.visible, "minimap appears in the HUD corner")
	await key(KEY_M)
	await frames(3)
	check(hud.modal_name() == "map", "M opens the map")
	check(GameState.ui_blocking, "map blocks gameplay input")
	var map := hud._modal as MapUI
	check(map != null and map.view != null, "map view built")
	if map:
		var markers := MapUI.collect_markers(get_tree())
		var has_starter := false
		var has_home := false
		for m in markers:
			if str(m["kind"]) == "chest" and (m["pos"] as Vector3).distance_to(st.global_position) < 0.5:
				has_starter = bool(m["opened"])
			if str(m["kind"]) == "camp":
				has_home = true
		check(has_starter, "map shows the opened starter chest")
		check(has_home, "map shows Home Camp")
		var undiscovered := 0
		for c in cm.chests:
			if not (c as Chest).discovered:
				for m in markers:
					if str(m["kind"]) == "chest" and (m["pos"] as Vector3).distance_to((c as Chest).global_position) < 0.5:
						undiscovered += 1
		check(undiscovered == 0, "undiscovered chests stay off the map")
		check(map.view.zoom > 0.0 and map.view.fit_zoom() > 0.0, "map has a sane zoom")
		var z0 := map.view.zoom
		map.view.zoom_at(map.view.size * 0.5, 2.0)
		check(map.view.zoom > z0 * 1.5, "map zooms in")
		var c0 := map.view.center
		map.view.pan_pixels(Vector2(80, 30))
		check(map.view.center.distance_to(c0) > 1.0, "map pans (%s -> %s)" % [str(c0), str(map.view.center)])
		# Beacon: fire out hides important markers.
		check(map.view._beacon > 0.9, "beacon lit while the fire burns")
		GameState.fire.extinguish()
		await seconds(1.2)
		check(map.view._beacon < 0.05, "fire out: markers fade away")
		check(map._beacon_label.text == MapUI.BEACON_NOTE, "beacon-dark note shown")
		GameState.fire.relight("kindling", "wood")
		await seconds(1.2)
		check(map.view._beacon > 0.95, "relit: markers come back")
	await key(KEY_M)
	await frames(3)
	check(hud.modal_name() == "" and not GameState.ui_blocking, "M closes the map")
	# The minimap opens the map too.
	if mini:
		mini.call("_open")
		await frames(3)
		check(hud.modal_name() == "map", "the minimap opens the map")
		await key(KEY_ESCAPE)
		await frames(3)
		check(hud.modal_name() == "", "Esc closes the map")

	# --- Discovery of a far chest ---------------------------------------------------
	var rare := cm.nearest(Vector3.ZERO, "rare")
	if rare:
		var rf := rare.global_transform.basis.z
		rf.y = 0.0
		var spot := rare.global_position + rf.normalized() * 12.0
		player.teleport(GameState.world_gen.ground(spot, 0.05))
		await frames(4)
		player.look_at_point(rare.global_position)
		await seconds(0.8)
		check(rare.discovered, "a rare chest is discovered when seen within 30 m")
		check(discovered_events.has("rare"), "Events.chest_discovered(rare)")
		check(notes.any(func(t: String) -> bool: return "Rare Chest" in t), "toast: You spotted a Rare Chest!")

	# --- Restock after real dawns ---------------------------------------------------
	player.teleport(GameState.world_gen.ground(stand, 0.05))
	await frames(4)
	var days := DB.bi("chests.restock_days", 3)
	for d in days:
		check(st.opened, "still empty before dawn %d" % (d + 1))
		GameState.day_cycle.advance(GameState.day_cycle.cycle_length())
		await frames(2)
	check(not st.opened, "refilled after %d dawns" % days)
	await seconds(0.8)
	check(absf(st.lid_pivot.rotation.x) < 0.01, "lid closed again")
	player.look_at_point(st.global_position + Vector3(0, 0.4, 0))
	await seconds(0.3)
	full = player.get_interact_text_full()
	check(str(full.get("text", "")) == "Open Chest", "can be opened again (%s)" % str(full.get("text", "")))
	var second := st.preview_loot()
	check(player.interact_nearest(), "second opening")
	check(st.last_loot == second and st.open_count == 2, "second opening rolls new seeded loot")
	_finish()


func _pickups_near(pos: Vector3, r: float) -> Array:
	var out: Array = []
	for p in get_tree().get_nodes_in_group("pickup"):
		if p is Node3D and (p as Node3D).global_position.distance_to(pos) < r:
			out.append(p)
	return out


func _finish() -> void:
	print("CHEST RESULT: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
