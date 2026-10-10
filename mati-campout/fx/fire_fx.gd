class_name FireFX
extends Node3D
## The campfire's living visuals: layered flame tongues, a hot core glow,
## rising embers, curling smoke, a glowing ember bed and feed/ignite bursts.
##
## Owned by Campfire, which sets the inputs every frame (strength, intensity,
## lit, out_time, darkness, wind). Placed at the base of the flames; call
## configure(level, particle_mult) when the fire level or quality changes.
##   flare()        flames jump up for ~0.7 s (fed)
##   spark_burst()  shower of sparks
##   ignite()       dramatic relight: sparks, a whoosh of flame, then settle
##
## Everything scales with FireModel.visual_intensity(): big and bright when
## STRONG, smaller/lower/redder when LOW; when OUT the flames vanish, the
## embers smoulder ~20 s, then cold grey ash with a thin wisp of smoke.

const FLAME_SHADER := "res://shaders/fire_flame.gdshader"
const SPARK_SHADER := "res://shaders/fire_sparks.gdshader"
const SMOKE_SHADER := "res://shaders/smoke_puff.gdshader"
const EMBER_SHADER := "res://shaders/fire_embers.gdshader"

## Per fire level: flame height (m), spread radius, tongue size, ember bed radius.
const LEVELS := {
	1: {"height": 1.35, "radius": 0.26, "size": 0.85, "bed": 0.5, "flames": 30, "embers": 34},
	2: {"height": 1.75, "radius": 0.42, "size": 1.0, "bed": 0.72, "flames": 36, "embers": 44},
	3: {"height": 2.5, "radius": 0.42, "size": 1.25, "bed": 0.56, "flames": 40, "embers": 56},
}

# --- Inputs (written by the Campfire) ---------------------------------------------
## 0..1 fire strength (FireModel.strength(), 0 when out).
var strength := 1.0
## FireModel.visual_intensity() (strength * level intensity).
var intensity := 1.0
var lit := true
## Seconds since the fire went out (only meaningful while not lit).
var out_time := 100.0
## 0 = day, 1 = night.
var darkness := 0.0
## Wind direction * strength (x, z).
var wind := Vector2(0.28, 0.21)

var level := 1
var particle_mult := 1.0
## Seconds the embers keep glowing after the fire goes out (balance.fire).
var smoulder_seconds := 20.0

var flames: GPUParticles3D
var core: GPUParticles3D
var embers: GPUParticles3D
var smoke: GPUParticles3D
var burst: GPUParticles3D
var bed: MeshInstance3D
## Two big persistent flame billboards that give the fire its silhouette.
var heroes: Array[MeshInstance3D] = []

var _flame_mat: ShaderMaterial
var _core_mat: ShaderMaterial
var _spark_mat: ShaderMaterial
var _burst_mat: ShaderMaterial
var _smoke_mat: ShaderMaterial
var _bed_mat: ShaderMaterial
var _pm_flames: ParticleProcessMaterial
var _pm_core: ParticleProcessMaterial
var _pm_embers: ParticleProcessMaterial
var _pm_smoke: ParticleProcessMaterial
var _pm_burst: ParticleProcessMaterial
var _flame_quad: QuadMesh
var _hero_mats: Array[ShaderMaterial] = []
var _t := 0.0
var _core_quad: QuadMesh

var _vis := 1.0
var _flare := 0.0
var _ignite := 1.0
var _cfg: Dictionary = LEVELS[1]


func _init() -> void:
	name = "FireFX"


func _ready() -> void:
	smoulder_seconds = maxf(DB.bf("fire.smoulder_seconds", 20.0), 1.0)
	_build()
	configure(level, particle_mult)


## Current smoothed visual strength (0 when out).
func visual_strength() -> float:
	return _vis


## 0..1 ember glow (1 while burning, fading while smouldering).
func ember_glow() -> float:
	if lit:
		return 0.75 + 0.35 * _vis
	return pow(clampf(1.0 - out_time / smoulder_seconds, 0.0, 1.0), 1.4)


func flare(amount: float = 1.0) -> void:
	_flare = clampf(maxf(_flare, amount), 0.0, 1.5)


func spark_burst(amount: float = 1.0) -> void:
	if burst == null:
		return
	_burst_mat.set_shader_parameter("brightness", 1.2 + 0.5 * amount)
	_pm_burst.initial_velocity_min = 2.4 * (0.8 + 0.3 * amount)
	_pm_burst.initial_velocity_max = 5.2 * (0.8 + 0.3 * amount)
	burst.restart()
	burst.emitting = true


