class_name EnemyBase
extends Node3D
## Shared body of the night monsters (Night Stalker, Watcher).
##
## - Stats from data/enemies.json, scaled by Difficulty.hp_mult / damage_mult
##   for the current night.
## - Kinematic movement on the terrain (y = WorldGen.height_at) with steering
##   around tree trunks (Vegetation.obstacles_near), separation from other
##   monsters and the player, and hard limits: never into water, never out of
##   the playable square, never a step deeper into strong light.
## - Light fear: Lights.intensity_at (artificial light only; daylight is handled
##   by the spawner's dawn retreat) is compared with `light_fear`. Monsters hold
##   at the edge of the light (HOLD) and flee with hysteresis when light lands
##   on them.
## - Readable attacks: wind-up (eyes flare, rear back, sound) -> strike -> follow
##   through. Damage only lands if the target is still in reach and NOT standing
##   in strong light.
## - Feedback: hit flash, knockback, shadow puff, "hit_enemy", float text,
##   Events.enemy_damaged; defeat dissolves into a big puff, drops seeded loot,
##   Events.enemy_killed and the enemies_defeated stat.
##
## Subclasses implement _think(delta) and set `desired` (world velocity),
## `face_point`, `look_point` and the pose targets each physics frame.

signal attacked(target: Node, amount: float)
signal defeated(enemy: EnemyBase)

## Monsters stop advancing when the light ahead reaches light_fear * HOLD.
const HOLD := 0.9

## Global sound throttle (sound id -> earliest next msec) so a pack never
## turns into a chorus.
static var _sound_gate: Dictionary = {}

var kind := ""
var team := "monster"
var def: Dictionary = {}
var serial := 0
var night := 1

var max_hp := 50.0
var hp := 50.0
var damage := 10.0
var fears_light := true
var light_fear := 0.35
var walk_speed := 2.4
var chase_speed := 5.5
var attack_range := 1.9
var attack_windup := 0.5
var attack_cooldown := 1.5
var knockback := 4.5
var radius := 0.45
var turn_speed := 7.0
var accel := 16.0

## 1 = normal. Raised by the spawner while the campfire is out.
var aggression := 1.0
## Spawned by dev tools: ignores daylight until the next dawn.
var debug_spawned := false
## false = stand still and face `hold_face` (or the active camera); used by the
## screenshot tour. The model keeps animating.
var ai_enabled := true
var hold_face := Vector3.INF
var hold_pose := ""

var model: MonsterModel
## Ray-hittable body (layer 3); meta "damageable" = this monster.
var hitbox: AnimatableBody3D
var rng := RandomNumberGenerator.new()
var velocity := Vector3.ZERO
var desired := Vector3.ZERO
var face_point := Vector3.INF
var look_point := Vector3.INF
var heading := 0.0
var state := 0
var state_time := 0.0
var retreating := false
var dying := false
## Vanished (Watcher between relocations): untargetable and invisible.
var hidden := false
## True when the last step was refused because it led into light.
var held_by_light := false

# Pose targets (smoothed into the model).
var pose_crouch := 0.0
var pose_flare := 0.0
var pose_recoil := 0.0

var _knock := Vector3.ZERO
var _attack_cd := 0.0
var _attack_phase := 0
var _attack_t := 0.0
var _attack_hit := false
var _fade := 0.0
var _fade_target := 0.0
var _fade_speed := 1.0
var _death_t := 0.0
var _obstacles: Array = []
var _obstacle_t := 0.0
var _sep := Vector3.ZERO
var _sep_t := 0.0
var _retreat_dir := Vector3.ZERO
var _held_t := 0.0


## Configure stats and build the model. Call before adding to the tree.
func setup_enemy(p_kind: String, p_seed: int, p_night: int, p_serial: int = 0) -> void:
	kind = p_kind
	serial = p_serial
	night = maxi(p_night, 1)
	def = DB.enemy(kind)
	rng.seed = p_seed
	var dcfg := GameState.difficulty_cfg()
	max_hp = float(def.get("hp", 50.0)) * Difficulty.hp_mult(night, dcfg)
	hp = max_hp
	damage = float(def.get("damage", 10.0)) * Difficulty.damage_mult(night, dcfg)
	team = str(def.get("team", "monster"))
	fears_light = bool(def.get("fears_light", true))
	light_fear = float(def.get("light_fear", 0.35))
	walk_speed = float(def.get("walk_speed", walk_speed))
	chase_speed = float(def.get("chase_speed", chase_speed))
	attack_range = float(def.get("attack_range", attack_range))
	attack_windup = float(def.get("attack_windup", attack_windup))
	attack_cooldown = float(def.get("attack_cooldown", attack_cooldown))
	_read_stats()
	add_to_group("monster")
	add_to_group("damageable")
	model = MonsterModel.create(kind, p_seed, Settings.quality())
	add_child(model)
	_build_hitbox()


