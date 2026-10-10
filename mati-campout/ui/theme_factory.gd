class_name ThemeFactory
extends RefCounted
## Builds the game's UI Theme in code, plus the shared palette, fonts and a
## few procedurally drawn textures (toggle switch, slider knob, arrows).
##
## Everything visual in the UI reads colours from here so the accessibility
## settings (high contrast, colour-blind palettes) apply everywhere:
##   ThemeFactory.get_theme()          cached Theme for the current settings
##   ThemeFactory.font("display")      Fredoka (titles, numbers) / "body" Nunito
##   ThemeFactory.bar_colors("health") fill colours for survival bars
##   ThemeFactory.panel_style()        the standard translucent forest panel
## Call ThemeFactory.invalidate() after a setting change, then re-apply.

# --- Palette (ART_DIRECTION.md) ------------------------------------------------
const FOREST := Color("0e1a14")
const FOREST_LIGHT := Color("1c3326")
const DEEP := Color("1f3b2a")
const MOSS := Color("6f8f4e")
const SAGE := Color("9caf88")
const AMBER := Color("ffb347")
const GOLD := Color("ffd166")
const ORANGE := Color("e8892b")
const EARTH := Color("6b4a2f")
const INDIGO := Color("232a5c")
const MOON := Color("5f7fbf")
const VIOLET := Color("6c5a8e")
const CREAM := Color("f7ecd4")
const CREAM_DIM := Color("cdbf9e")
const INK := Color("120d0a")
const GOOD := Color("8fd17a")
const BAD := Color("ff6b4a")
const DANGER := Color("ff4a2a")
const INFO := Color("9db8f0")

const FONT_FILES := {
	"display": "res://assets/fonts/fredoka-latin-600-normal.woff2",
	"display_bold": "res://assets/fonts/fredoka-latin-700-normal.woff2",
	"display_medium": "res://assets/fonts/fredoka-latin-500-normal.woff2",
	"body": "res://assets/fonts/nunito-latin-700-normal.woff2",
	"body_regular": "res://assets/fonts/nunito-latin-600-normal.woff2",
	"body_bold": "res://assets/fonts/nunito-latin-800-normal.woff2",
}

static var _fonts: Dictionary = {}
static var _theme: Theme = null
static var _theme_key: String = ""
static var _tex_cache: Dictionary = {}


# --- Settings shortcuts ----------------------------------------------------------

static func high_contrast() -> bool:
	return bool(Settings.get_value("high_contrast"))


static func colorblind() -> String:
	return str(Settings.get_value("colorblind_mode"))


static func reduce_flashing() -> bool:
	return bool(Settings.get_value("reduce_flashing"))


static func ui_scale() -> float:
	return clampf(float(Settings.get_value("ui_scale")), 0.7, 1.6)


# --- Fonts -----------------------------------------------------------------------

static func font(kind: String = "body") -> Font:
	if _fonts.has(kind):
		return _fonts[kind]
	var f: Font = null
	var path: String = FONT_FILES.get(kind, FONT_FILES["body"])
	if ResourceLoader.exists(path):
		var res: Resource = load(path)
		if res is FontFile:
			var ff := res as FontFile
			ff.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
			ff.hinting = TextServer.HINTING_LIGHT
			ff.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
			ff.generate_mipmaps = true
			f = ff
	if f == null:
		f = ThemeDB.fallback_font
	_fonts[kind] = f
	return f


# --- Colours ---------------------------------------------------------------------

static func text_color() -> Color:
	return Color("fffaf0") if high_contrast() else CREAM


static func text_dim() -> Color:
	return Color("e6dcc4") if high_contrast() else CREAM_DIM


static func panel_color() -> Color:
	if high_contrast():
		return Color(0.03, 0.06, 0.045, 0.97)
	return Color(FOREST.r, FOREST.g, FOREST.b, 0.82)


