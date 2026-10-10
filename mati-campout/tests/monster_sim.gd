extends Node
## Headless behaviour simulation for the night monsters (Night Stalker,
## Watcher, Spawner). Builds a real world, then proves:
##   A  stalkers never enter strong firelight while the player stands at the
##      fire (sampled every physics frame over 60 s of night) - but they do
##      come to lurk at its edge;
##   B  they approach and attack a player standing in darkness (telegraphed:
##      the wind-up always precedes the hit);
##   C  they come into camp when the campfire is out (aggression raised);
##   D  they all flee and fade at dawn;
##   E  a Watcher stares from a distance and flees when the player comes close;
##   G  a flashlight beam makes a stalker recoil and run, and a Watcher vanish;
##   H  dev tools spawn ~12 m in front of the player; quality switches are safe;
##   F  defeating a stalker drops loot, counts the stat and frees it.
##
## Run (fixed 60 Hz steps, as fast as the CPU allows):
##   godot --headless --path . --fixed-fps 60 res://tests/monster_sim.tscn
## Prints PASS/FAIL lines and "MONSTER SIM RESULT"; exits 0 when all pass.

const SEED := 424242

var failures := 0
var passes := 0
var game: Game
var spawner: Spawner
var _hits: Array = []
var _telegraphs: Dictionary = {}
var _windup_before_hit := true


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


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	GameState.new_run(SEED)
	game = Game.new()
	game.name = "Game"
	add_child(game)
	await game.build(func(_f: float, _t: String) -> void: pass)
	GameState.begin_play()
	spawner = game.spawner
	print("SIM world built in %d ms" % (Time.get_ticks_msec() - t0))
	check(spawner != null and spawner is Spawner, "spawner system exists")
	if spawner == null or GameState.player == null or GameState.campfire == null:
		_finish()
		return
	Events.player_damaged.connect(_on_player_damaged)
	GameState.time_scale = 0.0
	await _scenario_firelight()
	await _scenario_darkness()
	await _scenario_fire_out()
	await _scenario_dawn()
	await _scenario_watcher()
	await _scenario_beam()
	await _scenario_dev_tools()
	await _scenario_defeat()
	_finish()


# --- Helpers ---------------------------------------------------------------------------

func _player() -> Node3D:
	return GameState.player


func _fire_pos() -> Vector3:
	return (GameState.campfire as Node3D).global_position


func _stalkers() -> Array:
	var out: Array = []
	for m in get_tree().get_nodes_in_group("monster"):
		if m is NightStalker and not (m as EnemyBase).retreating:
			out.append(m)
	return out


func _hunters() -> int:
	var n := 0
	for s in _stalkers():
		if (s as EnemyBase).state_name() in ["chase", "attack"]:
			n += 1
	return n


func _set_night() -> void:
	var dc := GameState.day_cycle
	if dc.phase != DayCycle.Phase.NIGHT:
		dc.skip_to(DayCycle.Phase.NIGHT)
	dc.phase_time = dc.durations[DayCycle.Phase.NIGHT] * 0.3


func _keep_player_safe() -> void:
	GameState.survival.heal(999.0)
	GameState.survival.warmth = GameState.survival.max_warmth
	GameState.survival.hunger = GameState.survival.max_hunger


func _place_player(p: Vector3) -> void:
	_player().call("teleport", GameState.world_gen.ground(p, 0.1))


func _spawn_ring(kind: String, center: Vector3, count: int, dist: float) -> Array:
	var out: Array = []
	for i in count:
		var a := TAU * float(i) / count + 0.3
		var p := center + Vector3(cos(a), 0.0, sin(a)) * dist
		if GameState.world_gen.is_water(p.x, p.z):
			continue
		var m := spawner.spawn_at(kind, p)
		if m:
			m.fade_in(0.1)
			_watch(m)
			out.append(m)
	return out


func _watch(m: EnemyBase) -> void:
	if not m.attacked.is_connected(_on_attacked):
		m.attacked.connect(_on_attacked.bind(m))


