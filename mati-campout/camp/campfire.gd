class_name Campfire
extends Node3D
## The campfire: the heart of the camp. Burns GameState.fire, lights and
## warms the camp, scares monsters (Lights registry), and handles feeding,
## relighting and the fire-level visuals.
##
## Visuals: FirePit (stones / hearth / beacon per level), FireFX (flames,
## embers, smoke, ember bed), a shadow-casting warm OmniLight3D with a
## never-strobing layered flicker plus a hot core light, a soot decal and a
## warm ring decal marking the edge of the safe circle at night.
##
## Interactions (kid-friendly): "Add Wood to fire" / "Add Coal to fire",
## "Relight fire (1 Kindling + 1 Wood)", greyed hints for what is missing.
## Fuel comes from the sack or the camp storage box.
##
## Public: light (main OmniLight3D), core_light, fx, rack (CookingRack), level,
## light_intensity_at(pos), light_origin(), heat_at(pos), is_burning(),
## flame_position(), pick_fuel(...), pick_relight(...) (static, pure),
## debug_set_out_time(t) (screenshots).

const LIGHT_COLOR := Color("ffb15c")
const CORE_COLOR := Color(1.0, 0.7, 0.36)
const OUT_MESSAGE := "THE FIRE IS OUT. YOU ARE NO LONGER SAFE."
const OUT_COLOR := Color("ff5a2a")
## Ring decal band sits at this fraction of the decal's half size.
const RING_FRACTION := 0.93
## Base light energy per fire level (multiplied by strength and flicker).
const LIGHT_ENERGY := {1: 3.6, 2: 3.9, 3: 4.3}

var light: OmniLight3D
var core_light: OmniLight3D
var fx: FireFX
var rack: CookingRack
var level := 1
var interact_radius := 2.6

var _pit: MeshInstance3D
var _body: StaticBody3D
var _shape: CollisionShape3D
var _ring: Decal
var _soot: Decal
var _cfg: Dictionary = FirePit.cfg(1)
var _noise := FastNoiseLite.new()
var _t := 0.0
var _vis_radius := 14.0
var _pulse := 0.0
var _flash := 0.0
var _was_lit := true
var _out_time := 100.0
var _last_state := FireModel.State.STRONG
var _low_notified_ms := -100000
var _ignite_ms := -100000
var _wind := Vector2(0.28, 0.21)
var _wind_t := 0.0
var _shadows_ok := true
var _flicker_amp := 0.14
var _glob_pos := Vector3.INF
var _ready_done := false


func setup(_game: Game) -> void:
	GameState.campfire = self
	add_to_group("interactable")
	add_to_group("campfire")
	_noise.seed = GameState.seed + 7041
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 1.0
	_build()
	Lights.register(self)
	Events.fire_state_changed.connect(_on_state_changed)
	Events.fire_extinguished.connect(_on_extinguished)
	Events.fire_relit.connect(_on_relit)
	Events.fire_level_changed.connect(_on_level_changed)
	Settings.changed.connect(_on_setting_changed)
	_was_lit = GameState.fire.is_lit()
	_out_time = 0.0 if not _was_lit else 100.0
	_last_state = GameState.fire.state()
	_vis_radius = maxf(GameState.fire.light_radius(), 1.0)
	_ready_done = true


func _exit_tree() -> void:
	Lights.unregister(self)
	if GameState.campfire == self:
		GameState.campfire = null


# --- Light / warmth contract -------------------------------------------------------------

func light_intensity_at(pos: Vector3) -> float:
	var d := Vector2(pos.x - global_position.x, pos.z - global_position.z).length()
	return GameState.fire.light_at_distance(d, DB.bf("fire.light_fear_edge", 0.35))


func light_origin() -> Vector3:
	return global_position


## 0..1 heat felt at a position.
func heat_at(pos: Vector3) -> float:
	var d := Vector2(pos.x - global_position.x, pos.z - global_position.z).length()
	return GameState.fire.heat_at_distance(d)


func is_burning() -> bool:
	return GameState.fire.is_lit()


