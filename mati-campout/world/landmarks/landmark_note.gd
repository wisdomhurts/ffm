class_name LandmarkNote
extends Node3D
## A little readable thing at a landmark (the keeper's logbook, the ranger's
## notice board...). Interactable: "[E] Read the Keeper's Log" shows the next
## kid-friendly line from balance.json landmarks.notes.<id> as a toast.

var prompt := "Read"
var notes: Array = []
var interact_radius := 2.0
var _next := 0


func _init(p_prompt: String = "Read", p_notes: Array = []) -> void:
	prompt = p_prompt
	notes = p_notes
	name = "Note"


func _ready() -> void:
	add_to_group("interactable")


func get_interact_text(_player: Node) -> String:
	return prompt if not notes.is_empty() else ""


func get_interact_point() -> Vector3:
	return global_position


func interact(_player: Node) -> void:
	if notes.is_empty():
		return
	Events.notify.emit(str(notes[_next % notes.size()]), "info")
	_next += 1
	Audio.play("ui_click")
