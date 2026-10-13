class_name Landmarks
extends Node3D
## The places worth walking to: Moonmirror Lighthouse, the Abandoned
## Campsite, the Ranger Lookout, the three trader camps (Rosie's Rest, Pip's
## Dock, Bram's Dig), the Old Mine and Fern Hollow.
##
## Each landmark is a LandmarkSite (world/landmarks/*.gd) built at its
## WorldGen position, turned to face the trail that leads to it, merged into
## a few meshes with one StaticBody3D (layer 1). This node then:
##   - clears gatherables under every footprint and registers the footprints
##     as Vegetation obstacles (AI steers around them),
##   - adds a map marker per landmark (group "map_marker"),
##   - discovers a landmark the first time the player comes within its
##     radius (Events.landmark_discovered once each, banner, toast; the
##     lighthouse also unlocks the Keeper's Cap and sets
##     GameState.flags["lighthouse_found"]),
##   - registers the landmark chests with the ChestManager when the run
##     starts (game.chests.add_chest), or, without one, drops the chest loot
##     as pickups on the first visit,
##   - lights the lanterns at night (small unshadowed OmniLights near the
##     camera; emissive only on the "phone" preset) and drives the
##     lighthouse beam.
## Tuning: balance.json "landmarks". See docs/ARCHITECTURE.md "Landmarks".

const ORDER := ["lighthouse", "lookout", "abandoned_camp", "rosies_rest", "pips_dock", "brams_dig", "old_mine", "hollow"]
const TRADERS := ["rosies_rest", "pips_dock", "brams_dig"]
const DISCOVER_COLOR := Color("ffcf6b")

var game: Node = null
var gen: WorldGen = null
## id -> LandmarkSite
var sites: Dictionary = {}
## id -> LandmarkMarker
var markers: Dictionary = {}
var discovery := LandmarkDiscovery.new()
## id -> Node3D returned by ChestManager.add_chest (one per landmark).
var chests: Dictionary = {}
## "" until the run starts, then "manager" (ChestManager chests) or
## "fallback" (loot drops as pickups on the first visit).
var chest_mode := ""
## id -> chest spot used for the fallback loot ({pos, rot, fallback}).
var _fallback: Dictionary = {}
var _fallback_done: Dictionary = {}
var _lights: Array = []
var _check_t := 0.0
var _time := 0.0
var _noise := FastNoiseLite.new()
var _build_ms := 0


func setup(p_game: Node) -> void:
	game = p_game
	gen = (p_game.get("gen") as WorldGen) if p_game else GameState.world_gen
	if gen == null:
		gen = GameState.world_gen
	if gen == null:
		return
	_noise.seed = 4711
	_noise.frequency = 1.0
	var t0 := Time.get_ticks_msec()
	for id in ORDER:
		if not gen.landmarks.has(id):
			continue
		var site := make_site(id)
		if site == null:
			continue
		site.setup_site(id, gen, game)
		add_child(site)
		await site.build_site()
		site.finish()
		sites[id] = site
		_add_marker(site)
		var mult := DB.bf("landmarks.discover_radius_mult", 1.0)
		var min_r := DB.bf("landmarks.discover_min_radius", 10.0)
		discovery.add(id, site.center, LandmarkDiscovery.radius_for(site.radius, mult, min_r))
		if is_inside_tree():
			await get_tree().process_frame
	_clear_footprints()
	_make_lights()
	_build_ms = Time.get_ticks_msec() - t0
	print("Landmarks: %d sites, %d lights in %d ms" % [sites.size(), _lights.size(), _build_ms])
	if not Events.run_started.is_connected(_on_run_started):
		Events.run_started.connect(_on_run_started)
	if not Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.connect(_on_setting_changed)


func _exit_tree() -> void:
	if Events.run_started.is_connected(_on_run_started):
		Events.run_started.disconnect(_on_run_started)
	if Settings.changed.is_connected(_on_setting_changed):
		Settings.changed.disconnect(_on_setting_changed)


