extends SceneTree
## Launches the UI self-test (ui_selftest_runner.gd) with autoloads available.
## Run: godot --headless --path . -s res://ui/ui_selftest_launcher.gd


func _initialize() -> void:
	var runner: Node = (load("res://ui/ui_selftest_runner.gd") as GDScript).new()
	root.add_child.call_deferred(runner)
