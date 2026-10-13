extends Node
## Persistent player profile (user://profile.json): leaderboard, personal
## best, lifetime statistics, cosmetic look and cosmetic unlocks.
##
## Only cosmetics and records survive between runs. Gameplay progress is
## reset every run so each attempt is fair.

signal look_changed()
signal unlocked(unlock_id: String)

const PATH := "user://profile.json"

var leaderboard := LocalLeaderboard.new()
var look: Dictionary = {}
var unlocks: Array = []
var lifetime: Dictionary = {
	"runs": 0, "nights": 0, "trees_chopped": 0, "enemies_defeated": 0,
	"chests_opened": 0, "distance": 0.0, "bosses_defeated": 0, "wolves_tamed": 0,
}
var tutorial_seen := false


func _ready() -> void:
	look = (DB.cosmetics.get("default", {}) as Dictionary).duplicate(true)
	load_profile()


func best_nights() -> int:
	return leaderboard.best()


func player_name() -> String:
	return str(look.get("name", "Mati"))


func set_look(new_look: Dictionary) -> void:
	look = new_look.duplicate(true)
	save_profile()
	look_changed.emit()


func is_unlocked(unlock_id: String) -> bool:
	return unlock_id == "" or unlock_id in unlocks


func unlock(unlock_id: String) -> void:
	if unlock_id == "" or unlock_id in unlocks:
		return
	unlocks.append(unlock_id)
	save_profile()
	unlocked.emit(unlock_id)


## Record a finished run. Returns the leaderboard rank (1-based, 0 = unranked).
func submit_run(summary: Dictionary) -> int:
	var entry := {
		"nights": int(summary.get("nights", 0)),
		"name": player_name(),
		"date": Time.get_datetime_string_from_system(false, true),
		"seed": int(summary.get("seed", 0)),
		"cause": str(summary.get("cause", "")),
		"stats": (summary.get("stats", {}) as Dictionary).duplicate(true),
	}
	var rank := leaderboard.submit(entry)
	lifetime["runs"] = int(lifetime["runs"]) + 1
	lifetime["nights"] = int(lifetime["nights"]) + entry["nights"]
	var st: Dictionary = entry["stats"]
	for k in ["trees_chopped", "enemies_defeated", "chests_opened", "bosses_defeated", "wolves_tamed"]:
		lifetime[k] = int(lifetime.get(k, 0)) + int(st.get(k, 0))
	lifetime["distance"] = float(lifetime.get("distance", 0.0)) + float(st.get("distance", 0.0))
	save_profile()
	return rank


func load_profile() -> void:
	if not FileAccess.file_exists(PATH):
		return
	var d: Variant = DataLoader.normalize(JSON.parse_string(FileAccess.get_file_as_string(PATH)))
	if not d is Dictionary:
		push_warning("Profile: could not read %s, starting fresh" % PATH)
		return
	leaderboard.from_array(d.get("leaderboard", []))
	var saved_look: Dictionary = d.get("look", {})
	for k in saved_look:
		look[k] = saved_look[k]
	unlocks = d.get("unlocks", [])
	var lt: Dictionary = d.get("lifetime", {})
	for k in lt:
		lifetime[k] = lt[k]
	tutorial_seen = bool(d.get("tutorial_seen", false))


func save_profile() -> void:
	var d := {
		"version": 1,
		"leaderboard": leaderboard.to_array(),
		"look": look,
		"unlocks": unlocks,
		"lifetime": lifetime,
		"tutorial_seen": tutorial_seen,
	}
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(d, "  "))