func _on_setting_changed(key: String) -> void:
	if key != "quality":
		return
	for s in sites.values():
		(s as LandmarkSite).apply_quality()


## A new (unplaced) site for a WorldGen landmark id, or null.
static func make_site(id: String) -> LandmarkSite:
	match id:
		"lighthouse":
			return LighthouseSite.new()
		"lookout":
			return RangerLookout.new()
		"abandoned_camp":
			return AbandonedCamp.new()
		"rosies_rest":
			return TraderCamp.new("rosie")
		"pips_dock":
			return TraderCamp.new("pip")
		"brams_dig":
			return TraderCamp.new("bram")
		"old_mine":
			return OldMine.new()
		"hollow":
			return FernHollow.new()
	return null


func _add_marker(site: LandmarkSite) -> void:
	var kind := "trader" if site.id in TRADERS else "landmark"
	var m := LandmarkMarker.new(site.id, site.display_name, kind)
	site.add_child(m)
	markers[site.id] = m


# --- Public API ---------------------------------------------------------------------------------

func site(id: String) -> LandmarkSite:
	return sites.get(id, null)


func lighthouse() -> LighthouseSite:
	return sites.get("lighthouse", null) as LighthouseSite


func ids() -> Array:
	return sites.keys()


func is_discovered(id: String) -> bool:
	return discovery.is_found(id)


func discovered_ids() -> Array:
	return discovery.found_ids()


## Where a trader NPC should stand: {"pos", "yaw", "facing"} (the landmark
## centre, facing the trail). Empty when the landmark is missing.
func trader_spot(id: String) -> Dictionary:
	var s := site(id)
	return s.stand_spot() if s else {}


## Footprints of every landmark prop as Vector4(x, y, z, r) (world).
func footprints() -> Array:
	var out: Array = []
	for s in sites.values():
		out.append_array((s as LandmarkSite).world_zones())
	return out


## Footprints within `radius` of pos (Vegetation.obstacles_near format).
func obstacles_near(pos: Vector3, radius: float) -> Array:
	var out: Array = []
	for v in footprints():
		var f: Vector4 = v
		if Vector2(f.x - pos.x, f.z - pos.z).length() <= radius + f.w:
			out.append(f)
	return out


## Every landmark chest: [{"id", "pos", "rot", "tier", "table", "label",
## "restock_table", "restock_days", "node" (or null)}].
func chest_spots() -> Array:
	var out: Array = []
	for id in sites:
		var cfg := chest_config(str(id))
		if cfg.is_empty():
			continue
		for spot in (sites[id] as LandmarkSite).world_chest_spots():
			var d: Dictionary = cfg.duplicate()
			d["id"] = id
			d["pos"] = spot["pos"]
			d["rot"] = spot["rot"]
			d["fallback"] = spot["fallback"]
			d["node"] = chests.get(id, null)
			out.append(d)
	return out


## Chest settings for a landmark from balance.json landmarks.chests ({} = none).
static func chest_config(id: String) -> Dictionary:
	var all: Variant = DB.b("landmarks.chests", {})
	if all is Dictionary and (all as Dictionary).has(id):
		return ((all as Dictionary)[id] as Dictionary).duplicate()
	return {}


## Seed for the fallback loot of a landmark (deterministic per run seed).
static func fallback_seed(world_seed: int, id: String) -> int:
	return world_seed * 31337 + (hash(id) % 1000003)


## The loot a landmark's chest would give without a ChestManager.
static func fallback_loot(world_seed: int, id: String) -> Array:
	var cfg := chest_config(id)
	if cfg.is_empty():
		return []
	var rng := RandomNumberGenerator.new()
	rng.seed = fallback_seed(world_seed, id)
	return Loot.roll(DB.loot_table(str(cfg.get("table", ""))), rng)


## Mark a landmark as discovered (as if the player walked in). Returns true
## the first time. Tests and dev tools may call it.
func discover(id: String) -> bool:
	if not sites.has(id) or not discovery.mark(id):
		return false
	_on_discovered(id)
	return true


