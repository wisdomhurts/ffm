class_name DevOverlay
extends PanelContainer
## Dev-mode overlay (F1): the F-key tools and live values.

var _label: Label
var _acc := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := ThemeFactory.panel_style(14, 1.0)
	sb.bg_color = Color(0.02, 0.03, 0.05, 0.86)
	sb.border_color = Color(0.55, 0.75, 1.0, 0.35)
	add_theme_stylebox_override("panel", sb)
	var v := UIKit.vbox(6)
	v.add_child(UIKit.label("DEV TOOLS", "", 20, Color("9db8f0")))
	_label = UIKit.label("", "")
	_label.add_theme_font_size_override("font_size", 17)
	_label.add_theme_font_override("font", ThemeFactory.font("body_regular"))
	v.add_child(_label)
	add_child(v)


func _process(delta: float) -> void:
	if not visible:
		return
	_acc += delta
	if _acc < 0.2:
		return
	_acc = 0.0
	var dc := GameState.day_cycle
	var s := GameState.survival
	var fire := GameState.fire
	var lines: PackedStringArray = [
		"F1 overlay   F2 time x%d   F3 materials" % int(GameState.time_scale),
		"F4 stalker   F5 boss   F6 fire out   F7 next phase",
		"F8 god mode (%s)   F9 wolf   F10 refill" % ("ON" if Dev.god_mode else "off"),
		"",
		"FPS %d   draw calls %d   objects %d" % [Engine.get_frames_per_second(),
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)],
		"%s %s  (%.0f%%)  day %d  nights %d" % [dc.phase_name(), dc.clock_text(), dc.phase_progress() * 100.0, dc.day, dc.nights_survived],
		"Fire %s  fuel %.0f/%.0f  lvl %d  light r %.1f" % [fire.state_name(), fire.fuel, fire.max_fuel(), fire.level, fire.light_radius()],
		"HP %.0f  food %.0f  warm %.0f -> %.0f" % [s.health, s.hunger, s.warmth, s.warmth_target],
		"Monsters %d   wildlife %d   seed %d" % [get_tree().get_nodes_in_group("monster").size(), get_tree().get_nodes_in_group("wildlife").size(), GameState.seed],
	]
	if GameState.player and is_instance_valid(GameState.player):
		var p := GameState.player.global_position
		lines.append("Player %.1f, %.1f, %.1f   light %.2f" % [p.x, p.y, p.z, Lights.intensity_at(p)])
	_label.text = "\n".join(lines)
