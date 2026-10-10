class_name Player
extends CharacterBody3D
## The player: movement, camera, interaction, tools and weapons, survival,
## damage, footsteps and resting.
##
## Public API (docs/ARCHITECTURE.md "Player public API"):
##   teleport(pos), look_at_point(p), use_item(), interact_nearest() -> bool,
##   get_interact_target() -> Node3D, get_interact_text_full() -> {text, hint, key},
##   is_sheltered(), is_resting(), is_alive(), take_damage(amount, source, kind),
##   is_aiming_gun(), toggle_flashlight(), drop_selected(n),
##   get_flashlight_charge() -> 0..1, is_flashlight_on(), get_torch_fraction() -> 0..1
##   add_look_input(delta) (touch camera drag, radians), aim_assist() -> bool
##   (touch: turn toward the nearest tree/creature in front before Use)
##   var camera: Camera3D, var resting: bool (set by the tent), var team = "player"
##
## Physics: layer 2 (player), mask 1 (world) + 4 (trees).

const DEEP_WATER := 0.9
const BOUNDS_MARGIN := 4.0
const HEAD := Vector3(0.0, 1.75, 0.0)

var camera: Camera3D
var rig: CameraRig
var model: CharacterModel
var team := "player"
## Set by the tent / benches; the character sits until the player moves.
var resting := false:
	set(v):
		if v == resting:
			return
		resting = v
		if model:
			if v:
				model.play_action("sit")
			elif model.current_action() == "sit":
				model.stop_action()

var _gen: WorldGen
var _move_v := Vector3.ZERO
var _knock := Vector3.ZERO
var _sprint_on := false
var _sprinting := false
var _coyote := 0.0
var _jump_buffer := 0.0
var _use_cd := 0.0
var _invuln := 0.0
var _interact_target: Node3D = null
var _interact_text := ""
var _interact_hint := ""
var _scan_t := 0.0
var _last_pos := Vector3.ZERO
var _held_id := ""
var _model_yaw := 0.0
var _face_cam_t := 0.0
var _pending: Dictionary = {}
var _pending_t := 0.0
var _pending_shot: Dictionary = {}
var _flash_on := false
var _flash_slot_ref: Variant = null
var _flash_write_t := 0.0
var _flash_source: HeldLightSource = null
var _torch_time := 0.0
var _torch_max := 1.0
var _torch_node: Node3D = null
var _torch_light: OmniLight3D = null
var _torch_source: HeldLightSource = null
var _burst_source: HeldLightSource = null
var _burst_t := 0.0
var _drop_holding := false
var _drop_t := 0.0
var _drop_done := false
var _dead_done := false
var _was_blocking := true
var _sheltered := false
var _shelter: Node = null
var _shelter_t := 0.0
var _throttle: Dictionary = {}
var _tree_evt: Dictionary = {"hit": false, "chop": false}
var _rng := RandomNumberGenerator.new()
var _headless := false
## Set by the touch controls while their RUN toggle is on.
var touch_sprint := false
## Touch aim assist: the swing direction for the next Use (cleared after it).
var _assist_dir := Vector3.ZERO
var _assist_t := 0.0
var _time := 0.0
# Movement tunables (balance.player), cached at setup.
var _walk := 5.0
var _sprint := 8.2
var _accel := 30.0
var _air := 0.35
var _gravity := 18.0
var _jump := 5.6
var _turn := 12.0


func setup(game: Game) -> void:
	GameState.player = self
	name = "Player"
	_gen = game.gen if game else GameState.world_gen
	_headless = DisplayServer.get_name() == "headless"
	_rng.seed = GameState.seed * 31 + 7
	_walk = DB.bf("player.walk_speed", 5.0)
	_sprint = DB.bf("player.sprint_speed", 8.2)
	_accel = DB.bf("player.acceleration", 30.0)
	_air = DB.bf("player.air_control", 0.35)
	_gravity = DB.bf("player.gravity", 18.0)
	_jump = DB.bf("player.jump_velocity", 5.6)
	_turn = DB.bf("player.turn_speed", 12.0)
	collision_layer = 2
	collision_mask = 1 | 8
	floor_snap_length = 0.45
	floor_max_angle = deg_to_rad(52.0)
	floor_constant_speed = true
	safe_margin = 0.01
	var col := CollisionShape3D.new()
	col.name = "Collision"
	var cap := CapsuleShape3D.new()
	cap.radius = 0.33
	cap.height = 1.64
	col.shape = cap
	col.position.y = 0.82
	add_child(col)
	add_to_group("player")
	add_to_group("damageable")

	model = CharacterModel.new()
	model.apply_look(Profile.look)
	add_child(model)
	model.action_hit.connect(_on_action_hit)
	model.footstep.connect(_on_footstep)

	rig = CameraRig.new()
	rig.target = self
	add_child(rig)
	camera = rig.camera

	_burst_source = HeldLightSource.new()
	_burst_source.name = "BurstLight"
	_burst_source.position = Vector3(0.0, 1.1, 0.0)
	_burst_source.reach = 5.5
	_burst_source.strength = 0.8
	add_child(_burst_source)

	var start := Vector3(3.0, 0.0, 4.0)
	if _gen:
		start = _gen.ground(start, 0.05)
	teleport(start)
	look_at_point(Vector3(0.0, start.y + 0.6, 0.0))

	Events.selected_slot_changed.connect(_on_selection_changed)
	Events.inventory_changed.connect(_on_inventory_changed)
	Events.camera_shake.connect(_on_camera_shake)
	Events.float_text.connect(_on_float_text)
	Events.tree_hit.connect(_on_tree_hit_evt)
	Events.tree_chopped.connect(_on_tree_chopped_evt)
	Profile.look_changed.connect(_on_look_changed)
	_refresh_held()
	_capture_mouse()


func _exit_tree() -> void:
	if GameState.player == self:
		GameState.player = null


# --- Public API ------------------------------------------------------------------------------

func teleport(pos: Vector3) -> void:
	global_position = pos
	velocity = Vector3.ZERO
	_move_v = Vector3.ZERO
	_knock = Vector3.ZERO
	_last_pos = pos
	if is_inside_tree():
		reset_physics_interpolation()
	if rig:
		rig.snap()


## Turn body and camera to face a point.
func look_at_point(p: Vector3) -> void:
	var d := p - global_position
	if Vector2(d.x, d.z).length() < 0.001:
		return
	var yaw := atan2(-d.x, -d.z)
	_model_yaw = yaw
	if model:
		model.rotation.y = yaw
	if rig:
		rig.yaw = yaw
		var hd := Vector2(d.x, d.z).length()
		rig.pitch = clampf(atan2(d.y - 1.5, maxf(hd, 0.1)) - 0.1, -0.9, 0.3)
		rig.snap()


func is_sheltered() -> bool:
	return _sheltered


func is_resting() -> bool:
	return resting