func _on_attacked(_target: Node, amount: float, m: EnemyBase) -> void:
	_hits.append({"kind": m.kind, "amount": amount, "t": Time.get_ticks_msec()})
	# The model's wind-up pose must have been raised before the hit lands.
	if m.model == null or (m.model.windup < 0.2 and m.model.lunge < 0.2):
		_windup_before_hit = false


func _on_player_damaged(_amount: float, _kind: String) -> void:
	pass


# --- Scenarios -----------------------------------------------------------------------------

func _scenario_firelight() -> void:
	print("-- A: player at the fire, 60 s of night")
	GameState.fire.fuel = GameState.fire.max_fuel()
	_set_night()
	var fire := _fire_pos()
	_place_player(fire + Vector3(1.8, 0.0, 0.6))
	await frames(5)
	# Extra stalkers close to the light so they engage quickly.
	for m in _spawn_ring("night_stalker", fire, 4, 22.0):
		(m as EnemyBase).set_meta("sim", true)
	var radius := GameState.fire.light_radius()
	var max_light := 0.0
	var min_fire_dist := 1e9
	var observed := 0
	var hits_before := _hits.size()
	var health_before := GameState.survival.health
	var seen_states: Dictionary = {}
	var last_state: Dictionary = {}
	var flips := 0
	for f in 60 * 60:
		await get_tree().physics_frame
		GameState.fire.fuel = GameState.fire.max_fuel()
		for s in _stalkers():
			var e := s as EnemyBase
			if e.dying:
				continue
			max_light = maxf(max_light, Lights.intensity_at(e.global_position + Vector3.UP, false))
			min_fire_dist = minf(min_fire_dist, e.flat_dist(fire))
			seen_states[e.state_name()] = true
			if last_state.has(e) and last_state[e] != e.state_name():
				flips += 1
			last_state[e] = e.state_name()
			if e.state_name() == "observe":
				observed += 1
	var fear := float(DB.enemy("night_stalker").get("light_fear", 0.35))
	print("   light radius %.1f m, closest stalker %.1f m, max light on a stalker %.3f, states %s" % [radius, min_fire_dist, max_light, str(seen_states.keys())])
	check(max_light < fear, "A stalkers never enter strong firelight (max %.3f < %.2f)" % [max_light, fear])
	check(max_light <= fear * EnemyBase.HOLD + 0.001, "A stalkers hold at the edge line (max %.3f <= %.3f)" % [max_light, fear * EnemyBase.HOLD])
	check(min_fire_dist < radius * 1.35, "A stalkers come to lurk at the light edge (closest %.1f m, edge %.1f m)" % [min_fire_dist, radius])
	check(observed > 0, "A stalkers observe from the edge of the light")
	var per_min := float(flips) / maxf(float(last_state.size()), 1.0)
	check(not seen_states.has("flee_light") and per_min < 10.0, "A no jitter at the edge: no flee/approach flip-flop (%.1f state changes per stalker per minute)" % per_min)
	check(_hits.size() == hits_before and GameState.survival.health >= health_before - 0.01, "A no attack lands on a player in the firelight")


