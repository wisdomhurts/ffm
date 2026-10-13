extends Node
## Headless integration test for the landmarks, driven through the real game
## (main.tscn) and the Player API: every landmark built with collision, map
## markers, discovery fires once per landmark (banner, flags, Keeper's Cap),
## chests registered with a ChestManager (a fake one here) or dropped as
## fallback loot, walking into the lighthouse keeper's room, up the lookout
## stairs, into the old mine and onto Pip's dock, clear trader spots, and the
## lanterns / lighthouse beam at night.
##
## Run: godot --headless --path . -s res://tests/landmark_drive_launcher.gd [-- --seed=N]
## Prints PASS/FAIL lines and exits 0 (all passed) or 1.

var failures := 0
var passes := 0
var main: Node
var seen: Dictionary = {}
var _had_cap := false


## Stand-in ChestManager recording add_chest calls (plain Node: no typing
## conflicts with the real class).
class FakeChests:
	extends Node3D
	var calls: Array = []

	func add_chest(pos: Vector3, tier: String, table_id: String, opts: Dictionary = {}) -> Node3D:
		var n := Node3D.new()
		n.name = "FakeChest%d" % calls.size()
		add_child(n)
		n.global_position = pos + Vector3(0, 0.5, 0)  # wrong on purpose: Landmarks must fix it
		calls.append({"pos": pos, "tier": tier, "table": table_id, "opts": opts, "node": n})
		return n


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


func _note(key: String) -> Callable:
	return func(a: Variant = null, b: Variant = null, c: Variant = null) -> void:
		var arr: Array = seen.get(key, [])
		arr.append([a, b, c])
		seen[key] = arr


func _count(key: String, first_arg: Variant = null) -> int:
	var n := 0
	for e in seen.get(key, []):
		if first_arg == null or (e as Array)[0] == first_arg:
			n += 1
	return n


func _texts(key: String) -> String:
	var out := ""
	for e in seen.get(key, []):
		out += str((e as Array)[0]) + " | "
	return out


## Walk the player through local waypoints of a site (XZ steering, like a
## player holding forward). Returns true when the last waypoint was reached.
func walk(site: LandmarkSite, waypoints: Array, max_s: float = 14.0, reach: float = 0.45) -> bool:
	var player: Player = GameState.player as Player
	var i := 0
	var t := 0.0
	Input.action_press("move_forward")
	while i < waypoints.size() and t < max_s:
		var target: Vector3 = site.to_world(waypoints[i])
		var d := target - player.global_position
		d.y = 0.0
		if d.length() < reach:
			i += 1
			continue
		player.rig.yaw = atan2(-d.x, -d.z)
		await get_tree().physics_frame
		t += get_physics_process_delta_time()
	Input.action_release("move_forward")
	await frames(10)
	return i >= waypoints.size()


