class_name Watcher
extends EnemyBase
## The Watcher: a very tall, still, hooded figure with pale eyes that stands
## between the trees 30-45 m away and stares. Mostly psychological tension.
##
##   APPEAR    fades in (only ever placed where the camera is not looking)
##   STARE     motionless, body slowly turning to face the player, head
##             tracking, the odd whisper
##   FLEE      the player came within ~15 m or shone a light on it: it turns,
##             runs and fades away
##   HIDDEN    gone; relocates to a new off-screen spot between the trees
##   APPROACH  rarely (attack_chance), when the player lingers in darkness, it
##             walks closer... then rushes the last metres
##   ATTACK    one telegraphed swipe, then it vanishes again
## It only ever relocates while off-screen (active camera frustum check).

enum W { APPEAR, STARE, FLEE, HIDDEN, APPROACH, ATTACK }
const STATE_NAMES := ["appear", "stare", "flee", "hidden", "approach", "attack"]

var place_min := 30.0
var place_max := 45.0
var flee_dist := 15.0
var flee_speed := 7.5
var attack_chance := 0.08

var _whisper_t := 6.0
var _roll_t := 6.0
var _retry_t := 0.0
var _offscreen_t := 0.0
var _player_dark := false
var _linger_t := 0.0
var _linger_anchor := Vector3.INF
var _flee_dir := Vector3.ZERO
var _dist := 1e9


func _read_stats() -> void:
	place_min = maxf(float(def.get("stare_min_dist", 18.0)), 30.0)
	place_max = maxf(float(def.get("stare_max_dist", 45.0)), place_min + 5.0)
	flee_dist = float(def.get("flee_dist", 15.0))
	flee_speed = float(def.get("flee_speed", flee_speed))
	attack_chance = float(def.get("attack_chance", attack_chance))
	turn_speed = 1.6
	knockback = 2.0
	radius = 0.4
	_whisper_t = rng.randf_range(4.0, 12.0)
	_roll_t = rng.randf_range(4.0, 8.0)
	state = W.APPEAR
	fade_in(1.8)


func state_name() -> String:
	return STATE_NAMES[state]


func _think(delta: float) -> void:
	var t := target()
	var alive := t != null and target_alive()
	var ppos := Vector3.ZERO
	_dist = 1e9
	if alive:
		ppos = t.global_position
		_dist = flat_dist(ppos)
		_update_linger(delta, ppos)
	match state:
		W.APPEAR:
			if alive:
				face_point = ppos
				look_point = head_point(t)
			pose_flare = 0.3
			if state_time > 0.3 and alive and (_dist < flee_dist or light_at(global_position) >= light_fear):
				_flee(ppos)
			elif state_time > 1.6:
				_enter(W.STARE)
		W.STARE:
			_st_stare(delta, alive, ppos)
		W.FLEE:
			desired = _flee_dir * flee_speed
			pose_recoil = 0.7 if state_time < 0.35 else 0.0
			pose_flare = 0.0
			if fade_amount() >= 0.999 or state_time > 3.0:
				_hide()
		W.HIDDEN:
			_retry_t -= delta
			if _retry_t <= 0.0 and alive and not _try_relocate(ppos):
				_retry_t = 1.5
		W.APPROACH:
			_st_approach(alive, ppos)
		W.ATTACK:
			_flee(ppos)


func _update_linger(delta: float, ppos: Vector3) -> void:
	var l := light_at(ppos)
	if _player_dark:
		if l >= light_fear:
			_player_dark = false
	elif l < light_fear * 0.8:
		_player_dark = true
	if _linger_anchor == Vector3.INF or ppos.distance_to(_linger_anchor) > 7.0 or not _player_dark:
		_linger_anchor = ppos
		_linger_t = 0.0
	else:
		_linger_t += delta