func _scenario_darkness() -> void:
	print("-- B: player standing in darkness")
	spawner.clear_all()
	await frames(2)
	var fire := _fire_pos()
	var dark := Vector3.INF
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	for _i in 60:
		var p := GameState.world_gen.random_land_point(rng, fire, 45.0, 60.0, 8)
		if p != Vector3.INF and Lights.intensity_at(p + Vector3.UP, false) < 0.01:
			dark = p
			break
	check(dark != Vector3.INF, "B found a dark spot away from camp")
	if dark == Vector3.INF:
		return
	_place_player(dark)
	_keep_player_safe()
	await frames(5)
	_spawn_ring("night_stalker", dark, 2, 26.0)
	var hits_before := _hits.size()
	var states: Dictionary = {}
	var first_hit_s := -1.0
	var closest := 1e9
	var max_hunters := 0
	for f in 60 * 45:
		await get_tree().physics_frame
		_keep_player_safe()
		max_hunters = maxi(max_hunters, _hunters())
		for s in _stalkers():
			var e := s as EnemyBase
			states[e.state_name()] = true
			closest = minf(closest, e.flat_dist(_player().global_position))
		if _hits.size() > hits_before and first_hit_s < 0.0:
			first_hit_s = f / 60.0
		if _hits.size() >= hits_before + 2:
			break
	print("   states seen %s, closest %.1f m, first hit after %.1f s" % [str(states.keys()), closest, first_hit_s])
	check(states.has("stalk"), "B a stalker starts stalking the player in the dark")
	check(states.has("chase"), "B a stalker chases the player in the dark")
	check(_hits.size() > hits_before, "B a stalker attacks the player in the dark")
	check(_windup_before_hit, "B every hit is telegraphed by a wind-up")
	check(first_hit_s < 0.0 or first_hit_s > 2.0, "B the first hit is not instant (fair warning: %.1f s)" % first_hit_s)
	check(max_hunters <= 1, "B night 1: only one stalker hunts at a time (%d)" % max_hunters)


func _scenario_fire_out() -> void:
	print("-- C: the campfire goes out")
	spawner.clear_all()
	await frames(2)
	var fire := _fire_pos()
	_place_player(fire + Vector3(1.8, 0.0, 0.6))
	_keep_player_safe()
	await frames(5)
	# While the fire burns they stay out of camp...
	_spawn_ring("night_stalker", fire, 3, 28.0)
	for _f in 60 * 8:
		await get_tree().physics_frame
		GameState.fire.fuel = GameState.fire.max_fuel()
	var lit_closest := 1e9
	for s in _stalkers():
		lit_closest = minf(lit_closest, (s as EnemyBase).flat_dist(fire))
	GameState.fire.extinguish()
	await frames(40)
	var aggr_ok := true
	var mult := float(DB.b("spawning.fire_out_aggression_mult", 1.6))
	for s in _stalkers():
		if absf((s as EnemyBase).aggression - mult) > 0.01:
			aggr_ok = false
	check(_stalkers().size() > 0 and aggr_ok, "C aggression rises to %.1f when the fire is out" % mult)
	var closest := 1e9
	var entered_s := -1.0
	var hits_before := _hits.size()
	var max_hunters := 0
	for f in 60 * 40:
		await get_tree().physics_frame
		_keep_player_safe()
		max_hunters = maxi(max_hunters, _hunters())
		for s in _stalkers():
			closest = minf(closest, (s as EnemyBase).flat_dist(fire))
		if closest < 8.0 and entered_s < 0.0:
			entered_s = f / 60.0
		if closest < 4.0 and _hits.size() > hits_before:
			break
	print("   closest while lit %.1f m, after fire out %.1f m (inside 8 m after %.1f s), stalkers out: %d" % [lit_closest, closest, entered_s, _stalkers().size()])
	check(lit_closest > 10.0, "C stalkers keep out of camp while the fire burns")
	check(closest < 4.0, "C stalkers come into camp when the fire is out (%.1f m from the fire)" % closest)
	check(_hits.size() > hits_before, "C they reach the player at the cold fire")
	check(max_hunters <= 2, "C even with the fire out at most two stalkers hunt at once (%d of %d)" % [max_hunters, _stalkers().size()])


func _scenario_dawn() -> void:
	print("-- D: dawn")
	GameState.fire.relight("kindling", "wood")
	GameState.fire.fuel = GameState.fire.max_fuel()
	_spawn_ring("night_stalker", _fire_pos(), 2, 30.0)
	_spawn_ring("watcher", _fire_pos(), 1, 35.0)
	await frames(30)
	var before := get_tree().get_nodes_in_group("monster").size()
	GameState.day_cycle.skip_to(DayCycle.Phase.DAWN)
	await frames(20)
	var fleeing := 0
	for m in get_tree().get_nodes_in_group("monster"):
		if (m as EnemyBase).retreating:
			fleeing += 1
	var left := get_tree().get_nodes_in_group("monster").size()
	check(before > 0 and fleeing == left, "D every monster flees at dawn (%d of %d)" % [fleeing, left])
	for _f in 60 * 6:
		await get_tree().physics_frame
	var remaining := get_tree().get_nodes_in_group("monster").size()
	check(remaining == 0, "D all monsters faded away after dawn (%d left)" % remaining)
	await frames(60)
	check(spawner.count_kind("night_stalker") == 0, "D no new stalkers spawn in daylight")


