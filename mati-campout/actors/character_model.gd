class_name CharacterModel
extends Node3D
## A friendly, slightly chunky procedural adventurer (ART_DIRECTION
## "Characters"). Built from smooth MeshKit primitives on a simple joint
## hierarchy and animated procedurally. Standalone: the player, traders and
## the character locker all use it.
##
## Faces -Z, feet at the origin, ~1.68 m tall.
##
## API
##   apply_look(look)                 data/cosmetics.json look Dictionary
##   set_locomotion(speed, grounded)  m/s on the ground; drives walk/run
##   play_action(name, speed = 1.0)   swing, chop, eat, hurt, interact, shoot,
##                                    sit, wave, die  (sit/die hold their pose)
##   stop_action()                    leave sit/die (stand up)
##   set_held_item(id) / set_left_item(node)
##   set_aim(on, pitch)               gun / flashlight aiming pose
##   set_look(yaw, pitch, active)     head turn relative to the body
##   flash(strength)                  white hit flash
## Signals
##   action_hit(name)    impact moment of swing / chop (also eat, interact)
##   action_finished(name)
##   footstep(side)      0 = left, 1 = right, when a foot plants

signal action_hit(action_name: String)
signal action_finished(action_name: String)
signal footstep(side: int)

const ACTIONS := {
	"swing": {"dur": 0.5, "hit": 0.46},
	"chop": {"dur": 0.62, "hit": 0.53},
	"eat": {"dur": 1.2, "hit": 0.55},
	"hurt": {"dur": 0.42, "hit": -1.0},
	"interact": {"dur": 0.6, "hit": 0.45},
	"shoot": {"dur": 0.3, "hit": 0.0},
	"wave": {"dur": 1.6, "hit": -1.0},
	"sit": {"dur": 0.7, "hit": -1.0, "hold": true},
	"die": {"dur": 1.4, "hit": -1.0, "hold": true},
}

const HATS := ["beanie", "ranger_hat", "bucket_hat", "wolf_ears", "lighthouse_cap", "crown_of_embers"]

# Skeleton dimensions (metres).
const HIP_Y := 0.86
const LEG_X := 0.092
const LEG_Y := -0.06
const THIGH := 0.385
const SHIN := 0.345
const SPINE_Y := 0.07
const SHOULDER := Vector3(0.198, 0.252, 0.0)
const NECK_Y := 0.335
const HEAD_Y := 0.05
const HEAD_C := Vector3(0.0, 0.115, 0.0)
const UPPER_ARM := 0.25
const FOREARM := 0.235
const HEAD_PROFILE := [
	Vector2(0.0, -0.165), Vector2(0.06, -0.158), Vector2(0.104, -0.13), Vector2(0.137, -0.087),
	Vector2(0.154, -0.033), Vector2(0.161, 0.02), Vector2(0.159, 0.07), Vector2(0.144, 0.114),
	Vector2(0.11, 0.149), Vector2(0.06, 0.168), Vector2(0.0, 0.173)]
const TORSO_PROFILE := [
	Vector2(0.0, -0.085), Vector2(0.126, -0.08), Vector2(0.139, -0.03), Vector2(0.146, 0.05),
	Vector2(0.162, 0.14), Vector2(0.179, 0.21), Vector2(0.183, 0.255), Vector2(0.16, 0.3),
	Vector2(0.1, 0.33), Vector2(0.0, 0.34)]
const TORSO_RZ := 0.68

## Use _physics_process for animation (keeps it in step with physics
## interpolation of a moving body). Set false for UI previews if preferred.
var animate_in_physics := true
var look: Dictionary = {}

var _body: Node3D
var _j: Dictionary = {}          # joint name -> Node3D
var _parts: Array = []           # MeshInstance3D built for the current look
var _eyes: Node3D
var _brows: Node3D
var _mouth: Node3D
var _grip_r: Node3D
var _grip_l: Node3D
var _held: Node3D = null
var _held_id := ""
var _hat_on := false
var _held_type := "none"
var _left: Node3D = null

var _speed := 0.0
var _grounded := true
var _air := 0.0
var _phase := 0.0
var _time := 0.0
var _action := ""
var _action_t := 0.0
var _action_dur := 1.0
var _action_hit_t := -1.0
var _action_hit_done := false
var _action_hold := false
var _hold_w := 0.0
var _left_w := 0.0
var _aim := false
var _aim_w := 0.0
var _aim_pitch := 0.0
var _look_on := false
var _look_yaw := 0.0
var _look_pitch := 0.0
var _look_cur := Vector2.ZERO
var _idle_look := 0.0
var _idle_look_target := 0.0
var _idle_look_timer := 3.0
var _blink_timer := 2.0
var _blink := 0.0
var _flash := 0.0
var _flash_applied := 0.0
var _mouth_open := 0.0
var _frozen := false
var _freeze_opts: Dictionary = {}
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	name = "CharacterModel"
	_rng.seed = 7741
	_build_skeleton()


func _ready() -> void:
	if look.is_empty():
		apply_look(_default_look())
	_rng.seed = hash(get_instance_id())
	_blink_timer = _rng.randf_range(1.0, 3.5)


func _physics_process(delta: float) -> void:
	if animate_in_physics:
		_animate(delta)


func _process(delta: float) -> void:
	if not animate_in_physics:
		_animate(delta)


# --- Public API ---------------------------------------------------------------------------

func set_locomotion(speed: float, grounded: bool) -> void:
	if _frozen:
		return
	_speed = maxf(speed, 0.0)
	_grounded = grounded


## Start an action. speed > 1 plays it faster (e.g. a quick axe).
func play_action(action_name: String, speed: float = 1.0) -> void:
	if not ACTIONS.has(action_name):
		return
	if _action == "die" and action_name != "die":
		return
	var def: Dictionary = ACTIONS[action_name]
	if action_name == "hurt" and _action != "" and _action != "hurt" and not _action_hold:
		# A flinch never cancels a swing; it just adds the hit flash.
		flash(0.8)
		return
	_action = action_name
	_action_t = 0.0
	_action_dur = float(def["dur"]) / clampf(speed, 0.25, 4.0)
	_action_hit_t = float(def["hit"])
	_action_hit_done = _action_hit_t < 0.0
	_action_hold = bool(def.get("hold", false))
	if action_name == "hurt":
		flash(1.0)


func stop_action() -> void:
	if _action != "":
		var a := _action
		_action = ""
		_action_hold = false
		action_finished.emit(a)


func current_action() -> String:
	return _action


func is_busy() -> bool:
	return _action != "" and not _action_hold


## Seconds from play_action() until action_hit for this action at `speed`.
static func hit_delay(action_name: String, speed: float = 1.0) -> float:
	if not ACTIONS.has(action_name):
		return 0.0
	var def: Dictionary = ACTIONS[action_name]
	return maxf(float(def["hit"]), 0.0) * float(def["dur"]) / clampf(speed, 0.25, 4.0)


func set_aim(on: bool, pitch: float = 0.0) -> void:
	if _frozen:
		return
	_aim = on
	_aim_pitch = clampf(pitch, -0.9, 0.9)


## Turn the head toward a direction relative to the body (radians).
func set_look(yaw: float, pitch: float, active: bool = true) -> void:
	if _frozen:
		return
	_look_on = active
	_look_yaw = clampf(yaw, -1.2, 1.2)
	_look_pitch = clampf(pitch, -0.6, 0.5)


func flash(strength: float = 1.0) -> void:
	_flash = maxf(_flash, strength)


## The right-hand attachment node (item models are children of it).
func grip(right: bool = true) -> Node3D:
	return _grip_r if right else _grip_l


func held_node() -> Node3D:
	return _held


func set_held_item(id: String) -> void:
	if id == _held_id and (id == "" or is_instance_valid(_held)):
		return
	if _held and is_instance_valid(_held):
		_held.queue_free()
	_held = null
	_held_id = id
	_held_type = "none"
	if id == "":
		return
	_held_type = ItemModels.hold_type(id)
	_held = ItemModels.build(id)
	match _held_type:
		"small":
			_held.position = Vector3(0.0, 0.02, 0.03)
			_held.scale = Vector3.ONE * 0.9
		"flashlight":
			_held.position = Vector3(0.0, 0.0, 0.0)
	_grip_r.add_child(_held)


## A node held in the left hand (e.g. a burning torch); null clears it.
func set_left_item(node: Node3D) -> void:
	if _left and is_instance_valid(_left) and _left != node:
		_left.queue_free()
	_left = node
	if node:
		if node.get_parent():
			node.get_parent().remove_child(node)
		_grip_l.add_child(node)


func left_item() -> Node3D:
	return _left


## Freeze the pose for screenshots: {speed, phase (0..1), action, u (0..1)}.
func debug_freeze(opts: Dictionary) -> void:
	_frozen = true
	_freeze_opts = opts
	_speed = float(opts.get("speed", 0.0))
	_grounded = true
	_phase = float(opts.get("phase", 0.0)) * TAU
	if opts.has("action"):
		var a := str(opts["action"])
		play_action(a)
		_action_t = clampf(float(opts.get("u", 0.5)), 0.0, 1.0) * _action_dur
		_action_hit_done = true
	_hold_w = 1.0 if _held_type != "none" else 0.0
	_left_w = 1.0 if _left != null else 0.0
	_aim_w = 1.0 if _aim else 0.0
	_air = 0.0
	_apply_pose(_compute_pose())


func debug_unfreeze() -> void:
	_frozen = false


# --- Skeleton -------------------------------------------------------------------------------

func _joint(jname: String, parent: Node3D, pos: Vector3) -> Node3D:
	var n := Node3D.new()
	n.name = jname
	n.position = pos
	parent.add_child(n)
	_j[jname] = n
	return n


