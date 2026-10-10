class_name Pickup
extends Node3D
## A dropped item in the world: a small bobbing, spinning model with a soft
## glow on the ground.
##
## Pickup.spawn(id, count, pos, impulse) adds one under GameState.game.pickups
## (null-safe; returns null when there is no game). With an impulse it hops
## out first. Common things (resources, food, ammo, coins) fly into the
## player when they walk close and auto-pickup is on; everything else shows
## "[E] Pick up Flashlight". Whatever does not fit in the sack stays on the
## ground ("Sack full!"). Resources and food fade away after ~10 minutes;
## tools, weapons, lights, sacks, coins and rare finds never do.
##
## Item id "coins" is a gold coin pile (count = coins).

const AUTO_KINDS := ["resource", "food", "ammo"]
const DESPAWN_SECONDS := 600.0
const GRAVITY := 16.0

static var _last_full_notify_ms := -100000

var item_id := ""
var count := 1
## Per-instance item state (e.g. flashlight charge) handed back on pickup.
var meta: Dictionary = {}
var interact_radius := 2.2

var _vel := Vector3.ZERO
var _airborne := false
var _age := 0.0
var _no_auto_until := 0.0
## Set when the player drops it: no auto-pickup until they have walked away.
var _require_leave := false
var _flying := false
var _fly_speed := 0.0
var _collected := false
var _despawn_t := -1.0
var _visual: Node3D
var _model: Node3D
var _glow: MeshInstance3D
var _rest_h := 0.3
var _phase := 0.0
var _check_t := 0.0
var _important := false
var _pop := 0.0


## Spawn a pickup (count > 0). Returns null if there is no game to hold it.
static func spawn(id: String, n: int, pos: Vector3, impulse: Vector3 = Vector3.ZERO) -> Pickup:
	if id == "" or n <= 0:
		return null
	var game: Node = GameState.game
	if game == null or not is_instance_valid(game):
		return null
	var parent := game.get("pickups") as Node
	if parent == null or not is_instance_valid(parent):
		return null
	var p := Pickup.new()
	p.item_id = id
	p.count = n
	p.name = "Pickup_%s" % id
	p._vel = impulse
	p._airborne = impulse.length_squared() > 0.0001
	parent.add_child(p)
	p.global_position = pos
	return p


## True for things worth keeping forever (never despawn, golden glow).
static func is_important(id: String) -> bool:
	if id == "coins":
		return true
	var def := DB.item(id)
	var kind := str(def.get("kind", ""))
	if kind in ["tool", "weapon", "light", "special", "sack", "medical"]:
		return true
	return int(def.get("sell", 0)) >= 20


static func sound_for(id: String) -> String:
	match id:
		"coins":
			return "coin"
		"wood", "kindling":
			return "wood_pickup"
		"stone", "coal", "scrap_metal", "shadow_shard", "starstone", "amber":
			return "stone_pickup"
	return "pickup"


## Don't fly into the player for a moment, and not until they have walked
## away from it once (used when the player drops something).
func block_auto_pickup(seconds: float) -> void:
	_no_auto_until = _age + seconds
	_require_leave = true


func can_fit() -> bool:
	if item_id == "coins":
		return true
	var kind := DB.item_kind(item_id)
	if kind == "sack" or kind == "special":
		return true
	return GameState.inventory.space_for(item_id) > 0


func is_auto_kind() -> bool:
	return item_id == "coins" or DB.item_kind(item_id) in AUTO_KINDS


# --- Interactable contract ------------------------------------------------------------

func get_interact_text(_player: Node) -> String:
	if _collected or _flying or _despawn_t >= 0.0:
		return ""
	if not can_fit():
		return ""
	return "Pick up %s" % _label()


func get_interact_hint(_player: Node) -> String:
	if _collected or _flying:
		return ""
	return "Sack full!" if not can_fit() else ""


func get_interact_point() -> Vector3:
	return global_position + Vector3(0.0, 0.3, 0.0)


func interact(_player: Node) -> void:
	collect()


