class_name CraftingUI
extends UIModal
## Crafting window (opened by the camp crate via
## Events.request_modal("crafting", {})).
##
## Tabs: Survival / Tools / Weapons, plus an optional "Camp" tab: if
## res://ui/crafting_camp_tab.gd exists it is instantiated (a Control) and
## shown as the Camp tab; it may implement refresh() and use the same
## ingredients pool (GameState.crafting_sources()).
## Recipe cards show the icon, name, description and cost chips (have/need,
## counted across camp storage + sack); Craft pays with GameState.pay() and
## gives the result with GameState.give() (overflow goes to camp storage).

const TABS := [["survival", "Survival", "torch"], ["tools", "Tools", "good_axe"], ["weapons", "Weapons", "sword"]]
const CAMP_TAB_SCRIPT := "res://ui/crafting_camp_tab.gd"

var _tab_buttons: Array = []
var _tab_ids: Array = []
var _current := "survival"
var _list: VBoxContainer
var _scroll: ScrollContainer
var _camp_tab: Control = null
var _footer_coins: Label
var _dirty := false


func _ready() -> void:
	close_actions = ["interact"]
	build_frame("Crafting", Vector2(1260, 880), "ui_chest")
	var tabs_row := UIKit.hbox(10)
	body.add_child(tabs_row)
	var group := ButtonGroup.new()
	var tab_defs: Array = TABS.duplicate()
	if ResourceLoader.exists(CAMP_TAB_SCRIPT):
		tab_defs.append(["camp", "Camp", "ui_tent"])
	for d in tab_defs:
		var b := UIKit.button(str(d[1]), "TabButton", str(d[2]))
		b.toggle_mode = true
		b.button_group = group
		b.add_theme_constant_override("icon_max_width", 34)
		var id := str(d[0])
		b.pressed.connect(func() -> void: _select_tab(id))
		tabs_row.add_child(b)
		_tab_buttons.append(b)
		_tab_ids.append(id)
	tabs_row.add_child(UIKit.spacer(0, 0, true))
	var lb := UIKit.label("LB / RB", "SmallLabel")
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lb.visible = Controls.using_gamepad
	tabs_row.add_child(lb)

	_scroll = ScrollContainer.new()
	_scroll.follow_focus = true
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	_list = UIKit.vbox(14)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)

	var footer := UIKit.hbox(12)
	footer.add_child(UIKit.icon_rect("ui_info", 30))
	var note := UIKit.label("Materials come from your Camp Box first, then your sack.", "DimLabel")
	note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(note)
	footer.add_child(UIKit.icon_rect("ui_coin", 32))
	_footer_coins = UIKit.label("", "HudLabel")
	footer.add_child(_footer_coins)
	body.add_child(footer)

	Events.inventory_changed.connect(_refresh)
	Events.storage_changed.connect(_refresh)
	Events.coins_changed.connect(func(_a: int, _b: int) -> void: _refresh())


func open(args: Dictionary) -> void:
	var tab := str(args.get("tab", "survival"))
	if not _tab_ids.has(tab):
		tab = "survival"
	_select_tab(tab)


func _on_tab_cycle(dir: int) -> void:
	var i := _tab_ids.find(_current)
	i = posmod(i + dir, _tab_ids.size())
	_select_tab(str(_tab_ids[i]))


func _select_tab(id: String) -> void:
	_current = id
	for i in _tab_buttons.size():
		(_tab_buttons[i] as Button).set_pressed_no_signal(_tab_ids[i] == id)
	_rebuild()
	_focus_first.call_deferred()


func _focus_first() -> void:
	if not is_inside_tree() or _closing:
		return
	for b in _list.find_children("*", "Button", true, false):
		if not (b as Button).disabled:
			(b as Button).grab_focus()
			return
	var i := _tab_ids.find(_current)
	if i >= 0 and i < _tab_buttons.size():
		(_tab_buttons[i] as Button).grab_focus()


