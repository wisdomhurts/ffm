class_name PauseMenu
extends UIModal
## Pause menu: Resume, Settings, How to Play, Quit to Title (with a
## confirmation). Pauses the game while open (the HUD handles the pause).

var _buttons: VBoxContainer
var _how: Control = null


func _init() -> void:
	super._init()
	pauses_game = true


func _ready() -> void:
	build_frame("Paused", Vector2(560, 0), "ui_moon", 0.62)
	var dc := GameState.day_cycle
	var info := UIKit.label("%s %d  -  %d night%s survived" % [
		"Night" if dc.phase == DayCycle.Phase.NIGHT else "Day", dc.night_number() if dc.phase == DayCycle.Phase.NIGHT else dc.day,
		dc.nights_survived, "" if dc.nights_survived == 1 else "s"], "DimLabel")
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(info)
	_buttons = UIKit.vbox(14)
	body.add_child(_buttons)
	var resume := UIKit.button("Resume", "PrimaryButton", "", 460)
	resume.pressed.connect(close)
	_buttons.add_child(resume)
	var settings := UIKit.button("Settings", "", "", 460)
	settings.pressed.connect(_open_settings)
	_buttons.add_child(settings)
	var how := UIKit.button("How to Play", "", "", 460)
	how.pressed.connect(_open_how)
	_buttons.add_child(how)
	var quit := UIKit.button("Quit to Title", "", "", 460)
	quit.pressed.connect(_ask_quit)
	_buttons.add_child(quit)
	resume.grab_focus.call_deferred()


func _open_settings() -> void:
	var s := SettingsMenu.new()
	add_child(s)
	s.closed.connect(func() -> void:
		if is_instance_valid(_buttons):
			UIModal.focus_first(_buttons))


func _open_how() -> void:
	var h := HowToPlay.new()
	add_child(h)
	h.closed.connect(func() -> void:
		if is_instance_valid(_buttons):
			UIModal.focus_first(_buttons))


func _ask_quit() -> void:
	UIModal.confirm(self, "Quit to Title?", "This will end your run. Your nights so far won't be saved to the leaderboard.", "Quit", _quit)


func _quit() -> void:
	get_tree().paused = false
	GameState.ui_blocking = false
	GameState.state = GameState.RunState.NONE
	var main := UIKit.main_node(self)
	if main:
		main.call("show_title")
	else:
		get_tree().quit()
