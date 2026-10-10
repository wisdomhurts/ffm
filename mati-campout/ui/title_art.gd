class_name TitleArt
extends Control
## Layered, animated 2D illustration of the campsite at night, used behind
## the title, loading and game-over screens: indigo-to-violet sky with
## twinkling stars and a shooting star, a glowing moon, parallax pine ridges,
## a warm clearing with a tent, a flickering campfire with rising embers
## (CPUParticles2D) and blinking fireflies.
##
## Static layers are drawn once (redrawn on resize) and only moved for the
## parallax; animated layers redraw every frame with cheap primitives.

## Fire position as a fraction of the screen.
var fire_frac := Vector2(0.7, 0.8)
## Moon position as a fraction of the screen.
var moon_frac := Vector2(0.2, 0.2)
var show_tent := true
var parallax_strength := 1.0
var seed_value := 7

var _layers: Array = []      # [{node, depth}]
var _par := Vector2.ZERO
var _t := 0.0
var _embers: CPUParticles2D
var _sky: TextureRect
var _vignette: TextureRect


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	_sky = TextureRect.new()
	_sky.texture = _sky_gradient()
	_sky.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_sky.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sky.stretch_mode = TextureRect.STRETCH_SCALE
	_sky.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_sky)
	_add_layer(_Stars.new(self), 0.15)
	_add_layer(_Moon.new(self), 0.25)
	_add_layer(_Ridge.new(self, "mountains"), 0.35)
	_add_layer(_Ridge.new(self, "far"), 0.55)
	_add_layer(_Ridge.new(self, "mid"), 0.85)
	_add_layer(_FireGlow.new(self, true), 1.25)
	_add_layer(_Ridge.new(self, "ground"), 1.25)
	_add_layer(_FireGlow.new(self, false), 1.25)
	var fire := _Fire.new(self)
	_add_layer(fire, 1.25)
	_embers = _make_embers()
	fire.add_child(_embers)
	_add_layer(_Fireflies.new(self), 1.1)
	_add_layer(_Ridge.new(self, "near"), 1.8)
	_vignette = TextureRect.new()
	_vignette.texture = _vignette_tex()
	_vignette.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_vignette.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_vignette.stretch_mode = TextureRect.STRETCH_SCALE
	_vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_vignette)
	resized.connect(_on_resized)
	_on_resized()


func _add_layer(n: Control, depth: float) -> void:
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(n)
	_layers.append({"node": n, "depth": depth})


func fire_point() -> Vector2:
	return size * fire_frac


func _on_resized() -> void:
	for l in _layers:
		var n := l["node"] as Control
		n.size = size
		n.queue_redraw()
	if _embers:
		_embers.position = Vector2.ZERO


func _process(delta: float) -> void:
	_t += delta
	var target := Vector2(sin(_t * 0.13) * 6.0, sin(_t * 0.09) * 3.0)
	var vp := get_viewport()
	if vp and parallax_strength > 0.0:
		var m := get_local_mouse_position()
		if Rect2(Vector2.ZERO, size).has_point(m):
			target += (m / maxf(size.x, 1.0) - Vector2(0.5, 0.5 * size.y / maxf(size.x, 1.0))) * Vector2(-28.0, -14.0)
	_par = _par.lerp(target * parallax_strength, clampf(delta * 2.0, 0.0, 1.0))
	for l in _layers:
		(l["node"] as Control).position = _par * float(l["depth"])


func _sky_gradient() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color("080b22"))
	g.set_color(1, Color("6a4f80"))
	g.add_point(0.35, Color("1a1f4d"))
	g.add_point(0.62, Color("2f2c66"))
	g.add_point(0.8, Color("4b3b72"))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(0, 1)
	gt.width = 4
	gt.height = 256
	return gt


func _vignette_tex() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0))
	g.set_color(1, Color(0.01, 0.01, 0.04, 0.82))
	g.add_point(0.55, Color(0, 0, 0, 0.0))
	g.add_point(0.8, Color(0.01, 0.01, 0.04, 0.35))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.08, 0.5)
	gt.width = 256
	gt.height = 256
	return gt


