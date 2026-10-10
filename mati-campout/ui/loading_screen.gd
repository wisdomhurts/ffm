extends CanvasLayer
## Loading screen with progress. STUB: replaced by the UI build.

var label: Label


func _ready() -> void:
	layer = 100
	label = Label.new()
	label.position = Vector2(40, 40)
	add_child(label)


func set_progress(frac: float, text: String) -> void:
	label.text = "%d%%  %s" % [int(frac * 100.0), text]
