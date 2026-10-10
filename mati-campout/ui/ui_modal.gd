class_name UIModal
extends Control
## Base class for full-screen modal windows (crafting, storage, pause,
## settings, leaderboard, and later trade/map/build UIs).
##
## Contract used by the HUD (any Control with these members works):
##   signal closed                       emitted once when the window closes
##   var modal_name: String              set by the opener
##   var pauses_game: bool               true = HUD pauses the tree while open
##   func open(args: Dictionary) -> void called right after it enters the tree
## Esc / B (and any extra `close_actions`) close the top-most modal.
##
## Small screens (phones): build_frame() caps the panel to the space
## available (so scroll areas inside shrink) and _fit_to_screen() scales the
## whole window down if its content still does not fit. avail_size() tells
## subclasses how much room there is. In touch mode the header shows a big
## close button instead of the Esc key hint.

signal closed()

## Topmost-last stack of open modals (only the top one handles input).
static var stack: Array = []

var modal_name: String = ""
var pauses_game: bool = false
## Input actions that close this window (besides Esc / gamepad B).
var close_actions: Array[String] = []
var dim: ColorRect
var panel: PanelContainer
var body: VBoxContainer
var header: HBoxContainer
var title_label: Label
var _closing := false
var _opened_at := 0
var _fit := 1.0
var _center: CenterContainer = null
const FIT_MARGIN := Vector2(24.0, 16.0)


func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS


func _enter_tree() -> void:
	if not stack.has(self):
		stack.append(self)
	_opened_at = Time.get_ticks_msec()


func _exit_tree() -> void:
	stack.erase(self)


func is_top() -> bool:
	for i in range(stack.size() - 1, -1, -1):
		var m: Variant = stack[i]
		if is_instance_valid(m) and (m as Node).is_inside_tree():
			return m == self
	return false


## Build the standard frame: dimmed backdrop + centred panel with a header
## (icon, title, close hint) and a body VBox to fill.
func build_frame(title: String, panel_size: Vector2, icon_id: String = "", dim_alpha: float = 0.55) -> void:
	dim = ColorRect.new()
	dim.color = Color(0.01, 0.02, 0.03, dim_alpha)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	var cc := CenterContainer.new()
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(cc)
	_center = cc
	panel = PanelContainer.new()
	var avail := avail_size()
	panel.custom_minimum_size = Vector2(minf(panel_size.x, avail.x - FIT_MARGIN.x * 2.0), minf(panel_size.y, avail.y - FIT_MARGIN.y * 2.0))
	var sb := ThemeFactory.panel_style(24, 1.12)
	sb.set_content_margin_all(28)
	sb.shadow_size = 28
	sb.shadow_color = Color(0, 0, 0, 0.5)
	panel.add_theme_stylebox_override("panel", sb)
	cc.add_child(panel)
	var outer := UIKit.vbox(14)
	panel.add_child(outer)
	header = UIKit.hbox(14)
	outer.add_child(header)
	if icon_id != "":
		header.add_child(UIKit.icon_rect(icon_id, 56))
	title_label = UIKit.label(title, "HeaderLabel")
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(title_label)
	var hint := UIKit.hbox(8)
	var touch := Platform.is_touch()
	if not touch:
		hint.add_child(KeyCap.new("pause", "", 34))
		var hl := UIKit.label("Close", "SmallLabel")
		hl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		hint.add_child(hl)
	var close_btn := Button.new()
	close_btn.text = "  X  "
	close_btn.focus_mode = Control.FOCUS_NONE
	close_btn.tooltip_text = "Close"
	close_btn.pressed.connect(close)
	if touch:
		# A thumb-sized close button.
		close_btn.custom_minimum_size = Vector2(84, 64)
		close_btn.add_theme_font_size_override("font_size", 30)
	hint.add_child(close_btn)
	header.add_child(hint)
	var sep := HSeparator.new()
	outer.add_child(sep)
	body = UIKit.vbox(14)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_child(body)
	_animate_in()


## Room for the window: the parent's area (the HUD / title root).
func avail_size() -> Vector2:
	var a := Vector2.ZERO
	if is_inside_tree():
		a = get_parent_area_size()
		if a.x < 2.0 or a.y < 2.0:
			a = get_viewport_rect().size
	if a.x < 2.0 or a.y < 2.0:
		a = Vector2(1920, 1080)
	return a


