class_name Spawner
extends Node3D
## Night monster spawning: Night Stalkers and Watchers.
##
## - While monsters are active (late DUSK and NIGHT, DayCycle.monsters_active())
##   the spawner keeps Difficulty.monster_counts(night, balance.spawning,
##   fire_out) monsters out, topping up one at a time (a short burst when the
##   night begins) under a hard cap.
## - Spawn points are dry land in darkness (artificial light < 0.1),
##   34-62 m from the player (Watchers 30-45 m, between trees), preferably
##   outside the camera view.
## - Campfire OUT: extra stalkers (fire_out_extra_stalkers) and every monster's
##   aggression becomes fire_out_aggression_mult; they come into camp.
## - DAWN: every monster flees and fades. Monsters that wander beyond
##   despawn_dist are removed and replaced nearer.
## - Plays "night_sting" when night falls unless the audio director sets
##   `plays_night_sting = true`; feeds Audio.set_danger() from the monsters'
##   threat levels.
## - debug_spawn(kind): dev tools (F4) spawn ~12 m in front of the player.

## Hard cap on live monsters (balance.spawning.max_monsters overrides).
const MAX_MONSTERS := 16
const TICK := 0.5

var game: Node = null
var rng := RandomNumberGenerator.new()
## Live monsters owned by the spawner.
var monsters: Array = []
## false = no automatic spawning (screenshot tour, tests).
var auto_spawn := true
var aggression := 1.0

var _serial := 0
var _tick := 0.0
var _danger := 0.0
var _was_active := false
var _fire_out := false
var _sting_night := -1
var _cfg: Dictionary = {}


func setup(p_game: Game) -> void:
	game = p_game
	rng.seed = hash([GameState.seed, "night_monsters"])
	var cfg: Variant = DB.b("spawning", {})
	_cfg = cfg if cfg is Dictionary else {}
	_fire_out = not GameState.fire.is_lit()
	Events.phase_changed.connect(_on_phase_changed)
	Events.fire_extinguished.connect(_on_fire_changed)
	Events.fire_relit.connect(_on_fire_changed)


func _physics_process(delta: float) -> void:
	_tick -= delta
	if _tick > 0.0:
		return
	_tick = TICK
	_update()


func _update() -> void:
	_prune()
	var player := GameState.player
	var gen := GameState.world_gen
	if player == null or not is_instance_valid(player) or gen == null:
		return
	var dc := GameState.day_cycle
	if dc.phase == DayCycle.Phase.DAWN or dc.phase == DayCycle.Phase.DAY:
		_retreat_all(false)
		_was_active = false
		_update_danger()
		return
	var fire_out := not GameState.fire.is_lit()
	if fire_out != _fire_out:
		_apply_fire_state(fire_out)
	var active := GameState.is_playing() and dc.monsters_active()
	if active and auto_spawn:
		var counts := Difficulty.monster_counts(maxi(GameState.night_number(), 1), _cfg, fire_out)
		var burst := 1 if _was_active else 3
		for k: String in ["night_stalker", "watcher"]:
			var missing := mini(int(counts.get(k, 0)) - count_kind(k), burst)
			for _i in missing:
				if monsters.size() >= int(_cfg.get("max_monsters", MAX_MONSTERS)):
					break
				var r := spawn_ring(k)
				var p := find_spot(k, player.global_position, r.x, r.y, rng, get_viewport(), false)
				if p != Vector3.INF:
					spawn_at(k, p)
	_was_active = active
	_despawn_far(player.global_position)
	_update_danger()


## Min/max spawn distance for a kind.
func spawn_ring(kind: String) -> Vector2:
	if kind == "watcher":
		var d := DB.enemy("watcher")
		var lo := maxf(float(d.get("stare_min_dist", 18.0)), 30.0)
		return Vector2(lo, maxf(float(d.get("stare_max_dist", 45.0)), lo + 5.0))
	return Vector2(float(_cfg.get("spawn_min_dist", 34.0)), float(_cfg.get("spawn_max_dist", 62.0)))


## A dry, dark, unobstructed spot min_r..max_r from `center`, preferring
## places the camera cannot see (and for Watchers, among trees).
## need_offscreen refuses visible spots. Returns Vector3.INF if none found.
static func find_spot(kind: String, center: Vector3, min_r: float, max_r: float, p_rng: RandomNumberGenerator, vp: Viewport, need_offscreen: bool) -> Vector3:
	var gen := GameState.world_gen
	if gen == null:
		return Vector3.INF
	var veg := GameState.vegetation
	var can_query := veg != null and is_instance_valid(veg) and veg.has_method("obstacles_near")
	var best := Vector3.INF
	var best_score := -1e9
	for _i in 20:
		var p := gen.random_land_point(p_rng, center, min_r, max_r, 3)
		if p == Vector3.INF:
			continue
		if gen.height_at(p.x, p.z) < WorldGen.WATER_LEVEL + 0.3:
			continue
		if EnemyBase.light_at(p) >= 0.1:
			continue
		var trees := 0
		var blocked := false
		if can_query:
			var obs: Variant = veg.call("obstacles_near", p, 6.0)
			if obs is Array:
				for o in obs:
					if o is Vector4:
						var ov: Vector4 = o
						var d := Vector2(p.x - ov.x, p.z - ov.z).length()
						if d < ov.w + 0.7:
							blocked = true
							break
						trees += 1
		if blocked:
			continue
		var seen := EnemyBase.on_screen(p + Vector3.UP * 1.6, vp) or EnemyBase.on_screen(p + Vector3.UP * 0.3, vp)
		if seen and need_offscreen:
			continue
		var score := p_rng.randf() * 0.5
		if not seen:
			score += 10.0
		if kind == "watcher":
			score += minf(float(trees), 4.0)
		if score > best_score:
			best_score = score
			best = p
	return best