func _make_embers() -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.amount = 42
	p.lifetime = 3.2
	p.preprocess = 2.0
	p.texture = ThemeFactory.glow_texture(32)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(34, 8)
	p.direction = Vector2(0, -1)
	p.spread = 22.0
	p.initial_velocity_min = 50.0
	p.initial_velocity_max = 120.0
	p.gravity = Vector2(6, -18)
	p.damping_min = 4.0
	p.damping_max = 12.0
	p.scale_amount_min = 0.12
	p.scale_amount_max = 0.32
	p.angular_velocity_min = -40.0
	p.angular_velocity_max = 40.0
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.9, 0.55, 1.0))
	ramp.set_color(1, Color(1.0, 0.3, 0.05, 0.0))
	ramp.add_point(0.5, Color(1.0, 0.55, 0.15, 0.85))
	p.color_ramp = ramp
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = mat
	return p


func set_ember_origin(pos: Vector2) -> void:
	if _embers:
		_embers.position = pos


# --- Layers --------------------------------------------------------------------

class _Layer:
	extends Control
	var art: TitleArt

	func _init(p_art: TitleArt) -> void:
		art = p_art
		mouse_filter = Control.MOUSE_FILTER_IGNORE


class _Stars:
	extends _Layer
	var stars: Array = []
	var _shoot_t := 3.0
	var _shoot_from := Vector2.ZERO
	var _shoot_dir := Vector2.ZERO

	func _init(p_art: TitleArt) -> void:
		super._init(p_art)
		var rng := RandomNumberGenerator.new()
		rng.seed = 7
		for i in 260:
			var big := rng.randf() < 0.07
			stars.append({"p": Vector2(rng.randf(), pow(rng.randf(), 1.35) * 0.68), "r": rng.randf_range(1.6, 3.0) if big else rng.randf_range(0.7, 1.7),
				"ph": rng.randf() * TAU, "sp": rng.randf_range(0.8, 2.6), "big": big,
				"c": Color(1.0, 0.95, 0.85).lerp(Color(0.75, 0.82, 1.0), rng.randf())})

	func _process(delta: float) -> void:
		_shoot_t -= delta
		if _shoot_t < -1.2:
			_shoot_t = randf_range(5.0, 10.0)
			_shoot_from = Vector2(randf_range(0.15, 0.85), randf_range(0.05, 0.3))
			_shoot_dir = Vector2(randf_range(0.6, 1.0) * (1.0 if randf() < 0.5 else -1.0), randf_range(0.25, 0.45)).normalized()
		queue_redraw()

	func _draw() -> void:
		var s := size
		var t := Time.get_ticks_msec() / 1000.0
		var glow := ThemeFactory.glow_texture()
		# Faint milky band
		for i in 9:
			var u := float(i) / 8.0
			var c := Vector2(lerpf(-0.05, 1.05, u) * s.x, lerpf(0.05, 0.42, u) * s.y + sin(u * 7.0) * 30.0)
			var r := s.x * 0.16
			draw_texture_rect(glow, Rect2(c - Vector2(r, r * 0.45), Vector2(r * 2, r * 0.9)), false, Color(0.55, 0.5, 0.85, 0.06))
		for st in stars:
			var p: Vector2 = (st["p"] as Vector2) * s
			var a := 0.55 + 0.45 * sin(t * float(st["sp"]) + float(st["ph"]))
			var col: Color = st["c"]
			var r2 := float(st["r"])
			if bool(st["big"]):
				draw_texture_rect(glow, Rect2(p - Vector2(r2 * 5, r2 * 5), Vector2(r2 * 10, r2 * 10)), false, Color(col.r, col.g, col.b, 0.35 * a))
				draw_line(p - Vector2(r2 * 3.5 * a, 0), p + Vector2(r2 * 3.5 * a, 0), Color(col.r, col.g, col.b, 0.6 * a), 1.2, true)
				draw_line(p - Vector2(0, r2 * 3.5 * a), p + Vector2(0, r2 * 3.5 * a), Color(col.r, col.g, col.b, 0.6 * a), 1.2, true)
			draw_circle(p, r2, Color(col.r, col.g, col.b, a))
		if _shoot_t < 0.0:
			var k := clampf(-_shoot_t / 1.2, 0.0, 1.0)
			var head := _shoot_from * s + _shoot_dir * k * s.x * 0.35
			var tail := head - _shoot_dir * 140.0
			var fade := sin(k * PI)
			draw_polyline_colors(PackedVector2Array([tail, head]), PackedColorArray([Color(1, 1, 1, 0), Color(1, 0.97, 0.9, 0.9 * fade)]), 2.2, true)