## Forget the chest registration (tests): the next register_chests() runs again.
func debug_reset_chests() -> void:
	chest_mode = ""
	chests.clear()
	_fallback.clear()
	_fallback_done.clear()


func debug_stats() -> Dictionary:
	var meshes := 0
	var shapes := 0
	for s in sites.values():
		var site_n := s as LandmarkSite
		for mi in [site_n.structure_mesh, site_n.detail_mesh, site_n.glass_mesh]:
			if mi != null:
				meshes += 1
		if site_n.body:
			shapes += site_n.body.get_child_count()
	var lit := 0
	for l in _lights:
		if ((l as Dictionary)["light"] as OmniLight3D).visible:
			lit += 1
	return {"sites": sites.size(), "meshes": meshes, "shapes": shapes, "lights": _lights.size(), "lights_on": lit,
		"discovered": discovered_ids().size(), "chest_mode": chest_mode, "chests": chests.size(), "build_ms": _build_ms}


# --- Build helpers --------------------------------------------------------------------------------

func _clear_footprints() -> void:
	var g: Variant = game.get("gatherables") if game else null
	var veg: Variant = game.get("vegetation") if game else null
	var removed := 0
	for v in footprints():
		var f: Vector4 = v
		var p := Vector3(f.x, f.y, f.z)
		if g is Node and (g as Node).has_method("clear_area"):
			removed += int((g as Node).call("clear_area", p, f.w))
		if veg is Node and (veg as Node).has_method("add_obstacle") and f.w >= 0.45:
			(veg as Node).call("add_obstacle", p, f.w)
	if removed > 0:
		print("Landmarks: cleared %d gatherables under props" % removed)


func _make_lights() -> void:
	for s in sites.values():
		var site_n := s as LandmarkSite
		for e in site_n.lanterns:
			var d: Dictionary = e
			var light := OmniLight3D.new()
			light.name = "Lantern"
			light.light_color = d["color"]
			light.omni_range = float(d["range"])
			light.omni_attenuation = 1.35
			light.light_specular = 0.25
			light.shadow_enabled = false
			light.light_volumetric_fog_energy = 0.5
			light.distance_fade_enabled = true
			light.distance_fade_begin = 55.0
			light.distance_fade_length = 15.0
			light.position = d["pos"]
			light.visible = false
			light.light_energy = 0.0
			site_n.add_child(light)
			_lights.append({"light": light, "energy": float(d["energy"]), "always": bool(d["always"]),
				"phase": float(_lights.size()) * 7.31, "on": 0.0})


# --- Runtime --------------------------------------------------------------------------------------

func _on_run_started(_seed: int) -> void:
	register_chests()


## Hand the landmark chests to the ChestManager (once; `manager` overrides
## game.chests, for tests). Without one (or without add_chest) the loot
## drops as pickups on the first visit instead.
func register_chests(manager: Node = null) -> void:
	if chest_mode != "":
		return
	var cm: Variant = manager if manager != null else (game.get("chests") if game else null)
	var can := cm is Node and is_instance_valid(cm) and (cm as Node).has_method("add_chest")
	var used_manager := false
	for spot in chest_spots():
		var d: Dictionary = spot
		var id := str(d["id"])
		if can:
			var opts := {"label": str(d.get("label", "")), "rot": float(d["rot"]), "landmark": id}
			if d.has("restock_table"):
				opts["restock_table"] = str(d["restock_table"])
				opts["restock_days"] = int(d.get("restock_days", DB.bi("chests.restock_days", 3)))
			var node: Variant = (cm as Node).call("add_chest", d["pos"], str(d.get("tier", "common")), str(d.get("table", "chest_common")), opts)
			if node is Node3D and is_instance_valid(node):
				var n3 := node as Node3D
				chests[id] = n3
				used_manager = true
				# Keep it exactly where it was asked to be (on a platform, indoors).
				var want: Vector3 = d["pos"]
				if n3.is_inside_tree() and n3.global_position.distance_to(want) > 0.05:
					n3.global_position = want
				continue
		_fallback[id] = d
	chest_mode = "manager" if used_manager else "fallback"
	# Landmarks found before the chests were registered still get their loot.
	for id in discovered_ids():
		_maybe_fallback_loot(str(id))


