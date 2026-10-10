class_name SettingsMenu
extends UIModal
## Settings window used from the title screen and the pause menu.
## Tabs: Graphics, Audio, Controls, Accessibility, Gameplay, Advanced.
## Every control reads/writes Settings.get_value / Settings.set_value and is
## fully keyboard / controller navigable (LB / RB switch tabs).

const TABS := ["Graphics", "Audio", "Controls", "Accessibility", "Gameplay", "Advanced"]

var _tab_buttons: Array = []
var _pages: Array = []
var _current := 0


func _ready() -> void:
	build_frame("Settings", Vector2(1180, 800), "ui_star", 0.55)
	var row := UIKit.hbox(8)
	body.add_child(row)
	var group := ButtonGroup.new()
	for i in TABS.size():
		var b := UIKit.button(TABS[i], "TabButton")
		b.toggle_mode = true
		b.button_group = group
		var idx := i
		b.pressed.connect(func() -> void: _show(idx))
		row.add_child(b)
		_tab_buttons.append(b)
	var stack := Control.new()
	stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stack.custom_minimum_size = Vector2(1100, 560)
	body.add_child(stack)
	for i in TABS.size():
		var scroll := ScrollContainer.new()
		scroll.follow_focus = true
		scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		var page := UIKit.vbox(6)
		page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(page)
		stack.add_child(scroll)
		_pages.append(scroll)
		_build_page(i, page)
	var footer := UIKit.hbox(14)
	var reset := UIKit.button("Reset to defaults", "", "", 280)
	reset.pressed.connect(_reset)
	footer.add_child(reset)
	footer.add_child(UIKit.spacer(0, 0, true))
	var done := UIKit.button("Done", "PrimaryButton", "", 220)
	done.pressed.connect(close)
	footer.add_child(done)
	body.add_child(footer)
	_show(0)


func open(args: Dictionary) -> void:
	var tab := str(args.get("tab", ""))
	var i := TABS.find(tab)
	if i >= 0:
		_show(i)


func _on_tab_cycle(dir: int) -> void:
	_show(posmod(_current + dir, TABS.size()))


func _show(i: int) -> void:
	_current = i
	for k in _pages.size():
		(_pages[k] as Control).visible = k == i
		(_tab_buttons[k] as Button).set_pressed_no_signal(k == i)
	_focus_page.call_deferred()


func _focus_page() -> void:
	if not is_inside_tree():
		return
	var page := (_pages[_current] as ScrollContainer).get_child(0)
	if not UIModal.focus_first(page):
		(_tab_buttons[_current] as Button).grab_focus()


func _reset() -> void:
	UIModal.confirm(self, "Reset settings?", "All settings go back to their defaults.", "Reset", func() -> void:
		Settings.reset_to_defaults()
		for p in _pages:
			UIKit.clear((p as ScrollContainer).get_child(0))
		for i in _pages.size():
			_build_page(i, (_pages[i] as ScrollContainer).get_child(0) as VBoxContainer)
		_show(_current))


# --- Pages -------------------------------------------------------------------------

func _build_page(i: int, page: VBoxContainer) -> void:
	match TABS[i]:
		"Graphics":
			_option(page, "quality", "Quality", [["low", "Low"], ["medium", "Medium"], ["high", "High"]],
				"Lower quality runs faster on older computers.")
			_toggle(page, "fullscreen", "Fullscreen")
			_toggle(page, "vsync", "V-Sync")
			_option(page, "fps_limit", "Frame rate limit", [[0, "Unlimited"], [30, "30"], [60, "60"], [120, "120"], [144, "144"]])
			_slider(page, "render_scale", "Render scale", 0.5, 1.0, 0.05, func(v: float) -> String: return "%d%%" % int(round(v * 100.0)))
			_slider(page, "brightness", "Brightness", 0.6, 1.6, 0.05, func(v: float) -> String: return "%d%%" % int(round(v * 100.0)))
			_toggle(page, "show_fps", "Show FPS")
		"Audio":
			for k in [["master_volume", "Master volume"], ["music_volume", "Music"], ["sfx_volume", "Sound effects"], ["ambience_volume", "Ambience"]]:
				_slider(page, str(k[0]), str(k[1]), 0.0, 1.0, 0.05, func(v: float) -> String: return "%d%%" % int(round(v * 100.0)))
		"Controls":
			_slider(page, "mouse_sensitivity", "Mouse sensitivity", 0.2, 3.0, 0.1, func(v: float) -> String: return "%.1fx" % v)
			_slider(page, "controller_sensitivity", "Controller sensitivity", 0.2, 3.0, 0.1, func(v: float) -> String: return "%.1fx" % v)
			_toggle(page, "invert_y", "Invert camera Y")
			_slider(page, "fov", "Field of view", 55.0, 100.0, 1.0, func(v: float) -> String: return "%d°" % int(v))
			_slider(page, "camera_distance", "Camera distance", 3.0, 8.0, 0.1, func(v: float) -> String: return "%.1f m" % v)
			_slider(page, "camera_shake", "Camera shake", 0.0, 1.0, 0.05, func(v: float) -> String: return "%d%%" % int(round(v * 100.0)))
			_toggle(page, "hold_to_sprint", "Hold to sprint", "Off: tap sprint to toggle running.")
			_toggle(page, "auto_pickup", "Auto pick-up", "Walk over wood, stones and berries to collect them.")
		"Accessibility":
			_slider(page, "ui_scale", "UI size", 0.8, 1.4, 0.05, func(v: float) -> String: return "%d%%" % int(round(v * 100.0)), true)
			_toggle(page, "high_contrast", "High contrast", "Solid panels and brighter text.")
			_option(page, "colorblind_mode", "Colour-blind mode", [["none", "Off"], ["deuteranopia", "Red-green (deuteranopia)"],
				["protanopia", "Red-green (protanopia)"], ["tritanopia", "Blue-yellow (tritanopia)"]],
				"Changes bar colours. Icons always show the meaning too.")
			_toggle(page, "reduce_flashing", "Reduce flashing", "Softer screen flashes and less shaking.")
			_toggle(page, "sound_captions", "Sound captions", "Show text for important sounds.")
		"Gameplay":
			_option(page, "day_length_mult", "Day length", [[1.5, "Relaxed (1.5x longer)"], [1.0, "Normal (1x)"], [0.75, "Quick (0.75x)"]],
				"Applies from your next run.")
		"Advanced":
			_toggle(page, "dev_mode", "Developer mode", "F1-F10 debug tools (time skip, spawn, god mode).")
			var note := UIKit.wrap_label("Settings are saved on this computer automatically.", "SmallLabel", 900)
			page.add_child(UIKit.spacer(10))
			page.add_child(note)


