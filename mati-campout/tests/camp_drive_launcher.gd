extends SceneTree
## Launches the campsite integration test (tests/camp_drive.gd) with
## autoloads available.
## Run: godot --headless --path . -s res://tests/camp_drive_launcher.gd


func _initialize() -> void:
	var drive: Node = (load("res://tests/camp_drive.gd") as GDScript).new()
	drive.name = "CampDrive"
	root.add_child.call_deferred(drive)
