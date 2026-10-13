class_name CameraRig
extends Node3D
## Smooth third-person orbit camera with a slight over-the-shoulder framing.
##
## Mouse and right stick (look_* actions) orbit; touch drags arrive through
## add_look_input(delta) (radians, from ui/touch_controls.gd) and
## assist_yaw(target) eases the view toward a target (touch aim assist).
## Settings mouse_sensitivity,
## controller_sensitivity, invert_y, fov, camera_distance and camera_shake
## are read live. A SpringArm3D (world layer 1) pulls the camera in front of
## terrain and buildings; the camera is also kept above the terrain height.
## Updated in _process from the target's interpolated transform so motion is
## smooth at any frame rate.

const PIVOT_HEIGHT := 1.48
const SHOULDER := 0.4
const PITCH_MIN := -1.15
const PITCH_MAX := 0.5
const MOUSE_SCALE := 0.0024
const STICK_SPEED := 2.6

var target: Node3D
var yaw := 0.0
var pitch := -0.26
## Off while a modal UI is open or the player is dead.
var input_enabled := true
var sprinting := false
var aiming := false
var dead := false
var camera: Camera3D
var arm: SpringArm3D

var _pivot := Vector3.ZERO
var _len := 4.6
var _shake := 0.0
var _shake_t := 0.0
var _fov_kick := 0.0
var _snap := true
var _stick := Vector2.ZERO
var _death_t := 0.0
var _assist_yaw := 0.0
var _assist_t := 0.0
var _was_captured := false
var _captured_at := 0
var _captured_frame := 0
const CAPTURE_SETTLE_MS := 300


func _init() -> void:
	name = "CameraRig"
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.near = 0.05
	camera.far = 900.0
	camera.top_level = true
	arm = SpringArm3D.new()
	arm.name = "SpringArm"
	arm.collision_mask = 1
	arm.margin = 0.1
	var sphere := SphereShape3D.new()
	sphere.radius = 0.22
	arm.shape = sphere
	arm.top_level = true


func _ready() -> void:
	top_level = true
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(arm)
	add_child(camera)
	if target is CollisionObject3D:
		arm.add_excluded_object((target as CollisionObject3D).get_rid())
	_len = float(Settings.get_value("camera_distance"))
	camera.fov = float(Settings.get_value("fov"))
	camera.current = true
	_update(0.0)


## Jump straight to the target (after a teleport).
func snap() -> void:
	_snap = true


## Request a camera shake (0.1 tap .. 1.0 big slam), scaled by the setting.
func add_shake(strength: float) -> void:
	_shake = clampf(_shake + strength * float(Settings.get_value("camera_shake")), 0.0, 1.0)


func current_distance() -> float:
	return _len


## World-space forward direction of the view.
func forward() -> Vector3:
	return -camera.global_basis.z


## Where the crosshair points: from the camera along the current yaw/pitch
## (ignores shake, and is up to date even before the next _process).
func aim_dir() -> Vector3:
	return -Basis.from_euler(Vector3(pitch, yaw, 0.0)).z


## Where the camera sits for the current yaw/pitch (unshaken, unlagged).
func aim_origin() -> Vector3:
	if target == null or not is_instance_valid(target):
		return camera.global_position
	var dist := maxf(float(Settings.get_value("camera_distance")), 0.5)
	var dir := (Basis.from_euler(Vector3(pitch, yaw, 0.0)) * Vector3(SHOULDER, 0.0, dist)).normalized()
	return target.global_position + Vector3(0.0, PIVOT_HEIGHT, 0.0) + dir * _len


## Forward on the ground plane.
func flat_forward() -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


## Orbit by a touch drag: delta.x turns (radians, + = right), delta.y tilts
## (radians, + = down). Settings invert_y applies; sensitivity is applied by
## the caller (touch controls scale by their own setting).
func add_look_input(delta: Vector2) -> void:
	if not input_enabled or dead:
		return
	var inv := -1.0 if bool(Settings.get_value("invert_y")) else 1.0
	yaw -= delta.x
	pitch = clampf(pitch - delta.y * inv, PITCH_MIN, PITCH_MAX)
	_assist_t = 0.0


## Ease the view toward a yaw over `seconds` (touch aim assist). A look
## drag cancels it.
func assist_yaw(target_yaw: float, seconds: float = 0.18) -> void:
	_assist_yaw = target_yaw
	_assist_t = maxf(seconds, 0.01)


func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled or dead:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		_track_capture()
		# Browsers can report one huge jump right after pointer lock starts
		# (the cursor "warps"); ignore big moves in the first moments.
		var settling := Time.get_ticks_msec() - _captured_at < CAPTURE_SETTLE_MS \
			or Engine.get_process_frames() - _captured_frame <= 3
		if settling and mm.relative.length() > 60.0:
			return
		var sens := float(Settings.get_value("mouse_sensitivity"))
		var inv := -1.0 if bool(Settings.get_value("invert_y")) else 1.0
		yaw -= mm.relative.x * MOUSE_SCALE * sens
		pitch = clampf(pitch - mm.relative.y * MOUSE_SCALE * sens * inv, PITCH_MIN, PITCH_MAX)