func _build_skeleton() -> void:
	_body = _joint("body", self, Vector3.ZERO)
	var hips := _joint("hips", _body, Vector3(0, HIP_Y, 0))
	var spine := _joint("spine", hips, Vector3(0, SPINE_Y, 0))
	var neck := _joint("neck", spine, Vector3(0, NECK_Y, 0))
	var head := _joint("head", neck, Vector3(0, HEAD_Y, 0))
	_eyes = Node3D.new()
	_eyes.name = "Eyes"
	_eyes.position = HEAD_C + Vector3(0, 0.0, -0.148)
	head.add_child(_eyes)
	_brows = Node3D.new()
	_brows.name = "Brows"
	_brows.position = HEAD_C + Vector3(0, 0.055, -0.142)
	head.add_child(_brows)
	_mouth = Node3D.new()
	_mouth.name = "Mouth"
	_mouth.position = HEAD_C + Vector3(0, -0.075, 0.0)
	head.add_child(_mouth)
	for side in [-1.0, 1.0]:
		var sfx := "l" if side < 0.0 else "r"
		var sh := _joint("sh_" + sfx, spine, Vector3(SHOULDER.x * side, SHOULDER.y, SHOULDER.z))
		var el := _joint("el_" + sfx, sh, Vector3(0, -UPPER_ARM, 0))
		var hd := _joint("hd_" + sfx, el, Vector3(0, -FOREARM, 0))
		var g := Node3D.new()
		g.name = "Grip"
		g.position = Vector3(0.0, -0.058, -0.004)
		g.rotation = Vector3(-PI * 0.5, 0.0, 0.0)
		hd.add_child(g)
		if side < 0.0:
			_grip_l = g
		else:
			_grip_r = g
		var hip := _joint("hip_" + sfx, hips, Vector3(LEG_X * side, LEG_Y, 0))
		var kn := _joint("kn_" + sfx, hip, Vector3(0, -THIGH, 0))
		_joint("an_" + sfx, kn, Vector3(0, -SHIN, 0))


# --- Look (meshes) ---------------------------------------------------------------------------

func _default_look() -> Dictionary:
	var d: Variant = DB.cosmetics.get("default", {})
	return (d as Dictionary).duplicate() if d is Dictionary else {}


static func _pal(key: String, idx: Variant, fallback: String) -> Color:
	var arr: Variant = DB.cosmetics.get(key, [])
	if not arr is Array or (arr as Array).is_empty():
		return Color(fallback)
	var i := 0
	if idx is int or idx is float:
		i = int(idx)
	return Color(str((arr as Array)[posmod(i, (arr as Array).size())]))


func apply_look(new_look: Dictionary) -> void:
	look = new_look.duplicate(true)
	for p in _parts:
		if is_instance_valid(p):
			(p as Node).queue_free()
	_parts.clear()
	_flash_applied = -1.0
	var skin := _pal("skin_tones", look.get("skin", 2), "#d9a27c")
	var hair := _pal("hair_colors", look.get("hair_color", 1), "#4a2c1a")
	var shirt := _pal("shirt_colors", look.get("shirt", 0), "#d0463c")
	var jacket := _pal("jacket_colors", look.get("jacket_color", 0), "#2f5d3a")
	var pants := _pal("pants_colors", look.get("pants", 0), "#3b4f6e")
	var jstyle := str(look.get("jacket_style", "none"))
	var hstyle := str(look.get("hair_style", "short"))
	var acc := str(look.get("accessory", "none"))
	var pack := str(look.get("backpack", "classic"))
	var c := {"skin": skin, "hair": hair, "shirt": shirt, "jacket": jacket, "pants": pants,
		"boots": Color("#6b4528"), "sole": Color("#3a2a20"), "jstyle": jstyle}

	_part(_j["hips"], _mesh_pelvis(c))
	_part(_j["spine"], _mesh_torso(c, pack, acc))
	_part(_j["head"], _mesh_head(c, hstyle, acc))
	_part(_eyes, _mesh_eyes(), false)
	_part(_brows, _mesh_brows(hair), false)
	_part(_mouth, _mesh_mouth(), false)
	for sfx in ["l", "r"]:
		var side := -1.0 if sfx == "l" else 1.0
		_part(_j["sh_" + sfx], _mesh_upper_arm(c))
		_part(_j["el_" + sfx], _mesh_forearm(c))
		_part(_j["hd_" + sfx], _mesh_hand(c, side))
		_part(_j["hip_" + sfx], _mesh_thigh(c))
		_part(_j["kn_" + sfx], _mesh_shin(c))
		_part(_j["an_" + sfx], _mesh_foot(c))


func _part(parent: Node3D, mesh: ArrayMesh, shadows: bool = true) -> void:
	if mesh == null:
		return
	var mi := MeshInstance3D.new()
	mi.name = "Part"
	mi.mesh = mesh
	if not shadows:
		# Tiny face details: no shadow pass, and skip them when far away.
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_end = 40.0
	parent.add_child(mi)
	_parts.append(mi)


func _sleeve_paint(k: MeshKit, c: Dictionary) -> void:
	match str(c["jstyle"]):
		"hoodie":
			k.paint(c["jacket"], 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
		"flannel":
			k.paint(c["jacket"], 0.85, 0.0, 0.0, MeshKit.Pat.PLAID)
		"raincoat":
			k.paint(c["jacket"], 0.3, 0.0, 0.0, MeshKit.Pat.NONE)
		_:
			k.paint(c["shirt"], 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)


func _mesh_pelvis(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(c["pants"], 0.85, 0.0, 0.0, MeshKit.Pat.DENIM)
	k.lathe(PackedVector2Array([Vector2(0.0, -0.13), Vector2(0.1, -0.122), Vector2(0.147, -0.075), Vector2(0.157, 0.0),
		Vector2(0.15, 0.07), Vector2(0.12, 0.1), Vector2(0.0, 0.105)]), Transform3D.IDENTITY, 18, 0.72)
	k.paint(Color("#4a3022"), 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.torus(Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.74)), Vector3(0, 0.055, 0)), 0.151, 0.016, 28, 6)
	k.paint(Color("#cfae5a"), 0.3, 0.9, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.055, -0.116)), Vector3(0.042, 0.032, 0.012), 0.005)
	return k.to_mesh()


func _torso_shell(offset: float, y_min: float, y_max: float, flare: float = 0.0) -> PackedVector2Array:
	# The torso profile pushed outward by `offset`, clipped to [y_min, y_max].
	var out := PackedVector2Array()
	for p in TORSO_PROFILE:
		var v: Vector2 = p
		if v.y < y_min - 0.001 or v.y > y_max + 0.001 or v.x <= 0.0:
			continue
		var r := v.x + offset
		if v.y < 0.0 and flare > 0.0:
			r += flare * clampf(-v.y / 0.2, 0.0, 1.0)
		out.append(Vector2(r, v.y))
	return out


