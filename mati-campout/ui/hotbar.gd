class_name Hotbar
extends Control
## The always-visible inventory along the bottom of the screen.
##
## Bottom row: the first 7 sack slots (number keys 1-7). Bigger sacks add
## slots in rows of 7 directly above it (toggle_sack: Tab / D-pad down);
## collapsed, a "+N" badge on the sack shows how many stacks are tucked away.
## Click selects, drag-and-drop swaps, and the selected item's name fades in
## above the bar. Shakes and flashes red when the sack is full.

const MAIN_SLOTS := 7
const SLOT := 92.0
const GAP := 12.0
const EXTRA_SLOT := 78.0
const EXTRA_GAP := 10.0

signal expanded_changed(expanded: bool)

var expanded := false
var main_row: HBoxContainer
var main_panel: PanelContainer
var extra_panel: PanelContainer
var extra_grid: GridContainer
var sack_badge: Control
var name_label: Label
var hint_label: Label
var slots: Array = []
var _name_timer := 0.0
var _shake := 0.0
var _badge_flash := 0.0
var _built_capacity := -1
var _last_counts: Dictionary = {}
var _extra_t := 0.0
var _interactive := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	extra_panel = PanelContainer.new()
	extra_panel.add_theme_stylebox_override("panel", _bar_style())
	extra_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	extra_grid = GridContainer.new()
	extra_grid.columns = MAIN_SLOTS
	extra_grid.add_theme_constant_override("h_separation", int(EXTRA_GAP))
	extra_grid.add_theme_constant_override("v_separation", int(EXTRA_GAP))
	extra_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	extra_panel.add_child(extra_grid)
	add_child(extra_panel)

	main_panel = PanelContainer.new()
	main_panel.add_theme_stylebox_override("panel", _bar_style())
	main_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(int(GAP))
	main_row = UIKit.hbox(int(GAP))
	row.add_child(main_row)
	var sep := VSeparator.new()
	sep.add_theme_constant_override("separation", 10)
	var vline := StyleBoxLine.new()
	vline.vertical = true
	vline.color = Color(1, 0.85, 0.6, 0.18)
	vline.thickness = 2
	sep.add_theme_stylebox_override("separator", vline)
	sep.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(sep)
	sack_badge = _SackBadge.new()
	sack_badge.custom_minimum_size = Vector2(108, SLOT)
	(sack_badge as _SackBadge).bar = self
	row.add_child(sack_badge)
	main_panel.add_child(row)
	add_child(main_panel)

	name_label = UIKit.label("", "HudLabel")
	name_label.add_theme_font_size_override("font_size", 30)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.modulate.a = 0.0
	add_child(name_label)
	hint_label = UIKit.label("", "HudSmall")
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.modulate.a = 0.0
	add_child(hint_label)

	Events.inventory_changed.connect(_on_inventory_changed)
	Events.selected_slot_changed.connect(_on_selected)
	Events.inventory_full.connect(_on_full)
	Events.sack_upgraded.connect(func(_id: String, _cap: int) -> void: _rebuild())
	_rebuild()


func _bar_style() -> StyleBoxFlat:
	var sb := ThemeFactory.panel_style(22, 0.85)
	sb.set_content_margin_all(12)
	return sb


func set_interactive(on: bool) -> void:
	_interactive = on
	for s in slots:
		var sl := s as ItemSlot
		sl.mouse_filter = Control.MOUSE_FILTER_STOP if on else Control.MOUSE_FILTER_IGNORE
		sl.focus_mode = Control.FOCUS_ALL if on else Control.FOCUS_NONE
		sl.interactive = on


func set_expanded(on: bool) -> void:
	var extra := GameState.inventory.capacity - MAIN_SLOTS
	if extra <= 0:
		on = false
	if on == expanded:
		return
	expanded = on
	Audio.play_ui("ui_open" if on else "ui_close")
	expanded_changed.emit(expanded)


func toggle_expanded() -> void:
	if GameState.inventory.capacity <= MAIN_SLOTS:
		Events.notify.emit("Your sack only has %d slots. Find or buy a bigger sack!" % GameState.inventory.capacity, "info")
		return
	set_expanded(not expanded)


