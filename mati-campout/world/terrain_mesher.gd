class_name TerrainMesher
extends RefCounted
## Builds terrain ArrayMeshes: map chunks (from WorldGen's cached 2 m grid and
## TerrainMasks) and outer-ring patches (from WorldGen.outer_height).
##
## Vertex data for the terrain shader:
##   COLOR   = (path, forest, meadow, camp)
##   CUSTOM0 = (rock, sand, wet, cavity) as RGBA8 unorm
## Every patch has skirts (strips hanging below its edges) so neighbouring
## chunks at different LODs never show cracks.

const G := WorldGen.GRID
const CELL := WorldGen.CELL
const HALF := WorldGen.HALF
const FORMAT := Mesh.ARRAY_CUSTOM_RGBA8_UNORM << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT

## Quad diagonal: false = split along (x1,z0)-(x0,z1), which is how the
## HeightMapShape3D collision (Jolt) triangulates each cell, so the visible
## ground and the physics ground are the same surface (and WorldGen.height_at
## interpolates the same triangles).
static var diag_main := false


class Builder:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var cust := PackedByteArray()
	var idx := PackedInt32Array()

	func add(p: Vector3, n: Vector3, c: Color, rock: float, sand: float, wet: float, cav: float) -> int:
		verts.append(p)
		norms.append(n)
		cols.append(c)
		cust.append(clampi(int(rock * 255.0 + 0.5), 0, 255))
		cust.append(clampi(int(sand * 255.0 + 0.5), 0, 255))
		cust.append(clampi(int(wet * 255.0 + 0.5), 0, 255))
		cust.append(clampi(int(cav * 255.0 + 0.5), 0, 255))
		return verts.size() - 1

	## Copy of vertex `i` moved down by `drop` (for skirts).
	func dup_down(i: int, drop: float) -> int:
		verts.append(verts[i] - Vector3(0.0, drop, 0.0))
		norms.append(norms[i])
		cols.append(cols[i])
		for k in 4:
			cust.append(cust[i * 4 + k])
		return verts.size() - 1

	func quad(v00: int, v10: int, v01: int, v11: int, diag: bool) -> void:
		# Clockwise when seen from above (+Y), Godot's front face.
		if diag:
			idx.append(v00)
			idx.append(v10)
			idx.append(v11)
			idx.append(v00)
			idx.append(v11)
			idx.append(v01)
		else:
			idx.append(v00)
			idx.append(v10)
			idx.append(v01)
			idx.append(v10)
			idx.append(v11)
			idx.append(v01)

	## A double-sided strip hanging below the edge a-b.
	func skirt(a: int, b: int, drop: float) -> void:
		var a2 := dup_down(a, drop)
		var b2 := dup_down(b, drop)
		idx.append_array([a, b, b2, a, b2, a2, a, b2, b, a, a2, b2])

	func commit() -> ArrayMesh:
		var mesh := ArrayMesh.new()
		if idx.is_empty():
			return mesh
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		arrays[Mesh.ARRAY_NORMAL] = norms
		arrays[Mesh.ARRAY_COLOR] = cols
		arrays[Mesh.ARRAY_CUSTOM0] = cust
		arrays[Mesh.ARRAY_INDEX] = idx
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, FORMAT)
		return mesh


## One map chunk. (ix0, iz0) = grid origin, `cells` = 2 m cells per side,
## `step` = grid stride (1 = 2 m, 2 = 4 m...). Vertices are relative to `origin`.
static func build_chunk(gen: WorldGen, m: TerrainMasks, ix0: int, iz0: int, cells: int, step: int, skirt_drop: float, origin: Vector3) -> ArrayMesh:
	var b := Builder.new()
	var n := int(float(cells) / float(step)) + 1
	var h := gen.heights
	for j in n:
		var gz := mini(iz0 + j * step, G - 1)
		for i in n:
			var gx := mini(ix0 + i * step, G - 1)
			var gi := gz * G + gx
			var p := Vector3(-HALF + gx * CELL - origin.x, h[gi], -HALF + gz * CELL - origin.z)
			var pathv := m.path[gi]
			if step > 1:
				# Coarse LODs: keep trails visible (max of the neighbourhood).
				for dz in range(-1, 2):
					for dx in range(-1, 2):
						pathv = maxf(pathv, m.path[TerrainMasks.idx(gx + dx, gz + dz)] * 0.92)
			b.add(p, m.normals[gi], Color(pathv, m.forest[gi], m.meadow[gi], m.camp[gi]),
				m.rock[gi], m.sand[gi], m.wet[gi], m.cavity[gi])
	for j in n - 1:
		for i in n - 1:
			var v00 := j * n + i
			b.quad(v00, v00 + 1, v00 + n, v00 + n + 1, diag_main)
	if skirt_drop > 0.0:
		for i in n - 1:
			b.skirt(i + 1, i, skirt_drop)                               # north edge
			b.skirt((n - 1) * n + i, (n - 1) * n + i + 1, skirt_drop)    # south edge
			b.skirt(i * n, (i + 1) * n, skirt_drop)                      # west edge
			b.skirt((i + 1) * n + n - 1, i * n + n - 1, skirt_drop)      # east edge
	return b.commit()