func _mesh_torso(c: Dictionary, pack: String, acc: String) -> ArrayMesh:
	var k := MeshKit.new()
	var js := str(c["jstyle"])
	# Base shirt (always there; jackets cover most of it).
	k.paint(c["shirt"], 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
	k.lathe(PackedVector2Array(TORSO_PROFILE), Transform3D.IDENTITY, 20, TORSO_RZ)
	match js:
		"hoodie":
			k.paint(c["jacket"], 0.92, 0.0, 0.0, MeshKit.Pat.CANVAS)
			var prof := _torso_shell(0.012, -0.08, 0.34)
			prof.insert(0, Vector2(0.0, -0.09))
			prof.append(Vector2(0.0, 0.346))
			k.lathe(prof, Transform3D.IDENTITY, 20, TORSO_RZ)
			k.paint(Color(c["jacket"]).darkened(0.12), 0.95, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.cylinder(Vector3(0, -0.095, 0), Vector3(0, -0.055, 0), 0.142, 0.142, 20, false, 0.0, TORSO_RZ)
			# Kangaroo pocket and hood.
			k.paint(Color(c["jacket"]).darkened(0.06), 0.92, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(Transform3D(Basis(Vector3.RIGHT, -0.08), Vector3(0, 0.0, -0.103)), Vector3(0.19, 0.085, 0.02), 0.009)
			k.paint(c["jacket"], 0.92, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.ellipsoid(Vector3(0, 0.325, 0.07), Vector3(0.135, 0.06, 0.075), 18, 8)
			k.paint(Color(c["jacket"]).darkened(0.35), 0.95, 0.0, 0.0)
			k.ellipsoid(Vector3(0, 0.345, 0.045), Vector3(0.1, 0.035, 0.045), 14, 6)
			k.paint(Color("#efe6d2"), 0.8, 0.0, 0.0)
			for sx in [-1.0, 1.0]:
				k.tube(PackedVector3Array([Vector3(0.03 * sx, 0.31, -0.096), Vector3(0.034 * sx, 0.25, -0.115),
					Vector3(0.036 * sx, 0.2, -0.118)]), PackedFloat32Array([0.004, 0.004, 0.004]), 5)
				k.capsule(Vector3(0.036 * sx, 0.205, -0.118), Vector3(0.036 * sx, 0.18, -0.118), 0.006, 0.006, 6, 2)
		"flannel":
			# Open plaid overshirt: shell with the front left open over the tee.
			var outer := _torso_shell(0.011, -0.085, 0.31)
			var shell := PackedVector2Array()
			for p in outer:
				shell.append(p)
			shell.append(Vector2(0.088, 0.335))
			var inner := _torso_shell(0.003, -0.085, 0.31)
			inner.reverse()
			shell.append(Vector2(0.082, 0.33))
			for p in inner:
				shell.append(p)
			var gap := 0.36
			k.paint(c["jacket"], 0.86, 0.0, 0.0, MeshKit.Pat.PLAID)
			k.lathe(shell, Transform3D.IDENTITY, 22, TORSO_RZ, TAU - gap * 2.0, -PI * 0.5 + gap)
			# Collar flaps and chest pocket.
			for sx in [-1.0, 1.0]:
				k.rbox(Transform3D(Basis(Vector3.UP, 0.5 * sx) * Basis(Vector3.RIGHT, -0.5), Vector3(0.055 * sx, 0.32, -0.075)),
					Vector3(0.05, 0.06, 0.012), 0.005)
			k.rbox(Transform3D(Basis(Vector3.UP, 0.25), Vector3(0.085, 0.19, -0.112)), Vector3(0.05, 0.045, 0.012), 0.004)
		"vest":
			k.paint(c["jacket"], 0.45, 0.0, 0.0, MeshKit.Pat.QUILTED)
			var vprof := _torso_shell(0.028, -0.085, 0.3)
			vprof.insert(0, Vector2(0.0, -0.095))
			vprof.append(Vector2(0.12, 0.33))
			vprof.append(Vector2(0.0, 0.34))
			k.lathe(vprof, Transform3D.IDENTITY, 20, TORSO_RZ)
			k.torus(Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.85)), Vector3(0, 0.33, 0)), 0.082, 0.025, 20, 8)
			k.paint(Color("#2b2b30"), 0.4, 0.4, 0.0)
			k.rbox(Transform3D(Basis(Vector3.RIGHT, -0.1), Vector3(0, 0.12, -0.13)), Vector3(0.008, 0.36, 0.01), 0.003)
		"raincoat":
			k.paint(c["jacket"], 0.28, 0.0, 0.0, MeshKit.Pat.NONE)
			var rprof := PackedVector2Array([Vector2(0.0, -0.24), Vector2(0.162, -0.232), Vector2(0.166, -0.2)])
			for p in _torso_shell(0.016, -0.03, 0.34):
				rprof.append(p)
			rprof.append(Vector2(0.0, 0.345))
			k.lathe(rprof, Transform3D.IDENTITY, 22, TORSO_RZ * 1.04)
			k.ellipsoid(Vector3(0, 0.322, 0.07), Vector3(0.14, 0.062, 0.08), 18, 8)
			k.paint(Color(c["jacket"]).darkened(0.4), 0.5, 0.0, 0.0)
			k.ellipsoid(Vector3(0, 0.342, 0.046), Vector3(0.1, 0.035, 0.046), 14, 6)
			k.paint(Color("#2f2a26"), 0.5, 0.0, 0.0)
			for y in [0.24, 0.13, 0.02, -0.09]:
				var z := -0.122 if y > 0.0 else -0.118
				k.capsule(Vector3(-0.012, y, z), Vector3(0.012, y, z), 0.006, 0.006, 6, 2)
			k.paint(Color(c["jacket"]).darkened(0.08), 0.3, 0.0, 0.0)
			for sx in [-1.0, 1.0]:
				k.rbox(Transform3D(Basis(Vector3.UP, 0.3 * sx), Vector3(0.1 * sx, -0.07, -0.112)), Vector3(0.07, 0.025, 0.014), 0.005)
		_:
			k.paint(Color(c["shirt"]).darkened(0.15), 0.85, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.torus(Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.85)), Vector3(0, 0.33, 0)), 0.068, 0.011, 18, 6)
	_add_backpack(k, pack)
	if acc == "scarf":
		var scarf := Color("#c8433a") if Color(c["shirt"]).r < 0.7 or Color(c["shirt"]).g > 0.4 else Color("#e3a63c")
		k.paint(scarf, 0.95, 0.0, 0.0, MeshKit.Pat.KNIT)
		k.torus(Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.9)), Vector3(0, 0.335, 0)), 0.078, 0.034, 22, 8)
		k.rbox(Transform3D(Basis(Vector3.FORWARD, 0.12) * Basis(Vector3.RIGHT, -0.15), Vector3(-0.045, 0.21, -0.12)),
			Vector3(0.062, 0.2, 0.022), 0.01)
		k.paint(scarf.lightened(0.25), 0.95, 0.0, 0.0, MeshKit.Pat.KNIT)
		k.rbox(Transform3D(Basis(Vector3.FORWARD, 0.12) * Basis(Vector3.RIGHT, -0.15), Vector3(-0.034, 0.1, -0.133)),
			Vector3(0.062, 0.022, 0.024), 0.008)
	return k.to_mesh()


func _straps(k: MeshKit) -> void:
	k.paint(Color("#3b2a20"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
	for sx in [-1.0, 1.0]:
		k.tube(PackedVector3Array([Vector3(0.085 * sx, 0.3, 0.13), Vector3(0.1 * sx, 0.35, 0.03), Vector3(0.1 * sx, 0.33, -0.07),
			Vector3(0.094 * sx, 0.27, -0.118), Vector3(0.094 * sx, 0.15, -0.124), Vector3(0.12 * sx, 0.04, -0.1)]),
			PackedFloat32Array([0.013, 0.013, 0.013, 0.012, 0.012, 0.011]), 6, true)
	k.tube(PackedVector3Array([Vector3(-0.094, 0.215, -0.126), Vector3(0.0, 0.212, -0.132), Vector3(0.094, 0.215, -0.126)]),
		PackedFloat32Array([0.007, 0.007, 0.007]), 5, false)
	k.paint(Color("#c9ced4"), 0.3, 0.9, 0.0)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.213, -0.134)), Vector3(0.026, 0.02, 0.008), 0.003)