func ignite() -> void:
	_ignite = 0.0
	_vis = maxf(_vis, 0.2)
	flare(1.4)
	spark_burst(1.6)


## Fire level (1..3) and quality multiplier for particle counts.
func configure(p_level: int, p_mult: float) -> void:
	level = clampi(p_level, 1, 3)
	particle_mult = clampf(p_mult, 0.25, 1.0)
	_cfg = LEVELS[level]
	if flames == null:
		return
	var sz := float(_cfg["size"])
	var r := float(_cfg["radius"])
	flames.amount = maxi(int(float(_cfg["flames"]) * particle_mult), 14)
	embers.amount = maxi(int(float(_cfg["embers"]) * particle_mult), 10)
	smoke.amount = maxi(int(18.0 * particle_mult), 6)
	core.amount = maxi(int(12.0 * particle_mult), 5)
	burst.amount = maxi(int(64.0 * particle_mult), 20)
	_flame_quad.size = Vector2(0.6, 1.0)
	_pm_flames.emission_sphere_radius = r
	_pm_core.emission_sphere_radius = r * 0.55
	_pm_embers.emission_sphere_radius = r * 0.9
	_pm_smoke.emission_sphere_radius = r * 0.7
	_pm_burst.emission_sphere_radius = r * 0.6
	_pm_smoke.emission_shape_offset = Vector3(0.0, float(_cfg["height"]) * 0.65, 0.0)
	_pm_core.scale_min = sz * 0.9
	_pm_core.scale_max = sz * 1.25
	_build_bed()


