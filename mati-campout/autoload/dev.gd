extends Node
## Development mode tools. Enabled by Settings "dev_mode" or the --dev
## command-line flag. All tools work through public game APIs so they also
## serve as a quick integration check.
##
##   F1  toggle the dev overlay (shows these keys and live values)
##   F2  cycle time speed x1 / x5 / x20
##   F3  grant a bundle of test materials and 200 coins
##   F4  spawn a Night Stalker nearby
##   F5  spawn the Three-Headed Wolf boss nearby
##   F6  extinguish the campfire
##   F7  skip to the next phase (day -> dusk -> night -> dawn)
##   F8  toggle god mode (no damage, no hunger/cold death)
##   F9  spawn a wild wolf nearby
##   F10 fill hunger and warmth, heal fully

signal overlay_toggled(visible: bool)

var god_mode := false
var overlay_visible := false
const SPEEDS := [1.0, 5.0, 20.0]
var _speed_index := 0


func enabled() -> bool:
	return bool(Settings.get_value("dev_mode"))


func _unhandled_input(event: InputEvent) -> void:
	if not enabled() or not GameState.is_playing():
		return
	for i in range(1, 11):
		if event.is_action_pressed("dev_f%d" % i):
			run_tool(i)
			get_viewport().set_input_as_handled()
			return


func run_tool(i: int) -> void:
	match i:
		1:
			overlay_visible = not overlay_visible
			overlay_toggled.emit(overlay_visible)
		2:
			_speed_index = (_speed_index + 1) % SPEEDS.size()
			GameState.time_scale = SPEEDS[_speed_index]
			Events.notify.emit("DEV: time x%d" % int(SPEEDS[_speed_index]), "info")
		3:
			grant_test_materials()
		4:
			spawn("night_stalker")
		5:
			spawn("boss_wolf")
		6:
			GameState.fire.extinguish()
			Events.notify.emit("DEV: fire extinguished", "warn")
		7:
			var next := (GameState.day_cycle.phase + 1) % 4
			GameState.day_cycle.skip_to(next)
			Events.notify.emit("DEV: skipped to %s" % GameState.day_cycle.phase_name(), "info")
		8:
			god_mode = not god_mode
			Events.notify.emit("DEV: god mode %s" % ("ON" if god_mode else "OFF"), "info")
		9:
			spawn("wild_wolf")
		10:
			GameState.survival.hunger = GameState.survival.max_hunger
			GameState.survival.warmth = GameState.survival.max_warmth
			GameState.survival.heal(999.0)


func grant_test_materials() -> void:
	var bundle := {"wood": 30, "stone": 20, "coal": 15, "cloth": 15, "scrap_metal": 20,
		"kindling": 10, "bone": 4, "starstone": 3, "cooked_meat": 5, "battery": 3}
	for id in bundle:
		var left := GameState.storage.add(id, int(bundle[id]))
		if left > 0:
			GameState.inventory.add(id, left)
	GameState.add_coins(200)
	Events.notify.emit("DEV: test materials added to camp storage", "good")


func spawn(kind: String) -> void:
	var game := GameState.game
	if game and game.has_method("dev_spawn"):
		game.call("dev_spawn", kind)
	else:
		Events.notify.emit("DEV: no spawner for %s yet" % kind, "warn")
