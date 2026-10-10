extends Node
## Audio director (autoload "Audio"): buses, pooled one-shots, positional and
## global loops, ambience beds, adaptive music, stingers and sound captions.
##
## Public API every system may call (keep these signatures):
##   play(sound_id, world_pos = null, volume_db = 0.0, pitch_jitter = 0.08)
##       One-shot sound. world_pos (Vector3) makes it positional; null = 2D.
##       Variants (chop_1..3, footstep_grass_1..4) are picked at random.
##       Unknown ids are ignored silently.
##   play_ui(sound_id)                       UI click/confirm/deny sounds (UI bus).
##   set_music_mood(mood)                    "title", "day", "dusk", "night",
##                                           "danger", "fire_out", "boss", "gameover"
##                                           ("" or "auto" = back to automatic)
##   set_danger(amount)                      0..1 threat level (nearby monsters)
##   set_near_fire(amount)                   0..1 how close/warm the player is to the fire
##   start_loop(loop_id, node, volume_db = 0.0) / stop_loop(loop_id, node)
##       Attach a looping positional sound to a Node3D (campfire, stream,
##       cooking). node = null starts a global (2D) loop (rain, wind).
## Extras: stinger(id), set_loop_volume(loop_id, node, volume_db),
## duck_ambience(seconds), has_sound(id), sound_length(id), debug_state().
##
## Everything the director drives by itself (see docs/ARCHITECTURE.md, Audio):
## day/night ambience beds, wind by biome, rain from the environment, the
## stream along WorldGen.stream, the campfire crackle (scaled by fire
## strength), random birds/owls/twigs, music moods from Events, danger from
## nearby "monster" nodes, stingers and captions, and a few feedback sounds
## for events no other system sounds (coins, crafting, modals, chests,
## taming, trading, death).

const AUDIO_DIR := "res://assets/audio/"
const MANIFEST_PATH := "res://assets/audio/manifest.json"
const BUSES: Array[String] = ["Music", "SFX", "Ambience", "UI"]
const POOL_3D := 24
const POOL_2D := 10
const POOL_UI := 4

## Per-id playback settings (all optional):
##   bus, vol (dB offset), unit (AudioStreamPlayer3D.unit_size), max (max_distance),
##   air (distance low-pass cutoff), pitch (jitter multiplier), gap (min seconds
##   between identical plays), prio (voice stealing), twod (always 2D).
const DEFAULT_CFG := {"bus": "SFX", "vol": 0.0, "unit": 6.0, "max": 50.0, "air": 6000.0,
	"pitch": 1.0, "gap": 0.035, "prio": 1}
const SOUNDS := {
	"chop": {"unit": 8.0, "max": 70.0, "prio": 2},
	"tree_fall": {"unit": 14.0, "max": 140.0, "prio": 3, "pitch": 0.5},
	"wood_pickup": {"unit": 4.0, "max": 30.0},
	"stone_pickup": {"unit": 4.0, "max": 30.0},
	"pickup": {"unit": 4.0, "max": 30.0},
	"coin": {"unit": 4.0, "max": 30.0, "gap": 0.2, "pitch": 0.4},
	"swing": {"unit": 5.0, "max": 30.0},
	"hit": {"unit": 7.0, "max": 50.0, "prio": 2},
	"hit_enemy": {"unit": 7.0, "max": 50.0, "prio": 2},
	"player_hurt": {"unit": 6.0, "max": 40.0, "prio": 3, "gap": 0.12},
	"eat": {"unit": 4.0, "max": 25.0},
	"fire_whoosh": {"unit": 7.0, "max": 50.0, "prio": 2},
	"fire_ignite": {"unit": 7.0, "max": 50.0, "prio": 2},
	"fire_out": {"unit": 8.0, "max": 60.0, "prio": 3},
	"footstep_grass": {"unit": 4.0, "max": 24.0, "prio": 0, "vol": 1.0},
	"footstep_dirt": {"unit": 4.0, "max": 24.0, "prio": 0, "vol": 1.0},
	"footstep_stone": {"unit": 4.0, "max": 24.0, "prio": 0, "vol": 1.0},
	"footstep_wood": {"unit": 4.0, "max": 24.0, "prio": 0, "vol": 1.0},
	"footstep_water": {"unit": 4.0, "max": 24.0, "prio": 0, "vol": 1.0},
	"chest_open": {"unit": 6.0, "max": 40.0, "prio": 2, "gap": 0.25, "pitch": 0.3},
	"craft": {"gap": 0.25, "pitch": 0.3, "twod": true},
	"upgrade": {"gap": 0.25, "pitch": 0.0, "twod": true, "prio": 3},
	"deny": {"gap": 0.15, "pitch": 0.3},
	"ui_click": {"bus": "UI", "gap": 0.03, "twod": true},
	"ui_hover": {"bus": "UI", "gap": 0.05, "twod": true, "vol": -2.0},
	"ui_open": {"bus": "UI", "gap": 0.25, "twod": true, "pitch": 0.3},
	"ui_close": {"bus": "UI", "gap": 0.25, "twod": true, "pitch": 0.3},
	"stalker_hiss": {"unit": 9.0, "max": 70.0, "prio": 3, "gap": 0.5},
	"stalker_attack": {"unit": 9.0, "max": 60.0, "prio": 4},
	"watcher_whisper": {"unit": 10.0, "max": 70.0, "prio": 3, "gap": 1.0},
	"wolf_growl": {"unit": 8.0, "max": 60.0, "prio": 3, "gap": 0.4},
	"wolf_howl": {"unit": 30.0, "max": 400.0, "prio": 3, "air": 3500.0, "gap": 1.0},
	"wolf_bark": {"unit": 12.0, "max": 120.0, "prio": 3},
	"bunny_squeak": {"unit": 4.0, "max": 25.0, "prio": 1},
	"boss_roar": {"unit": 40.0, "max": 500.0, "prio": 5, "pitch": 0.4, "air": 4000.0},
	"boss_sprint": {"unit": 20.0, "max": 200.0, "prio": 4},
	"boss_pant": {"unit": 10.0, "max": 70.0, "prio": 3, "gap": 0.8},
	"gunshot": {"unit": 25.0, "max": 300.0, "prio": 4},
	"rifle_shot": {"unit": 30.0, "max": 400.0, "prio": 4},
	"click_empty": {"unit": 3.0, "max": 20.0},
	"flashlight_on": {"unit": 3.0, "max": 20.0},
	"flashlight_off": {"unit": 3.0, "max": 20.0},
	"splash": {"unit": 8.0, "max": 60.0, "prio": 2},
	"thunder": {"twod": true, "bus": "Ambience", "prio": 5, "pitch": 0.6, "gap": 1.0},
	"night_sting": {"twod": true, "bus": "Music", "pitch": 0.0, "prio": 5, "gap": 2.0},
	"dawn_chime": {"twod": true, "bus": "Music", "pitch": 0.0, "prio": 5, "gap": 2.0},
	"level_up": {"twod": true, "bus": "Music", "pitch": 0.0, "prio": 5, "gap": 0.5},
	"sting_fire_out": {"twod": true, "bus": "Music", "pitch": 0.0, "prio": 5, "gap": 2.0},
	"sting_gameover": {"twod": true, "bus": "Music", "pitch": 0.0, "prio": 5, "gap": 2.0},
	"tame": {"gap": 0.3, "twod": true, "pitch": 0.0, "prio": 3},
	"trade": {"gap": 0.3, "twod": true, "pitch": 0.2, "prio": 3},
	"cook_sizzle": {"unit": 4.0, "max": 25.0},
	"death": {"twod": true, "gap": 1.0, "pitch": 0.0, "prio": 5},
	"amb_bird": {"bus": "Ambience", "unit": 12.0, "max": 90.0, "prio": 0, "air": 7000.0},
	"amb_owl": {"bus": "Ambience", "unit": 20.0, "max": 160.0, "prio": 0, "air": 3000.0},
	"amb_twig": {"bus": "Ambience", "unit": 8.0, "max": 50.0, "prio": 1},
	"amb_woodpecker": {"bus": "Ambience", "unit": 15.0, "max": 120.0, "prio": 0},
}
## Loop ids -> settings. Positional loops use unit/max; global ones are 2D.
const LOOPS := {
	"campfire": {"bus": "Ambience", "vol": -1.0, "unit": 4.5, "max": 55.0, "fade": 0.8},
	"stream": {"bus": "Ambience", "vol": -3.0, "unit": 7.0, "max": 70.0, "fade": 1.5},
	"cooking": {"bus": "SFX", "vol": -4.0, "unit": 3.0, "max": 25.0, "fade": 0.5},
	"rain": {"bus": "Ambience", "vol": -2.0, "fade": 3.0},
	"wind": {"bus": "Ambience", "vol": -4.0, "fade": 3.0},
	"amb_day": {"bus": "Ambience", "vol": 0.0, "fade": 3.0},
	"amb_night": {"bus": "Ambience", "vol": 0.0, "fade": 3.0},
}
## Music layers -> file. All main loops share 72 BPM / 80 s, so layers are
## started at the shared music clock and stay beat-aligned.
const MUSIC := {
	"title": "music_title", "day": "music_day", "dusk": "music_dusk",
	"night_warm": "music_night_warm", "night": "music_night", "danger": "music_danger",
	"fire_out": "music_fire_out", "boss": "music_boss",
}
const MOODS: Array[String] = ["title", "day", "dusk", "night", "danger", "fire_out", "boss", "gameover"]
## Captions for important sounds: id -> [near text, far text].
const CAPTIONS := {
	"wolf_howl": ["[wolf howling nearby]", "[wolf howling far away]"],
	"wolf_growl": ["[growling nearby]", "[growling]"],
	"wolf_bark": ["[wolf barking]", "[wolf barking far away]"],
	"boss_roar": ["[a huge roar!]", "[a huge roar in the distance]"],
	"boss_sprint": ["[heavy paws charging!]", "[heavy paws running]"],
	"stalker_hiss": ["[hissing in the dark]", "[faint hissing]"],
	"stalker_attack": ["[something lunges!]", "[something lunges!]"],
	"watcher_whisper": ["[eerie whispering]", "[faint whispering]"],
	"thunder": ["[thunder rumbles]", "[thunder rumbles]"],
	"amb_twig": ["[a twig snaps nearby]", "[a twig snaps]"],
}
## Events that the director answers with a feedback sound because no other
## system sounds them (documented in ARCHITECTURE.md -> Audio).
const AUTO_GAP := 0.25