func _add_backpack(k: MeshKit, pack: String) -> void:
	match pack:
		"frame":
			_straps(k)
			k.paint(Color("#4f6b3a"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.ao_grad = 0.3
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.15, 0.205)), Vector3(0.25, 0.42, 0.14), 0.05)
			k.ao_grad = 0.0
			k.paint(Color("#3e5530"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.08, 0.285)), Vector3(0.19, 0.16, 0.05), 0.022)
			for sx in [-1.0, 1.0]:
				k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.135 * sx, 0.06, 0.2)), Vector3(0.045, 0.14, 0.1), 0.018)
			k.paint(Color("#b9c1c8"), 0.3, 0.9, 0.0)
			k.tube(PackedVector3Array([Vector3(-0.14, -0.08, 0.135), Vector3(-0.142, 0.42, 0.14), Vector3(-0.1, 0.47, 0.142),
				Vector3(0.1, 0.47, 0.142), Vector3(0.142, 0.42, 0.14), Vector3(0.14, -0.08, 0.135)]),
				PackedFloat32Array([0.011, 0.011, 0.011, 0.011, 0.011, 0.011]), 6)
			k.paint(Color("#e3923a"), 0.6, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.cylinder(Vector3(-0.15, -0.09, 0.2), Vector3(0.15, -0.09, 0.2), 0.05, 0.05, 16, true, 0.012)
		"satchel":
			k.paint(Color("#8a5a33"), 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.tube(PackedVector3Array([Vector3(-0.1, 0.35, -0.01), Vector3(-0.07, 0.31, -0.112), Vector3(0.05, 0.17, -0.128),
				Vector3(0.15, 0.04, -0.1), Vector3(0.2, -0.01, -0.03)]), PackedFloat32Array([0.012, 0.012, 0.012, 0.012, 0.012]), 6)
			k.tube(PackedVector3Array([Vector3(-0.1, 0.35, 0.01), Vector3(-0.06, 0.31, 0.112), Vector3(0.05, 0.17, 0.125),
				Vector3(0.15, 0.04, 0.1), Vector3(0.2, -0.01, 0.05)]), PackedFloat32Array([0.012, 0.012, 0.012, 0.012, 0.012]), 6)
			k.ao_grad = 0.25
			k.rbox(Transform3D(Basis(Vector3.FORWARD, -0.12), Vector3(0.205, -0.07, 0.01)), Vector3(0.075, 0.17, 0.23), 0.03)
			k.ao_grad = 0.0
			k.paint(Color("#6e4426"), 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.rbox(Transform3D(Basis(Vector3.FORWARD, -0.12), Vector3(0.245, -0.03, 0.01)), Vector3(0.02, 0.11, 0.235), 0.009)
			k.paint(Color("#cfae5a"), 0.3, 0.9, 0.0)
			k.rbox(Transform3D(Basis(Vector3.FORWARD, -0.12), Vector3(0.252, -0.07, 0.01)), Vector3(0.012, 0.026, 0.03), 0.004)
		"bear":
			_straps(k)
			var fur := Color("#8a5f3a")
			k.paint(fur, 0.95, 0.0, 0.0, MeshKit.Pat.HAIR)
			k.ellipsoid(Vector3(0, 0.15, 0.215), Vector3(0.15, 0.17, 0.095), 20, 12)
			for sx in [-1.0, 1.0]:
				k.paint(fur, 0.95, 0.0, 0.0, MeshKit.Pat.HAIR)
				k.sphere(Vector3(0.105 * sx, 0.3, 0.215), 0.048, 12, 8)
				k.paint(Color("#e3b9a0"), 0.9, 0.0, 0.0)
				k.ellipsoid(Vector3(0.105 * sx, 0.3, 0.255), Vector3(0.026, 0.026, 0.012), 10, 6)
				k.paint(Color("#1d1715"), 0.2, 0.0, 0.0)
				k.sphere(Vector3(0.052 * sx, 0.195, 0.3), 0.015, 10, 6)
			k.paint(Color("#e3cfae"), 0.9, 0.0, 0.0)
			k.ellipsoid(Vector3(0, 0.12, 0.3), Vector3(0.062, 0.046, 0.04), 14, 8)
			k.paint(Color("#1d1715"), 0.25, 0.0, 0.0)
			k.ellipsoid(Vector3(0, 0.138, 0.338), Vector3(0.022, 0.015, 0.012), 10, 6)
		"none":
			pass
		_:
			# Classic rucksack with a bedroll on top.
			_straps(k)
			k.paint(Color("#b0553a"), 0.88, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.ao_grad = 0.3
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.13, 0.2)), Vector3(0.27, 0.32, 0.15), 0.055)
			k.ao_grad = 0.0
			k.paint(Color("#93452f"), 0.88, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, 0.06, 0.283)), Vector3(0.2, 0.13, 0.05), 0.024)
			k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.15), Vector3(0, 0.255, 0.215)), Vector3(0.275, 0.07, 0.165), 0.03)
			k.paint(Color("#3b2a20"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			for sx in [-1.0, 1.0]:
				k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.06 * sx, 0.2, 0.3)), Vector3(0.022, 0.12, 0.01), 0.004)
			k.paint(Color("#cfae5a"), 0.3, 0.9, 0.0)
			for sx in [-1.0, 1.0]:
				k.rbox(Transform3D(Basis.IDENTITY, Vector3(0.06 * sx, 0.15, 0.306)), Vector3(0.026, 0.02, 0.006), 0.003)
			k.paint(Color("#4a6b3a"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.cylinder(Vector3(-0.16, 0.33, 0.2), Vector3(0.16, 0.33, 0.2), 0.055, 0.055, 18, true, 0.02)
			k.paint(Color("#3b2a20"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			for sx in [-1.0, 1.0]:
				k.torus(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(0.1 * sx, 0.33, 0.2)), 0.057, 0.007, 18, 5)


func _mesh_head(c: Dictionary, hstyle: String, acc: String) -> ArrayMesh:
	var k := MeshKit.new()
	var skin: Color = c["skin"]
	var hc: Color = c["hair"]
	var hat := acc in HATS
	k.paint(skin, 0.6)
	k.cylinder(Vector3(0, -0.075, 0), Vector3(0, 0.07, 0.006), 0.05, 0.048, 14, false)
	# Head with rosy cheeks.
	var blush := skin.lerp(Color("#f07f78"), 0.42)
	k.color_fn = func(p: Vector3, _n: Vector3) -> Color:
		var q := p - HEAD_C
		var w := 0.0
		for sx in [-1.0, 1.0]:
			var d := Vector2(q.x - 0.088 * sx, q.y + 0.04).length()
			w = maxf(w, exp(-d * d / 0.0011) * smoothstep(-0.04, -0.12, q.z))
		return skin.lerp(blush, w * 0.75)
	k.lathe(PackedVector2Array(HEAD_PROFILE), Transform3D(Basis.IDENTITY, HEAD_C), 24, 0.97)
	k.color_fn = Callable()
	# Ears and nose.
	k.paint(skin.darkened(0.04), 0.6)
	for sx in [-1.0, 1.0]:
		k.ellipsoid(HEAD_C + Vector3(0.155 * sx, -0.012, 0.012), Vector3(0.024, 0.038, 0.028), 12, 8, Basis(Vector3.UP, 0.3 * sx))
	k.paint(skin.lerp(Color("#e98a7a"), 0.1), 0.55)
	k.ellipsoid(HEAD_C + Vector3(0, -0.03, -0.16), Vector3(0.017, 0.014, 0.015), 12, 8)
	_hat_on = hat
	_add_hair(k, hstyle, hc, hat)
	_add_accessory(k, acc, c)
	return k.to_mesh()


## A hair cap hugging the skull: the head profile pushed out by `thick`,
## starting `y_cut` above the head centre, tilted back by `tilt`.
func _hair_cap(k: MeshKit, hc: Color, thick: float, y_cut: float, tilt: float) -> void:
	k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
	if _hat_on:
		thick = minf(thick, 0.006)
	var prof := PackedVector2Array()
	var first := true
	for p in HEAD_PROFILE:
		var v: Vector2 = p
		if v.y < y_cut:
			continue
		if first:
			prof.append(Vector2(v.x - 0.012, y_cut - 0.02))
			prof.append(Vector2(v.x + thick * 0.55, y_cut - 0.008))
			first = false
		var r := v.x + thick if v.x > 0.0 else 0.0
		prof.append(Vector2(r, v.y + thick * (0.3 + 0.7 * smoothstep(0.0, 0.17, v.y))))
	k.lathe(prof, Transform3D(Basis(Vector3.RIGHT, tilt), HEAD_C), 24, 0.98)


func _add_hair(k: MeshKit, style: String, hc: Color, hat: bool) -> void:
	match style:
		"buzz":
			_hair_cap(k, hc.lightened(0.05), 0.006, 0.01, 0.42)
		"bob":
			_hair_cap(k, hc, 0.018, -0.02, 0.36)
			k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
			var shell := PackedVector2Array([Vector2(0.152, -0.105), Vector2(0.17, -0.112), Vector2(0.184, -0.07),
				Vector2(0.186, 0.0), Vector2(0.178, 0.06), Vector2(0.158, 0.11), Vector2(0.15, 0.1),
				Vector2(0.162, 0.03), Vector2(0.158, -0.05)])
			k.lathe(shell, Transform3D(Basis.IDENTITY, HEAD_C), 22, 0.98, TAU - 2.3, -PI * 0.5 + 1.15)
			_bangs(k, hc, 5, 0.85)
		"ponytail":
			_hair_cap(k, hc, 0.016, 0.0, 0.42)
			_bangs(k, hc, 3, 0.55)
			k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
			var b := HEAD_C + Vector3(0, 0.06 if not hat else 0.0, 0.158)
			k.tube(PackedVector3Array([b, b + Vector3(0, -0.04, 0.05), b + Vector3(0, -0.13, 0.075), b + Vector3(0, -0.23, 0.055),
				b + Vector3(0, -0.28, 0.035)]), PackedFloat32Array([0.042, 0.046, 0.04, 0.026, 0.012]), 10)
			k.paint(Color("#d65ab0") if hc.r < 0.6 else Color("#3c5ad6"), 0.5)
			k.torus(Transform3D(Basis(Vector3.RIGHT, 1.1), b + Vector3(0, -0.012, 0.012)), 0.036, 0.011, 14, 6)
		"curly":
			_hair_cap(k, hc, 0.022, -0.01, 0.35)
			k.paint(hc, 0.6, 0.0, 0.0, MeshKit.Pat.HAIR)
			var n := 40
			for i in n:
				# Fibonacci sphere points over the top and back of the head.
				var y := 1.0 - (float(i) + 0.5) / n * 1.15
				var r := sqrt(maxf(1.0 - y * y, 0.0))
				var a := float(i) * 2.39996
				var dir := Vector3(cos(a) * r, y, sin(a) * r)
				if dir.z < -0.25 and dir.y < 0.5:
					continue
				if hat and dir.y > 0.3:
					continue
				var rad := 0.036 + 0.012 * absf(sin(float(i) * 1.7))
				k.sphere(HEAD_C + Vector3(dir.x * 0.168, dir.y * 0.17 + 0.012, dir.z * 0.165), rad, 10, 6)
		"bun":
			_hair_cap(k, hc, 0.016, -0.005, 0.34)
			_bangs(k, hc, 2, 0.5)
			if not hat:
				k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
				k.sphere(HEAD_C + Vector3(0, 0.19, 0.045), 0.062, 16, 10)
				k.paint(Color("#e9c24a"), 0.5)
				k.torus(Transform3D(Basis(Vector3.RIGHT, 0.25), HEAD_C + Vector3(0, 0.148, 0.035)), 0.045, 0.01, 16, 6)
		"spiky":
			_hair_cap(k, hc, 0.02, 0.0, 0.38)
			if not hat:
				k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
				var tips := [Vector3(0, 1, -0.35), Vector3(0.45, 0.85, -0.3), Vector3(-0.45, 0.85, -0.3), Vector3(0.25, 0.95, 0.15),
					Vector3(-0.25, 0.95, 0.15), Vector3(0.0, 0.8, 0.55), Vector3(0.6, 0.6, 0.3), Vector3(-0.6, 0.6, 0.3), Vector3(0.0, 0.92, -0.05)]
				for t in tips:
					var d: Vector3 = (t as Vector3).normalized()
					var base := HEAD_C + d * 0.15
					k.cone(base, base + (d + Vector3(0, 0.25, 0)).normalized() * 0.085, 0.04, 8)
			_bangs(k, hc, 4, 0.6)
		"long":
			_hair_cap(k, hc, 0.017, -0.01, 0.34)
			k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
			var curtain := PackedVector2Array([Vector2(0.12, -0.31), Vector2(0.135, -0.315), Vector2(0.162, -0.2),
				Vector2(0.18, -0.07), Vector2(0.182, 0.03), Vector2(0.168, 0.1), Vector2(0.155, 0.09),
				Vector2(0.162, 0.0), Vector2(0.155, -0.1), Vector2(0.135, -0.21), Vector2(0.112, -0.3)])
			k.lathe(curtain, Transform3D(Basis.IDENTITY, HEAD_C), 20, 0.95, PI + 0.6, -0.3)
			for sx in [-1.0, 1.0]:
				k.tube(PackedVector3Array([HEAD_C + Vector3(0.145 * sx, 0.06, -0.06), HEAD_C + Vector3(0.162 * sx, -0.06, -0.055),
					HEAD_C + Vector3(0.158 * sx, -0.18, -0.03), HEAD_C + Vector3(0.15 * sx, -0.26, -0.015)]),
					PackedFloat32Array([0.026, 0.028, 0.024, 0.014]), 8)
			_bangs(k, hc, 4, 0.7)
		"braids":
			_hair_cap(k, hc, 0.017, -0.02, 0.32)
			_bangs(k, hc, 3, 0.55)
			for sx in [-1.0, 1.0]:
				k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
				var start := HEAD_C + Vector3(0.13 * sx, -0.03, 0.06)
				for i in 8:
					var t := float(i) / 7.0
					var p := start + Vector3(0.025 * sx * t, -0.3 * t, -0.075 * t) + Vector3(0.008 * sx * (1.0 if i % 2 == 0 else -1.0), 0, 0)
					k.sphere(p, lerpf(0.03, 0.021, t), 10, 6)
				k.paint(Color("#d0463c") if hc.g > 0.25 else Color("#e9c24a"), 0.5)
				var end := start + Vector3(0.025 * sx, -0.33, -0.075)
				k.sphere(end, 0.016, 8, 6)
				k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
				k.cone(end + Vector3(0, -0.005, 0), end + Vector3(0, -0.05, 0.005), 0.018, 8)
		_:
			# "short": tousled cap with a side-swept fringe and sideburns.
			_hair_cap(k, hc, 0.02, 0.0, 0.44)
			_bangs(k, hc, 4, 0.7)
			k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
			for sx in [-1.0, 1.0]:
				k.ellipsoid(HEAD_C + Vector3(0.148 * sx, 0.025, -0.035), Vector3(0.018, 0.04, 0.026), 10, 6)


## A fringe of soft locks along the front hairline.
func _bangs(k: MeshKit, hc: Color, count: int, width: float) -> void:
	if _hat_on:
		return
	k.paint(hc, 0.55, 0.0, 0.0, MeshKit.Pat.HAIR)
	for i in count:
		var t := (float(i) / maxf(count - 1, 1) - 0.5) * width
		var a := -PI * 0.5 + t
		var dir := Vector3(cos(a), 0.0, sin(a))
		var p := HEAD_C + dir * 0.152 + Vector3(0, 0.1 - absf(t) * 0.05, 0)
		var b := Basis(Vector3.UP, -a - PI * 0.5) * Basis(Vector3.FORWARD, 0.5 + t * 0.4) * Basis(Vector3.RIGHT, 0.5)
		k.ellipsoid(p, Vector3(0.042, 0.022, 0.03), 12, 6, b)


func _add_accessory(k: MeshKit, acc: String, c: Dictionary) -> void:
	match acc:
		"beanie", "wolf_ears":
			var col := Color("#e3a63c") if acc == "beanie" else Color("#8a8f99")
			var bt := Transform3D(Basis(Vector3.RIGHT, 0.32).scaled(Vector3(1.03, 1.03, 1.03)), HEAD_C)
			k.paint(col, 0.95, 0.0, 0.0, MeshKit.Pat.KNIT)
			k.lathe(PackedVector2Array([Vector2(0.15, 0.0), Vector2(0.178, 0.012), Vector2(0.183, 0.06), Vector2(0.172, 0.115),
				Vector2(0.142, 0.163), Vector2(0.09, 0.193), Vector2(0.0, 0.203)]), bt, 24, 0.98)
			k.paint(col.darkened(0.08), 0.95, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.torus(bt * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.98)), Vector3(0, 0.025, 0)), 0.178, 0.026, 28, 8)
			if acc == "beanie":
				k.paint(Color("#f4ecdc"), 0.95, 0.0, 0.0, MeshKit.Pat.KNIT)
				k.sphere(bt * Vector3(0, 0.225, 0), 0.042, 12, 8)
			else:
				for sx in [-1.0, 1.0]:
					var base := bt * Vector3(0.1 * sx, 0.16, 0.0)
					var tip := bt * Vector3(0.14 * sx, 0.26, 0.01)
					k.paint(col, 0.95, 0.0, 0.0, MeshKit.Pat.HAIR)
					k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.045, 0.0), Vector2(0.045, 0.0), Vector2(0.0, base.distance_to(tip))]),
						Transform3D(MeshKit.basis_y(tip - base).scaled(Vector3(1.0, 1.0, 0.5)), base), 10)
					k.paint(Color("#e8a7a0"), 0.9)
					var ib := base + (bt.basis * Vector3(0, 0, -0.012))
					k.lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.026, 0.0), Vector2(0.026, 0.0), Vector2(0.0, base.distance_to(tip) * 0.8)]),
						Transform3D(MeshKit.basis_y(tip - base).scaled(Vector3(1.0, 1.0, 0.4)), ib), 8)
		"ranger_hat":
			var rt := Transform3D(Basis(Vector3.RIGHT, 0.12), HEAD_C + Vector3(0, 0.075, 0))
			k.paint(Color("#9a8458"), 0.85, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.lathe(PackedVector2Array([Vector2(0.12, -0.01), Vector2(0.27, -0.006), Vector2(0.29, 0.0), Vector2(0.27, 0.008),
				Vector2(0.16, 0.012), Vector2(0.152, 0.02), Vector2(0.155, 0.08), Vector2(0.13, 0.13), Vector2(0.06, 0.15),
				Vector2(0.0, 0.135)]), rt, 26, 1.0)
			k.paint(Color("#4a3022"), 0.6, 0.0, 0.0, MeshKit.Pat.LEATHER)
			k.cylinder(rt * Vector3(0, 0.012, 0), rt * Vector3(0, 0.04, 0), 0.157, 0.155, 24, false)
		"bucket_hat":
			var bt2 := Transform3D(Basis(Vector3.RIGHT, 0.14), HEAD_C + Vector3(0, 0.04, 0))
			k.paint(Color("#a8956a"), 0.92, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.lathe(PackedVector2Array([Vector2(0.15, 0.03), Vector2(0.235, -0.04), Vector2(0.245, -0.032), Vector2(0.178, 0.04),
				Vector2(0.172, 0.13), Vector2(0.14, 0.165), Vector2(0.0, 0.17)]), bt2, 26, 0.98)
			k.paint(Color("#6f8f4e"), 0.9, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.cylinder(bt2 * Vector3(0, 0.035, 0), bt2 * Vector3(0, 0.06, 0), 0.179, 0.177, 24, false)
		"lighthouse_cap":
			var lt := Transform3D(Basis(Vector3.RIGHT, 0.15), HEAD_C + Vector3(0, 0.07, 0))
			k.paint(Color("#23345a"), 0.7, 0.0, 0.0, MeshKit.Pat.CANVAS)
			k.lathe(PackedVector2Array([Vector2(0.14, -0.02), Vector2(0.168, -0.01), Vector2(0.18, 0.07), Vector2(0.196, 0.1),
				Vector2(0.18, 0.118), Vector2(0.0, 0.122)]), lt, 24, 0.98)
			k.paint(Color("#1a1a1f"), 0.35, 0.0, 0.0)
			k.cylinder(lt * Vector3(0, -0.012, 0), lt * Vector3(0, 0.025, 0), 0.17, 0.172, 24, false)
			k.ellipsoid(lt * Vector3(0, -0.01, -0.165), Vector3(0.11, 0.012, 0.07), 16, 6, lt.basis * Basis(Vector3.RIGHT, -0.22))
			k.paint(Color("#f2c14e"), 0.3, 0.9, 0.3)
			k.rbox(lt * Transform3D(Basis(Vector3.RIGHT, -0.15), Vector3(0, 0.035, -0.178)), Vector3(0.04, 0.026, 0.01), 0.004)
		"crown_of_embers":
			var ct := Transform3D(Basis(Vector3.RIGHT, 0.22), HEAD_C + Vector3(0, 0.1, 0))
			k.paint(Color("#3a2e2a"), 0.4, 0.8, 0.0)
			k.torus(ct * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.97)), Vector3.ZERO), 0.162, 0.014, 28, 6)
			for i in 7:
				var a := -PI * 0.5 + (float(i) - 3.0) * 0.42
				var base := ct * Vector3(cos(a) * 0.162, 0.005, sin(a) * 0.157)
				var hgt := 0.075 if i == 3 else (0.06 if absi(i - 3) == 1 else 0.045)
				k.paint(Color("#ff8a2a"), 0.3, 0.0, 2.4, MeshKit.Pat.CRYSTAL)
				k.cone(base, base + ct.basis * Vector3(cos(a) * 0.02, hgt, sin(a) * 0.02), 0.019, 8)
			k.paint(Color("#ffd27a"), 0.2, 0.0, 3.0)
			k.sphere(ct * Vector3(0, 0.0, -0.172), 0.016, 10, 6)
		"glasses":
			k.paint(Color("#3a2a22"), 0.35, 0.2, 0.0)
			for sx in [-1.0, 1.0]:
				var gc := HEAD_C + Vector3(0.058 * sx, 0.002, -0.168)
				k.torus(Transform3D(Basis(Vector3.UP, 0.25 * sx) * Basis(Vector3.RIGHT, PI * 0.5), gc), 0.031, 0.0048, 22, 6)
				k.tube(PackedVector3Array([gc + Vector3(0.03 * sx, 0.004, 0.008), HEAD_C + Vector3(0.15 * sx, 0.01, -0.07),
					HEAD_C + Vector3(0.163 * sx, 0.0, 0.0)]), PackedFloat32Array([0.0042, 0.0042, 0.004]), 5)
			k.tube(PackedVector3Array([HEAD_C + Vector3(-0.028, 0.012, -0.172), HEAD_C + Vector3(0.0, 0.018, -0.176),
				HEAD_C + Vector3(0.028, 0.012, -0.172)]), PackedFloat32Array([0.004, 0.004, 0.004]), 5, false)
		"headlamp":
			var ht := Transform3D(Basis(Vector3.RIGHT, 0.28), HEAD_C + Vector3(0, 0.05, 0))
			k.paint(Color("#2a2a2e"), 0.7, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.torus(ht * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.98)), Vector3.ZERO), 0.164, 0.01, 28, 5, TAU, 1.6)
			k.paint(Color("#e3923a"), 0.4, 0.1, 0.0)
			k.rbox(ht * Transform3D(Basis.IDENTITY, Vector3(0, 0.0, -0.172)), Vector3(0.06, 0.04, 0.03), 0.01)
			k.paint(Color("#fff3c4"), 0.1, 0.0, 1.6)
			k.cylinder(ht * Vector3(0, 0.0, -0.186), ht * Vector3(0, 0.0, -0.19), 0.014, 0.014, 12, true)
		"flower_crown":
			var ft := Transform3D(Basis(Vector3.RIGHT, 0.3), HEAD_C + Vector3(0, 0.075, 0))
			k.paint(Color("#4f7a3a"), 0.7)
			k.torus(ft * Transform3D(Basis.from_scale(Vector3(1.0, 1.0, 0.98)), Vector3.ZERO), 0.166, 0.008, 28, 5)
			var petal_cols := [Color("#f7f4ee"), Color("#f2a6c8"), Color("#a98be0"), Color("#ffd65a")]
			for i in 9:
				var a := -PI * 0.5 + (float(i) - 4.0) * 0.36
				var fc := ft * Vector3(cos(a) * 0.168, 0.006, sin(a) * 0.165)
				var outward := (ft.basis * Vector3(cos(a), 0.35, sin(a))).normalized()
				var fb := MeshKit.basis_y(outward)
				k.paint(petal_cols[i % petal_cols.size()], 0.7)
				for pi_i in 5:
					var pa := TAU * float(pi_i) / 5.0
					k.sphere(fc + fb * Vector3(cos(pa) * 0.014, 0.004, sin(pa) * 0.014), 0.0105, 8, 5)
				k.paint(Color("#f2c14e"), 0.6)
				k.sphere(fc + fb * Vector3(0, 0.008, 0), 0.008, 8, 5)


