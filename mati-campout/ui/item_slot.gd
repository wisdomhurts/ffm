class_name ItemSlot
extends Control
## One inventory slot: rounded tile with the item icon, stack count,
## optional number-key label and charge bar. Supports click, keyboard /
## controller activation and drag-and-drop between slots.
##
## The owner connects `activated(slot)` and `dropped(from_inv, from_index, slot)`.

signal activated(slot: ItemSlot)
signal dropped(from_inv: Inventory, from_index: int, slot: ItemSlot)

var inv: Inventory = null
var index: int = 0
var key_label: String = ""
var selected := false
var interactive := true
var tile_size := 88.0
var hover := false
var _pop := 0.0
var _flash := 0.0
var _sel_anim := 0.0


func _init(p_inv: Inventory = null, p_index: int = 0, p_size: float = 88.0) -> void:
	inv = p_inv
	index = p_index
	tile_size = p_size
	custom_minimum_size = Vector2(p_size, p_size)
	focus_mode = Control.FOCUS_ALL
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_entered.connect(func() -> void:
		hover = true
		queue_redraw())
	mouse_exited.connect(func() -> void:
		hover = false
		queue_redraw())
	focus_entered.connect(queue_redraw)
	focus_exited.connect(queue_redraw)


func slot_data() -> Variant:
	if inv == null:
		return null
	return inv.get_slot(index)


func item_id() -> String:
	return inv.slot_id(index) if inv else ""


func pop() -> void:
	_pop = 1.0


func flash() -> void:
	_flash = 1.0


func _process(delta: float) -> void:
	var target := 1.0 if selected else 0.0
	var changed := false
	if absf(_sel_anim - target) > 0.001:
		_sel_anim = move_toward(_sel_anim, target, delta * 6.0)
		changed = true
	if _pop > 0.0:
		_pop = maxf(_pop - delta * 3.5, 0.0)
		changed = true
	if _flash > 0.0:
		_flash = maxf(_flash - delta * 2.5, 0.0)
		changed = true
	if selected:
		changed = true
	if changed:
		queue_redraw()