var enabled := true
var music_mood := ""

var _manifest_groups: Dictionary = {}       # group id -> Array of file ids
var _streams: Dictionary = {}               # file id -> AudioStream
var _lengths: Dictionary = {}               # file id -> seconds
var _music_queue: Array[String] = []        # music files still to preload
var _music_preload_timer := 0.0

var _pool3d: Array[AudioStreamPlayer3D] = []
var _pool2d: Array[AudioStreamPlayer] = []
var _poolui: Array[AudioStreamPlayer] = []
var _last_play: Dictionary = {}             # id -> {"t": float, "pos": Vector3}
var _caption_times: Dictionary = {}

var _loops: Dictionary = {}                 # key -> loop state Dictionary
var _beds: Dictionary = {}                  # bed id -> {"player", "gain", "target"}
var _stream_follow: AudioStreamPlayer3D
var _stream_gain := 0.0
var _stream_on := false

var _music: Dictionary = {}                 # layer -> {"player", "gain", "target", "in", "out"}
var _music_clock := 0.0
var _mood_override := ""
var _boss_active := false
var _dead := false
var _gameover_sting_done := false
var _death_timer := -1.0
var _day_audible := 0.0
var _day_rest := 0.0
var _sting_duck := 1.0
var _sting_duck_until := -1.0

var _danger := 0.0
var _danger_auto := 0.0
var _danger_ext := 0.0
var _danger_ext_time := -100.0
var _danger_scan := 0.0
var _danger_was_high := false
var _near_fire := 0.0
var _near_fire_ext := 0.0
var _near_fire_ext_time := -100.0

var _amb_duck := 1.0
var _duck_until := -100.0
var _duck_cooldown_until := -100.0
var _amb_timer := 3.0
var _wind_biome := 0.35
var _biome_timer := 0.0
var _campfire_check := 0.0
var _muffle := 0.0
var _muffle_target := 0.0
var _rng := RandomNumberGenerator.new()
var _audio_started := false
var _last_tick := -1.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.randomize()
	_setup_buses()
	_load_manifest()
	_load_streams()
	_build_pools()
	_build_beds()
	apply_volumes()
	_apply_quality()
	Settings.changed.connect(_on_setting_changed)
	_connect_events()


## Release every playback and cached stream on quit (no leaks at exit).
func _exit_tree() -> void:
	enabled = false
	for c in get_children():
		if c is AudioStreamPlayer:
			(c as AudioStreamPlayer).stop()
			(c as AudioStreamPlayer).stream = null
		elif c is AudioStreamPlayer3D:
			(c as AudioStreamPlayer3D).stop()
			(c as AudioStreamPlayer3D).stream = null
	for key in _loops:
		var st: Dictionary = _loops[key]
		if is_instance_valid(st["player"]):
			var n := st["player"] as Node
			n.call("stop")
			n.set("stream", null)
	_loops.clear()
	_music.clear()
	_beds.clear()
	_streams.clear()
	# Stopped playbacks are retired by the mixer thread; give it a couple of
	# mix steps so nothing is still referenced when the AudioServer shuts down.
	if _audio_started:
		OS.delay_msec(120)


