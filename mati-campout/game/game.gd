class_name Game
extends Node3D
## Root of a survival run. Builds every world system in order (behind the
## loading screen), runs the day/night clock and glues systems together.
##
## Each system is a child node with `func setup(game: Game) -> void` (may
## await). Systems find each other through these fields or GameState.

var gen: WorldGen
var env: EnvironmentController
var terrain: Terrain
var vegetation: Vegetation
var gatherables: Gatherables
var landmarks: Landmarks
var camp: Campsite
var chests: ChestManager
var player: Player
var wildlife: Wildlife
var spawner: Spawner
var hud: HUD
## Parent for dropped item pickups.
var pickups: Node3D
## Parent for short-lived effects (chips, sparks, dust).
var fx: Node3D

var _death_handled := false


func _ready() -> void:
	GameState.game = self
	Events.player_died.connect(_on_player_died)


func _exit_tree() -> void:
	if GameState.game == self:
		GameState.clear_scene_refs()


## Build the world. progress.call(fraction: float, text: String)
func build(progress: Callable) -> void:
	progress.call(0.02, "Unpacking the map...")
	await get_tree().process_frame
	gen = WorldGen.new(GameState.seed)
	GameState.world_gen = gen

	pickups = Node3D.new()
	pickups.name = "Pickups"
	add_child(pickups)
	fx = Node3D.new()
	fx.name = "FX"
	add_child(fx)

	var steps := [
		["env", EnvironmentController, "Painting the sky..."],
		["terrain", Terrain, "Shaping the hills..."],
		["vegetation", Vegetation, "Growing the forest..."],
		["gatherables", Gatherables, "Scattering berries and stones..."],
		["landmarks", Landmarks, "Building the lighthouse..."],
		["camp", Campsite, "Pitching your tent..."],
		["chests", ChestManager, "Hiding treasure..."],
		["player", Player, "Lacing up boots..."],
		["wildlife", Wildlife, "Waking the bunnies..."],
		["spawner", Spawner, "Something stirs in the dark..."],
		["hud", HUD, "Lighting the fire..."],
	]
	for i in steps.size():
		var step: Array = steps[i]
		progress.call(0.08 + 0.85 * float(i) / steps.size(), step[2])
		await get_tree().process_frame
		var node: Node = (step[1] as GDScript).new()
		node.name = str(step[0]).capitalize().replace(" ", "")
		add_child(node)
		set(step[0], node)
		if node.has_method("setup"):
			await node.setup(self)
	GameState.vegetation = vegetation
	progress.call(0.96, "Almost there...")
	# Give shaders/particles a couple of frames to warm up behind the loader.
	for _i in 3:
		await get_tree().process_frame
	progress.call(1.0, "")


func _process(delta: float) -> void:
	if not GameState.is_playing():
		return
	GameState.day_cycle.advance(delta * GameState.time_scale)


## Dev tools / tests: spawn a creature near the player.
func dev_spawn(kind: String) -> void:
	if spawner and spawner.has_method("debug_spawn"):
		spawner.debug_spawn(kind)
	elif wildlife and wildlife.has_method("debug_spawn"):
		wildlife.debug_spawn(kind)


func _on_player_died(_cause: String) -> void:
	if _death_handled:
		return
	_death_handled = true
	# Slow-motion moment; the HUD fades to the game-over screen.
	Engine.time_scale = 0.35
	await get_tree().create_timer(1.2, true, false, true).timeout
	Engine.time_scale = 1.0