## Put the item in the sack. Returns true if anything was taken.
func collect() -> bool:
	if _collected:
		return false
	var left := GameState.give(item_id, count, meta)
	var got := count - left
	if got > 0:
		var nm := DB.item_name(item_id)
		var txt := "+%d %s" % [got, nm]
		Events.float_text.emit(global_position + Vector3(0.0, _rest_h + 0.5, 0.0), txt, _text_color())
		Audio.play(sound_for(item_id), global_position)
	if left <= 0:
		_collected = true
		_set_interactable(false)
		_pop_and_free()
		return true
	count = left
	_flying = false
	_no_auto_until = _age + 3.0
	_notify_full()
	return got > 0


func _label() -> String:
	var nm := DB.item_name(item_id)
	return nm if count <= 1 else "%d %s" % [count, nm]


func _text_color() -> Color:
	if item_id == "coins":
		return Color(1.0, 0.85, 0.3)
	if _important:
		return Color(1.0, 0.8, 0.45)
	return Color(0.95, 1.0, 0.85)


func _notify_full() -> void:
	var now := Time.get_ticks_msec()
	if now - _last_full_notify_ms > 4000:
		_last_full_notify_ms = now
		Events.notify.emit("Sack full! Store things at camp or get a bigger sack.", "warn")
		Audio.play("deny", global_position)


# --- Lifecycle --------------------------------------------------------------------------

func _ready() -> void:
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_to_group("interactable")
	add_to_group("pickup")
	interact_radius = DB.bf("player.pickup_radius", 2.2)
	_important = is_important(item_id)
	_phase = float(get_instance_id() % 1000) * 0.37
	_build_visual()
	if not _airborne:
		_pop = 0.0
		global_position.y = _ground_y()


func _build_visual() -> void:
	_visual = Node3D.new()
	_visual.name = "Visual"
	add_child(_visual)
	_model = ItemModels.build(item_id)
	var mi := _model.get_node_or_null("Mesh") as MeshInstance3D
	var aabb := AABB(Vector3(-0.1, -0.1, -0.1), Vector3(0.2, 0.2, 0.2))
	if mi and mi.mesh:
		aabb = mi.mesh.get_aabb()
	var longest := maxf(aabb.size.x, maxf(aabb.size.y, aabb.size.z))
	var s := 1.0
	if longest < 0.36:
		s = clampf(0.36 / maxf(longest, 0.01), 1.0, 2.4)
	elif longest > 0.8:
		s = clampf(0.8 / longest, 0.55, 1.0)
	_model.scale = Vector3.ONE * s
	_model.position = -aabb.get_center() * s
	# Keep glow halos from growing with small items that were scaled up.
	var halo := _model.get_node_or_null("Halo") as Node3D
	if halo and s > 1.3:
		halo.scale *= 1.3 / s
	var holder := Node3D.new()
	holder.name = "Tilt"
	if ItemModels.hold_type(item_id) in ["axe", "melee", "torch"]:
		holder.rotation = Vector3(0.0, 0.0, 0.42)
	elif ItemModels.hold_type(item_id) in ["gun", "flashlight"]:
		holder.rotation = Vector3(0.0, PI * 0.5, 0.0)
	holder.add_child(_model)
	_visual.add_child(holder)
	_rest_h = aabb.size.y * s * 0.5 + 0.14
	var glow_col := Color(1.0, 0.72, 0.3) if _important else Color(1.0, 0.92, 0.75)
	var shadows := not Settings.is_low_quality()
	for n in _model.find_children("*", "GeometryInstance3D", true, false):
		var gi := n as GeometryInstance3D
		if gi is MeshInstance3D and (gi as MeshInstance3D).mesh is ArrayMesh:
			ShaderCompat.set_param(gi, "glow", 0.55 if _important else 0.3)
			ShaderCompat.set_param(gi, "glow_color", glow_col)
			gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ItemModels.set_lit(_model, false)
	var disc := 1.15 if _important else 0.8
	_glow = ItemModels.make_sprite("glow_disc_gold" if _important else "glow_disc", Vector2(disc, disc), "Glow")
	_glow.rotation = Vector3(-PI * 0.5, 0.0, 0.0)
	_glow.position = Vector3(0.0, 0.04, 0.0)
	add_child(_glow)
	_visual.position.y = _rest_h
	_visual.scale = Vector3.ONE * (0.3 if not _airborne else 1.0)


func _ground_y() -> float:
	var gen := GameState.world_gen
	if gen == null:
		return global_position.y
	var p := global_position
	var h := gen.height_at(p.x, p.z)
	if h < WorldGen.WATER_LEVEL:
		h = WorldGen.WATER_LEVEL - 0.1
	return h


