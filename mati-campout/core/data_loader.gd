class_name DataLoader
extends RefCounted
## Loads the JSON game data under res://data/.
##
## JSON has no integer type, so whole-number floats are converted back to int
## recursively. Everything else is returned exactly as written.

const DATA_DIR := "res://data/"
const FILES := ["items", "recipes", "loot_tables", "enemies", "upgrades",
		"traders", "buildables", "cosmetics", "balance"]


static func load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_error("DataLoader: missing data file %s" % path)
		return {}
	var text := FileAccess.get_file_as_string(path)
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_error("DataLoader: %s line %d: %s" % [path, json.get_error_line(), json.get_error_message()])
		return {}
	return normalize(json.data)


## Convert floats that are whole numbers into ints, recursively.
static func normalize(v: Variant) -> Variant:
	match typeof(v):
		TYPE_FLOAT:
			var f: float = v
			if is_finite(f) and f == floorf(f) and absf(f) < 2147483647.0:
				return int(f)
			return f
		TYPE_DICTIONARY:
			var d: Dictionary = v
			var out := {}
			for k in d:
				out[k] = normalize(d[k])
			return out
		TYPE_ARRAY:
			var a: Array = v
			var out_a := []
			for e in a:
				out_a.append(normalize(e))
			return out_a
	return v


## Returns {"items": {...}, "recipes": {...}, ...} for every data file.
static func load_all() -> Dictionary:
	var all := {}
	for f in FILES:
		all[f] = load_json(DATA_DIR + f + ".json")
	return all
