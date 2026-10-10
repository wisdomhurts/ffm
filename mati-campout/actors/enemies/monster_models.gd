class_name MonsterModel
extends Node3D
## Procedural, skinned shadow-creature models with procedural animation.
##
## Two original, silhouette-first designs:
##   night_stalker  ~2.4 m, thin and hunched, a high shoulder hump, very long
##                  arms with long fingers, a jutting narrow skull, ragged smoke
##                  strands on the back, forearms and hips, two ember-orange eyes.
##   watcher        ~3.4 m, slender and upright, featureless tall head, arms that
##                  hang to the knees, a tattered shroud of shadow strands down
##                  the back, two pale moon-white eyes.
##
## Each creature is ONE skinned MeshInstance3D (body + eye glints = 2 surfaces)
## on a Skeleton3D, plus an optional GPUParticles3D smoke trail, so a full night
## of monsters stays cheap. Meshes are generated once per kind and shared.
## The AI writes the public animation inputs below every frame; this node turns
## them into bone poses (limping walk, lurking crouch, head tracking and creepy
## tilts, wind-up, lunge, light recoil, hit flinch, collapse) and shader params.
##
## Facing: the model looks down -Z; the origin is between the feet.

const BODY_SHADER: Shader = preload("res://shaders/shadow_creature.gdshader")
const EYES_SHADER: Shader = preload("res://shaders/shadow_creature_eyes.gdshader")
const WISP_SHADER: Shader = preload("res://shaders/shadow_creature_wisp.gdshader")

## kind -> {"mesh": ArrayMesh, "bones": Array, "index": Dictionary, "eyes_y": float}
static var _cache: Dictionary = {}
static var _wisp_process: ParticleProcessMaterial = null
static var _wisp_mesh: QuadMesh = null

## Creatures further than this from the camera stop casting shadows.
const SHADOW_DIST := 30.0

var kind := "night_stalker"
var skeleton: Skeleton3D
var body: MeshInstance3D
var wisps: GPUParticles3D

# --- Animation inputs (written by the AI every frame) -----------------------------
## Horizontal speed in m/s (drives the gait).
var move_speed := 0.0
## 0..1 lurking crouch.
var crouch := 0.0
## 0..1 attack wind-up (rear back, arms high).
var windup := 0.0
## 0..1 strike / lunge forward.
var lunge := 0.0
## 0..1 shield-from-light recoil.
var recoil := 0.0
## 0..1 hit flinch (set to 1 on a hit; decays here).
var flinch := 0.0
## 0..1 collapse when defeated.
var death := 0.0
## 0..1 extra eye glow (telegraphs a chase or attack).
var eye_flare := 0.0
## 0 solid .. 1 gone (smoke dissolve).
var dissolve := 0.0
## Hit flash (set to 1 on a hit; decays here).
var flash := 0.0
## World point the head tracks, or Vector3.INF for none.
var look_target := Vector3.INF
## Multiplier for the creepy head tilts (0 = none).
var tilt_amount := 1.0

var head_height := 2.05
var eye_height := 2.05

var _bi: Dictionary = {}
var _rest: Array = []
var _gait := 0.0
var _t := 0.0
var _speed_s := 0.0
var _look := Vector2.ZERO
var _tilt := 0.0
var _tilt_goal := 0.0
var _tilt_timer := 0.0
var _seed := 0.0
var _head_pos := Vector3.ZERO
var _rng := RandomNumberGenerator.new()
var _last_params := Vector3(-1.0, -1.0, -1.0)
var _last_flare := -1.0
var _lod_acc := 0.0
var _lod_frame := 0
var _quality := "high"
var _shadow_on := true


## Build a model for "night_stalker" or "watcher". quality: Settings.quality().
static func create(p_kind: String, p_seed: int = 0, quality: String = "high") -> MonsterModel:
	var m := MonsterModel.new()
	m.kind = p_kind if p_kind == "watcher" else "night_stalker"
	m.name = "Model"
	m._rng.seed = p_seed
	m._seed = float(posmod(p_seed, 1000)) / 1000.0
	m._build(quality)
	return m


func _build(quality: String) -> void:
	var data := _kind_data(kind)
	var bones: Array = data["bones"]
	_bi = data["index"]
	skeleton = Skeleton3D.new()
	skeleton.name = "Skeleton"
	add_child(skeleton)
	for i in bones.size():
		skeleton.add_bone(str(bones[i][0]))
	for i in bones.size():
		var parent := str(bones[i][1])
		var head: Vector3 = bones[i][2]
		var local := head
		if parent != "":
			var pi: int = _bi[parent]
			skeleton.set_bone_parent(i, pi)
			local = head - (bones[pi][2] as Vector3)
		skeleton.set_bone_rest(i, Transform3D(Basis(), local))
		_rest.append(local)
	skeleton.reset_bone_poses()
	body = MeshInstance3D.new()
	body.name = "Body"
	body.mesh = data["mesh"]
	skeleton.add_child(body)
	body.skin = skeleton.create_skin_from_rest_transforms()
	body.skeleton = NodePath("..")
	body.custom_aabb = AABB(Vector3(-1.6, -0.6, -2.2), Vector3(3.2, 4.8, 4.0))
	_quality = quality
	_shadow_on = quality != "low"
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if _shadow_on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	body.set_instance_shader_parameter("seed", _seed)
	_head_pos = bones[_bi["head"]][2]
	head_height = _head_pos.y
	eye_height = float(data["eyes_y"])
	_tilt_timer = _rng.randf_range(0.5, 2.0)
	_gait = _rng.randf()
	if quality != "low":
		_build_wisps(quality)
	_apply_params()


