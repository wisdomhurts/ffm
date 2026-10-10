extends CanvasLayer
## Game-over screen. STUB: replaced by the UI build.
signal retry_pressed
signal title_pressed

var summary: Dictionary = {}


func _ready() -> void:
	layer = 50
	var l := Label.new()
	l.text = "You survived %d nights" % int(summary.get("nights", 0))
	l.position = Vector2(800, 400)
	add_child(l)
	var b := Button.new()
	b.text = "Try Again"
	b.position = Vector2(860, 500)
	b.pressed.connect(func() -> void: retry_pressed.emit())
	add_child(b)