func _mesh_eyes() -> ArrayMesh:
	var k := MeshKit.new()
	for sx in [-1.0, 1.0]:
		var c := Vector3(0.058 * sx, 0.0, 0.0)
		k.paint(Color("#2a1d17"), 0.12)
		k.ellipsoid(c, Vector3(0.022, 0.03, 0.012), 14, 8, Basis(Vector3.UP, -0.38 * sx))
		k.paint(Color("#ffffff"), 0.2, 0.0, 0.35)
		k.sphere(c + Vector3(0.007 * sx, 0.011, -0.009), 0.0065, 8, 5)
		k.sphere(c + Vector3(-0.006 * sx, -0.01, -0.009), 0.0032, 6, 4)
	return k.to_mesh()


func _mesh_brows(hair: Color) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(hair.darkened(0.25), 0.7)
	for sx in [-1.0, 1.0]:
		k.capsule(Vector3(0.033 * sx, 0.0, -0.004), Vector3(0.082 * sx, -0.008, 0.016), 0.0085, 0.0075, 8, 3)
	return k.to_mesh()


func _mesh_mouth() -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(Color("#7a3a32"), 0.5)
	var pts := PackedVector3Array()
	var radii := PackedFloat32Array()
	for i in 7:
		var t := float(i) / 6.0 * 2.0 - 1.0
		var x := t * 0.027
		var r := 0.141
		var z := -sqrt(maxf(r * r - x * x, 0.0)) * 0.97 - 0.001
		pts.append(Vector3(x, 0.011 * t * t, z))
		radii.append(0.0052 * (1.0 - 0.35 * absf(t)))
	k.tube(pts, radii, 8)
	return k.to_mesh()