func _process(delta: float) -> void:
	if flames == null:
		return
	var target := clampf(strength, 0.0, 1.0) if lit else 0.0
	_vis = move_toward(_vis, target, delta * (0.9 if target > _vis else 1.6))
	_flare = maxf(_flare - delta / 0.7, 0.0)
	_ignite = minf(_ignite + delta / 1.4, 1.0)
	var ig := smoothstep(0.0, 1.0, _ignite)
	var fl := _flare
	var h := float(_cfg["height"])
	var sz := float(_cfg["size"])
	var s := _vis
	var low := smoothstep(0.86, 0.5, s)

	# --- Flames --------------------------------------------------------------------
	var burning := lit and s > 0.02
	flames.emitting = burning
	core.emitting = burning
	if burning:
		var grow := (0.5 + 0.5 * s) * (1.0 + 0.5 * fl) * lerpf(0.35, 1.0, ig)
		flames.amount_ratio = clampf(0.4 + 0.6 * s + 0.2 * fl, 0.2, 1.0)
		_pm_flames.scale_min = sz * 0.7 * grow
		_pm_flames.scale_max = sz * 1.05 * grow
		var up := h * grow
		_pm_flames.initial_velocity_min = up * 0.3
		_pm_flames.initial_velocity_max = up * 0.62
		_pm_flames.gravity = Vector3(wind.x * 1.2, 1.1 + 0.6 * s, wind.y * 1.2)
		_flame_mat.set_shader_parameter("heat", (0.8 + 0.2 * s) * (1.0 + 0.6 * fl))
		_flame_mat.set_shader_parameter("redness", low)
		_core_mat.set_shader_parameter("heat", 0.32 * (1.0 + 0.8 * fl) * lerpf(0.5, 1.0, s))
		_core_mat.set_shader_parameter("redness", low)
		_pm_core.gravity = Vector3(wind.x * 0.6, 0.6, wind.y * 0.6)
		core.amount_ratio = clampf(0.5 + 0.5 * s, 0.3, 1.0)

	# --- Hero flames -----------------------------------------------------------------
	_t += delta
	for i in heroes.size():
		var hero := heroes[i]
		hero.visible = burning
		if not burning:
			continue
		var grow_h := (0.45 + 0.55 * s) * (1.0 + 0.45 * fl) * lerpf(0.25, 1.0, ig)
		var wob := 1.0 + 0.08 * sin(_t * (3.1 + i) + i * 2.0) + 0.05 * sin(_t * 7.3 + i)
		var hh := h * (0.95 if i == 0 else 0.7) * grow_h * wob
		var hw := hh * (0.5 if i == 0 else 0.55)
		hero.scale = Vector3(hw, hh, 1.0)
		var off := Vector3(0.0, 0.0, 0.0) if i == 0 else Vector3(0.12 * cos(_t * 0.7), 0.0, 0.12 * sin(_t * 0.7))
		hero.position = off + Vector3(0.0, hh * 0.42 - 0.05, 0.0)
		var hm := _hero_mats[i]
		hm.set_shader_parameter("heat", (0.62 + 0.18 * s) * (1.0 + 0.5 * fl))
		hm.set_shader_parameter("redness", low)

	# --- Embers (sparks) -------------------------------------------------------------
	var smoulder := clampf(1.0 - out_time / smoulder_seconds, 0.0, 1.0) if not lit else 0.0
	if burning:
		embers.emitting = true
		embers.amount_ratio = clampf(0.3 + 0.7 * s + 0.3 * fl, 0.1, 1.0)
		_pm_embers.initial_velocity_min = 1.0 + 0.8 * s
		_pm_embers.initial_velocity_max = 2.0 + 1.8 * s + 1.5 * fl
	else:
		embers.emitting = smoulder > 0.45
		embers.amount_ratio = 0.12
		_pm_embers.initial_velocity_min = 0.4
		_pm_embers.initial_velocity_max = 1.0
	_pm_embers.gravity = Vector3(wind.x * 1.6, 0.25, wind.y * 1.6)
	_spark_mat.set_shader_parameter("brightness", 0.8 + 0.4 * s if burning else 0.6)
	_pm_burst.gravity = Vector3(wind.x * 1.4, -2.6, wind.y * 1.4)

	# --- Smoke -------------------------------------------------------------------
	var density := 0.3
	var ratio := 0.5
	var sc := 1.0
	if burning:
		ratio = 0.45 + 0.35 * low
		density = 0.26 + 0.12 * low
		sc = 0.8 + 0.3 * s
		_pm_smoke.emission_shape_offset = Vector3(0.0, h * (0.45 + 0.35 * s), 0.0)
	else:
		# Thick smoke right after it dies, then a thin wisp from the ash.
		var just := clampf(1.0 - out_time / 8.0, 0.0, 1.0)
		ratio = lerpf(0.22, 1.0, just)
		density = lerpf(0.22, 0.5, just)
		sc = lerpf(0.55, 1.0, just)
		_pm_smoke.emission_shape_offset = Vector3(0.0, 0.15, 0.0)
	smoke.emitting = true
	smoke.amount_ratio = ratio
	_pm_smoke.scale_min = 1.2 * sc
	_pm_smoke.scale_max = 2.0 * sc
	_pm_smoke.gravity = Vector3(wind.x * 0.9, 0.16, wind.y * 0.9)
	_smoke_mat.set_shader_parameter("density", density)
	_smoke_mat.set_shader_parameter("darkness", darkness)
	_smoke_mat.set_shader_parameter("smoulder_glow", smoulder * 0.35)

	# --- Ember bed -------------------------------------------------------------------
	var glow := ember_glow() * (1.0 + 0.6 * fl)
	_bed_mat.set_shader_parameter("glow", glow)
	_bed_mat.set_shader_parameter("ash", 0.0 if lit else smoothstep(smoulder_seconds * 0.45, smoulder_seconds * 1.1, out_time))
	_bed_mat.set_shader_parameter("redness", low if lit else 1.0)


# --- Building ------------------------------------------------------------------------