## Scale factor that makes the panel fit the screen (1 = fits).
func fit_scale() -> float:
	if panel == null:
		return 1.0
	var avail := avail_size() - FIT_MARGIN * 2.0
	var need := panel.get_combined_minimum_size()
	if need.x <= 1.0 or need.y <= 1.0:
		return 1.0
	return clampf(minf(avail.x / need.x, avail.y / need.y), 0.5, 1.0)


func _fit_to_screen() -> void:
	if panel == null or not is_inside_tree():
		return
	_fit = fit_scale()
	var need := panel.get_combined_minimum_size()
	panel.pivot_offset = need * 0.5
	panel.scale = Vector2(_fit, _fit)
	# A CenterContainer grows to fit a panel taller than the screen and then
	# pins it to the top-left: centre it on the screen ourselves.
	if need.y > size.y or need.x > size.x:
		panel.position = (size - need) * 0.5


func _animate_in() -> void:
	if panel == null:
		return
	_fit = fit_scale()
	panel.pivot_offset = panel.custom_minimum_size * 0.5
	panel.modulate.a = 0.0
	panel.scale = Vector2(0.96, 0.96) * _fit
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(panel, "modulate:a", 1.0, 0.18)
	tw.tween_property(panel, "scale", Vector2.ONE * _fit, 0.22)
	if dim:
		var target := dim.color.a
		dim.color.a = 0.0
		tw.tween_property(dim, "color:a", target, 0.2)
	tw.chain().tween_callback(_fit_to_screen)
	_fit_to_screen.call_deferred()
	if not resized.is_connected(_fit_to_screen):
		resized.connect(_fit_to_screen)
	# Wrapped labels settle their height a frame later: refit then too.
	panel.minimum_size_changed.connect(_queue_fit)
	if _center:
		_center.sort_children.connect(_fit_to_screen)


var _fit_queued := false


func _queue_fit() -> void:
	if _fit_queued:
		return
	_fit_queued = true
	(func() -> void:
		_fit_queued = false
		_fit_to_screen()).call_deferred()


## Override to fill the window. Called by the opener after add_child().
func open(_args: Dictionary) -> void:
	pass


func close() -> void:
	if _closing:
		return
	_closing = true
	Audio.play_ui("ui_close")
	closed.emit()
	queue_free()


func _input(event: InputEvent) -> void:
	if _closing or not is_visible_in_tree() or not is_top():
		return
	if Time.get_ticks_msec() - _opened_at < 100:
		return
	if event.is_echo() or not event.is_pressed():
		return
	var actions: Array[String] = ["pause", "ui_cancel"]
	actions.append_array(close_actions)
	for a in actions:
		if InputMap.has_action(a) and event.is_action_pressed(a):
			# A focused OptionButton popup handles its own cancel.
			get_viewport().set_input_as_handled()
			close()
			return
	# LB / RB switch tabs (gamepad only: the mouse wheel must keep scrolling).
	if event is InputEventJoypadButton:
		if event.is_action_pressed("prev_item"):
			_on_tab_cycle(-1)
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("next_item"):
			_on_tab_cycle(1)
			get_viewport().set_input_as_handled()


## Override in windows with tabs (LB / RB, mouse wheel switch tabs).
func _on_tab_cycle(_dir: int) -> void:
	pass


## Focus the first focusable control under `n` (controller navigation).
static func focus_first(n: Node) -> bool:
	if n is Control:
		var c := n as Control
		if c.focus_mode != Control.FOCUS_NONE and c.is_visible_in_tree() and not (c is BaseButton and (c as BaseButton).disabled):
			c.grab_focus()
			return true
	for ch in n.get_children():
		if focus_first(ch):
			return true
	return false


## A simple yes/no confirmation shown on top of another modal.
static func confirm(parent: Node, title: String, message: String, yes_text: String, on_yes: Callable) -> UIModal:
	var m := UIModal.new()
	m.modal_name = "confirm"
	parent.add_child(m)
	m.build_frame(title, Vector2(620, 0), "ui_warn", 0.45)
	var msg := UIKit.wrap_label(message, "", 560)
	m.body.add_child(msg)
	m.body.add_child(UIKit.spacer(10))
	var row := UIKit.hbox(16)
	row.alignment = BoxContainer.ALIGNMENT_END
	var no := UIKit.button("Cancel", "", "", 180)
	no.pressed.connect(m.close)
	var yes := UIKit.button(yes_text, "PrimaryButton", "", 220)
	yes.pressed.connect(func() -> void:
		m.close()
		on_yes.call())
	row.add_child(no)
	row.add_child(yes)
	m.body.add_child(row)
	no.grab_focus.call_deferred()
	return m
