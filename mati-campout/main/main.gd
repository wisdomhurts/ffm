extends Node
## Scene router: title screen -> loading -> game -> game over.
##
## Command-line options (pass after `--`):
##   --autostart       skip the title screen
##   --seed=N          use a fixed world seed
##   --smoke           run the automated smoke test, then quit
##   --shots=a,b,c     run the screenshot tour, then quit
##   --dev             enable dev tools (handled by Settings)

var current_screen: Node = null
var game: Game = null
var _args: Dictionary = {}


func _ready() -> void:
	_args = parse_args()
	Events.player_died.connect(_on_player_died)
	if _args.has("smoke"):
		var smoke: Node = load("res://tests/smoke_test.gd").new()
		add_child(smoke)
		return
	if _args.has("shots"):
		var tour: Node = load("res://tools/screenshot_tour.gd").new()
		tour.set("shot_list", str(_args["shots"]).split(","))
		add_child(tour)
		return
	if _args.has("autostart"):
		start_run(int(_args.get("seed", -1)))
	else:
		show_title()


static func parse_args() -> Dictionary:
	var out := {}
	for a in OS.get_cmdline_user_args():
		var s := str(a).trim_prefix("--")
		if "=" in s:
			var kv := s.split("=", true, 1)
			out[kv[0]] = kv[1]
		else:
			out[s] = true
	return out


func _set_screen(node: Node) -> void:
	if current_screen and is_instance_valid(current_screen):
		current_screen.queue_free()
	current_screen = node
	if node:
		add_child(node)


func show_title() -> void:
	_free_game()
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var title: Node = load("res://ui/title_screen.gd").new()
	title.connect("play_pressed", func() -> void: start_run(int(_args.get("seed", -1))))
	_set_screen(title)
	Audio.set_music_mood("title")


## Start a fresh run. Returns once the world is built and play has begun.
func start_run(p_seed: int = -1) -> void:
	_free_game()
	get_tree().paused = false
	var loading: Node = load("res://ui/loading_screen.gd").new()
	_set_screen(loading)
	await get_tree().process_frame
	GameState.new_run(p_seed)
	game = Game.new()
	game.name = "Game"
	add_child(game)
	move_child(game, 0)
	await game.build(func(frac: float, text: String) -> void: loading.call("set_progress", frac, text))
	if not is_instance_valid(game):
		return
	_set_screen(null)
	GameState.begin_play()


func _free_game() -> void:
	if game and is_instance_valid(game):
		game.queue_free()
	game = null
	GameState.clear_scene_refs()


func _on_player_died(_cause: String) -> void:
	if _args.has("smoke"):
		return
	# Let the death sequence play before the game-over screen.
	await get_tree().create_timer(2.6, true, false, true).timeout
	var summary := GameState.end_run()
	var over: Node = load("res://ui/game_over.gd").new()
	over.set("summary", summary)
	over.connect("retry_pressed", func() -> void: start_run(-1))
	over.connect("title_pressed", show_title)
	_set_screen(over)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
