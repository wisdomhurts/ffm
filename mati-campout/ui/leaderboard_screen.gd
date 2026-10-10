class_name LeaderboardScreen
extends UIModal
## "Local Leaderboard (this computer)": the top 10 runs stored in the player
## profile plus lifetime statistics. Never implies scores are online.

const MEDALS := [Color("ffd166"), Color("d9e2ec"), Color("e0a36a")]

var highlight_rank := 0


func _ready() -> void:
	build_frame("Local Leaderboard (this computer)", Vector2(1240, 820), "ui_trophy", 0.6)
	var sub := UIKit.label("Your best campouts on this computer. Scores are saved here only, never online.", "DimLabel")
	body.add_child(sub)
	var table := PanelContainer.new()
	table.theme_type_variation = "CardPanel"
	table.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(table)
	var rows := UIKit.vbox(4)
	table.add_child(rows)
	var entries: Array = Profile.leaderboard.top(10)
	rows.add_child(_row(["#", "Camper", "Nights", "Enemies", "Trees", "Date"], true, 0))
	var sep := HSeparator.new()
	rows.add_child(sep)
	if entries.is_empty():
		var empty := UIKit.vbox(10)
		empty.alignment = BoxContainer.ALIGNMENT_CENTER
		empty.size_flags_vertical = Control.SIZE_EXPAND_FILL
		var ic := UIKit.icon_rect("ui_fire", 96)
		ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		empty.add_child(ic)
		var l := UIKit.label("No campouts yet. Light the fire and survive your first night!", "", 28)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.add_child(l)
		rows.add_child(empty)
	else:
		for i in entries.size():
			var e: Dictionary = entries[i]
			var st: Dictionary = e.get("stats", {})
			var date := str(e.get("date", "")).substr(0, 10)
			rows.add_child(_row([str(i + 1), str(e.get("name", "Camper")), str(int(e.get("nights", 0))),
				str(int(st.get("enemies_defeated", 0))), str(int(st.get("trees_chopped", 0))), date], false, i + 1))
	# Lifetime stats
	var lt := Profile.lifetime
	body.add_child(UIKit.label("Lifetime", "SubHeaderLabel"))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 10)
	body.add_child(grid)
	var items := [
		["ui_tent", "Campouts", str(int(lt.get("runs", 0)))],
		["ui_moon", "Nights survived", str(int(lt.get("nights", 0)))],
		["wood", "Trees chopped", str(int(lt.get("trees_chopped", 0)))],
		["ui_paw", "Enemies defeated", str(int(lt.get("enemies_defeated", 0)))],
		["ui_chest", "Chests found", str(int(lt.get("chests_opened", 0)))],
		["ui_boot", "Distance walked", UIKit.distance_text(float(lt.get("distance", 0.0)))],
		["ui_trophy", "Bosses defeated", str(int(lt.get("bosses_defeated", 0)))],
		["bone", "Wolves befriended", str(int(lt.get("wolves_tamed", 0)))],
	]
	for it in items:
		grid.add_child(_stat_chip(str(it[0]), str(it[1]), str(it[2])))
	var foot := UIKit.hbox(0)
	foot.alignment = BoxContainer.ALIGNMENT_END
	var back := UIKit.button("Back", "PrimaryButton", "", 220)
	back.pressed.connect(close)
	foot.add_child(back)
	body.add_child(foot)
	back.grab_focus.call_deferred()


func _row(cells: Array, header: bool, rank: int) -> Control:
	var panel := PanelContainer.new()
	var bg := Color(0, 0, 0, 0)
	if rank > 0 and rank == highlight_rank:
		bg = Color(1.0, 0.7, 0.3, 0.22)
	elif rank > 0 and rank % 2 == 0:
		bg = Color(1, 1, 1, 0.035)
	var sb := ThemeFactory.flat(bg, 10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := UIKit.hbox(10)
	panel.add_child(h)
	var widths := [90, 360, 150, 150, 150, 200]
	for i in cells.size():
		var c := Control.new()
		c.custom_minimum_size = Vector2(widths[i], 40)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if i == 0 and not header and rank <= 3:
			var icon := UIKit.icon_rect("ui_trophy" if rank == 1 else "ui_star", 36)
			icon.modulate = MEDALS[rank - 1]
			icon.position = Vector2(0, 2)
			c.add_child(icon)
		var l := UIKit.label(str(cells[i]), "SmallLabel" if header else "", 0)
		if not header:
			l.add_theme_font_size_override("font_size", 26)
			if i == 2:
				l.add_theme_font_override("font", ThemeFactory.font("display"))
				l.add_theme_color_override("font_color", ThemeFactory.GOLD)
		l.position = Vector2(44 if (i == 0 and not header and rank <= 3) else 0, 4)
		l.size = Vector2(widths[i], 36)
		c.add_child(l)
		h.add_child(c)
	return panel


func _stat_chip(icon_id: String, label: String, value: String) -> Control:
	var p := PanelContainer.new()
	p.theme_type_variation = "CardPanel"
	p.custom_minimum_size = Vector2(278, 0)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var h := UIKit.hbox(12)
	h.add_child(UIKit.icon_rect(icon_id, 46))
	var v := UIKit.vbox(0)
	var val := UIKit.label(value, "", 28)
	val.add_theme_font_override("font", ThemeFactory.font("display"))
	v.add_child(val)
	v.add_child(UIKit.label(label, "SmallLabel"))
	h.add_child(v)
	p.add_child(h)
	return p
