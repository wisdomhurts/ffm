class_name EnvironmentController
extends Node3D
## Sky, sun, moon, fog, post-processing, weather and quality presets.
## STUB: replaced by the lighting build. Must keep: setup(game), `raining`,
## `weather`, sets Lights.daylight every frame.

var world_env: WorldEnvironment
var sun: DirectionalLight3D
var raining := false
var weather := "clear"


func setup(_game: Game) -> void:
	GameState.environment = self
	world_env = WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	env.sky.sky_material = ProceduralSkyMaterial.new()
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_env.environment = env
	add_child(world_env)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	add_child(sun)


func _process(_delta: float) -> void:
	var dc := GameState.day_cycle
	var h := dc.sun_height()
	sun.rotation = Vector3(-asin(clampf(h, -1.0, 1.0)) - 0.05, deg_to_rad(-35.0), 0.0)
	sun.light_energy = clampf(h * 2.0, 0.0, 1.0)
	Lights.daylight = 1.0 - dc.darkness()
