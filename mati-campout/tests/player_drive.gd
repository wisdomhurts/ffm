extends Node
## Headless integration test for the player / items / pickups system.
## Drives the real Player through its public API against small fake
## stand-ins (a Vegetation-like node with two trees, a dummy monster), so it
## works even while other systems are still stubs.
##
## Run: godot --headless --path . res://tests/player_drive.tscn
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var main: Node
var events_seen: Dictionary = {}


class FakeTrees:
	extends Node3D
	## Minimal Vegetation stand-in: tree 0 regular, tree 1 giant (Elder Tree).
	var trees: Array = []
	var emit_events := false

	func add_tree(pos: Vector3, kind: String, hp: int) -> void:
		trees.append({"pos": pos, "kind": kind, "hp": hp, "max_hp": hp, "alive": true})

	func find_tree(pos: Vector3, radius: float) -> int:
		var best := -1
		var bd := radius
		for i in trees.size():
			var t: Dictionary = trees[i]
			if not t["alive"]:
				continue
			var tp: Vector3 = t["pos"]
			var d := Vector2(tp.x - pos.x, tp.z - pos.z).length()
			if d <= bd:
				bd = d
				best = i
		return best

	func tree_info(id: int) -> Dictionary:
		return trees[id] if id >= 0 and id < trees.size() else {}

	func hit_tree(id: int, power: int, can_fell_giant: bool, _from: Vector3) -> Dictionary:
		var t: Dictionary = trees[id]
		if t["kind"] == "giant" and not can_fell_giant:
			return {"ok": false, "felled": false, "reason": "needs_mega_axe"}
		t["hp"] = int(t["hp"]) - power
		if int(t["hp"]) <= 0:
			t["alive"] = false
			Pickup.spawn("wood", 3, t["pos"] + Vector3(0, 1.0, 0), Vector3(1.5, 3.0, 0.5))
			return {"ok": true, "felled": true, "reason": ""}
		return {"ok": true, "felled": false, "reason": ""}

	func obstacles_near(_pos: Vector3, _radius: float) -> Array:
		return []


class Dummy:
	extends Node3D
	var team := "monster"
	var enemy_id := "night_stalker"
	var hp := 100.0
	var hits := 0
	var knock := Vector3.ZERO

	func _ready() -> void:
		add_to_group("damageable")
		add_to_group("monster")

	func take_damage(amount: float, _source: Node, _kind: String) -> void:
		hp -= amount
		hits += 1

	func is_alive() -> bool:
		return hp > 0.0

	func apply_knockback(v: Vector3) -> void:
		knock = v


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	main = load("res://main/main.gd").new()
	main.name = "Main"
	add_child(main)
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


func _count(sig: String) -> void:
	events_seen[sig] = int(events_seen.get(sig, 0)) + 1


func _select(id: String) -> bool:
	var i := -1
	for k in GameState.inventory.slots.size():
		if GameState.inventory.slot_id(k) == id:
			i = k
			break
	if i < 0:
		return false
	GameState.select_slot(i)
	return true


