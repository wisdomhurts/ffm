class_name Chest
extends Node3D
## One treasure chest (tier "common", "rare" or "epic").
##
## Interactable: "Open Chest" / "Open Rare Chest" / "Open Golden Chest". On
## open the lid swings back with a light burst, shafts of light and golden
## sparkles, the loot (Loot.roll on its table, seeded per chest and opening)
## pops out as Pickups in a little fountain (coins as "coins" piles), then
## Events.chest_opened(tier, pos) and GameState.stat_add("chests_opened").
## The chest stays open and empty ("Empty! It fills up again in 3 days")
## until it restocks on a dawn (restock_days after it was opened), when the
## lid closes again and the next opening rolls `restock_table`.
##
## Map marker (group "map_marker"): {"kind": "chest", "label", "important":
## true, "discovered", "tier", "opened"}; discovered when seen within ~30 m
## (ChestManager) or opened. Built by ChestManager.add_chest().

signal chest_opened(chest: Chest, loot: Array)
signal chest_restocked(chest: Chest)

const TIER_NAMES := {"common": "Chest", "rare": "Rare Chest", "epic": "Golden Chest"}
## Lid angle when fully open (radians around the hinge, ~108 degrees).
const LID_OPEN := -1.88
const OPEN_TIME := 0.62
const SPARKLE_SHADER := "res://shaders/chest_sparkle.gdshader"
const BURST_SHADER := "res://shaders/chest_burst.gdshader"
const GROUND_SHADER := "res://shaders/chest_ground.gdshader"
const RANGE := {"phone": 80.0, "low": 100.0, "medium": 125.0, "high": 150.0}
const BURST_COLORS := {"common": Color(1.0, 0.82, 0.48), "rare": Color(0.78, 0.88, 1.0), "epic": Color(1.0, 0.78, 0.32)}

static var _sparkle_mat: ShaderMaterial = null
static var _glow_mat: ShaderMaterial = null
static var _shadow_mat: ShaderMaterial = null

var tier := "common"
var table_id := "chest_common"
## Table for openings after a restock ("" = table_id).
var restock_table := ""
## Dawns until an opened chest fills up again (<= 0: never).
var restock_days := 3
var label := "Chest"
var index := -1
var variant := 0
var opened := false
var discovered := false
var open_count := 0
var dawns_since_open := 0
var interact_radius := 2.4
var is_starter := false
## Screenshot / test chest (not counted, skipped by nearest()).
var debug_only := false
## Set by ChestManager: it toggles the "interactable" group by distance.
var managed := false
## Seed salt for the loot (ChestManager sets it from the world seed).
var loot_seed := 0

var model: Dictionary = {}
var body: MeshInstance3D = null
var lid_pivot: Node3D = null
var lid: MeshInstance3D = null
var collider: StaticBody3D = null
var last_loot: Array = []

var _glow_light: OmniLight3D = null
var _ground_glow: MeshInstance3D = null
var _near := false
var _lid_angle := 0.0
var _anim := ""
var _anim_t := 0.0
var _spawn_queue: Array = []
var _spawn_t := 0.0
var _fx: Node3D = null
var _fx_t := 0.0
var _fx_light: OmniLight3D = null
var _fx_rays: MeshInstance3D = null
var _fx_flash: MeshInstance3D = null
var _toward := Vector3.ZERO


## Configure before add_child (ChestManager.add_chest does this).
func configure(p_tier: String, p_table: String, opts: Dictionary = {}) -> void:
	tier = p_tier if TIER_NAMES.has(p_tier) else "common"
	table_id = p_table if p_table != "" else str(DB.b("chests.tables.%s" % tier, "chest_" + tier))
	restock_table = str(opts.get("restock_table", ""))
	restock_days = int(opts.get("restock_days", DB.bi("chests.restock_days", 3)))
	label = str(opts.get("label", TIER_NAMES[tier]))
	variant = int(opts.get("variant", 0))
	is_starter = bool(opts.get("starter", false))
	discovered = bool(opts.get("discovered", false))
	rotation.y = float(opts.get("rot", 0.0))


func _ready() -> void:
	# ChestManager registers its chests as interactables only while the player
	# is close (keeps the player's interact scan short); stand-alone chests
	# are always interactable.
	if not managed:
		add_to_group("interactable")
	add_to_group("map_marker")
	add_to_group("chest")
	if body == null:
		_build()
	set_process(false)


## World position (also valid before the chest is in the tree).
func world_pos() -> Vector3:
	return global_position if is_inside_tree() else position