## World position of the base of the flames.
func flame_position() -> Vector3:
	return global_position + Vector3(0.0, float(_cfg["base_y"]), 0.0)


# --- Fuel choice (pure helpers, unit-tested) ------------------------------------------------

## Which fuel "Add ... to fire" uses: the selected hotbar item if it is fuel,
## else wood, else coal (never kindling unless selected), from the sack first
## and then the camp storage. Returns {"id", "inv"} or {} when there is none.
static func pick_fuel(fire: FireModel, selected: String, sack: Inventory, storage: Array) -> Dictionary:
	var order: Array = []
	if selected != "" and fire.is_fuel(selected):
		order.append(selected)
	for id in ["wood", "coal"]:
		if not order.has(id):
			order.append(id)
	var sources: Array = [sack]
	sources.append_array(storage)
	for id in order:
		for inv in sources:
			if inv != null and (inv as Inventory).has(id):
				return {"id": id, "inv": inv}
	return {}


## What a relight would use: {"kindling_inv", "fuel_id", "fuel_inv"}, or
## {"missing": ["kindling", "fuel"]} listing what is not available.
static func pick_relight(fire: FireModel, selected: String, sack: Inventory, storage: Array) -> Dictionary:
	var sources: Array = [sack]
	sources.append_array(storage)
	var ign := str(DB.b("fire.relight_needs", "kindling"))
	var kin_inv: Inventory = null
	for inv in sources:
		if inv != null and (inv as Inventory).has(ign):
			kin_inv = inv
			break
	# Fuel: chosen like feeding (selected fuel, else wood, else coal), never the kindling.
	var fuel := pick_fuel(fire, selected if selected != ign else "", sack, storage)
	var missing: Array = []
	if kin_inv == null:
		missing.append("kindling")
	if fuel.is_empty():
		missing.append("fuel")
	if not missing.is_empty():
		return {"missing": missing}
	return {"kindling_id": ign, "kindling_inv": kin_inv, "fuel_id": fuel["id"], "fuel_inv": fuel["inv"]}


func _storage_sources() -> Array:
	var s: Array = [GameState.storage]
	s.append_array(GameState.extra_storage)
	return s


# --- Interactable --------------------------------------------------------------------------

func get_interact_point() -> Vector3:
	return global_position + Vector3(0.0, minf(float(_cfg["base_y"]) + 0.4, 1.4), 0.0)


func _rack_first() -> bool:
	return rack != null and is_instance_valid(rack) and rack.wants_priority()


func get_interact_text(_player: Node) -> String:
	if _rack_first():
		return ""
	var fire := GameState.fire
	var sel := GameState.selected_item_id()
	if fire.is_lit():
		var c := pick_fuel(fire, sel, GameState.inventory, _storage_sources())
		if c.is_empty() or not fire.can_accept(str(c["id"])):
			return ""
		return "Add %s to fire" % DB.item_name(str(c["id"]))
	var r := pick_relight(fire, sel, GameState.inventory, _storage_sources())
	if r.has("missing"):
		return ""
	return "Relight fire (1 %s + 1 %s)" % [DB.item_name(str(r["kindling_id"])), DB.item_name(str(r["fuel_id"]))]


func get_interact_hint(_player: Node) -> String:
	if _rack_first():
		return ""
	var fire := GameState.fire
	var sel := GameState.selected_item_id()
	if fire.is_lit():
		var c := pick_fuel(fire, sel, GameState.inventory, _storage_sources())
		if c.is_empty():
			return "Need Wood or Coal to feed the fire"
		if not fire.can_accept(str(c["id"])):
			return "The fire is full"
		return ""
	var r := pick_relight(fire, sel, GameState.inventory, _storage_sources())
	if not r.has("missing"):
		return ""
	var missing: Array = r["missing"]
	if missing.has("kindling") and missing.has("fuel"):
		return "Need Kindling + Wood: chop wood, then craft Kindling at the crate"
	if missing.has("kindling"):
		return "Need Kindling: craft it from Wood at the crate"
	return "Need 1 Wood or Coal to relight the fire"


