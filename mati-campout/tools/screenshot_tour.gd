extends Node
## Renders named screenshots for visual QA into tests/output/shots/.
##
## Run (needs a display; on Linux CI use xvfb + Mesa lavapipe):
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --path . --resolution 1600x900 -- --shots=camp_day,camp_night
##   --shots=all renders every shot below.
## Each shot sets the time of day, the fire state and a camera pose, waits for
## fog/TAA to settle, then saves the frame.

var shot_list: PackedStringArray = []
var main: Node
var cam: Camera3D

## name -> {hour, fire (0..1 or -1 = out), cam (Vector3), look (Vector3),
##          landmark (optional id the cam/look are relative to), hud (bool), rain}
const SHOTS := {
	"camp_day": {"hour": 11.0, "fire": 0.9, "cam": Vector3(9, 4.2, 11), "look": Vector3(0, 1.0, 0)},
	"camp_golden": {"hour": 17.4, "fire": 0.9, "cam": Vector3(-8, 3.5, 10), "look": Vector3(0, 1.2, 0)},
	"camp_sunset": {"hour": 18.7, "fire": 0.9, "cam": Vector3(10, 2.6, -7), "look": Vector3(0, 1.2, 0)},
	"camp_night": {"hour": 23.0, "fire": 0.95, "cam": Vector3(8, 3.4, 9), "look": Vector3(0, 1.0, 0)},
	"camp_night_wide": {"hour": 23.5, "fire": 0.95, "cam": Vector3(24, 9, 26), "look": Vector3(0, 1.0, 0)},
	"fire_low": {"hour": 0.5, "fire": 0.12, "cam": Vector3(8, 3.4, 9), "look": Vector3(0, 1.0, 0)},
	"fire_out": {"hour": 1.0, "fire": -1.0, "cam": Vector3(8, 3.4, 9), "look": Vector3(0, 1.0, 0)},
	"forest_day": {"hour": 10.0, "fire": 0.9, "cam": Vector3(40, 2.0, -25), "look": Vector3(60, 3.0, -45)},
	"forest_night": {"hour": 22.0, "fire": 0.9, "cam": Vector3(26, 2.0, 18), "look": Vector3(0, 1.5, 0)},
	# Monsters (generic options: spawn, spawn_only, player_at; see _apply_spawn_option).
	"stalker_edge": {"hour": 23.0, "fire": 0.95, "cam": Vector3(0.6, 1.45, -2.2), "look": Vector3(-3.0, 1.25, -12.5), "player_at": Vector3(1.6, 0, 1.0), "spawn_only": true,
		"spawn": [{"kind": "night_stalker", "pos": Vector3(-4.0, 0, -13.9), "pose": "observe"}, {"kind": "night_stalker", "pos": Vector3(4.6, 0, -14.6), "pose": "observe"}]},
	"watcher": {"hour": 22.5, "fire": 0.9, "cam": Vector3(13, 1.6, 13), "look": Vector3(23, 2.4, 26), "player_at": Vector3(12, 0, 11.5), "spawn_only": true,
		"spawn": [{"kind": "watcher", "pos": Vector3(24, 0, 27.5)}]},
	"meadow_day": {"hour": 9.5, "fire": 0.9, "cam": Vector3(15, 3.0, 45), "look": Vector3(35, 1.0, 85)},
	"lake_sunset": {"hour": 18.6, "fire": 0.9, "landmark": "pips_dock", "cam": Vector3(12, 3.0, 6), "look": Vector3(-40, 0.0, -10)},
	"lighthouse_day": {"hour": 13.0, "fire": 0.9, "landmark": "lighthouse", "cam": Vector3(38, 8, -30), "look": Vector3(0, 12, 0)},
	"lighthouse_night": {"hour": 22.5, "fire": 0.9, "landmark": "lighthouse", "cam": Vector3(40, 6, -28), "look": Vector3(0, 14, 0)},
	"ridge_day": {"hour": 15.0, "fire": 0.9, "landmark": "brams_dig", "cam": Vector3(-20, 6, 25), "look": Vector3(30, 12, -40)},
	"abandoned_camp": {"hour": 16.0, "fire": 0.9, "landmark": "abandoned_camp", "cam": Vector3(14, 4, 12), "look": Vector3(0, 1, 0)},
	"elder_grove": {"hour": 12.0, "fire": 0.9, "landmark": "elder_grove", "cam": Vector3(20, 3, 20), "look": Vector3(0, 8, 0)},
	"rain_day": {"hour": 14.0, "fire": 0.9, "rain": true, "cam": Vector3(9, 4.2, 11), "look": Vector3(0, 1.0, 0)},
	"hud_day": {"hour": 10.5, "fire": 0.7, "hud": true},
	"hud_night": {"hour": 22.0, "fire": 0.25, "hud": true},
}


func _ready() -> void:
	main = get_parent()
	process_mode = Node.PROCESS_MODE_ALWAYS
	_run.call_deferred()


func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://tests/output/shots"))
	var args: Dictionary = main.call("parse_args")
	await main.call("start_run", int(args.get("seed", 20261010)))
	var names: Array = []
	for n in shot_list:
		if n == "all":
			names = SHOTS.keys()
			break
		names.append(n)
	for n in names:
		if not SHOTS.has(n):
			print("SHOT unknown: ", n)
			continue
		await _shoot(n, SHOTS[n])
	get_tree().quit(0)