# =============================================================================
# Public API
# =============================================================================

## One-shot sound. world_pos: Vector3 (positional) or null (2D).
func play(sound_id: String, world_pos: Variant = null, volume_db: float = 0.0, pitch_jitter: float = 0.08) -> void:
	_play(sound_id, world_pos, volume_db, pitch_jitter, "", false)


## UI sounds: always 2D on the UI bus, tiny pitch variation.
func play_ui(sound_id: String) -> void:
	_play(sound_id, null, 0.0, 0.03, "UI", false)


## Musical stinger on the Music bus; briefly ducks the music under it.
func stinger(sound_id: String, volume_db: float = 0.0) -> void:
	if not has_sound(sound_id):
		return
	var p := _play(sound_id, null, volume_db, 0.0, "Music", false)
	if p != null:
		var len_s := minf(sound_length(sound_id), 5.0)
		_sting_duck_until = _now() + maxf(len_s * 0.6, 1.5)


func set_music_mood(mood: String) -> void:
	match mood:
		"danger":
			_danger_ext = 1.0
			_danger_ext_time = _now() + 6.0
		"title":
			_dead = false
			_boss_active = false
			_gameover_sting_done = false
			_muffle_target = 0.0
			_mood_override = "title"
		"gameover":
			_mood_override = "gameover"
			_play_gameover_sting()
		"boss":
			_boss_active = true
			if _mood_override not in ["title", "gameover"]:
				_mood_override = ""
		"", "auto":
			_mood_override = ""
		_:
			if mood in MOODS or mood == "silent":
				_mood_override = mood


func set_danger(amount: float) -> void:
	_danger_ext = clampf(amount, 0.0, 1.0)
	_danger_ext_time = _now() + 1.5


func set_near_fire(amount: float) -> void:
	_near_fire_ext = clampf(amount, 0.0, 1.0)
	_near_fire_ext_time = _now() + 1.0


## Attach a looping sound. node = a Node3D (positional) or null (global 2D).
func start_loop(loop_id: String, node: Node3D, volume_db: float = 0.0) -> void:
	if not enabled:
		return
	var key := _loop_key(loop_id, node)
	if _loops.has(key):
		var st: Dictionary = _loops[key]
		if is_instance_valid(st["player"]):
			st["target"] = 1.0
			st["stopping"] = false
			st["vol"] = volume_db + float((LOOPS.get(loop_id, {}) as Dictionary).get("vol", 0.0))
			return
		_loops.erase(key)
	var stream := _stream_for_file(loop_id)
	if stream == null:
		return
	var cfg: Dictionary = LOOPS.get(loop_id, {})
	var player: Node = null
	var bus := str(cfg.get("bus", "Ambience"))
	if node != null and is_instance_valid(node):
		var p3 := AudioStreamPlayer3D.new()
		p3.name = "Loop_" + loop_id
		p3.stream = stream
		p3.bus = bus
		p3.unit_size = float(cfg.get("unit", 6.0))
		p3.max_distance = float(cfg.get("max", 60.0))
		p3.max_db = 2.0
		p3.attenuation_filter_cutoff_hz = 5500.0
		p3.attenuation_filter_db = -18.0
		p3.volume_db = -80.0
		node.add_child(p3)
		player = p3
	else:
		var p2 := AudioStreamPlayer.new()
		p2.name = "Loop_" + loop_id
		p2.stream = stream
		p2.bus = bus
		p2.volume_db = -80.0
		add_child(p2)
		player = p2
	_loops[key] = {
		"player": player, "id": loop_id, "node_id": node.get_instance_id() if node != null else 0,
		"vol": volume_db + float(cfg.get("vol", 0.0)), "gain": 0.0, "target": 1.0, "mod": 1.0,
		"fade": float(cfg.get("fade", 1.0)), "stopping": false, "on": false,
	}
	(_loops[key] as Dictionary)["on"] = _start_player(player, _rng.randf() * maxf(stream.get_length() - 0.1, 0.0))


func stop_loop(loop_id: String, node: Node3D) -> void:
	var key := _loop_key(loop_id, node)
	if _loops.has(key):
		var st: Dictionary = _loops[key]
		st["target"] = 0.0
		st["stopping"] = true


func set_loop_volume(loop_id: String, node: Node3D, volume_db: float) -> void:
	var key := _loop_key(loop_id, node)
	if _loops.has(key):
		var st: Dictionary = _loops[key]
		st["vol"] = volume_db + float((LOOPS.get(loop_id, {}) as Dictionary).get("vol", 0.0))


## Hush the ambience beds (birds, crickets, wind) for a moment.
func duck_ambience(seconds: float) -> void:
	_duck_until = maxf(_duck_until, _now() + seconds)


func has_sound(sound_id: String) -> bool:
	return not _files_for(sound_id).is_empty()


## Length in seconds of a sound (first variant), 0 if unknown.
func sound_length(sound_id: String) -> float:
	var files := _files_for(sound_id)
	if files.is_empty():
		return 0.0
	return float(_lengths.get(files[0], 0.0))


## Ids of every loaded sound group (for tests/tools).
func sound_ids() -> Array:
	return _manifest_groups.keys()


func debug_state() -> Dictionary:
	var layers := {}
	for k in _music:
		var m: Dictionary = _music[k]
		layers[k] = snappedf(float(m["gain"]), 0.01)
	var beds := {}
	for k in _beds:
		beds[k] = snappedf(float((_beds[k] as Dictionary)["gain"]), 0.01)
	var active3d := 0
	for v in _pool3d:
		if _voice_busy(v):
			active3d += 1
	return {
		"mood": music_mood, "danger": snappedf(_danger, 0.01), "near_fire": snappedf(_near_fire, 0.01),
		"music": layers, "beds": beds, "loops": _loops.size(), "voices3d": active3d,
		"stream": snappedf(_stream_gain, 0.01), "duck": snappedf(_amb_duck, 0.01),
	}


func apply_volumes() -> void:
	_set_bus_linear("Master", float(Settings.get_value("master_volume")))
	_set_bus_linear("Music", float(Settings.get_value("music_volume")))
	_set_bus_linear("SFX", float(Settings.get_value("sfx_volume")))
	_set_bus_linear("UI", float(Settings.get_value("sfx_volume")))
	_set_bus_linear("Ambience", float(Settings.get_value("ambience_volume")))


# =============================================================================
# Setup
# =============================================================================