func interact(player: Node) -> void:
	var fire := GameState.fire
	var sel := GameState.selected_item_id()
	if fire.is_lit():
		var c := pick_fuel(fire, sel, GameState.inventory, _storage_sources())
		if c.is_empty() or not fire.can_accept(str(c["id"])):
			Audio.play("deny", global_position, -6.0)
			return
		feed(str(c["id"]), c["inv"] as Inventory, player)
	else:
		relight(player)


## Feed one fuel item from `inv` into the lit fire, with all the feedback.
func feed(id: String, inv: Inventory, player: Node = null) -> bool:
	var fire := GameState.fire
	var before := fire.fraction()
	if inv == null or not inv.has(id) or not fire.add_fuel(id):
		return false
	inv.remove(id, 1)
	GameState.stat_add("fuel_added")
	Events.fire_fed.emit(id)
	Audio.play("fire_whoosh", flame_position())
	Events.camera_shake.emit(0.08)
	var gain := int(round((fire.fraction() - before) * 100.0))
	Events.float_text.emit(flame_position() + Vector3(0, 1.4, 0), "Fire +%d%%" % maxi(gain, 1), Color(1.0, 0.78, 0.4))
	_toss(id, player)
	return true


## Relight a dead fire with kindling + wood/coal from the sack or storage.
func relight(_player: Node = null) -> bool:
	var fire := GameState.fire
	if fire.is_lit():
		return false
	var r := pick_relight(fire, GameState.selected_item_id(), GameState.inventory, _storage_sources())
	if r.has("missing"):
		Audio.play("deny", global_position, -6.0)
		return false
	var kid := str(r["kindling_id"])
	var fid := str(r["fuel_id"])
	var kinv: Inventory = r["kindling_inv"]
	var finv: Inventory = r["fuel_inv"]
	_ignite_ms = Time.get_ticks_msec()
	if not fire.relight(kid, fid):
		return false
	kinv.remove(kid, 1)
	finv.remove(fid, 1)
	_ignite_fx()
	Events.camera_shake.emit(0.14)
	Events.float_text.emit(flame_position() + Vector3(0, 1.5, 0), "Fire relit!", Color(1.0, 0.8, 0.35))
	return true


# --- Events --------------------------------------------------------------------------------

func _on_state_changed(s: int) -> void:
	var prev := _last_state
	_last_state = s
	if s == FireModel.State.LOW and prev == FireModel.State.STRONG and GameState.is_playing():
		var now := Time.get_ticks_msec()
		if now - _low_notified_ms > 20000:
			_low_notified_ms = now
			Events.notify.emit("The fire is getting low! Add wood.", "warn")


func _on_extinguished() -> void:
	_out_time = 0.0
	_was_lit = false
	if not GameState.is_playing():
		return
	GameState.stat_add("fire_outs")
	Events.big_message.emit(OUT_MESSAGE, OUT_COLOR, 4.0)
	Audio.play("fire_out", flame_position())


func _on_relit() -> void:
	# Relit by our own relight() (already handled) or by dev tools / tests.
	if Time.get_ticks_msec() - _ignite_ms > 200:
		_ignite_ms = Time.get_ticks_msec()
		_ignite_fx()


func _ignite_fx() -> void:
	_was_lit = true
	_flash = 1.0
	if fx:
		fx.ignite()
	Audio.play("fire_ignite", flame_position())


func _on_level_changed(new_level: int) -> void:
	set_level(new_level, true)


func _on_setting_changed(key: String) -> void:
	if key in ["quality", "reduce_flashing"]:
		_apply_quality()