func _build_wisps(quality: String) -> void:
	if _wisp_process == null:
		var pm := ParticleProcessMaterial.new()
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		pm.direction = Vector3(0.0, 1.0, 0.25)
		pm.spread = 35.0
		pm.initial_velocity_min = 0.15
		pm.initial_velocity_max = 0.45
		pm.gravity = Vector3(0.0, 0.35, 0.0)
		pm.damping_min = 0.4
		pm.damping_max = 0.9
		pm.angle_min = -180.0
		pm.angle_max = 180.0
		pm.angular_velocity_min = -25.0
		pm.angular_velocity_max = 25.0
		pm.scale_min = 0.55
		pm.scale_max = 1.0
		var sc := Curve.new()
		sc.add_point(Vector2(0.0, 0.45))
		sc.add_point(Vector2(0.5, 0.9))
		sc.add_point(Vector2(1.0, 1.25))
		var sct := CurveTexture.new()
		sct.curve = sc
		pm.scale_curve = sct
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 1, 0.0))
		g.set_color(1, Color(1, 1, 1, 0.0))
		g.add_point(0.2, Color(1, 1, 1, 0.75))
		g.add_point(0.6, Color(0.9, 0.85, 1.0, 0.45))
		var gt := GradientTexture1D.new()
		gt.gradient = g
		pm.color_ramp = gt
		_wisp_process = pm
		var q := QuadMesh.new()
		q.size = Vector2(0.75, 0.75)
		var mat := ShaderMaterial.new()
		mat.shader = WISP_SHADER
		mat.set_shader_parameter("opacity", 0.6)
		mat.set_shader_parameter("glow", 0.45)
		q.material = mat
		_wisp_mesh = q
	wisps = GPUParticles3D.new()
	wisps.name = "Wisps"
	var pmi := _wisp_process.duplicate() as ParticleProcessMaterial
	if kind == "watcher":
		pmi.emission_box_extents = Vector3(0.16, 0.85, 0.14)
		wisps.position = Vector3(0.0, 2.1, 0.08)
	else:
		pmi.emission_box_extents = Vector3(0.22, 0.42, 0.2)
		wisps.position = Vector3(0.0, 1.55, -0.08)
	wisps.process_material = pmi
	wisps.draw_pass_1 = _wisp_mesh
	wisps.amount = 14 if quality == "high" else 8
	wisps.lifetime = 1.8
	wisps.local_coords = false
	wisps.randomness = 0.5
	wisps.preprocess = 1.0
	wisps.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wisps.visibility_aabb = AABB(Vector3(-3, -3, -3), Vector3(6, 7, 6))
	wisps.seed = _rng.randi()
	add_child(wisps)


# --- Per-frame animation ---------------------------------------------------------------

func _ready() -> void:
	Settings.changed.connect(_on_setting)


func _on_setting(key: String) -> void:
	if key == "quality" and body:
		_quality = Settings.quality()
		_set_shadow(_quality != "low")
		if wisps:
			wisps.visible = _quality != "low"


func _set_shadow(on: bool) -> void:
	if body == null or on == _shadow_on:
		return
	_shadow_on = on
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _process(delta: float) -> void:
	if skeleton == null or not is_visible_in_tree():
		return
	# Animation LOD: far creatures re-pose every 2nd / 4th frame.
	_lod_acc += delta
	var cam := get_viewport().get_camera_3d()
	if cam:
		var d := cam.global_position.distance_to(global_position)
		var every := 1 if d < 35.0 else (2 if d < 60.0 else 4)
		_set_shadow(d < SHADOW_DIST and _quality != "low")
		_lod_frame += 1
		if _lod_frame < every:
			return
	_lod_frame = 0
	delta = minf(_lod_acc, 0.12)
	_lod_acc = 0.0
	_t += delta
	_speed_s = lerpf(_speed_s, move_speed, 1.0 - exp(-delta * 8.0))
	flinch = maxf(flinch - delta * 3.5, 0.0)
	flash = maxf(flash - delta * 5.0, 0.0)
	_update_look(delta)
	_update_tilt(delta)
	if kind == "watcher":
		_pose_watcher(delta)
	else:
		_pose_stalker(delta)
	_plant_feet()
	_apply_params()


func _apply_params() -> void:
	if body == null:
		return
	var v := Vector3(dissolve, flash, 0.0)
	if not v.is_equal_approx(_last_params):
		_last_params = v
		body.set_instance_shader_parameter("dissolve", dissolve)
		body.set_instance_shader_parameter("flash", flash)
	if not is_equal_approx(eye_flare, _last_flare):
		_last_flare = eye_flare
		body.set_instance_shader_parameter("eye_flare", eye_flare)
	if wisps:
		wisps.emitting = dissolve < 0.65 and is_visible_in_tree()


func _update_look(delta: float) -> void:
	var want := Vector2.ZERO
	if look_target != Vector3.INF and is_inside_tree():
		var local := global_transform.affine_inverse() * look_target
		var d := local - _head_pos
		var flat := Vector2(d.x, d.z).length()
		if flat > 0.05:
			want.x = clampf(atan2(-d.x, -d.z), -1.35, 1.35)
			want.y = clampf(atan2(d.y, flat), -0.75, 0.65)
	var speed := 2.2 if kind == "watcher" else 6.0
	_look = _look.lerp(want, 1.0 - exp(-delta * speed))


func _update_tilt(delta: float) -> void:
	_tilt_timer -= delta
	if _tilt_timer <= 0.0:
		if kind == "watcher":
			_tilt_goal = _rng.randf_range(-0.38, 0.38) if _rng.randf() < 0.6 else 0.0
			_tilt_timer = _rng.randf_range(2.5, 6.0)
		else:
			_tilt_goal = _rng.randf_range(-0.5, 0.5) if _rng.randf() < 0.7 else 0.0
			_tilt_timer = _rng.randf_range(0.9, 3.2)
	var speed := 1.3 if kind == "watcher" else 10.0
	_tilt = lerpf(_tilt, _tilt_goal * tilt_amount, 1.0 - exp(-delta * speed))


func _rot(bone_name: String, e: Vector3) -> void:
	skeleton.set_bone_pose_rotation(_bi[bone_name], Quaternion.from_euler(e))


func _pos(bone_name: String, offset: Vector3) -> void:
	var i: int = _bi[bone_name]
	skeleton.set_bone_pose_position(i, (_rest[i] as Vector3) + offset)