func _setup_buses() -> void:
	for bus_name in BUSES:
		if AudioServer.get_bus_index(bus_name) == -1:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")
	var master_idx := AudioServer.get_bus_index("Master")
	if not _bus_has_effect(master_idx, "AudioEffectHardLimiter"):
		var lim := AudioEffectHardLimiter.new()
		lim.ceiling_db = -0.5
		AudioServer.add_bus_effect(master_idx, lim)
	var sfx := AudioServer.get_bus_index("SFX")
	if not _bus_has_effect(sfx, "AudioEffectReverb"):
		var rv := AudioEffectReverb.new()
		rv.room_size = 0.55
		rv.damping = 0.7
		rv.spread = 0.8
		rv.hipass = 0.25
		rv.dry = 1.0
		rv.wet = 0.07
		rv.predelay_msec = 40.0
		AudioServer.add_bus_effect(sfx, rv)
	for bus_name in ["SFX", "Ambience"]:
		var idx := AudioServer.get_bus_index(bus_name)
		if not _bus_has_effect(idx, "AudioEffectLowPassFilter"):
			var lpf := AudioEffectLowPassFilter.new()
			lpf.cutoff_hz = 20000.0
			lpf.resonance = 0.4
			AudioServer.add_bus_effect(idx, lpf)
			AudioServer.set_bus_effect_enabled(idx, AudioServer.get_bus_effect_count(idx) - 1, false)


func _bus_has_effect(bus_idx: int, cls: String) -> bool:
	for i in AudioServer.get_bus_effect_count(bus_idx):
		var e := AudioServer.get_bus_effect(bus_idx, i)
		if e != null and e.get_class() == cls:
			return true
	return false


func _load_manifest() -> void:
	_manifest_groups.clear()
	if FileAccess.file_exists(MANIFEST_PATH):
		var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
		if data is Dictionary:
			var groups: Variant = (data as Dictionary).get("groups", {})
			var assets: Variant = (data as Dictionary).get("assets", {})
			if groups is Dictionary:
				for g in groups:
					var arr: Array = []
					for f in (groups as Dictionary)[g]:
						arr.append(str(f))
					_manifest_groups[str(g)] = arr
			if assets is Dictionary:
				for f in assets:
					var a: Variant = (assets as Dictionary)[f]
					if a is Dictionary:
						_lengths[str(f)] = float((a as Dictionary).get("seconds", 0.0))
	if _manifest_groups.is_empty():
		# Fallback (e.g. an export without the JSON): probe known ids.
		var ids: Array = SOUNDS.keys() + LOOPS.keys() + MUSIC.values()
		for id in ids:
			var files := _probe_files(str(id))
			if not files.is_empty():
				_manifest_groups[str(id)] = files


func _probe_files(id: String) -> Array:
	if ResourceLoader.exists(AUDIO_DIR + id + ".ogg"):
		return [id]
	var out: Array = []
	for i in range(1, 9):
		var f := "%s_%d" % [id, i]
		if not ResourceLoader.exists(AUDIO_DIR + f + ".ogg"):
			break
		out.append(f)
	return out


func _load_streams() -> void:
	var music_files: Array = MUSIC.values()
	for g in _manifest_groups:
		for f in _manifest_groups[g]:
			var fid := str(f)
			if fid in music_files:
				if fid == "music_title":
					_stream_for_file(fid)
				else:
					_music_queue.append(fid)
				continue
			_stream_for_file(fid)


## Load (and cache) one file. Loops and music get loop = true.
func _stream_for_file(fid: String) -> AudioStream:
	if _streams.has(fid):
		return _streams[fid]
	var path := AUDIO_DIR + fid + ".ogg"
	if not ResourceLoader.exists(path):
		_streams[fid] = null
		return null
	var s := load(path) as AudioStream
	if s == null:
		_streams[fid] = null
		return null
	if fid in LOOPS or fid in MUSIC.values():
		if s is AudioStreamOggVorbis:
			(s as AudioStreamOggVorbis).loop = true
		elif s is AudioStreamWAV:
			(s as AudioStreamWAV).loop_mode = AudioStreamWAV.LOOP_FORWARD
	_streams[fid] = s
	if not _lengths.has(fid):
		_lengths[fid] = s.get_length()
	return s


func _files_for(id: String) -> Array:
	if _manifest_groups.has(id):
		return _manifest_groups[id]
	return []


func _pick_stream(id: String) -> AudioStream:
	var files := _files_for(id)
	if files.is_empty():
		return null
	var fid := str(files[_rng.randi() % files.size()]) if files.size() > 1 else str(files[0])
	# Avoid repeating the same variant twice in a row.
	if files.size() > 2 and _last_play.has(id) and str((_last_play[id] as Dictionary).get("file", "")) == fid:
		fid = str(files[(files.find(fid) + 1 + _rng.randi() % (files.size() - 1)) % files.size()])
	var s := _stream_for_file(fid)
	if s != null and _last_play.has(id):
		(_last_play[id] as Dictionary)["file"] = fid
	elif s != null:
		_last_play[id] = {"t": -100.0, "pos": Vector3.INF, "file": fid}
	return s


func _build_pools() -> void:
	for i in POOL_3D:
		var v := AudioStreamPlayer3D.new()
		v.name = "Voice3D_%d" % i
		v.bus = "SFX"
		v.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
		add_child(v)
		_pool3d.append(v)
	for i in POOL_2D:
		var p := AudioStreamPlayer.new()
		p.name = "Voice2D_%d" % i
		p.bus = "SFX"
		add_child(p)
		_pool2d.append(p)
	for i in POOL_UI:
		var u := AudioStreamPlayer.new()
		u.name = "VoiceUI_%d" % i
		u.bus = "UI"
		add_child(u)
		_poolui.append(u)
	_stream_follow = AudioStreamPlayer3D.new()
	_stream_follow.name = "StreamFollower"
	add_child(_stream_follow)


func _build_beds() -> void:
	for id in ["amb_day", "amb_night", "wind", "rain", "campfire_title"]:
		var file: String = "campfire" if id == "campfire_title" else str(id)
		var s := _stream_for_file(file)
		var p := AudioStreamPlayer.new()
		p.name = "Bed_" + id
		p.stream = s
		p.bus = "Ambience"
		p.volume_db = -80.0
		add_child(p)
		_beds[id] = {"player": p, "gain": 0.0, "on": false, "vol": float((LOOPS.get(file, {}) as Dictionary).get("vol", 0.0))}
	var st := _stream_for_file("stream")
	_stream_follow.stream = st
	_stream_follow.bus = "Ambience"
	_stream_follow.unit_size = 7.0
	_stream_follow.max_distance = 75.0
	_stream_follow.attenuation_filter_cutoff_hz = 5000.0
	_stream_follow.volume_db = -80.0


func _apply_quality() -> void:
	var sfx := AudioServer.get_bus_index("SFX")
	for i in AudioServer.get_bus_effect_count(sfx):
		if AudioServer.get_bus_effect(sfx, i) is AudioEffectReverb:
			AudioServer.set_bus_effect_enabled(sfx, i, Settings.quality() != "low")


