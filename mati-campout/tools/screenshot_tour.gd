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
var _last_look := Vector3.ZERO

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
	"meadow_day": {"hour": 9.5, "fire": 0.9, "cam": Vector3(15, 3.0, 45), "look": Vector3(35, 1.0, 85)},
	"lake_sunset": {"hour": 18.6, "fire": 0.9, "landmark": "pips_dock", "cam": Vector3(12, 3.0, 6), "look": Vector3(-40, 0.0, -10)},
	"lighthouse_day": {"hour": 13.0, "fire": 0.9, "landmark": "lighthouse", "cam": Vector3(38, 8, -30), "look": Vector3(0, 12, 0)},
	"lighthouse_night": {"hour": 22.5, "fire": 0.9, "landmark": "lighthouse", "cam": Vector3(40, 6, -28), "look": Vector3(0, 14, 0)},
	"ridge_day": {"hour": 15.0, "fire": 0.9, "landmark": "brams_dig", "cam": Vector3(-20, 6, 25), "look": Vector3(30, 12, -40)},
	"abandoned_camp": {"hour": 16.0, "fire": 0.9, "landmark": "abandoned_camp", "cam": Vector3(14, 4, 12), "look": Vector3(0, 1, 0)},
	"elder_grove": {"hour": 12.0, "fire": 0.9, "landmark": "elder_grove", "cam": Vector3(20, 3, 20), "look": Vector3(0, 8, 0)},
	"rain_day": {"hour": 14.0, "fire": 0.9, "rain": true, "cam": Vector3(9, 4.2, 11), "look": Vector3(0, 1.0, 0)},
	"chop_close": {"hour": 10.5, "fire": 0.9, "landmark": "@tree", "cam": Vector3(3.2, 1.7, 2.6), "look": Vector3(0, 1.4, 0), "chop": 2, "chop_wait": 0.15, "chop_from": Vector3(1.3, 0, -1.0), "hide_player": true},
	"tree_fall": {"hour": 15.5, "fire": 0.9, "landmark": "@tree", "cam": Vector3(-12, 3.5, 11), "look": Vector3(0, 4.0, 0), "chop": 5, "chop_wait": 1.0, "chop_from": Vector3(-1.5, 0, -1.6), "hide_player": true},
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
			if str(s["landmark"]) == "@tree" and GameState.vegetation:
				# The standing tree nearest the camp (first wood).
				var tid := int(GameState.vegetation.call("find_tree", Vector3.ZERO, 80.0))
				if tid >= 0:
					origin = (GameState.vegetation.call("tree_info", tid) as Dictionary).get("pos", Vector3.ZERO)
		var cpos: Vector3 = origin + (s["cam"] as Vector3)
		var ground_h := GameState.world_gen.height_at(cpos.x, cpos.z)
		cpos.y = maxf(cpos.y + ground_h, ground_h + 1.0) if not s.has("landmark") else maxf(cpos.y + origin.y, ground_h + 1.0)
		var look: Vector3 = origin + (s["look"] as Vector3)
		if not s.has("landmark"):
			look.y += GameState.world_gen.height_at(look.x, look.z)
		_last_look = look
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
	var player_3d := GameState.player as Node3D
	if player_3d and s.get("hide_player", false):
		player_3d.visible = false
	# Let fog, TAA, particles and auto-exposure settle.
	for _i in 45:
		await get_tree().process_frame
	if s.has("chop"):
		await _chop_action(s)
	var img := get_viewport().get_texture().get_image()
	var path := "res://tests/output/shots/%s.png" % shot_name
	img.save_png(path)
	print("SHOT saved ", ProjectSettings.globalize_path(path))
	_print_render_stats(shot_name)
	if player_3d and is_instance_valid(player_3d):
		player_3d.visible = true
	if hud is CanvasLayer:
		(hud as CanvasLayer).visible = true


## Draw calls / objects / primitives of the last frame (visible + shadow passes).
func _print_render_stats(shot_name: String) -> void:
	var vp := get_viewport()
	var vis := Viewport.RENDER_INFO_TYPE_VISIBLE
	var sh := Viewport.RENDER_INFO_TYPE_SHADOW
	print("SHOT stats %s: draws %d (+%d shadow), objects %d (+%d), primitives %d (+%d)" % [shot_name,
		vp.get_render_info(vis, Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME), vp.get_render_info(sh, Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME),
		vp.get_render_info(vis, Viewport.RENDER_INFO_OBJECTS_IN_FRAME), vp.get_render_info(sh, Viewport.RENDER_INFO_OBJECTS_IN_FRAME),
		vp.get_render_info(vis, Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME), vp.get_render_info(sh, Viewport.RENDER_INFO_PRIMITIVES_IN_FRAME)])


## Preset key "chop": N hits the tree nearest the look point N times through
## the Vegetation API (from the camera side), then waits "chop_wait" seconds
## of game time (slowed down so the low-fps renderer can catch the moment).
func _chop_action(s: Dictionary) -> void:
	var veg: Node = GameState.vegetation
	if veg == null or not veg.has_method("find_tree"):
		return
	var look := _last_look
	look.y = GameState.world_gen.height_at(look.x, look.z)
	var id := int(veg.call("find_tree", look, 12.0))
	if id < 0:
		return
	# The axe swings from "chop_from" (relative to the tree), else the camera.
	var from: Vector3 = cam.global_position if cam else look + Vector3(3, 0, 0)
	if s.has("chop_from"):
		from = look + (s["chop_from"] as Vector3)
	Engine.time_scale = 0.06
	var results: Array = []
	for _i in int(s.get("chop", 1)):
		results.append(veg.call("hit_tree", id, 1, false, from))
	print("SHOT chop tree %d: %s" % [id, str(results)])
	# A scene-tree timer that follows Engine.time_scale counts game time.
	await get_tree().create_timer(float(s.get("chop_wait", 0.1)), true, false, false).timeout
	# Freeze the moment and make sure it has been drawn before capturing.
	Engine.time_scale = 0.0
	for _i in 3:
		await get_tree().process_frame
	Engine.time_scale = 1.0


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