func _mesh_upper_arm(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	_sleeve_paint(k, c)
	k.sphere(Vector3(0, -0.02, 0), 0.058, 18, 10)
	k.capsule(Vector3(0, -0.01, 0), Vector3(0, -UPPER_ARM, 0), 0.057, 0.05, 18)
	if str(c["jstyle"]) == "vest":
		k.paint(c["jacket"], 0.45, 0.0, 0.0, MeshKit.Pat.QUILTED)
		k.ellipsoid(Vector3(-0.0, 0.0, 0), Vector3(0.07, 0.05, 0.07), 14, 8)
	return k.to_mesh()


func _mesh_forearm(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	_sleeve_paint(k, c)
	k.capsule(Vector3(0, 0.0, 0), Vector3(0, -0.195, 0), 0.05, 0.045, 18)
	match str(c["jstyle"]):
		"hoodie":
			k.paint(Color(c["jacket"]).darkened(0.12), 0.95, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.cylinder(Vector3(0, -0.175, 0), Vector3(0, -0.215, 0), 0.044, 0.04, 14, true, 0.01)
		"flannel":
			k.paint(c["jacket"], 0.85, 0.0, 0.0, MeshKit.Pat.PLAID)
			k.torus(Transform3D(Basis.IDENTITY, Vector3(0, -0.185, 0)), 0.044, 0.013, 16, 6)
		"raincoat":
			k.paint(c["jacket"], 0.3)
			k.cylinder(Vector3(0, -0.17, 0), Vector3(0, -0.215, 0), 0.05, 0.054, 14, true, 0.008)
		_:
			k.paint(Color(c["shirt"]).darkened(0.1), 0.9, 0.0, 0.0, MeshKit.Pat.RIBBED)
			k.cylinder(Vector3(0, -0.18, 0), Vector3(0, -0.21, 0), 0.046, 0.043, 14, true, 0.008)
	k.paint(c["skin"], 0.6)
	k.cylinder(Vector3(0, -0.19, 0), Vector3(0, -FOREARM - 0.005, 0), 0.034, 0.032, 12, false)
	return k.to_mesh()


func _mesh_hand(c: Dictionary, _side: float) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(c["skin"], 0.6)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.042, 0.004)), Vector3(0.066, 0.075, 0.05), 0.023, 3)
	k.rbox(Transform3D(Basis(Vector3.RIGHT, 0.35), Vector3(0, -0.084, -0.012)), Vector3(0.062, 0.042, 0.052), 0.02, 3)
	k.capsule(Vector3(0.0, -0.032, -0.024), Vector3(0.0, -0.062, -0.046), 0.0145, 0.0135, 10, 3)
	return k.to_mesh()


func _mesh_thigh(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(c["pants"], 0.85, 0.0, 0.0, MeshKit.Pat.DENIM)
	k.capsule(Vector3(0, 0.02, 0), Vector3(0, -THIGH, 0), 0.082, 0.064, 20)
	return k.to_mesh()


func _mesh_shin(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(c["pants"], 0.85, 0.0, 0.0, MeshKit.Pat.DENIM)
	k.capsule(Vector3(0, 0.0, 0), Vector3(0, -0.26, 0), 0.063, 0.056, 18)
	k.paint(c["boots"], 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.cylinder(Vector3(0, -0.235, 0), Vector3(0, -SHIN, 0.0), 0.066, 0.062, 16, true, 0.012)
	k.paint(Color("#e3d6bf"), 0.95, 0.0, 0.0, MeshKit.Pat.KNIT)
	k.torus(Transform3D(Basis.IDENTITY, Vector3(0, -0.238, 0)), 0.064, 0.016, 18, 6)
	k.paint(Color("#d9c9a0"), 0.9)
	for i in 3:
		var y := -0.27 - float(i) * 0.03
		k.capsule(Vector3(-0.025, y, -0.064), Vector3(0.025, y - 0.004, -0.064), 0.0045, 0.0045, 6, 2)
	return k.to_mesh()


func _mesh_foot(c: Dictionary) -> ArrayMesh:
	var k := MeshKit.new()
	k.paint(c["boots"], 0.55, 0.0, 0.0, MeshKit.Pat.LEATHER)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.012, -0.03)), Vector3(0.116, 0.1, 0.2), 0.045, 3)
	k.ellipsoid(Vector3(0, -0.026, -0.112), Vector3(0.058, 0.044, 0.062), 14, 8)
	k.paint(c["sole"], 0.8)
	k.rbox(Transform3D(Basis.IDENTITY, Vector3(0, -0.058, -0.05)), Vector3(0.126, 0.026, 0.245), 0.012, 2)
	k.paint(Color("#d9c9a0"), 0.9)
	for i in 2:
		var z := -0.065 - float(i) * 0.028
		k.capsule(Vector3(-0.024, 0.038 - float(i) * 0.012, z), Vector3(0.024, 0.036 - float(i) * 0.012, z), 0.0045, 0.0045, 6, 2)
	return k.to_mesh()


# --- Animation ---------------------------------------------------------------------------------

func _animate(delta: float) -> void:
	if _frozen:
		_apply_pose(_compute_pose())
		return
	_time += delta
	# Locomotion phase.
	var stride := clampf(0.9 + _speed * 0.28, 1.2, 3.2)
	var prev_phase := _phase
	if _grounded and _speed > 0.05:
		_phase += delta * _speed / stride * TAU
	elif _speed <= 0.05:
		# Settle the legs smoothly toward the neutral stance.
		var target := roundf(_phase / PI) * PI
		_phase = lerpf(_phase, target, 1.0 - exp(-delta * 6.0))
	if _grounded and _speed > 0.6 and _action != "sit" and _action != "die":
		for side in [1, 0]:
			var plant := PI * 0.5 if side == 1 else PI * 1.5
			var a := fposmod(prev_phase - plant, TAU)
			var b := fposmod(_phase - plant, TAU)
			if b < a and _phase - prev_phase < PI:
				footstep.emit(side)
	if _phase > TAU * 64.0:
		_phase = fposmod(_phase, TAU)
	_air = move_toward(_air, 0.0 if _grounded else 1.0, delta * 5.0)
	_hold_w = move_toward(_hold_w, 1.0 if _held_type != "none" else 0.0, delta * 5.0)
	_left_w = move_toward(_left_w, 1.0 if _left != null and is_instance_valid(_left) else 0.0, delta * 4.0)
	_aim_w = move_toward(_aim_w, 1.0 if _aim else 0.0, delta * 7.0)
	var lt := Vector2(_look_yaw, _look_pitch) if _look_on else Vector2(_idle_look, 0.0)
	_look_cur = _look_cur.lerp(lt, 1.0 - exp(-delta * 6.0))
	# Idle look-around.
	_idle_look_timer -= delta
	if _idle_look_timer <= 0.0:
		_idle_look_timer = _rng.randf_range(2.5, 6.0)
		_idle_look_target = 0.0 if _rng.randf() < 0.45 else _rng.randf_range(-0.6, 0.6)
	_idle_look = lerpf(_idle_look, _idle_look_target if _speed < 0.5 else 0.0, 1.0 - exp(-delta * 2.5))
	# Blink.
	_blink_timer -= delta
	if _blink_timer <= 0.0:
		_blink = 1.0
		_blink_timer = _rng.randf_range(1.8, 4.8) if _rng.randf() > 0.15 else 0.22
	_blink = move_toward(_blink, 0.0, delta * 7.5)
	_flash = move_toward(_flash, 0.0, delta * 4.0)
	# Actions.
	if _action != "":
		_action_t += delta
		var u := _action_t / maxf(_action_dur, 0.001)
		if not _action_hit_done and u >= _action_hit_t:
			_action_hit_done = true
			action_hit.emit(_action)
		if u >= 1.0 and not _action_hold:
			var finished := _action
			_action = ""
			action_finished.emit(finished)
	_apply_pose(_compute_pose())


