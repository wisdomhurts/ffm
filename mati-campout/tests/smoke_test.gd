extends Node
## Headless autopilot that plays the core loop through public APIs:
## build the world -> walk to a tree -> chop it -> collect wood -> feed the fire
## -> survive the first night -> fire goes out -> relight -> die -> leaderboard.
##
## Run: godot --headless --path . -- --smoke --seed=424242
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var main: Node


func _ready() -> void:
	main = get_parent()
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


## Simulate game time quickly by raising the time scale for real frames.
func simulate(game_seconds: float, scale: float = 20.0) -> void:
	var prev := GameState.time_scale
	GameState.time_scale = scale
	var t := 0.0
	while t < game_seconds:
		await get_tree().physics_frame
		t += get_physics_process_delta_time() * scale
	GameState.time_scale = prev


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	var seed_v := int(main.call("parse_args").get("seed", 424242))
	await main.call("start_run", seed_v)
	print("SMOKE world built in %d ms" % (Time.get_ticks_msec() - t0))
	var game: Game = GameState.game
	check(game != null, "game exists")
	check(GameState.is_playing(), "run is playing")
	check(GameState.player != null, "player registered")
	check(GameState.campfire != null, "campfire registered")
	check(GameState.fire.is_lit(), "fire starts lit")
	check(GameState.inventory.capacity == 7, "old sack has 7 slots")
	check(GameState.inventory.has("rusty_axe") and GameState.inventory.has("wooden_bat"), "start kit")
	if game == null or GameState.player == null:
		_finish()
		return
	var player: Node3D = GameState.player
	await frames(30)
	check(player.global_position.y > GameState.world_gen.height_at(player.global_position.x, player.global_position.z) - 0.5, "player stands on terrain")

	# --- Walk into the woods and chop a tree ---------------------------------
	var veg: Node = GameState.vegetation
	var tree_id := -1
	if veg:
		tree_id = int(veg.call("find_tree", player.global_position, 70.0))
	check(tree_id >= 0, "a tree within 70 m of camp")
	if tree_id >= 0:
		var info: Dictionary = veg.call("tree_info", tree_id)
		var tpos: Vector3 = info["pos"]
		var stand := tpos + (player.global_position - tpos).normalized() * 1.4
		stand.y = GameState.world_gen.height_at(stand.x, stand.z) + 0.1
		player.call("teleport", stand)
		await frames(5)
		player.call("look_at_point", tpos)
		GameState.select_slot(GameState.inventory.slots.find(GameState.inventory.slots.filter(func(s: Variant) -> bool: return s != null and s["id"] == "rusty_axe")[0]))
		var wood_before := GameState.inventory.count_of("wood")
		var felled := false
		for _swing in 30:
			player.call("use_item")
			await frames(int(0.7 * Engine.physics_ticks_per_second))
			var ti: Dictionary = veg.call("tree_info", tree_id)
			if not bool(ti.get("alive", true)):
				felled = true
				break
		check(felled, "tree felled with the rusty axe")
		check(GameState.stats.get("trees_chopped", 0) >= 1, "trees_chopped stat counts")
		# Collect the dropped wood (walk over / interact with pickups).
		await frames(60)
		for p in game.pickups.get_children():
			if is_instance_valid(p):
				player.call("teleport", (p as Node3D).global_position + Vector3(0, 0.2, 0))
				await frames(10)
				if is_instance_valid(p) and p.has_method("interact"):
					p.call("interact", player)
				await frames(4)
		check(GameState.inventory.count_of("wood") > wood_before, "collected wood from the tree")

	# --- Return to camp and feed the fire -------------------------------------
	var fire_pos: Vector3 = GameState.campfire.global_position
	player.call("teleport", fire_pos + Vector3(1.8, 0.2, 0.6))
	await frames(10)
	GameState.fire.fuel = GameState.fire.max_fuel() * 0.4
	var fuel_before := GameState.fire.fuel
	if GameState.inventory.count_of("wood") == 0:
		GameState.inventory.add("wood", 2)
	player.call("look_at_point", fire_pos)
	await frames(3)
	var target: Variant = player.call("get_interact_target")
	check(target == GameState.campfire, "campfire is the interact target near it")
	player.call("interact_nearest")
	await frames(3)
	check(GameState.fire.fuel > fuel_before, "adding wood raises fire fuel")
	check(GameState.stats.get("fuel_added", 0) >= 1, "fuel_added stat counts")

	# --- Survive the first night by the fire -----------------------------------
	GameState.fire.fuel = GameState.fire.max_fuel()
	GameState.survival.hunger = 100.0
	GameState.day_cycle.skip_to(DayCycle.Phase.DUSK)
	await simulate(GameState.day_cycle.durations[1] + 5.0)
	check(GameState.day_cycle.phase == DayCycle.Phase.NIGHT, "night falls")
	await frames(30)
	var monsters := get_tree().get_nodes_in_group("monster")
	check(monsters.size() > 0, "monsters come out at night (%d)" % monsters.size())
	# Keep the fire fed through the night (like a player would).
	var night_len: float = GameState.day_cycle.durations[2]
	var elapsed := 0.0
	while GameState.day_cycle.phase == DayCycle.Phase.NIGHT and elapsed < night_len + 30.0:
		if GameState.fire.fraction() < 0.5:
			GameState.inventory.add("wood", 1)
			player.call("interact_nearest")
		await simulate(10.0, 10.0)
		elapsed += 10.0
	check(not GameState.survival.dead, "player survives the night by the fire")
	check(GameState.day_cycle.nights_survived >= 1, "night counter increased at dawn")
	check(GameState.survival.warmth > 40.0, "warm by the fire (%.0f)" % GameState.survival.warmth)

	# --- Fire goes out, then relight ---------------------------------------------
	GameState.fire.extinguish()
	await frames(5)
	check(GameState.fire.state() == FireModel.State.OUT, "fire can go out")
	check(Lights.intensity_at(fire_pos, false) < 0.05, "no protective light when out")
	GameState.storage.add("kindling", 1)
	GameState.inventory.add("wood", 1)
	player.call("teleport", fire_pos + Vector3(1.8, 0.2, 0.6))
	player.call("look_at_point", fire_pos)
	await frames(5)
	player.call("interact_nearest")
	await frames(5)
	check(GameState.fire.is_lit(), "fire relit with kindling + wood")
	check(Lights.intensity_at(fire_pos, false) > 0.5, "protective light returns")

	# --- Death ends the run and records the leaderboard ------------------------------
	var before_runs := int(Profile.lifetime.get("runs", 0))
	GameState.survival.damage(9999.0, "test")
	await frames(5)
	check(GameState.state == GameState.RunState.DEAD, "death ends the run")
	var summary := GameState.end_run()
	check(int(Profile.lifetime.get("runs", 0)) == before_runs + 1, "run recorded in profile")
	check(int(summary.get("nights", -1)) >= 1, "summary has nights survived")
	_finish()


func _finish() -> void:
	print("SMOKE RESULT: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