static func border_color() -> Color:
	if high_contrast():
		return Color(AMBER.r, AMBER.g, AMBER.b, 0.75)
	return Color(1.0, 0.78, 0.52, 0.2)


## Two-colour fill (left -> right) for a survival bar. Colour-blind palettes
## use the Okabe-Ito set; icons and patterns keep the meaning without colour.
static func bar_colors(kind: String) -> Array:
	var cb := colorblind()
	if cb == "deuteranopia" or cb == "protanopia":
		match kind:
			"health":
				return [Color("d55e00"), Color("f08a3c")]
			"hunger":
				return [Color("e69f00"), Color("f5c542")]
			"warmth":
				return [Color("56b4e9"), Color("cc79a7")]
			"fire":
				return [Color("e69f00"), Color("f0e442")]
			"cold":
				return [Color("0072b2"), Color("56b4e9")]
	elif cb == "tritanopia":
		match kind:
			"health":
				return [Color("d0342c"), Color("f2707a")]
			"hunger":
				return [Color("9d6b3a"), Color("d9a26b")]
			"warmth":
				return [Color("009e73"), Color("e86a6a")]
			"fire":
				return [Color("e0482f"), Color("ff9e8a")]
			"cold":
				return [Color("2e8b8b"), Color("8fd6d6")]
	match kind:
		"health":
			return [Color("d93f4c"), Color("ff7a7f")]
		"hunger":
			return [Color("d9822b"), Color("ffc15e")]
		"warmth":
			return [Color("e8642b"), Color("ffb347")]
		"cold":
			return [Color("4f7fd0"), Color("9fd0ff")]
		"fire":
			return [Color("ff7a1f"), Color("ffd166")]
	return [AMBER, GOLD]


static func toast_color(kind: String) -> Color:
	var cb := colorblind()
	match kind:
		"good":
			return Color("56b4e9") if cb in ["deuteranopia", "protanopia"] else Color("8fd17a")
		"warn":
			return AMBER
		"bad":
			return Color("d55e00") if cb != "none" else Color("ff6b4a")
		"loot":
			return GOLD
	return INFO


static func toast_icon(kind: String) -> String:
	match kind:
		"good":
			return "ui_check"
		"warn":
			return "ui_warn"
		"bad":
			return "ui_cross"
		"loot":
			return "ui_star"
	return "ui_info"


## Colour for "have enough" / "missing" cost chips.
static func ok_color(ok: bool) -> Color:
	var cb := colorblind()
	if ok:
		return Color("56b4e9") if cb in ["deuteranopia", "protanopia"] else GOOD
	return Color("e69f00") if cb in ["deuteranopia", "protanopia"] else BAD


# --- Style boxes -------------------------------------------------------------------

static func panel_style(radius: int = 18, alpha_mult: float = 1.0, border: bool = true, shadow: bool = true) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	var c := panel_color()
	c.a *= alpha_mult
	sb.bg_color = c
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 10
	sb.anti_aliasing = true
	if border:
		sb.set_border_width_all(2)
		sb.border_color = border_color()
	if shadow:
		sb.shadow_color = Color(0.0, 0.0, 0.02, 0.38)
		sb.shadow_size = 14
		sb.shadow_offset = Vector2(0, 5)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	return sb


## Shared, read-only panel style for widgets that redraw every frame.
static func cached_panel(radius: int = 18, alpha_mult: float = 1.0) -> StyleBoxFlat:
	var key := "panel_%d_%.2f_%s" % [radius, alpha_mult, high_contrast()]
	if not _tex_cache.has(key):
		_tex_cache[key] = panel_style(radius, alpha_mult)
	return _tex_cache[key]


static func flat(color: Color, radius: int = 12, margins: float = 0.0) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 8
	sb.anti_aliasing = true
	if margins > 0.0:
		sb.set_content_margin_all(margins)
	return sb


