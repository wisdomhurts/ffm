extends Node
## Loads every GDScript in the project (with autoloads available) so parse
## and compile errors surface. Usage:
##   godot --headless --path . res://tools/parse_check.tscn [-- --only=res://world/]

const SKIP := ["res://.godot", "res://tests/output", "res://addons"]


func _ready() -> void:
	var only := ""
	for a in OS.get_cmdline_user_args():
		if str(a).begins_with("--only="):
			only = str(a).trim_prefix("--only=")
	var files: Array = []
	_collect("res://", files)
	var bad := 0
	for f in files:
		if only != "" and not str(f).begins_with(only):
			continue
		var s: Variant = ResourceLoader.load(f)
		if s == null or not (s as GDScript).can_instantiate() and not (s as GDScript).is_abstract():
			print("PARSE FAIL ", f)
			bad += 1
	print("PARSE CHECK: %d scripts, %d failed" % [files.size(), bad])
	get_tree().quit(1 if bad > 0 else 0)


func _collect(dir_path: String, out: Array) -> void:
	for s in SKIP:
		if dir_path.begins_with(s):
			return
	var d := DirAccess.open(dir_path)
	if d == null:
		return
	for f in d.get_files():
		if f.ends_with(".gd"):
			out.append(dir_path.path_join(f))
	for sub in d.get_directories():
		_collect(dir_path.path_join(sub), out)