func _process(delta: float) -> void:
	_age += delta
	if _collected:
		return
	if _despawn_t >= 0.0:
		_despawn_t += delta
		var k := clampf(1.0 - _despawn_t, 0.0, 1.0)
		_visual.scale = Vector3.ONE * k
		ShaderCompat.set_param(_glow, "fade", k)
		if _despawn_t >= 1.0:
			queue_free()
		return
	if _flying:
		_fly(delta)
		return
	if _airborne:
		_vel.y -= GRAVITY * delta
		var p := global_position + _vel * delta
		var gen := GameState.world_gen
		if gen:
			p = gen.clamp_playable(p)
		global_position = p
		var g := _ground_y()
		if global_position.y <= g and _vel.y < 0.0:
			global_position.y = g
			if absf(_vel.y) > 2.2:
				_vel = Vector3(_vel.x * 0.45, -_vel.y * 0.32, _vel.z * 0.45)
			else:
				_airborne = false
				_vel = Vector3.ZERO
		_visual.rotation.y += delta * 6.0
	else:
		# Rest: hover, bob and spin.
		_pop = minf(_pop + delta * 4.0, 1.0)
		var sc := 1.0 + 0.25 * sin(_pop * PI) * (1.0 - _pop)
		_visual.scale = Vector3.ONE * lerpf(0.3, 1.0, _ease_out(_pop)) * sc
		_visual.position.y = _rest_h + sin(_age * 2.3 + _phase) * 0.05
		_visual.rotation.y += delta * 1.3
		ShaderCompat.set_param(_glow, "fade", 0.75 + 0.25 * sin(_age * 2.3 + _phase))
	_check_t -= delta
	if _check_t <= 0.0:
		_check_t = 0.1
		_check_auto()
		if not _important and DB.item_kind(item_id) in ["resource", "food"] and _age > DESPAWN_SECONDS:
			_despawn_t = 0.0
			_set_interactable(false)


static func _ease_out(x: float) -> float:
	return 1.0 - pow(1.0 - clampf(x, 0.0, 1.0), 3.0)


func _check_auto() -> void:
	if _airborne or not GameState.is_playing():
		return
	var pl := GameState.player
	if pl == null or not is_instance_valid(pl) or GameState.survival.dead:
		return
	var radius := DB.bf("player.auto_pickup_radius", 2.0)
	var d := pl.global_position - global_position
	if absf(d.y) > 2.5:
		return
	d.y = 0.0
	var dist := d.length()
	if _require_leave:
		if dist > radius + 1.0:
			_require_leave = false
		return
	if dist > radius or not is_auto_kind() or not bool(Settings.get_value("auto_pickup")):
		return
	if _age < _no_auto_until:
		return
	if not can_fit():
		if dist < radius * 0.7:
			_notify_full()
			_no_auto_until = _age + 2.0
		return
	_flying = true
	_fly_speed = 2.5
	_set_interactable(false)


func _fly(delta: float) -> void:
	var pl := GameState.player
	if pl == null or not is_instance_valid(pl):
		_flying = false
		_set_interactable(true)
		return
	var target := pl.global_position + Vector3(0.0, 0.95, 0.0)
	var to := target - (global_position + _visual.position)
	var dist := to.length()
	_fly_speed = minf(_fly_speed + delta * 26.0, 16.0)
	var step := minf(_fly_speed * delta, dist)
	global_position += to.normalized() * step if dist > 0.001 else Vector3.ZERO
	_visual.rotation.y += delta * 8.0
	_visual.scale = Vector3.ONE * clampf(dist / 1.2, 0.45, 1.0)
	_glow.visible = false
	if dist < 0.35:
		if not collect():
			_set_interactable(true)
			_glow.visible = true
			global_position.y = _ground_y()


func _set_interactable(on: bool) -> void:
	if on and not is_in_group("interactable"):
		add_to_group("interactable")
	elif not on and is_in_group("interactable"):
		remove_from_group("interactable")


func _pop_and_free() -> void:
	if _glow:
		_glow.visible = false
	var tw := create_tween()
	tw.tween_property(_visual, "scale", Vector3.ONE * 1.25, 0.06)
	tw.tween_property(_visual, "scale", Vector3.ONE * 0.01, 0.12)
	tw.tween_callback(queue_free)