func _build() -> void:
	_flame_mat = _shader_mat(FLAME_SHADER)
	_flame_mat.set_shader_parameter("opacity", 0.8)
	_flame_mat.set_shader_parameter("tongue", 1.0)
	_core_mat = _shader_mat(FLAME_SHADER)
	_core_mat.set_shader_parameter("opacity", 0.15)
	_core_mat.set_shader_parameter("tongue", 0.25)
	_core_mat.set_shader_parameter("sway", 0.4)
	_core_mat.set_shader_parameter("scroll_speed", 1.2)
	_spark_mat = _shader_mat(SPARK_SHADER)
	_burst_mat = _shader_mat(SPARK_SHADER)
	_smoke_mat = _shader_mat(SMOKE_SHADER)
	_bed_mat = _shader_mat(EMBER_SHADER)

	_flame_quad = QuadMesh.new()
	_flame_quad.size = Vector2(0.6, 1.0)
	_flame_quad.center_offset = Vector3(0.0, 0.32, 0.0)
	_flame_quad.material = _flame_mat
	_core_quad = QuadMesh.new()
	_core_quad.size = Vector2(1.0, 0.8)
	_core_quad.center_offset = Vector3(0.0, 0.2, 0.0)
	_core_quad.material = _core_mat
	var spark_quad := QuadMesh.new()
	spark_quad.size = Vector2(1.0, 1.0)
	spark_quad.material = _spark_mat
	var burst_quad := QuadMesh.new()
	burst_quad.size = Vector2(1.0, 1.0)
	burst_quad.material = _burst_mat
	var smoke_quad := QuadMesh.new()
	smoke_quad.size = Vector2(1.0, 1.0)
	smoke_quad.material = _smoke_mat

	# Flame tongues.
	_pm_flames = ParticleProcessMaterial.new()
	_pm_flames.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_pm_flames.emission_shape_scale = Vector3(1.0, 0.25, 1.0)
	_pm_flames.direction = Vector3.UP
	_pm_flames.spread = 9.0
	_pm_flames.damping_min = 0.3
	_pm_flames.damping_max = 0.6
	_pm_flames.scale_curve = _curve_tex([Vector2(0.0, 0.4), Vector2(0.22, 1.0), Vector2(0.65, 0.78), Vector2(1.0, 0.18)])
	_pm_flames.turbulence_enabled = true
	_pm_flames.turbulence_noise_strength = 0.7
	_pm_flames.turbulence_noise_scale = 2.2
	_pm_flames.turbulence_noise_speed = Vector3(0.0, 1.5, 0.0)
	_pm_flames.turbulence_influence_min = 0.05
	_pm_flames.turbulence_influence_max = 0.16
	flames = _emitter("Flames", _pm_flames, _flame_quad, 0.85, AABB(Vector3(-2.5, -0.5, -2.5), Vector3(5.0, 5.0, 5.0)))
	flames.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	for i in 2:
		var hm := _shader_mat(FLAME_SHADER)
		hm.set_shader_parameter("fixed_age", 0.32 if i == 0 else 0.4)
		hm.set_shader_parameter("seed_offset", 0.31 * float(i + 1))
		hm.set_shader_parameter("opacity", 0.8)
		hm.set_shader_parameter("scroll_speed", 1.35 + 0.3 * float(i))
		hm.set_shader_parameter("sway", 0.7)
		var hq := QuadMesh.new()
		hq.size = Vector2(1.0, 1.0)
		var hero := MeshInstance3D.new()
		hero.name = "HeroFlame%d" % i
		hero.mesh = hq
		hero.material_override = hm
		hero.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		hero.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		hero.extra_cull_margin = 2.0
		add_child(hero)
		heroes.append(hero)
		_hero_mats.append(hm)

	# Hot core glow at the base of the flames.
	_pm_core = ParticleProcessMaterial.new()
	_pm_core.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_pm_core.emission_shape_scale = Vector3(1.0, 0.2, 1.0)
	_pm_core.direction = Vector3.UP
	_pm_core.spread = 15.0
	_pm_core.initial_velocity_min = 0.1
	_pm_core.initial_velocity_max = 0.35
	_pm_core.scale_curve = _curve_tex([Vector2(0.0, 0.6), Vector2(0.3, 1.0), Vector2(1.0, 0.5)])
	core = _emitter("Core", _pm_core, _core_quad, 0.6, AABB(Vector3(-2.0, -0.5, -2.0), Vector3(4.0, 3.0, 4.0)))

	# Rising embers.
	_pm_embers = ParticleProcessMaterial.new()
	_pm_embers.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_pm_embers.emission_shape_scale = Vector3(1.0, 0.4, 1.0)
	_pm_embers.emission_shape_offset = Vector3(0.0, 0.2, 0.0)
	_pm_embers.direction = Vector3.UP
	_pm_embers.spread = 24.0
	_pm_embers.damping_min = 0.2
	_pm_embers.damping_max = 0.5
	_pm_embers.scale_min = 0.03
	_pm_embers.scale_max = 0.055
	_pm_embers.lifetime_randomness = 0.5
	_pm_embers.turbulence_enabled = true
	_pm_embers.turbulence_noise_strength = 2.4
	_pm_embers.turbulence_noise_scale = 1.4
	_pm_embers.turbulence_noise_speed = Vector3(0.2, 0.6, 0.1)
	_pm_embers.turbulence_influence_min = 0.15
	_pm_embers.turbulence_influence_max = 0.35
	embers = _emitter("Embers", _pm_embers, spark_quad, 2.8, AABB(Vector3(-6.0, -1.0, -6.0), Vector3(12.0, 13.0, 12.0)))

	# Smoke.
	_pm_smoke = ParticleProcessMaterial.new()
	_pm_smoke.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_pm_smoke.direction = Vector3.UP
	_pm_smoke.spread = 12.0
	_pm_smoke.initial_velocity_min = 0.45
	_pm_smoke.initial_velocity_max = 0.8
	_pm_smoke.damping_min = 0.08
	_pm_smoke.damping_max = 0.2
	_pm_smoke.lifetime_randomness = 0.3
	_pm_smoke.scale_curve = _curve_tex([Vector2(0.0, 0.25), Vector2(0.35, 0.65), Vector2(1.0, 1.0)])
	_pm_smoke.color_ramp = _alpha_ramp([Vector2(0.0, 0.0), Vector2(0.12, 0.75), Vector2(0.5, 0.5), Vector2(1.0, 0.0)])
	_pm_smoke.turbulence_enabled = true
	_pm_smoke.turbulence_noise_strength = 0.5
	_pm_smoke.turbulence_noise_scale = 3.0
	_pm_smoke.turbulence_influence_min = 0.02
	_pm_smoke.turbulence_influence_max = 0.07
	smoke = _emitter("Smoke", _pm_smoke, smoke_quad, 6.5, AABB(Vector3(-9.0, -1.0, -9.0), Vector3(18.0, 15.0, 18.0)))
	smoke.draw_order = GPUParticles3D.DRAW_ORDER_VIEW_DEPTH

	# One-shot spark shower (feeding / relighting).
	_pm_burst = ParticleProcessMaterial.new()
	_pm_burst.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_pm_burst.emission_shape_offset = Vector3(0.0, 0.3, 0.0)
	_pm_burst.direction = Vector3.UP
	_pm_burst.spread = 34.0
	_pm_burst.damping_min = 0.6
	_pm_burst.damping_max = 1.2
	_pm_burst.scale_min = 0.03
	_pm_burst.scale_max = 0.06
	_pm_burst.lifetime_randomness = 0.4
	_pm_burst.turbulence_enabled = true
	_pm_burst.turbulence_noise_strength = 1.5
	_pm_burst.turbulence_influence_min = 0.05
	_pm_burst.turbulence_influence_max = 0.2
	burst = _emitter("Burst", _pm_burst, burst_quad, 1.6, AABB(Vector3(-6.0, -1.0, -6.0), Vector3(12.0, 10.0, 12.0)))
	burst.one_shot = true
	burst.explosiveness = 0.92
	burst.emitting = false

	bed = MeshInstance3D.new()
	bed.name = "EmberBed"
	bed.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(bed)