func _build() -> void:
	model = ChestModels.get_model(tier, variant)
	body = MeshInstance3D.new()
	body.name = "Body"
	body.mesh = model["body"]
	lid_pivot = Node3D.new()
	lid_pivot.name = "LidPivot"
	lid_pivot.position = model["hinge"]
	lid = MeshInstance3D.new()
	lid.name = "Lid"
	lid.mesh = model["lid"]
	add_child(body)
	add_child(lid_pivot)
	lid_pivot.add_child(lid)
	apply_quality()
	# Solid for the player (layer 1 = world).
	collider = StaticBody3D.new()
	collider.name = "Collider"
	collider.collision_layer = 1
	collider.collision_mask = 0
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	var sz: Vector3 = model["size"]
	box.size = Vector3(sz.x + 0.04, sz.y, sz.z + 0.04)
	cs.shape = box
	cs.position = Vector3(0.0, sz.y * 0.5, 0.0)
	collider.add_child(cs)
	add_child(collider)
	# Soft contact shadow so the chest sits on the ground.
	var sh := MeshInstance3D.new()
	sh.name = "ContactShadow"
	var sq := QuadMesh.new()
	sq.orientation = PlaneMesh.FACE_Y
	sq.size = Vector2(sz.x * 1.45, sz.z * 1.8)
	sh.mesh = sq
	sh.material_override = _shadow_material()
	sh.position = Vector3(0.0, 0.03, 0.0)
	sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sh.visibility_range_end = 45.0
	sh.visibility_range_end_margin = 6.0
	sh.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	add_child(sh)
	if tier == "epic":
		_ground_glow = MeshInstance3D.new()
		_ground_glow.name = "GroundGlow"
		var qm := QuadMesh.new()
		qm.size = Vector2(2.6, 2.6)
		qm.orientation = PlaneMesh.FACE_Y
		_ground_glow.mesh = qm
		_ground_glow.material_override = _ground_glow_material()
		_ground_glow.position = Vector3(0.0, 0.04, 0.12)
		_ground_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_ground_glow.visibility_range_end = 60.0
		_ground_glow.visibility_range_end_margin = 8.0
		_ground_glow.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		add_child(_ground_glow)
	_apply_state_visuals()


## Draw distance and shadows from the quality preset (re-applied on change).
func apply_quality() -> void:
	if body == null:
		return
	var reach := float(RANGE.get(Settings.quality(), 120.0))
	var shadows := not Settings.is_low_quality()
	for mi in [body, lid]:
		var m := mi as MeshInstance3D
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		m.visibility_range_end = reach
		m.visibility_range_end_margin = 8.0
		m.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF


# --- Interactable contract ----------------------------------------------------------------

func get_interact_text(_player: Node) -> String:
	if opened or _anim != "":
		return ""
	return "Open %s" % str(TIER_NAMES.get(tier, "Chest"))


func get_interact_hint(_player: Node) -> String:
	if not opened or _anim == "open":
		return ""
	if restock_days <= 0:
		return "Empty! You found everything."
	var days := days_until_restock()
	if days <= 1:
		return "Empty! It fills up again at sunrise"
	return "Empty! It fills up again in %d days" % days


func get_interact_point() -> Vector3:
	return global_transform * Vector3(0.0, 0.45, front_offset() + 0.15)


func interact(player: Node) -> void:
	open_chest(player)


# --- Map marker contract ------------------------------------------------------------------

func get_map_marker() -> Dictionary:
	return {"kind": "chest", "label": label, "important": true, "discovered": discovered,
		"tier": tier, "opened": opened}


# --- Queries --------------------------------------------------------------------------------

func front_offset() -> float:
	if model.is_empty():
		return float(ChestModels.dims(tier)["d"]) * 0.5
	return float(model["front"])


func days_until_restock() -> int:
	if not opened or restock_days <= 0:
		return -1
	return maxi(restock_days - dawns_since_open, 0)


func is_animating() -> bool:
	return _anim != "" or _fx != null or not _spawn_queue.is_empty()


## Glint spots (world positions) for the manager's sparkles.
func glint_points() -> PackedVector3Array:
	var out := PackedVector3Array()
	if model.is_empty():
		return out
	for p in model["glints"]:
		out.append(global_transform * (p as Vector3))
	return out


## World position of the chest's open top (where loot comes out).
func mouth_position() -> Vector3:
	var m: Vector3 = model.get("mouth", Vector3(0.0, 0.4, 0.0))
	return global_transform * m


