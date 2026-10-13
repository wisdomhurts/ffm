extends SceneTree
## Renders the PWA / home-screen icons for the web build from res://icon.svg
## into web/shell/ (icon-144.png, icon-180.png, icon-512.png).
## Run: godot --headless --path . -s res://tools/gen_web_icons.gd


func _initialize() -> void:
	var svg := FileAccess.get_file_as_string("res://icon.svg")
	if svg == "":
		push_error("icon.svg missing")
		quit(1)
		return
	var out_dir := ProjectSettings.globalize_path("res://web/shell")
	DirAccess.make_dir_recursive_absolute(out_dir)
	for px in [144, 180, 512]:
		var img := Image.new()
		var err := img.load_svg_from_string(svg, float(px) / 128.0)
		if err != OK:
			push_error("SVG render failed: %d" % err)
			quit(1)
			return
		if img.get_width() != px:
			img.resize(px, px, Image.INTERPOLATE_LANCZOS)
		if px == 180:
			# Apple touch icon: iOS rounds the corners itself and shows
			# transparent pixels as black, so fill the corners with the sky.
			var bg := Image.create(px, px, false, Image.FORMAT_RGBA8)
			bg.fill(Color("141c3e"))
			bg.blend_rect(img, Rect2i(0, 0, px, px), Vector2i.ZERO)
			img = bg
		var path := out_dir.path_join("icon-%d.png" % px)
		img.save_png(path)
		print("ICON ", path, " ", img.get_size())
	quit(0)
