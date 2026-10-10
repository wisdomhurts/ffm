class_name LandmarkMarker
extends Node3D
## Map marker for one landmark (group "map_marker"), sitting at its centre.
## Contract: get_map_marker() -> {"kind": "landmark"|"trader", "label",
## "important": true, "discovered"} plus "id" (the WorldGen landmark id).

var landmark_id := ""
var label := ""
var kind := "landmark"
var discovered := false


func _init(p_id: String = "", p_label: String = "", p_kind: String = "landmark") -> void:
	landmark_id = p_id
	label = p_label
	kind = p_kind
	name = "MapMarker"


func _ready() -> void:
	add_to_group("map_marker")


func get_map_marker() -> Dictionary:
	return {"kind": kind, "label": label, "important": true, "discovered": discovered, "id": landmark_id}