## Coalesce the several change signals one craft emits into one rebuild.
func _refresh() -> void:
	if _dirty or not is_inside_tree() or _closing:
		return
	_dirty = true
	_do_refresh.call_deferred()


func _do_refresh() -> void:
	_dirty = false
	if is_inside_tree() and not _closing:
		_rebuild()


func _rebuild() -> void:
	_footer_coins.text = str(GameState.coins)
	var focused := get_viewport().gui_get_focus_owner() if get_viewport() else null
	var focused_recipe := ""
	if focused and focused.has_meta("recipe_id"):
		focused_recipe = str(focused.get_meta("recipe_id"))
	if _current == "camp":
		_show_camp_tab()
		return
	if _camp_tab:
		_camp_tab.visible = false
	_scroll.visible = true
	UIKit.clear(_list)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 16)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(grid)
	var count := 0
	for rid in DB.recipes:
		var r: Dictionary = DB.recipes[rid]
		if str(r.get("category", "survival")) != _current:
			continue
		if _is_hidden(r):
			continue
		var card := _make_card(str(rid), r)
		grid.add_child(card)
		count += 1
		if focused_recipe == str(rid):
			_focus_recipe.call_deferred(str(rid))
	if count == 0:
		_list.add_child(UIKit.wrap_label("Nothing to craft here yet. Explore the forest for new ideas!", "DimLabel", 1100))


func _focus_recipe(rid: String) -> void:
	if not is_inside_tree() or _closing:
		return
	for b in _list.find_children("*", "Button", true, false):
		if (b as Button).get_meta("recipe_id", "") == rid and (b as Button).is_inside_tree():
			if (b as Button).disabled:
				_focus_first()
			else:
				(b as Button).grab_focus()
			return
	_focus_first()


func _is_hidden(r: Dictionary) -> bool:
	if not bool(r.get("once", false)):
		return false
	var result := str(r.get("result", ""))
	if result == "map":
		return bool(GameState.flags.get("has_map", false))
	if bool(GameState.flags.get("has_" + result, false)):
		return true
	return Crafting.available(result, GameState.crafting_sources()) > 0


func _make_card(rid: String, r: Dictionary) -> PanelContainer:
	var result := str(r.get("result", rid))
	var costs: Dictionary = r.get("costs", {})
	var affordable := GameState.can_afford(costs)
	var card := PanelContainer.new()
	card.theme_type_variation = "CardPanel"
	card.custom_minimum_size = Vector2(586, 0)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if affordable:
		var sb := (ThemeFactory.get_theme().get_stylebox("panel", "CardPanel") as StyleBoxFlat).duplicate() as StyleBoxFlat
		sb.border_color = Color(ThemeFactory.AMBER.r, ThemeFactory.AMBER.g, ThemeFactory.AMBER.b, 0.45)
		card.add_theme_stylebox_override("panel", sb)
	var outer := UIKit.vbox(10)
	card.add_child(outer)
	var row := UIKit.hbox(16)
	outer.add_child(row)
	var icon_box := PanelContainer.new()
	icon_box.add_theme_stylebox_override("panel", ThemeFactory.flat(Color(0, 0, 0, 0.3), 16, 6))
	icon_box.add_child(UIKit.icon_rect(result, 80))
	icon_box.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(icon_box)
	var col := UIKit.vbox(4)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var n := int(r.get("count", 1))
	var title := DB.item_name(result) + ("  x%d" % n if n > 1 else "")
	var tl := UIKit.label(title, "", 30)
	tl.add_theme_font_override("font", ThemeFactory.font("display"))
	col.add_child(tl)
	var desc := UIKit.wrap_label(str(r.get("desc", DB.item(result).get("desc", ""))), "DimLabel", 420)
	col.add_child(desc)
	# Bottom row: cost chips (have/need) and the Craft button.
	var bottom := UIKit.hbox(12)
	outer.add_child(bottom)
	var chips := HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 8)
	chips.add_theme_constant_override("v_separation", 8)
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chips.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(chips)
	var sources := GameState.crafting_sources()
	for id in costs:
		var need := int(costs[id])
		var have := GameState.coins if id == "coins" else Crafting.available(str(id), sources)
		chips.add_child(_cost_chip(str(id), have, need))
	var btn := UIKit.button("Craft", "PrimaryButton", "", 150)
	btn.disabled = not affordable
	btn.size_flags_vertical = Control.SIZE_SHRINK_END
	btn.set_meta("recipe_id", rid)
	btn.tooltip_text = "" if affordable else "You need more materials"
	btn.pressed.connect(func() -> void: craft(rid))
	bottom.add_child(btn)
	card.set_meta("craft_button", btn)
	return card


