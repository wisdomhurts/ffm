class_name StorageUI
extends UIModal
## Camp storage window: two grids side by side (Sack | Camp Box). Click (or
## press A on) a stack to move it to the other side; drag-and-drop works too.
## "Store all resources" moves resource/food/ammo/medical stacks into the box
## and keeps tools, weapons and lights in the sack.
##
## open(args): {"target": Inventory, "title": String} lets extra storage
## chests reuse this window (default: GameState.storage, "Camp Box").

const KEEP_KINDS := ["tool", "weapon", "light", "special", "sack"]

var target: Inventory = null
var target_title := "Camp Box"
var _sack_grid: GridContainer
var _box_grid: GridContainer
var _sack_title: Label
var _box_title: Label
var _store_btn: Button
var _dirty := false


func _ready() -> void:
	close_actions = ["interact", "toggle_sack"]
	build_frame("Camp Storage", Vector2(1320, 760), "ui_chest")
	var cols := UIKit.hbox(26)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(cols)
	var left := _column("Your Sack", GameState.sack_id)
	_sack_title = left[1]
	_sack_grid = left[2]
	cols.add_child(left[0])
	var mid := UIKit.vbox(10)
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	var arrow := _SwapArrows.new()
	arrow.custom_minimum_size = Vector2(56, 70)
	mid.add_child(arrow)
	cols.add_child(mid)
	var right := _column("Camp Box", "ui_chest")
	_box_title = right[1]
	_box_grid = right[2]
	cols.add_child(right[0])

	var footer := UIKit.hbox(14)
	footer.add_child(UIKit.icon_rect("ui_info", 30))
	var hint := UIKit.label("%s an item to move it across. Your Camp Box is shared with the crafting crate." % ("Tap" if Platform.is_touch() else "Click"), "DimLabel")
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	footer.add_child(hint)
	_store_btn = UIKit.button("Store all resources", "PrimaryButton", "", 300)
	_store_btn.pressed.connect(store_all_resources)
	footer.add_child(_store_btn)
	body.add_child(footer)
	Events.inventory_changed.connect(_queue_refresh)
	Events.storage_changed.connect(_queue_refresh)


func _queue_refresh() -> void:
	if _dirty or not is_inside_tree() or _closing:
		return
	_dirty = true
	_deferred_refresh.call_deferred()


func _deferred_refresh() -> void:
	_dirty = false
	_refresh()


func open(args: Dictionary) -> void:
	var t: Variant = args.get("target", null)
	target = t as Inventory if t is Inventory else GameState.storage
	target_title = str(args.get("title", "Camp Box"))
	_refresh()
	_store_btn.grab_focus.call_deferred()


func _column(title: String, icon_id: String) -> Array:
	var panel := PanelContainer.new()
	panel.theme_type_variation = "CardPanel"
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var v := UIKit.vbox(12)
	panel.add_child(v)
	var head := UIKit.hbox(12)
	head.add_child(UIKit.icon_rect(icon_id, 48))
	var l := UIKit.label(title, "", 32)
	l.add_theme_font_override("font", ThemeFactory.font("display"))
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(l)
	v.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.follow_focus = true
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var grid := GridContainer.new()
	grid.columns = 6
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	v.add_child(scroll)
	return [panel, l, grid]


func _refresh() -> void:
	if not is_inside_tree() or _closing or target == null:
		return
	var focus_owner := get_viewport().gui_get_focus_owner()
	var focus_key := ""
	if focus_owner is ItemSlot:
		var fs := focus_owner as ItemSlot
		focus_key = "%s:%d" % ["sack" if fs.inv == GameState.inventory else "box", fs.index]
	_fill(_sack_grid, GameState.inventory, "sack", focus_key)
	_fill(_box_grid, target, "box", focus_key)
	_sack_title.text = "Your Sack  %d/%d" % [GameState.inventory.used_slots(), GameState.inventory.capacity]
	_box_title.text = "%s  %d/%d" % [target_title, target.used_slots(), target.capacity]
	_store_btn.disabled = _storable_slots().is_empty()


func _fill(grid: GridContainer, inv: Inventory, key: String, focus_key: String) -> void:
	UIKit.clear(grid)
	for i in inv.capacity:
		var s := ItemSlot.new(inv, i, 92.0)
		s.activated.connect(_on_activated)
		s.dropped.connect(_on_dropped)
		grid.add_child(s)
		if focus_key == "%s:%d" % [key, i]:
			_focus_slot.call_deferred(s)


func _focus_slot(s: ItemSlot) -> void:
	if is_instance_valid(s) and s.is_inside_tree():
		s.grab_focus()


func _other(inv: Inventory) -> Inventory:
	return target if inv == GameState.inventory else GameState.inventory


func _on_activated(slot: ItemSlot) -> void:
	var id := slot.item_id()
	if id == "":
		return
	var other := _other(slot.inv)
	var moved := slot.inv.transfer_slot_to(other, slot.index)
	if moved <= 0:
		Audio.play_ui("deny")
		Events.notify.emit("No room in your %s." % ("sack" if other == GameState.inventory else target_title), "warn")
		if other == GameState.inventory:
			Events.inventory_full.emit(id)
	else:
		Audio.play_ui("ui_click")


func _on_dropped(from_inv: Inventory, from_index: int, slot: ItemSlot) -> void:
	if from_inv == null:
		return
	if from_inv == slot.inv:
		from_inv.swap(from_index, slot.index)
		return
	if slot.slot_data() == null:
		var s: Variant = from_inv.get_slot(from_index)
		if s != null:
			from_inv.set_slot(from_index, null)
			slot.inv.set_slot(slot.index, s)
			return
	from_inv.transfer_slot_to(slot.inv, from_index)


func _storable_slots() -> Array:
	var out: Array = []
	for i in GameState.inventory.capacity:
		var id := GameState.inventory.slot_id(i)
		if id != "" and not (DB.item_kind(id) in KEEP_KINDS):
			out.append(i)
	return out


func store_all_resources() -> void:
	var moved_any := false
	var blocked := false
	for i in _storable_slots():
		var count := int(GameState.inventory.get_slot(i)["count"])
		var moved := GameState.inventory.transfer_slot_to(target, i)
		if moved > 0:
			moved_any = true
		if moved < count:
			blocked = true
	if moved_any:
		Audio.play_ui("ui_click")
		Events.notify.emit("Stored your resources in the %s." % target_title, "good")
	if blocked:
		Events.notify.emit("The %s is full!" % target_title, "warn")


class _SwapArrows:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var col := Color(1.0, 0.75, 0.4, 0.75)
		for k in 2:
			var y := c.y + (-14.0 if k == 0 else 14.0)
			var d := 1.0 if k == 0 else -1.0
			draw_line(Vector2(c.x - 20 * d, y), Vector2(c.x + 18 * d, y), col, 5.0, true)
			draw_colored_polygon(PackedVector2Array([Vector2(c.x + 26 * d, y), Vector2(c.x + 12 * d, y - 10), Vector2(c.x + 12 * d, y + 10)]), col)