## The loot an opening would give (deterministic; does not open the chest).
func preview_loot(opening: int = -1) -> Array:
	var n := opening if opening > 0 else open_count + 1
	return Loot.roll(DB.loot_table(_table_for(n)), _rng_for(n))


func _table_for(opening: int) -> String:
	if opening <= 1 or restock_table == "":
		return table_id
	return restock_table


func _rng_for(opening: int) -> RandomNumberGenerator:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%d|%d|%d|%s" % [loot_seed, index, opening, _table_for(opening)])
	return rng


# --- Opening ----------------------------------------------------------------------------------

## Open the chest: roll the loot, start the animation and effects and pop the
## loot out as pickups. Returns the loot ([{id, count}]) or [] if it was
## already open.
func open_chest(player: Node = null) -> Array:
	if opened or _anim != "":
		return []
	opened = true
	discovered = true
	open_count += 1
	dawns_since_open = 0
	var loot := Loot.roll(DB.loot_table(_table_for(open_count)), _rng_for(open_count))
	last_loot = loot
	GameState.stat_add("chests_opened")
	Events.chest_opened.emit(tier, world_pos())
	Events.camera_shake.emit({"common": 0.05, "rare": 0.08, "epic": 0.12}.get(tier, 0.06))
	_toward = Vector3.ZERO
	if player is Node3D and is_instance_valid(player) and (player as Node3D).is_inside_tree():
		_toward = (player as Node3D).global_position - world_pos()
		_toward.y = 0.0
	_queue_loot(loot)
	_notify(loot)
	chest_opened.emit(self, loot)
	if is_inside_tree():
		_anim = "open"
		_anim_t = 0.0
		_spawn_fx()
		set_process(true)
	else:
		_lid_angle = LID_OPEN
		_flush_spawns()
	_apply_state_visuals()
	return loot


func _queue_loot(loot: Array) -> void:
	var entries: Array = []
	var pile_max := maxi(DB.bi("chests.coin_pile_max", 12), 1)
	for e in loot:
		var id := str(e["id"])
		var n := int(e["count"])
		if id == "coins":
			var piles := clampi(int(ceil(float(n) / pile_max)), 1, 5)
			var each := n / piles
			for i in piles:
				var c := each + (n - each * piles if i == 0 else 0)
				if c > 0:
					entries.append({"id": id, "count": c})
		else:
			entries.append({"id": id, "count": n})
	# Coins first, then the rest, popping out one after another.
	var t := 0.3
	for e in entries:
		e["at"] = t
		t += 0.085
		_spawn_queue.append(e)
	_spawn_t = 0.0


func _flush_spawns() -> void:
	for e in _spawn_queue:
		_spawn_one(e, 0)
	_spawn_queue.clear()


func _spawn_one(e: Dictionary, k: int) -> void:
	var id := str(e["id"])
	var n := int(e["count"])
	if not is_inside_tree():
		# No world to drop into (tests): straight into the sack.
		if GameState.give(id, n) > 0:
			Events.inventory_full.emit(id)
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("%d|%d|%d|%s" % [loot_seed, index, k, id]) + open_count
	# Fan out of the front of the chest, a little toward the player.
	var fwd := global_transform.basis.z
	fwd.y = 0.0
	fwd = fwd.normalized() if fwd.length() > 0.01 else Vector3.BACK
	if _toward.length() > 0.5:
		fwd = fwd.slerp(_toward.normalized(), 0.35).normalized()
	var ang := rng.randf_range(-1.15, 1.15)
	var dir := fwd.rotated(Vector3.UP, ang)
	var hs := rng.randf_range(1.35, 2.5)
	var vs := rng.randf_range(4.6, 6.0)
	var start := mouth_position() + Vector3(rng.randf_range(-0.12, 0.12), 0.12, rng.randf_range(-0.06, 0.06))
	var p: Node = Pickup.spawn(id, n, start, dir * hs + Vector3(0.0, vs, 0.0))
	if p == null:
		# No pickup parent (no game): straight into the sack.
		if GameState.give(id, n) > 0:
			Events.inventory_full.emit(id)