func _p(pose: Dictionary, key: String, v: Vector3) -> void:
	pose[key] = (pose.get(key, Vector3.ZERO) as Vector3) + v


func _mix(pose: Dictionary, key: String, v: Vector3, w: float) -> void:
	pose[key] = (pose.get(key, Vector3.ZERO) as Vector3).lerp(v, clampf(w, 0.0, 1.0))


static func _ease(x: float) -> float:
	x = clampf(x, 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


func _compute_pose() -> Dictionary:
	var P := {}
	for key in _j:
		P[key] = Vector3.ZERO
	var walk := clampf(_speed / 2.2, 0.0, 1.0)
	var run := clampf((_speed - 5.3) / 2.5, 0.0, 1.0)
	var s := sin(_phase)
	var c := cos(_phase)
	var breathe := sin(_time * 1.7)

	# Legs.
	var amp := lerpf(0.5, 0.66, run) * walk
	var kb := lerpf(0.9, 1.65, run)
	var th_r := s * amp
	var th_l := -s * amp
	# Knee flexion peaks early in each leg's swing (just after toe-off).
	var q0 := lerpf(-0.25, -0.65, run)
	var kn_r := -(0.08 + 0.1 * run + kb * pow(maxf(cos(_phase - q0), 0.0), 1.5)) * walk
	var kn_l := -(0.08 + 0.1 * run + kb * pow(maxf(cos(_phase + PI - q0), 0.0), 1.5)) * walk
	P["hip_r"] = Vector3(th_r, 0, 0.02)
	P["hip_l"] = Vector3(th_l, 0, -0.02)
	P["kn_r"] = Vector3(kn_r, 0, 0)
	P["kn_l"] = Vector3(kn_l, 0, 0)
	P["an_r"] = Vector3(-(th_r + kn_r) * 0.85 + 0.12 * maxf(c, 0.0) * walk, 0, 0)
	P["an_l"] = Vector3(-(th_l + kn_l) * 0.85 + 0.12 * maxf(-c, 0.0) * walk, 0, 0)
	# Airborne tuck.
	if _air > 0.0:
		_mix(P, "hip_r", Vector3(0.55, 0, 0.04), _air)
		_mix(P, "kn_r", Vector3(-1.0, 0, 0), _air)
		_mix(P, "hip_l", Vector3(-0.1, 0, -0.04), _air)
		_mix(P, "kn_l", Vector3(-0.45, 0, 0), _air)
		_mix(P, "an_r", Vector3(0.3, 0, 0), _air)
		_mix(P, "an_l", Vector3(0.2, 0, 0), _air)

	# Torso.
	P["hips"] = Vector3(0, -s * 0.11 * walk, c * 0.035 * walk)
	P["spine"] = Vector3(-(0.05 * walk + 0.22 * run) + breathe * 0.012 * (1.0 - walk), s * 0.14 * walk, 0)
	P["neck"] = Vector3(-P["spine"].x * 0.45, -s * 0.06 * walk, 0)
	P["head"] = Vector3(-P["spine"].x * 0.2 + _look_cur.y * 0.6, _look_cur.x * 0.6, 0)
	_p(P, "neck", Vector3(_look_cur.y * 0.4, _look_cur.x * 0.4 - P["spine"].y * 0.6, 0))

	# Arms swing opposite the legs.
	var ak := lerpf(0.75, 0.95, run)
	var el := 0.16 + 0.12 * walk + 1.15 * run
	P["sh_r"] = Vector3(-th_r * ak, 0, 0.07 + 0.08 * run + breathe * 0.008)
	P["sh_l"] = Vector3(-th_l * ak, 0, -0.07 - 0.08 * run - breathe * 0.008)
	P["el_r"] = Vector3(el + maxf(-th_r, 0.0) * 0.4, 0, 0)
	P["el_l"] = Vector3(el + maxf(-th_l, 0.0) * 0.4, 0, 0)
	P["hd_r"] = Vector3(0, 0, 0)
	P["hd_l"] = Vector3(0, 0, 0)
	if _air > 0.0:
		_mix(P, "sh_r", Vector3(0.5, 0, 0.45), _air * 0.8)
		_mix(P, "sh_l", Vector3(0.3, 0, -0.45), _air * 0.8)

	# Right-hand hold poses.
	if _hold_w > 0.0:
		var swing_r := -th_r * ak * 0.3
		var hp := Vector3.ZERO
		var he := Vector3.ZERO
		var hh := Vector3.ZERO
		match _held_type:
			"axe":
				# Resting on the shoulder, lumberjack style.
				hp = Vector3(0.24 + swing_r * 0.5, -0.2, 0.3)
				he = Vector3(1.75 + run * 0.15, 0.0, 0.0)
				hh = Vector3(0.2, 0.0, 0.32)
			"melee":
				if _held_id == "wooden_bat":
					hp = Vector3(0.24 + swing_r * 0.5, -0.2, 0.3)
					he = Vector3(1.75 + run * 0.15, 0.0, 0.0)
					hh = Vector3(0.25, 0.0, 0.32)
				else:
					# Sword held low, tip forward.
					hp = Vector3(0.12 + swing_r, 0.0, 0.12)
					he = Vector3(0.35 + run * 0.5, 0.0, 0.0)
					hh = Vector3(-1.05, 0.0, 0.0)
			"torch":
				hp = Vector3(0.2 + swing_r, 0.0, 0.1)
				he = Vector3(1.1 + run * 0.3, 0.0, 0.0)
				hh = Vector3(-0.35, 0.0, 0.0)
			"gun":
				hp = Vector3(0.12 + swing_r, 0.0, 0.08)
				he = Vector3(0.55 + run * 0.6, 0.0, 0.0)
				hh = Vector3(-0.15, 0.0, 0.0)
			"flashlight":
				hp = Vector3(0.75 + _aim_pitch * 0.8, 0.1, 0.06)
				he = Vector3(0.35, 0.0, 0.0)
				hh = Vector3(0.0, 0.0, 0.0)
			_:
				hp = Vector3(0.18 + swing_r, 0.15, 0.1)
				he = Vector3(1.05, 0.0, 0.0)
				hh = Vector3(0.0, -0.4, 0.0)
		_mix(P, "sh_r", hp, _hold_w)
		_mix(P, "el_r", he, _hold_w)
		_mix(P, "hd_r", hh, _hold_w)
	if _aim_w > 0.0:
		var ap := _aim_pitch
		_mix(P, "sh_r", Vector3(PI * 0.5 + ap, 0.16, 0.0), _aim_w)
		_mix(P, "el_r", Vector3(0.04, 0.0, 0.0), _aim_w)
		_mix(P, "hd_r", Vector3(0.0, 0.0, 0.0), _aim_w)
		if _held_type == "gun":
			_mix(P, "sh_l", Vector3(PI * 0.5 + ap - 0.15, -0.55, 0.0), _aim_w)
			_mix(P, "el_l", Vector3(0.55, 0.0, 0.0), _aim_w)
		_p(P, "spine", Vector3(0, 0.12 * _aim_w, 0))
		_p(P, "neck", Vector3(0, -0.08 * _aim_w, 0))
	# Left hand holding a light (torch).
	if _left_w > 0.0:
		_mix(P, "sh_l", Vector3(0.55 - th_l * 0.15, 0.1, -0.22), _left_w)
		_mix(P, "el_l", Vector3(1.05, 0.0, 0.0), _left_w)
		_mix(P, "hd_l", Vector3(-0.15, 0.0, 0.0), _left_w)

	var body_pos := Vector3.ZERO
	var body_rot := Vector3.ZERO
	# Keep the planted foot on the ground: lower the hips as the legs spread.
	var h_r := THIGH * cos(P["hip_r"].x) + SHIN * cos(P["hip_r"].x + P["kn_r"].x)
	var h_l := THIGH * cos(P["hip_l"].x) + SHIN * cos(P["hip_l"].x + P["kn_l"].x)
	body_pos.y = (maxf(h_r, h_l) - (THIGH + SHIN)) * (1.0 - _air)
	body_pos.y += run * 0.035 * maxf(cos(_phase * 2.0), 0.0)

	# One-shot and held actions.
	if _action != "":
		var u := clampf(_action_t / maxf(_action_dur, 0.001), 0.0, 1.0)
		var w := 1.0
		if not _action_hold:
			w = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.82, 1.0, u))
			if _action in ["chop", "swing"]:
				w = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.86, 1.0, u))
		var r := _action_pose(_action, u, P)
		for key in r:
			if key == "body_pos":
				body_pos = body_pos.lerp(r[key], w)
			elif key == "body_rot":
				body_rot = body_rot.lerp(r[key], w)
			elif key.begins_with("+"):
				_p(P, key.substr(1), (r[key] as Vector3) * w)
			else:
				_mix(P, key, r[key], w)
	P["body_pos"] = body_pos
	P["body_rot"] = body_rot
	return P


