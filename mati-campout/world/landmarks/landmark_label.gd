class_name LandmarkLabel
extends RefCounted
## Painted sign text (Label3D in the display font) for landmark signboards.


static func make(text: String, xform: Transform3D, color: Color, outline: Color, size: int = 64, pixel: float = 0.0034) -> Label3D:
	var label := Label3D.new()
	label.name = "SignText"
	label.text = text
	label.font = ThemeFactory.font("display_bold")
	label.font_size = size
	label.pixel_size = pixel
	label.modulate = color
	label.outline_size = 8
	label.outline_modulate = outline
	label.shaded = true
	label.double_sided = false
	label.alpha_cut = Label3D.ALPHA_CUT_OPAQUE_PREPASS
	label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	label.visibility_range_end = 35.0
	label.transform = xform
	return label