func _process(delta: float) -> void:
	_time += delta
	if sites.is_empty():
		return
	if chest_mode == "" and GameState.is_playing():
		register_chests()
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	var dark := GameState.day_cycle.darkness()
	for s in sites.values():
		(s as LandmarkSite).update_site(delta, dark, cam)
	_check_t -= delta
	if _check_t <= 0.0:
		_check_t = 0.2
		_check_discovery()
	_update_lights(delta, dark, cam)


func _check_discovery() -> void:
	if not GameState.is_playing():
		return
	var pl := GameState.player
	if pl == null or not is_instance_valid(pl):
		return
	for id in discovery.check(pl.global_position):
		_on_discovered(str(id))


func _on_discovered(id: String) -> void:
	var s := site(id)
	if s == null:
		return
	if markers.has(id):
		(markers[id] as LandmarkMarker).discovered = true
	GameState.flags[id + "_found"] = true
	GameState.stat_add("landmarks_found")
	Events.landmark_discovered.emit(id)
	Events.big_message.emit("You found %s!" % s.display_name, DISCOVER_COLOR, 3.6)
	var texts: Variant = DB.b("landmarks.discover_text", {})
	if texts is Dictionary and (texts as Dictionary).has(id):
		Events.notify.emit(str((texts as Dictionary)[id]), "good")
	if id == "lighthouse":
		GameState.flags["lighthouse_found"] = true
		var had := Profile.is_unlocked("lighthouse")
		Profile.unlock("lighthouse")
		if not had:
			Events.notify.emit("New look unlocked: Keeper's Cap!", "loot")
	Audio.play("discover" if Audio.has_sound("discover") else "level_up")
	_maybe_fallback_loot(id)


func _maybe_fallback_loot(id: String) -> void:
	if chest_mode != "fallback" or not _fallback.has(id) or _fallback_done.has(id):
		return
	_fallback_done[id] = true
	var spot: Dictionary = _fallback[id]
	var at: Vector3 = spot["fallback"]
	var loot := fallback_loot(int(GameState.seed), id)
	var n := loot.size()
	for i in n:
		var e: Dictionary = loot[i]
		var a := TAU * float(i) / maxf(float(n), 1.0) + float(spot.get("rot", 0.0))
		var off := Vector3(cos(a), 0.0, sin(a)) * (0.35 if n > 1 else 0.0)
		Pickup.spawn(str(e["id"]), int(e["count"]), at + off + Vector3(0, 0.6, 0), off * 2.0 + Vector3(0, 2.6, 0))
	if n > 0:
		Events.notify.emit("Supplies! Something was left behind here.", "loot")


func _update_lights(delta: float, dark: float, cam: Camera3D) -> void:
	if _lights.is_empty():
		return
	var phone := Settings.quality() == "phone"
	var cam_pos := cam.global_position if cam else Vector3(1e9, 0, 1e9)
	var max_d := DB.bf("landmarks.lantern_light_distance", 70.0)
	var night := smoothstep(0.12, 0.55, dark)
	for l in _lights:
		var d: Dictionary = l
		var light: OmniLight3D = d["light"]
		var want := 1.0 if bool(d["always"]) else night
		if phone or light.global_position.distance_to(cam_pos) > max_d:
			want = 0.0
		var on := move_toward(float(d["on"]), want, delta * 0.8)
		d["on"] = on
		if on <= 0.005:
			if light.visible:
				light.visible = false
			continue
		var flick := 1.0 + _noise.get_noise_1d(_time * 3.0 + float(d["phase"])) * 0.09
		light.visible = true
		light.light_energy = float(d["energy"]) * on * flick