## Rebuild the fire structure for a level (1..3). celebrate = puff + flare.
func set_level(new_level: int, celebrate: bool = false) -> void:
	level = clampi(new_level, 1, 3)
	_cfg = FirePit.cfg(level)
	interact_radius = float(_cfg["interact"])
	if _pit:
		_pit.mesh = FirePit.build(level)
	if fx:
		fx.position = Vector3(0.0, float(_cfg["base_y"]), 0.0)
		fx.configure(level, _particle_mult())
	if rack:
		rack.configure(level)
	if light:
		light.position = Vector3(0.0, float(_cfg["light_y"]), 0.0)
		core_light.position = Vector3(0.0, float(_cfg["base_y"]) + 0.35, 0.0)
	if _shape:
		var cyl := _shape.shape as CylinderShape3D
		cyl.radius = float(_cfg["col_r"])
		cyl.height = float(_cfg["col_h"])
		_shape.position = Vector3(0.0, float(_cfg["col_h"]) * 0.5, 0.0)
	if _soot:
		var sr := float(_cfg["soot"])
		_soot.size = Vector3(sr * 2.0, 1.6, sr * 2.0)
	_glob_pos = Vector3.INF
	if celebrate:
		FireSparks.celebrate(global_position, float(_cfg["ring"]) + 0.6)
		if fx:
			fx.flare(1.2)
			fx.spark_burst(1.4)
		_flash = 1.0


## Screenshots: pretend the fire went out `t` seconds ago (smoulder / ash).
func debug_set_out_time(t: float) -> void:
	_out_time = maxf(t, 0.0)


# --- Frame update ----------------------------------------------------------------------------

func _process(delta: float) -> void:
	if not _ready_done:
		return
	var fire := GameState.fire
	if GameState.is_playing():
		var raining := false
		var envn: Node = GameState.environment
		if envn and is_instance_valid(envn):
			raining = envn.get("raining") == true
		fire.burn(delta * GameState.time_scale, raining)
	_t += delta
	var lit := fire.is_lit()
	if lit and not _was_lit:
		_was_lit = true
		if Time.get_ticks_msec() - _ignite_ms > 200:
			_ignite_ms = Time.get_ticks_msec()
			_ignite_fx()
	elif not lit and _was_lit:
		_was_lit = false
		_out_time = 0.0
	if not lit:
		_out_time += delta
	if level != fire.level:
		set_level(fire.level, false)
	_wind_t -= delta
	if _wind_t <= 0.0:
		_wind_t = 0.25
		_read_wind()
	var darkness := GameState.day_cycle.darkness()
	var strength := fire.strength()

	# --- FX inputs ---------------------------------------------------------------------
	fx.strength = strength
	fx.intensity = fire.visual_intensity()
	fx.lit = lit
	fx.out_time = _out_time
	fx.darkness = darkness
	fx.wind = _wind
	var vis := fx.visual_strength()

	# --- Lights ------------------------------------------------------------------------
	_pulse = maxf(_pulse - delta / 0.7, 0.0)
	_flash = maxf(_flash - delta / 1.2, 0.0)
	var n := _noise.get_noise_1d(_t * 2.1) * 0.55 + _noise.get_noise_1d(_t * 6.3 + 40.0) * 0.3 + _noise.get_noise_1d(_t * 13.7 + 90.0) * 0.15
	var flick := 1.0 + n * _flicker_amp
	var target_r := fire.light_radius() if lit else 0.0
	_vis_radius = lerpf(_vis_radius, target_r, clampf(delta * 1.5, 0.0, 1.0))
	var level_e: float = LIGHT_ENERGY.get(level, 1.25)
	var e := level_e * (0.35 + 0.65 * vis) * vis * flick * (1.0 + 0.7 * _pulse + 0.9 * _flash)
	light.light_energy = e
	light.omni_range = maxf(_vis_radius * 1.45, 2.0)
	light.visible = e > 0.01
	light.light_volumetric_fog_energy = 0.6
	light.shadow_enabled = _shadows_ok and darkness > 0.04 and light.visible
	# Tiny sway of the light so shadows breathe with the flames.
	var lp := Vector3(0.0, float(_cfg["light_y"]), 0.0)
	light.position = lp + Vector3(_noise.get_noise_1d(_t * 1.7 + 10.0), _noise.get_noise_1d(_t * 2.3 + 20.0) * 0.5, _noise.get_noise_1d(_t * 1.9 + 30.0)) * 0.05 * vis
	var glow := fx.ember_glow()
	var core_e := (1.1 * vis * (1.0 + 0.25 * n) * (1.0 + 0.8 * _pulse + _flash)) if lit else 0.5 * glow
	core_light.light_energy = core_e
	core_light.light_color = CORE_COLOR if lit else Color(1.0, 0.36, 0.12)
	core_light.omni_range = (2.8 + 1.2 * vis) * (1.0 + 0.25 * float(level - 1)) if lit else 1.4
	core_light.visible = core_e > 0.01

	# --- Safe-circle ring decal (night only, shrinks with the fire) -----------------
	var ring_alpha := smoothstep(0.2, 0.75, darkness) * clampf(vis * 1.6, 0.0, 1.0)
	_ring.visible = ring_alpha > 0.01 and _vis_radius > 1.0
	if _ring.visible:
		var half := _vis_radius / RING_FRACTION
		_ring.size = Vector3(half * 2.0, 10.0, half * 2.0)
		var pulse_a := 0.85 + 0.15 * sin(_t * 1.6)
		_ring.modulate = Color(1.0, 0.72, 0.38, ring_alpha * 0.55 * pulse_a)
		_ring.emission_energy = 1.1 * ring_alpha * pulse_a

	# --- Shared shader globals -------------------------------------------------------
	var fp := flame_position()
	if not fp.is_equal_approx(_glob_pos):
		_glob_pos = fp
		RenderingServer.global_shader_parameter_set("fire_position", fp)
	RenderingServer.global_shader_parameter_set("fire_strength", vis if lit else glow * 0.25)
	if _pit:
		_pit.set_instance_shader_parameter("ember_glow", glow * (0.8 + 0.3 * vis))