func is_alive() -> bool:
	return not GameState.survival.dead


func is_aiming_gun() -> bool:
	if not GameState.is_playing() or GameState.ui_blocking or GameState.survival.dead:
		return false
	var id := GameState.selected_item_id()
	return DB.item_kind(id) == "weapon" and str(DB.item(id).get("weapon", "")) == "gun"


func is_flashlight_on() -> bool:
	return _flash_on


## Charge (0..1) of the selected flashlight, or the first one in the sack; -1 if none.
func get_flashlight_charge() -> float:
	var inv := GameState.inventory
	var idx := GameState.selected_slot if inv.slot_id(GameState.selected_slot) == "flashlight" else _first_slot("flashlight")
	if idx < 0:
		return -1.0
	return _slot_charge(idx) / _charge_max()


## Remaining burn of the lit torch (0..1); 0 when none is burning.
func get_torch_fraction() -> float:
	return clampf(_torch_time / maxf(_torch_max, 0.001), 0.0, 1.0) if _torch_time > 0.0 else 0.0


func get_interact_target() -> Node3D:
	_scan_interactables()
	return _interact_target


## {text, hint, key} for the HUD prompt. text "" means nothing to do;
## hint explains what is missing (shown greyed out).
func get_interact_text_full() -> Dictionary:
	return {"text": _interact_text, "hint": _interact_hint, "key": Controls.prompt("interact")}


func interact_nearest() -> bool:
	if not GameState.is_playing() or GameState.survival.dead:
		return false
	_scan_interactables()
	if _interact_target == null or _interact_text == "":
		if _interact_hint != "":
			Audio.play("deny", global_position, -8.0)
		return false
	if resting and not _interact_target.is_in_group("shelter"):
		resting = false
	_turn_toward(_interact_target.global_position)
	if model.current_action() == "":
		model.play_action("interact")
	_interact_target.call("interact", self)
	_scan_t = 0.0
	return true


## Touch camera drag (radians): forwarded to the camera rig.
func add_look_input(delta: Vector2) -> void:
	if rig:
		rig.add_look_input(delta)


## Touch aim assist: if a choppable tree (when holding an axe) or a creature
## (axe or melee weapon) is within reach and roughly in front of the camera,
## ease the camera toward it and aim the next swing at it. Returns true when
## it found a target. Aiming with a thumb is hard; this keeps chopping and
## whacking forgiving for kids.
func aim_assist(max_angle_deg: float = 60.0) -> bool:
	if not GameState.is_playing() or GameState.survival.dead or rig == null:
		return false
	var id := GameState.selected_item_id()
	var kind := DB.item_kind(id)
	var def := DB.item(id)
	var melee := kind == "weapon" and str(def.get("weapon", "")) == "melee"
	if kind != "tool" and not melee:
		return false
	var reach := float(def.get("reach", 2.4))
	var origin := global_position
	var look := rig.flat_forward()
	var half := deg_to_rad(max_angle_deg)
	var best := Vector3.INF
	var best_score := INF
	# Creatures first (both axes and weapons hit them).
	for n in get_tree().get_nodes_in_group("damageable"):
		if n == self or not (n is Node3D) or not is_instance_valid(n):
			continue
		var tm := str(n.get("team"))
		if tm != "monster" and tm != "wildlife":
			continue
		if n.has_method("is_alive") and not bool(n.call("is_alive")):
			continue
		var tp := (n as Node3D).global_position
		var to := Vector3(tp.x - origin.x, 0.0, tp.z - origin.z)
		var d := to.length()
		if d - _num(n, "hit_radius", 0.5) > reach + 1.2 or absf(tp.y - origin.y) > 2.5 or d < 0.05:
			continue
		var ang := look.angle_to(to / d)
		if ang > half:
			continue
		var score := d + ang * 2.0
		if score < best_score:
			best_score = score
			best = tp
	if best == Vector3.INF and kind == "tool":
		var veg: Node = GameState.vegetation
		if veg and is_instance_valid(veg) and veg.has_method("find_tree"):
			var tid := int(veg.call("find_tree", origin + look * (reach * 0.5), reach + 1.0))
			if tid >= 0:
				var info := _tree_info(veg, tid)
				if bool(info.get("alive", true)):
					var tp: Vector3 = info.get("pos", origin)
					var to := Vector3(tp.x - origin.x, 0.0, tp.z - origin.z)
					var d := to.length()
					var big := 2.6 if str(info.get("kind", "")) == "giant" else 0.0
					if d > 0.05 and d < reach + 1.4 + big and look.angle_to(to / d) <= half:
						best = tp
	if best == Vector3.INF:
		return false
	var dir := Vector3(best.x - origin.x, 0.0, best.z - origin.z).normalized()
	_assist_dir = dir
	_assist_t = 0.5
	rig.assist_yaw(atan2(-dir.x, -dir.z))
	return true


## Same as one press of Use.
func use_item() -> void:
	if not GameState.is_playing() or GameState.survival.dead:
		return
	if _use_cd > 0.0:
		return
	var id := GameState.selected_item_id()
	if id == "":
		return
	if resting:
		resting = false
	var def := DB.item(id)
	match str(def.get("kind", "")):
		"tool":
			_swing_tool(id, def)
		"weapon":
			if str(def.get("weapon", "")) == "gun":
				_fire_gun(id, def)
			else:
				_swing_melee(id, def)
		"food":
			_eat(id, def)
		"medical":
			_heal(id, def)
		"light":
			if str(def.get("light", "")) == "flashlight":
				toggle_flashlight()
				_use_cd = 0.25
			else:
				_light_torch(def)
		"resource":
			if id == "battery":
				_use_battery()


## Drop n of the selected stack in front of the player.
func drop_selected(n: int = 1) -> void:
	var inv := GameState.inventory
	var idx := GameState.selected_slot
	var slot: Variant = inv.get_slot(idx)
	if slot == null:
		return
	if _flash_on and is_same(slot, _flash_slot_ref):
		_set_flashlight(false)
	var taken := inv.take_from_slot(idx, mini(n, int(slot["count"])))
	if taken.is_empty():
		return
	var fwd := _forward()
	var pos := global_position + fwd * 0.55 + Vector3(0.0, 1.15, 0.0)
	var p := Pickup.spawn(str(taken["id"]), int(taken["count"]), pos, fwd * 1.7 + Vector3(0.0, 2.4, 0.0))
	if p == null:
		inv.add(str(taken["id"]), int(taken["count"]), taken.get("meta", {}))
		return
	p.meta = (taken.get("meta", {}) as Dictionary).duplicate(true)
	p.block_auto_pickup(2.0)
	model.play_action("interact", 1.5)
	Audio.play("swing", global_position, -10.0)