class _Moon:
	extends _Layer

	func _draw() -> void:
		var s := size
		var c := s * art.moon_frac
		var glow := ThemeFactory.glow_texture()
		draw_texture_rect(glow, Rect2(c - Vector2(360, 360), Vector2(720, 720)), false, Color(0.55, 0.6, 1.0, 0.2))
		draw_texture_rect(glow, Rect2(c - Vector2(150, 150), Vector2(300, 300)), false, Color(0.9, 0.9, 1.0, 0.45))
		var r := 56.0
		draw_circle(c, r + 2.0, Color(0.95, 0.95, 1.0, 0.35))
		draw_circle(c, r, Color("fbf5e2"))
		# Soft shading toward the lower right and a few gentle craters.
		draw_circle(c + Vector2(10, 9), r - 6.0, Color(0.85, 0.83, 0.9, 0.35))
		draw_circle(c + Vector2(-6, -6), r - 14.0, Color(1.0, 0.99, 0.94, 0.5))
		draw_circle(c + Vector2(-14, -10), 12.0, Color(0.84, 0.82, 0.8, 0.45))
		draw_circle(c + Vector2(18, 14), 9.0, Color(0.84, 0.82, 0.8, 0.4))
		draw_circle(c + Vector2(6, -26), 6.0, Color(0.84, 0.82, 0.8, 0.35))
		draw_circle(c + Vector2(-22, 22), 7.0, Color(0.84, 0.82, 0.8, 0.35))