## A capsule on physics layer 3 ("creatures") so hitscan weapons and other
## ray queries can find the monster: `collider.get_meta("damageable")` is this
## node. The player body does not collide with layer 3.
func _build_hitbox() -> void:
	var h := model.head_height if model else 2.0
	hitbox = AnimatableBody3D.new()
	hitbox.name = "Hitbox"
	hitbox.sync_to_physics = false
	hitbox.collision_layer = 1 << 2
	hitbox.collision_mask = 0
	hitbox.set_meta("damageable", self)
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.42 if kind == "night_stalker" else 0.36
	cap.height = h + 0.25
	col.shape = cap
	col.position = Vector3(0.0, (h + 0.25) * 0.5, -0.12 if kind == "night_stalker" else 0.0)
	hitbox.add_child(col)
	add_child(hitbox)


func _set_hitbox_enabled(on: bool) -> void:
	if hitbox:
		hitbox.collision_layer = (1 << 2) if on else 0


## Subclass hook: read extra keys from `def`.
func _read_stats() -> void:
	pass


func is_alive() -> bool:
	return not dying and hp > 0.0


# --- Main loop -----------------------------------------------------------------------

func _physics_process(delta: float) -> void:
	if not is_inside_tree():
		return
	if dying:
		_update_death(delta)
		return
	_fade = move_toward(_fade, _fade_target, _fade_speed * delta)
	_attack_cd = maxf(_attack_cd - delta, 0.0)
	state_time += delta
	desired = Vector3.ZERO
	face_point = Vector3.INF
	look_point = Vector3.INF
	if not ai_enabled:
		_think_hold(delta)
	elif retreating:
		_think_retreat(delta)
	elif not GameState.is_playing():
		_think_paused(delta)
	elif _attack_phase > 0:
		_update_attack(delta)
	else:
		_think(delta)
	_move(delta)
	_update_model(delta)


## Subclass AI.
func _think(_delta: float) -> void:
	pass


## Subclass hook for the screenshot "hold" mode.
func _pose_hold() -> void:
	pose_crouch = 0.3
	pose_flare = 0.2


func _think_hold(_delta: float) -> void:
	var f := hold_face
	if f == Vector3.INF:
		var cam := get_viewport().get_camera_3d()
		if cam:
			f = cam.global_position
	if f != Vector3.INF:
		face_point = f
		look_point = f
	_pose_hold()


func _think_paused(_delta: float) -> void:
	# Run over (player defeated) or loading: stand and stare.
	var t := target()
	if t:
		look_point = t.global_position + Vector3.UP * 1.5
	pose_crouch = 0.3
	pose_flare = 0.2


func _think_retreat(_delta: float) -> void:
	desired = _retreat_dir * chase_speed * 0.7
	pose_crouch = 0.25
	pose_flare = 0.0
	pose_recoil = 0.0
	if _fade >= 0.999:
		queue_free()


# --- Targets & light -------------------------------------------------------------------

func target() -> Node3D:
	var p := GameState.player
	if p == null or not is_instance_valid(p) or not p.is_inside_tree():
		return null
	return p


func target_alive() -> bool:
	var p := target()
	if p == null or GameState.survival.dead:
		return false
	if p.has_method("is_alive") and not bool(p.call("is_alive")):
		return false
	return true


func flat_dist(p: Vector3) -> float:
	return Vector2(p.x - global_position.x, p.z - global_position.z).length()


func flat_dir(to: Vector3) -> Vector3:
	var d := Vector3(to.x - global_position.x, 0.0, to.z - global_position.z)
	return d.normalized() if d.length_squared() > 0.0001 else Vector3.ZERO


## Protective (artificial) light at a ground position, sampled at chest height.
static func light_at(p: Vector3) -> float:
	return Lights.intensity_at(p + Vector3(0.0, 1.0, 0.0), false)


## True while the player stands in light strong enough to scare this monster.
func target_lit() -> bool:
	var t := target()
	return t != null and fears_light and light_at(t.global_position) >= light_fear


func head_point(n: Node3D) -> Vector3:
	return n.global_position + Vector3.UP * 1.5


