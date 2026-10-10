extends Node
## Audio director (STUB — replaced by the audio system build).
##
## Public API every system may call (keep these signatures):
##   play(sound_id, world_pos = null, volume_db = 0.0, pitch_jitter = 0.08)
##       One-shot sound. world_pos (Vector3) makes it positional; null = 2D.
##   play_ui(sound_id)                       UI click/confirm/deny sounds.
##   set_music_mood(mood)                    "title", "day", "dusk", "night",
##                                           "danger", "fire_out", "boss", "gameover"
##   set_danger(amount)                      0..1 threat level (nearby monsters)
##   set_near_fire(amount)                   0..1 how close/warm the player is to the fire
##   start_loop(loop_id, node) / stop_loop(loop_id, node)
##       Attach a looping positional sound (campfire crackle, stream, rain).
## Sound ids are documented in docs/ARCHITECTURE.md (Audio section).

var _warned := {}


func play(sound_id: String, world_pos: Variant = null, volume_db: float = 0.0, pitch_jitter: float = 0.08) -> void:
	pass


func play_ui(sound_id: String) -> void:
	pass


func set_music_mood(mood: String) -> void:
	pass


func set_danger(amount: float) -> void:
	pass


func set_near_fire(amount: float) -> void:
	pass


func start_loop(loop_id: String, node: Node3D, volume_db: float = 0.0) -> void:
	pass


func stop_loop(loop_id: String, node: Node3D) -> void:
	pass