func _scenario_watcher() -> void:
	print("-- E: the Watcher")
	_set_night()
	spawner.auto_spawn = false
	spawner.clear_all()
	await frames(2)
	var fire := _fire_pos()
	var dark := GameState.world_gen.ground(fire + Vector3(0.0, 0.0, 48.0))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for _i in 40:
		var p := GameState.world_gen.random_land_point(rng, fire, 45.0, 55.0, 8)
		if p != Vector3.INF and Lights.intensity_at(p + Vector3.UP, false) < 0.01:
			dark = p
			break
	_place_player(dark)
	_keep_player_safe()
	await frames(5)
	var away := (dark - fire)
	away.y = 0.0
	var w_pos := dark + away.normalized() * 32.0
	if GameState.world_gen.is_water(w_pos.x, w_pos.z):
		w_pos = dark - away.normalized() * 32.0
	var w := spawner.spawn_at("watcher", w_pos) as Watcher
	check(w != null, "E a watcher spawns")
	if w == null:
		return
	var start := w.global_position
	for _f in 60 * 4:
		await get_tree().physics_frame
		_keep_player_safe()
	var moved := w.global_position.distance_to(start)
	check(w.state_name() == "stare", "E the watcher stands and stares (%s)" % w.state_name())
	check(moved < 0.5, "E the watcher stays motionless while staring (moved %.2f m)" % moved)
	# Walk right up to it: it should flee and vanish.
	var near := w.global_position + (_player().global_position - w.global_position).normalized() * 11.0
	_place_player(near)
	var fled := false
	for _f in 60 * 4:
		await get_tree().physics_frame
		_keep_player_safe()
		if not is_instance_valid(w):
			break
		if w.state_name() in ["flee", "hidden"]:
			fled = true
		if w.hidden:
			break
	check(fled, "E the watcher flees when the player comes within 15 m")
	check(is_instance_valid(w) and w.hidden, "E the watcher fades away after fleeing")
	spawner.clear_all()
	spawner.auto_spawn = true


## A stand-in flashlight/torch: bright within `reach` of `center`.
class FakeBeam:
	extends Node3D
	var center := Vector3.ZERO
	var reach := 6.0

	func light_intensity_at(pos: Vector3) -> float:
		var d := Vector2(pos.x - center.x, pos.z - center.z).length()
		return 0.9 if d < reach else 0.0

	func light_origin() -> Vector3:
		return global_position


func _scenario_beam() -> void:
	print("-- G: a flashlight beam on the monsters")
	_set_night()
	spawner.auto_spawn = false
	spawner.clear_all()
	await frames(2)
	var p := _player().global_position
	_keep_player_safe()
	var away := Vector3(1.0, 0.0, 0.3).normalized()
	var s := spawner.spawn_at("night_stalker", p + away * 9.0)
	var w := spawner.spawn_at("watcher", p - away * 24.0) as Watcher
	if s:
		s.fade_in(0.05)
	await frames(60)
	var beam := FakeBeam.new()
	add_child(beam)
	beam.global_position = p
	beam.center = s.global_position if s else p
	Lights.register(beam)
	var start := s.global_position if s else p
	var recoiled := false
	for _f in 60 * 4:
		await get_tree().physics_frame
		_keep_player_safe()
		if is_instance_valid(s) and s.state_name() == "flee_light" and s.model and s.model.recoil > 0.5:
			recoiled = true
	var fled := is_instance_valid(s) and Vector2(s.global_position.x - start.x, s.global_position.z - start.z).length() > beam.reach - 1.0
	check(recoiled, "G a stalker recoils from a flashlight beam")
	check(fled, "G the stalker runs out of the beam")
	# Now light the watcher.
	if w and is_instance_valid(w):
		beam.center = w.global_position
		beam.reach = 4.0
		var gone := false
		for _f in 60 * 3:
			await get_tree().physics_frame
			if not is_instance_valid(w) or w.hidden or w.state_name() == "flee":
				gone = true
				break
		check(gone, "G a watcher flees from light")
	Lights.unregister(beam)
	beam.queue_free()
	spawner.clear_all()
	spawner.auto_spawn = true


