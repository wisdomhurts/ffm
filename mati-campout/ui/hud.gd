class_name HUD
extends CanvasLayer
## In-game HUD and modal UIs. STUB: replaced by the UI build.

var label: Label


func setup(_game: Game) -> void:
	label = Label.new()
	label.position = Vector2(20, 20)
	add_child(label)


func _process(_delta: float) -> void:
	var s := GameState.survival
	label.text = "HP %d  Food %d  Warm %d  |  Fire %s %d/%d  |  Day %d %s" % [
		s.health, s.hunger, s.warmth, GameState.fire.state_name(), GameState.fire.fuel,
		GameState.fire.max_fuel(), GameState.day_cycle.day, GameState.day_cycle.clock_text()]
