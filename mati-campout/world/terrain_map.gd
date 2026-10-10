class_name TerrainMap
extends RefCounted
## Paints the storybook top-down map of the terrain (north up): parchment
## tones, hill shading and contour lines, stippled forest, meadows, rocky
## ridge, beaches, the lake with depth bands and a foam shoreline, trails,
## the stream and the camp clearing. Landmark icons and the player arrow are
## drawn on top by the map UI.
##
## Painted at the native 2 m grid (321 x 321) and resampled to the requested
## size, so a 512 px map takes a fraction of a second.

const G := WorldGen.GRID

const PARCHMENT := Color(0.89, 0.83, 0.67)
const INK := Color(0.29, 0.22, 0.15)
const MEADOW := Color(0.71, 0.75, 0.47)
const GRASS := Color(0.55, 0.65, 0.38)
const FOREST := Color(0.30, 0.45, 0.29)
const FOREST_DARK := Color(0.20, 0.33, 0.22)
const ROCK := Color(0.62, 0.58, 0.52)
const SAND := Color(0.90, 0.82, 0.62)
const TRAIL := Color(0.62, 0.42, 0.24)
const CAMP := Color(0.78, 0.58, 0.36)
const SHALLOW := Color(0.50, 0.72, 0.74)
const DEEP := Color(0.20, 0.38, 0.52)
const STREAM := Color(0.33, 0.56, 0.68)


static func paint(gen: WorldGen, m: TerrainMasks, px: int) -> Image:
	var img := Image.create(G, G, false, Image.FORMAT_RGB8)
	var h := gen.heights
	var wl := WorldGen.WATER_LEVEL
	var light := Vector3(-0.55, 0.72, -0.42).normalized()
	var dots := FastNoiseLite.new()
	dots.seed = 77
	dots.noise_type = FastNoiseLite.TYPE_CELLULAR
	dots.frequency = 0.33
	dots.cellular_return_type = FastNoiseLite.RETURN_DISTANCE
	var paper := FastNoiseLite.new()
	paper.seed = 78
	paper.frequency = 0.035
	paper.fractal_octaves = 3
	var ph := WorldGen.PLAYABLE_HALF
	for iz in G:
		var row := iz * G
		var z := -WorldGen.HALF + iz * WorldGen.CELL
		for ix in G:
			var i := row + ix
			var x := -WorldGen.HALF + ix * WorldGen.CELL
			var y := h[i]
			var c: Color
			if y < wl:
				var depth := clampf((wl - y) / 5.5, 0.0, 1.0)
				# Depth bands like an old chart.
				var band := floorf(depth * 4.0) / 4.0
				c = SHALLOW.lerp(DEEP, lerpf(depth, band, 0.5))
				# Foam line along the shore.
				c = c.lerp(Color(0.93, 0.95, 0.9), smoothstep(wl - 0.35, wl - 0.02, y) * 0.7)
				# Gentle ripple hatching.
				var rip := sin((x * 0.21 + z * 0.13) + paper.get_noise_2d(x, z) * 6.0)
				c = c.lerp(c.lightened(0.12), smoothstep(0.85, 1.0, rip) * 0.5)
			else:
				var forest := m.forest[i]
				c = GRASS.lerp(MEADOW, clampf(m.meadow[i] * 1.2, 0.0, 1.0))
				# Stippled forest: crown dots over a darker wash.
				var fw := smoothstep(0.15, 0.55, forest)
				var crown := 1.0 - smoothstep(0.25, 0.55, dots.get_noise_2d(x, z) * 0.5 + 0.5)
				c = c.lerp(FOREST, fw * 0.8)
				c = c.lerp(FOREST_DARK, fw * crown * 0.75)
				c = c.lerp(ROCK, smoothstep(0.35, 0.7, m.rock[i]) * 0.85)
				c = c.lerp(SAND, smoothstep(0.3, 0.6, m.sand[i]))
				c = c.lerp(CAMP, smoothstep(0.35, 0.7, m.camp[i]) * 0.8)
				# Trails: warm brown with a lighter centre.
				var pf := smoothstep(0.28, 0.62, m.path[i])
				c = c.lerp(TRAIL.darkened(0.25), pf * 0.95)
				c = c.lerp(TRAIL.lightened(0.15), smoothstep(0.75, 1.0, m.path[i]) * 0.6)
				# Stream.
				var sd := m.stream_dist[i]
				c = c.lerp(STREAM, smoothstep(3.2, 1.6, sd))
				# Hill shading.
				var n := m.normals[i]
				var shade := clampf(0.78 + n.dot(light) * 0.5 - (1.0 - n.y) * 0.4, 0.55, 1.18)
				c = Color(c.r * shade, c.g * shade, c.b * shade)
				# Contour lines every 4 m.
				var band_here := floori(y / 4.0)
				var band_r := floori(h[row + mini(ix + 1, G - 1)] / 4.0)
				var band_d := floori(h[mini(iz + 1, G - 1) * G + ix] / 4.0)
				if band_here != band_r or band_here != band_d:
					c = c.lerp(INK, 0.22)
			# Parchment wash and grain.
			var grain := paper.get_noise_2d(x * 3.0, z * 3.0)
			c = c.lerp(PARCHMENT, 0.16 + grain * 0.05)
			# Outside the playable square: faded.
			if absf(x) > ph or absf(z) > ph:
				c = c.lerp(PARCHMENT.darkened(0.15), 0.45)
			img.set_pixel(ix, iz, c)
	if px != G:
		img.resize(px, px, Image.INTERPOLATE_CUBIC)
	_vignette(img)
	return img


## Darken the edges slightly like an old paper map.
static func _vignette(img: Image) -> void:
	var w := img.get_width()
	var border := maxi(int(w * 0.035), 2)
	for y in w:
		for x in w:
			var d := mini(mini(x, y), mini(w - 1 - x, w - 1 - y))
			if d >= border:
				continue
			var k := 1.0 - float(d) / border
			var c := img.get_pixel(x, y)
			img.set_pixel(x, y, c.lerp(INK, k * k * 0.35))