func hidden_stacks() -> int:
	var n := 0
	for i in range(MAIN_SLOTS, GameState.inventory.capacity):
		if GameState.inventory.get_slot(i) != null:
			n += 1
	return n


## Height of the bar stack (for placing the prompt above it).
func top_y() -> float:
	var y := main_panel.position.y
	if extra_panel.visible and _extra_t > 0.01:
		y = minf(y, extra_panel.position.y)
	return y


func _rebuild() -> void:
	var inv := GameState.inventory
	_built_capacity = inv.capacity
	for c in main_row.get_children():
		main_row.remove_child(c)
		c.queue_free()
	for c in extra_grid.get_children():
		extra_grid.remove_child(c)
		c.queue_free()
	slots.clear()
	for i in inv.capacity:
		var main := i < MAIN_SLOTS
		var s := ItemSlot.new(inv, i, SLOT if main else EXTRA_SLOT)
		if main:
			s.key_label = str(i + 1)
			main_row.add_child(s)
		else:
			extra_grid.add_child(s)
		s.activated.connect(_on_slot_activated)
		s.dropped.connect(_on_slot_dropped)
		slots.append(s)
	# Pad the main row when a (modded) sack is smaller than 7.
	extra_panel.visible = inv.capacity > MAIN_SLOTS
	set_interactive(_interactive)
	_refresh_selection()
	_last_counts = inv.summary()


func _refresh_selection() -> void:
	for s in slots:
		var sl := s as ItemSlot
		sl.selected = sl.index == GameState.selected_slot
		sl.queue_redraw()


func _on_inventory_changed() -> void:
	if GameState.inventory.capacity != _built_capacity:
		_rebuild()
		return
	var now := GameState.inventory.summary()
	for s in slots:
		var sl := s as ItemSlot
		var id := sl.item_id()
		if id != "" and int(now.get(id, 0)) > int(_last_counts.get(id, 0)):
			sl.pop()
		sl.queue_redraw()
	_last_counts = now
	_show_name()


func _on_selected(_i: int) -> void:
	_refresh_selection()
	_show_name()
	Audio.play_ui("ui_hover")


func _on_full(_id: String) -> void:
	_shake = 1.0
	_badge_flash = 1.0
	for s in slots:
		(s as ItemSlot).flash()


func _show_name() -> void:
	var id := GameState.selected_item_id()
	var txt := DB.item_name(id) if id != "" else ""
	if txt != name_label.text:
		name_label.text = txt
		_name_timer = 2.4 if txt != "" else 0.0
		hint_label.text = _use_hint(id)


func _use_hint(id: String) -> String:
	if id == "":
		return ""
	var use := Controls.prompt("use")
	match DB.item_kind(id):
		"tool":
			return "%s to chop" % use
		"weapon":
			return "%s to attack" % use
		"food":
			return "%s to eat" % use
		"medical":
			return "%s to heal" % use
		"light":
			return "%s to switch on" % use
		"resource":
			if DB.fuel_value(id) > 0.0:
				return "Add it to the campfire with %s" % Controls.prompt("interact")
	return ""


func _on_slot_activated(slot: ItemSlot) -> void:
	GameState.select_slot(slot.index)
	Audio.play_ui("ui_click")


func _on_slot_dropped(from_inv: Inventory, from_index: int, slot: ItemSlot) -> void:
	if from_inv == GameState.inventory:
		GameState.inventory.swap(from_index, slot.index)
		Audio.play_ui("ui_click")
	elif from_inv != null:
		from_inv.transfer_slot_to(GameState.inventory, from_index)