## Spawn a monster at a ground position (no checks). Used by the night
## top-up, debug_spawn, the screenshot tour and tests.
func spawn_at(kind: String, pos: Vector3) -> EnemyBase:
	var m: EnemyBase = null
	match kind:
		"night_stalker":
			m = NightStalker.new()
		"watcher":
			m = Watcher.new()
		_:
			return null
	_serial += 1
	m.name = "%s_%d" % [kind, _serial]
	m.setup_enemy(kind, hash([GameState.seed, _serial, kind]), maxi(GameState.night_number(), 1), _serial)
	m.aggression = aggression
	add_child(m)
	var gen := GameState.world_gen
	m.global_position = gen.ground(pos) if gen else pos
	var p := GameState.player
	if p and is_instance_valid(p):
		m.face_now(p.global_position)
	m.reset_physics_interpolation()
	if kind == "night_stalker":
		m.fade_in(1.4)
	monsters.append(m)
	return m


func count_kind(kind: String) -> int:
	var n := 0
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e and e.kind == kind and not e.dying and not e.retreating:
			n += 1
	return n


## Living monsters (not dying / retreating).
func active_monsters() -> Array:
	var out: Array = []
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e and not e.dying and not e.retreating:
			out.append(e)
	return out


## Remove every monster immediately (tests, screenshot tour).
func clear_all() -> void:
	for m in monsters:
		if is_instance_valid(m):
			(m as Node).queue_free()
	monsters.clear()


func _prune() -> void:
	for i in range(monsters.size() - 1, -1, -1):
		var m: Variant = monsters[i]
		if not is_instance_valid(m) or (m as Node).is_queued_for_deletion():
			monsters.remove_at(i)


func _despawn_far(center: Vector3) -> void:
	var far := float(_cfg.get("despawn_dist", 110.0))
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e and not e.debug_spawned and e.flat_dist(center) > far:
			e.queue_free()


func _retreat_all(include_debug: bool) -> void:
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e and (include_debug or not e.debug_spawned):
			e.retreat()


func _apply_fire_state(out: bool) -> void:
	_fire_out = out
	aggression = float(_cfg.get("fire_out_aggression_mult", 1.6)) if out else 1.0
	var first: EnemyBase = null
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e:
			e.aggression = aggression
			if first == null and e.kind == "night_stalker" and not e.retreating:
				first = e
	if out and first and GameState.day_cycle.monsters_active():
		first.play_sound("stalker_hiss", 3.0, 2.0, "[hissing from the dark all around]")


func _on_fire_changed() -> void:
	_tick = 0.0


func _on_phase_changed(phase: int) -> void:
	match phase:
		DayCycle.Phase.NIGHT:
			var n := GameState.night_number()
			if _sting_night != n:
				_sting_night = n
				var handled: Variant = Audio.get("plays_night_sting")
				if not (handled is bool and handled):
					Audio.play("night_sting")
		DayCycle.Phase.DAWN:
			_retreat_all(true)
	_tick = 0.0


func _update_danger() -> void:
	var d := 0.0
	for m in monsters:
		var e: EnemyBase = (m as EnemyBase) if is_instance_valid(m) else null
		if e:
			d = maxf(d, e.threat_level())
	var prev := _danger
	_danger = lerpf(_danger, d, 0.5)
	if absf(_danger - prev) > 0.005 or (d == 0.0 and prev > 0.0):
		if d == 0.0 and _danger < 0.02:
			_danger = 0.0
		Audio.set_danger(_danger)


# --- Dev tools ----------------------------------------------------------------------------

func debug_spawn(kind: String) -> void:
	match kind:
		"night_stalker", "watcher":
			var p := GameState.player
			if p == null or not is_instance_valid(p) or GameState.world_gen == null:
				Events.notify.emit("DEV: no player to spawn near", "warn")
				return
			var fwd := _player_forward(p)
			var pos := Vector3.INF
			for ang: float in [0.0, 0.4, -0.4, 0.8, -0.8, 1.6, -1.6, PI]:
				var q := p.global_position + fwd.rotated(Vector3.UP, ang) * 12.0
				if GameState.world_gen.in_playable(q.x, q.z) and not GameState.world_gen.is_water(q.x, q.z):
					pos = q
					break
			if pos == Vector3.INF:
				Events.notify.emit("DEV: no room to spawn here", "warn")
				return
			var m := spawn_at(kind, pos)
			if m:
				m.debug_spawned = true
				m.fade_in(0.6)
				Events.notify.emit("DEV: %s spawned" % str(DB.enemy(kind).get("name", kind)), "info")
		"wild_wolf":
			var wl: Variant = game.get("wildlife") if game else null
			if wl is Node and (wl as Node).has_method("debug_spawn"):
				(wl as Node).call("debug_spawn", kind)
			else:
				Events.notify.emit("DEV: Wild Wolf not available yet", "warn")
		"boss_wolf":
			Events.notify.emit("DEV: %s not available yet" % str(DB.enemy(kind).get("name", "Boss")), "warn")
		_:
			Events.notify.emit("DEV: unknown creature '%s'" % kind, "warn")


static func _player_forward(p: Node3D) -> Vector3:
	var fwd := -p.global_transform.basis.z
	var cam: Variant = p.get("camera")
	if cam is Camera3D and is_instance_valid(cam):
		fwd = -(cam as Camera3D).global_transform.basis.z
	fwd.y = 0.0
	return fwd.normalized() if fwd.length_squared() > 0.0001 else Vector3.FORWARD