func _process(delta: float) -> void:
	_track_capture()
	_update(delta)


func _track_capture() -> void:
	var cap := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if cap and not _was_captured:
		_captured_at = Time.get_ticks_msec()
		_captured_frame = Engine.get_process_frames()
	_was_captured = cap


func _update(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var tpos := target.get_global_transform_interpolated().origin
	var desired := tpos + Vector3(0.0, PIVOT_HEIGHT, 0.0)
	if _snap or _pivot.distance_to(desired) > 8.0:
		_pivot = desired
		_snap = false
		_len = maxf(_len, 1.0)
	else:
		var kh := 1.0 - exp(-delta * 15.0)
		var kv := 1.0 - exp(-delta * 8.0)
		_pivot.x = lerpf(_pivot.x, desired.x, kh)
		_pivot.z = lerpf(_pivot.z, desired.z, kh)
		_pivot.y = lerpf(_pivot.y, desired.y, kv)
	global_position = _pivot

	if input_enabled and not dead:
		var v := Input.get_vector("look_left", "look_right", "look_up", "look_down")
		var curved := v * v.length()
		_stick = _stick.lerp(curved, 1.0 - exp(-delta * 14.0))
		var sens := float(Settings.get_value("controller_sensitivity"))
		var inv := -1.0 if bool(Settings.get_value("invert_y")) else 1.0
		yaw -= _stick.x * STICK_SPEED * sens * delta
		pitch -= _stick.y * STICK_SPEED * 0.65 * sens * inv * delta
	else:
		_stick = Vector2.ZERO
	if _assist_t > 0.0 and not dead:
		var k := clampf(delta / _assist_t, 0.0, 1.0)
		yaw = lerp_angle(yaw, _assist_yaw, k)
		_assist_t -= delta
	if dead:
		# Slowly rise and drift around the fallen hero.
		_death_t += delta
		pitch = lerpf(pitch, -0.95, 1.0 - exp(-delta * 0.7))
		yaw += delta * 0.1
	pitch = clampf(pitch, PITCH_MIN, PITCH_MAX)

	var dist := float(Settings.get_value("camera_distance"))
	dist *= lerpf(1.0, 0.72, clampf(pitch / PITCH_MAX, 0.0, 1.0))
	if aiming:
		dist *= 0.8
	if dead:
		dist *= lerpf(1.0, 1.7, smoothstep(0.0, 5.0, _death_t))
	var shoulder := SHOULDER * (0.0 if dead else 1.0)
	var rot := Basis.from_euler(Vector3(pitch, yaw, 0.0))
	var local_dir := Vector3(shoulder, 0.0, dist)
	var full := local_dir.length()
	var arm_z := (rot * local_dir).normalized()
	var arm_x := Vector3.UP.cross(arm_z)
	if arm_x.length_squared() < 0.0001:
		arm_x = Vector3.RIGHT
	arm_x = arm_x.normalized()
	arm.global_transform = Transform3D(Basis(arm_x, arm_z.cross(arm_x), arm_z), _pivot)
	arm.spring_length = full
	var hit := arm.get_hit_length()
	if hit <= 0.001:
		hit = full
	hit = clampf(hit, 0.35, full)
	if hit < _len:
		_len = lerpf(_len, hit, 1.0 - exp(-delta * 30.0)) if delta > 0.0 else hit
	else:
		_len = lerpf(_len, hit, 1.0 - exp(-delta * 3.5)) if delta > 0.0 else hit
	var cam_pos := _pivot + arm_z * _len
	var gen := GameState.world_gen
	if gen:
		var gh := gen.height_at(cam_pos.x, cam_pos.z) + 0.35
		if cam_pos.y < gh:
			cam_pos.y = gh

	# Trauma-style shake: smooth, brief, never nauseating.
	_shake = move_toward(_shake, 0.0, delta * 1.7)
	_shake_t += delta
	var cb := rot
	if _shake > 0.001:
		var s := _shake * _shake * 0.045
		var t := _shake_t
		var off := Vector3(sin(t * 31.7) * 0.6 + sin(t * 17.3) * 0.4, sin(t * 27.1) * 0.6 + sin(t * 13.9) * 0.4,
			sin(t * 23.3) * 0.5) * s
		cb = rot * Basis.from_euler(off)
		cam_pos += rot * Vector3(sin(t * 41.0), sin(t * 37.0), 0.0) * s * 0.4
	camera.global_transform = Transform3D(cb, cam_pos)

	var kick := (6.0 if sprinting else 0.0) + (-7.0 if aiming else 0.0)
	_fov_kick = lerpf(_fov_kick, kick, 1.0 - exp(-delta * 5.0))
	camera.fov = clampf(float(Settings.get_value("fov")) + _fov_kick, 40.0, 110.0)