func _pose_stalker(delta: float) -> void:
	var sp := _speed_s
	var walk := clampf(sp / 2.2, 0.0, 1.0)
	var run := clampf((sp - 3.4) / 2.8, 0.0, 1.0)
	var stride := lerpf(1.45, 2.7, run)
	_gait = fposmod(_gait + sp * delta / stride, 1.0)
	var p := _gait * TAU
	# The left leg limps: it lags, swings less and the hips dip onto it.
	var pl := p + PI + 0.5 * sin(p)
	var t := _t + _seed * 17.0
	var breathe := sin(t * 1.6) * 0.5 + 0.5
	var cr := crouch
	var wu := windup
	var lu := lunge
	var rc := recoil
	var fl := flinch
	var de := death
	var limp := walk * (1.0 - run * 0.7)

	var bob := -absf(sin(p)) * 0.04 * walk - maxf(sin(pl), 0.0) * 0.07 * limp
	_pos("hips", Vector3(0.0, bob - cr * 0.12 - wu * 0.08 + lu * 0.04, -lu * 0.22 + rc * 0.12 + cr * 0.06))
	_rot("hips", Vector3(-0.12 * run - de * 0.3, sin(p) * 0.14 * walk, sin(p) * 0.06 * walk + maxf(sin(pl), 0.0) * 0.09 * limp))

	var lean := -0.1 * walk - 0.32 * run - cr * 0.42 + wu * 0.5 - lu * 0.6 + rc * 0.38 + fl * 0.32 - de * 0.55
	var twist := -sin(p) * 0.1 * walk
	_rot("spine", Vector3(lean * 0.5 + breathe * 0.02, twist * 0.5 + rc * 0.15, -sin(p) * 0.05 * walk + fl * 0.1))
	_rot("chest", Vector3(lean * 0.5 - breathe * 0.05, twist + rc * 0.25, -sin(p) * 0.04 * walk))

	var tilt := _tilt + fl * 0.4 + sin(t * 0.8) * 0.05
	var lk := _look * (1.0 - de)
	_rot("neck", Vector3(lk.y * 0.4 + wu * 0.2 - cr * 0.35 - de * 0.3 - rc * 0.1, lk.x * 0.4 + rc * 0.35, tilt * 0.3))
	_rot("head", Vector3(lk.y * 0.6 + wu * 0.38 - rc * 0.45 - de * 0.35 + cr * 0.3, lk.x * 0.6 + rc * 0.45, tilt))

	for side: float in [1.0, -1.0]:
		var sfx := ".R" if side > 0.0 else ".L"
		var leg_ph := p if side > 0.0 else pl
		var reach := lerpf(1.0, 0.75, float(side < 0.0) * limp)
		# Arms swing against the leg on the same side, with lazy pendulum lag.
		var swing := -sin(leg_ph) * (0.3 * walk + 0.55 * run)
		var sway := sin(t * 1.25 + side * 1.7) * 0.06 + sin(t * 0.41 + side * 2.3) * 0.04
		var up := swing + sway + wu * 2.5 + lu * 1.25 + rc * 1.7 - de * 0.25 + cr * 0.5
		var out := 0.03 + 0.05 * walk + wu * 0.45 - rc * 0.4 + fl * 0.3 + de * 0.15 + run * 0.1 + cr * 0.12
		_rot("shoulder" + sfx, Vector3(0.0, side * (rc * 0.2 - wu * 0.15), side * (wu * 0.3 + breathe * 0.03 + fl * 0.1)))
		_rot("arm" + sfx, Vector3(up, side * (wu * 0.2 - rc * 0.35), side * out))
		var elbow := 0.2 + 0.2 * walk + 0.35 * run + wu * 0.65 + rc * 1.5 - lu * 0.15 + sin(leg_ph - 0.8) * 0.16 * walk + cr * 0.45
		_rot("forearm" + sfx, Vector3(elbow, 0.0, side * 0.05))
		_rot("hand" + sfx, Vector3(sin(t * 2.1 + side) * 0.08 + wu * 0.45 - lu * 0.4 + rc * 0.3, 0.0, -side * 0.1))
		var thigh := sin(leg_ph) * (0.42 * walk + 0.32 * run) * reach + cr * 0.75 + wu * 0.22 - lu * 0.2 + de * 1.0
		var knee := -maxf(0.0, cos(leg_ph)) * (0.6 * walk + 0.7 * run) * reach - cr * 1.3 - wu * 0.3 - de * 1.6
		_rot("thigh" + sfx, Vector3(thigh, side * cr * 0.4, side * (0.05 + cr * 0.42 + de * 0.15)))
		_rot("shin" + sfx, Vector3(knee, 0.0, 0.0))
		_rot("foot" + sfx, Vector3(-(thigh + knee) * 0.75, 0.0, 0.0))


func _pose_watcher(delta: float) -> void:
	var sp := _speed_s
	var walk := clampf(sp / 1.6, 0.0, 1.0)
	var run := clampf((sp - 2.6) / 3.5, 0.0, 1.0)
	var stride := lerpf(2.2, 3.6, run)
	_gait = fposmod(_gait + sp * delta / stride, 1.0)
	var p := _gait * TAU
	var t := _t + _seed * 13.0
	var breathe := sin(t * 0.9) * 0.5 + 0.5
	var wu := windup
	var lu := lunge
	var rc := recoil
	var fl := flinch
	var de := death

	_pos("hips", Vector3(0.0, -absf(sin(p)) * 0.05 * walk - de * 1.2 - wu * 0.05, -lu * 0.25))
	_rot("hips", Vector3(-0.1 * run, sin(p) * 0.06 * walk, sin(p) * 0.04 * walk))
	var lean := -0.04 * walk - 0.35 * run + wu * 0.15 - lu * 0.4 + rc * 0.3 + fl * 0.25 - de * 0.5
	_rot("spine", Vector3(lean * 0.5 + breathe * 0.012, -sin(p) * 0.03 * walk, sin(t * 0.31) * 0.02))
	_rot("chest", Vector3(lean * 0.5 - breathe * 0.025, -sin(p) * 0.05 * walk + rc * 0.3, -sin(t * 0.31) * 0.025))
	var lk := _look * (1.0 - de)
	var tilt := _tilt + fl * 0.3
	_rot("neck", Vector3(lk.y * 0.35 - de * 0.4, lk.x * 0.35 + rc * 0.4, tilt * 0.35))
	_rot("head", Vector3(lk.y * 0.65 - rc * 0.3 - de * 0.3, lk.x * 0.65 + rc * 0.4, tilt))
	for side: float in [1.0, -1.0]:
		var sfx := ".R" if side > 0.0 else ".L"
		var ph := p if side > 0.0 else p + PI
		var swing := -sin(ph) * (0.08 * walk + 0.7 * run)
		var sway := sin(t * 0.7 + side * 1.3) * 0.025
		_rot("shoulder" + sfx, Vector3(0.0, 0.0, side * (breathe * 0.02 + wu * 0.2)))
		_rot("arm" + sfx, Vector3(swing + sway + wu * 1.35 + lu * 1.45 + rc * 1.6 - run * 0.5, side * -rc * 0.3, side * (0.04 + fl * 0.25 + run * 0.15 - rc * 0.3)))
		_rot("forearm" + sfx, Vector3(0.06 + 0.15 * run + wu * 0.2 + rc * 1.3 + sin(t * 0.6 + side) * 0.03, 0.0, 0.0))
		_rot("hand" + sfx, Vector3(sin(t * 0.9 + side * 2.0) * 0.06 + wu * 0.3 - lu * 0.3, 0.0, 0.0))
		var thigh := sin(ph) * (0.32 * walk + 0.4 * run) + de * 0.9
		var knee := -maxf(0.0, cos(ph)) * (0.18 * walk + 0.75 * run) - de * 1.5
		_rot("thigh" + sfx, Vector3(thigh, 0.0, side * 0.025))
		_rot("shin" + sfx, Vector3(knee, 0.0, 0.0))
		_rot("foot" + sfx, Vector3(-(thigh + knee) * 0.8, 0.0, 0.0))


## Shift the hips so the lower foot rests on the ground (no floating or sunken
## feet whatever the crouch or stride). Skipped while collapsing.
func _plant_feet() -> void:
	if death > 0.5:
		return
	skeleton.force_update_all_bone_transforms()
	var l := skeleton.get_bone_global_pose(_bi["foot.L"]).origin.y
	var r := skeleton.get_bone_global_pose(_bi["foot.R"]).origin.y
	var rest_y: float = (skeleton.get_bone_global_rest(_bi["foot.L"]).origin.y)
	var err := rest_y - minf(l, r)
	var hips: int = _bi["hips"]
	var pos := skeleton.get_bone_pose_position(hips)
	pos.y += err * (1.0 - death) * (1.0 - lunge * 0.5)
	skeleton.set_bone_pose_position(hips, pos)