class _Ridge:
	extends _Layer
	var kind := "far"

	func _init(p_art: TitleArt, p_kind: String) -> void:
		super._init(p_art)
		kind = p_kind

	static func pine(base: Vector2, h: float, w: float, tiers: int, rng: RandomNumberGenerator) -> PackedVector2Array:
		var pts := PackedVector2Array()
		var tw := maxf(w * 0.06, 1.5)
		var trunk_h := h * 0.08
		pts.append(base + Vector2(-tw, 0))
		pts.append(base + Vector2(-tw, -trunk_h))
		var tier_h := (h - trunk_h) / float(tiers)
		var lefts: Array = []
		for k in tiers:
			var f := float(k) / tiers
			var y := base.y - trunk_h - tier_h * k
			var half := w * 0.5 * (1.0 - f * 0.86) * rng.randf_range(0.9, 1.1)
			var tip := Vector2(base.x - half, y + tier_h * 0.12)
			var notch := Vector2(base.x - half * 0.36, y - tier_h * 0.5)
			pts.append(tip)
			pts.append(notch)
			lefts.append([tip, notch])
		pts.append(Vector2(base.x + rng.randf_range(-1.5, 1.5), base.y - h))
		for k in range(tiers - 1, -1, -1):
			var f := float(k) / tiers
			var y := base.y - trunk_h - tier_h * k
			var half := w * 0.5 * (1.0 - f * 0.86) * rng.randf_range(0.9, 1.1)
			pts.append(Vector2(base.x + half * 0.36, y - tier_h * 0.5))
			pts.append(Vector2(base.x + half, y + tier_h * 0.12))
		pts.append(base + Vector2(tw, -trunk_h))
		pts.append(base + Vector2(tw, 0))
		return pts

	func _draw() -> void:
		var s := size
		if s.x < 64.0 or s.y < 64.0:
			return
		var m := 60.0
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(kind) + art.seed_value
		var fp := art.fire_point()
		match kind:
			"mountains":
				var pts := PackedVector2Array([Vector2(-m, s.y)])
				var x := -m
				var peaks := [0.42, 0.5, 0.36, 0.47, 0.4, 0.52, 0.44]
				var i := 0
				while x < s.x + m:
					var y := s.y * float(peaks[i % peaks.size()]) + rng.randf_range(-20, 20)
					pts.append(Vector2(x, y))
					x = minf(x + rng.randf_range(80, 160), s.x + m - 1.0)
					pts.append(Vector2(x, y + rng.randf_range(40, 90)))
					x += rng.randf_range(60, 140)
					i += 1
				pts.append(Vector2(s.x + m, s.y))
				var glow := ThemeFactory.glow_texture()
				draw_texture_rect(glow, Rect2(Vector2(-s.x * 0.2, s.y * 0.28), Vector2(s.x * 1.4, s.y * 0.6)), false, Color(0.55, 0.38, 0.62, 0.35))
				draw_texture_rect(glow, Rect2(Vector2(s.x * (art.fire_frac.x - 0.35), s.y * 0.4), Vector2(s.x * 0.7, s.y * 0.45)), false, Color(0.75, 0.42, 0.35, 0.16))
				draw_colored_polygon(pts, Color("2b2a5c"))
				# Snowy highlights on the peaks
				for k in range(1, pts.size() - 1, 2):
					var p: Vector2 = pts[k]
					draw_colored_polygon(PackedVector2Array([p, p + Vector2(-20, 16), p + Vector2(-5, 12), p + Vector2(8, 19), p + Vector2(18, 14)]), Color(0.6, 0.6, 0.84, 0.18))
				# Haze over the mountain base
				var hz := s.y * 0.6
				draw_polygon(PackedVector2Array([Vector2(-m, hz - 80), Vector2(s.x + m, hz - 80), Vector2(s.x + m, s.y), Vector2(-m, s.y)]),
					PackedColorArray([Color(0.42, 0.33, 0.55, 0.0), Color(0.42, 0.33, 0.55, 0.0), Color(0.42, 0.33, 0.55, 0.65), Color(0.42, 0.33, 0.55, 0.65)]))
			"far":
				_ridge_band(s, s.y * 0.66, 14.0, 34.0, 70.0, 26.0, 40.0, Color("1f2150"), rng, 5)
				var hz2 := s.y * 0.68
				draw_polygon(PackedVector2Array([Vector2(-m, hz2 - 40), Vector2(s.x + m, hz2 - 40), Vector2(s.x + m, s.y), Vector2(-m, s.y)]),
					PackedColorArray([Color(0.3, 0.24, 0.45, 0.0), Color(0.3, 0.24, 0.45, 0.0), Color(0.3, 0.24, 0.45, 0.5), Color(0.3, 0.24, 0.45, 0.5)]))
			"mid":
				_ridge_band(s, s.y * 0.75, 20.0, 44.0, 120.0, 40.0, 70.0, Color("141838"), rng, 6)
			"ground":
				# Clearing: dark ground with a warm lit patch around the fire.
				var gy := fp.y - 30.0
				var pts2 := PackedVector2Array([Vector2(-m, s.y + m)])
				for k in 25:
					var u := float(k) / 24.0
					var x2 := lerpf(-m, s.x + m, u)
					var y2 := gy + 40.0 * sin(u * 3.2 + 0.5) + 30.0 * absf(u - fire_u()) * 2.0
					pts2.append(Vector2(x2, y2))
				pts2.append(Vector2(s.x + m, s.y + m))
				draw_colored_polygon(pts2, Color("0f1428"))
				# Rocks ring and logs
				for k in 9:
					var a := TAU * float(k) / 9.0
					var rp := fp + Vector2(cos(a) * 62.0, sin(a) * 16.0 + 8.0)
					draw_circle(rp, 11.0, Color("2a2238"))
					draw_circle(rp + Vector2(-2, -3), 8.0, Color("6a4a3c") if sin(a) < 0.2 else Color("3a3044"))
				# Bench log on the left of the fire
				_log(fp + Vector2(-235, 34), 190.0, 22.0, -0.04, Color("3e2820"), Color("8a5a3a"), Color("c99462"))
				if art.show_tent:
					_tent(fp + Vector2(250, 6))
			"near":
				# Big framing pines at the screen edges.
				var near_col := Color("070a16")
				for spec in [[-0.02, 1.05, 1.3, 330.0], [0.07, 1.08, 0.95, 250.0], [0.97, 1.06, 1.25, 320.0], [1.06, 1.04, 1.1, 300.0]]:
					var base := Vector2(float(spec[0]) * s.x, float(spec[1]) * s.y)
					draw_colored_polygon(pine(base, s.y * float(spec[2]), float(spec[3]), 9, rng), near_col)
				# Foreground grass tufts
				var gcol := Color("0a0e1c")
				for k in 70:
					var x3 := rng.randf_range(-20, s.x + 20)
					var y3 := s.y + 4.0
					var hh := rng.randf_range(14, 40)
					draw_colored_polygon(PackedVector2Array([Vector2(x3 - 5, y3), Vector2(x3 + rng.randf_range(-8, 8), y3 - hh), Vector2(x3 + 5, y3)]), gcol)

	func fire_u() -> float:
		return art.fire_frac.x

	func _ridge_band(s: Vector2, base_y: float, wave: float, w_min: float, h_mid: float, h_var: float, spacing: float, col: Color, rng: RandomNumberGenerator, tiers: int) -> void:
		var m := 60.0
		var band := PackedVector2Array([Vector2(-m, s.y + m)])
		var x := -m
		var trees: Array = []
		while x < s.x + m - 1.0:
			var y := base_y + sin(x * 0.004 + base_y) * wave + sin(x * 0.011) * wave * 0.4
			band.append(Vector2(x, y))
			var h := h_mid + rng.randf_range(-h_var, h_var)
			# Leave a gap in the trees above the clearing.
			var du := absf(x / s.x - art.fire_frac.x)
			if du < 0.1 and base_y > s.y * 0.72:
				h *= 0.5
			trees.append([Vector2(x + rng.randf_range(-6, 6), y + 4.0), h, rng.randf_range(w_min, w_min * 1.5)])
			x += spacing * rng.randf_range(0.55, 1.0)
		band.append(Vector2(s.x + m, s.y + m))
		draw_colored_polygon(band, col)
		for tr in trees:
			draw_colored_polygon(pine(tr[0], float(tr[1]), float(tr[2]), tiers, rng), col)

	func _log(c: Vector2, length: float, rad: float, rot: float, dark: Color, lit: Color, ring: Color) -> void:
		draw_set_transform(c, rot, Vector2.ONE)
		var body := ThemeFactory.flat(dark, int(rad))
		draw_style_box(body, Rect2(Vector2(-length * 0.5, -rad), Vector2(length, rad * 2.0)))
		var top := ThemeFactory.flat(lit, int(rad * 0.6))
		draw_style_box(top, Rect2(Vector2(-length * 0.5 + 6, -rad + 2), Vector2(length - 12, rad * 0.7)))
		draw_set_transform(c + Vector2(length * 0.5, 0).rotated(rot), rot, Vector2(0.42, 1.0))
		draw_circle(Vector2.ZERO, rad, ring)
		draw_arc(Vector2.ZERO, rad * 0.62, 0, TAU, 20, ring.darkened(0.3), 2.5, true)
		draw_arc(Vector2.ZERO, rad * 0.28, 0, TAU, 14, ring.darkened(0.3), 2.5, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	func _tent(base: Vector2) -> void:
		draw_set_transform(base + Vector2(20, 4), 0.0, Vector2(1.0, 0.16))
		draw_circle(Vector2.ZERO, 170.0, Color(0.02, 0.02, 0.05, 0.6))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var h := 178.0
		var apex := base + Vector2(6, -h)
		var back_apex := apex + Vector2(84, -16)
		var fl := base + Vector2(-122, 0)
		var fr := base + Vector2(98, 0)
		var br := fr + Vector2(90, -16)
		# Side panel in shadow (cool), with a hint of warm bounce at the bottom.
		draw_polygon(PackedVector2Array([apex, back_apex, br, fr]),
			PackedColorArray([Color("4a3450"), Color("2a2140"), Color("261d36"), Color("5a3a3e")]))
		# Front face lit by the fire on its left.
		draw_polygon(PackedVector2Array([apex, fr, fl]),
			PackedColorArray([Color("e0a062"), Color("8c4e34"), Color("f7bb72")]))
		# Open door with a warm lantern glow inside.
		var d_top := apex.lerp(base + Vector2(-8, 0), 0.36)
		draw_polygon(PackedVector2Array([d_top, base + Vector2(30, 0), base + Vector2(-46, 0)]),
			PackedColorArray([Color(1.0, 0.86, 0.52), Color(0.82, 0.42, 0.16), Color(1.0, 0.72, 0.34)]))
		draw_colored_polygon(PackedVector2Array([d_top, base + Vector2(-46, 0), base + Vector2(-78, 0)]), Color("b8743f"))
		draw_colored_polygon(PackedVector2Array([d_top, base + Vector2(30, 0), base + Vector2(54, 0)]), Color("6e3c2a"))
		# Seams, ridge pole, guy ropes.
		draw_line(apex, fl, Color(1.0, 0.86, 0.62, 0.7), 2.5, true)
		draw_line(apex, back_apex, Color(0.7, 0.55, 0.62, 0.55), 2.0, true)
		draw_line(apex + Vector2(0, 2), apex + Vector2(-4, -20), Color("3a2a26"), 5.0, true)
		draw_line(apex + Vector2(-3, -12), fl + Vector2(-70, 6), Color(0.95, 0.85, 0.7, 0.5), 1.6, true)
		draw_line(back_apex, br + Vector2(64, 4), Color(0.5, 0.45, 0.58, 0.45), 1.6, true)
		draw_circle(fl + Vector2(-70, 6), 3.0, Color("6a4a3a"))


class _FireGlow:
	extends _Layer
	var behind := true

	func _init(p_art: TitleArt, p_behind: bool) -> void:
		super._init(p_art)
		behind = p_behind
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var t := Time.get_ticks_msec() / 1000.0
		var fp := art.fire_point()
		var flick := 0.85 + 0.1 * sin(t * 9.0) + 0.06 * sin(t * 23.0 + 1.3)
		var glow := ThemeFactory.glow_texture()
		if behind:
			var r := 520.0 * flick
			draw_texture_rect(glow, Rect2(fp - Vector2(r, r * 0.75), Vector2(r * 2, r * 1.5)), false, Color(0.55, 0.25, 0.08, 0.5))
		else:
			var r2 := 300.0 * flick
			draw_texture_rect(glow, Rect2(fp - Vector2(r2, r2 * 0.45) + Vector2(0, 10), Vector2(r2 * 2, r2 * 0.9)), false, Color(0.7, 0.35, 0.1, 0.55))
			var r3 := 120.0 * flick
			draw_texture_rect(glow, Rect2(fp - Vector2(r3, r3) - Vector2(0, 40), Vector2(r3 * 2, r3 * 2)), false, Color(1.0, 0.6, 0.25, 0.55))


class _Fire:
	extends _Layer

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var t := Time.get_ticks_msec() / 1000.0
		var fp := art.fire_point()
		for c in get_children():
			if c is CPUParticles2D:
				(c as CPUParticles2D).position = fp - Vector2(0, 30)
		# Scorched ground and logs
		draw_set_transform(fp + Vector2(0, 8), 0.0, Vector2(1.0, 0.26))
		draw_circle(Vector2.ZERO, 82.0, Color(0.06, 0.03, 0.04, 0.7))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		_log_pair(fp)
		draw_texture_rect(ThemeFactory.glow_texture(), Rect2(fp - Vector2(70, 30), Vector2(140, 46)), false, Color(1.0, 0.45, 0.1, 0.95))
		# Flames: layered tongues, outer red-orange -> amber -> pale core.
		var tongues := [[0.0, 1.0, 0.1], [-0.42, 0.62, -0.6], [0.4, 0.7, 0.55], [-0.2, 0.84, -0.25], [0.22, 0.8, 0.3]]
		var layers := [[1.0, Color("dd3f1c")], [0.82, Color("f8701f")], [0.64, Color("ffa236")], [0.44, Color("ffd36e")], [0.24, Color("fff6d8")]]
		var H := 168.0
		var W := 74.0
		for li in layers.size():
			var L: Array = layers[li]
			var sc := float(L[0])
			var col: Color = L[1]
			for i in tongues.size():
				var tg: Array = tongues[i]
				var hf := float(tg[1])
				var flick := 0.86 + 0.1 * sin(t * (6.0 + i * 1.3) + i * 2.1) + 0.05 * sin(t * 17.0 + i * 3.0 + li)
				var hgt := H * sc * hf * flick
				var wid := W * sc * (0.55 + 0.45 * hf)
				var sway := (sin(t * 2.7 + i) * 9.0 + sin(t * 7.1 + i * 1.7) * 3.5) * sc + float(tg[2]) * 26.0 * sc
				_flame(fp + Vector2(float(tg[0]) * W * 0.9 * sc, -4), hgt, wid, sway, col)

	func _log_pair(fp: Vector2) -> void:
		for spec in [[-0.26, Color("4a2c20"), Color("8a5634")], [0.24, Color("553424"), Color("9a643c")]]:
			var rot := float(spec[0])
			draw_set_transform(fp + Vector2(0, -2), rot, Vector2.ONE)
			draw_style_box(ThemeFactory.flat(spec[1], 12), Rect2(Vector2(-72, -12), Vector2(144, 24)))
			draw_style_box(ThemeFactory.flat(spec[2], 8), Rect2(Vector2(-68, -11), Vector2(136, 8)))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		for side_v in [-1.0, 1.0]:
			var side := float(side_v)
			var rot2 := -0.26 if side < 0.0 else 0.24
			var endp := fp + Vector2(-2, -2) + Vector2(72.0 * side, 0).rotated(rot2)
			draw_set_transform(endp, rot2, Vector2(0.4, 1.0))
			draw_circle(Vector2.ZERO, 12.0, Color("c48a56"))
			draw_arc(Vector2.ZERO, 7.0, 0, TAU, 14, Color("8a5a36"), 2.0, true)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	func _flame(base: Vector2, h: float, w: float, sway: float, col: Color) -> void:
		var pts := PackedVector2Array()
		var n := 26
		for i in n:
			var a := TAU * float(i) / n
			var x := sin(a) * pow(absf(sin(a * 0.5)), 1.4)
			var y := -cos(a)
			var up := (1.0 - y) * 0.5
			pts.append(base + Vector2(x * w * 0.5 + sway * up * up, -up * h))
		draw_colored_polygon(pts, col)


class _Fireflies:
	extends _Layer
	var flies: Array = []

	func _init(p_art: TitleArt) -> void:
		super._init(p_art)
		var rng := RandomNumberGenerator.new()
		rng.seed = 99
		for i in 18:
			flies.append({"a": Vector2(rng.randf_range(0.05, 0.95), rng.randf_range(0.62, 0.92)), "r": Vector2(rng.randf_range(20, 60), rng.randf_range(10, 30)),
				"ph": rng.randf() * TAU, "sp": rng.randf_range(0.3, 0.8), "bl": rng.randf_range(0.6, 1.5)})

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var s := size
		var t := Time.get_ticks_msec() / 1000.0
		var glow := ThemeFactory.glow_texture()
		for f in flies:
			var ph := float(f["ph"])
			var sp := float(f["sp"])
			var p: Vector2 = (f["a"] as Vector2) * s + Vector2(sin(t * sp + ph) * (f["r"] as Vector2).x, cos(t * sp * 1.3 + ph) * (f["r"] as Vector2).y)
			var blink := pow(maxf(sin(t * float(f["bl"]) + ph * 3.0), 0.0), 3.0)
			if blink < 0.02:
				continue
			draw_texture_rect(glow, Rect2(p - Vector2(16, 16), Vector2(32, 32)), false, Color(0.85, 1.0, 0.45, 0.6 * blink))
			draw_circle(p, 2.2, Color(1.0, 1.0, 0.75, blink))