func toggle_flashlight() -> void:
	if not GameState.is_playing() or GameState.survival.dead:
		return
	if _flash_on:
		_set_flashlight(false)
		return
	var idx := GameState.selected_slot if GameState.selected_item_id() == "flashlight" else _best_flashlight_slot()
	if idx < 0:
		_notify_throttled("noflash", "You don't have a flashlight yet.", "info")
		return
	if _slot_charge(idx) <= 0.01:
		_notify_throttled("flashempty", "Flashlight battery is empty! Use a Battery to recharge it.", "warn")
		Audio.play("click_empty", global_position)
		if idx != GameState.selected_slot:
			GameState.select_slot(idx)
		return
	if idx != GameState.selected_slot:
		GameState.select_slot(idx)
	_set_flashlight(true)


func take_damage(amount: float, source: Node = null, kind: String = "") -> void:
	if not GameState.is_playing() or GameState.survival.dead:
		return
	if Dev.god_mode or amount <= 0.0 or _invuln > 0.0:
		return
	_invuln = DB.bf("player.invulnerable_after_hit", 0.45)
	if resting:
		resting = false
	var cause := kind if kind != "" else "monster"
	if source and source.get("enemy_id") != null:
		cause = str(source.get("enemy_id"))
	var applied := GameState.survival.damage(amount, cause)
	var from := global_position - _forward()
	if source is Node3D and is_instance_valid(source):
		from = (source as Node3D).global_position
	var away := global_position - from
	away.y = 0.0
	if away.length_squared() < 0.0001:
		away = -_forward()
	_knock = away.normalized() * clampf(3.5 + amount * 0.18, 3.5, 9.5)
	if is_on_floor():
		velocity.y = 2.4
	model.play_action("hurt")
	model.flash(1.0)
	Events.player_damaged.emit(applied, kind)
	Events.camera_shake.emit(clampf(0.25 + amount / 40.0, 0.2, 0.8))
	Audio.play("player_hurt", global_position)


## Screenshot / test helper: freeze the character in a pose.
## opts: {speed, phase, action, u, item, torch (bool), lit (bool), aim (bool), yaw}
func debug_pose(opts: Dictionary) -> void:
	if opts.has("item"):
		model.set_held_item(str(opts["item"]))
		_held_id = "__debug__"
		if bool(opts.get("lit", false)):
			ItemModels.set_lit(model.held_node(), true)
	if bool(opts.get("torch", false)):
		_ensure_torch_node()
		ItemModels.set_lit(_torch_node, true)
	if opts.has("aim"):
		model.set_aim(bool(opts["aim"]), 0.0)
	if opts.has("yaw"):
		_model_yaw = float(opts["yaw"])
		model.rotation.y = _model_yaw
	model.debug_freeze(opts)


## Undo debug_pose(): live animation, real held item, no fake torch.
func debug_clear() -> void:
	model.debug_unfreeze()
	if model.current_action() != "" and model.current_action() != "die":
		model.stop_action()
	if _torch_time <= 0.0 and _torch_node and is_instance_valid(_torch_node):
		model.set_left_item(null)
		_torch_node = null
		_torch_light = null
		_torch_source = null
	_refresh_held()


# --- Frame update ----------------------------------------------------------------------------

func _process(_delta: float) -> void:
	if _headless:
		return
	var blocking := GameState.ui_blocking or not GameState.is_playing() or GameState.survival.dead
	if _was_blocking and not blocking:
		_capture_mouse()
	_was_blocking = blocking


func _physics_process(delta: float) -> void:
	_time += delta
	var playing := GameState.is_playing()
	var dead := GameState.survival.dead
	if dead and not _dead_done:
		_on_death()
	var can_act := playing and not GameState.ui_blocking and not dead
	rig.input_enabled = can_act

	# --- Movement input
	var mv := Vector2.ZERO
	if can_act:
		mv = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if resting and mv.length() > 0.25:
		resting = false
	if resting:
		mv = Vector2.ZERO
	if bool(Settings.get_value("hold_to_sprint")):
		_sprint_on = can_act and Input.is_action_pressed("sprint")
	elif mv.length() < 0.1:
		_sprint_on = false
	if touch_sprint and can_act:
		_sprint_on = true
	_sprinting = _sprint_on and mv.length() > 0.3
	var speed := _sprint if _sprinting else _walk
	var dir := Vector3(mv.x, 0.0, mv.y).rotated(Vector3.UP, rig.yaw)
	var target_v := dir * speed
	var accel := _accel
	if not is_on_floor():
		accel *= _air
	if target_v.length() < _move_v.length():
		accel *= 1.5
	if dead:
		target_v = Vector3.ZERO
	_move_v = _move_v.move_toward(target_v, accel * delta)
	_move_v = _constrain(_move_v)
	_knock = _knock.move_toward(Vector3.ZERO, 16.0 * delta)
	velocity.x = _move_v.x + _knock.x
	velocity.z = _move_v.z + _knock.z

	# --- Jump & gravity
	if is_on_floor():
		_coyote = 0.12
	else:
		_coyote -= delta
	_jump_buffer -= delta
	if can_act and Input.is_action_just_pressed("jump"):
		_jump_buffer = 0.15
		if resting:
			resting = false
	if _jump_buffer > 0.0 and _coyote > 0.0:
		velocity.y = _jump
		_jump_buffer = 0.0
		_coyote = 0.0
	elif not is_on_floor():
		velocity.y -= _gravity * delta
	move_and_slide()
	_keep_above_terrain()

	# --- Facing & animation
	_face_cam_t -= delta
	var want := _model_yaw
	if is_aiming_gun() or _face_cam_t > 0.0 or _flash_on:
		want = rig.yaw
	elif _move_v.length() > 0.4:
		want = atan2(-_move_v.x, -_move_v.z)
	_model_yaw = lerp_angle(_model_yaw, want, 1.0 - exp(-_turn * delta))
	model.rotation.y = _model_yaw
	var hspeed := Vector2(velocity.x, velocity.z).length()
	model.set_locomotion(hspeed if is_on_floor() else 0.0, is_on_floor() or _coyote > 0.0)
	var rel := wrapf(rig.yaw - _model_yaw, -PI, PI)
	model.set_look(rel, rig.pitch * 0.6 + 0.12, absf(rel) < 1.7 and hspeed < 0.5 and not dead)
	model.set_aim(is_aiming_gun(), rig.pitch * 0.9)
	model.visible = rig.current_distance() > 0.6
	rig.sprinting = _sprinting and hspeed > 5.5
	rig.aiming = is_aiming_gun()

	# --- Timers, use, interaction
	_use_cd -= delta
	_assist_t -= delta
	_invuln -= delta
	if can_act and _use_cd <= 0.0 and Input.is_action_pressed("use"):
		var kind := DB.item_kind(GameState.selected_item_id())
		if kind == "tool" or (kind == "weapon" and str(DB.item(GameState.selected_item_id()).get("weapon", "")) == "melee"):
			use_item()
	if _drop_holding:
		_drop_t += delta
		if _drop_t > 0.5 and not _drop_done:
			_drop_done = true
			drop_selected(9999)
	if not _pending.is_empty():
		_pending_t -= delta
		if _pending_t < -0.3:
			_resolve_pending()
	if not _pending_shot.is_empty():
		var shot := _pending_shot
		_pending_shot = {}
		_resolve_shot(str(shot["id"]))
	_scan_t -= delta
	if _scan_t <= 0.0:
		_scan_t = 0.1
		_scan_interactables()
	_update_flashlight(delta)
	_update_torch(delta)
	if _burst_t > 0.0:
		_burst_t -= delta
		if _burst_t <= 0.0:
			_burst_source.active = false

	# --- Survival, stats, shader globals
	if playing and not dead:
		_shelter_t -= delta
		if _shelter_t <= 0.0:
			_shelter_t = 0.2
			_update_shelter()
		GameState.survival.tick(delta * GameState.time_scale, _survival_env())
		var moved := Vector2(global_position.x - _last_pos.x, global_position.z - _last_pos.z).length()
		if moved > 0.0005 and moved < 2.0:
			GameState.stat_add("distance", moved)
	_last_pos = global_position
	RenderingServer.global_shader_parameter_set("player_position", global_position)


