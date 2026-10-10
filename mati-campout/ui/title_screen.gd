extends CanvasLayer
## Title screen. STUB: replaced by the UI build.
signal play_pressed


func _ready() -> void:
	var b := Button.new()
	b.text = "Play"
	b.position = Vector2(860, 500)
	b.pressed.connect(func() -> void: play_pressed.emit())
	add_child(b)