## Pose targets for an action at normalised time u. Keys prefixed with "+"
## are added on top instead of blended.
func _action_pose(a: String, u: float, base: Dictionary) -> Dictionary:
	var r := {}
	match a:
		"chop":
			var wind := _ease(u / 0.4)
			var strike := _ease((u - 0.4) / 0.13)
			var rec := _ease((u - 0.66) / 0.34)
			var sh := lerpf(lerpf(0.5, 2.75, wind), 0.62, strike)
			sh = lerpf(sh, 0.5, rec)
			var elb := lerpf(lerpf(0.8, 1.15, wind), 0.12, strike)
			elb = lerpf(elb, 0.75, rec)
			var wr := lerpf(lerpf(-0.1, 0.45, wind), -0.75, strike)
			wr = lerpf(wr, -0.25, rec)
			r["sh_r"] = Vector3(sh, 0.12, 0.12)
			r["el_r"] = Vector3(elb, 0.0, 0.0)
			r["hd_r"] = Vector3(wr, 0.0, 0.0)
			r["sh_l"] = Vector3(sh * 0.9, -0.42, -0.05)
			r["el_l"] = Vector3(elb + 0.25, 0.0, 0.0)
			r["hd_l"] = Vector3(wr, 0.0, 0.0)
			var lean := lerpf(lerpf(0.0, 0.16, wind), -0.32, strike)
			lean = lerpf(lean, 0.0, rec)
			r["+spine"] = Vector3(lean, lerpf(lerpf(0.0, -0.22, wind), 0.12, strike) * (1.0 - rec), 0.0)
			r["+kn_r"] = Vector3(-0.22 * strike * (1.0 - rec), 0, 0)
			r["+kn_l"] = Vector3(-0.22 * strike * (1.0 - rec), 0, 0)
			r["+hip_r"] = Vector3(0.1 * strike * (1.0 - rec), 0, 0)
			r["+hip_l"] = Vector3(0.1 * strike * (1.0 - rec), 0, 0)
		"swing":
			var wind2 := _ease(u / 0.38)
			var strike2 := _ease((u - 0.38) / 0.16)
			var rec2 := _ease((u - 0.62) / 0.38)
			var snap := _ease((u - 0.38) / 0.1)
			var twist := lerpf(lerpf(0.0, -0.7, wind2), 0.6, strike2)
			twist = lerpf(twist, 0.0, rec2)
			var sweep := lerpf(lerpf(-0.2, -1.1, wind2), 1.0, strike2)
			sweep = lerpf(sweep, 0.0, rec2)
			r["+spine"] = Vector3(-0.08 * strike2 * (1.0 - rec2), twist, 0.0)
			r["sh_r"] = Vector3(lerpf(1.2, 1.4, strike2), sweep, lerpf(0.35, 0.05, strike2))
			r["el_r"] = Vector3(lerpf(1.1, 0.25, snap) + 0.4 * rec2, 0.0, 0.0)
			r["hd_r"] = Vector3(lerpf(0.1, -1.25, snap), 0.0, 0.0)
			r["sh_l"] = Vector3(lerpf(0.5, 0.9, strike2), lerpf(0.4, -0.2, strike2), -0.4)
			r["el_l"] = Vector3(0.9, 0.0, 0.0)
			r["+hips"] = Vector3(0.0, twist * 0.35, 0.0)
		"eat":
			var reach := _ease(u / 0.22) * (1.0 - _ease((u - 0.85) / 0.15))
			r["sh_r"] = Vector3(lerpf(0.2, 0.55, reach), lerpf(0.0, 0.42, reach), 0.08)
			r["el_r"] = Vector3(lerpf(0.9, 2.15, reach) + sin(u * 40.0) * 0.06 * reach, 0.0, 0.0)
			r["hd_r"] = Vector3(-0.3 * reach, -0.5 * reach, 0.0)
			r["+head"] = Vector3(-0.12 * reach + sin(u * 45.0) * 0.03 * reach, 0.0, 0.0)
			_mouth_open = maxf(_mouth_open, reach * (0.5 + 0.5 * sin(u * 45.0)))
		"hurt":
			var k := smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.3, 1.0, u))
			r["+spine"] = Vector3(0.3 * k, 0.0, 0.08 * k)
			r["+head"] = Vector3(0.25 * k, 0.0, 0.0)
			r["+sh_r"] = Vector3(0.25 * k, 0.0, 0.35 * k)
			r["+sh_l"] = Vector3(0.25 * k, 0.0, -0.35 * k)
			r["+el_r"] = Vector3(0.6 * k, 0.0, 0.0)
			r["+el_l"] = Vector3(0.6 * k, 0.0, 0.0)
			r["+kn_r"] = Vector3(-0.2 * k, 0.0, 0.0)
			r["+kn_l"] = Vector3(-0.2 * k, 0.0, 0.0)
			_mouth_open = maxf(_mouth_open, k)
		"interact":
			var k2 := sin(clampf(u, 0.0, 1.0) * PI)
			r["sh_r"] = Vector3(lerpf(0.1, 1.05, k2), 0.12, 0.08)
			r["el_r"] = Vector3(lerpf(0.3, 0.2, k2), 0.0, 0.0)
			r["hd_r"] = Vector3(-0.2 * k2, 0.0, 0.0)
			r["+spine"] = Vector3(-0.22 * k2, 0.0, 0.0)
			r["+kn_r"] = Vector3(-0.15 * k2, 0.0, 0.0)
			r["+kn_l"] = Vector3(-0.15 * k2, 0.0, 0.0)
		"shoot":
			var k3 := exp(-u * 7.0) * smoothstep(0.0, 0.05, u)
			r["+sh_r"] = Vector3(0.32 * k3, 0.0, 0.0)
			r["+el_r"] = Vector3(0.3 * k3, 0.0, 0.0)
			r["+hd_r"] = Vector3(0.35 * k3, 0.0, 0.0)
			r["+spine"] = Vector3(0.06 * k3, 0.0, 0.0)
		"wave":
			var up := _ease(u / 0.15) * (1.0 - _ease((u - 0.85) / 0.15))
			r["sh_r"] = Vector3(0.25, 0.0, lerpf(0.1, 2.55, up))
			r["el_r"] = Vector3(0.35 + 0.45 * sin(u * 26.0) * up, 0.0, 0.0)
			r["hd_r"] = Vector3(0.0, 0.0, 0.2 * up)
			r["+head"] = Vector3(0.05 * up, 0.0, 0.08 * up)
		"sit":
			var k4 := _ease(u)
			var b := Vector3(0, -0.76 * k4, 0.04 * k4)
			r["body_pos"] = b
			r["hip_r"] = Vector3(2.45, 0.0, 0.16)
			r["hip_l"] = Vector3(2.45, 0.0, -0.16)
			r["kn_r"] = Vector3(-2.6, 0.0, 0.0)
			r["kn_l"] = Vector3(-2.6, 0.0, 0.0)
			r["an_r"] = Vector3(0.2, 0.0, 0.0)
			r["an_l"] = Vector3(0.2, 0.0, 0.0)
			r["spine"] = Vector3(-0.12 + sin(_time * 1.5) * 0.015, 0.0, 0.0)
			r["sh_r"] = Vector3(0.95, -0.1, 0.12)
			r["sh_l"] = Vector3(0.95, 0.1, -0.12)
			r["el_r"] = Vector3(0.75, 0.0, 0.0)
			r["el_l"] = Vector3(0.75, 0.0, 0.0)
			r["+head"] = Vector3(0.05, 0.0, 0.0)
		"die":
			var buckle := _ease(u / 0.35)
			var fall := _ease((u - 0.3) / 0.55)
			r["body_pos"] = Vector3(0.0, lerpf(-0.32 * buckle, 0.16, fall), 0.0)
			r["body_rot"] = Vector3(0.0, 0.0, 1.42 * fall)
			r["hip_r"] = Vector3(lerpf(0.55, 0.9, fall), 0.0, 0.05)
			r["hip_l"] = Vector3(lerpf(0.55, 0.6, fall), 0.0, -0.05)
			r["kn_r"] = Vector3(lerpf(-1.2, -1.4, fall), 0.0, 0.0)
			r["kn_l"] = Vector3(lerpf(-1.2, -0.9, fall), 0.0, 0.0)
			r["spine"] = Vector3(lerpf(-0.35, -0.2, fall), 0.0, 0.0)
			r["neck"] = Vector3(lerpf(-0.2, 0.0, fall), 0.0, lerpf(0.0, -0.35, fall))
			r["head"] = Vector3(0.0, 0.0, 0.0)
			r["sh_l"] = Vector3(lerpf(0.4, 2.6, fall), 0.0, lerpf(-0.2, -0.1, fall))
			r["el_l"] = Vector3(lerpf(0.4, 1.6, fall), 0.0, 0.0)
			r["sh_r"] = Vector3(lerpf(0.4, 0.7, fall), 0.0, 0.15)
			r["el_r"] = Vector3(lerpf(0.4, 0.9, fall), 0.0, 0.0)
	return r


func _apply_pose(P: Dictionary) -> void:
	for key in _j:
		if key == "body":
			continue
		var n: Node3D = _j[key]
		n.rotation = P.get(key, Vector3.ZERO)
	_body.position = P.get("body_pos", Vector3.ZERO)
	_body.rotation = P.get("body_rot", Vector3.ZERO)
	# Face.
	var squeeze := 0.0
	if _action == "hurt":
		squeeze = 0.7 * (1.0 - clampf(_action_t / maxf(_action_dur, 0.001), 0.0, 1.0))
	var closed := _action == "die" and _action_t > _action_dur * 0.5
	var eye_y := 1.0 - maxf(maxf(1.0 - absf(_blink * 2.0 - 1.0), squeeze), 0.0) * 0.9
	if _blink <= 0.0:
		eye_y = 1.0 - squeeze * 0.9
	if closed or _action == "sit" and _action_t > _action_dur and sin(_time * 0.4) > 0.6:
		eye_y = 0.1
	_eyes.scale = Vector3(1.0, maxf(eye_y, 0.08), 1.0)
	var brow_up := 0.0
	if _action == "hurt":
		brow_up = 0.012 * (1.0 - clampf(_action_t / maxf(_action_dur, 0.001), 0.0, 1.0))
	elif _action in ["chop", "swing"]:
		brow_up = -0.006
	_brows.position = HEAD_C + Vector3(0, 0.055 + brow_up, -0.142)
	_brows.rotation.z = 0.0
	_mouth.scale = Vector3(1.0 - 0.3 * _mouth_open, 1.0 + 2.6 * _mouth_open, 1.0)
	_mouth_open = move_toward(_mouth_open, 0.0, 0.08)
	var f := snappedf(_flash, 0.02)
	if f != _flash_applied:
		_flash_applied = f
		for p in _parts:
			if is_instance_valid(p):
				(p as GeometryInstance3D).set_instance_shader_parameter("hit_flash", f)