func _run() -> void:
	var seed_v := 20261010
	for a in OS.get_cmdline_user_args():
		if str(a).begins_with("--seed="):
			seed_v = int(str(a).trim_prefix("--seed="))
	for sig in ["landmark_discovered", "big_message", "notify"]:
		Events.connect(sig, _note(sig))
	_had_cap = Profile.is_unlocked("lighthouse")
	main = (load("res://main/main.tscn") as PackedScene).instantiate()
	get_tree().root.add_child(main)
	await get_tree().process_frame
	await main.call("start_run", seed_v)
	var game: Game = GameState.game as Game
	var lm: Landmarks = game.landmarks if game else null
	check(lm != null, "Landmarks system exists")
	if lm == null:
		_finish()
		return
	var gen: WorldGen = GameState.world_gen
	var player: Player = GameState.player as Player
	check(lm.sites.size() == 8, "all 8 landmarks built (%d)" % lm.sites.size())
	for id in Landmarks.ORDER:
		var s := lm.site(id)
		check(s != null and s.body != null and s.body.collision_layer == 1 and s.body.get_child_count() > 0, "%s has a layer-1 body" % id)
		check(s != null and s.structure_mesh != null, "%s has a structure mesh" % id)
		if s:
			var g := gen.height_at(s.center.x, s.center.z)
			check(absf(s.center.y - g) < 0.01, "%s sits on the ground" % id)

	# --- Map markers -------------------------------------------------------------------------
	var lm_markers := 0
	var traders := 0
	var all_ok := true
	for n in get_tree().get_nodes_in_group("map_marker"):
		if not n.has_method("get_map_marker"):
			continue
		var m: Dictionary = n.call("get_map_marker")
		if not m.has("id") or not lm.sites.has(m["id"]):
			continue
		lm_markers += 1
		if m["kind"] == "trader":
			traders += 1
		all_ok = all_ok and m["important"] == true and m["discovered"] == false and str(m["label"]) == lm.site(m["id"]).display_name
	check(lm_markers == 8 and traders == 3, "8 map markers, 3 of them traders (%d/%d)" % [lm_markers, traders])
	check(all_ok, "markers are important, undiscovered and labelled")

	# --- Chests: registered when the run starts -------------------------------------------------
	await frames(3)
	var cm: Variant = game.get("chests")
	var has_add := cm is Node and (cm as Node).has_method("add_chest")
	check(lm.chest_mode == ("manager" if has_add else "fallback"), "chest mode %s (ChestManager.add_chest %s)" % [lm.chest_mode, "present" if has_add else "missing"])
	var spots := lm.chest_spots()
	check(spots.size() == 5, "5 landmark chests (%d)" % spots.size())

	# --- Discovery: the lighthouse ------------------------------------------------------------------
	var lh := lm.lighthouse()
	var far := lh.to_world(Vector3(0, 0, 26.0))
	player.teleport(gen.ground(far, 0.1))
	await frames(20)
	check(not lm.is_discovered("lighthouse"), "not discovered from 26 m away")
	# Count every pickup dropped from now on (the player may auto-collect some).
	var dropped: Array = []
	game.pickups.child_entered_tree.connect(func(n: Node) -> void: dropped.append(str(n.get("item_id"))))
	# Walk up the path, the steps and through the door into the keeper's room.
	player.teleport(gen.ground(lh.to_world(Vector3(0.0, 0, LighthouseSite.R0 + 5.0)), 0.1))
	await frames(10)
	var inside := await walk(lh, [Vector3(0, 0, LighthouseSite.R0 + 1.6), Vector3(0, 0, LighthouseSite.R0 - 0.2), Vector3(0, 0, 0.6)], 12.0)
	var lp := lh.to_local_point(player.global_position)
	check(inside and Vector2(lp.x, lp.z).length() < LighthouseSite.R0 - LighthouseSite.WALL - 0.3, "walked through the door into the keeper's room (%s)" % str(lp))
	check(absf(lp.y - LighthouseSite.FLOOR) < 0.2, "standing on the raised floor (y %.2f)" % lp.y)
	await frames(15)
	check(_count("landmark_discovered", "lighthouse") == 1, "landmark_discovered(lighthouse) fired once")
	check(GameState.flags.get("lighthouse_found", false) == true, "flags.lighthouse_found set")
	check(Profile.is_unlocked("lighthouse"), "Profile unlocked the Keeper's Cap")
	check("Moonmirror Lighthouse" in _texts("big_message"), "discovery banner shown")
	check((lm.markers["lighthouse"] as LandmarkMarker).get_map_marker()["discovered"] == true, "lighthouse marker discovered")
	if lm.chest_mode == "fallback":
		var want := Landmarks.fallback_loot(GameState.seed, "lighthouse").size()
		check(dropped.size() == want and want > 0, "fallback lighthouse loot dropped (%d/%d pickups)" % [dropped.size(), want])
		check("flashlight" in dropped, "fallback loot includes the flashlight")
	# The keeper's logbook on the desk is readable.
	var note: LandmarkNote = null
	for n in lh.get_children():
		if n is LandmarkNote:
			note = n
	check(note != null and note.is_in_group("interactable") and note.get_interact_text(player) == "Read the Keeper's Log", "the keeper's log is an interactable")
	if note:
		var before := _count("notify")
		note.interact(player)
		check(_count("notify") == before + 1 and "Keeper's log" in _texts("notify"), "reading the log shows a note")
	# Leave and come back: still only once.
	player.teleport(gen.ground(far, 0.1))
	await frames(15)
	player.teleport(gen.ground(lh.to_world(Vector3(2.0, 0, LighthouseSite.R0 + 2.5)), 0.1))
	await frames(15)
	check(_count("landmark_discovered", "lighthouse") == 1, "no second discovery on a second visit")

	# --- Ranger Lookout: climb the switchback stairs ------------------------------------------------
	var lk := lm.site("lookout") as RangerLookout
	var lx := -(RangerLookout.HALF + RangerLookout.LANE * 0.5)
	player.teleport(gen.ground(lk.to_world(Vector3(lx, 0, RangerLookout.HALF + 2.2)), 0.1))
	await frames(10)
	var up := await walk(lk, [Vector3(lx, 0, RangerLookout.HALF + 0.4), Vector3(lx, 0, lx + 0.1), Vector3(-RangerLookout.HALF + 0.2, 0, lx),
		Vector3(1.2, 0, lx), Vector3(1.2, 0, -1.0)], 22.0, 0.4)
	var tp := lk.to_local_point(player.global_position)
	check(up and absf(tp.y - RangerLookout.H) < 0.25, "climbed the lookout stairs onto the platform (y %.2f)" % tp.y)
	check(_count("landmark_discovered", "lookout") == 1, "landmark_discovered(lookout) fired once")

	# --- Old Mine: walk in to the chest ------------------------------------------------------------------
	var mine := lm.site("old_mine")
	var cs: Array = mine.world_chest_spots()
	var chest_pos: Vector3 = cs[0]["pos"]
	var into := mine.to_local_point(chest_pos)
	var mouth_out := into + Vector3(sin(float(cs[0]["rot"]) - mine.yaw), 0, cos(float(cs[0]["rot"]) - mine.yaw)) * 4.5
	player.teleport(gen.ground(mine.to_world(Vector3(mouth_out.x, 0, mouth_out.z)), 0.1))
	await frames(10)
	var front := into + (mouth_out - into).normalized() * 1.1
	await walk(mine, [Vector3(front.x, 0, front.z)], 10.0, 0.4)
	var dm := Vector2(player.global_position.x - chest_pos.x, player.global_position.z - chest_pos.z).length()
	check(dm < 1.6, "walked under the boards into the mine, next to the chest (%.2f m)" % dm)

	# --- Pip's Dock: down the gangway onto the dock -------------------------------------------------------
	var pip := lm.site("pips_dock") as TraderCamp
	var u := pip.water_dir(30.0)
	player.teleport(gen.ground(pip.to_world(u * 1.0 + Vector3(0.6, 0, 0)), 0.1))
	await frames(10)
	var dock_y := WorldGen.WATER_LEVEL + 0.55
	var shore := 4.0
	while shore < 26.0 and pip.gy(u.x * shore, u.z * shore) > dock_y - center_y(pip) - 0.1:
		shore += 0.25
	await walk(pip, [u * 3.0, u * (shore + 4.0)], 12.0, 0.5)
	check(absf(player.global_position.y - dock_y) < 0.3 and gen.is_water(player.global_position.x, player.global_position.z),
		"walked down the gangway onto the dock over the water (y %.2f)" % player.global_position.y)

	# --- Trader spots stay clear ----------------------------------------------------------------------------
	var space := get_viewport().world_3d.direct_space_state
	for id in Landmarks.TRADERS:
		var s := lm.site(id)
		var q := PhysicsShapeQueryParameters3D.new()
		var cyl := CylinderShape3D.new()
		cyl.radius = TraderCamp.CLEAR
		cyl.height = 1.8
		q.shape = cyl
		q.transform = Transform3D(Basis.IDENTITY, s.center + Vector3(0, 1.1, 0))
		q.collision_mask = 1
		var blocked := 0
		for hit in space.intersect_shape(q, 16):
			if (hit as Dictionary).get("collider") == s.body:
				blocked += 1
		check(blocked == 0, "%s keeps a clear %.1f m spot at its centre" % [id, TraderCamp.CLEAR])
		var spot := lm.trader_spot(id)
		check(spot.has("pos") and (spot["pos"] as Vector3).distance_to(s.center) < 0.01, "%s trader_spot() at the centre" % id)

	# --- Every landmark discovered exactly once -----------------------------------------------------------------
	for id in Landmarks.ORDER:
		var s := lm.site(id)
		player.teleport(gen.ground(s.center + Vector3(0.5, 0, 0.5), 0.3))
		await frames(16)
	var once := true
	for id in Landmarks.ORDER:
		once = once and _count("landmark_discovered", id) == 1
	check(once, "landmark_discovered fired once for each of the 8 landmarks")
	check(lm.discovered_ids().size() == 8, "all 8 marked discovered")

	# --- Chests through a ChestManager (fake) ------------------------------------------------------------
	var fake := FakeChests.new()
	game.add_child(fake)
	lm.debug_reset_chests()
	lm.register_chests(fake)
	check(lm.chest_mode == "manager" and fake.calls.size() == 5, "registered 5 chests with add_chest (%d)" % fake.calls.size())
	var lh_call: Dictionary = {}
	var tiers: Dictionary = {}
	for c in fake.calls:
		var d: Dictionary = c
		tiers[str(d["opts"].get("landmark", ""))] = d["tier"]
		if d["opts"].get("landmark", "") == "lighthouse":
			lh_call = d
	check(lh_call.get("table", "") == "lighthouse" and (lh_call.get("opts", {}) as Dictionary).get("restock_table", "") == "lighthouse_restock"
		and int((lh_call.get("opts", {}) as Dictionary).get("restock_days", 0)) == 3 and (lh_call.get("opts", {}) as Dictionary).get("label", "") == "Keeper's Chest",
		"lighthouse chest: table lighthouse, restock lighthouse_restock / 3 days, Keeper's Chest")
	check(tiers.get("abandoned_camp") == "common" and tiers.get("lookout") == "rare" and tiers.get("old_mine") == "epic" and tiers.get("hollow") == "epic",
		"chest tiers: common camp, rare lookout, epic mine + hollow")
	var placed_ok := true
	for c in fake.calls:
		var d: Dictionary = c
		placed_ok = placed_ok and (d["node"] as Node3D).global_position.distance_to(d["pos"]) < 0.06
	check(placed_ok, "chests kept exactly where Landmarks asked (indoors, on the platform)")
	var lk_call: Dictionary = {}
	for c in fake.calls:
		if (c as Dictionary)["opts"].get("landmark", "") == "lookout":
			lk_call = c
	check(not lk_call.is_empty() and (lk_call["pos"] as Vector3).y > lk.center.y + RangerLookout.H - 0.1, "the lookout chest is up on the platform")
	var pick_before := get_tree().get_nodes_in_group("pickup").size()
	lm.discovery.found.erase("hollow")
	lm.discover("hollow")
	await frames(3)
	check(get_tree().get_nodes_in_group("pickup").size() == pick_before, "with a ChestManager no fallback loot drops")

	# --- Night: lanterns and the beam --------------------------------------------------------------------
	_set_phase(DayCycle.Phase.NIGHT, 0.4)
	var rosie := lm.site("rosies_rest")
	player.teleport(gen.ground(rosie.to_world(Vector3(1.0, 0, 3.0)), 0.1))
	await frames(150)
	var stats := lm.debug_stats()
	var phone := Settings.quality() == "phone"
	check(phone or int(stats["lights_on"]) > 0, "lanterns near the player light up at night (%d)" % int(stats["lights_on"]))
	check(lh.beam_mesh.visible and lh.flare.visible, "the lighthouse beam shines at night")
	check(phone or (lh.spot != null and lh.spot.visible and lh.spot.light_energy > 1.0), "beam SpotLight on (not on phone)")
	var a0 := lh.beam_angle
	await frames(30)
	check(absf(wrapf(lh.beam_angle - a0, -PI, PI)) > 0.05, "the beam rotates")
	_set_phase(DayCycle.Phase.DAY, 0.4)
	await frames(200)
	check(not lh.beam_mesh.visible, "no beam by day")
	check(int(lm.debug_stats()["lights_on"]) == 0, "lanterns out by day")
	_finish()


func center_y(s: LandmarkSite) -> float:
	return s.center.y


func _set_phase(phase: int, progress: float) -> void:
	var dc := GameState.day_cycle
	dc.phase = phase
	dc.phase_time = dc.durations[phase] * progress
	GameState.time_scale = 0.0


func _finish() -> void:
	if not _had_cap and Profile.is_unlocked("lighthouse"):
		Profile.unlocks.erase("lighthouse")
		Profile.save_profile()
	print("LANDMARK DRIVE: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
