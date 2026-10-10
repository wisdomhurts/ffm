class_name ToastFeed
extends Control
## Right-side notifications (Events.notify), the lower-right pickup feed
## ("+3 Wood" with icon, merging repeats) and sound captions (Events.caption,
## only when the "sound_captions" setting is on).

const MAX_TOASTS := 5
const MAX_PICKUPS := 5

var _toasts: Array = []     # [{node, life, kind}]
var _pickups: Array = []    # [{node, id, count, life, label}]
var _captions: Array = []   # [{node, life}]
var _toast_box: VBoxContainer
var _pickup_box: VBoxContainer
var _caption_box: VBoxContainer
var hotbar: Hotbar
## Touch layout: the right side belongs to the touch buttons, so toasts go
## under the survival bars (top_left_y) and the pickup feed to the left.
var touch_layout := false
var top_left_y := 214.0
## Touch layout: the pickup feed sits right-aligned above the touch buttons.
var pickup_bottom_y := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_box = UIKit.vbox(10)
	add_child(_toast_box)
	_pickup_box = UIKit.vbox(8)
	_pickup_box.alignment = BoxContainer.ALIGNMENT_END
	add_child(_pickup_box)
	_caption_box = UIKit.vbox(6)
	_caption_box.alignment = BoxContainer.ALIGNMENT_END
	add_child(_caption_box)
	Events.notify.connect(toast)
	Events.item_picked_up.connect(pickup)
	Events.caption.connect(caption)
	Events.coins_changed.connect(func(_total: int, delta: int) -> void:
		if delta > 0:
			pickup("coins", delta))


func toast(text: String, kind: String = "info") -> void:
	if text == "":
		return
	# Merge identical toasts that are still visible.
	for e in _toasts:
		if str(e["text"]) == text and float(e["life"]) > 0.5:
			e["life"] = maxf(float(e["life"]), 3.0)
			(e["node"] as Control).pivot_offset = (e["node"] as Control).size * 0.5
			var tw := (e["node"] as Control).create_tween()
			tw.tween_property(e["node"], "scale", Vector2(1.06, 1.06), 0.08)
			tw.tween_property(e["node"], "scale", Vector2.ONE, 0.12)
			return
	var col := ThemeFactory.toast_color(kind)
	var panel := PanelContainer.new()
	var sb := ThemeFactory.panel_style(16, 0.95)
	sb.border_color = Color(col.r, col.g, col.b, 0.55)
	sb.border_width_left = 6
	sb.content_margin_left = 14
	sb.content_margin_right = 20
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(12)
	row.add_child(UIKit.icon_rect(ThemeFactory.toast_icon(kind), 38))
	var l := UIKit.label(text, "")
	l.add_theme_font_size_override("font_size", 23)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = 0
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if kind == "bad":
		l.add_theme_color_override("font_color", Color("ffd7cc"))
	elif kind == "loot":
		l.add_theme_color_override("font_color", Color("ffe7a8"))
	row.add_child(l)
	panel.add_child(row)
	panel.custom_minimum_size.x = 430
	_toast_box.add_child(panel)
	panel.modulate.a = 0.0
	var life := 4.6 if kind in ["bad", "warn"] else 3.6
	_toasts.append({"node": panel, "life": life, "text": text, "slide": 1.0})
	while _toasts.size() > MAX_TOASTS:
		var old: Dictionary = _toasts.pop_front()
		(old["node"] as Node).queue_free()