func _unhandled_input(event: InputEvent) -> void:
	if not GameState.is_playing() or GameState.ui_blocking or GameState.survival.dead:
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and not _headless \
			and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not Platform.is_touch() \
			and event.device != InputEvent.DEVICE_ID_EMULATION:
		_capture_mouse()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("use"):
		use_item()
	elif event.is_action_pressed("interact"):
		interact_nearest()
	elif event.is_action_pressed("flashlight"):
		toggle_flashlight()
	elif event.is_action_pressed("next_item"):
		GameState.select_slot(GameState.selected_slot + 1)
	elif event.is_action_pressed("prev_item"):
		GameState.select_slot(GameState.selected_slot - 1)
	elif event.is_action_pressed("drop_item"):
		_drop_holding = true
		_drop_t = 0.0
		_drop_done = false
	elif event.is_action_released("drop_item"):
		if _drop_holding and not _drop_done:
			drop_selected(1)
		_drop_holding = false
	elif event.is_action_pressed("sprint") and not bool(Settings.get_value("hold_to_sprint")):
		_sprint_on = not _sprint_on
	else:
		for i in 7:
			if event.is_action_pressed("slot_%d" % (i + 1)):
				if i < GameState.inventory.capacity:
					GameState.select_slot(i)
				break


# --- Movement helpers -------------------------------------------------------------------------

func _forward() -> Vector3:
	return Vector3(-sin(_model_yaw), 0.0, -cos(_model_yaw))


## Camera forward on the ground plane (where attacks go), or the touch aim
## assist's target direction right after aim_assist().
func _aim_flat_dir() -> Vector3:
	if _assist_t > 0.0 and _assist_dir != Vector3.ZERO:
		_assist_t = 0.0
		return _assist_dir
	return rig.flat_forward() if rig else _forward()


func _turn_toward(p: Vector3) -> void:
	var d := p - global_position
	if Vector2(d.x, d.z).length() > 0.05:
		_model_yaw = lerp_angle(_model_yaw, atan2(-d.x, -d.z), 0.6)


## Keep out of deep water and inside the playable square (gentle push back).
func _constrain(v: Vector3) -> Vector3:
	if _gen == null:
		return v
	var p := global_position
	var here := _gen.water_depth(p.x, p.z)
	if v.length_squared() > 0.0001:
		var ahead := p + v.normalized() * 0.75
		var d_ahead := _gen.water_depth(ahead.x, ahead.z)
		if d_ahead > DEEP_WATER and d_ahead >= here:
			var g := _depth_gradient(p)
			if g.length_squared() > 0.0001:
				var into := v.dot(g)
				if into > 0.0:
					v -= g * into
			else:
				v = Vector3.ZERO
	if here > DEEP_WATER:
		v -= _depth_gradient(p) * 2.5
	var lim := WorldGen.PLAYABLE_HALF - BOUNDS_MARGIN
	for axis in [0, 2]:
		var c: float = p[axis]
		if absf(c) > lim:
			var out := signf(c)
			var over := absf(c) - lim
			if v[axis] * out > 0.0:
				v[axis] *= maxf(0.0, 1.0 - over / BOUNDS_MARGIN)
			v[axis] -= out * minf(over, BOUNDS_MARGIN) * 1.5
	return v


func _depth_gradient(p: Vector3) -> Vector3:
	var e := 0.6
	var gx := _gen.water_depth(p.x + e, p.z) - _gen.water_depth(p.x - e, p.z)
	var gz := _gen.water_depth(p.x, p.z + e) - _gen.water_depth(p.x, p.z - e)
	var g := Vector3(gx, 0.0, gz)
	return g.normalized() if g.length_squared() > 1e-8 else Vector3.ZERO


func _keep_above_terrain() -> void:
	if _gen == null:
		return
	var p := global_position
	var h := _gen.height_at(p.x, p.z)
	if p.y < h - 0.6:
		global_position.y = h + 0.05
		velocity.y = 0.0


# --- Interaction ---------------------------------------------------------------------------------

func _scan_interactables() -> void:
	var best: Node3D = null
	var best_score := INF
	var best_text := ""
	var best_hint := ""
	var origin := global_position
	var fwd := _forward()
	var look := rig.flat_forward() if rig else fwd
	var default_r := DB.bf("player.interact_radius", 2.6)
	for n in get_tree().get_nodes_in_group("interactable"):
		if not (n is Node3D) or not is_instance_valid(n) or not (n as Node).is_inside_tree():
			continue
		var n3 := n as Node3D
		var p: Vector3 = n3.call("get_interact_point") if n3.has_method("get_interact_point") else n3.global_position
		var r_v: Variant = n3.get("interact_radius")
		var r := float(r_v) if r_v != null else default_r
		var to := p - origin
		if absf(to.y) > 3.0:
			continue
		to.y = 0.0
		var d := to.length()
		if d > r:
			continue
		var text := str(n3.call("get_interact_text", self)) if n3.has_method("get_interact_text") else ""
		var hint := ""
		if text == "" and n3.has_method("get_interact_hint"):
			hint = str(n3.call("get_interact_hint", self))
		if text == "" and hint == "":
			continue
		var dirv := to / d if d > 0.01 else fwd
		var facing := fwd.dot(dirv)
		var looking := look.dot(dirv)
		if d > 1.1 and facing < -0.2 and looking < 0.2:
			continue
		var score := d / maxf(r, 0.1) + (1.0 - facing) * 0.3 + (1.0 - looking) * 0.45
		if text == "":
			score += 0.6
		if score < best_score:
			best_score = score
			best = n3
			best_text = text
			best_hint = hint
	_interact_target = best
	_interact_text = best_text
	_interact_hint = best_hint


