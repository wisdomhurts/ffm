extends SceneTree
## Headless audio walkthrough: starts a real run and steps through title,
## day, dusk, night (by the fire and away from it), danger, fire out, boss,
## rain, the ridge, the stream and death, printing Audio.debug_state() after
## each step. The dummy audio driver cannot output sound; this checks the
## director's logic (moods, layers, beds, loops, captions) end to end.
##
##   godot --headless --path . -s res://tools/audio_tour.gd
## Lines start with "TOUR". Exit code 0 = all expectations met.

var main: Node
var failures := 0
var captions: Array = []


func _initialize() -> void:
	_run.call_deferred()


func wait(seconds: float) -> void:
	var t := 0.0
	while t < seconds:
		await process_frame
		t += maxf(root.get_process_delta_time(), 0.001)


func state(label: String) -> Dictionary:
	var audio: Node = root.get_node("Audio")
	var s: Dictionary = audio.call("debug_state")
	print("TOUR %-14s %s" % [label, JSON.stringify(s)])
	return s


func expect(cond: bool, what: String) -> void:
	if cond:
		print("TOUR PASS ", what)
	else:
		failures += 1
		print("TOUR FAIL ", what)


func layer(s: Dictionary, name: String) -> float:
	return float((s["music"] as Dictionary).get(name, 0.0))


func bed(s: Dictionary, name: String) -> float:
	return float((s["beds"] as Dictionary).get(name, 0.0))


func _run() -> void:
	var gs: Node = root.get_node("GameState")
	var settings: Node = root.get_node("Settings")
	var events: Node = root.get_node("Events")
	settings.call("set_value", "sound_captions", true, false)
	events.connect("caption", func(t: String) -> void: captions.append(t))
	main = (load("res://main/main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await wait(3.0)
	var s := state("title")
	expect(s["mood"] == "title" and layer(s, "title") > 0.5, "title music on the title screen")

	await main.call("start_run", 424242)
	await wait(6.0)
	s = state("day")
	expect(s["mood"] == "day" and layer(s, "day") > 0.4 and layer(s, "title") < 0.3, "title crossfades to day music")
	expect(bed(s, "amb_day") > 0.5 and bed(s, "amb_night") < 0.2, "day ambience (birds)")
	expect(int(s["loops"]) >= 1, "campfire loop attached automatically")

	var dc: DayCycle = gs.get("day_cycle")
	dc.skip_to(DayCycle.Phase.DUSK)
	await wait(5.0)
	s = state("dusk")
	expect(s["mood"] == "dusk" and layer(s, "dusk") > 0.5, "dusk music")

	dc.skip_to(DayCycle.Phase.NIGHT)
	await wait(6.0)
	s = state("night_fire")
	expect(s["mood"] == "night", "night mood")
	expect(float(s["near_fire"]) > 0.5 and layer(s, "night_warm") > layer(s, "night") * 0.8, "warm night layer by the fire")
	expect(bed(s, "amb_night") > 0.5, "night ambience (crickets)")

	var player: Node3D = gs.get("player")
	var gen: WorldGen = gs.get("world_gen")
	player.set_physics_process(false)
	player.global_position = gen.ground(Vector3(45.0, 0.0, 40.0), 0.1)
	await wait(6.0)
	s = state("night_away")
	expect(float(s["near_fire"]) < 0.2 and layer(s, "night") > layer(s, "night_warm"), "tense layer away from the fire")

	var monster := Node3D.new()
	monster.add_to_group("monster")
	main.add_child(monster)
	monster.global_position = player.global_position + Vector3(7.0, 0.0, 0.0)
	await wait(1.0)
	var s_duck := state("danger_1s")
	await wait(3.0)
	s = state("danger")
	expect(float(s["danger"]) > 0.6 and layer(s, "danger") > 0.3, "danger layer with a monster nearby")
	expect(float(s_duck["duck"]) < 0.6, "sudden silence when danger rises at night")
	expect(captions.has("[something is moving in the trees]"), "monster-nearby caption")
	monster.queue_free()

	var fire: FireModel = gs.get("fire")
	fire.extinguish()
	await wait(3.0)
	s = state("fire_out")
	expect(s["mood"] == "fire_out" and layer(s, "fire_out") > 0.5, "fire_out music when the fire dies at night")
	expect(captions.has("[the fire hisses out]"), "fire-out caption")
	fire.relight("kindling", "wood")

	events.emit_signal("boss_spawned")
	await wait(3.0)
	s = state("boss")
	expect(s["mood"] == "boss" and layer(s, "boss") > 0.5, "boss music")
	var audio: Node = root.get_node("Audio")
	var ears: Vector3 = audio.call("listener_position")
	audio.call("play", "boss_roar", ears + Vector3(30, 0, 0))
	audio.call("play", "wolf_howl", ears + Vector3(150, 0, 0))
	await wait(0.2)
	expect(captions.has("[a huge roar!]") and captions.has("[wolf howling far away]"), "roar and far howl captions")
	events.emit_signal("boss_defeated")
	await wait(4.0)
	s = state("after_boss")
	expect(s["mood"] == "night" and layer(s, "boss") < 0.3, "back to night after the boss")

	var env: Node = gs.get("environment")
	env.set("raining", true)
	player.global_position = gen.ground(Vector3(110.0, 0.0, -170.0), 0.1)
	await wait(5.0)
	s = state("ridge_rain")
	expect(bed(s, "rain") > 0.6, "rain loop while raining")
	expect(bed(s, "wind") > 0.7, "strong wind on the ridge")
	env.set("raining", false)

	player.global_position = gen.ground(Vector3(55.0, 0.0, -88.0), 0.1)
	await wait(3.0)
	s = state("stream")
	expect(float(s["stream"]) > 0.5, "stream emitter near the stream")

	dc.skip_to(DayCycle.Phase.DAWN)
	await wait(2.0)
	s = state("dawn")
	expect(s["mood"] == "day", "dawn returns to the day mood")

	var survival: SurvivalModel = gs.get("survival")
	survival.damage(9999.0, "test")
	await wait(3.5)
	s = state("dead")
	expect(s["mood"] == "gameover", "gameover mood after death")
	print("TOUR captions: ", captions)
	print("TOUR RESULT: %d failed" % failures)
	quit(1 if failures > 0 else 0)