static func _button_style(bg: Color, border: Color, bw: int = 2, radius: int = 14) -> StyleBoxFlat:
	var sb := flat(bg, radius)
	sb.set_border_width_all(bw)
	sb.border_color = border
	sb.content_margin_left = 22
	sb.content_margin_right = 22
	sb.content_margin_top = 10
	sb.content_margin_bottom = 12
	return sb


static func focus_style(radius: int = 16) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.draw_center = false
	sb.set_border_width_all(3)
	sb.border_color = Color("ffe1a8") if high_contrast() else AMBER
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 8
	sb.anti_aliasing = true
	sb.set_expand_margin_all(4)
	return sb


# --- Theme -------------------------------------------------------------------------

static func invalidate() -> void:
	_theme = null
	_theme_key = ""


static func get_theme() -> Theme:
	var key := "%s|%s" % [high_contrast(), colorblind()]
	if _theme != null and key == _theme_key:
		return _theme
	_theme = build_theme()
	_theme_key = key
	return _theme


static func build_theme() -> Theme:
	var hc := high_contrast()
	var t := Theme.new()
	var body := font("body")
	var display := font("display")
	t.default_font = body
	t.default_font_size = 24
	var txt := text_color()
	var dim := text_dim()

	# Labels ---------------------------------------------------------------
	t.set_color("font_color", "Label", txt)
	t.set_color("font_shadow_color", "Label", Color(0, 0, 0.02, 0.55))
	t.set_constant("shadow_offset_x", "Label", 0)
	t.set_constant("shadow_offset_y", "Label", 2)
	t.set_color("font_outline_color", "Label", Color(0.03, 0.04, 0.03, 0.9))
	_variation(t, "TitleLabel", "Label", display, 64, txt)
	t.set_constant("outline_size", "TitleLabel", 8)
	_variation(t, "HeaderLabel", "Label", display, 40, txt)
	_variation(t, "SubHeaderLabel", "Label", font("display_medium"), 30, AMBER)
	_variation(t, "DimLabel", "Label", font("body_regular"), 21, dim)
	_variation(t, "SmallLabel", "Label", font("body"), 18, dim)
	_variation(t, "BigNumber", "Label", font("display_bold"), 128, GOLD)
	t.set_constant("outline_size", "BigNumber", 10)
	_variation(t, "HudLabel", "Label", font("display"), 26, txt)
	t.set_constant("outline_size", "HudLabel", 6)
	_variation(t, "HudSmall", "Label", font("body_bold"), 19, dim)
	t.set_constant("outline_size", "HudSmall", 5)

	# Panels ---------------------------------------------------------------
	t.set_stylebox("panel", "PanelContainer", panel_style())
	t.set_stylebox("panel", "Panel", panel_style())
	t.set_type_variation("CardPanel", "PanelContainer")
	var card := flat(Color(0.12, 0.2, 0.15, 0.95) if hc else Color(0.16, 0.25, 0.19, 0.55), 14, 14)
	card.set_border_width_all(2)
	card.border_color = Color(1, 1, 1, 0.08) if not hc else Color(AMBER.r, AMBER.g, AMBER.b, 0.45)
	t.set_stylebox("panel", "CardPanel", card)
	t.set_type_variation("ChipPanel", "PanelContainer")
	var chip := flat(Color(0, 0, 0, 0.35), 10)
	chip.content_margin_left = 8
	chip.content_margin_right = 12
	chip.content_margin_top = 4
	chip.content_margin_bottom = 4
	t.set_stylebox("panel", "ChipPanel", chip)
	t.set_type_variation("ClearPanel", "PanelContainer")
	t.set_stylebox("panel", "ClearPanel", StyleBoxEmpty.new())

	# Buttons --------------------------------------------------------------
	var b_norm := _button_style(Color(0.13, 0.22, 0.16, 0.92), Color(1, 0.8, 0.55, 0.22 if not hc else 0.6))
	var b_hover := _button_style(Color(0.2, 0.31, 0.22, 0.96), Color(AMBER.r, AMBER.g, AMBER.b, 0.85))
	var b_press := _button_style(Color(0.09, 0.15, 0.11, 0.98), AMBER)
	b_press.content_margin_top = 12
	b_press.content_margin_bottom = 10
	var b_dis := _button_style(Color(0.1, 0.13, 0.11, 0.6), Color(1, 1, 1, 0.06))
	for s in ["normal", "normal_mirrored"]:
		t.set_stylebox(s, "Button", b_norm)
	for s in ["hover", "hover_mirrored"]:
		t.set_stylebox(s, "Button", b_hover)
	for s in ["pressed", "pressed_mirrored", "hover_pressed", "hover_pressed_mirrored"]:
		t.set_stylebox(s, "Button", b_press)
	for s in ["disabled", "disabled_mirrored"]:
		t.set_stylebox(s, "Button", b_dis)
	t.set_stylebox("focus", "Button", focus_style())
	t.set_font("font", "Button", font("display_medium"))
	t.set_font_size("font_size", "Button", 28)
	t.set_color("font_color", "Button", txt)
	t.set_color("font_hover_color", "Button", Color("fff4dc"))
	t.set_color("font_focus_color", "Button", Color("fff4dc"))
	t.set_color("font_pressed_color", "Button", AMBER)
	t.set_color("font_hover_pressed_color", "Button", GOLD)
	t.set_color("font_disabled_color", "Button", Color(dim.r, dim.g, dim.b, 0.45))
	t.set_constant("h_separation", "Button", 12)
	t.set_constant("icon_max_width", "Button", 40)

	# Primary (amber) button variation
	t.set_type_variation("PrimaryButton", "Button")
	var p_norm := _button_style(Color("e8892b"), Color("ffcf86"), 2)
	var p_hover := _button_style(Color("ffa443"), Color("fff0c8"), 3)
	var p_press := _button_style(Color("c76d1c"), Color("ffcf86"), 2)
	var p_dis := _button_style(Color(0.35, 0.3, 0.24, 0.55), Color(1, 1, 1, 0.06))
	for s in ["normal", "normal_mirrored"]:
		t.set_stylebox(s, "PrimaryButton", p_norm)
	for s in ["hover", "hover_mirrored"]:
		t.set_stylebox(s, "PrimaryButton", p_hover)
	for s in ["pressed", "pressed_mirrored", "hover_pressed", "hover_pressed_mirrored"]:
		t.set_stylebox(s, "PrimaryButton", p_press)
	for s in ["disabled", "disabled_mirrored"]:
		t.set_stylebox(s, "PrimaryButton", p_dis)
	t.set_font("font", "PrimaryButton", font("display"))
	for c in ["font_color", "font_hover_color", "font_focus_color", "font_pressed_color", "font_hover_pressed_color"]:
		t.set_color(c, "PrimaryButton", Color("2a1606"))
	t.set_color("font_disabled_color", "PrimaryButton", Color(1, 1, 1, 0.35))

	# Menu (big title-screen) button variation
	t.set_type_variation("BigMenuButton", "Button")
	var m_norm := _button_style(Color(0.06, 0.1, 0.09, 0.55), Color(1, 0.8, 0.55, 0.12), 2, 18)
	var m_hover := _button_style(Color(0.16, 0.2, 0.15, 0.85), Color(AMBER.r, AMBER.g, AMBER.b, 0.9), 2, 18)
	var m_press := _button_style(Color(0.24, 0.17, 0.08, 0.92), AMBER, 2, 18)
	for sb in [m_norm, m_hover, m_press]:
		(sb as StyleBoxFlat).content_margin_left = 30
	for s in ["normal", "normal_mirrored"]:
		t.set_stylebox(s, "BigMenuButton", m_norm)
	for s in ["hover", "hover_mirrored"]:
		t.set_stylebox(s, "BigMenuButton", m_hover)
	for s in ["pressed", "pressed_mirrored", "hover_pressed", "hover_pressed_mirrored"]:
		t.set_stylebox(s, "BigMenuButton", m_press)
	for s in ["disabled", "disabled_mirrored"]:
		t.set_stylebox(s, "BigMenuButton", _button_style(Color(0.05, 0.07, 0.07, 0.4), Color(1, 1, 1, 0.04), 2, 18))
	t.set_font("font", "BigMenuButton", display)
	t.set_font_size("font_size", "BigMenuButton", 34)
	t.set_color("font_hover_color", "BigMenuButton", GOLD)
	t.set_color("font_focus_color", "BigMenuButton", GOLD)

	# Tab buttons (custom tab strip)
	t.set_type_variation("TabButton", "Button")
	var tab_n := _button_style(Color(0, 0, 0, 0.22), Color(1, 1, 1, 0.04), 2, 12)
	var tab_h := _button_style(Color(0.2, 0.3, 0.22, 0.6), Color(AMBER.r, AMBER.g, AMBER.b, 0.5), 2, 12)
	var tab_p := _button_style(Color(AMBER.r, AMBER.g, AMBER.b, 0.95), Color("ffe0a8"), 2, 12)
	for sb in [tab_n, tab_h, tab_p]:
		(sb as StyleBoxFlat).content_margin_left = 18
		(sb as StyleBoxFlat).content_margin_right = 18
		(sb as StyleBoxFlat).content_margin_top = 6
		(sb as StyleBoxFlat).content_margin_bottom = 8
	for s in ["normal", "normal_mirrored"]:
		t.set_stylebox(s, "TabButton", tab_n)
	for s in ["hover", "hover_mirrored"]:
		t.set_stylebox(s, "TabButton", tab_h)
	for s in ["pressed", "pressed_mirrored", "hover_pressed", "hover_pressed_mirrored"]:
		t.set_stylebox(s, "TabButton", tab_p)
	t.set_font("font", "TabButton", font("display_medium"))
	t.set_font_size("font_size", "TabButton", 24)
	t.set_color("font_pressed_color", "TabButton", Color("2a1606"))
	t.set_color("font_hover_pressed_color", "TabButton", Color("2a1606"))

	# Toggles / checkboxes ----------------------------------------------------
	for typ in ["CheckButton", "CheckBox"]:
		var empty := StyleBoxEmpty.new()
		empty.content_margin_left = 6
		empty.content_margin_right = 6
		empty.content_margin_top = 4
		empty.content_margin_bottom = 4
		for s in ["normal", "pressed", "hover", "hover_pressed", "disabled", "normal_mirrored", "pressed_mirrored", "hover_mirrored", "hover_pressed_mirrored", "disabled_mirrored"]:
			t.set_stylebox(s, typ, empty)
		t.set_stylebox("focus", typ, focus_style(12))
		t.set_icon("checked", typ, switch_texture(true))
		t.set_icon("unchecked", typ, switch_texture(false))
		t.set_icon("checked_disabled", typ, switch_texture(true, true))
		t.set_icon("unchecked_disabled", typ, switch_texture(false, true))
		t.set_icon("checked_mirrored", typ, switch_texture(true))
		t.set_icon("unchecked_mirrored", typ, switch_texture(false))
		t.set_constant("icon_max_width", typ, 0)
		t.set_constant("h_separation", typ, 14)
		t.set_font("font", typ, body)
		t.set_font_size("font_size", typ, 24)
		t.set_color("font_color", typ, txt)
		t.set_color("font_hover_color", typ, Color("fff4dc"))
		t.set_color("font_pressed_color", typ, txt)
		t.set_color("font_hover_pressed_color", typ, Color("fff4dc"))
		t.set_color("font_focus_color", typ, Color("fff4dc"))

	# Sliders -----------------------------------------------------------------
	var track := flat(Color(0, 0, 0, 0.45), 8)
	track.content_margin_top = 6
	track.content_margin_bottom = 6
	track.set_border_width_all(1)
	track.border_color = Color(1, 1, 1, 0.08)
	var fill := flat(Color(AMBER.r, AMBER.g, AMBER.b, 0.9), 8)
	fill.content_margin_top = 6
	fill.content_margin_bottom = 6
	var fill_hi := flat(GOLD, 8)
	fill_hi.content_margin_top = 6
	fill_hi.content_margin_bottom = 6
	t.set_stylebox("slider", "HSlider", track)
	t.set_stylebox("grabber_area", "HSlider", fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", fill_hi)
	t.set_icon("grabber", "HSlider", knob_texture(false))
	t.set_icon("grabber_highlight", "HSlider", knob_texture(true))
	t.set_icon("grabber_disabled", "HSlider", knob_texture(false))
	t.set_stylebox("focus", "HSlider", focus_style(10))

	# Option buttons + popups --------------------------------------------------
	var o_norm := _button_style(Color(0.08, 0.13, 0.1, 0.9), Color(1, 0.8, 0.55, 0.22))
	o_norm.content_margin_right = 46
	var o_hover := _button_style(Color(0.16, 0.25, 0.18, 0.95), Color(AMBER.r, AMBER.g, AMBER.b, 0.8))
	o_hover.content_margin_right = 46
	for s in ["normal", "normal_mirrored", "pressed", "pressed_mirrored"]:
		t.set_stylebox(s, "OptionButton", o_norm)
	for s in ["hover", "hover_mirrored", "hover_pressed", "hover_pressed_mirrored"]:
		t.set_stylebox(s, "OptionButton", o_hover)
	t.set_stylebox("focus", "OptionButton", focus_style())
	t.set_icon("arrow", "OptionButton", arrow_texture())
	t.set_constant("arrow_margin", "OptionButton", 14)
	t.set_font("font", "OptionButton", body)
	t.set_font_size("font_size", "OptionButton", 24)
	var pop := panel_style(14, 1.0)
	pop.bg_color = Color(0.05, 0.09, 0.07, 0.98)
	pop.set_content_margin_all(8)
	t.set_stylebox("panel", "PopupMenu", pop)
	t.set_stylebox("hover", "PopupMenu", flat(Color(AMBER.r, AMBER.g, AMBER.b, 0.85), 8))
	t.set_color("font_color", "PopupMenu", txt)
	t.set_color("font_hover_color", "PopupMenu", Color("2a1606"))
	t.set_font("font", "PopupMenu", body)
	t.set_font_size("font_size", "PopupMenu", 24)
	t.set_constant("v_separation", "PopupMenu", 12)
	t.set_constant("item_start_padding", "PopupMenu", 14)
	t.set_constant("item_end_padding", "PopupMenu", 14)
	t.set_icon("radio_checked", "PopupMenu", dot_texture(true))
	t.set_icon("radio_unchecked", "PopupMenu", dot_texture(false))

	# Scrollbars -----------------------------------------------------------------
	var sc := flat(Color(0, 0, 0, 0.25), 6)
	sc.content_margin_left = 4
	sc.content_margin_right = 4
	var grab := flat(Color(AMBER.r, AMBER.g, AMBER.b, 0.45), 6)
	var grab_h := flat(Color(AMBER.r, AMBER.g, AMBER.b, 0.8), 6)
	for typ in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox("scroll", typ, sc)
		t.set_stylebox("scroll_focus", typ, sc)
		t.set_stylebox("grabber", typ, grab)
		t.set_stylebox("grabber_highlight", typ, grab_h)
		t.set_stylebox("grabber_pressed", typ, grab_h)

	# Progress bars ----------------------------------------------------------------
	var pb_bg := flat(Color(0, 0, 0, 0.5), 12)
	pb_bg.set_border_width_all(2)
	pb_bg.border_color = Color(1, 0.8, 0.55, 0.2)
	t.set_stylebox("background", "ProgressBar", pb_bg)
	t.set_stylebox("fill", "ProgressBar", flat(AMBER, 12))
	t.set_font_size("font_size", "ProgressBar", 18)

	# Separators / tooltips -----------------------------------------------------
	var sep := StyleBoxLine.new()
	sep.color = Color(1, 0.85, 0.6, 0.16)
	sep.thickness = 2
	t.set_stylebox("separator", "HSeparator", sep)
	t.set_constant("separation", "HSeparator", 14)
	var tip := panel_style(10, 1.0, true, false)
	tip.bg_color = Color(0.04, 0.07, 0.05, 0.96)
	tip.set_content_margin_all(10)
	t.set_stylebox("panel", "TooltipPanel", tip)
	t.set_color("font_color", "TooltipLabel", txt)
	t.set_font_size("font_size", "TooltipLabel", 20)

	# Containers ---------------------------------------------------------------
	t.set_constant("separation", "VBoxContainer", 10)
	t.set_constant("separation", "HBoxContainer", 10)
	t.set_constant("h_separation", "GridContainer", 10)
	t.set_constant("v_separation", "GridContainer", 10)
	return t


static func _variation(t: Theme, name: String, base: String, f: Font, size: int, color: Color) -> void:
	t.set_type_variation(name, base)
	t.set_font("font", name, f)
	t.set_font_size("font_size", name, size)
	t.set_color("font_color", name, color)


# --- Procedural textures ----------------------------------------------------------

## Smooth anti-aliased signed-distance painter for small UI textures.
static func _sdf_image(w: int, h: int, painter: Callable) -> ImageTexture:
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		for x in w:
			var c: Color = painter.call(Vector2(x + 0.5, y + 0.5))
			img.set_pixel(x, y, c)
	return ImageTexture.create_from_image(img)


static func _rr_dist(p: Vector2, center: Vector2, half: Vector2, r: float) -> float:
	var q := (p - center).abs() - half + Vector2(r, r)
	return Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - r


static func _cov(d: float) -> float:
	return clampf(0.5 - d, 0.0, 1.0)


static func _blend(under: Color, over: Color) -> Color:
	var a := over.a + under.a * (1.0 - over.a)
	if a <= 0.0001:
		return Color(0, 0, 0, 0)
	var rgb_v := (Color(over.r, over.g, over.b) * over.a + Color(under.r, under.g, under.b) * under.a * (1.0 - over.a)) / a
	return Color(rgb_v.r, rgb_v.g, rgb_v.b, a)


## Toggle switch used for CheckButton / CheckBox.
static func switch_texture(on: bool, disabled: bool = false) -> Texture2D:
	var key := "switch_%s_%s_%s" % [on, disabled, high_contrast()]
	if _tex_cache.has(key):
		return _tex_cache[key]
	var w := 68
	var h := 38
	var track_on := AMBER if not disabled else Color(0.5, 0.42, 0.3)
	var track_off := Color(0.2, 0.26, 0.23) if not high_contrast() else Color(0.35, 0.38, 0.36)
	var track := track_on if on else track_off
	var knob_x := w - 19.0 if on else 19.0
	var tex := _sdf_image(w, h, func(p: Vector2) -> Color:
		var c := Color(0, 0, 0, 0)
		var dt := _rr_dist(p, Vector2(w * 0.5, h * 0.5), Vector2(w * 0.5 - 2.0, h * 0.5 - 5.0), h * 0.5 - 5.0)
		c = _blend(c, Color(track.r, track.g, track.b, _cov(dt)))
		var ring := absf(dt + 1.0) - 1.0
		c = _blend(c, Color(1, 1, 1, _cov(ring) * 0.12))
		var dsh := p.distance_to(Vector2(knob_x, h * 0.5 + 1.5)) - 13.5
		c = _blend(c, Color(0, 0, 0, clampf(0.6 - dsh * 0.25, 0.0, 0.35)))
		var dk := p.distance_to(Vector2(knob_x, h * 0.5)) - 13.0
		var kc := Color("fff6e4") if on else Color("c9c1ad")
		c = _blend(c, Color(kc.r, kc.g, kc.b, _cov(dk)))
		return c)
	_tex_cache[key] = tex
	return tex


static func knob_texture(highlight: bool) -> Texture2D:
	var key := "knob_%s" % highlight
	if _tex_cache.has(key):
		return _tex_cache[key]
	var s := 34
	var tex := _sdf_image(s, s, func(p: Vector2) -> Color:
		var c := Color(0, 0, 0, 0)
		var center := Vector2(s * 0.5, s * 0.5)
		var dsh := p.distance_to(center + Vector2(0, 1.5)) - 13.0
		c = _blend(c, Color(0, 0, 0, clampf(0.5 - dsh * 0.3, 0.0, 0.4)))
		var d := p.distance_to(center) - 12.5
		var col := GOLD if highlight else Color("fff2d6")
		c = _blend(c, Color(col.r, col.g, col.b, _cov(d)))
		var ring := absf(d + 2.0) - 1.5
		c = _blend(c, Color(AMBER.r, AMBER.g, AMBER.b, _cov(ring) * 0.9))
		return c)
	_tex_cache[key] = tex
	return tex


static func arrow_texture() -> Texture2D:
	if _tex_cache.has("arrow"):
		return _tex_cache["arrow"]
	var w := 24
	var h := 16
	var tex := _sdf_image(w, h, func(p: Vector2) -> Color:
		# A rounded chevron pointing down.
		var a := Vector2(4, 4)
		var b := Vector2(12, 12)
		var e := Vector2(20, 4)
		var d := minf(_seg_dist(p, a, b), _seg_dist(p, b, e)) - 2.2
		return Color(AMBER.r, AMBER.g, AMBER.b, _cov(d)))
	_tex_cache["arrow"] = tex
	return tex


static func dot_texture(on: bool) -> Texture2D:
	var key := "dot_%s" % on
	if _tex_cache.has(key):
		return _tex_cache[key]
	var s := 22
	var tex := _sdf_image(s, s, func(p: Vector2) -> Color:
		var center := Vector2(s * 0.5, s * 0.5)
		var d := p.distance_to(center)
		var c := Color(0, 0, 0, 0)
		var ring := absf(d - 8.0) - 1.5
		c = _blend(c, Color(AMBER.r, AMBER.g, AMBER.b, _cov(ring)))
		if on:
			c = _blend(c, Color(AMBER.r, AMBER.g, AMBER.b, _cov(d - 4.5)))
		return c)
	_tex_cache[key] = tex
	return tex


static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var pa := p - a
	var ba := b - a
	var h := clampf(pa.dot(ba) / ba.dot(ba), 0.0, 1.0)
	return (pa - ba * h).length()


## Soft radial glow texture (white, alpha falls off) for HUD effects.
static func glow_texture(size: int = 128) -> Texture2D:
	var key := "glow_%d" % size
	if _tex_cache.has(key):
		return _tex_cache[key]
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.35, Color(1, 1, 1, 0.55))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = size
	gt.height = size
	_tex_cache[key] = gt
	return gt


## Item / UI glyph icon (res://assets/icons/<id>.png); null if missing.
static func icon(id: String) -> Texture2D:
	if id == "":
		return null
	var key := "icon_" + id
	if _tex_cache.has(key):
		return _tex_cache[key]
	var tex: Texture2D = DB.icon(id)
	if tex == null:
		var p := "res://assets/icons/%s.png" % id
		if ResourceLoader.exists(p):
			tex = load(p)
	_tex_cache[key] = tex
	return tex