func _notify(loot: Array) -> void:
	if loot.is_empty():
		Events.notify.emit("%s: it was empty..." % str(TIER_NAMES.get(tier, "Chest")), "info")
		return
	var parts: Array = []
	for e in loot:
		var id := str(e["id"])
		var n := int(e["count"])
		if id == "coins":
			parts.push_front("%d coins" % n)
		elif n > 1:
			parts.append("%d %s" % [n, DB.item_name(id)])
		else:
			parts.append(DB.item_name(id))
	var head := str(TIER_NAMES.get(tier, "Chest"))
	var txt := "%s: %s" % [head, ", ".join(PackedStringArray(parts.slice(0, 4)))]
	if parts.size() > 4:
		txt += " and more!"
	Events.notify.emit(txt, "loot")


# --- Restocking -------------------------------------------------------------------------------

## Called by ChestManager on every dawn. Returns true if it restocked.
func dawn_tick(player_pos: Vector3 = Vector3.INF) -> bool:
	if not opened or restock_days <= 0:
		return false
	dawns_since_open += 1
	if dawns_since_open < restock_days:
		return false
	var near := player_pos != Vector3.INF and player_pos.distance_to(world_pos()) < 45.0
	restock(near)
	return true


func restock(animate: bool = false) -> void:
	if not opened:
		return
	opened = false
	dawns_since_open = 0
	if animate and is_inside_tree():
		_anim = "close"
		_anim_t = 0.0
		set_process(true)
	else:
		_anim = ""
		_lid_angle = 0.0
		if lid_pivot:
			lid_pivot.rotation.x = 0.0
	_apply_state_visuals()
	chest_restocked.emit(self)


# --- Per frame --------------------------------------------------------------------------------

func _process(delta: float) -> void:
	if _anim == "open":
		_anim_t += delta
		var t := _anim_t
		if t < 0.14:
			# Rattle: the lid jiggles as the latch gives.
			_lid_angle = -0.07 * absf(sin(t * 70.0)) * (1.0 - t / 0.14)
		else:
			var u := clampf((t - 0.14) / OPEN_TIME, 0.0, 1.0)
			_lid_angle = LID_OPEN * _ease_out_back(u)
		var sq := 0.0
		if t < 0.14:
			sq = -0.05 * sin(t / 0.14 * PI)
		elif t < 0.4:
			sq = 0.04 * sin((t - 0.14) / 0.26 * PI)
		if body:
			body.scale = Vector3(1.0 - sq * 0.5, 1.0 + sq, 1.0 - sq * 0.5)
		if t >= 0.14 + OPEN_TIME + 0.1:
			_anim = ""
			_lid_angle = LID_OPEN
			if body:
				body.scale = Vector3.ONE
	elif _anim == "close":
		_anim_t += delta
		var u := clampf(_anim_t / 0.5, 0.0, 1.0)
		_lid_angle = LID_OPEN * (1.0 - u * u)
		if u >= 1.0:
			_anim = ""
			_lid_angle = 0.0
			FireSparks.puff(global_position + Vector3(0.0, 0.1, 0.0), 0.6, Color(0.78, 0.72, 0.6))
			Events.float_text.emit(global_position + Vector3(0.0, 1.0, 0.0), "Refilled!", Color(1.0, 0.86, 0.4))
	if lid_pivot:
		lid_pivot.rotation.x = _lid_angle
	if not _spawn_queue.is_empty():
		_spawn_t += delta
		var k := 0
		while not _spawn_queue.is_empty() and _spawn_t >= float((_spawn_queue[0] as Dictionary)["at"]):
			_spawn_one(_spawn_queue.pop_front(), open_count * 31 + k)
			k += 1
	if _fx:
		_update_fx(delta)
	if _near and _glow_light:
		var dark := GameState.day_cycle.darkness()
		var base := lerpf(0.25, 0.85, dark) * (0.35 if opened else 1.0)
		_glow_light.light_energy = base * (0.88 + 0.12 * sin(Time.get_ticks_msec() * 0.0021))
	if not is_animating() and not (_near and _glow_light):
		set_process(false)


static func _ease_out_back(x: float) -> float:
	var c1 := 1.4
	var c3 := c1 + 1.0
	var y := x - 1.0
	return 1.0 + c3 * y * y * y + c1 * y * y


func set_interactable(on: bool) -> void:
	if on and not is_in_group("interactable"):
		add_to_group("interactable")
	elif not on and is_in_group("interactable"):
		remove_from_group("interactable")