func _connect_events() -> void:
	Events.run_started.connect(_on_run_started)
	Events.phase_changed.connect(_on_phase_changed)
	Events.fire_state_changed.connect(_on_fire_state_changed)
	Events.fire_extinguished.connect(_on_fire_extinguished)
	Events.fire_relit.connect(_on_fire_relit)
	Events.fire_level_changed.connect(_on_progress_level)
	Events.tent_upgraded.connect(_on_progress_level)
	Events.boss_spawned.connect(_on_boss_spawned)
	Events.boss_defeated.connect(_on_boss_defeated)
	Events.boss_retreated.connect(_on_boss_retreated)
	Events.player_died.connect(_on_player_died)
	Events.game_paused.connect(_on_game_paused)
	# Feedback for events no other system sounds (see ARCHITECTURE.md).
	Events.coins_changed.connect(_on_coins_changed)
	Events.item_crafted.connect(func(_id: String, _n: int) -> void: _auto("craft"))
	Events.ui_modal_opened.connect(func(_m: String) -> void: _auto("ui_open", null, "UI"))
	Events.ui_modal_closed.connect(func(_m: String) -> void: _auto("ui_close", null, "UI"))
	Events.chest_opened.connect(func(_tier: String, pos: Vector3) -> void: _auto("chest_open", pos))
	Events.pet_tamed.connect(func(_n: String) -> void: _auto("tame"))
	Events.trade_completed.connect(func(_t: String) -> void: _auto("trade"))


# =============================================================================
# One-shots
# =============================================================================

func _now() -> float:
	return float(Time.get_ticks_msec()) * 0.001


func _cfg(id: String) -> Dictionary:
	var base := id
	if not SOUNDS.has(base):
		for k in SOUNDS:
			if id.begins_with(str(k)):
				base = str(k)
				break
	var c: Dictionary = DEFAULT_CFG.duplicate()
	if SOUNDS.has(base):
		c.merge(SOUNDS[base] as Dictionary, true)
	return c


func _as_position(v: Variant) -> Vector3:
	if v is Vector3:
		return v
	if v is Node3D and is_instance_valid(v as Node3D) and (v as Node3D).is_inside_tree():
		return (v as Node3D).global_position
	return Vector3.INF


func listener_position() -> Vector3:
	var vp := get_viewport()
	if vp == null:
		return Vector3.INF
	var cam := vp.get_camera_3d()
	if cam == null or not cam.is_inside_tree():
		return Vector3.INF
	return cam.global_position


func _is_duplicate(id: String, pos: Vector3, now: float, gap: float) -> bool:
	if not _last_play.has(id):
		return false
	var lp: Dictionary = _last_play[id]
	if now - float(lp.get("t", -100.0)) >= gap:
		return false
	var p: Vector3 = lp.get("pos", Vector3.INF)
	if pos == Vector3.INF or p == Vector3.INF:
		return true
	return p.distance_to(pos) < 2.0


func _play(id: String, world_pos: Variant, volume_db: float, pitch_jitter: float, bus_override: String, auto: bool) -> Node:
	if not enabled or id == "":
		return null
	if not has_sound(id):
		return null
	var cfg := _cfg(id)
	var now := _now()
	var pos := _as_position(world_pos)
	var gap := AUTO_GAP if auto else float(cfg.get("gap", 0.035))
	if _is_duplicate(id, pos, now, gap):
		return null
	var twod := bool(cfg.get("twod", false))
	var max_d := float(cfg.get("max", 50.0))
	var lpos := listener_position()
	var dist := -1.0
	if pos != Vector3.INF and not twod:
		if lpos != Vector3.INF:
			dist = lpos.distance_to(pos)
			if dist > max_d:
				return null
		elif not get_tree().root.get_camera_3d():
			# No 3D listener (menus): play as 2D so feedback is still heard.
			pos = Vector3.INF
	var stream := _pick_stream(id)
	if stream == null:
		return null
	var pitch := maxf(1.0 + _rng.randf_range(-pitch_jitter, pitch_jitter) * float(cfg.get("pitch", 1.0)), 0.3)
	var vol := volume_db + float(cfg.get("vol", 0.0)) + (_rng.randf_range(-1.0, 1.0) if pitch_jitter > 0.0 else 0.0)
	var bus := bus_override if bus_override != "" else str(cfg.get("bus", "SFX"))
	var prio := int(cfg.get("prio", 1))
	var node: Node = null
	if pos != Vector3.INF and not twod:
		var v := _grab_3d(prio)
		if v == null:
			return null
		v.stream = stream
		v.bus = bus
		v.volume_db = vol
		v.pitch_scale = pitch
		v.unit_size = float(cfg.get("unit", 6.0))
		v.max_distance = max_d
		v.max_db = 3.0
		v.attenuation_filter_cutoff_hz = float(cfg.get("air", 6000.0))
		v.attenuation_filter_db = -20.0
		v.panning_strength = 1.0
		v.global_position = pos
		_mark_voice(v, prio, now, stream.get_length() / pitch)
		_audio_started = true
		v.play()
		node = v
	else:
		var p := _grab_2d(prio, bus == "UI")
		if p == null:
			return null
		p.stream = stream
		p.bus = bus
		p.volume_db = vol
		p.pitch_scale = pitch
		_mark_voice(p, prio, now, stream.get_length() / pitch)
		_audio_started = true
		p.play()
		node = p
	var lp: Dictionary = _last_play.get(id, {})
	lp["t"] = now
	lp["pos"] = pos
	_last_play[id] = lp
	_caption_for(id, dist)
	return node


func _auto(id: String, world_pos: Variant = null, bus: String = "") -> void:
	if GameState.state == GameState.RunState.LOADING:
		return
	_play(id, world_pos, 0.0, 0.05, bus, true)


func _mark_voice(v: Node, prio: int, now: float, seconds: float) -> void:
	v.set_meta("prio", prio)
	v.set_meta("t", now)
	v.set_meta("until", now + seconds + 0.05)


func _voice_busy(v: Node) -> bool:
	return _now() < float(v.get_meta("until", 0.0))


func _grab_3d(prio: int) -> AudioStreamPlayer3D:
	var cap := POOL_3D if Settings.quality() != "low" else 16
	var best: AudioStreamPlayer3D = null
	var best_score := INF
	for i in mini(cap, _pool3d.size()):
		var v := _pool3d[i]
		if not _voice_busy(v):
			return v
		var vp := int(v.get_meta("prio", 1))
		var score := float(vp) * 1000.0 + float(v.get_meta("t", 0.0))
		if vp <= prio and score < best_score:
			best_score = score
			best = v
	if best != null:
		best.stop()
	return best