## An outer-ring patch: `cells` x `cells` quads of `spacing` m starting at
## (x0, z0); quads whose centre lies inside the square |x|,|z| < hole are
## skipped. Heights come from WorldGen.outer_height.
static func build_outer_patch(gen: WorldGen, x0: float, z0: float, cells: int, spacing: float, hole: float, skirt_drop: float, origin: Vector3) -> ArrayMesh:
	var b := Builder.new()
	var n := cells + 1
	var gw := n + 2
	var hg := PackedFloat32Array()
	hg.resize(gw * gw)
	for j in gw:
		var z := z0 + (j - 1) * spacing
		for i in gw:
			var x := x0 + (i - 1) * spacing
			hg[j * gw + i] = gen.outer_height(x, z)
	var keep := PackedByteArray()
	keep.resize(cells * cells)
	var any := false
	for j in cells:
		for i in cells:
			var cx := x0 + (i + 0.5) * spacing
			var cz := z0 + (j + 0.5) * spacing
			var k := 0 if (absf(cx) < hole and absf(cz) < hole) else 1
			keep[j * cells + i] = k
			any = any or k == 1
	if not any:
		return b.commit()
	var wl := WorldGen.WATER_LEVEL
	for j in n:
		var z := z0 + j * spacing
		for i in n:
			var x := x0 + i * spacing
			var c := (j + 1) * gw + (i + 1)
			var y := hg[c]
			var nrm := Vector3(hg[c - 1] - hg[c + 1], 2.0 * spacing, hg[c - gw] - hg[c + gw]).normalized()
			var slope := 1.0 - nrm.y
			var avg := (hg[c - 1] + hg[c + 1] + hg[c - gw] + hg[c + gw]) * 0.25
			var cav := 1.0 - clampf((avg - y) * 6.0 / spacing, 0.0, 0.7)
			var mead := gen.meadow_factor(x, z)
			var canopy := (1.0 - mead * 0.9) * (1.0 - smoothstep(0.42, 0.7, slope)) * smoothstep(wl + 1.4, wl + 4.0, y)
			var rock := smoothstep(0.45, 0.7, slope)
			var sand := smoothstep(wl + 2.6, wl + 0.9, y) * (1.0 - rock)
			var wet := smoothstep(wl + 3.0, wl + 0.6, y)
			b.add(Vector3(x - origin.x, y, z - origin.z), nrm, Color(0.0, canopy, mead, 0.0), rock, sand, wet, cav)
	for j in cells:
		for i in cells:
			if keep[j * cells + i] == 0:
				continue
			var v00 := j * n + i
			b.quad(v00, v00 + 1, v00 + n, v00 + n + 1, true)
			if skirt_drop <= 0.0:
				continue
			# Skirts on edges that border nothing (patch edge or the hole).
			if j == 0 or keep[(j - 1) * cells + i] == 0:
				b.skirt(v00 + 1, v00, skirt_drop)
			if j == cells - 1 or keep[(j + 1) * cells + i] == 0:
				b.skirt(v00 + n, v00 + n + 1, skirt_drop)
			if i == 0 or keep[j * cells + i - 1] == 0:
				b.skirt(v00, v00 + n, skirt_drop)
			if i == cells - 1 or keep[j * cells + i + 1] == 0:
				b.skirt(v00 + n + 1, v00 + 1, skirt_drop)
	return b.commit()
