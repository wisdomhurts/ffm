class_name ScreenFX
extends ColorRect
## Full-screen feedback overlay (one shader, one draw call):
##   red damage flash (Events.player_damaged), low-health heartbeat pulse,
##   frost vignette while freezing, and a subtle dark vignette while the
##   campfire is out. "Reduce flashing" softens every effect.

const SHADER := preload("res://ui/screen_fx.gdshader")

var _hurt := 0.0
var _dark := 0.0
var _frost := 0.0
var _beat_t := 0.0
var _mat: ShaderMaterial


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	color = Color.WHITE
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	material = _mat
	Events.player_damaged.connect(_on_damaged)


func _on_damaged(amount: float, _kind: String) -> void:
	var k := clampf(amount / 25.0, 0.35, 1.0)
	if ThemeFactory.reduce_flashing():
		k *= 0.45
	_hurt = maxf(_hurt, k)


func _process(delta: float) -> void:
	var s := GameState.survival
	var playing := GameState.is_playing() or GameState.state == GameState.RunState.DEAD
	var calm := ThemeFactory.reduce_flashing()
	_hurt = maxf(_hurt - delta * (1.2 if calm else 1.9), 0.0)
	# Heartbeat when health is low: two quick beats per cycle.
	var beat := 0.0
	var hp := s.health / maxf(s.max_health, 1.0)
	if playing and hp < 0.3 and not s.dead:
		var rate := lerpf(1.6, 0.95, clampf(hp / 0.3, 0.0, 1.0))
		_beat_t += delta / rate
		var ph := fmod(_beat_t, 1.0)
		beat = maxf(exp(-pow((ph - 0.08) * 14.0, 2.0)), 0.7 * exp(-pow((ph - 0.3) * 14.0, 2.0)))
		beat *= lerpf(0.75, 0.35, clampf(hp / 0.3, 0.0, 1.0))
		if calm:
			beat *= 0.5
	# Frost below the freezing threshold (and a hint of it when chilly).
	var thr := float(s.cfg.get("freezing_threshold", 18.0))
	var frost_target := 0.0
	if playing:
		if s.warmth < thr:
			frost_target = lerpf(0.55, 1.0, 1.0 - clampf(s.warmth / maxf(thr, 1.0), 0.0, 1.0))
		elif s.warmth < thr + 14.0:
			frost_target = 0.25 * (1.0 - (s.warmth - thr) / 14.0)
	_frost = move_toward(_frost, frost_target, delta * 0.6)
	# Darkness while the fire is out (stronger at night).
	var dark_target := 0.0
	if playing and GameState.fire.state() == FireModel.State.OUT:
		dark_target = lerpf(0.25, 0.6, GameState.day_cycle.darkness())
	_dark = move_toward(_dark, dark_target, delta * 0.5)
	var vp := get_viewport_rect().size
	_mat.set_shader_parameter("aspect", vp.x / maxf(vp.y, 1.0))
	_mat.set_shader_parameter("hurt_amount", clampf(maxf(_hurt, beat), 0.0, 1.0))
	_mat.set_shader_parameter("frost_amount", _frost)
	_mat.set_shader_parameter("dark_amount", _dark)
	_mat.set_shader_parameter("time_s", Time.get_ticks_msec() / 1000.0)
	visible = _hurt > 0.001 or beat > 0.001 or _frost > 0.001 or _dark > 0.001