# --- Using items -------------------------------------------------------------------------------

func _swing_tool(id: String, def: Dictionary) -> void:
	var cd := float(def.get("cooldown", 0.6))
	_use_cd = cd
	var speed := clampf(0.62 / maxf(cd, 0.1), 0.8, 1.6)
	model.play_action("chop", speed)
	_pending = {"kind": "chop", "id": id, "dir": _aim_flat_dir()}
	_pending_t = CharacterModel.hit_delay("chop", speed)
	_face_cam_t = 0.7
	Audio.play("swing", global_position, -6.0)
	Events.tool_swung.emit(id)


func _swing_melee(id: String, def: Dictionary) -> void:
	var cd := float(def.get("cooldown", 0.55))
	_use_cd = cd
	var speed := clampf(0.5 / maxf(cd, 0.1), 0.8, 1.6)
	model.play_action("swing", speed)
	_pending = {"kind": "swing", "id": id, "dir": _aim_flat_dir()}
	_pending_t = CharacterModel.hit_delay("swing", speed)
	_face_cam_t = 0.7
	Audio.play("swing", global_position, -4.0)
	Events.tool_swung.emit(id)


func _on_action_hit(action_name: String) -> void:
	if not _pending.is_empty() and str(_pending.get("kind", "")) == action_name:
		_resolve_pending()


func _resolve_pending() -> void:
	var p := _pending
	_pending = {}
	if p.is_empty() or GameState.survival.dead:
		return
	var id := str(p.get("id", ""))
	var dir: Vector3 = p.get("dir", _forward())
	if str(p.get("kind", "")) == "chop":
		_resolve_chop(id, dir)
	else:
		var def := DB.item(id)
		var hits := _melee_hit(id, def, dir, float(def.get("arc_deg", 100.0)))
		if bool(def.get("light_burst", false)):
			_light_burst()
		if hits > 0 and id == "wooden_bat":
			Events.float_text.emit(global_position + dir * 1.4 + Vector3(0, 1.5, 0), "Bonk!", Color(1.0, 0.9, 0.5))


func _resolve_chop(id: String, dir: Vector3) -> void:
	var def := DB.item(id)
	var reach := float(def.get("reach", 2.4))
	var origin := global_position
	var veg: Node = GameState.vegetation
	if veg and is_instance_valid(veg) and veg.has_method("find_tree") and veg.has_method("hit_tree"):
		var tid := _find_tree(veg, origin, dir, reach)
		if tid >= 0:
			var info: Dictionary = _tree_info(veg, tid)
			var tpos: Vector3 = info.get("pos", origin + dir * 1.2)
			var tkind := str(info.get("kind", "regular"))
			var can_giant := bool(def.get("giant", false))
			var before := int(GameState.stats.get("trees_chopped", 0))
			_tree_evt = {"hit": false, "chop": false}
			var res_v: Variant = veg.call("hit_tree", tid, int(def.get("chop_power", 1)), can_giant, origin)
			var res: Dictionary = res_v if res_v is Dictionary else {}
			var to := Vector3(tpos.x - origin.x, 0.0, tpos.z - origin.z)
			var hit_pos := origin + Vector3(0.0, 1.1, 0.0) + to.normalized() * maxf(to.length() - 0.4, 0.5)
			if bool(res.get("ok", false)):
				Audio.play("chop", hit_pos)
				Events.camera_shake.emit(0.1)
				if bool(res.get("felled", false)):
					if int(GameState.stats.get("trees_chopped", 0)) == before:
						GameState.stat_add("trees_chopped")
					if not bool(_tree_evt["chop"]):
						Events.tree_chopped.emit(tpos, tkind)
				elif not bool(_tree_evt["hit"]):
					Events.tree_hit.emit(hit_pos, tkind)
			else:
				HitFx.puff(hit_pos, Color(0.9, 0.8, 0.55))
				Audio.play("hit", hit_pos, -4.0)
				if tkind == "giant" and not can_giant:
					_notify_throttled("elder", "This Elder Tree is too tough! Only the Mega Axe can fell it.", "warn", 5.0)
				elif str(res.get("reason", "")) != "" and bool(info.get("alive", true)):
					_notify_throttled("treefail", str(res.get("reason")).capitalize(), "info", 5.0)
			return
	_melee_hit(id, def, dir, 100.0)


func _tree_info(veg: Node, tid: int) -> Dictionary:
	if not veg.has_method("tree_info"):
		return {}
	var v: Variant = veg.call("tree_info", tid)
	return v if v is Dictionary else {}


func _find_tree(veg: Node, origin: Vector3, dir: Vector3, reach: float) -> int:
	var tid := int(veg.call("find_tree", origin + dir * (reach * 0.55), reach * 0.8))
	if tid >= 0 and _tree_in_front(veg, tid, origin, dir, reach + 0.6):
		return tid
	tid = int(veg.call("find_tree", origin, reach + 0.4))
	if tid >= 0 and _tree_in_front(veg, tid, origin, dir, reach + 0.6):
		return tid
	# Elder Trees have very thick trunks: look a little further ahead.
	tid = int(veg.call("find_tree", origin + dir * 2.0, reach + 2.5))
	if tid >= 0 and str(_tree_info(veg, tid).get("kind", "")) == "giant" and _tree_in_front(veg, tid, origin, dir, reach + 3.6):
		return tid
	return -1


func _tree_in_front(veg: Node, tid: int, origin: Vector3, dir: Vector3, max_d: float) -> bool:
	var info := _tree_info(veg, tid)
	if info.is_empty():
		return true
	if not bool(info.get("alive", true)):
		return false
	var tp: Vector3 = info.get("pos", origin)
	var to := Vector3(tp.x - origin.x, 0.0, tp.z - origin.z)
	var d := to.length()
	if d > max_d:
		return false
	if d < 0.9:
		return true
	return dir.dot(to / d) > 0.34


## Hit monsters/wildlife in an arc in front. Returns the number hit.
func _melee_hit(id: String, def: Dictionary, dir: Vector3, arc_deg: float) -> int:
	var reach := float(def.get("reach", 2.4))
	var dmg := float(def.get("damage", 10.0))
	var kb := float(def.get("knockback", 3.0))
	var origin := global_position
	var half := deg_to_rad(arc_deg * 0.5)
	var hits := 0
	for n in get_tree().get_nodes_in_group("damageable"):
		if n == self or not (n is Node3D) or not is_instance_valid(n):
			continue
		var tm := str(n.get("team"))
		if tm != "monster" and tm != "wildlife":
			continue
		if n.has_method("is_alive") and not bool(n.call("is_alive")):
			continue
		var tpos := (n as Node3D).global_position
		var to := Vector3(tpos.x - origin.x, 0.0, tpos.z - origin.z)
		var r := _num(n, "hit_radius", 0.5)
		var d := to.length()
		if d - r > reach or absf(tpos.y - origin.y) > 2.5:
			continue
		if d > 0.35 and dir.angle_to(to / d) > half:
			continue
		n.call("take_damage", dmg, self, id)
		var push := (to / d if d > 0.01 else dir) * kb
		if n.has_method("apply_knockback"):
			n.call("apply_knockback", push)
		if n.has_method("flash_hit"):
			n.call("flash_hit")
		HitFx.burst(tpos + Vector3(0.0, _num(n, "hit_height", 1.4) * 0.6, 0.0) - (to / maxf(d, 0.01)) * r * 0.6,
			Color(1.0, 0.86, 0.5), 1.0)
		Audio.play("hit_enemy", tpos)
		Events.enemy_damaged.emit(_kind_of(n), dmg)
		hits += 1
	if hits > 0:
		Events.camera_shake.emit(0.16)
	return hits