func _cost_chip(id: String, have: int, need: int) -> PanelContainer:
	var ok := have >= need
	var chip := PanelContainer.new()
	chip.theme_type_variation = "ChipPanel"
	var c := ThemeFactory.ok_color(ok)
	var sb := ThemeFactory.flat(Color(c.r * 0.25, c.g * 0.25, c.b * 0.25, 0.75), 12)
	sb.set_border_width_all(2)
	sb.border_color = Color(c.r, c.g, c.b, 0.65)
	sb.content_margin_left = 6
	sb.content_margin_right = 10
	sb.content_margin_top = 3
	sb.content_margin_bottom = 3
	chip.add_theme_stylebox_override("panel", sb)
	chip.tooltip_text = DB.item_name(id)
	var h := UIKit.hbox(6)
	h.add_child(UIKit.icon_rect(id if id != "coins" else "ui_coin", 38))
	var l := UIKit.label("%d/%d" % [mini(have, 999), need], "", 22, c.lerp(Color.WHITE, 0.25))
	l.add_theme_font_override("font", ThemeFactory.font("display"))
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(l)
	h.add_child(UIKit.icon_rect("ui_check" if ok else "ui_cross", 24))
	chip.add_child(h)
	return chip


## Craft one recipe. Public so tests and tools can call it.
func craft(rid: String) -> bool:
	var r := DB.recipe(rid)
	if r.is_empty():
		return false
	var costs: Dictionary = r.get("costs", {})
	if not GameState.pay(costs):
		Audio.play_ui("deny")
		Events.notify.emit("Not enough materials yet.", "bad")
		return false
	var result := str(r.get("result", rid))
	var n := int(r.get("count", 1))
	var left := GameState.give(result, n)
	if left > 0:
		var left2 := GameState.storage.add(result, left)
		if left2 > 0:
			var p := GameState.player
			if p and is_instance_valid(p):
				Pickup.spawn(result, left2, p.global_position + Vector3(0, 0.8, 0))
			Events.notify.emit("No room anywhere: %s dropped at your feet." % DB.item_name(result), "warn")
		else:
			Events.notify.emit("Your sack is full: %s went to the Camp Box." % DB.item_name(result), "info")
	Events.item_crafted.emit(result, n)
	GameState.stat_add("items_crafted")
	Audio.play_ui("craft")
	Events.notify.emit("Crafted %s%s!" % [DB.item_name(result), " x%d" % n if n > 1 else ""], "good")
	if bool(r.get("once", false)) and result != "map":
		GameState.flags["has_" + result] = true
	_refresh()
	return true


func _show_camp_tab() -> void:
	_scroll.visible = false
	if _camp_tab == null:
		var scr: Variant = load(CAMP_TAB_SCRIPT)
		if scr is GDScript:
			var inst: Variant = (scr as GDScript).new()
			if inst is Control:
				_camp_tab = inst as Control
				_camp_tab.size_flags_vertical = Control.SIZE_EXPAND_FILL
				body.add_child(_camp_tab)
				body.move_child(_camp_tab, _scroll.get_index())
	if _camp_tab:
		_camp_tab.visible = true
		if _camp_tab.has_method("refresh"):
			_camp_tab.call("refresh")
