extends Node
## Runs every tests/unit/test_*.gd file and quits with exit code 0/1.
## Usage: godot --headless --path . res://tests/test_runner.tscn

func _ready() -> void:
	var total := 0
	var failed := 0
	var dir := DirAccess.open("res://tests/unit")
	var files: Array = []
	if dir:
		for f in dir.get_files():
			if f.begins_with("test_") and f.ends_with(".gd"):
				files.append(f)
	files.sort()
	for f in files:
		var script: GDScript = load("res://tests/unit/" + f)
		if script == null:
			print("FAIL %s: could not load" % f)
			failed += 1
			continue
		var inst: Object = script.new()
		for m in inst.get_method_list():
			var mname: String = m["name"]
			if not mname.begins_with("test_"):
				continue
			total += 1
			inst.set("current_test", "%s::%s" % [f, mname])
			var before: int = (inst.get("failures") as Array).size()
			inst.call(mname)
			var after: int = (inst.get("failures") as Array).size()
			if after > before:
				failed += 1
				for i in range(before, after):
					print("FAIL ", inst.get("failures")[i])
	print("UNIT TESTS: %d run, %d failed" % [total, failed])
	get_tree().quit(1 if failed > 0 else 0)