## Is a world point visible on the active camera?
static func on_screen(world_pos: Vector3, vp: Viewport) -> bool:
	if vp == null:
		return false
	var cam := vp.get_camera_3d()
	if cam == null:
		return false
	if cam.is_position_behind(world_pos):
		return false
	return cam.is_position_in_frustum(world_pos)


# --- Movement -------------------------------------------------------------------------

## Walk toward `goal` at `speed`, easing in over the last metre.
func go_to(goal: Vector3, speed: float) -> void:
	var d := flat_dist(goal)
	if d < 0.15:
		return
	desired = flat_dir(goal) * speed * clampf(d / 1.0, 0.25, 1.0)


func _move(delta: float) -> void:
	var want := desired
	var speed := want.length()
	_obstacle_t -= delta
	if _obstacle_t <= 0.0:
		_obstacle_t = 0.3
		_obstacles = _query_obstacles()
	if speed > 0.05:
		want += _avoid(want, speed)
	_sep_t -= delta
	if _sep_t <= 0.0:
		_sep_t = 0.12
		_sep = _separation()
	want += _sep
	want.y = 0.0
	var cap := maxf(speed, 1.6)
	if want.length() > cap:
		want = want.normalized() * cap
	velocity = velocity.move_toward(want, accel * delta)
	var step := (velocity + _knock) * delta
	_knock = _knock.move_toward(Vector3.ZERO, 14.0 * delta)
	held_by_light = false
	if step.length_squared() > 1e-8:
		var to := _resolve_step(global_position, step)
		if to.is_equal_approx(global_position):
			velocity *= 0.5
		else:
			global_position = to
	_held_t = _held_t + delta if held_by_light else 0.0
	_snap_ground()
	_turn(delta)


func _query_obstacles() -> Array:
	var veg := GameState.vegetation
	if veg == null or not is_instance_valid(veg) or not veg.has_method("obstacles_near"):
		return []
	var res: Variant = veg.call("obstacles_near", global_position, 4.5)
	return res if res is Array else []


## Steer around trunks that lie ahead.
func _avoid(want: Vector3, speed: float) -> Vector3:
	var push := Vector3.ZERO
	var dirn := want / speed
	for o in _obstacles:
		if not (o is Vector4):
			continue
		var ov: Vector4 = o
		var d := Vector3(global_position.x - ov.x, 0.0, global_position.z - ov.z)
		var dist := d.length()
		var gap := dist - ov.w - radius
		if gap > 1.2 or dist < 0.001:
			continue
		var away := d / dist
		if -away.dot(dirn) < -0.2:
			continue
		var k := clampf(1.0 - gap / 1.2, 0.0, 1.0)
		var side := Vector3(-away.z, 0.0, away.x)
		if side.dot(dirn) < 0.0:
			side = -side
		push += (away * 0.5 + side) * k * speed
	return push


func _separation() -> Vector3:
	var push := Vector3.ZERO
	for m in get_tree().get_nodes_in_group("monster"):
		if m == self or not (m is Node3D):
			continue
		var d := global_position - (m as Node3D).global_position
		d.y = 0.0
		var dist := d.length()
		if dist < 2.4 and dist > 0.001:
			push += d / dist * (2.4 - dist) * 1.4
	var t := target()
	if t:
		var d := global_position - t.global_position
		d.y = 0.0
		var dist := d.length()
		if dist < 1.0 and dist > 0.001:
			push += d / dist * (1.0 - dist) * 4.0
	return push


## First valid position for a step (straight, then fanning out); `from` if none.
func _resolve_step(from: Vector3, step: Vector3) -> Vector3:
	for ang: float in [0.0, 0.5, -0.5, 1.1, -1.1]:
		var s := step if ang == 0.0 else step.rotated(Vector3.UP, ang) * 0.8
		var to := from + s
		if _valid_step(from, to):
			return to
	return from


func _valid_step(from: Vector3, to: Vector3) -> bool:
	var gen := GameState.world_gen
	if gen:
		if not gen.in_playable(to.x, to.z):
			return false
		if gen.height_at(to.x, to.z) < WorldGen.WATER_LEVEL + 0.15:
			return false
	for o in _obstacles:
		if o is Vector4:
			var ov: Vector4 = o
			var dn := Vector2(to.x - ov.x, to.z - ov.z).length()
			if dn < ov.w + radius * 0.6 and dn < Vector2(from.x - ov.x, from.z - ov.z).length():
				return false
	if fears_light and not retreating:
		var l_to := light_at(to)
		if l_to >= light_fear * HOLD and l_to > light_at(from) + 0.0005:
			held_by_light = true
			return false
	var t := target()
	if t and not hidden:
		var dt := Vector2(to.x - t.global_position.x, to.z - t.global_position.z).length()
		if dt < 0.8 and dt < flat_dist(t.global_position):
			return false
	return true