## The manager calls this when the player comes within / leaves ~30 m.
func set_near(on: bool) -> void:
	if on == _near:
		return
	_near = on
	if tier == "epic":
		if on and _glow_light == null:
			_glow_light = OmniLight3D.new()
			_glow_light.name = "Glow"
			_glow_light.light_color = Color(1.0, 0.78, 0.4)
			_glow_light.omni_range = 3.2
			_glow_light.omni_attenuation = 1.6
			_glow_light.light_energy = 0.4
			_glow_light.shadow_enabled = false
			_glow_light.light_specular = 0.6
			_glow_light.position = Vector3(0.0, 0.9, 0.55)
			add_child(_glow_light)
		if _glow_light:
			_glow_light.visible = on
	if on:
		set_process(true)


func _apply_state_visuals() -> void:
	if body == null:
		return
	var mat: Material = ChestModels.material(tier, true) if opened else null
	body.material_override = mat
	lid.material_override = mat
	if not opened and _anim == "":
		_lid_angle = 0.0
		lid_pivot.rotation.x = 0.0
	if _ground_glow:
		_ground_glow.visible = not opened


# --- Effects ------------------------------------------------------------------------------------

func _spawn_fx() -> void:
	if _fx and is_instance_valid(_fx):
		_fx.queue_free()
	_fx = Node3D.new()
	_fx.name = "OpenFX"
	add_child(_fx)
	_fx.position = model.get("mouth", Vector3(0.0, 0.4, 0.0))
	_fx_t = 0.0
	var col: Color = BURST_COLORS.get(tier, Color(1.0, 0.82, 0.48))
	var big := {"common": 1.0, "rare": 1.15, "epic": 1.45}.get(tier, 1.0) as float
	var w := float(ChestModels.dims(tier)["w"])
	# A burst of warm light.
	_fx_light = OmniLight3D.new()
	_fx_light.light_color = col
	_fx_light.omni_range = 5.5 * big
	_fx_light.omni_attenuation = 1.4
	_fx_light.light_energy = 0.0
	_fx_light.shadow_enabled = false
	_fx_light.position = Vector3(0.0, 0.5, 0.15)
	_fx.add_child(_fx_light)
	# Shafts of light rising out of the box.
	var h := 1.7 * big
	var cyl := CylinderMesh.new()
	cyl.top_radius = w * 0.62 * big
	cyl.bottom_radius = w * 0.38
	cyl.height = h
	cyl.cap_top = false
	cyl.cap_bottom = false
	cyl.radial_segments = 20
	cyl.rings = 1
	_fx_rays = MeshInstance3D.new()
	_fx_rays.mesh = cyl
	var rm := ShaderMaterial.new()
	rm.shader = load(BURST_SHADER)
	rm.set_shader_parameter("mode", 0)
	rm.set_shader_parameter("color", col)
	rm.set_shader_parameter("intensity", 1.25 * big)
	rm.set_shader_parameter("height", h)
	rm.set_shader_parameter("seed", float(index % 17))
	rm.set_shader_parameter("amount", 0.0)
	_fx_rays.material_override = rm
	_fx_rays.position = Vector3(0.0, h * 0.5 - 0.05, 0.0)
	_fx_rays.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fx.add_child(_fx_rays)
	# A bright flash at the mouth.
	_fx_flash = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1.0, 1.0)
	_fx_flash.mesh = qm
	var fm := ShaderMaterial.new()
	fm.shader = load(BURST_SHADER)
	fm.set_shader_parameter("mode", 1)
	fm.set_shader_parameter("color", col)
	fm.set_shader_parameter("intensity", 2.1)
	fm.set_shader_parameter("amount", 0.0)
	_fx_flash.material_override = fm
	_fx_flash.scale = Vector3.ONE * 1.5 * big
	_fx_flash.position = Vector3(0.0, 0.18, 0.0)
	_fx_flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fx.add_child(_fx_flash)
	# Golden sparkles.
	var g := GPUParticles3D.new()
	g.name = "Sparkles"
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(w * 0.32, 0.04, 0.18)
	pm.direction = Vector3.UP
	pm.spread = 38.0
	pm.initial_velocity_min = 2.4
	pm.initial_velocity_max = 4.8 * minf(big, 1.2)
	pm.gravity = Vector3(0.0, -3.0, 0.0)
	pm.damping_min = 0.6
	pm.damping_max = 1.4
	pm.scale_min = 0.09
	pm.scale_max = 0.2 * big
	pm.scale_curve = FireFX._curve_tex([Vector2(0.0, 0.3), Vector2(0.15, 1.0), Vector2(1.0, 0.25)])
	pm.color_ramp = _sparkle_ramp(col)
	if tier == "epic":
		pm.hue_variation_min = -0.08
		pm.hue_variation_max = 0.08
	g.process_material = pm
	var sq := QuadMesh.new()
	sq.size = Vector2(1.0, 1.0)
	sq.material = _sparkle_material()
	g.draw_pass_1 = sq
	g.amount = QualityPresets.particle_count({"common": 28, "rare": 40, "epic": 64}.get(tier, 30) as int)
	g.lifetime = 2.0
	g.one_shot = true
	g.explosiveness = 0.8
	g.local_coords = false
	g.visibility_aabb = AABB(Vector3(-4, -2, -4), Vector3(8, 8, 8))
	g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fx.add_child(g)
	g.emitting = true