# --- Mesh generation (once per kind) --------------------------------------------------

static func _kind_data(p_kind: String) -> Dictionary:
	if _cache.has(p_kind):
		return _cache[p_kind]
	var bones: Array = _watcher_bones() if p_kind == "watcher" else _stalker_bones()
	var index := {}
	var heads := {}
	for i in bones.size():
		index[str(bones[i][0])] = i
		heads[str(bones[i][0])] = bones[i][2]
	var b := _Builder.new()
	b.index = index
	var eyes_y := 2.0
	if p_kind == "watcher":
		eyes_y = _build_watcher(b, heads)
	else:
		eyes_y = _build_stalker(b, heads)
	var mesh := ArrayMesh.new()
	b.commit_body(mesh, _body_material(p_kind))
	b.commit_eyes(mesh, _eye_material(p_kind))
	var data := {"mesh": mesh, "bones": bones, "index": index, "eyes_y": eyes_y}
	_cache[p_kind] = data
	return data


static func _body_material(p_kind: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = BODY_SHADER
	if p_kind == "watcher":
		m.set_shader_parameter("body_color", Color(0.045, 0.045, 0.07))
		m.set_shader_parameter("sss_color", Color(0.3, 0.2, 0.55))
		m.set_shader_parameter("rim_color", Color(0.5, 0.52, 0.85))
		m.set_shader_parameter("rim_glow", 0.22)
		m.set_shader_parameter("edge_ragged", 0.5)
	return m


static func _eye_material(p_kind: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = EYES_SHADER
	if p_kind == "watcher":
		m.set_shader_parameter("eye_color", Color(0.72, 0.84, 1.0))
		m.set_shader_parameter("core_color", Color(0.95, 0.97, 1.0))
		m.set_shader_parameter("energy", 2.6)
		m.set_shader_parameter("core_size", 0.03)
		m.set_shader_parameter("halo_size", 0.09)
		m.set_shader_parameter("aspect", 0.75)
	else:
		m.set_shader_parameter("eye_color", Color(1.0, 0.42, 0.1))
		m.set_shader_parameter("core_color", Color(1.0, 0.82, 0.5))
		m.set_shader_parameter("energy", 3.6)
		m.set_shader_parameter("core_size", 0.04)
		m.set_shader_parameter("halo_size", 0.12)
		m.set_shader_parameter("aspect", 0.5)
	return m


## [name, parent, joint position in model space]
static func _stalker_bones() -> Array:
	var b: Array = [
		["hips", "", Vector3(0.0, 1.12, 0.05)],
		["spine", "hips", Vector3(0.0, 1.32, 0.02)],
		["chest", "spine", Vector3(0.0, 1.68, -0.13)],
		["neck", "chest", Vector3(0.0, 2.0, -0.36)],
		["head", "neck", Vector3(0.0, 2.07, -0.53)],
	]
	for s: float in [1.0, -1.0]:
		var sfx := ".R" if s > 0.0 else ".L"
		b.append(["shoulder" + sfx, "chest", Vector3(0.08 * s, 1.92, -0.26)])
		b.append(["arm" + sfx, "shoulder" + sfx, Vector3(0.3 * s, 1.91, -0.25)])
		b.append(["forearm" + sfx, "arm" + sfx, Vector3(0.37 * s, 1.37, -0.37)])
		b.append(["hand" + sfx, "forearm" + sfx, Vector3(0.38 * s, 0.83, -0.49)])
		b.append(["thigh" + sfx, "hips", Vector3(0.15 * s, 1.07, 0.04)])
		b.append(["shin" + sfx, "thigh" + sfx, Vector3(0.19 * s, 0.6, -0.16)])
		b.append(["foot" + sfx, "shin" + sfx, Vector3(0.19 * s, 0.11, 0.06)])
	return b


static func _watcher_bones() -> Array:
	var b: Array = [
		["hips", "", Vector3(0.0, 1.74, 0.0)],
		["spine", "hips", Vector3(0.0, 1.98, 0.0)],
		["chest", "spine", Vector3(0.0, 2.42, 0.02)],
		["neck", "chest", Vector3(0.0, 2.8, 0.01)],
		["head", "neck", Vector3(0.0, 2.95, -0.01)],
	]
	for s: float in [1.0, -1.0]:
		var sfx := ".R" if s > 0.0 else ".L"
		b.append(["shoulder" + sfx, "chest", Vector3(0.07 * s, 2.7, 0.03)])
		b.append(["arm" + sfx, "shoulder" + sfx, Vector3(0.26 * s, 2.68, 0.03)])
		b.append(["forearm" + sfx, "arm" + sfx, Vector3(0.32 * s, 2.0, 0.06)])
		b.append(["hand" + sfx, "forearm" + sfx, Vector3(0.35 * s, 1.33, 0.03)])
		b.append(["thigh" + sfx, "hips", Vector3(0.12 * s, 1.7, 0.0)])
		b.append(["shin" + sfx, "thigh" + sfx, Vector3(0.14 * s, 0.93, -0.03)])
		b.append(["foot" + sfx, "shin" + sfx, Vector3(0.14 * s, 0.1, 0.03)])
	return b


## Key for _Builder.loft: position, radius across (side), radius depth,
## bone weights {bone: w}, tatter 0..1, ambient occlusion 0..1.
static func _k(p: Vector3, rx: float, rz: float, w: Dictionary, tat: float = 0.0, ao: float = 1.0) -> Dictionary:
	return {"p": p, "rx": rx, "rz": rz, "w": w, "tat": tat, "ao": ao}


## A hanging ragged ribbon of shadow from `root` along `dir` (bent by `bend`).
## The tatter mask rises toward the tip, where the shader frays it into smoke.
static func _strand(b: _Builder, root: Vector3, dir: Vector3, length: float, width: float, side: Vector3, w_root: Dictionary, w_tip: Dictionary, bend: Vector3 = Vector3.ZERO) -> void:
	var keys: Array = []
	var n := 4
	for i in n + 1:
		var f := float(i) / n
		var p := root + dir * length * f + bend * f * f
		var w := _Builder._blend(w_root, w_tip, f)
		var wd := width * lerpf(0.75, 1.0, sin(f * PI)) * lerpf(1.0, 0.6, f)
		keys.append(_k(p, wd, 0.011, w, 0.06 + 0.94 * f, lerpf(0.7, 1.0, f)))
	b.loft(keys, side, 4, 2, true, true, 0.3)


## One continuous, smoothly skinned limb through `pts` (radii rx/rz, weights w).
static func _limb(b: _Builder, pts: Array, side: Vector3, sides: int = 8) -> void:
	b.loft(pts, side, sides, 2)


static func _build_stalker(b: _Builder, H: Dictionary) -> float:
	var X := Vector3.RIGHT
	# Torso: pelvis, pinched waist, ribcage, hunched upper back, forward neck.
	b.loft([
		_k(Vector3(0.0, 0.96, 0.08), 0.12, 0.09, {"hips": 1.0}, 0.0, 0.7),
		_k(Vector3(0.0, 1.1, 0.06), 0.2, 0.15, {"hips": 1.0}),
		_k(Vector3(0.0, 1.3, 0.02), 0.155, 0.12, {"hips": 0.3, "spine": 0.7}),
		_k(Vector3(0.0, 1.5, -0.04), 0.215, 0.155, {"spine": 0.7, "chest": 0.3}),
		_k(Vector3(0.0, 1.7, -0.13), 0.27, 0.185, {"chest": 1.0}),
		_k(Vector3(0.0, 1.88, -0.24), 0.25, 0.18, {"chest": 1.0}),
		_k(Vector3(0.0, 1.99, -0.34), 0.15, 0.12, {"chest": 0.6, "neck": 0.4}),
		_k(Vector3(0.0, 2.04, -0.45), 0.075, 0.08, {"neck": 1.0}),
	], X, 12, 3)
	# Broad hunched hump over the shoulder blades.
	b.blob(Vector3(0.0, 1.87, -0.12), Vector3(0.0, 0.85, -0.52), 0.22, 0.21, 0.1, X, {"chest": 1.0})
	# Head: narrow skull jutting forward, flat-ish face, heavy brow.
	b.loft([
		_k(Vector3(0.0, 2.03, -0.44), 0.07, 0.074, {"neck": 0.6, "head": 0.4}),
		_k(Vector3(0.0, 2.09, -0.53), 0.105, 0.115, {"head": 1.0}),
		_k(Vector3(0.0, 2.1, -0.62), 0.115, 0.12, {"head": 1.0}),
		_k(Vector3(0.0, 2.07, -0.71), 0.1, 0.1, {"head": 1.0}),
		_k(Vector3(0.0, 2.02, -0.78), 0.072, 0.07, {"head": 1.0}),
	], X, 12, 3, true, true, 0.45)
	b.blob(Vector3(0.0, 2.1, -0.72), Vector3(0.0, -0.3, -1.0).normalized(), 0.05, 0.115, 0.045, X, {"head": 1.0})
	# Smoky crest sweeping back off the skull.
	for i in 3:
		var x := (float(i) - 1.0) * 0.055
		_strand(b, Vector3(x, 2.15, -0.6), Vector3(x * 2.0, 0.15, 1.0).normalized(), 0.34 - absf(x) * 1.5, 0.06, X, {"head": 1.0}, {"head": 0.6, "neck": 0.4}, Vector3(0.0, -0.1, 0.0))
	var eye_fwd := Vector3(0.0, -0.12, -1.0).normalized()
	for s: float in [1.0, -1.0]:
		b.eye(Vector3(0.042 * s, 2.045, -0.795), eye_fwd, Vector3(1.0, 0.0, 0.08 * s).normalized(), {"head": 1.0})

	for s: float in [1.0, -1.0]:
		var sfx := ".R" if s > 0.0 else ".L"
		var sh: Vector3 = H["shoulder" + sfx]
		var a: Vector3 = H["arm" + sfx]
		var e: Vector3 = H["forearm" + sfx]
		var w: Vector3 = H["hand" + sfx]
		var down := (w - e).normalized()
		var palm_end := w + down * 0.12
		# Collarbone, bony shoulder, long thin arm and narrow palm in one piece.
		_limb(b, [
			_k(sh + Vector3(-0.07 * s, -0.01, 0.0), 0.07, 0.07, {"chest": 0.6, "shoulder" + sfx: 0.4}),
			_k(sh.lerp(a, 0.55), 0.08, 0.075, {"shoulder" + sfx: 1.0}),
			_k(a + Vector3(0.0, -0.02, 0.0), 0.08, 0.078, {"shoulder" + sfx: 0.35, "arm" + sfx: 0.65}),
			_k(a.lerp(e, 0.3), 0.068, 0.064, {"arm" + sfx: 1.0}),
			_k(a.lerp(e, 0.78), 0.05, 0.048, {"arm" + sfx: 1.0}),
			_k(e, 0.048, 0.047, {"arm" + sfx: 0.5, "forearm" + sfx: 0.5}, 0.0, 0.85),
			_k(e.lerp(w, 0.25), 0.054, 0.05, {"forearm" + sfx: 1.0}),
			_k(e.lerp(w, 0.8), 0.036, 0.033, {"forearm" + sfx: 1.0}),
			_k(w, 0.034, 0.028, {"forearm" + sfx: 0.5, "hand" + sfx: 0.5}),
			_k(w + down * 0.06, 0.05, 0.022, {"hand" + sfx: 1.0}),
			_k(palm_end, 0.045, 0.02, {"hand" + sfx: 1.0}),
		], Vector3.FORWARD)
		# Ragged sleeves of smoke.
		for i in 2:
			var root := e.lerp(w, 0.2 + 0.3 * i) + Vector3(0.0, 0.0, 0.035)
			_strand(b, root, Vector3(0.12 * s, -1.0, 0.55).normalized(), 0.3 + 0.08 * i, 0.055, X, {"forearm" + sfx: 1.0}, {"forearm" + sfx: 1.0})
		# Four long, thin, rounded fingers plus a thumb.
		var inward := Vector3(-s, 0.0, 0.0)
		for fi in 4:
			var off := lerpf(-0.034, 0.034, float(fi) / 3.0)
			var length := 0.24 + 0.05 * (1.0 - absf(off) / 0.034)
			var f0 := palm_end + Vector3(0.0, 0.0, off) - down * 0.01
			var f1 := f0 + down * length * 0.5 + Vector3(0.0, 0.0, off * 0.5) + inward * 0.015
			var f2 := f1 + down * length * 0.5 + Vector3(0.0, 0.0, off * 0.3) + inward * 0.05
			b.loft([
				_k(f0, 0.014, 0.014, {"hand" + sfx: 1.0}),
				_k(f1, 0.011, 0.011, {"hand" + sfx: 1.0}),
				_k(f2, 0.004, 0.004, {"hand" + sfx: 1.0}),
			], X, 5, 2)
		var th0 := w + down * 0.05 + Vector3(0.0, 0.0, -0.035)
		b.loft([
			_k(th0, 0.013, 0.013, {"hand" + sfx: 1.0}),
			_k(th0 + down * 0.08 + Vector3(0.0, 0.0, -0.04) + inward * 0.02, 0.009, 0.009, {"hand" + sfx: 1.0}),
			_k(th0 + down * 0.15 + Vector3(0.0, 0.0, -0.045) + inward * 0.05, 0.004, 0.004, {"hand" + sfx: 1.0}),
		], X, 5, 2)

		# Leg: lean thigh, thin shin bent forward, long narrow foot, one piece.
		var hp: Vector3 = H["thigh" + sfx]
		var kn: Vector3 = H["shin" + sfx]
		var an: Vector3 = H["foot" + sfx]
		var toe := Vector3(0.19 * s, 0.03, -0.24)
		_limb(b, [
			_k(hp + Vector3(-0.03 * s, 0.07, 0.0), 0.1, 0.1, {"hips": 0.6, "thigh" + sfx: 0.4}, 0.0, 0.75),
			_k(hp.lerp(kn, 0.28), 0.1, 0.095, {"thigh" + sfx: 1.0}),
			_k(hp.lerp(kn, 0.8), 0.064, 0.062, {"thigh" + sfx: 1.0}),
			_k(kn, 0.06, 0.06, {"thigh" + sfx: 0.5, "shin" + sfx: 0.5}),
			_k(kn.lerp(an, 0.3), 0.054, 0.052, {"shin" + sfx: 1.0}),
			_k(kn.lerp(an, 0.85), 0.038, 0.038, {"shin" + sfx: 1.0}),
			_k(an, 0.038, 0.036, {"shin" + sfx: 0.5, "foot" + sfx: 0.5}, 0.0, 0.85),
			_k(an.lerp(toe, 0.45) + Vector3(0.0, -0.035, 0.0), 0.05, 0.028, {"foot" + sfx: 1.0}, 0.0, 0.7),
			_k(toe, 0.028, 0.016, {"foot" + sfx: 1.0}, 0.0, 0.7),
		], X)

	# Smoky mane down the hump and a ragged skirt of shadow at the hips.
	var mane := [Vector3(-0.07, 1.96, -0.1), Vector3(0.07, 1.96, -0.1), Vector3(0.0, 1.93, -0.04), Vector3(-0.11, 1.84, 0.0), Vector3(0.11, 1.84, 0.0), Vector3(0.0, 1.76, 0.06)]
	for i in mane.size():
		var root: Vector3 = mane[i]
		# Lie along the hump and spill down the back.
		var dir := Vector3(root.x * 1.4, -0.95, 1.0).normalized()
		_strand(b, root, dir, 0.4 + 0.07 * float(i % 3), 0.07, X, {"chest": 1.0}, {"chest": 0.5, "spine": 0.5}, Vector3(0.0, -0.12, -0.06))
	for ang: float in [-1.9, -1.0, 0.0, 1.0, 1.9]:
		var dirv := Vector3(sin(ang), 0.0, cos(ang))
		var root := Vector3(0.0, 1.07, 0.06) + dirv * 0.17
		_strand(b, root, (dirv * 0.3 + Vector3.DOWN).normalized(), 0.34 + 0.08 * absf(sin(ang * 2.3)), 0.09, Vector3(dirv.z, 0.0, -dirv.x), {"hips": 1.0}, {"hips": 1.0})
	return 2.045


static func _build_watcher(b: _Builder, H: Dictionary) -> float:
	var X := Vector3.RIGHT
	# Slender upright body.
	b.loft([
		_k(Vector3(0.0, 1.6, 0.0), 0.1, 0.08, {"hips": 1.0}, 0.0, 0.7),
		_k(Vector3(0.0, 1.74, 0.0), 0.155, 0.105, {"hips": 1.0}),
		_k(Vector3(0.0, 1.98, 0.0), 0.11, 0.085, {"hips": 0.3, "spine": 0.7}),
		_k(Vector3(0.0, 2.25, 0.01), 0.14, 0.095, {"spine": 0.6, "chest": 0.4}),
		_k(Vector3(0.0, 2.5, 0.02), 0.18, 0.11, {"chest": 1.0}),
		_k(Vector3(0.0, 2.67, 0.025), 0.17, 0.1, {"chest": 1.0}),
		_k(Vector3(0.0, 2.78, 0.015), 0.075, 0.065, {"chest": 0.5, "neck": 0.5}),
		_k(Vector3(0.0, 2.93, 0.0), 0.047, 0.047, {"neck": 0.7, "head": 0.3}),
	], X, 12, 3)
	# Tall featureless head.
	b.loft([
		_k(Vector3(0.0, 2.91, -0.005), 0.047, 0.047, {"neck": 0.5, "head": 0.5}),
		_k(Vector3(0.0, 3.0, -0.015), 0.085, 0.095, {"head": 1.0}),
		_k(Vector3(0.0, 3.14, -0.02), 0.098, 0.112, {"head": 1.0}),
		_k(Vector3(0.0, 3.29, -0.012), 0.09, 0.1, {"head": 1.0}),
		_k(Vector3(0.0, 3.38, 0.0), 0.055, 0.06, {"head": 1.0}),
	], X, 12, 3, true, true, 0.7)
	for s: float in [1.0, -1.0]:
		b.eye(Vector3(0.04 * s, 3.135, -0.128), Vector3(0.0, -0.05, -1.0).normalized(), Vector3(1.0, 0.0, 0.1 * s).normalized(), {"head": 1.0})
	for s: float in [1.0, -1.0]:
		var sfx := ".R" if s > 0.0 else ".L"
		var sh: Vector3 = H["shoulder" + sfx]
		var a: Vector3 = H["arm" + sfx]
		var e: Vector3 = H["forearm" + sfx]
		var w: Vector3 = H["hand" + sfx]
		var down := (w - e).normalized()
		var palm_end := w + down * 0.13
		_limb(b, [
			_k(sh + Vector3(-0.05 * s, -0.01, 0.0), 0.055, 0.055, {"chest": 0.6, "shoulder" + sfx: 0.4}),
			_k(sh.lerp(a, 0.55), 0.062, 0.058, {"shoulder" + sfx: 1.0}),
			_k(a + Vector3(0.0, -0.02, 0.0), 0.062, 0.06, {"shoulder" + sfx: 0.35, "arm" + sfx: 0.65}),
			_k(a.lerp(e, 0.35), 0.052, 0.05, {"arm" + sfx: 1.0}),
			_k(e, 0.038, 0.038, {"arm" + sfx: 0.5, "forearm" + sfx: 0.5}),
			_k(e.lerp(w, 0.3), 0.042, 0.04, {"forearm" + sfx: 1.0}),
			_k(w, 0.026, 0.024, {"forearm" + sfx: 0.5, "hand" + sfx: 0.5}),
			_k(w + down * 0.07, 0.04, 0.018, {"hand" + sfx: 1.0}),
			_k(palm_end, 0.036, 0.016, {"hand" + sfx: 1.0}),
		], Vector3.FORWARD)
		for fi in 4:
			var off := lerpf(-0.028, 0.028, float(fi) / 3.0)
			var f0 := palm_end + Vector3(0.0, 0.0, off) - down * 0.01
			var f2 := f0 + down * 0.26 + Vector3(-s * 0.02, 0.0, off * 0.5)
			b.loft([
				_k(f0, 0.011, 0.011, {"hand" + sfx: 1.0}),
				_k(f0.lerp(f2, 0.5), 0.009, 0.009, {"hand" + sfx: 1.0}),
				_k(f2, 0.003, 0.003, {"hand" + sfx: 1.0}),
			], X, 5, 2)
		var hp: Vector3 = H["thigh" + sfx]
		var kn: Vector3 = H["shin" + sfx]
		var an: Vector3 = H["foot" + sfx]
		var toe := Vector3(0.14 * s, 0.03, -0.2)
		_limb(b, [
			_k(hp + Vector3(-0.02 * s, 0.07, 0.0), 0.08, 0.08, {"hips": 0.6, "thigh" + sfx: 0.4}, 0.0, 0.75),
			_k(hp.lerp(kn, 0.3), 0.074, 0.072, {"thigh" + sfx: 1.0}),
			_k(kn, 0.047, 0.047, {"thigh" + sfx: 0.5, "shin" + sfx: 0.5}),
			_k(kn.lerp(an, 0.3), 0.045, 0.043, {"shin" + sfx: 1.0}),
			_k(an, 0.03, 0.03, {"shin" + sfx: 0.5, "foot" + sfx: 0.5}, 0.0, 0.85),
			_k(an.lerp(toe, 0.5) + Vector3(0.0, -0.035, 0.0), 0.04, 0.02, {"foot" + sfx: 1.0}, 0.0, 0.7),
			_k(toe, 0.02, 0.012, {"foot" + sfx: 1.0}, 0.0, 0.7),
		], X)
	# A ragged hood of shadow strands rising behind the head and arching over it.
	for ang: float in [-2.0, -1.35, -0.68, 0.0, 0.68, 1.35, 2.0]:
		var dirv := Vector3(sin(ang), 0.0, cos(ang))
		var tan := Vector3(dirv.z, 0.0, -dirv.x)
		var front := absf(ang) / 2.0
		var keys: Array = []
		var pts := [
			Vector3(dirv.x * 0.13, 2.74, dirv.z * 0.1 + 0.01),
			Vector3(dirv.x * 0.17, 2.98, dirv.z * 0.16),
			Vector3(dirv.x * 0.165, 3.2, dirv.z * 0.17),
			Vector3(dirv.x * 0.13, 3.42, dirv.z * 0.12 - 0.02),
			Vector3(dirv.x * 0.06, 3.56 - front * 0.08, dirv.z * 0.03 - 0.07 - front * 0.04),
		]
		for i in pts.size():
			var f := float(i) / float(pts.size() - 1)
			var w := {"chest": 1.0} if i == 0 else ({"neck": 0.5, "head": 0.5} if i == 1 else {"head": 1.0})
			keys.append(_k(pts[i], 0.085 * lerpf(1.0, 0.55, f), 0.012, w, maxf(f - 0.35, 0.0) * 1.5, lerpf(0.75, 1.0, f)))
		b.loft(keys, tan, 4, 2, true, true, 0.3)
	# A tattered shroud of shadow ribbons hanging from the shoulders.
	var angs := [-2.05, -1.4, -0.72, 0.0, 0.72, 1.4, 2.05]
	for i in angs.size():
		var ang: float = angs[i]
		var dirv := Vector3(sin(ang), 0.0, cos(ang))
		var root := Vector3(0.0, 2.7, 0.02) + Vector3(dirv.x * 0.18, 0.0, dirv.z * 0.11)
		var length := 1.2 + 0.4 * absf(cos(ang * 0.5)) + 0.15 * sin(float(i) * 3.7)
		var hang := (Vector3.DOWN + dirv * 0.1).normalized()
		_strand(b, root, hang, length, 0.15, Vector3(dirv.z, 0.0, -dirv.x), {"chest": 1.0}, {"spine": 0.5, "hips": 0.5}, dirv * 0.1)
	return 3.135


## Low-level mesh builder: elliptical lofts along Catmull-Rom curves with
## per-vertex bone weights, rest positions and tatter masks.
class _Builder:
	extends RefCounted

	var index: Dictionary = {}
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var custom := PackedFloat32Array()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var indices := PackedInt32Array()
	var e_verts := PackedVector3Array()
	var e_normals := PackedVector3Array()
	var e_tangents := PackedFloat32Array()
	var e_uvs := PackedVector2Array()
	var e_bones := PackedInt32Array()
	var e_weights := PackedFloat32Array()
	var e_indices := PackedInt32Array()

	## Up to 4 strongest influences, normalised.
	func _influences(w: Dictionary) -> Array:
		var pairs: Array = []
		for k in w:
			if float(w[k]) > 0.0001 and index.has(k):
				pairs.append([int(index[k]), float(w[k])])
		pairs.sort_custom(func(a: Array, b: Array) -> bool: return float(a[1]) > float(b[1]))
		var bi := PackedInt32Array([0, 0, 0, 0])
		var bw := PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
		var total := 0.0
		for i in mini(pairs.size(), 4):
			bi[i] = int(pairs[i][0])
			bw[i] = float(pairs[i][1])
			total += bw[i]
		if total <= 0.0:
			bw[0] = 1.0
		else:
			for i in 4:
				bw[i] /= total
		return [bi, bw]

	static func _blend(a: Dictionary, b: Dictionary, f: float) -> Dictionary:
		var out := {}
		for k in a:
			out[k] = float(a[k]) * (1.0 - f)
		for k in b:
			out[k] = float(out.get(k, 0.0)) + float(b[k]) * f
		return out

	static func _catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: float) -> Vector3:
		var t2 := t * t
		var t3 := t2 * t
		return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)

	## Sweep elliptical rings through `keys` (see MonsterModel._k). `side` is the
	## direction of the rx radius. Rounded caps close both ends.
	func loft(keys: Array, side: Vector3, sides: int, steps: int, cap0: bool = true, cap1: bool = true, cap_len: float = 1.0) -> void:
		if keys.size() < 2:
			return
		# 1) Sample the curve.
		var samples: Array = []
		for i in keys.size() - 1:
			var k1: Dictionary = keys[i]
			var k2: Dictionary = keys[i + 1]
			var p1: Vector3 = k1["p"]
			var p2: Vector3 = k2["p"]
			var p0: Vector3 = (keys[i - 1] as Dictionary)["p"] if i > 0 else p1 * 2.0 - p2
			var p3: Vector3 = (keys[i + 2] as Dictionary)["p"] if i + 2 < keys.size() else p2 * 2.0 - p1
			var n := steps if i < keys.size() - 2 else steps + 1
			for s in n:
				var f := float(s) / steps
				samples.append({
					"p": _catmull(p0, p1, p2, p3, f),
					"rx": lerpf(float(k1["rx"]), float(k2["rx"]), f),
					"rz": lerpf(float(k1["rz"]), float(k2["rz"]), f),
					"w": _blend(k1["w"], k2["w"], f),
					"tat": lerpf(float(k1["tat"]), float(k2["tat"]), f),
					"ao": lerpf(float(k1["ao"]), float(k2["ao"]), f),
				})
		var ns := samples.size()
		for i in ns:
			var a: Vector3 = (samples[maxi(i - 1, 0)] as Dictionary)["p"]
			var c: Vector3 = (samples[mini(i + 1, ns - 1)] as Dictionary)["p"]
			var tan := (c - a).normalized()
			if tan.length_squared() < 0.5:
				tan = Vector3.UP
			var u := side - tan * side.dot(tan)
			if u.length_squared() < 0.0001:
				u = Vector3.FORWARD - tan * Vector3.FORWARD.dot(tan)
				if u.length_squared() < 0.0001:
					u = Vector3.UP - tan * Vector3.UP.dot(tan)
			u = u.normalized()
			samples[i]["t"] = tan
			samples[i]["u"] = u
			samples[i]["v"] = tan.cross(u)
		# 2) Rings including hemispherical caps.
		var rings: Array = []
		var cap_rings := 3 if sides >= 10 else 2
		if cap0:
			var s0: Dictionary = samples[0]
			for k in range(cap_rings, 0, -1):
				var phi := float(k) / cap_rings * PI * 0.5
				var r := (float(s0["rx"]) + float(s0["rz"])) * 0.5
				var ring := s0.duplicate()
				ring["p"] = (s0["p"] as Vector3) - (s0["t"] as Vector3) * r * sin(phi) * cap_len
				ring["rx"] = float(s0["rx"]) * cos(phi)
				ring["rz"] = float(s0["rz"]) * cos(phi)
				ring["pole"] = -1 if k == cap_rings else 0
				rings.append(ring)
		for s in samples:
			rings.append(s)
		if cap1:
			var s1: Dictionary = samples[ns - 1]
			for k in range(1, cap_rings + 1):
				var phi := float(k) / cap_rings * PI * 0.5
				var r := (float(s1["rx"]) + float(s1["rz"])) * 0.5
				var ring := s1.duplicate()
				ring["p"] = (s1["p"] as Vector3) + (s1["t"] as Vector3) * r * sin(phi) * cap_len
				ring["rx"] = float(s1["rx"]) * cos(phi)
				ring["rz"] = float(s1["rz"]) * cos(phi)
				ring["pole"] = 1 if k == cap_rings else 0
				rings.append(ring)
		# 3) Vertex grid.
		var grid: Array = []
		for ring in rings:
			var row := PackedVector3Array()
			var c: Vector3 = ring["p"]
			var u: Vector3 = ring["u"]
			var v: Vector3 = ring["v"]
			for j in sides:
				var th := float(j) / sides * TAU
				row.append(c + u * cos(th) * float(ring["rx"]) + v * sin(th) * float(ring["rz"]))
			grid.append(row)
		var nr := rings.size()
		var base := verts.size()
		for i in nr:
			var ring: Dictionary = rings[i]
			var inf := _influences(ring["w"])
			var row: PackedVector3Array = grid[i]
			var prev: PackedVector3Array = grid[maxi(i - 1, 0)]
			var next: PackedVector3Array = grid[mini(i + 1, nr - 1)]
			var tat := float(ring["tat"])
			var ao := float(ring["ao"])
			for j in sides:
				var p := row[j]
				var d_th := row[(j + 1) % sides] - row[(j - 1 + sides) % sides]
				var d_s := next[j] - prev[j]
				var nrm := d_th.cross(d_s)
				if nrm.length_squared() < 1e-12:
					nrm = (ring["t"] as Vector3) * float(ring.get("pole", 0))
					if nrm.length_squared() < 1e-6:
						nrm = p - (ring["p"] as Vector3)
				nrm = nrm.normalized()
				var outward := p - (ring["p"] as Vector3)
				if outward.length_squared() > 1e-10 and nrm.dot(outward) < 0.0:
					nrm = -nrm
				verts.append(p)
				normals.append(nrm)
				colors.append(Color(ao, ao, ao, 1.0))
				custom.append_array(PackedFloat32Array([p.x, p.y, p.z, tat]))
				bones.append_array(inf[0])
				weights.append_array(inf[1])
		for i in nr - 1:
			for j in sides:
				var a := base + i * sides + j
				var b := base + i * sides + (j + 1) % sides
				var c := base + (i + 1) * sides + (j + 1) % sides
				var d := base + (i + 1) * sides + j
				indices.append_array(PackedInt32Array([a, d, c, a, c, b]))

	## Ellipsoid blob centred at `center`, long axis `axis` (half length `half`).
	func blob(center: Vector3, axis: Vector3, half: float, rx: float, rz: float, side: Vector3, w: Dictionary) -> void:
		var keys: Array = []
		for f in [-0.75, -0.4, 0.0, 0.4, 0.75]:
			var prof := sqrt(maxf(1.0 - f * f, 0.0))
			keys.append({"p": center + axis * half * f, "rx": rx * prof, "rz": rz * prof, "w": w, "tat": 0.0, "ao": 1.0})
		loft(keys, side, 8, 2, true, true, 0.75)

	## A camera-facing eye glint (4 vertices sharing the centre; see the eyes shader).
	func eye(center: Vector3, forward: Vector3, right: Vector3, w: Dictionary) -> void:
		var inf := _influences(w)
		var base := e_verts.size()
		for uv in [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]:
			e_verts.append(center)
			e_normals.append(forward)
			e_tangents.append_array(PackedFloat32Array([right.x, right.y, right.z, 1.0]))
			e_uvs.append(uv)
			e_bones.append_array(inf[0])
			e_weights.append_array(inf[1])
		e_indices.append_array(PackedInt32Array([base, base + 1, base + 2, base, base + 2, base + 3]))

	func commit_body(mesh: ArrayMesh, material: Material) -> void:
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = verts
		arr[Mesh.ARRAY_NORMAL] = normals
		arr[Mesh.ARRAY_COLOR] = colors
		arr[Mesh.ARRAY_CUSTOM0] = custom
		arr[Mesh.ARRAY_BONES] = bones
		arr[Mesh.ARRAY_WEIGHTS] = weights
		arr[Mesh.ARRAY_INDEX] = indices
		var flags := Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
		mesh.surface_set_material(mesh.get_surface_count() - 1, material)

	func commit_eyes(mesh: ArrayMesh, material: Material) -> void:
		if e_verts.is_empty():
			return
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = e_verts
		arr[Mesh.ARRAY_NORMAL] = e_normals
		arr[Mesh.ARRAY_TANGENT] = e_tangents
		arr[Mesh.ARRAY_TEX_UV] = e_uvs
		arr[Mesh.ARRAY_BONES] = e_bones
		arr[Mesh.ARRAY_WEIGHTS] = e_weights
		arr[Mesh.ARRAY_INDEX] = e_indices
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		mesh.surface_set_material(mesh.get_surface_count() - 1, material)