func _grab_2d(prio: int, ui: bool) -> AudioStreamPlayer:
	var pool: Array[AudioStreamPlayer] = _poolui if ui else _pool2d
	var best: AudioStreamPlayer = null
	var best_score := INF
	for p in pool:
		if not _voice_busy(p):
			return p
		var pp := int(p.get_meta("prio", 1))
		var score := float(pp) * 1000.0 + float(p.get_meta("t", 0.0))
		if pp <= prio and score < best_score:
			best_score = score
			best = p
	if best != null:
		best.stop()
	return best


func _caption_for(id: String, dist: float) -> void:
	var base := id
	if not CAPTIONS.has(base):
		return
	var texts: Array = CAPTIONS[base]
	var far := dist > 40.0
	caption(str(texts[1] if far else texts[0]))


## Emit a sound caption (only when the "sound_captions" setting is on).
func caption(text: String) -> void:
	if text == "" or not bool(Settings.get_value("sound_captions")):
		return
	var now := _now()
	if now - float(_caption_times.get(text, -100.0)) < 4.0:
		return
	_caption_times[text] = now
	Events.caption.emit(text)


# =============================================================================
# Frame update
# =============================================================================

func _process(_delta: float) -> void:
	if not enabled:
		return
	# Real time, not scaled by Engine.time_scale (slow-motion death) or pause:
	# the music clock must follow the audio, which never slows down.
	var now := _now()
	var delta := clampf(now - _last_tick, 0.0, 0.1) if _last_tick > 0.0 else 0.016
	_last_tick = now
	_update_danger(delta)
	_update_near_fire(delta)
	_update_music(delta)
	_update_beds(delta)
	_update_loops(delta)
	_update_stream_follower(delta)
	_update_ambient_oneshots(delta)
	_update_muffle(delta)
	_preload_music(delta)
	if _death_timer > 0.0:
		_death_timer -= delta
		if _death_timer <= 0.0:
			_play_gameover_sting()


func _player_pos() -> Vector3:
	var p := GameState.player
	if p != null and is_instance_valid(p) and p.is_inside_tree():
		return p.global_position
	return listener_position()


func _in_world() -> bool:
	return GameState.game != null and is_instance_valid(GameState.game) and GameState.state in [GameState.RunState.PLAYING, GameState.RunState.DEAD]


func _update_danger(delta: float) -> void:
	_danger_scan -= delta
	if _danger_scan <= 0.0:
		_danger_scan = 0.2
		_danger_auto = 0.0
		if GameState.is_playing():
			var pp := _player_pos()
			if pp != Vector3.INF:
				var best := 0.0
				var count := 0
				for m in get_tree().get_nodes_in_group("monster"):
					if not (m is Node3D) or not is_instance_valid(m):
						continue
					if m.has_method("is_alive") and not bool(m.call("is_alive")):
						continue
					var d := (m as Node3D).global_position.distance_to(pp)
					var w := clampf(1.0 - (d - 6.0) / 34.0, 0.0, 1.0)
					if w > 0.0:
						count += 1
						best = maxf(best, w)
				_danger_auto = clampf(best + 0.12 * float(maxi(count - 1, 0)), 0.0, 1.0)
	var ext := _danger_ext if _now() < _danger_ext_time else 0.0
	var target := maxf(_danger_auto, ext)
	if not GameState.is_playing():
		target = 0.0
	var rate := 1.0 / 1.2 if target > _danger else 1.0 / 4.0
	_danger = move_toward(_danger, target, rate * delta)
	# Monster close at night: caption + a sudden, unsettling silence.
	var night := GameState.day_cycle.darkness() > 0.5
	var high := _danger > 0.45
	if high and not _danger_was_high and night and GameState.is_playing():
		caption("[something is moving in the trees]")
		var now := _now()
		if now > _duck_cooldown_until:
			_duck_until = now + 3.5
			_duck_cooldown_until = now + 40.0
	_danger_was_high = high


func _update_near_fire(delta: float) -> void:
	var target := 0.0
	if _now() < _near_fire_ext_time:
		target = _near_fire_ext
	elif GameState.is_playing():
		var cf := GameState.campfire
		var pp := _player_pos()
		if cf != null and is_instance_valid(cf) and pp != Vector3.INF and GameState.fire.is_lit():
			var light := 0.0
			if cf.has_method("light_intensity_at"):
				light = float(cf.call("light_intensity_at", pp))
			var heat := 0.0
			if cf.has_method("heat_at"):
				heat = float(cf.call("heat_at", pp))
			target = clampf(maxf(smoothstep(0.3, 0.75, light), heat * 1.3), 0.0, 1.0)
			if GameState.fire.state() == FireModel.State.LOW:
				target *= 0.6
	_near_fire = move_toward(_near_fire, target, delta / 2.5)


# --- music -----------------------------------------------------------------------

func _current_mood() -> String:
	if _mood_override != "":
		return _mood_override
	if _dead:
		return "gameover"
	if not GameState.is_playing():
		return music_mood if music_mood != "" else "title"
	if _boss_active:
		return "boss"
	var dc := GameState.day_cycle
	if not GameState.fire.is_lit() and dc.darkness() > 0.35:
		return "fire_out"
	match dc.phase:
		DayCycle.Phase.DUSK:
			return "dusk"
		DayCycle.Phase.NIGHT:
			return "night"
	return "day"


func _update_music(delta: float) -> void:
	_music_clock = _now()  # absolute real time: every layer seeks to the same grid
	var mood := _current_mood()
	if mood != music_mood:
		music_mood = mood
	var targets := {}
	var fade_in := 3.0
	var fade_out := 3.0
	match mood:
		"title":
			targets["title"] = 1.0
			fade_in = 2.0
		"day":
			targets["day"] = _day_layer_gain(delta)
			fade_in = 5.0
			fade_out = 5.0
		"dusk":
			targets["dusk"] = 1.0
			fade_in = 4.0
		"night":
			var warm := _near_fire
			targets["night_warm"] = warm
			targets["night"] = 1.0 - 0.75 * warm
			fade_in = 3.0
		"fire_out":
			targets["fire_out"] = 1.0
			fade_in = 1.0
			fade_out = 2.0
		"boss":
			targets["boss"] = 1.0
			fade_in = 1.0
			fade_out = 3.0
		_:
			fade_out = 1.5
	if mood in ["day", "dusk", "night", "fire_out"]:
		targets["danger"] = pow(_danger, 1.2)
	if _sting_duck_until > _now():
		_sting_duck = move_toward(_sting_duck, 0.45, delta / 0.4)
	else:
		_sting_duck = move_toward(_sting_duck, 1.0, delta / 2.0)
	var all_layers: Array = MUSIC.keys()
	for layer in all_layers:
		var target := float(targets.get(layer, 0.0))
		if target <= 0.0 and not _music.has(layer):
			continue
		var st := _music_layer(str(layer))
		if st.is_empty():
			continue
		var cur := float(st["gain"])
		var tin := 1.5 if layer == "danger" else fade_in
		var tout := 4.0 if layer == "danger" else fade_out
		cur = move_toward(cur, target, delta / (tin if target > cur else tout))
		st["gain"] = cur
		var p := st["player"] as AudioStreamPlayer
		if cur <= 0.001 and target <= 0.0:
			if bool(st["on"]):
				p.stop()
				st["on"] = false
			continue
		if not bool(st["on"]):
			st["on"] = true
			var length := maxf(p.stream.get_length(), 1.0)
			_audio_started = true
			p.play(fposmod(_music_clock, length))
		p.volume_db = linear_to_db(maxf(sqrt(cur) * _sting_duck, 0.0001))


