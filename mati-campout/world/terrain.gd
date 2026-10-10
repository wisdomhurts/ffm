class_name Terrain
extends Node3D
## Terrain meshes, collision, lake and stream water.
## STUB: replaced by the terrain build. Must keep: setup(game).

const CHUNK := 64.0


func setup(game: Game) -> void:
	var gen := game.gen
	var body := StaticBody3D.new()
	body.name = "TerrainBody"
	add_child(body)
	var shape := HeightMapShape3D.new()
	shape.map_width = WorldGen.GRID
	shape.map_depth = WorldGen.GRID
	var data := PackedFloat32Array()
	data.resize(WorldGen.GRID * WorldGen.GRID)
	for i in data.size():
		data[i] = gen.heights[i] / WorldGen.CELL
	shape.map_data = data
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.scale = Vector3.ONE * WorldGen.CELL
	body.add_child(cs)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	var n := int(WorldGen.HALF * 2.0 / CHUNK)
	for cz in n:
		for cx in n:
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			var x0 := -WorldGen.HALF + cx * CHUNK
			var z0 := -WorldGen.HALF + cz * CHUNK
			var steps := int(CHUNK / WorldGen.CELL)
			for iz in steps:
				for ix in steps:
					var xa := x0 + ix * WorldGen.CELL
					var za := z0 + iz * WorldGen.CELL
					var xb := xa + WorldGen.CELL
					var zb := za + WorldGen.CELL
					for v in [Vector2(xa, za), Vector2(xb, za), Vector2(xa, zb), Vector2(xb, za), Vector2(xb, zb), Vector2(xa, zb)]:
						var h := gen.height_at(v.x, v.y)
						st.set_color(Color(0.2, 0.3, 0.6) if h < WorldGen.WATER_LEVEL else Color(0.3, 0.45, 0.22))
						st.add_vertex(Vector3(v.x, h, v.y))
			st.generate_normals()
			var mi := MeshInstance3D.new()
			mi.mesh = st.commit()
			mi.material_override = mat
			add_child(mi)
		await get_tree().process_frame