func _fire_gun(id: String, def: Dictionary) -> void:
	var ammo := str(def.get("ammo", ""))
	if ammo != "" and GameState.inventory.count_of(ammo) <= 0:
		_use_cd = 0.35
		Audio.play("click_empty", global_position)
		_notify_throttled("ammo_" + ammo, "Out of %s! Look for more in chests." % DB.item_name(ammo), "warn")
		return
	if ammo != "":
		GameState.inventory.remove(ammo, 1)
	_use_cd = float(def.get("cooldown", 0.6))
	model.play_action("shoot")
	_face_cam_t = 0.8
	Audio.play("rifle_shot" if id == "rifle" else "gunshot", global_position)
	Events.camera_shake.emit(0.24 if id == "rifle" else 0.15)
	Events.tool_swung.emit(id)
	_pending_shot = {"id": id}


func _resolve_shot(id: String) -> void:
	var def := DB.item(id)
	var max_range := float(def.get("range", 40.0))
	var origin := rig.aim_origin()
	var dir := rig.aim_dir()
	var block := max_range
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * max_range, 1 | 8, [get_rid()])
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		block = origin.distance_to(hit["position"])
	var best: Node3D = null
	var best_t := block
	for n in get_tree().get_nodes_in_group("damageable"):
		if n == self or not (n is Node3D) or not is_instance_valid(n):
			continue
		var tm := str(n.get("team"))
		if tm != "monster" and tm != "wildlife":
			continue
		if n.has_method("is_alive") and not bool(n.call("is_alive")):
			continue
		var t := _ray_vs_upright(origin, dir, (n as Node3D).global_position, _num(n, "hit_radius", 0.55), _num(n, "hit_height", 1.6))
		if t > 0.0 and t < best_t:
			best_t = t
			best = n as Node3D
	var held := model.held_node()
	var muzzle_pos := global_position + Vector3(0.0, 1.3, 0.0) + _forward() * 0.6
	if held and is_instance_valid(held):
		muzzle_pos = held.global_transform * ItemModels.muzzle(id)
	HitFx.muzzle(muzzle_pos, dir)
	if best:
		var dmg := float(def.get("damage", 40.0))
		best.call("take_damage", dmg, self, id)
		var hp := origin + dir * best_t
		HitFx.burst(hp, Color(1.0, 0.82, 0.45), 1.2)
		Audio.play("hit_enemy", hp)
		Events.enemy_damaged.emit(_kind_of(best), dmg)
		if best.has_method("apply_knockback"):
			best.call("apply_knockback", Vector3(dir.x, 0.0, dir.z).normalized() * 2.0)
		if best.has_method("flash_hit"):
			best.call("flash_hit")
	elif not hit.is_empty():
		HitFx.puff(hit["position"])


## Distance along a ray to an upright capsule standing at base, or -1.
static func _ray_vs_upright(o: Vector3, d: Vector3, base: Vector3, r: float, h: float) -> float:
	var d2 := Vector2(d.x, d.z)
	var o2 := Vector2(o.x - base.x, o.z - base.z)
	var len2 := d2.length_squared()
	if len2 < 1e-6:
		return -1.0
	var tc := -o2.dot(d2) / len2
	if tc < 0.0:
		return -1.0
	var closest := (o2 + d2 * tc).length()
	if closest > r:
		return -1.0
	var dt := sqrt((r * r - closest * closest) / len2)
	for t in [maxf(tc - dt, 0.0), tc]:
		var y: float = o.y + d.y * float(t)
		if y >= base.y - 0.1 and y <= base.y + h:
			return float(t)
	return -1.0


func _eat(id: String, def: Dictionary) -> void:
	var s := GameState.survival
	var heal_amt := float(def.get("heal", 0.0))
	if s.hunger >= s.max_hunger - 1.0 and (heal_amt <= 0.0 or s.health >= s.max_health - 1.0):
		_notify_throttled("full", "You're full! Save it for later.", "info")
		_use_cd = 0.4
		return
	var taken := GameState.inventory.take_from_slot(GameState.selected_slot, 1)
	if taken.is_empty():
		return
	var res := s.eat(def, _rng.randf())
	model.play_action("eat")
	_use_cd = 0.9
	Audio.play("eat", global_position)
	Events.player_ate.emit(id)
	GameState.stat_add("food_eaten")
	var gained := float(res.get("food", 0.0))
	if gained >= 1.0:
		Events.float_text.emit(global_position + HEAD, "+%d Food" % roundi(gained), Color(1.0, 0.78, 0.4))
	if bool(res.get("sick", false)):
		Events.notify.emit("Tummy ache! Cook meat first next time.", "warn")
		Events.float_text.emit(global_position + HEAD + Vector3(0, 0.3, 0), "Ugh!", Color(0.7, 0.92, 0.5))
		model.flash(0.6)
		Events.player_damaged.emit(float(def.get("sick_damage", 5.0)), "sick")
		Audio.play("player_hurt", global_position, -6.0)


func _heal(_id: String, def: Dictionary) -> void:
	var s := GameState.survival
	if s.health >= s.max_health - 0.5:
		_notify_throttled("healthy", "You're already feeling great!", "info")
		_use_cd = 0.4
		return
	var taken := GameState.inventory.take_from_slot(GameState.selected_slot, 1)
	if taken.is_empty():
		return
	var amount := minf(float(def.get("heal", 25.0)), s.max_health - s.health)
	s.heal(amount)
	Events.player_healed.emit(amount)
	model.play_action("interact")
	_use_cd = 0.8
	Audio.play("pickup", global_position)
	Events.float_text.emit(global_position + HEAD, "+%d Health" % roundi(amount), Color(0.55, 1.0, 0.6))