func _read_wind() -> void:
	var envn: Node = GameState.environment
	if envn and is_instance_valid(envn) and envn.has_method("wind_vector"):
		var w: Variant = envn.call("wind_vector")
		if w is Vector2:
			_wind = w


# --- Feeding visuals -----------------------------------------------------------------------

## A piece of fuel arcs from the player's hands into the flames; the fire
## flares and sparks fly when it lands.
func _toss(id: String, player: Node) -> void:
	var target := flame_position() + Vector3(0.0, 0.15, 0.0)
	var p3 := player as Node3D
	if p3 == null or not is_instance_valid(p3) or not is_inside_tree():
		_land()
		return
	var from := p3.global_position + Vector3(0.0, 1.15, 0.0)
	from += (target - from).normalized() * 0.35
	var node := MeshInstance3D.new()
	node.name = "TossedFuel"
	node.mesh = ItemModels.mesh_for(id)
	node.material_override = CampKit.solid_material()
	node.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	node.scale = Vector3.ONE * 1.5
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	node.global_position = from
	var arc := func(t: float) -> void:
		if not is_instance_valid(node):
			return
		var p := from.lerp(target, t)
		p.y += sin(t * PI) * 0.7
		node.global_position = p
		node.rotation = Vector3(t * 5.0, t * 3.0, 0.0)
	var tw := create_tween()
	tw.tween_method(arc, 0.0, 1.0, 0.32)
	tw.tween_callback(func() -> void:
		if is_instance_valid(node):
			node.queue_free()
		_land())


func _land() -> void:
	_pulse = 1.0
	if fx:
		fx.flare(1.0)
		fx.spark_burst(1.0)


# --- Building ------------------------------------------------------------------------------

