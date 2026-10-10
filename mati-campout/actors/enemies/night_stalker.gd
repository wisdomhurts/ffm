class_name NightStalker
extends EnemyBase
## The Night Stalker: a hunched shadow that lurks at the edge of the
## firelight, follows through the dark and lunges at anyone who strays from
## the light. Flashlight beams, torches and fire make it recoil and run.
##
## States
##   IDLE        brief pause
##   WANDER      drift toward the player's area (or into a cold camp)
##   OBSERVE     the player is in the light: lurk just outside it, pacing the
##               edge, head tracking and tilting, eyes glowing
##   STALK       the player is in the dark: hiss, then follow at a distance
##               through darkness; eyes brighten right before a chase
##   CHASE       run at the player; stops dead at the edge of the light
##   ATTACK      telegraphed swipe (EnemyBase attack)
##   FLEE_LIGHT  recoil (arms over the face), then run from the light
##   RECOVER     back off and wait, then re-approach
##
## Night-1 fairness: a short grace period before stepping out of the light
## is punished, a long stalk before chasing, a clear telegraph, and no attack
## ever lands on a player standing in strong light.

enum S { IDLE, WANDER, OBSERVE, STALK, CHASE, ATTACK, FLEE_LIGHT, RECOVER }
const STATE_NAMES := ["idle", "wander", "observe", "stalk", "chase", "attack", "flee_light", "recover"]

var stalk_speed := 3.4
var sight_range := 34.0
var observe_range := 22.0
var flee_time := 2.5
var recover_time := 3.0

var _goal := Vector3.INF
var _lurk_offset := 0.0
var _pace_t := 0.0
var _player_dark := false
var _dark_t := 0.0
var _pre_chase := -1.0
var _hiss_cd := 0.0
var _flee_dir := Vector3.ZERO
var _flee_dir_t := 0.0
var _stalk_len := 3.0
var _stalk_side := 1.0
var _idle_len := 1.5
var _dist := 1e9


func _read_stats() -> void:
	stalk_speed = float(def.get("stalk_speed", stalk_speed))
	sight_range = float(def.get("sight_range", sight_range))
	observe_range = float(def.get("observe_range", observe_range))
	flee_time = float(def.get("flee_time", flee_time))
	recover_time = float(def.get("recover_time", recover_time))
	knockback = 5.0
	radius = 0.42
	_enter(S.IDLE)


func state_name() -> String:
	return STATE_NAMES[state]


## Seconds the player may stand in darkness before a lurking stalker reacts.
func _grace() -> float:
	return clampf(1.5 - 0.1 * float(night - 1), 0.6, 1.5) / maxf(aggression, 0.5)


func _speed_mult() -> float:
	return 1.0 + (aggression - 1.0) * 0.3


func _sight() -> float:
	return sight_range * (1.0 + (aggression - 1.0) * 0.8)


func _cold_camp() -> bool:
	return not GameState.fire.is_lit() and GameState.campfire != null and is_instance_valid(GameState.campfire)


func _think(delta: float) -> void:
	_hiss_cd = maxf(_hiss_cd - delta, 0.0)
	var t := target()
	var alive := t != null and target_alive()
	var ppos := Vector3.ZERO
	_dist = 1e9
	if alive:
		ppos = t.global_position
		_dist = flat_dist(ppos)
		_update_player_dark(delta, ppos)
	# Light always wins: recoil and run (enter above the fear level, leave well below).
	if fears_light and state != S.FLEE_LIGHT and light_at(global_position) >= light_fear + 0.02:
		_enter(S.FLEE_LIGHT)
	match state:
		S.IDLE:
			_st_idle(alive)
		S.WANDER:
			_st_wander(alive, ppos)
		S.OBSERVE:
			_st_observe(delta, alive, ppos)
		S.STALK:
			_st_stalk(delta, alive, ppos)
		S.CHASE:
			_st_chase(alive, ppos)
		S.ATTACK:
			# Between attack phases (e.g. after a cancelled swing).
			_enter(S.RECOVER)
		S.FLEE_LIGHT:
			_st_flee(delta, alive, ppos)
		S.RECOVER:
			_st_recover(alive, ppos)


func _update_player_dark(delta: float, ppos: Vector3) -> void:
	var l := light_at(ppos)
	if _player_dark:
		if l >= light_fear:
			_player_dark = false
	elif l < light_fear * 0.85:
		_player_dark = true
	_dark_t = _dark_t + delta if _player_dark else 0.0


func _engage() -> void:
	if _player_dark and _dark_t >= _grace():
		_enter(S.STALK)
	else:
		_enter(S.OBSERVE)