func _snap_ground() -> void:
	var gen := GameState.world_gen
	if gen:
		global_position.y = gen.height_at(global_position.x, global_position.z)


func _turn(delta: float) -> void:
	var dir := Vector3.ZERO
	if face_point != Vector3.INF:
		dir = face_point - global_position
	elif velocity.length() > 0.3:
		dir = velocity
	dir.y = 0.0
	if dir.length_squared() > 0.0004:
		heading = lerp_angle(heading, atan2(-dir.x, -dir.z), 1.0 - exp(-turn_speed * delta))
		rotation.y = heading


## Face a point immediately (spawning, teleports).
func face_now(p: Vector3) -> void:
	var dir := p - global_position
	dir.y = 0.0
	if dir.length_squared() > 0.0001:
		heading = atan2(-dir.x, -dir.z)
		rotation.y = heading


func _update_model(delta: float) -> void:
	if model == null:
		return
	model.move_speed = Vector2(velocity.x, velocity.z).length()
	if look_point != Vector3.INF:
		model.look_target = look_point
	elif face_point != Vector3.INF:
		model.look_target = face_point + Vector3.UP * 1.5
	else:
		model.look_target = Vector3.INF
	var k := 1.0 - exp(-6.0 * delta)
	model.crouch = lerpf(model.crouch, pose_crouch, k)
	model.eye_flare = lerpf(model.eye_flare, pose_flare, 1.0 - exp(-9.0 * delta))
	model.recoil = lerpf(model.recoil, pose_recoil, 1.0 - exp(-12.0 * delta))
	var wu := 1.0 if _attack_phase == 1 else 0.0
	var lu := 1.0 if _attack_phase == 2 else 0.0
	model.windup = lerpf(model.windup, wu, 1.0 - exp(-(8.0 if wu > 0.0 else 14.0) * delta))
	model.lunge = lerpf(model.lunge, lu, 1.0 - exp(-(22.0 if lu > 0.0 else 6.0) * delta))
	model.dissolve = _fade


# --- Attacks ---------------------------------------------------------------------------

## Start a telegraphed attack on the player.
func begin_attack() -> void:
	_attack_phase = 1
	_attack_t = 0.0
	_attack_hit = false
	_on_attack_telegraph()


## Subclass hook (sound, caption) when the wind-up starts.
func _on_attack_telegraph() -> void:
	pass


func is_attacking() -> bool:
	return _attack_phase > 0


func _update_attack(delta: float) -> void:
	_attack_t += delta
	var t := target()
	if t:
		face_point = t.global_position
		look_point = head_point(t)
	pose_flare = 1.0
	pose_crouch = 0.0
	match _attack_phase:
		1:
			# Wind-up: stand tall, rear back, eyes flare. Light or a dead
			# target cancels it.
			if t == null or not target_alive() or target_lit() or light_at(global_position) >= light_fear:
				cancel_attack()
				return
			if _attack_t >= attack_windup:
				_attack_phase = 2
				_attack_t = 0.0
		2:
			if t:
				desired = flat_dir(t.global_position) * chase_speed * 1.25
			if not _attack_hit and _attack_t >= 0.1:
				_attack_hit = true
				if t and target_alive() and flat_dist(t.global_position) <= attack_range + 0.7 and not target_lit():
					_deal_damage(t)
			if _attack_t >= 0.28:
				_attack_phase = 3
				_attack_t = 0.0
		3:
			if _attack_t >= 0.35:
				_attack_phase = 0
				_attack_cd = attack_cooldown / maxf(aggression, 0.5)
				_on_attack_done()


func cancel_attack() -> void:
	if _attack_phase == 0:
		return
	_attack_phase = 0
	_attack_cd = maxf(_attack_cd, 0.8)
	_on_attack_cancelled()


func _on_attack_done() -> void:
	pass


func _on_attack_cancelled() -> void:
	pass


func _deal_damage(t: Node3D) -> void:
	var dmg := damage
	if t.has_method("take_damage"):
		t.call("take_damage", dmg, self, kind)
	else:
		# Fallback for player builds without the damageable contract.
		if not Dev.god_mode:
			GameState.survival.damage(dmg, kind)
		Events.player_damaged.emit(dmg, kind)
		Events.camera_shake.emit(0.35)
	attacked.emit(t, dmg)