func _use_battery() -> void:
	var inv := GameState.inventory
	var maxc := _charge_max()
	var best := -1
	var best_c := INF
	var any := false
	for i in inv.slots.size():
		if inv.slot_id(i) == "flashlight":
			any = true
			var c := _slot_charge(i)
			if c < maxc - 0.5 and c < best_c:
				best = i
				best_c = c
	if best < 0:
		_notify_throttled("battery", "Your flashlight is already full of power." if any else "No flashlight to recharge.", "info")
		_use_cd = 0.4
		return
	inv.take_from_slot(GameState.selected_slot, 1)
	inv.set_meta_value(best, "charge", maxc)
	_use_cd = 0.5
	model.play_action("interact")
	Audio.play("flashlight_on", global_position)
	Events.notify.emit("Flashlight recharged!", "good")
	Events.float_text.emit(global_position + HEAD, "Recharged!", Color(1.0, 0.95, 0.5))


# --- Flashlight -------------------------------------------------------------------------------

func _charge_max() -> float:
	return float(DB.item("flashlight").get("charge_max", 120.0))


func _slot_charge(i: int) -> float:
	var v: Variant = GameState.inventory.get_meta_value(i, "charge", null)
	return _charge_max() if v == null else float(v)


func _slot_index_of(ref: Variant) -> int:
	if ref == null:
		return -1
	var slots := GameState.inventory.slots
	for i in slots.size():
		if is_same(slots[i], ref):
			return i
	return -1


func _first_slot(id: String) -> int:
	var inv := GameState.inventory
	for i in inv.slots.size():
		if inv.slot_id(i) == id:
			return i
	return -1


func _best_flashlight_slot() -> int:
	var inv := GameState.inventory
	var best := -1
	var best_c := -1.0
	for i in inv.slots.size():
		if inv.slot_id(i) == "flashlight":
			var c := _slot_charge(i)
			if c > best_c:
				best = i
				best_c = c
	return best


func _set_flashlight(on: bool) -> void:
	if on == _flash_on:
		return
	_flash_on = on
	if on:
		_flash_slot_ref = GameState.inventory.get_slot(GameState.selected_slot)
		_flash_write_t = 1.0
	else:
		var idx := _slot_index_of(_flash_slot_ref)
		if idx >= 0:
			GameState.inventory.set_meta_value(idx, "charge", _slot_charge(idx))
		_flash_slot_ref = null
	Audio.play("flashlight_on" if on else "flashlight_off", global_position)
	_apply_flash_visual()


func _beam() -> SpotLight3D:
	var held := model.held_node() if model else null
	if held == null or not is_instance_valid(held):
		return null
	return held.get_node_or_null("Beam") as SpotLight3D


func _apply_flash_visual() -> void:
	var held := model.held_node() if model else null
	var beam := _beam()
	if held and is_instance_valid(held) and beam:
		ItemModels.set_lit(held, _flash_on)
		beam.shadow_enabled = not Settings.is_low_quality()
		if _flash_source == null or not is_instance_valid(_flash_source) or _flash_source.get_parent() != beam:
			_flash_source = HeldLightSource.new()
			_flash_source.name = "FearCone"
			_flash_source.mode = HeldLightSource.Mode.CONE
			_flash_source.reach = DB.bf("flashlight.range", 22.0)
			_flash_source.angle_deg = DB.bf("flashlight.angle_deg", 28.0)
			_flash_source.strength = DB.bf("flashlight.fear_strength", 0.9)
			beam.add_child(_flash_source)
		_flash_source.active = _flash_on
	elif _flash_source and is_instance_valid(_flash_source):
		_flash_source.active = false


func _update_flashlight(delta: float) -> void:
	if not _flash_on:
		return
	var inv := GameState.inventory
	var idx := GameState.selected_slot
	var slot: Variant = inv.get_slot(idx)
	if slot == null or not is_same(slot, _flash_slot_ref) or str(slot["id"]) != "flashlight" or GameState.survival.dead:
		_set_flashlight(false)
		return
	if not (slot as Dictionary).has("meta"):
		slot["meta"] = {}
	var meta: Dictionary = slot["meta"]
	var c := float(meta.get("charge", _charge_max()))
	c = maxf(c - DB.bf("flashlight.drain_per_second", 1.0) * delta * GameState.time_scale, 0.0)
	meta["charge"] = c
	_flash_write_t -= delta
	if _flash_write_t <= 0.0:
		_flash_write_t = 1.0
		inv.set_meta_value(idx, "charge", c)
	if c <= 0.0:
		_set_flashlight(false)
		Events.notify.emit("Your flashlight battery ran out!", "warn")
		return
	var beam := _beam()
	if beam:
		var aim_pt := camera.global_position + rig.aim_dir() * 24.0
		var to := aim_pt - beam.global_position
		if to.length_squared() > 0.01:
			beam.global_basis = Basis.looking_at(to.normalized(), Vector3.UP)
		# A gentle flicker when the battery is nearly empty.
		var low := c < _charge_max() * 0.12
		beam.light_energy = 3.2 * (0.75 + 0.25 * sin(_time * 23.0) if low else 1.0)


# --- Torch -----------------------------------------------------------------------------------

func _ensure_torch_node() -> void:
	if _torch_node and is_instance_valid(_torch_node):
		return
	_torch_node = ItemModels.build("torch")
	_torch_node.name = "LitTorch"
	model.set_left_item(_torch_node)
	_torch_light = _torch_node.get_node_or_null("FlameLight") as OmniLight3D
	_torch_source = HeldLightSource.new()
	_torch_source.name = "TorchGlow"
	_torch_source.position = Vector3(0.0, 0.6, 0.0)
	_torch_source.reach = DB.bf("torch.light_radius", 6.5)
	_torch_source.strength = DB.bf("torch.fear_strength", 0.6)
	_torch_node.add_child(_torch_source)


func _light_torch(def: Dictionary) -> void:
	if _torch_time > _torch_max * 0.3:
		_notify_throttled("torch", "Your torch is still burning bright.", "info")
		_use_cd = 0.4
		return
	var taken := GameState.inventory.take_from_slot(GameState.selected_slot, 1)
	if taken.is_empty():
		return
	_torch_max = float(def.get("burn_time", 90.0))
	_torch_time = _torch_max
	_ensure_torch_node()
	ItemModels.set_lit(_torch_node, true)
	if _torch_light:
		_torch_light.shadow_enabled = Settings.quality() == "high"
	_torch_source.active = true
	_use_cd = 0.6
	model.play_action("interact")
	Audio.play("fire_ignite", global_position)
	Events.notify.emit("Torch lit! It keeps the dark away for a while.", "good")


func _update_torch(delta: float) -> void:
	if _torch_time <= 0.0:
		return
	_torch_time -= delta * GameState.time_scale
	if _torch_light:
		var f := 0.85 + 0.1 * sin(_time * 13.0) + 0.05 * sin(_time * 31.0 + 1.3)
		var fade := clampf(_torch_time / (_torch_max * 0.15), 0.35, 1.0)
		_torch_light.light_energy = 1.8 * f * fade
	if _torch_time <= 0.0 or GameState.survival.dead:
		_extinguish_torch(not GameState.survival.dead)