func _st_idle(alive: bool) -> void:
	pose_crouch = 0.15
	pose_flare = 0.08
	if alive and _dist < _sight():
		_engage()
	elif state_time > _idle_len:
		_enter(S.WANDER)


func _st_wander(alive: bool, ppos: Vector3) -> void:
	pose_crouch = 0.1
	pose_flare = 0.08
	if alive and _dist < _sight():
		_engage()
		return
	if _goal == Vector3.INF or flat_dist(_goal) < 1.0:
		if _goal != Vector3.INF and rng.randf() < 0.35:
			_enter(S.IDLE)
			return
		_goal = _pick_wander_goal(alive, ppos)
	if state_time > 12.0:
		_enter(S.IDLE)
		return
	go_to(_goal, walk_speed * _speed_mult())


func _pick_wander_goal(alive: bool, ppos: Vector3) -> Vector3:
	if _cold_camp() and rng.randf() < 0.75:
		var c: Vector3 = (GameState.campfire as Node3D).global_position
		return c + Vector3(rng.randf_range(-6.0, 6.0), 0.0, rng.randf_range(-6.0, 6.0))
	var dir := Vector3(rng.randf_range(-1.0, 1.0), 0.0, rng.randf_range(-1.0, 1.0)).normalized()
	if alive:
		dir = flat_dir(ppos).rotated(Vector3.UP, rng.randf_range(-0.7, 0.7))
	return global_position + dir * rng.randf_range(8.0, 14.0)


func _st_observe(delta: float, alive: bool, ppos: Vector3) -> void:
	if not alive:
		_enter(S.WANDER)
		return
	look_point = ppos + Vector3.UP * 1.5
	pose_crouch = 0.55
	pose_flare = 0.2 + 0.08 * sin(state_time * 2.3)
	if _player_dark and _dark_t >= _grace():
		_enter(S.STALK)
		return
	if _dist > _sight() * 1.4:
		_enter(S.WANDER)
		return
	if not GameState.flags.get("hint_stalker", false) and _dist < 30.0:
		GameState.flags["hint_stalker"] = true
		Events.notify.emit("Glowing eyes in the dark! Shadows can't enter the firelight.", "warn")
	_pace_t -= delta
	if _pace_t <= 0.0 or _goal == Vector3.INF:
		_lurk_offset = clampf(_lurk_offset + rng.randf_range(-0.5, 0.5), -1.1, 1.1)
		_goal = _lurk_point(ppos)
		_pace_t = rng.randf_range(2.5, 5.5)
	if flat_dist(_goal) > 0.7:
		go_to(_goal, walk_speed * 0.7)
		if flat_dist(_goal) < 3.0:
			face_point = ppos
	else:
		face_point = ppos


## A spot just outside the light, on this stalker's side of the player.
func _lurk_point(ppos: Vector3) -> Vector3:
	var base := global_position - ppos
	base.y = 0.0
	if base.length() < 0.5:
		base = Vector3(rng.randf_range(-1.0, 1.0), 0.0, rng.randf_range(-1.0, 1.0))
	base = base.normalized().rotated(Vector3.UP, _lurk_offset)
	var hold := light_fear * 0.75
	var r := 2.0
	while r < 45.0 and light_at(ppos + base * r) >= hold:
		r += 1.0
	r += rng.randf_range(0.8, 2.4)
	r = maxf(r, 6.0)
	return ppos + base * r


func _st_stalk(delta: float, alive: bool, ppos: Vector3) -> void:
	if not alive:
		_enter(S.WANDER)
		return
	look_point = ppos + Vector3.UP * 1.5
	if not _player_dark:
		_enter(S.OBSERVE)
		return
	if _dist > _sight() * 1.4:
		_enter(S.WANDER)
		return
	if _pre_chase >= 0.0:
		# Telegraph: stop, crouch low, eyes brighten... then go.
		_pre_chase -= delta
		face_point = ppos
		pose_crouch = 0.7
		pose_flare = 1.0
		if _pre_chase <= 0.0:
			_enter(S.CHASE)
		return
	pose_crouch = 0.62
	pose_flare = 0.35
	var keep := lerpf(9.0, 6.0, clampf(aggression - 1.0, 0.0, 1.0))
	var around := (global_position - ppos)
	around.y = 0.0
	if around.length() < 0.5:
		around = Vector3.FORWARD
	var goal := ppos + around.normalized().rotated(Vector3.UP, _stalk_side * 0.35) * keep
	go_to(goal, stalk_speed * _speed_mult())
	if flat_dist(goal) < 2.0:
		face_point = ppos
	if state_time > _stalk_len or _dist < 5.0:
		_pre_chase = 0.85 / sqrt(maxf(aggression, 0.5))