# --- Taking damage -----------------------------------------------------------------------

func take_damage(amount: float, source: Node, dmg_kind: String = "") -> void:
	if dying or hidden or amount <= 0.0:
		return
	hp -= amount
	if model:
		model.flash = 1.0
		model.flinch = 1.0
	var dir := -global_transform.basis.z
	if source is Node3D:
		dir = (global_position - (source as Node3D).global_position)
	dir.y = 0.0
	if dir.length_squared() > 0.0001:
		_knock = dir.normalized() * knockback
	var chest := global_position + Vector3.UP * (model.head_height * 0.65 if model else 1.3)
	ShadowPuff.spawn(chest, 0.55)
	Audio.play("hit_enemy", chest)
	Events.enemy_damaged.emit(kind, amount)
	Events.float_text.emit(chest + Vector3.UP * 0.9, str(roundi(amount)), Color(0.86, 0.74, 1.0))
	if hp <= 0.0:
		_die()
		return
	if _attack_phase == 1:
		cancel_attack()
	_on_hurt(source, dmg_kind)


## Subclass hook after a non-lethal hit.
func _on_hurt(_source: Node, _dmg_kind: String) -> void:
	pass


func _die() -> void:
	dying = true
	_attack_phase = 0
	_death_t = 0.0
	_set_hitbox_enabled(false)
	remove_from_group("damageable")
	remove_from_group("monster")
	ShadowPuff.spawn(global_position + Vector3.UP * (model.head_height * 0.55 if model else 1.2), 1.5)
	_drop_loot()
	Events.enemy_killed.emit(kind, global_position)
	GameState.stat_add("enemies_defeated")
	defeated.emit(self)


func _update_death(delta: float) -> void:
	_death_t += delta
	if model:
		model.death = minf(_death_t / 0.6, 1.0)
		model.dissolve = clampf((_death_t - 0.1) / 0.9, 0.0, 1.0)
		model.eye_flare = 0.0
		model.move_speed = 0.0
	_knock = _knock.move_toward(Vector3.ZERO, 10.0 * delta)
	global_position += _knock * delta
	_snap_ground()
	if _death_t > 1.25:
		queue_free()


func _drop_loot() -> void:
	var table := DB.loot_table(str(def.get("loot", "")))
	if table.is_empty() or GameState.game == null:
		return
	var lr := RandomNumberGenerator.new()
	lr.seed = hash([GameState.seed, serial, kind, "loot"])
	for e in Loot.roll(table, lr):
		var id := str(e.get("id", ""))
		var count := int(e.get("count", 0))
		if id == "" or count <= 0:
			continue
		var p := global_position + Vector3(lr.randf_range(-0.5, 0.5), 0.6, lr.randf_range(-0.5, 0.5))
		Pickup.spawn(id, count, p, Vector3(lr.randf_range(-1.5, 1.5), 3.0, lr.randf_range(-1.5, 1.5)))


# --- Fading, retreat, sounds -------------------------------------------------------------

func fade_in(time: float) -> void:
	_fade = 1.0
	_fade_target = 0.0
	_fade_speed = 1.0 / maxf(time, 0.05)


func fade_out(time: float) -> void:
	_fade_target = 1.0
	_fade_speed = 1.0 / maxf(time, 0.05)


func fade_amount() -> float:
	return _fade


## Dawn (or a despawn): run away from the player and dissolve, then free.
func retreat(fade_time: float = -1.0) -> void:
	if retreating or dying:
		return
	retreating = true
	_attack_phase = 0
	var away := global_position
	var t := target()
	if t:
		away = global_position - t.global_position
	away.y = 0.0
	if away.length() < 0.1:
		away = Vector3(rng.randf_range(-1.0, 1.0), 0.0, rng.randf_range(-1.0, 1.0))
	_retreat_dir = away.normalized()
	fade_out(fade_time if fade_time > 0.0 else rng.randf_range(2.2, 3.8))


## Positional sound, throttled per id across all monsters.
func play_sound(id: String, gap: float = 1.0, volume_db: float = 0.0, caption_text: String = "") -> void:
	var now := Time.get_ticks_msec()
	if int(_sound_gate.get(id, 0)) > now:
		return
	_sound_gate[id] = now + int(gap * 1000.0)
	Audio.play(id, global_position + Vector3.UP * 1.6, volume_db)
	if caption_text != "":
		Events.caption.emit(caption_text)


## 0..1 how threatening this monster is right now (drives Audio.set_danger).
func threat_level() -> float:
	return 0.0


func state_name() -> String:
	return str(state)
