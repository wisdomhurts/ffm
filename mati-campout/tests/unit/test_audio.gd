extends "res://tests/test_case.gd"
## Audio assets and AudioDirector API (the dummy audio driver cannot output
## sound, so these check loading, lengths, loop flags, buses and that every
## public call runs without errors).

const ONE_SHOTS: Array[String] = [
	"chop", "tree_fall", "wood_pickup", "stone_pickup", "pickup", "coin", "swing",
	"hit", "hit_enemy", "player_hurt", "eat", "fire_whoosh", "fire_ignite",
	"fire_out", "footstep_grass", "footstep_dirt", "footstep_stone",
	"footstep_wood", "footstep_water", "chest_open", "craft", "upgrade", "deny",
	"ui_click", "ui_hover", "ui_open", "ui_close", "stalker_hiss", "stalker_attack",
	"watcher_whisper", "wolf_growl", "wolf_howl", "wolf_bark", "bunny_squeak",
	"boss_roar", "boss_sprint", "boss_pant", "gunshot", "rifle_shot", "click_empty",
	"flashlight_on", "flashlight_off", "splash", "thunder", "night_sting",
	"dawn_chime", "level_up", "tame", "trade", "cook_sizzle", "death",
]
const LOOP_IDS: Array[String] = ["campfire", "stream", "rain", "wind", "cooking", "amb_day", "amb_night"]
const MUSIC_FILES: Array[String] = ["music_title", "music_day", "music_dusk", "music_night_warm",
	"music_night", "music_danger", "music_fire_out", "music_boss"]


## The runner executes inside root._ready (root is busy), so temporary nodes
## go under the Audio autoload, which is already in the tree.
func _host() -> Node:
	return Audio


func test_every_documented_id_has_a_sound() -> void:
	for id in ONE_SHOTS:
		assert_true(Audio.has_sound(id), "missing sound '%s'" % id)
		var len_s: float = Audio.sound_length(id)
		assert_gt(len_s, 0.02, "%s length" % id)
		assert_lt(len_s, 14.0, "%s length" % id)
	for id in ["sting_fire_out", "sting_gameover", "amb_bird", "amb_owl", "amb_twig", "amb_woodpecker"]:
		assert_true(Audio.has_sound(id), "missing internal sound '%s'" % id)


func test_variants_exist() -> void:
	var groups: Dictionary = {"chop": 3, "footstep_grass": 4, "footstep_dirt": 4, "swing": 3, "amb_bird": 6}
	for id in groups:
		var files: Array = Audio.call("_files_for", id)
		assert_eq(files.size(), int(groups[id]), "%s variants" % id)


func test_one_shots_load_and_do_not_loop() -> void:
	for id in ONE_SHOTS:
		for f in Audio.call("_files_for", id):
			var s: AudioStream = Audio.call("_stream_for_file", str(f))
			assert_true(s != null, "%s loads" % f)
			if s is AudioStreamOggVorbis:
				assert_false((s as AudioStreamOggVorbis).loop, "%s must not loop" % f)
			if s != null:
				assert_gt(s.get_length(), 0.02, "%s decoded length" % f)


func test_loops_and_music_loop_seamlessly() -> void:
	for id in LOOP_IDS:
		var s: AudioStream = Audio.call("_stream_for_file", id)
		assert_true(s is AudioStreamOggVorbis, "%s is ogg" % id)
		if s is AudioStreamOggVorbis:
			assert_true((s as AudioStreamOggVorbis).loop, "%s loops" % id)
			assert_gt(s.get_length(), 8.0, "%s length" % id)
	for f in MUSIC_FILES:
		var m: AudioStream = Audio.call("_stream_for_file", f)
		assert_true(m is AudioStreamOggVorbis, "%s is ogg" % f)
		if m is AudioStreamOggVorbis:
			assert_true((m as AudioStreamOggVorbis).loop, "%s loops" % f)
			# Shared grid: every layer is exactly 24 bars at 72 BPM (80 s).
			assert_near(m.get_length(), 80.0, 0.05, "%s length" % f)


func test_buses_exist_and_follow_settings() -> void:
	for b in ["Master", "Music", "SFX", "Ambience", "UI"]:
		assert_true(AudioServer.get_bus_index(b) >= 0, "bus %s" % b)
	var before: Variant = Settings.get_value("music_volume")
	Settings.set_value("music_volume", 0.5, false)
	var idx := AudioServer.get_bus_index("Music")
	assert_near(AudioServer.get_bus_volume_db(idx), linear_to_db(0.5), 0.05, "music bus volume")
	Settings.set_value("music_volume", 0.0, false)
	assert_true(AudioServer.is_bus_mute(idx), "music bus muted at 0")
	Settings.set_value("music_volume", before, false)
	assert_false(AudioServer.is_bus_mute(idx), "music bus unmuted")


func test_play_every_id_without_errors() -> void:
	var cam := Camera3D.new()
	_host().add_child(cam)
	cam.make_current()
	for id in ONE_SHOTS:
		Audio.play(id)
		Audio.play(id, Vector3(3, 0, 2), -6.0, 0.1)
	Audio.play_ui("ui_click")
	Audio.play("no_such_sound")
	Audio.play("no_such_sound", Vector3.ZERO)
	Audio.play_ui("no_such_sound")
	Audio.stinger("level_up")
	var dbg: Dictionary = Audio.debug_state()
	assert_true(dbg.has("mood") and dbg.has("voices3d"), "debug state")
	assert_gt(float(dbg["voices3d"]), 0.0, "positional voices playing")
	# Far beyond max_distance: culled, no voice used.
	Audio.play("click_empty", Vector3(5000, 0, 5000))
	_host().remove_child(cam)
	cam.free()


func test_loops_start_and_stop() -> void:
	var holder := Node3D.new()
	_host().add_child(holder)
	Audio.start_loop("campfire", holder)
	Audio.start_loop("campfire", holder)
	Audio.start_loop("rain", null)
	Audio.start_loop("not_a_loop", holder)
	var loops: Dictionary = Audio.get("_loops")
	var n_campfire := 0
	for k in loops:
		if str((loops[k] as Dictionary)["id"]) == "campfire":
			n_campfire += 1
	assert_eq(n_campfire, 1, "start_loop twice on one node keeps one loop")
	assert_true(loops.has("rain@global"), "global loop")
	Audio.set_loop_volume("campfire", holder, -3.0)
	Audio.stop_loop("campfire", holder)
	Audio.stop_loop("rain", null)
	Audio.stop_loop("stream", holder)
	_host().remove_child(holder)
	holder.free()


func test_music_moods() -> void:
	Audio.set_music_mood("title")
	assert_eq(Audio.call("_current_mood"), "title")
	Audio.set_music_mood("boss")
	Audio.set_music_mood("night")
	assert_eq(Audio.call("_current_mood"), "night")
	Audio.set_music_mood("danger")
	Audio.set_danger(0.8)
	Audio.set_near_fire(0.5)
	Audio.set_music_mood("not_a_mood")
	assert_eq(Audio.call("_current_mood"), "night", "unknown moods are ignored")
	Audio.set_music_mood("auto")
	Audio.set_music_mood("title")
	assert_eq(Audio.call("_current_mood"), "title")
