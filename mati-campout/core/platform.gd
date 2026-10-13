class_name Platform
extends RefCounted
## Platform and input-mode helpers: desktop vs browser vs phone, touch mode,
## renderer, device pixel ratio, notch-safe insets and the automatic UI size
## boost for small screens. All static; see docs/ARCHITECTURE.md "Platforms".
##
##   Platform.is_web()             running in a browser
##   Platform.is_mobile_web()      a phone/tablet browser (iOS/Android)
##   Platform.is_mobile()          any phone/tablet (native or browser)
##   Platform.is_touch_device()    has a touchscreen (or forced with --touch)
##   Platform.is_touch()           touch controls are active right now (a
##                                 touch device whose last input was a touch;
##                                 keyboard/gamepad input switches them off)
##   Platform.is_compat_renderer() the Compatibility (OpenGL/WebGL2) renderer
##   Platform.dpr()                device pixel ratio (CSS px -> screen px)
##   Platform.safe_insets()        notch / home-bar insets in window pixels
##   Platform.ui_scale_boost()     extra UI scale so text stays readable on phones
##
## Command-line (after `--`): `--touch` forces touch mode on desktop (mouse
## clicks become touches), `--dpr=3` pretends a device pixel ratio (to preview
## the phone UI scale on a desktop window), `--no-touch` disables touch mode.

## Emitted through Events.input_mode_changed(touch) when touch mode flips.
const MOBILE_FEATURES := ["mobile", "web_android", "web_ios", "android", "ios"]

## Readable-text target: CSS px per 1080p-layout px on phones (~0.55 means a
## 24 px label shows as ~13 CSS px). The boost never goes below 1 or above MAX.
const TARGET_CSS_PER_PX := 0.55
const MAX_BOOST := 1.75
## Never shrink the logical layout narrower/shorter than this (UI units).
const MIN_LOGICAL := Vector2(1360.0, 620.0)

static var force_touch := false
static var force_no_touch := false
static var dpr_override := 0.0
static var _mode := -1          # -1 = not decided yet, 0 = mouse/keys/pad, 1 = touch
static var _args_read := false
static var _js_insets := Rect2()
static var _js_insets_t := -10000


# --- Platform ----------------------------------------------------------------------

static func is_web() -> bool:
	return OS.has_feature("web")


static func is_mobile() -> bool:
	for f in MOBILE_FEATURES:
		if OS.has_feature(f):
			return true
	return false


static func is_mobile_web() -> bool:
	return is_web() and (OS.has_feature("web_android") or OS.has_feature("web_ios"))


static func is_ios() -> bool:
	return OS.has_feature("web_ios") or OS.has_feature("ios")


static func is_headless() -> bool:
	return DisplayServer.get_name() == "headless"


static func is_compat_renderer() -> bool:
	return RenderingServer.get_current_rendering_method() == "gl_compatibility"


## "computer" on desktops, "device" on phones, tablets and in browsers (for
## texts like "Scores are saved on this computer").
static func device_word() -> String:
	return "device" if is_web() or is_touch_device() else "computer"


# --- Touch mode ----------------------------------------------------------------------

static func _read_args() -> void:
	if _args_read:
		return
	_args_read = true
	for a in OS.get_cmdline_user_args():
		var s := str(a)
		if s == "--touch":
			force_touch = true
		elif s == "--no-touch":
			force_no_touch = true
		elif s.begins_with("--dpr="):
			dpr_override = maxf(float(s.trim_prefix("--dpr=")), 0.0)


static func is_touch_device() -> bool:
	_read_args()
	if force_no_touch:
		return false
	if force_touch or is_mobile():
		return true
	if is_headless():
		return false
	return DisplayServer.is_touchscreen_available()


## True while the on-screen touch controls are in use.
static func is_touch() -> bool:
	_read_args()
	if _mode < 0:
		_mode = 1 if (not force_no_touch and (force_touch or is_mobile())) else 0
	return _mode == 1


## Switch touch mode on/off (Controls calls this from the last input type).
## Returns true when the mode changed.
static func set_touch_active(on: bool) -> bool:
	is_touch()
	if on and not is_touch_device():
		return false
	var m := 1 if on else 0
	if m == _mode:
		return false
	_mode = m
	return true