func _extinguish_torch(notify: bool) -> void:
	_torch_time = 0.0
	if _torch_source:
		_torch_source.active = false
	if _torch_node and is_instance_valid(_torch_node):
		model.set_left_item(null)
	_torch_node = null
	_torch_light = null
	_torch_source = null
	if notify:
		Events.notify.emit("Your torch burned out.", "info")
		Audio.play("fire_out", global_position, -8.0)


func _light_burst() -> void:
	_burst_source.active = true
	_burst_t = 0.7
	HitFx.burst(global_position + Vector3(0.0, 1.2, 0.0) + _forward() * 0.9, Color(0.55, 0.9, 1.0), 1.3)


# --- Survival -------------------------------------------------------------------------------

func _update_shelter() -> void:
	_sheltered = false
	_shelter = null
	for n in get_tree().get_nodes_in_group("shelter"):
		if is_instance_valid(n) and n.has_method("contains") and n.call("contains", global_position) == true:
			_sheltered = true
			_shelter = n
			return


func _survival_env() -> Dictionary:
	var dc := GameState.day_cycle
	var amb: Variant = DB.b("survival.ambient", {})
	var a: Dictionary = amb if amb is Dictionary else {}
	var a_day := float(a.get("day", 78.0))
	var a_dusk := float(a.get("dusk", 52.0))
	var a_night := float(a.get("night", 8.0))
	var a_dawn := float(a.get("dawn", 40.0))
	var p := dc.phase_progress()
	var ambient := a_day
	match dc.phase:
		DayCycle.Phase.DAY:
			ambient = lerpf(a_day, a_dusk, smoothstep(0.85, 1.0, p))
		DayCycle.Phase.DUSK:
			ambient = lerpf(a_dusk, a_night, p)
		DayCycle.Phase.NIGHT:
			ambient = lerpf(a_night, a_dawn, smoothstep(0.9, 1.0, p))
		DayCycle.Phase.DAWN:
			ambient = lerpf(a_dawn, a_day, p)
	var heat := 0.0
	var fire: Node3D = GameState.campfire
	if fire and is_instance_valid(fire) and fire.has_method("heat_at"):
		heat = float(fire.call("heat_at", global_position))
	if _torch_time > 0.0:
		heat = maxf(heat, 0.15)
	var raining := false
	var envn: Node = GameState.environment
	if envn and is_instance_valid(envn):
		raining = envn.get("raining") == true
	var tent_warmth := 55.0
	var rest_mult := DB.bf("survival.tent_rest_regen_mult", 2.0)
	if _shelter and is_instance_valid(_shelter):
		if _shelter.has_method("tent_warmth"):
			tent_warmth = float(_shelter.call("tent_warmth"))
		if _shelter.has_method("rest_mult"):
			rest_mult = float(_shelter.call("rest_mult"))
	return {
		"ambient": ambient,
		"heat": heat,
		"sheltered": _sheltered,
		"tent_warmth": tent_warmth,
		"resting": resting,
		"rest_mult": rest_mult,
		"sprinting": _sprinting and _move_v.length() > 1.0,
		"raining": raining,
		"cold_mult": Difficulty.cold_mult(GameState.night_number(), GameState.difficulty_cfg()),
		"invulnerable": Dev.god_mode,
	}


func _on_death() -> void:
	_dead_done = true
	resting = false
	model.play_action("die")
	rig.dead = true
	_set_flashlight(false)
	if _torch_time > 0.0:
		_extinguish_torch(false)
	_move_v = Vector3.ZERO
	_pending = {}


# --- Feedback --------------------------------------------------------------------------------

func _on_footstep(_side: int) -> void:
	if not is_on_floor() or not GameState.is_playing():
		return
	Audio.play("footstep_" + _surface(), global_position, -2.0 if _sprinting else -7.0, 0.12)


## "grass", "dirt", "stone", "wood" or "water" under the player.
func _surface() -> String:
	for i in get_slide_collision_count():
		var c := get_slide_collision(i)
		var obj := c.get_collider()
		if obj is Node and c.get_normal().y > 0.6:
			var node := obj as Node
			if node.has_meta("surface"):
				return str(node.get_meta("surface"))
			if node.is_in_group("wood_surface"):
				return "wood"
			if node.is_in_group("stone_surface"):
				return "stone"
	if _gen == null:
		return "grass"
	var p := global_position
	if _gen.water_depth(p.x, p.z) > 0.05 or _gen.stream_factor(p.x, p.z) > 0.45:
		return "water"
	if p.y > _gen.height_at(p.x, p.z) + 0.3:
		return "wood"
	if _gen.path_factor(p.x, p.z) > 0.45:
		return "dirt"
	match _gen.biome_at(p.x, p.z):
		"ridge":
			return "stone"
		"camp", "shore":
			return "dirt"
	if _gen.slope_at(p.x, p.z) > 0.32:
		return "stone"
	return "grass"


func _notify_throttled(key: String, text: String, kind: String = "info", seconds: float = 3.5) -> void:
	var now := Time.get_ticks_msec()
	if now < int(_throttle.get(key, 0)):
		return
	_throttle[key] = now + int(seconds * 1000.0)
	Events.notify.emit(text, kind)


static func _num(n: Object, prop: String, default: float) -> float:
	var v: Variant = n.get(prop)
	if v is float or v is int:
		return float(v)
	return default


static func _kind_of(n: Object) -> String:
	for prop in ["enemy_id", "kind", "species", "id"]:
		var v: Variant = n.get(prop)
		if v is String and str(v) != "":
			return str(v)
	return str((n as Node).name) if n is Node else "enemy"


func _capture_mouse() -> void:
	if _headless or not GameState.is_playing() and GameState.state != GameState.RunState.LOADING:
		return
	if GameState.ui_blocking or Platform.is_touch():
		return
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# --- Signal handlers -------------------------------------------------------------------------

func _on_selection_changed(_i: int) -> void:
	_refresh_held()


func _on_inventory_changed() -> void:
	_refresh_held()


func _refresh_held() -> void:
	var id := GameState.selected_item_id()
	if id == _held_id and (id == "" or model.held_node() != null):
		return
	_held_id = id
	if _flash_on:
		_set_flashlight(false)
	model.set_held_item(id)
	_flash_source = null
	_apply_flash_visual()


func _on_camera_shake(strength: float) -> void:
	if rig:
		rig.add_shake(strength)


func _on_float_text(world_pos: Vector3, text: String, color: Color) -> void:
	FloatText3D.spawn(world_pos, text, color)


func _on_tree_hit_evt(_pos: Vector3, _kind: String) -> void:
	_tree_evt["hit"] = true


func _on_tree_chopped_evt(_pos: Vector3, _kind: String) -> void:
	_tree_evt["chop"] = true


func _on_look_changed() -> void:
	if model:
		model.apply_look(Profile.look)