func pickup(id: String, count: int) -> void:
	if id == "" or count == 0:
		return
	for e in _pickups:
		if str(e["id"]) == id and float(e["life"]) > 0.3:
			e["count"] = int(e["count"]) + count
			e["life"] = 2.8
			(e["label"] as Label).text = "+%d %s" % [int(e["count"]), DB.item_name(id)]
			var n := e["node"] as Control
			n.pivot_offset = Vector2(n.size.x, n.size.y * 0.5)
			var tw := n.create_tween()
			tw.tween_property(n, "scale", Vector2(1.12, 1.12), 0.07)
			tw.tween_property(n, "scale", Vector2.ONE, 0.15)
			return
	var panel := PanelContainer.new()
	var sb := ThemeFactory.flat(Color(0.03, 0.06, 0.04, 0.72 if not ThemeFactory.high_contrast() else 0.95), 26)
	sb.content_margin_left = 10
	sb.content_margin_right = 18
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := UIKit.hbox(10)
	row.add_child(UIKit.icon_rect(id if ThemeFactory.icon(id) else "ui_star", 44))
	var l := UIKit.label("+%d %s" % [count, DB.item_name(id)], "HudLabel")
	l.add_theme_font_size_override("font_size", 25)
	l.add_theme_color_override("font_color", ThemeFactory.GOLD if id == "coins" else Color("f4ffe6"))
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(l)
	panel.add_child(row)
	panel.size_flags_horizontal = Control.SIZE_SHRINK_END
	_pickup_box.add_child(panel)
	panel.modulate.a = 0.0
	_pickups.append({"node": panel, "id": id, "count": count, "life": 2.8, "label": l})
	while _pickups.size() > MAX_PICKUPS:
		var old: Dictionary = _pickups.pop_front()
		(old["node"] as Node).queue_free()


func caption(text: String) -> void:
	if not bool(Settings.get_value("sound_captions")) or text == "":
		return
	for e in _captions:
		if str(e["text"]) == text:
			e["life"] = 3.0
			return
	var panel := PanelContainer.new()
	var sb := ThemeFactory.flat(Color(0, 0, 0, 0.72), 10)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 4
	sb.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", sb)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UIKit.label(text, "")
	l.add_theme_font_size_override("font_size", 25)
	l.add_theme_color_override("font_color", Color("fff3c8"))
	panel.add_child(l)
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_caption_box.add_child(panel)
	_captions.append({"node": panel, "life": 3.0, "text": text})
	while _captions.size() > 3:
		var old: Dictionary = _captions.pop_front()
		(old["node"] as Node).queue_free()


func _process(delta: float) -> void:
	var vp := get_parent_area_size()
	var pb := _pickup_box.get_combined_minimum_size()
	_pickup_box.size = Vector2(maxf(pb.x, 10.0), pb.y)
	if touch_layout:
		_toast_box.position = Vector2(26.0, top_left_y)
		_toast_box.size = Vector2(430, 0)
		var pby := pickup_bottom_y if pickup_bottom_y > 0.0 else vp.y - 150.0
		_pickup_box.position = Vector2(vp.x - _pickup_box.size.x - 30.0, pby - pb.y)
	else:
		_toast_box.position = Vector2(vp.x - 456.0, 214.0)
		_toast_box.size = Vector2(430, 0)
		_pickup_box.position = Vector2(vp.x - _pickup_box.size.x - 30.0, vp.y - 150.0 - pb.y)
	var cb := _caption_box.get_combined_minimum_size()
	_caption_box.size = Vector2(1200, cb.y)
	var top := hotbar.top_y() if hotbar else vp.y - 150.0
	_caption_box.position = Vector2(vp.x * 0.5 - 600.0, top - 190.0 - cb.y)
	_tick(_toasts, delta, true)
	_tick(_pickups, delta, false)
	_tick(_captions, delta, false)


func _tick(list: Array, delta: float, slide: bool) -> void:
	for i in range(list.size() - 1, -1, -1):
		var e: Dictionary = list[i]
		var n := e["node"] as Control
		if not is_instance_valid(n):
			list.remove_at(i)
			continue
		e["life"] = float(e["life"]) - delta
		var life := float(e["life"])
		var a := clampf(life / 0.5, 0.0, 1.0)
		n.modulate.a = minf(move_toward(n.modulate.a, 1.0, delta * 6.0), a)
		if slide and e.has("slide"):
			e["slide"] = maxf(float(e["slide"]) - delta * 5.0, 0.0)
			var s := float(e["slide"])
			n.position.x = s * s * 80.0
		if life <= 0.0:
			n.queue_free()
			list.remove_at(i)