## Desktop mouse clicks only leave touch mode on real hybrid laptops; on
## phones (and with --touch) every "mouse" event is an emulated touch.
static func mouse_leaves_touch() -> bool:
	_read_args()
	return not (force_touch or is_mobile())


# --- Screen ------------------------------------------------------------------------------

## Device pixel ratio: physical pixels per CSS pixel (1 on most desktops).
static func dpr() -> float:
	_read_args()
	if dpr_override > 0.0:
		return dpr_override
	if is_web() and Engine.has_singleton("JavaScriptBridge"):
		var v: Variant = JavaScriptBridge.eval("window.devicePixelRatio || 1", true)
		if v is float or v is int:
			return clampf(float(v), 0.5, 5.0)
	if is_headless():
		return 1.0
	return clampf(DisplayServer.screen_get_scale(), 0.5, 5.0)


static func window_size() -> Vector2:
	if is_headless():
		return Vector2(1920, 1080)
	return Vector2(DisplayServer.window_get_size())


static func is_portrait(size: Vector2 = Vector2.ZERO) -> bool:
	var s := size if size != Vector2.ZERO else window_size()
	return s.y > s.x * 1.05


## Insets (left, top, right, bottom as position.x, position.y, size.x, size.y)
## in window pixels that UI must keep clear of: notches, rounded corners and
## the home indicator. The web shell measures CSS env(safe-area-inset-*) into
## window.matiSafeArea; native mobile uses DisplayServer.get_display_safe_area().
static func safe_insets() -> Rect2:
	if is_headless():
		return Rect2()
	if is_web():
		var now := Time.get_ticks_msec()
		if now - _js_insets_t > 500:
			_js_insets_t = now
			_js_insets = Rect2()
			var v: Variant = JavaScriptBridge.eval("window.matiSafeArea ? JSON.stringify(window.matiSafeArea()) : ''", true)
			if v is String and str(v) != "":
				var d: Variant = JSON.parse_string(str(v))
				if d is Dictionary:
					var k := dpr()
					_js_insets = Rect2(float(d.get("left", 0)) * k, float(d.get("top", 0)) * k,
						float(d.get("right", 0)) * k, float(d.get("bottom", 0)) * k)
		return _js_insets
	if is_mobile():
		var win := Rect2(Vector2.ZERO, window_size())
		var safe := Rect2(DisplayServer.get_display_safe_area())
		if safe.size.x > 0.0 and safe.size.y > 0.0:
			return Rect2(maxf(safe.position.x - win.position.x, 0.0), maxf(safe.position.y - win.position.y, 0.0),
				maxf(win.end.x - safe.end.x, 0.0), maxf(win.end.y - safe.end.y, 0.0))
	return Rect2()


## Extra UI scale for small, dense screens (phones). 1.0 on desktops/tablets.
## `viewport_size` is the canvas size in 1080p-layout units (the root
## viewport's visible rect under canvas_items stretch).
static func ui_scale_boost(viewport_size: Vector2 = Vector2.ZERO) -> float:
	if not is_touch_device():
		return 1.0
	var win := window_size()
	var vp := viewport_size
	if vp == Vector2.ZERO:
		vp = Vector2(1920, 1080)
		var k0 := minf(win.x / 1920.0, win.y / 1080.0)
		if k0 > 0.0:
			vp = win / k0
	return boost_for(win, vp, dpr())


## Pure helper (unit-tested): window px, layout canvas units, DPR -> boost.
static func boost_for(win: Vector2, vp: Vector2, ratio: float) -> float:
	if win.x <= 0.0 or win.y <= 0.0 or vp.x <= 0.0 or vp.y <= 0.0:
		return 1.0
	var k := minf(win.x / vp.x, win.y / vp.y)       # window px per layout unit
	var css_per_unit := k / maxf(ratio, 0.5)
	var boost := TARGET_CSS_PER_PX / maxf(css_per_unit, 0.01)
	# Keep enough room for the HUD and the touch buttons.
	boost = minf(boost, minf(vp.x / MIN_LOGICAL.x, vp.y / MIN_LOGICAL.y))
	return clampf(boost, 1.0, MAX_BOOST)
