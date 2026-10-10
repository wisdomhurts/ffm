class_name Player
extends CharacterBody3D
## The player: movement, camera, interaction, tools, survival. STUB.

var camera: Camera3D
var _yaw := 0.0
var _pitch := -0.3
var _interact_target: Node3D = null


func setup(game: Game) -> void:
	GameState.player = self
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.6
	col.shape = cap
	col.position.y = 0.8
	add_child(col)
	var mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.35
	cm.height = 1.6
	mesh.mesh = cm
	mesh.position.y = 0.8
	add_child(mesh)
	camera = Camera3D.new()
	add_child(camera)
	camera.top_level = true
	global_position = game.gen.ground(Vector3(3.0, 0.0, 4.0), 0.1)
	if DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_yaw -= event.relative.x * 0.003
		_pitch = clampf(_pitch - event.relative.y * 0.003, -1.2, 0.5)
	if event.is_action_pressed("interact") and _interact_target:
		_interact_target.call("interact", self)


func _physics_process(delta: float) -> void:
	if not GameState.is_playing():
		return
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var dir := Vector3(input.x, 0, input.y).rotated(Vector3.UP, _yaw)
	var speed := DB.bf("player.sprint_speed", 8.0) if Input.is_action_pressed("sprint") else DB.bf("player.walk_speed", 5.0)
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	velocity.y -= DB.bf("player.gravity", 18.0) * delta
	move_and_slide()
	var target := global_position + Vector3(0, 1.6, 0)
	var offs := Vector3(0, 0, 4.6).rotated(Vector3.RIGHT, _pitch).rotated(Vector3.UP, _yaw)
	camera.global_position = target + offs
	camera.look_at(target)
	_update_interact()
	var env := {"ambient": 70.0, "heat": 0.0}
	if GameState.campfire:
		env["heat"] = GameState.campfire.call("heat_at", global_position)
	GameState.survival.tick(delta, env)


func _update_interact() -> void:
	_interact_target = null
	var best := 1e9
	for n in get_tree().get_nodes_in_group("interactable"):
		var n3 := n as Node3D
		var d := n3.global_position.distance_to(global_position)
		if d < float(n3.get("interact_radius") if n3.get("interact_radius") != null else 2.2) and d < best:
			if str(n3.call("get_interact_text", self)) != "":
				best = d
				_interact_target = n3


# --- Automation / public API (kept by the real implementation) -------------

func teleport(pos: Vector3) -> void:
	global_position = pos
	velocity = Vector3.ZERO


func look_at_point(p: Vector3) -> void:
	var d := p - global_position
	_yaw = atan2(-d.x, -d.z)


func use_item() -> void:
	pass


func interact_nearest() -> bool:
	_update_interact()
	if _interact_target:
		_interact_target.call("interact", self)
		return true
	return false


func get_interact_target() -> Node3D:
	_update_interact()
	return _interact_target