func _st_stare(delta: float, alive: bool, ppos: Vector3) -> void:
	pose_crouch = 0.0
	pose_flare = 0.28 + 0.08 * sin(state_time * 1.3)
	if not alive:
		return
	face_point = ppos
	look_point = ppos + Vector3.UP * 1.5
	if _dist < flee_dist or light_at(global_position) >= light_fear:
		_flee(ppos)
		return
	_whisper_t -= delta
	if _whisper_t <= 0.0:
		_whisper_t = rng.randf_range(9.0, 20.0)
		if _dist < 55.0:
			play_sound("watcher_whisper", 5.0, -6.0, "[faint whispering]")
	var vis := on_screen(global_position + Vector3.UP * 2.8, get_viewport())
	if vis:
		_offscreen_t = 0.0
		if not GameState.flags.get("hint_watcher", false) and _dist < 50.0:
			GameState.flags["hint_watcher"] = true
			Events.notify.emit("Something tall is watching you... Shine a light on it!", "warn")
	else:
		_offscreen_t += delta
		# Only ever moves while nobody is looking.
		if _dist > place_max + 12.0 or _offscreen_t > 16.0:
			_hide()
			_retry_t = 0.0
			return
	if _player_dark and _linger_t > 10.0:
		_roll_t -= delta
		if _roll_t <= 0.0:
			_roll_t = 6.0
			if rng.randf() < attack_chance * aggression:
				_enter(W.APPROACH)
				play_sound("watcher_whisper", 3.0, -2.0, "[the whispering grows louder]")


func _st_approach(alive: bool, ppos: Vector3) -> void:
	if not alive:
		_flee(ppos)
		return
	face_point = ppos
	look_point = ppos + Vector3.UP * 1.5
	pose_flare = 0.6
	if light_at(global_position) >= light_fear or target_lit() or state_time > 30.0:
		_flee(ppos)
		return
	var speed := walk_speed if _dist > 8.0 else chase_speed
	desired = flat_dir(ppos) * speed * (1.0 + (aggression - 1.0) * 0.3)
	if _dist <= attack_range and _attack_cd <= 0.0:
		_enter(W.ATTACK)
		begin_attack()


func _flee(ppos: Vector3) -> void:
	cancel_attack()
	state = W.FLEE
	state_time = 0.0
	var away := global_position - ppos
	away.y = 0.0
	if away.length() < 0.1:
		away = -global_transform.basis.z
	_flee_dir = away.normalized().rotated(Vector3.UP, rng.randf_range(-0.5, 0.5))
	fade_out(1.1)


func _hide() -> void:
	state = W.HIDDEN
	state_time = 0.0
	hidden = true
	visible = false
	_set_hitbox_enabled(false)
	velocity = Vector3.ZERO
	_retry_t = rng.randf_range(4.0, 9.0)
	_offscreen_t = 0.0


func _try_relocate(ppos: Vector3) -> bool:
	var spot := Spawner.find_spot("watcher", ppos, place_min, place_max, rng, get_viewport(), true)
	if spot == Vector3.INF:
		return false
	global_position = spot
	reset_physics_interpolation()
	face_now(ppos)
	hidden = false
	visible = true
	_set_hitbox_enabled(true)
	fade_in(1.8)
	_enter(W.APPEAR)
	return true


func _enter(s: int) -> void:
	state = s
	state_time = 0.0
	pose_recoil = 0.0


func retreat(fade_time: float = -1.0) -> void:
	if hidden:
		retreating = true
		queue_free()
		return
	super.retreat(fade_time if fade_time > 0.0 else 1.4)


func _on_attack_telegraph() -> void:
	play_sound("watcher_whisper", 0.5, 3.0, "[a cold whisper, very close]")


func _on_attack_done() -> void:
	var t := target()
	_flee(t.global_position if t else global_position + global_transform.basis.z)


func _on_attack_cancelled() -> void:
	if state == W.ATTACK:
		var t := target()
		_flee(t.global_position if t else global_position + global_transform.basis.z)


func _on_hurt(source: Node, _dmg_kind: String) -> void:
	var from := global_position + global_transform.basis.z
	if source is Node3D:
		from = (source as Node3D).global_position
	_flee(from)


func _pose_hold() -> void:
	pose_crouch = 0.0
	pose_flare = 0.32


func threat_level() -> float:
	if dying or retreating or hidden or _dist > 60.0:
		return 0.0
	match state:
		W.APPROACH, W.ATTACK:
			return clampf(0.55 + (1.0 - _dist / 30.0) * 0.45, 0.0, 1.0)
		W.STARE, W.APPEAR:
			return 0.2
	return 0.05