func _scenario_dev_tools() -> void:
	print("-- H: dev tools and quality switch")
	_set_night()
	spawner.auto_spawn = false
	spawner.clear_all()
	await frames(2)
	var notes: Array = []
	var cb := func(text: String, _kind: String) -> void: notes.append(text)
	Events.notify.connect(cb)
	var p := _player().global_position
	Dev.spawn("night_stalker")
	Dev.spawn("watcher")
	Dev.spawn("wild_wolf")
	Dev.spawn("boss_wolf")
	await frames(10)
	var near := 0
	for m in spawner.active_monsters():
		var d := (m as EnemyBase).flat_dist(p)
		if d > 9.0 and d < 15.0 and (m as EnemyBase).debug_spawned:
			near += 1
	check(near == 2, "H F4-style debug spawns appear ~12 m from the player (%d)" % near)
	var not_yet := 0
	for t in notes:
		if str(t).contains("not available yet"):
			not_yet += 1
	check(not_yet == 2, "H wolves notify 'not available yet' (%d)" % not_yet)
	Events.notify.disconnect(cb)
	var before := str(Settings.get_value("quality"))
	Settings.set_value("quality", "low", false)
	await frames(5)
	Settings.set_value("quality", "high", false)
	await frames(5)
	Settings.set_value("quality", before, false)
	check(spawner.active_monsters().size() == 2, "H quality switches keep monsters alive")
	spawner.clear_all()
	spawner.auto_spawn = true


func _scenario_defeat() -> void:
	print("-- F: defeating a stalker")
	_set_night()
	spawner.auto_spawn = false
	spawner.clear_all()
	await frames(2)
	var p := _player().global_position
	var s := spawner.spawn_at("night_stalker", p + Vector3(3.0, 0.0, 0.0))
	await frames(5)
	var killed: Array = []
	var cb := func(kind: String, _pos: Vector3) -> void: killed.append(kind)
	Events.enemy_killed.connect(cb)
	# Hitscan weapons: a ray on the "creatures" layer finds the monster.
	var from := _player().global_position + Vector3.UP * 1.3
	var to := s.global_position + Vector3.UP * 1.2
	var q := PhysicsRayQueryParameters3D.create(from, from + (to - from) * 1.5, 1 << 2)
	var hit := game.get_world_3d().direct_space_state.intersect_ray(q)
	var hit_owner: Variant = null
	if not hit.is_empty() and hit["collider"] is Object:
		hit_owner = (hit["collider"] as Object).get_meta("damageable", null)
	check(hit_owner == s, "F a ray on physics layer 3 hits the stalker's hitbox")
	var stat_before := int(GameState.stats.get("enemies_defeated", 0))
	var pickups_before := game.pickups.get_child_count()
	var guard := 0
	while is_instance_valid(s) and s.is_alive() and guard < 40:
		s.take_damage(15.0, _player(), "wooden_bat")
		guard += 1
		await frames(3)
	await frames(10)
	check(killed.has("night_stalker"), "F Events.enemy_killed fires")
	check(int(GameState.stats.get("enemies_defeated", 0)) == stat_before + 1, "F enemies_defeated stat counts")
	check(game.pickups.get_child_count() > pickups_before, "F the stalker drops loot")
	await frames(90)
	check(not is_instance_valid(s), "F the defeated stalker dissolves and is freed")
	Events.enemy_killed.disconnect(cb)
	spawner.auto_spawn = true


func _finish() -> void:
	print("MONSTER SIM RESULT: %d passed, %d failed" % [passes, failures])
	get_tree().quit(1 if failures > 0 else 0)