func _update_fx(delta: float) -> void:
	_fx_t += delta
	var t := _fx_t
	var big := {"common": 1.0, "rare": 1.15, "epic": 1.45}.get(tier, 1.0) as float
	# Light: quick rise, slow fall.
	var le := 0.0
	if t > 0.12:
		var u := t - 0.12
		le = clampf(u / 0.12, 0.0, 1.0) * exp(-maxf(u - 0.12, 0.0) * 2.4)
	if _fx_light:
		_fx_light.light_energy = le * 2.6 * big
	var ra := 0.0
	if t > 0.12:
		ra = smoothstep(0.12, 0.3, t) * (1.0 - smoothstep(0.7, 1.9, t))
	if _fx_rays:
		(_fx_rays.material_override as ShaderMaterial).set_shader_parameter("amount", ra)
		var sy := lerpf(0.35, 1.0, smoothstep(0.12, 0.5, t))
		_fx_rays.scale = Vector3(1.0, sy, 1.0)
		var h := float((_fx_rays.mesh as CylinderMesh).height)
		_fx_rays.position.y = h * 0.5 * sy - 0.05
	var fa := 0.0
	if t > 0.1:
		fa = smoothstep(0.1, 0.2, t) * (1.0 - smoothstep(0.22, 0.75, t))
	if _fx_flash:
		(_fx_flash.material_override as ShaderMaterial).set_shader_parameter("amount", fa)
	if t > 2.2:
		_fx.queue_free()
		_fx = null
		_fx_light = null
		_fx_rays = null
		_fx_flash = null


static func _sparkle_ramp(col: Color) -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.1, 0.55, 1.0])
	g.colors = PackedColorArray([Color(1.0, 0.98, 0.9, 0.0), Color(1.0, 0.96, 0.85, 1.0), Color(col.r, col.g, col.b, 0.85), Color(col.r, col.g * 0.8, col.b * 0.6, 0.0)])
	var t := GradientTexture1D.new()
	t.gradient = g
	return t


static func _sparkle_material() -> ShaderMaterial:
	if _sparkle_mat == null:
		_sparkle_mat = ShaderMaterial.new()
		_sparkle_mat.shader = load(SPARKLE_SHADER)
	return _sparkle_mat


static func _shadow_material() -> ShaderMaterial:
	if _shadow_mat == null:
		_shadow_mat = ShaderMaterial.new()
		_shadow_mat.shader = load(GROUND_SHADER)
	return _shadow_mat


static func _ground_glow_material() -> ShaderMaterial:
	if _glow_mat == null:
		_glow_mat = ShaderMaterial.new()
		_glow_mat.shader = load(BURST_SHADER)
		_glow_mat.set_shader_parameter("mode", 2)
		_glow_mat.set_shader_parameter("color", Color(1.0, 0.72, 0.3))
		_glow_mat.set_shader_parameter("intensity", 0.55)
		_glow_mat.set_shader_parameter("amount", 1.0)
	return _glow_mat


# --- Debug / screenshots -------------------------------------------------------------------

## Put the chest back to its fresh, closed state (tests, screenshots).
func debug_reset() -> void:
	opened = false
	_anim = ""
	_spawn_queue.clear()
	dawns_since_open = 0
	if _fx and is_instance_valid(_fx):
		_fx.queue_free()
	_fx = null
	_lid_angle = 0.0
	if lid_pivot:
		lid_pivot.rotation.x = 0.0
	if body:
		body.scale = Vector3.ONE
	_apply_state_visuals()


## Show the lid open (no loot, no effects) for screenshots.
func debug_show_open(angle_frac: float = 1.0) -> void:
	_lid_angle = LID_OPEN * clampf(angle_frac, 0.0, 1.2)
	if lid_pivot:
		lid_pivot.rotation.x = _lid_angle