func _build() -> void:
	_pit = MeshInstance3D.new()
	_pit.name = "FirePit"
	add_child(_pit)
	fx = FireFX.new()
	add_child(fx)
	rack = CookingRack.new()
	add_child(rack)

	light = OmniLight3D.new()
	light.name = "FireLight"
	light.light_color = LIGHT_COLOR
	light.omni_attenuation = 0.9
	light.shadow_bias = 0.06
	light.shadow_normal_bias = 1.2
	light.shadow_blur = 1.6
	light.light_specular = 0.35
	light.light_volumetric_fog_energy = 0.6
	light.distance_fade_enabled = true
	light.distance_fade_begin = 500.0
	light.distance_fade_shadow = 55.0
	light.distance_fade_length = 20.0
	add_child(light)

	core_light = OmniLight3D.new()
	core_light.name = "CoreLight"
	core_light.light_color = CORE_COLOR
	core_light.omni_range = 3.5
	core_light.omni_attenuation = 1.6
	core_light.shadow_enabled = false
	core_light.light_specular = 0.2
	core_light.light_volumetric_fog_energy = 0.0
	add_child(core_light)

	_body = StaticBody3D.new()
	_body.name = "FireCollider"
	_body.collision_layer = 1
	_body.collision_mask = 0
	_body.set_meta("surface", "stone")
	_shape = CollisionShape3D.new()
	_shape.shape = CylinderShape3D.new()
	_body.add_child(_shape)
	add_child(_body)

	_soot = Decal.new()
	_soot.name = "SootDecal"
	_soot.texture_albedo = _soot_texture()
	_soot.modulate = Color(1, 1, 1, 0.85)
	_soot.normal_fade = 0.4
	_soot.upper_fade = 0.2
	_soot.lower_fade = 0.2
	add_child(_soot)

	_ring = Decal.new()
	_ring.name = "SafeRing"
	_ring.texture_albedo = _ring_texture(false)
	# Decal emission ignores alpha, so the glow texture is premultiplied.
	_ring.texture_emission = _ring_texture(true)
	_ring.albedo_mix = 1.0
	_ring.normal_fade = 0.55
	_ring.upper_fade = 0.35
	_ring.lower_fade = 0.35
	_ring.distance_fade_enabled = true
	_ring.distance_fade_begin = 90.0
	_ring.distance_fade_length = 30.0
	_ring.visible = false
	add_child(_ring)

	_apply_quality()
	set_level(GameState.fire.level, false)


func _particle_mult() -> float:
	match Settings.quality():
		"low":
			return 0.5
		"medium":
			return 0.75
	return 1.0


func _apply_quality() -> void:
	var q := Settings.quality()
	_shadows_ok = q != "low"
	if light:
		light.omni_shadow_mode = OmniLight3D.SHADOW_CUBE if q == "high" else OmniLight3D.SHADOW_DUAL_PARABOLOID
	_flicker_amp = 0.05 if bool(Settings.get_value("reduce_flashing")) else 0.14
	if fx:
		fx.configure(level, _particle_mult())


static func _ring_texture(premultiplied: bool) -> ImageTexture:
	var n := 512
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var c := (n - 1) * 0.5
	for y in n:
		for x in n:
			var dx := (x - c) / c
			var dy := (y - c) / c
			var r := sqrt(dx * dx + dy * dy)
			var ang := atan2(dy, dx)
			# Soft glowing band at RING_FRACTION, a faint warm wash inside it.
			var band := exp(-pow((r - RING_FRACTION) / 0.022, 2.0))
			var outer := exp(-pow((r - RING_FRACTION) / 0.055, 2.0)) * 0.3
			var dots := 0.9 + 0.1 * cos(ang * 96.0)
			var inner := smoothstep(0.55, RING_FRACTION, r) * 0.07 * float(r < RING_FRACTION)
			var a := clampf((band + outer) * dots + inner, 0.0, 1.0)
			if r > 0.995:
				a = 0.0
			if premultiplied:
				img.set_pixel(x, y, Color(a, 0.74 * a, 0.4 * a, 1.0))
			else:
				img.set_pixel(x, y, Color(1.0, 0.74, 0.4, a))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


static func _soot_texture() -> ImageTexture:
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = 77
	noise.frequency = 0.06
	var c := (n - 1) * 0.5
	for y in n:
		for x in n:
			var dx := (x - c) / c
			var dy := (y - c) / c
			var r := sqrt(dx * dx + dy * dy)
			var nz := noise.get_noise_2d(x, y) * 0.5 + 0.5
			var a := (1.0 - smoothstep(0.35, 1.0, r + (nz - 0.5) * 0.35)) * 0.9
			var col := Color(0.07, 0.06, 0.055).lerp(Color(0.32, 0.3, 0.28), smoothstep(0.55, 0.85, nz) * smoothstep(0.2, 0.6, r))
			img.set_pixel(x, y, Color(col.r, col.g, col.b, a))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)
