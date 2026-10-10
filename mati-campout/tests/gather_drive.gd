extends Node
## Headless integration test for gatherables in the real game world: builds
## a full run, walks the player to resources near camp and presses E through
## the Player API (interact_nearest), then checks items, depletion, the
## interactable registration and regrowth at dawn.
##
## Run: godot --headless --path . res://tests/gather_drive.tscn [-- --seed=N]
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var game: Game
var gathered: Array = []
var floats: Array = []


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
	print("GATHER world built in %d ms (seed %d)" % [Time.get_ticks_msec() - t0, seed_v])
	Events.resource_gathered.connect(func(id: String, n: int) -> void: gathered.append([id, n]))
	Events.float_text.connect(func(_p: Vector3, text: String, _c: Color) -> void: floats.append(text))
	var g := game.gatherables
	var player := GameState.player
	check(g != null and g.node_count() > 250, "gatherables placed (%d)" % (g.node_count() if g else 0))
	check(player != null, "player exists")
	if g == null or player == null:
		_finish()
		return
	print("GATHER stats ", g.debug_stats())
	var stone := g.nearest(Vector3.ZERO, "stone_pile", 25.5)
	var twigs := g.nearest(Vector3.ZERO, "twigs", 25.5)
	var berry := g.nearest(Vector3.ZERO, "berry_bush", 35.5)
	check(stone >= 0, "stone pile within 25 m of camp")
	check(twigs >= 0, "twigs within 25 m of camp")
	check(berry >= 0, "berry bush within 35 m of camp")
	await frames(10)
	check(_interactables() < 25, "few gatherables registered at camp (%d interactables)" % _interactables())

	# --- Walk up to the stone pile and press E ---------------------------------------
	if stone >= 0:
		await _walk_to(player, stone)
		var target: Variant = player.call("get_interact_target")
		check(target is GatherableNode and (target as GatherableNode).index == stone, "the stone pile is the interact target")
		var full: Dictionary = player.call("get_interact_text_full")
		check(str(full.get("text", "")) == "Gather Stones", "prompt says Gather Stones (%s)" % str(full.get("text", "")))
		var before := GameState.inventory.count_of("stone")
		check(bool(player.call("interact_nearest")), "E starts gathering")
		await seconds(0.4)
		check(g.is_gathering(stone), "gathering in progress")
		full = player.call("get_interact_text_full")
		check(str(full.get("text", "")).ends_with("%"), "prompt shows progress (%s)" % str(full.get("text", "")))
		check(GameState.inventory.count_of("stone") == before, "no stones before the action ends")
		await seconds(DB.bf("gatherables.gather_seconds", 1.0))
		var got := GameState.inventory.count_of("stone") - before
		check(got >= 2 and got <= 3, "2-3 stones in the sack (%d)" % got)
		check(not gathered.is_empty() and gathered[-1][0] == "stone", "Events.resource_gathered fired")
		check(floats.any(func(t: String) -> bool: return t.begins_with("+") and t.ends_with("Stone")), "+N Stone float text (%s)" % str(floats))
		check(int(g.node_info(stone)["charges"]) == 1, "pile shrank (1 gather left)")
		player.call("interact_nearest")
		await seconds(DB.bf("gatherables.gather_seconds", 1.0) + 0.3)
		check(not bool(g.node_info(stone)["available"]), "pile used up after two gathers")
		full = player.call("get_interact_text_full")
		check(str(full.get("text", "")) != "Gather Stones", "no Gather prompt on an empty pile")
		check(str(full.get("hint", "")) != "", "greyed hint says when stones come back (%s)" % str(full.get("hint", "")))

	# --- Berries: walking away cancels, coming back works --------------------------------
	if berry >= 0:
		await _walk_to(player, berry)
		var before_b := GameState.inventory.count_of("berries")
		player.call("interact_nearest")
		await seconds(0.3)
		var away: Vector3 = (g.node_info(berry)["pos"] as Vector3) + Vector3(6, 0, 0)
		player.call("teleport", GameState.world_gen.ground(away, 0.1))
		await seconds(0.3)
		check(not g.is_gathering(), "walking away cancels the gather")
		check(GameState.inventory.count_of("berries") == before_b, "no berries from a cancelled gather")
		await _walk_to(player, berry)
		player.call("interact_nearest")
		await seconds(DB.bf("gatherables.gather_seconds", 1.0) + 0.3)
		check(GameState.inventory.count_of("berries") > before_b, "berries picked")
		check(not bool(g.node_info(berry)["available"]), "bush picked clean")

	# --- Twigs -> kindling ------------------------------------------------------------------
	if twigs >= 0:
		await _walk_to(player, twigs)
		var before_k := GameState.inventory.count_of("kindling")
		player.call("interact_nearest")
		await seconds(DB.bf("gatherables.gather_seconds", 1.0) + 0.3)
		check(GameState.inventory.count_of("kindling") > before_k, "twigs give kindling")

	# --- Registration follows the player ----------------------------------------------------
	player.call("teleport", GameState.world_gen.ground(Vector3(0, 0, 0), 0.2))
	await seconds(0.5)
	var near_camp := g.debug_stats()["proxies"] as int
	check(near_camp <= 3, "proxies freed when the player leaves (%d)" % near_camp)

	# --- Regrowth at dawn --------------------------------------------------------------------
	var days := DB.bi("gatherables.respawn_days", 2)
	for _d in days:
		GameState.day_cycle.advance(GameState.day_cycle.cycle_length())
		await frames(2)
	if stone >= 0:
		check(bool(g.node_info(stone)["available"]), "stone pile back after %d dawns" % days)
	if berry >= 0:
		check(bool(g.node_info(berry)["available"]), "berries regrow after %d dawns" % days)
	_finish()


func _interactables() -> int:
	return get_tree().get_nodes_in_group("interactable").size()


func _walk_to(player: Node3D, id: int) -> void:
	var g := game.gatherables
	var info := g.node_info(id)
	var pos: Vector3 = info["pos"]
	var r: float = info["radius"]
	var dir := (Vector3.ZERO - pos)
	dir.y = 0.0
	dir = dir.normalized() if dir.length() > 0.1 else Vector3.BACK
	var stand := pos + dir * (r + 0.9)
	player.call("teleport", GameState.world_gen.ground(stand, 0.1))
	await frames(4)
	player.call("look_at_point", pos)
	await seconds(0.35)


func _finish() -> void:
	print("GATHER RESULT: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