func _row(page: VBoxContainer, label: String, hint: String) -> HBoxContainer:
	var panel := PanelContainer.new()
	panel.theme_type_variation = "CardPanel"
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(20)
	panel.add_child(row)
	var text_col := UIKit.vbox(0)
	text_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var l := UIKit.label(label, "", 26)
	text_col.add_child(l)
	if hint != "":
		text_col.add_child(UIKit.label(hint, "SmallLabel"))
	row.add_child(text_col)
	page.add_child(panel)
	return row


func _toggle(page: VBoxContainer, key: String, label: String, hint: String = "") -> void:
	var row := _row(page, label, hint)
	var cb := CheckButton.new()
	cb.button_pressed = bool(Settings.get_value(key))
	cb.focus_mode = Control.FOCUS_ALL
	cb.text = "On" if cb.button_pressed else "Off"
	cb.custom_minimum_size.x = 160
	cb.toggled.connect(func(on: bool) -> void:
		cb.text = "On" if on else "Off"
		Audio.play_ui("ui_click")
		Settings.set_value(key, on))
	row.add_child(cb)


func _option(page: VBoxContainer, key: String, label: String, options: Array, hint: String = "") -> void:
	var row := _row(page, label, hint)
	var ob := OptionButton.new()
	ob.custom_minimum_size = Vector2(420, 0)
	ob.focus_mode = Control.FOCUS_ALL
	var cur: Variant = Settings.get_value(key)
	var sel := 0
	for i in options.size():
		var o: Array = options[i]
		ob.add_item(str(o[1]), i)
		if _same(o[0], cur):
			sel = i
	ob.select(sel)
	ob.item_selected.connect(func(idx: int) -> void:
		Audio.play_ui("ui_click")
		var v: Variant = (options[idx] as Array)[0]
		var def: Variant = Settings.DEFAULTS.get(key)
		if def is float:
			v = float(v)
		elif def is int:
			v = int(v)
		Settings.set_value(key, v))
	row.add_child(ob)


static func _same(a: Variant, b: Variant) -> bool:
	if (a is float or a is int) and (b is float or b is int):
		return absf(float(a) - float(b)) < 0.001
	return str(a) == str(b)


func _slider(page: VBoxContainer, key: String, label: String, lo: float, hi: float, step: float, fmt: Callable, apply_on_release: bool = false) -> void:
	var row := _row(page, label, "")
	var box := UIKit.hbox(14)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.custom_minimum_size = Vector2(320, 36)
	s.focus_mode = Control.FOCUS_ALL
	s.value = float(Settings.get_value(key))
	s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var val := UIKit.label(fmt.call(s.value), "", 24, ThemeFactory.AMBER)
	val.custom_minimum_size.x = 86
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var dragging := [false]
	s.drag_started.connect(func() -> void: dragging[0] = true)
	s.drag_ended.connect(func(_changed: bool) -> void:
		dragging[0] = false
		if apply_on_release:
			Settings.set_value(key, float(s.value)))
	s.value_changed.connect(func(v: float) -> void:
		val.text = fmt.call(v)
		if not apply_on_release or not dragging[0]:
			Settings.set_value(key, float(v)))
	box.add_child(s)
	box.add_child(val)
	row.add_child(box)