func _st_chase(alive: bool, ppos: Vector3) -> void:
	if not alive:
		_enter(S.RECOVER)
		return
	look_point = ppos + Vector3.UP * 1.5
	face_point = ppos
	pose_crouch = 0.15
	pose_flare = 0.8
	if not _player_dark:
		# Back in the light: stop at its edge and watch.
		_enter(S.OBSERVE)
		return
	desired = flat_dir(ppos) * chase_speed * _speed_mult()
	if _dist <= attack_range and _attack_cd <= 0.0 and not target_lit():
		_enter(S.ATTACK)
		begin_attack()
		return
	if state_time > 9.0 or _held_t > 1.5:
		_enter(S.RECOVER)


func _st_flee(delta: float, alive: bool, ppos: Vector3) -> void:
	pose_flare = 0.0
	_flee_dir_t -= delta
	if _flee_dir_t <= 0.0:
		_flee_dir_t = 0.5
		var d := Lights.flee_direction(global_position + Vector3.UP)
		if d == Vector3.ZERO and alive:
			d = -flat_dir(ppos)
		if d != Vector3.ZERO:
			_flee_dir = d
	if alive:
		look_point = ppos + Vector3.UP * 1.5
	if state_time < 0.45:
		# Recoil: shield the eyes and stagger back.
		pose_recoil = 1.0
		pose_crouch = 0.2
		desired = _flee_dir * 1.2
		return
	pose_recoil = 0.25
	pose_crouch = 0.3
	desired = _flee_dir * chase_speed
	var here := light_at(global_position)
	if (state_time > flee_time and here < light_fear * 0.6) or state_time > flee_time * 4.0:
		_enter(S.RECOVER)


func _st_recover(alive: bool, ppos: Vector3) -> void:
	pose_recoil = 0.0
	pose_crouch = 0.35
	pose_flare = 0.1
	if alive:
		look_point = ppos + Vector3.UP * 1.5
		if state_time < 0.9:
			desired = -flat_dir(ppos) * 1.6
		else:
			face_point = ppos
	if state_time > recover_time / maxf(aggression, 0.5):
		if alive and _dist < _sight() * 1.2:
			_engage()
		else:
			_enter(S.WANDER)


func _enter(s: int) -> void:
	if state == s and state_time > 0.0:
		return
	state = s
	state_time = 0.0
	_goal = Vector3.INF
	_pre_chase = -1.0
	pose_recoil = 0.0
	match s:
		S.IDLE:
			_idle_len = rng.randf_range(0.8, 2.2)
		S.STALK:
			var patience := clampf(1.5 - 0.08 * float(night - 1), 0.8, 1.5)
			_stalk_len = rng.randf_range(2.2, 4.2) * patience / maxf(aggression, 0.5)
			_stalk_side = 1.0 if rng.randf() < 0.5 else -1.0
			if _hiss_cd <= 0.0:
				_hiss_cd = 8.0
				play_sound("stalker_hiss", 2.5, -2.0, "[a hiss in the dark]")
		S.FLEE_LIGHT:
			cancel_attack()
			_flee_dir_t = 0.0
			_flee_dir = -global_transform.basis.z * -1.0
			play_sound("stalker_hiss", 1.5, -5.0)
		S.OBSERVE:
			_pace_t = 0.0


func _on_attack_telegraph() -> void:
	play_sound("stalker_attack", 0.6, 0.0, "[a shadow lunges!]")


func _on_attack_done() -> void:
	_enter(S.RECOVER)


func _on_attack_cancelled() -> void:
	if state == S.ATTACK:
		_enter(S.RECOVER)


func _on_hurt(_source: Node, _dmg_kind: String) -> void:
	# Kid-friendly: a good whack makes it back off for a moment.
	if state != S.FLEE_LIGHT:
		_enter(S.RECOVER)


func _pose_hold() -> void:
	match hold_pose:
		"windup":
			pose_crouch = 0.0
			pose_flare = 1.0
			if model:
				model.windup = 1.0
		"chase":
			pose_crouch = 0.6
			pose_flare = 1.0
		_:
			pose_crouch = 0.6
			pose_flare = 0.3


func threat_level() -> float:
	if dying or retreating or _dist > 60.0:
		return 0.0
	var near := clampf(1.0 - _dist / 40.0, 0.0, 1.0)
	match state:
		S.CHASE, S.ATTACK:
			return clampf(0.6 + near, 0.0, 1.0)
		S.STALK:
			return 0.35 + 0.4 * near
		S.OBSERVE:
			return 0.15 + 0.3 * near
	return 0.1 * near
