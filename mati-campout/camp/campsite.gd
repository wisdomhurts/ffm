class_name Campsite
extends Node3D
## The home camp: campfire, tent, picnic table, crafting crate, storage box,
## cooking rack and player-built structures. STUB.

var campfire: Campfire


func setup(game: Game) -> void:
	GameState.camp = self
	global_position = game.gen.ground(Vector3.ZERO)
	campfire = Campfire.new()
	campfire.name = "Campfire"
	add_child(campfire)
	campfire.setup(game)