func _shoot(shot_name: String, s: Dictionary) -> void:
	_set_hour(float(s.get("hour", 12.0)))
	_apply_spawn_option(s)
	var f := float(s.get("fire", 0.9))
	if f < 0.0:
		GameState.fire.extinguish()
	else:
		if not GameState.fire.is_lit():
			GameState.fire.relight("kindling", "wood")
		GameState.fire.fuel = GameState.fire.max_fuel() * f
		GameState.fire.burn(0.0001)
	var env: Node = GameState.environment
	if env and env.has_method("set_weather"):
		env.call("set_weather", "rain" if s.get("rain", false) else "clear", true)
	var hud_visible := bool(s.get("hud", false))
	var hud: Node = GameState.game.get("hud") if GameState.game else null
	if hud is CanvasLayer:
		(hud as CanvasLayer).visible = hud_visible
	if s.has("cam"):
		var origin := Vector3.ZERO
		if s.has("landmark"):
			origin = GameState.world_gen.landmark_pos(str(s["landmark"]))
		var cpos: Vector3 = origin + (s["cam"] as Vector3)
		var ground_h := GameState.world_gen.height_at(cpos.x, cpos.z)
		cpos.y = maxf(cpos.y + ground_h, ground_h + 1.0) if not s.has("landmark") else maxf(cpos.y + origin.y, ground_h + 1.0)
		var look: Vector3 = origin + (s["look"] as Vector3)
		if not s.has("landmark"):
			look.y += GameState.world_gen.height_at(look.x, look.z)
		if cam == null:
			cam = Camera3D.new()
			cam.fov = 62.0
			add_child(cam)
		cam.global_position = cpos
		cam.look_at(look)
		cam.current = true
		# Park the player next to the camera so streaming/LOD centre on the view.
		if GameState.player and GameState.player.has_method("teleport"):
			GameState.player.call("teleport", GameState.world_gen.ground(cpos.lerp(look, 0.3), 0.1))
	elif cam:
		cam.current = false
		var pcam: Camera3D = GameState.player.get_viewport().get_camera_3d() if GameState.player else null
		if pcam and pcam != cam:
			pcam.current = true
		if GameState.player and GameState.player.has_method("teleport"):
			GameState.player.call("teleport", GameState.world_gen.ground(Vector3(4, 0, 6), 0.1))
	# Let fog, TAA, particles and auto-exposure settle.
	for _i in 45:
		await get_tree().process_frame
	var img := get_viewport().get_texture().get_image()
	var path := "res://tests/output/shots/%s.png" % shot_name
	img.save_png(path)
	print("SHOT saved ", ProjectSettings.globalize_path(path))
	if hud is CanvasLayer:
		(hud as CanvasLayer).visible = true


## Jump the clock to a specific hour without counting extra nights.
func _set_hour(h: float) -> void:
	var dc := GameState.day_cycle
	var phase := DayCycle.Phase.DAY
	var start := 7.0
	var span := 11.0
	if h >= 7.0 and h < 18.0:
		phase = DayCycle.Phase.DAY
	elif h >= 18.0 and h < 20.0:
		phase = DayCycle.Phase.DUSK; start = 18.0; span = 2.0
	elif h >= 20.0 or h < 5.0:
		phase = DayCycle.Phase.NIGHT; start = 20.0; span = 9.0
		if h < 5.0:
			h += 24.0
	else:
		phase = DayCycle.Phase.DAWN; start = 5.0; span = 2.0
	dc.phase = phase
	dc.phase_time = (h - start) / span * dc.durations[phase]
	GameState.time_scale = 0.0


## Generic monster options for a shot:
##   "spawn": [{"kind", "pos" (relative to the shot origin), "pose" ("observe",
##             "windup", "chase"), "face" (optional relative point; default:
##             the camera)}] - spawned frozen (AI off, still animating);
##   "spawn_only": true - remove other monsters and pause natural spawning;
##   "player_at": Vector3 - park the player here after the camera is placed.
var _monster_shot := false


func _apply_spawn_option(s: Dictionary) -> void:
	var sp: Variant = GameState.game.get("spawner") if GameState.game else null
	if not (sp is Node) or not (sp as Node).has_method("spawn_at"):
		return
	var spawner := sp as Node
	var wants := s.has("spawn") or bool(s.get("spawn_only", false))
	spawner.set("auto_spawn", not bool(s.get("spawn_only", false)))
	if wants or _monster_shot:
		spawner.call("clear_all")
	_monster_shot = wants
	var origin := Vector3.ZERO
	if s.has("landmark"):
		origin = GameState.world_gen.landmark_pos(str(s["landmark"]))
	for e in s.get("spawn", []):
		var d: Dictionary = e
		var m: Variant = spawner.call("spawn_at", str(d.get("kind", "night_stalker")), origin + (d.get("pos", Vector3.ZERO) as Vector3))
		if m is Node3D:
			var mn := m as Node3D
			mn.set("ai_enabled", false)
			mn.set("hold_pose", str(d.get("pose", "")))
			if d.has("face"):
				mn.set("hold_face", GameState.world_gen.ground(origin + (d["face"] as Vector3), 1.5))
			mn.call("fade_in", 0.05)
	if s.has("player_at") and GameState.world_gen:
		_park_player.call_deferred(GameState.world_gen.ground(origin + (s["player_at"] as Vector3), 0.1))


func _park_player(pos: Vector3) -> void:
	if GameState.player and GameState.player.has_method("teleport"):
		GameState.player.call("teleport", pos)