func _run() -> void:
	await main.call("start_run", 424242)
	var player: Player = GameState.player as Player
	check(player != null, "player exists")
	if player == null:
		_finish()
		return
	Events.tree_chopped.connect(func(_p: Vector3, _k: String) -> void: _count("tree_chopped"))
	Events.enemy_damaged.connect(func(_k: String, _a: float) -> void: _count("enemy_damaged"))
	Events.player_ate.connect(func(_i: String) -> void: _count("player_ate"))
	Events.player_damaged.connect(func(_a: float, _k: String) -> void: _count("player_damaged"))
	Events.float_text.connect(func(_p: Vector3, _t: String, _c: Color) -> void: _count("float_text"))
	Events.notify.connect(func(t: String, _k: String) -> void:
		_count("notify")
		if "Elder Tree" in t:
			_count("elder_notify")
		if "Sack full" in t:
			_count("sack_full")
		if "Tummy" in t:
			_count("tummy"))
	GameState.time_scale = 1.0
	GameState.upgrade_sack("best_sack")
	var gen := GameState.world_gen
	await frames(20)

	# --- Model, camera, look ------------------------------------------------------
	check(player.camera != null and player.camera.current, "player camera is current")
	check(player.model != null and player.model.held_node() != null, "held item model in the right hand")
	check(player.collision_layer == 2 and player.collision_mask == 9, "physics layers (2 / mask 1+4)")

	# --- Chopping with a fake Vegetation ------------------------------------------
	var fake := FakeTrees.new()
	fake.name = "FakeTrees"
	GameState.game.add_child(fake)
	GameState.vegetation = fake
	var base := gen.ground(Vector3(12.0, 0.0, 10.0))
	fake.add_tree(base + Vector3(1.6, 0, 0), "regular", 3)
	fake.add_tree(base + Vector3(-12.0, 0, 6.0), "giant", 24)
	player.teleport(base + Vector3(0, 0.1, 0))
	await frames(5)
	player.look_at_point(fake.trees[0]["pos"])
	check(_select("rusty_axe"), "select the rusty axe")
	await frames(2)
	check(player.model.held_node() != null and str(player.model.held_node().get_meta("item_id", "")) == "rusty_axe", "axe model held after selecting")
	var chopped_before := int(GameState.stats.get("trees_chopped", 0))
	for _i in 6:
		player.use_item()
		await seconds(0.7)
		if not fake.trees[0]["alive"]:
			break
	check(not fake.trees[0]["alive"], "tree felled with the rusty axe")
	check(int(GameState.stats.get("trees_chopped", 0)) == chopped_before + 1, "trees_chopped counted exactly once")
	check(int(events_seen.get("tree_chopped", 0)) == 1, "Events.tree_chopped emitted once")
	# Wood flies into the player (auto-pickup) once they walk up to it.
	var wood_before := GameState.inventory.count_of("wood")
	await seconds(1.0)
	var pickups_node: Node = GameState.game.get("pickups")
	for pk in pickups_node.get_children():
		if is_instance_valid(pk) and (pk as Pickup).item_id == "wood":
			player.teleport((pk as Node3D).global_position + Vector3(1.2, 0.1, 0.0))
			await seconds(0.8)
	check(GameState.inventory.count_of("wood") >= wood_before + 3, "felled wood auto-collected (%d)" % GameState.inventory.count_of("wood"))
	check(int(events_seen.get("float_text", 0)) > 0, "pickup shows floating text")

	# Elder Tree needs the Mega Axe.
	var gpos: Vector3 = fake.trees[1]["pos"]
	player.teleport(gen.ground(gpos + Vector3(2.2, 0, 0), 0.1))
	await frames(5)
	player.look_at_point(gpos)
	player.use_item()
	await seconds(0.8)
	check(int(events_seen.get("elder_notify", 0)) == 1, "Elder Tree asks for the Mega Axe")
	check(fake.trees[1]["hp"] == 24, "giant tree untouched by the rusty axe")
	GameState.inventory.add("mega_axe", 1)
	_select("mega_axe")
	await frames(2)
	player.use_item()
	await seconds(0.8)
	check(int(fake.trees[1]["hp"]) == 20, "mega axe chops the Elder Tree (hp %d)" % int(fake.trees[1]["hp"]))

	# --- Melee ----------------------------------------------------------------------
	var dummy := Dummy.new()
	GameState.game.add_child(dummy)
	player.teleport(base + Vector3(0, 0.1, 3.0))
	await frames(3)
	dummy.global_position = player.global_position + Vector3(0, 0, -1.6)
	player.look_at_point(dummy.global_position)
	_select("wooden_bat")
	await frames(2)
	player.use_item()
	await seconds(0.6)
	check(dummy.hits == 1 and is_equal_approx(dummy.hp, 87.0), "bat hits the monster in front (hp %.0f)" % dummy.hp)
	check(dummy.knock.length() > 0.1, "melee knockback applied")
	check(int(events_seen.get("enemy_damaged", 0)) >= 1, "Events.enemy_damaged emitted")
	# Behind the player: no hit.
	player.look_at_point(player.global_position + Vector3(0, 0, 5))
	await frames(2)
	player.use_item()
	await seconds(0.6)
	check(dummy.hits == 1, "melee ignores things behind you")

	# --- Guns -----------------------------------------------------------------------
	GameState.inventory.add("revolver", 1)
	GameState.inventory.add("revolver_rounds", 1)
	dummy.global_position = player.global_position + Vector3(0, 0, -9.0)
	dummy.global_position.y = gen.height_at(dummy.global_position.x, dummy.global_position.z)
	player.look_at_point(dummy.global_position + Vector3(0, 1.6, 0))
	_select("revolver")
	await frames(30)
	check(player.is_aiming_gun(), "revolver selected -> aiming (HUD crosshair)")
	# Aim the camera straight at the dummy's chest.
	var cam := player.camera
	var to := (dummy.global_position + Vector3(0, 0.9, 0)) - cam.global_position
	player.rig.yaw = atan2(-to.x, -to.z)
	player.rig.pitch = atan2(to.y, Vector2(to.x, to.z).length())
	await frames(3)
	var hits_before := dummy.hits
	player.use_item()
	await frames(4)
	check(dummy.hits == hits_before + 1, "revolver hitscan hits along the camera aim")
	check(GameState.inventory.count_of("revolver_rounds") == 0, "a round was used")
	await seconds(0.7)
	player.use_item()
	await frames(4)
	check(dummy.hits == hits_before + 1, "no ammo -> no shot (click)")
	dummy.queue_free()

	# --- Food & medical -----------------------------------------------------------------
	await seconds(1.0)
	GameState.inventory.add("cooked_meat", 1)
	GameState.survival.hunger = 40.0
	_select("cooked_meat")
	await frames(2)
	var eaten_before := int(GameState.stats.get("food_eaten", 0))
	player.use_item()
	await frames(3)
	check(GameState.survival.hunger > 70.0, "eating cooked meat fills hunger (%.0f)" % GameState.survival.hunger)
	check(int(GameState.stats.get("food_eaten", 0)) == eaten_before + 1 and int(events_seen.get("player_ate", 0)) == 1, "food_eaten stat + player_ate")
	await seconds(1.0)
	GameState.inventory.add("bandage", 1)
	GameState.survival.health = 40.0
	_select("bandage")
	await frames(2)
	player.use_item()
	await frames(3)
	check(GameState.survival.health > 70.0, "bandage heals (%.0f)" % GameState.survival.health)

	# --- Flashlight & battery (far from the campfire's light) ---------------------------------
	player.teleport(gen.ground(Vector3(70.0, 0.0, 70.0), 0.1))
	await seconds(1.0)
	GameState.inventory.add("flashlight", 1)
	var fwd := player.rig.flat_forward()
	var probe := player.global_position + fwd * 8.0
	check(Lights.intensity_at(probe, false) < 0.05, "dark out here before the flashlight")
	player.toggle_flashlight()
	await frames(3)
	check(player.is_flashlight_on(), "F toggles the flashlight on (and selects it)")
	check(Lights.intensity_at(probe, false) >= 0.35, "flashlight cone scares monsters in front (%.2f)" % Lights.intensity_at(probe, false))
	check(Lights.intensity_at(player.global_position - fwd * 8.0, false) < 0.3, "but not behind")
	var c0 := player.get_flashlight_charge()
	GameState.time_scale = 20.0
	await seconds(1.0)
	GameState.time_scale = 1.0
	check(player.get_flashlight_charge() < c0 - 0.1, "flashlight drains its charge")
	player.toggle_flashlight()
	await frames(2)
	check(not player.is_flashlight_on() and Lights.intensity_at(probe, false) < 0.3, "flashlight off removes the light source")
	GameState.inventory.add("battery", 1)
	_select("battery")
	await frames(2)
	player.use_item()
	await frames(2)
	check(is_equal_approx(player.get_flashlight_charge(), 1.0) and GameState.inventory.count_of("battery") == 0, "battery recharges the flashlight")

	# --- Torch ------------------------------------------------------------------------------
	await seconds(1.0)
	GameState.inventory.add("torch", 2)
	_select("torch")
	await frames(2)
	player.use_item()
	await frames(3)
	check(player.get_torch_fraction() > 0.9, "torch lit and burning")
	check(GameState.inventory.count_of("torch") == 1, "lighting a torch uses one")
	check(Lights.intensity_at(player.global_position + Vector3(2, 0, 0), false) >= 0.35, "torch glow is a protective light")
	check(player.model.left_item() != null, "lit torch held in the left hand")
	GameState.time_scale = 60.0
	await seconds(2.0)
	GameState.time_scale = 1.0
	check(player.get_torch_fraction() == 0.0 and player.model.left_item() == null, "torch burns out")

	# --- Damage ------------------------------------------------------------------------------
	GameState.survival.health = 100.0
	await seconds(0.6)
	player.take_damage(10.0, null, "bite")
	check(is_equal_approx(GameState.survival.health, 90.0), "take_damage reduces health")
	player.take_damage(10.0, null, "bite")
	check(is_equal_approx(GameState.survival.health, 90.0), "invulnerability window after a hit")
	check(int(events_seen.get("player_damaged", 0)) >= 1, "Events.player_damaged emitted")
	await seconds(0.6)
	var h_god := GameState.survival.health
	Dev.god_mode = true
	player.take_damage(10.0, null, "bite")
	Dev.god_mode = false
	check(GameState.survival.health >= h_god - 0.01, "god mode ignores damage")

	# --- Drop & pick up --------------------------------------------------------------------------
	if GameState.inventory.count_of("wood") == 0:
		GameState.inventory.add("wood", 2)
	_select("wood")
	await frames(2)
	var w0 := GameState.inventory.count_of("wood")
	var pk_before: int = pickups_node.get_child_count()
	player.drop_selected(1)
	await frames(3)
	check(GameState.inventory.count_of("wood") == w0 - 1 and pickups_node.get_child_count() == pk_before + 1, "Q drops one item as a pickup")
	await seconds(3.0)
	check(GameState.inventory.count_of("wood") == w0 - 1, "a dropped item does not fly straight back")
	var here := player.global_position
	player.teleport(here + Vector3(6.0, 0.0, 0.0))
	await seconds(0.5)
	player.teleport(here)
	await seconds(1.5)
	check(GameState.inventory.count_of("wood") == w0, "after walking away and back it is collected again")
	# A non-auto item needs E.
	var fl := Pickup.spawn("good_axe", 1, player.global_position + player.rig.flat_forward() * 1.2, Vector3.ZERO)
	await frames(10)
	var tgt := player.get_interact_target()
	check(tgt == fl, "pickup becomes the interact target")
	check(str(player.get_interact_text_full().get("text", "")) == "Pick up Good Axe", "prompt text 'Pick up Good Axe'")
	player.interact_nearest()
	await frames(3)
	check(GameState.inventory.has("good_axe"), "E picks it up")
	# Coins.
	var coins0 := GameState.coins
	Pickup.spawn("coins", 7, player.global_position + Vector3(0.8, 0.5, 0), Vector3(0, 2, 0))
	await seconds(2.0)
	check(GameState.coins == coins0 + 7, "coin pile auto-collects into the wallet")

	# --- Hotbar ------------------------------------------------------------------------------------
	GameState.select_slot(0)
	await frames(2)
	var first := GameState.selected_item_id()
	GameState.select_slot(GameState.selected_slot + 1)
	await frames(2)
	var held := player.model.held_node()
	check(held != null and str(held.get_meta("item_id", "")) == GameState.selected_item_id() and first != GameState.selected_item_id(), "hotbar cycling swaps the held model")

	# --- Deep water ----------------------------------------------------------------------------
	var shore := Vector3.INF
	for i in 400:
		var x := -40.0 - i * 0.5
		var d := gen.water_depth(x, 30.0)
		if d > 0.05 and d < 0.4:
			shore = Vector3(x, 0.0, 30.0)
			break
	if shore != Vector3.INF:
		player.teleport(gen.ground(shore, 0.1))
		await frames(5)
		player.rig.yaw = PI * 0.5  # face west (-X) into the lake
		Input.action_press("move_forward")
		await seconds(4.0)
		Input.action_release("move_forward")
		var p := player.global_position
		check(gen.water_depth(p.x, p.z) < 1.2, "kept out of deep water (depth %.2f)" % gen.water_depth(p.x, p.z))
	else:
		check(false, "found a lake shore to test")

	# --- Resting -----------------------------------------------------------------------------------
	player.teleport(gen.ground(Vector3(4, 0, 6), 0.1))
	await frames(5)
	player.resting = true
	await frames(10)
	check(player.is_resting() and player.model.current_action() == "sit", "resting sits down")
	Input.action_press("move_left")
	await frames(10)
	Input.action_release("move_left")
	check(not player.is_resting() and player.model.current_action() != "sit", "moving stands back up")

	# --- Death -----------------------------------------------------------------------------------------
	GameState.survival.damage(9999.0, "test")
	await frames(10)
	check(player.model.current_action() == "die" and player.rig.dead, "death collapse + camera pull-up")
	_finish()


func _finish() -> void:
	print("PLAYER DRIVE: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
