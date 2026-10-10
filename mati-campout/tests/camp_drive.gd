extends Node
## Headless integration test for the campsite & campfire, driven through the
## real game (main.tscn) and the public camp APIs: layout and snapping, fire
## feeding / full / relight / warnings, fuel from storage, cooking, the tent,
## crate & storage modals, fire level-ups and dawn kindling.
##
## Run: godot --headless --path . -s res://tests/camp_drive_launcher.gd
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var main: Node
var seen: Dictionary = {}


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


func simulate(game_seconds: float, scale: float = 10.0) -> void:
	var prev := GameState.time_scale
	GameState.time_scale = scale
	var t := 0.0
	while t < game_seconds:
		await get_tree().physics_frame
		t += 1.0 / Engine.physics_ticks_per_second * scale
	GameState.time_scale = prev


func _note(key: String) -> Callable:
	return func(a: Variant = null, b: Variant = null, c: Variant = null) -> void:
		var arr: Array = seen.get(key, [])
		arr.append([a, b, c])
		seen[key] = arr


func _count(key: String) -> int:
	return (seen.get(key, []) as Array).size()


func _texts(key: String) -> String:
	var out := ""
	for e in seen.get(key, []):
		out += str((e as Array)[0]) + " | "
	return out


func _run() -> void:
	var ev: Node = Events
	for sig in ["fire_fed", "fire_relit", "fire_extinguished", "notify", "big_message", "camera_shake", "food_cooked",
			"tent_upgraded", "request_modal"]:
		ev.connect(sig, _note(sig))
	main = (load("res://main/main.tscn") as PackedScene).instantiate()
	get_tree().root.add_child(main)
	await get_tree().process_frame
	await main.call("start_run", 4242)
	var gs: Node = GameState
	var camp: Campsite = gs.get("camp") as Campsite
	check(camp != null, "campsite registered as GameState.camp")
	if camp == null:
		_finish()
		return
	var gen: WorldGen = gs.get("world_gen")
	var fire: FireModel = gs.get("fire")
	var player: Node3D = gs.get("player")
	var cf := camp.campfire
	check(cf != null and gs.get("campfire") == cf, "campfire registered")
	check(camp.tent != null and camp.tent.is_in_group("shelter"), "tent in group shelter")
	check(camp.crate != null and camp.storage_box != null and camp.cooking_rack != null, "crate, storage box, rack exposed")
	check(camp.structures != null and camp.structures.name == "Structures", "Structures node for buildables")
	for n in [camp.crate, camp.storage_box, camp.tent, camp.lantern_pole]:
		var p: Vector3 = (n as Node3D).global_position
		check(absf(p.y - gen.height_at(p.x, p.z)) < 0.15, "%s snapped to the ground (%.2f)" % [(n as Node).name, p.y - gen.height_at(p.x, p.z)])
	var tent_d := camp.tent.global_position.distance_to(cf.global_position)
	check(tent_d > 4.5 and tent_d < 8.0, "tent ~6 m from the fire (%.1f m)" % tent_d)
	var to_fire := (cf.global_position - camp.tent.global_position).normalized()
	check(camp.tent.global_transform.basis.z.normalized().dot(to_fire) > 0.9, "tent door faces the fire")
	var crate_d := camp.crate.global_position.distance_to(cf.global_position)
	check(crate_d > 4.0 and crate_d < 6.5, "crafting crate ~5 m west (%.1f m)" % crate_d)
	check(camp.crate.global_position.x < -3.0, "crate is west of the fire")
	var zones := camp.clear_zones()
	check(zones.size() >= 14, "clear zones for ground cover (%d)" % zones.size())
	check(camp.obstacles_near(cf.global_position, 0.5).size() >= 1, "fire pit is a camp obstacle")
	await frames(10)
	check(cf.light.shadow_enabled == false or gs.get("day_cycle").darkness() > 0.04, "fire light has no shadow by day")
	check(cf.light.omni_range > fire.light_radius(), "light range covers the safe radius")

	# --- Feeding -------------------------------------------------------------------
	var inv: Inventory = gs.get("inventory")
	var storage: Inventory = gs.get("storage")
	storage.remove("wood", 999)
	inv.add("wood", 2)
	player.call("teleport", cf.global_position + Vector3(1.8, 0.2, 0.6))
	await frames(5)
	player.call("look_at_point", cf.global_position)
	await frames(3)
	fire.fuel = fire.max_fuel() * 0.4
	check(player.call("get_interact_target") == cf, "campfire is the interact target near it")
	check(cf.get_interact_text(player) == "Add Wood to fire", "prompt: Add Wood to fire (%s)" % cf.get_interact_text(player))
	var fuel0 := fire.fuel
	var stat0 := int(gs.get("stats").get("fuel_added", 0))
	player.call("interact_nearest")
	await frames(3)
	check(fire.fuel > fuel0, "adding wood raises fuel")
	check(int(gs.get("stats").get("fuel_added", 0)) == stat0 + 1, "fuel_added stat")
	check(_count("fire_fed") >= 1 and _count("camera_shake") >= 1, "fire_fed + camera shake")
	check(inv.count_of("wood") == 1, "one wood taken from the sack")
	await frames(30)
	inv.add("coal", 1)
	var coal_slot := -1
	for i in inv.capacity:
		if inv.slot_id(i) == "coal":
			coal_slot = i
	gs.call("select_slot", coal_slot)
	check(cf.get_interact_text(player) == "Add Coal to fire", "selected coal is preferred")
	gs.call("select_slot", 0)
	inv.remove("wood", 99)
	inv.remove("coal", 99)
	storage.add("wood", 2)
	check(cf.get_interact_text(player) == "Add Wood to fire", "wood from the storage box")
	cf.interact(player)
	check(storage.count_of("wood") == 1, "storage wood used")
	fire.fuel = fire.max_fuel()
	check(cf.get_interact_text(player) == "" and cf.get_interact_hint(player) == "The fire is full", "full fire hint")
	storage.remove("wood", 99)
	fire.fuel = fire.max_fuel() * 0.5
	check(cf.get_interact_hint(player).contains("Wood"), "no fuel hint (%s)" % cf.get_interact_hint(player))

	# --- Low warning, going out, relight ---------------------------------------------------
	seen.erase("notify")
	fire.fuel = fire.max_fuel() * (fire.low_fraction + 0.01)
	fire.burn(0.0001)
	await simulate(fire.max_fuel() * 0.02 + 2.0, 4.0)
	check(_texts("notify").contains("getting low"), "low fire warning (%s)" % _texts("notify"))
	var outs0 := int(gs.get("stats").get("fire_outs", 0))
	fire.extinguish()
	await frames(5)
	check(_texts("big_message").contains("FIRE IS OUT"), "fire-out banner")
	check(int(gs.get("stats").get("fire_outs", 0)) == outs0 + 1, "fire_outs stat")
	check(Lights.call("intensity_at", cf.global_position, false) < 0.05, "no protective light when out")
	check(cf.heat_at(cf.global_position) == 0.0, "no heat when out")
	storage.remove("kindling", 99)
	inv.remove("kindling", 99)
	inv.add("wood", 1)
	check(cf.get_interact_text(player) == "" and cf.get_interact_hint(player).contains("Kindling"), "missing kindling hint")
	storage.add("kindling", 1)
	check(cf.get_interact_text(player) == "Relight fire (1 Kindling + 1 Wood)", "relight prompt (%s)" % cf.get_interact_text(player))
	player.call("look_at_point", cf.global_position)
	await frames(3)
	player.call("interact_nearest")
	await frames(5)
	check(fire.is_lit(), "relit with kindling + wood")
	check(_count("fire_relit") == 1, "fire_relit emitted once (%d)" % _count("fire_relit"))
	check(storage.count_of("kindling") == 0 and inv.count_of("wood") == 0, "kindling + wood consumed")
	check(Lights.call("intensity_at", cf.global_position, false) > 0.5, "protective light returns")
	await frames(20)

	# --- Cooking ------------------------------------------------------------------------------
	var rack := camp.cooking_rack
	fire.fuel = fire.max_fuel()
	inv.add("raw_meat", 2)
	for i in inv.capacity:
		if inv.slot_id(i) == "raw_meat":
			gs.call("select_slot", i)
	check(rack.wants_priority(), "rack takes the prompt while holding raw meat")
	check(cf.get_interact_text(player) == "", "fire yields to the rack")
	check(rack.get_interact_text(player) == "Cook Raw Meat", "Cook Raw Meat prompt")
	rack.interact(player)
	check(rack.cooking_count() == 1 and inv.count_of("raw_meat") == 1, "meat on the rack")
	check(rack.get_interact_text(player).begins_with("Cook Raw Meat (Cooking"), "progress in the prompt (%s)" % rack.get_interact_text(player))
	await simulate(DB.bf("fire.cook_seconds", 14.0) * 0.5, 4.0)
	var mid := rack.cook_progress()
	check(mid > 0.3 and mid < 0.8, "cooking progresses (%.2f)" % mid)
	fire.extinguish()
	await simulate(4.0, 4.0)
	check(absf(rack.cook_progress() - mid) < 0.02, "cooking pauses while the fire is out")
	check(rack.get_interact_hint(player).contains("relight"), "paused hint (%s)" % rack.get_interact_hint(player))
	fire.relight("kindling", "wood")
	fire.fuel = fire.max_fuel()
	await simulate(DB.bf("fire.cook_seconds", 14.0) * 0.7, 4.0)
	check(_count("food_cooked") == 1, "food_cooked emitted")
	check(rack.get_interact_text(player) == "Take Cooked Meat (1)", "take prompt (%s)" % rack.get_interact_text(player))
	rack.interact(player)
	check(inv.count_of("cooked_meat") == 1 and rack.cooking_count() == 0, "cooked meat in the sack")
	inv.remove("raw_meat", 99)
	gs.call("select_slot", 0)

	# --- Tent ---------------------------------------------------------------------------------
	var tent := camp.tent
	check(tent.contains(tent.rest_spot()), "rest spot is inside the tent")
	check(not tent.contains(cf.global_position), "the fire is not inside the tent")
	check(tent.tent_warmth() >= 55.0 and tent.rest_heal_mult() >= 1.5, "tent warmth / rest values")
	player.call("teleport", tent.get_interact_point() + Vector3(0, -0.8, 0) + tent.global_transform.basis.z * 0.6)
	await frames(5)
	check(tent.get_interact_text(player) == "Rest in tent", "Rest in tent prompt")
	tent.interact(player)
	await frames(30)
	check(player.get("resting") == true, "player rests")
	check(player.call("is_sheltered") == true, "player is sheltered in the tent")
	check(tent.get_interact_text(player) == "" and tent.get_interact_hint(player).contains("Resting"), "resting hint")
	player.set("resting", false)
	var cap0 := storage.capacity
	tent.set_level(3)
	check(int(gs.get("tent_level")) == 3 and int(gs.get("stats").get("highest_tent", 0)) >= 3, "tent level 3 recorded")
	check(_count("tent_upgraded") == 1, "tent_upgraded emitted")
	check(storage.capacity >= cap0 and storage.capacity >= DB.bi("camp.storage_slots", 16) + 4, "storage bonus applied")
	check(tent.contains(tent.rest_spot()), "rest spot inside the bigger tent")
	var door := tent.get_interact_point()
	check(door.distance_to(cf.global_position) > 3.0, "bigger tent keeps its door clear of the fire")
	tent.set_level(8)
	check(tent.contains(tent.rest_spot()) and tent.level == 8, "Starlight Pavilion builds")
	tent.set_level(1, false)

	# --- Crate & storage modals ------------------------------------------------------------------
	seen.erase("request_modal")
	camp.crate.interact(player)
	camp.storage_box.interact(player)
	var mods := _texts("request_modal")
	check(mods.contains("crafting") and mods.contains("storage"), "crate + storage open their modals (%s)" % mods)
	var hud: Node = gs.get("game").get("hud")
	if hud and hud.has_method("close_modal"):
		hud.call("close_modal")
	check(camp.crate.get_interact_text(player) == "Open Crafting Crate", "crate prompt")
	check(camp.storage_box.get_interact_text(player).begins_with("Open Storage Box"), "storage prompt")
	await frames(5)

	# --- Fire levels ---------------------------------------------------------------------------
	var r1 := cf.interact_radius
	fire.upgrade()
	await frames(3)
	check(cf.level == 2 and cf.interact_radius > r1, "fire level 2 rebuilds the hearth")
	fire.upgrade()
	await frames(3)
	check(cf.level == 3 and rack.level == 3, "fire level 3 beacon + rack follows")

	# --- Dawn kindling ---------------------------------------------------------------------------
	for p in get_tree().get_nodes_in_group("pickup"):
		(p as Node).free()
	var spawned := camp.spawn_dawn_kindling()
	var want := DB.bi("camp.safe_kindling_respawn", 4)
	check(spawned == want, "dawn kindling spawned (%d/%d)" % [spawned, want])
	await frames(2)
	check(camp.spawn_dawn_kindling() == 0, "no extra kindling while it is still lying around")
	_finish()


func _finish() -> void:
	print("CAMP DRIVE: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