func _process(delta: float) -> void:
	var vp := get_parent_area_size()
	if GameState.inventory.capacity != _built_capacity:
		_rebuild()
	# Layout: centred along the bottom.
	var ms := main_panel.get_combined_minimum_size()
	main_panel.size = ms
	var shake_x := 0.0
	if _shake > 0.0:
		_shake = maxf(_shake - delta * 2.4, 0.0)
		var amp := 14.0 if not ThemeFactory.reduce_flashing() else 6.0
		shake_x = sin(_shake * 46.0) * amp * _shake
	main_panel.position = Vector2((vp.x - ms.x) * 0.5 + shake_x, vp.y - ms.y - 26.0)
	_extra_t = move_toward(_extra_t, 1.0 if expanded else 0.0, delta * 7.0)
	var es := extra_panel.get_combined_minimum_size()
	extra_panel.size = es
	var ease_t := 1.0 - pow(1.0 - _extra_t, 3.0)
	extra_panel.position = Vector2((vp.x - es.x) * 0.5 + shake_x, main_panel.position.y - 12.0 - es.y * ease_t + (1.0 - ease_t) * 30.0)
	extra_panel.modulate.a = ease_t
	extra_panel.visible = GameState.inventory.capacity > MAIN_SLOTS and _extra_t > 0.01
	# Selected item name (fades) above everything.
	var top := top_y()
	_name_timer = maxf(_name_timer - delta, 0.0)
	var a := clampf(_name_timer / 0.6, 0.0, 1.0)
	name_label.modulate.a = move_toward(name_label.modulate.a, a, delta * 5.0)
	hint_label.modulate.a = name_label.modulate.a * 0.9
	name_label.size = Vector2(800, 40)
	name_label.position = Vector2(vp.x * 0.5 - 400, top - 76)
	hint_label.size = Vector2(800, 28)
	hint_label.position = Vector2(vp.x * 0.5 - 400, top - 40)
	if _badge_flash > 0.0:
		_badge_flash = maxf(_badge_flash - delta * 1.6, 0.0)
	sack_badge.queue_redraw()


## Draws the sack icon with used/capacity and the "+N" hidden-stack badge.
class _SackBadge:
	extends Control
	var bar: Hotbar

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var inv := GameState.inventory
		var s := size
		var tex := ThemeFactory.icon(GameState.sack_id)
		if tex == null:
			tex = ThemeFactory.icon("ui_sack")
		var isz := Vector2(60, 60)
		var flash := bar._badge_flash if bar else 0.0
		if flash > 0.0:
			draw_texture_rect(ThemeFactory.glow_texture(), Rect2(Vector2(s.x * 0.5 - 50, 2 - 26), Vector2(100, 100)), false, Color(1, 0.2, 0.1, flash * 0.8))
		if tex:
			draw_texture_rect(tex, Rect2(Vector2((s.x - isz.x) * 0.5, 2), isz), false)
		var f := ThemeFactory.font("display")
		var used := inv.used_slots()
		var txt := "%d/%d" % [used, inv.capacity]
		var col := ThemeFactory.text_color()
		if used >= inv.capacity:
			col = ThemeFactory.AMBER
		if flash > 0.0:
			col = col.lerp(ThemeFactory.DANGER, flash)
		var fs := 23
		var tw := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var p := Vector2((s.x - tw) * 0.5, s.y - 6)
		draw_string_outline(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.8))
		draw_string(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		if inv.capacity > Hotbar.MAIN_SLOTS and bar and not bar.expanded:
			var hidden := bar.hidden_stacks()
			var c := Vector2(s.x - 14, 14)
			var label := "+%d" % (inv.capacity - Hotbar.MAIN_SLOTS)
			var bw := maxf(34.0, f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x + 16)
			var sb := StyleBoxFlat.new()
			sb.set_corner_radius_all(16)
			sb.anti_aliasing = true
			sb.bg_color = ThemeFactory.AMBER if hidden > 0 else Color(0.3, 0.35, 0.3, 0.9)
			sb.set_border_width_all(2)
			sb.border_color = Color("2a1606")
			draw_style_box(sb, Rect2(c - Vector2(bw * 0.5, 15), Vector2(bw, 30)))
			var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
			draw_string(f, c + Vector2(-lw * 0.5, 7), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("2a1606"))
			var k := Controls.prompt("toggle_sack")
			var kf := ThemeFactory.font("body_bold")
			var kw := kf.get_string_size(k, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
			draw_string_outline(kf, Vector2(s.x - 14 - kw * 0.5, 44), k, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, 4, Color(0, 0, 0, 0.8))
			draw_string(kf, Vector2(s.x - 14 - kw * 0.5, 44), k, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, ThemeFactory.text_dim())