func _draw() -> void:
	var s := size
	var t := Time.get_ticks_msec() / 1000.0
	var lift := _sel_anim * 6.0
	var grow := 1.0 + _sel_anim * 0.06 + sin(_pop * PI) * 0.12
	var rect := Rect2(Vector2.ZERO, s)
	var center := s * 0.5 - Vector2(0, lift)
	var rs := s * grow
	var r := Rect2(center - rs * 0.5, rs)
	var hc := ThemeFactory.high_contrast()
	# Selected glow
	if _sel_anim > 0.01:
		var g := ThemeFactory.glow_texture()
		var gs := rs * 1.65
		var pulse := 0.85 + 0.15 * sin(t * 3.0)
		draw_texture_rect(g, Rect2(center - gs * 0.5, gs), false, Color(1.0, 0.7, 0.3, 0.55 * _sel_anim * pulse))
	# Tile
	var sb := StyleBoxFlat.new()
	sb.set_corner_radius_all(int(16 * grow))
	sb.corner_detail = 8
	sb.anti_aliasing = true
	var base := Color(0.05, 0.09, 0.07, 0.94 if hc else 0.72)
	if hover or has_focus():
		base = Color(0.12, 0.19, 0.14, 0.9)
	sb.bg_color = base.lerp(Color(0.24, 0.17, 0.08, 0.92), _sel_anim * 0.6)
	sb.set_border_width_all(2 if _sel_anim < 0.5 else 4)
	var border := Color(1, 0.85, 0.6, 0.16 if not hc else 0.5)
	if has_focus() or hover:
		border = Color(1, 0.85, 0.6, 0.5)
	sb.border_color = border.lerp(ThemeFactory.AMBER, _sel_anim)
	if _flash > 0.0:
		sb.border_color = sb.border_color.lerp(ThemeFactory.DANGER, _flash)
		sb.bg_color = sb.bg_color.lerp(Color(0.5, 0.08, 0.05, 0.9), _flash * 0.6)
	sb.shadow_color = Color(0, 0, 0, 0.35)
	sb.shadow_size = 6
	sb.shadow_offset = Vector2(0, 3)
	draw_style_box(sb, r)
	# Inner top sheen
	var sheen := StyleBoxFlat.new()
	sheen.set_corner_radius_all(int(13 * grow))
	sheen.corner_detail = 6
	sheen.anti_aliasing = true
	sheen.bg_color = Color(1, 1, 1, 0.045)
	draw_style_box(sheen, Rect2(r.position + Vector2(4, 4), Vector2(r.size.x - 8, r.size.y * 0.42)))
	var data: Variant = slot_data()
	if data != null:
		var id := str(data["id"])
		var tex := ThemeFactory.icon(id)
		var isz := rs * 0.74
		var ipos := center - isz * 0.5 - Vector2(0, 2)
		if tex:
			draw_texture_rect(tex, Rect2(ipos, isz), false)
		else:
			var f0 := ThemeFactory.font("display")
			draw_string(f0, ipos + Vector2(0, isz.y * 0.6), DB.item_name(id).substr(0, 3), HORIZONTAL_ALIGNMENT_CENTER, isz.x, 22, ThemeFactory.text_color())
		var count := int(data["count"])
		if count > 1:
			var f := ThemeFactory.font("display_bold")
			var fs := int(tile_size * 0.27)
			var txt := str(count)
			var tsz := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
			var p := r.position + r.size - Vector2(tsz.x + 8, 8)
			draw_string_outline(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0.04, 0.03, 0.02, 0.95))
			draw_string(f, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("fff6e0"))
		var meta: Dictionary = data.get("meta", {})
		if meta.has("charge"):
			var cmax := float(DB.item(id).get("charge_max", 100.0))
			var frac := clampf(float(meta["charge"]) / maxf(cmax, 1.0), 0.0, 1.0)
			var bar := Rect2(r.position + Vector2(10, r.size.y - 12), Vector2(r.size.x - 20, 6))
			draw_rect(bar, Color(0, 0, 0, 0.6))
			draw_rect(Rect2(bar.position, Vector2(bar.size.x * frac, bar.size.y)), Color("ffd166") if frac > 0.25 else ThemeFactory.BAD)
	if key_label != "":
		var f2 := ThemeFactory.font("display")
		var fs2 := int(tile_size * 0.2)
		var kp := r.position + Vector2(9, fs2 + 4)
		var col := Color(1, 0.9, 0.7, 0.95) if _sel_anim > 0.5 else Color(1, 1, 1, 0.55)
		draw_string_outline(f2, kp, key_label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs2, 5, Color(0, 0, 0, 0.7))
		draw_string(f2, kp, key_label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs2, col)
	if has_focus() and not selected:
		var fsb := ThemeFactory.focus_style(16)
		draw_style_box(fsb, rect)


func _gui_input(event: InputEvent) -> void:
	if not interactive:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and not event.double_click:
		activated.emit(self)
		accept_event()
	elif event.is_action_pressed("ui_accept"):
		activated.emit(self)
		accept_event()


func _get_tooltip(_at: Vector2) -> String:
	var id := item_id()
	if id == "":
		return ""
	return "%s\n%s" % [DB.item_name(id), str(DB.item(id).get("desc", ""))]


func _get_drag_data(_at: Vector2) -> Variant:
	if not interactive or slot_data() == null:
		return null
	var preview := TextureRect.new()
	preview.texture = ThemeFactory.icon(item_id())
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.size = Vector2(tile_size, tile_size) * 0.8
	preview.position = -preview.size * 0.5
	preview.modulate = Color(1, 1, 1, 0.85)
	var holder := Control.new()
	holder.add_child(preview)
	set_drag_preview(holder)
	return {"campout_slot": true, "inv": inv, "index": index}


func _can_drop_data(_at: Vector2, data: Variant) -> bool:
	return interactive and data is Dictionary and (data as Dictionary).has("campout_slot")


func _drop_data(_at: Vector2, data: Variant) -> void:
	var d := data as Dictionary
	var from_inv: Inventory = d.get("inv")
	dropped.emit(from_inv, int(d.get("index", -1)), self)