func _music_layer(layer: String) -> Dictionary:
	if _music.has(layer):
		return _music[layer]
	var s := _stream_for_file(str(MUSIC.get(layer, "")))
	if s == null:
		return {}
	var p := AudioStreamPlayer.new()
	p.name = "Music_" + layer
	p.stream = s
	p.bus = "Music"
	p.volume_db = -80.0
	add_child(p)
	var st := {"player": p, "gain": 0.0, "on": false}
	_music[layer] = st
	return st


## Day music plays one full pass, then rests for a while (ambience only).
func _day_layer_gain(delta: float) -> float:
	if _day_rest > 0.0:
		_day_rest -= delta
		return 0.0
	_day_audible += delta
	if _day_audible > 82.0:
		_day_audible = 0.0
		_day_rest = _rng.randf_range(30.0, 50.0)
	return 1.0


func _play_gameover_sting() -> void:
	_death_timer = -1.0
	if _gameover_sting_done:
		return
	_gameover_sting_done = true
	stinger("sting_gameover")


func _preload_music(delta: float) -> void:
	if _music_queue.is_empty():
		return
	_music_preload_timer -= delta
	if _music_preload_timer > 0.0:
		return
	_music_preload_timer = 0.4
	_stream_for_file(_music_queue.pop_front())


# --- ambience -----------------------------------------------------------------------

func _update_beds(delta: float) -> void:
	var now := _now()
	var duck_target := 0.03 if now < _duck_until else 1.0
	_amb_duck = move_toward(_amb_duck, duck_target, delta / (0.5 if duck_target < _amb_duck else 3.0))
	var day := 0.0
	var night := 0.0
	var wind := 0.0
	var rain := 0.0
	var title_fire := 0.0
	if _in_world():
		var dark := GameState.day_cycle.darkness()
		var raining := _is_raining()
		_biome_timer -= delta
		if _biome_timer <= 0.0:
			_biome_timer = 0.5
			_wind_biome = _wind_for_biome()
		day = (1.0 - dark) * (0.35 if raining else 1.0)
		night = pow(dark, 0.8) * (0.5 if raining else 1.0)
		wind = clampf(_wind_biome + (0.25 if raining else 0.0) + 0.08 * dark, 0.0, 1.0)
		rain = 1.0 if raining else 0.0
		day *= _amb_duck
		night *= _amb_duck
		wind *= 0.35 + 0.65 * _amb_duck
	elif music_mood == "title":
		night = 0.35
		title_fire = 0.3
	_set_bed("amb_day", day, delta)
	_set_bed("amb_night", night, delta)
	_set_bed("wind", wind, delta)
	_set_bed("rain", rain, delta)
	_set_bed("campfire_title", title_fire, delta)


func _set_bed(id: String, target: float, delta: float) -> void:
	if not _beds.has(id):
		return
	var b: Dictionary = _beds[id]
	var p := b["player"] as AudioStreamPlayer
	if p.stream == null:
		return
	var g := move_toward(float(b["gain"]), target, delta / 3.0)
	b["gain"] = g
	if g <= 0.001 and target <= 0.0:
		if bool(b["on"]):
			p.stop()
			b["on"] = false
		return
	if not bool(b["on"]):
		b["on"] = _start_player(p, _rng.randf() * maxf(p.stream.get_length() - 0.1, 0.0))
	p.volume_db = float(b["vol"]) + linear_to_db(maxf(sqrt(g), 0.0001))


func _is_raining() -> bool:
	var env := GameState.environment
	if env == null or not is_instance_valid(env):
		return false
	var r: Variant = env.get("raining")
	return r is bool and bool(r)


func _wind_for_biome() -> float:
	var gen := GameState.world_gen
	var pp := _player_pos()
	if gen == null or pp == Vector3.INF:
		return 0.35
	match gen.biome_at(pp.x, pp.z):
		"ridge":
			return 1.0
		"shore", "water":
			return 0.65
		"meadow":
			return 0.55
		"camp":
			return 0.32
	return 0.28


func _update_loops(delta: float) -> void:
	_campfire_check -= delta
	if _campfire_check <= 0.0:
		_campfire_check = 0.5
		_ensure_campfire_loop()
	var dead_keys: Array = []
	for key in _loops:
		var st: Dictionary = _loops[key]
		if not is_instance_valid(st["player"]):
			dead_keys.append(key)
			continue
		var player: Variant = st["player"]
		var mod := 1.0
		if str(st["id"]) == "campfire":
			mod = _campfire_mod()
		var target := float(st["target"]) * mod
		var g := move_toward(float(st["gain"]), target, delta / maxf(float(st["fade"]), 0.05))
		st["gain"] = g
		var node := player as Node
		if g <= 0.001 and target <= 0.0:
			if bool(st["stopping"]):
				node.queue_free()
				dead_keys.append(key)
			elif bool(st["on"]):
				node.call("stop")
				st["on"] = false
			continue
		if not bool(st["on"]):
			var s := node.get("stream") as AudioStream
			st["on"] = _start_player(node, _rng.randf() * maxf(s.get_length() - 0.1, 0.0) if s != null else 0.0)
		node.set("volume_db", float(st["vol"]) + linear_to_db(maxf(sqrt(g), 0.0001)))
	for k in dead_keys:
		_loops.erase(k)


func _ensure_campfire_loop() -> void:
	var cf := GameState.campfire
	if cf == null or not is_instance_valid(cf) or not cf.is_inside_tree():
		return
	for key in _loops:
		if str((_loops[key] as Dictionary)["id"]) == "campfire":
			return
	start_loop("campfire", cf)


func _campfire_mod() -> float:
	if not GameState.fire.is_lit():
		return 0.0
	return 0.45 + 0.55 * GameState.fire.strength()


