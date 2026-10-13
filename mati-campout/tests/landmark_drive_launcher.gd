extends SceneTree
## Launches the landmarks integration test (tests/landmark_drive.gd) with
## autoloads available.
## Run: godot --headless --path . -s res://tests/landmark_drive_launcher.gd [-- --seed=N]


func _initialize() -> void:
	var drive: Node = (load("res://tests/landmark_drive.gd") as GDScript).new()
	drive.name = "LandmarkDrive"
	root.add_child.call_deferred(drive)