func _emitter(node_name: String, pm: ParticleProcessMaterial, mesh: Mesh, life: float, aabb: AABB) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = node_name
	p.process_material = pm
	p.draw_pass_1 = mesh
	p.lifetime = life
	p.local_coords = false
	p.visibility_aabb = aabb
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	p.preprocess = minf(life, 1.5)
	add_child(p)
	return p


func _build_bed() -> void:
	var r := float(_cfg["bed"])
	var k := MeshKit.new()
	k.paint(Color(0.1, 0.08, 0.07))
	k.lathe(PackedVector2Array([Vector2(0.0, 0.1), Vector2(r * 0.35, 0.095), Vector2(r * 0.7, 0.06),
		Vector2(r * 0.92, 0.02), Vector2(r, -0.02)]), Transform3D.IDENTITY, 20)
	var rng := RandomNumberGenerator.new()
	rng.seed = 4417 + level
	for i in 16:
		var a := rng.randf() * TAU
		var d := sqrt(rng.randf()) * r * 0.82
		var y := lerpf(0.1, 0.02, d / r)
		var cs := rng.randf_range(0.05, 0.11)
		k.blob(Vector3(cos(a) * d, y, sin(a) * d), Vector3(cs, cs * 0.55, cs * 0.8), rng.randi(), 0.3, 8, 5)
	bed.mesh = k.to_mesh(_bed_mat)


static func _shader_mat(path: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	return m


static func _curve_tex(points: Array) -> CurveTexture:
	var c := Curve.new()
	for p in points:
		var v: Vector2 = p
		c.add_point(v)
	var t := CurveTexture.new()
	t.width = 64
	t.curve = c
	return t


## A white gradient whose alpha follows (offset, alpha) points.
static func _alpha_ramp(points: Array) -> GradientTexture1D:
	var g := Gradient.new()
	var offsets := PackedFloat32Array()
	var colors := PackedColorArray()
	for p in points:
		var v: Vector2 = p
		offsets.append(v.x)
		colors.append(Color(1.0, 1.0, 1.0, v.y))
	g.offsets = offsets
	g.colors = colors
	var t := GradientTexture1D.new()
	t.width = 64
	t.gradient = g
	return t