func _update_stream_follower(delta: float) -> void:
	var target := 0.0
	var gen := GameState.world_gen
	var lp := listener_position()
	if _in_world() and gen != null and lp != Vector3.INF and gen.stream.size() >= 2 and not _has_explicit_loop("stream"):
		var p := Vector2(lp.x, lp.z)
		var best := Vector2.ZERO
		var best_d := INF
		for i in gen.stream.size() - 1:
			var c := Geometry2D.get_closest_point_to_segment(p, gen.stream[i], gen.stream[i + 1])
			var d := c.distance_to(p)
			if d < best_d:
				best_d = d
				best = c
		if best_d < 80.0:
			target = 1.0
			_stream_follow.global_position = Vector3(best.x, gen.height_at(best.x, best.y) + 0.4, best.y)
	_stream_gain = move_toward(_stream_gain, target, delta / 1.5)
	if _stream_follow.stream == null:
		return
	if _stream_gain <= 0.001 and target <= 0.0:
		if _stream_on:
			_stream_follow.stop()
			_stream_on = false
		return
	if not _stream_on:
		_stream_on = _start_player(_stream_follow, _rng.randf() * 10.0)
	_stream_follow.volume_db = -3.0 + linear_to_db(maxf(sqrt(_stream_gain), 0.0001))


func _has_explicit_loop(id: String) -> bool:
	for key in _loops:
		if str((_loops[key] as Dictionary)["id"]) == id:
			return true
	return false


## Random birds by day; owls, twigs and far-off howls by night.
func _update_ambient_oneshots(delta: float) -> void:
	if not GameState.is_playing():
		return
	_amb_timer -= delta
	if _amb_timer > 0.0:
		return
	var lp := listener_position()
	if lp == Vector3.INF:
		_amb_timer = 2.0
		return
	var dark := GameState.day_cycle.darkness()
	var raining := _is_raining()
	if _amb_duck < 0.5:
		_amb_timer = 1.0
		return
	if dark < 0.5:
		if raining and _rng.randf() < 0.7:
			_amb_timer = _rng.randf_range(6.0, 12.0)
			return
		var id := "amb_woodpecker" if _rng.randf() < 0.08 else "amb_bird"
		_play(id, _around(lp, 14.0, 40.0, _rng.randf_range(5.0, 12.0)), -3.0, 0.1, "", false)
		_amb_timer = _rng.randf_range(2.5, 7.5) * (1.0 + dark * 2.0)
	else:
		var roll := _rng.randf()
		if _danger > 0.25 and roll < 0.5:
			_play("amb_twig", _around(lp, 9.0, 18.0, 0.2), -2.0, 0.1, "", false)
		elif roll < 0.85:
			_play("amb_owl", _around(lp, 35.0, 80.0, 10.0), -2.0, 0.05, "", false)
		else:
			_play("wolf_howl", _around(lp, 120.0, 220.0, 5.0), -6.0, 0.06, "", false)
		_amb_timer = _rng.randf_range(14.0, 32.0)


func _around(center: Vector3, rmin: float, rmax: float, up: float) -> Vector3:
	var a := _rng.randf() * TAU
	var r := _rng.randf_range(rmin, rmax)
	var x := center.x + cos(a) * r
	var z := center.z + sin(a) * r
	var y := center.y
	var gen := GameState.world_gen
	if gen != null:
		y = gen.height_at(x, z)
	return Vector3(x, y + up, z)


## Start a looping player; false if it cannot play yet (not in the tree).
func _start_player(node: Node, from: float) -> bool:
	if node == null or not node.is_inside_tree():
		return false
	_audio_started = true
	if node is AudioStreamPlayer:
		(node as AudioStreamPlayer).play(from)
		return true
	if node is AudioStreamPlayer3D:
		(node as AudioStreamPlayer3D).play(from)
		return true
	return false


func _update_muffle(delta: float) -> void:
	_muffle = move_toward(_muffle, _muffle_target, delta / 0.6)
	for bus_name in ["SFX", "Ambience"]:
		var idx := AudioServer.get_bus_index(bus_name)
		if idx < 0:
			continue
		for i in AudioServer.get_bus_effect_count(idx):
			var e := AudioServer.get_bus_effect(idx, i)
			if e is AudioEffectLowPassFilter:
				var on := _muffle > 0.01
				if AudioServer.is_bus_effect_enabled(idx, i) != on:
					AudioServer.set_bus_effect_enabled(idx, i, on)
				if on:
					(e as AudioEffectLowPassFilter).cutoff_hz = lerpf(20000.0, 700.0, pow(_muffle, 0.5))


# =============================================================================
# Events
# =============================================================================

func _on_setting_changed(key: String) -> void:
	if key.ends_with("_volume"):
		apply_volumes()
	elif key == "quality":
		_apply_quality()


func _set_bus_linear(bus_name: String, lin: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	lin = clampf(lin, 0.0, 1.0)
	AudioServer.set_bus_mute(idx, lin <= 0.001)
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(lin, 0.001)))


func _on_run_started(_seed: int) -> void:
	_mood_override = ""
	_boss_active = false
	_dead = false
	_gameover_sting_done = false
	_death_timer = -1.0
	_day_audible = 0.0
	_day_rest = 0.0
	_danger = 0.0
	_danger_ext = 0.0
	_amb_duck = 1.0
	_duck_until = -100.0
	_amb_timer = 4.0
	_muffle_target = 0.0
	_last_play.clear()


func _on_phase_changed(phase: int) -> void:
	if _mood_override not in ["title", "gameover"]:
		_mood_override = ""
	if not GameState.is_playing():
		return
	match phase:
		DayCycle.Phase.NIGHT:
			stinger("night_sting")
		DayCycle.Phase.DAWN:
			stinger("dawn_chime")
			_day_rest = 8.0
			_day_audible = 0.0


func _on_fire_state_changed(state: int) -> void:
	if not GameState.is_playing():
		return
	if state == FireModel.State.LOW:
		caption("[the fire is crackling weakly]")


func _on_fire_extinguished() -> void:
	if _mood_override not in ["title", "gameover"]:
		_mood_override = ""
	if not GameState.is_playing():
		return
	stinger("sting_fire_out")
	caption("[the fire hisses out]")


func _on_fire_relit() -> void:
	if _mood_override not in ["title", "gameover"]:
		_mood_override = ""


func _on_progress_level(_level: int) -> void:
	if GameState.is_playing():
		stinger("level_up")


func _on_boss_spawned() -> void:
	_boss_active = true


func _on_boss_defeated() -> void:
	_boss_active = false
	if GameState.is_playing():
		stinger("level_up")


func _on_boss_retreated() -> void:
	_boss_active = false


func _on_player_died(_cause: String) -> void:
	_dead = true
	_boss_active = false
	_muffle_target = 0.6
	_play("death", null, 0.0, 0.0, "", true)
	_death_timer = 2.4


func _on_game_paused(paused: bool) -> void:
	if not _dead:
		_muffle_target = 1.0 if paused else 0.0


func _on_coins_changed(_total: int, delta: int) -> void:
	if delta > 0 and GameState.is_playing():
		_auto("coin")


func _loop_key(loop_id: String, node: Node3D) -> String:
	if node == null or not is_instance_valid(node):
		return loop_id + "@global"
	return "%s@%d" % [loop_id, node.get_instance_id()]
