class_name HowToPlay
extends UIModal
## Kid-friendly explanation of the core loop plus the controls.

const STEPS := [
	["ui_fire", "Keep the campfire burning", "Walk up to the fire and press %s to add Wood or Coal."],
	["rusty_axe", "Chop trees for wood", "In the daytime, swing your axe at trees. Pick up the logs they drop."],
	["ui_moon", "Stay in the light at night", "Monsters come out in the dark but they are afraid of firelight."],
	["ui_warmth", "Stay warm", "Nights are cold. Stand near the fire or rest in your tent."],
	["ui_hunger", "Eat when you are hungry", "Berries and mushrooms are snacks. Cook meat on the rack for a real meal."],
	["kindling", "If the fire goes out...", "Relight it with Kindling + Wood. Keep some kindling in your Camp Box!"],
	["ui_star", "Survive as many nights as you can", "Every sunrise is a win. Can you beat your best?"],
]

const CONTROLS := [
	["move_forward", "WASD", "Move"],
	["sprint", "", "Run"],
	["jump", "", "Jump"],
	["use", "", "Use item (chop, swing, eat)"],
	["interact", "", "Interact (fire, chests, crate)"],
	["", "1-7", "Pick an item"],
	["toggle_sack", "", "Open / close sack rows"],
	["map", "", "Map"],
	["build", "", "Build"],
	["flashlight", "", "Flashlight"],
	["pause", "", "Pause"],
]


func _ready() -> void:
	build_frame("How to Play", Vector2(1300, 760), "ui_info")
	var cols := UIKit.hbox(30)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(cols)
	# The loop
	var left := UIKit.vbox(12)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_stretch_ratio = 1.5
	cols.add_child(left)
	left.add_child(UIKit.label("How to survive", "SubHeaderLabel"))
	for s in STEPS:
		var row := UIKit.hbox(14)
		row.add_child(UIKit.icon_rect(str(s[0]), 56))
		var v := UIKit.vbox(0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var t := UIKit.label(str(s[1]), "", 25)
		t.add_theme_font_override("font", ThemeFactory.font("display"))
		v.add_child(t)
		var d := str(s[2])
		if "%s" in d:
			d = d % Controls.prompt("interact")
		v.add_child(UIKit.wrap_label(d, "DimLabel", 560))
		row.add_child(v)
		left.add_child(row)
	cols.add_child(VSeparator.new())
	# Controls
	var right := UIKit.vbox(10)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(right)
	right.add_child(UIKit.label("Controls", "SubHeaderLabel"))
	for c in CONTROLS:
		var row2 := UIKit.hbox(14)
		var cap_box := UIKit.hbox(0)
		cap_box.custom_minimum_size.x = 170
		cap_box.alignment = BoxContainer.ALIGNMENT_END
		var action := str(c[0])
		var fixed := str(c[1])
		if action == "move_forward" and Controls.using_gamepad:
			fixed = "Left Stick"
		cap_box.add_child(KeyCap.new(action, fixed, 38))
		row2.add_child(cap_box)
		var l := UIKit.label(str(c[2]), "", 23)
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row2.add_child(l)
		right.add_child(row2)
	var ok := UIKit.button("Got it!", "PrimaryButton", "", 260)
	ok.pressed.connect(close)
	var r := UIKit.hbox(0)
	r.alignment = BoxContainer.ALIGNMENT_END
	r.add_child(ok)
	body.add_child(r)
	ok.grab_focus.call_deferred()
