class_name ShaderCompat
extends RefCounted
## Per-object shader values that work on every renderer.
##
## Forward+ gives every object its own `instance uniform` slots cheaply. The
## Compatibility renderer (browsers, phones) keeps all instance uniforms in
## one small uniform buffer: 16 slots per object, 4096 slots on desktop WebGL
## and as few as 1024 on iPhones, i.e. only ~255 / ~63 objects in total. A
## forest of MultiMesh chunks, a character (19 parts) and a few pickups use
## that up and the rest render with garbage values (plus an error each).
##
## So under Compatibility the shaders listed here are loaded with their
## `instance uniform`s rewritten to plain `uniform`s, and set_param() gives
## the object its own copy of the material instead. Under Forward+ nothing
## changes: shader() returns the original and set_param() is
## set_instance_shader_parameter().
##
##   mat.shader = ShaderCompat.shader("res://shaders/character.gdshader")
##   ShaderCompat.set_param(mesh_instance, "hit_flash", 0.8)

static var _shaders: Dictionary = {}
static var _hint_re: RegEx = null


## True when the renderer handles instance uniforms well (Forward+ / Mobile).
static func instance_uniforms_ok() -> bool:
	return not Platform.is_compat_renderer()


## The shader to use for a path (or an already loaded Shader).
static func shader(src: Variant) -> Shader:
	var base: Shader = null
	if src is Shader:
		base = src
	elif src is String or src is StringName:
		base = load(str(src)) as Shader
	if base == null or instance_uniforms_ok():
		return base
	var key := base.resource_path if base.resource_path != "" else str(base.get_instance_id())
	if _shaders.has(key):
		return _shaders[key]
	var code := base.code
	if not "instance uniform" in code:
		_shaders[key] = base
		return base
	_shaders[key] = convert_code(code)
	return _shaders[key]


## Shader source with instance uniforms turned into plain uniforms (pure,
## unit-tested).
static func convert_code(code: String) -> Shader:
	var s := Shader.new()
	s.code = convert_source(code)
	return s


static func convert_source(code: String) -> String:
	if _hint_re == null:
		_hint_re = RegEx.new()
		# ": instance_index(2)" alone, or ", instance_index(2)" after other hints.
		_hint_re.compile("\\s*[:,]\\s*instance_index\\s*\\(\\s*\\d+\\s*\\)")
	var out := code.replace("instance uniform ", "uniform ")
	return _hint_re.sub(out, "", true)


## Set a per-object shader value on a GeometryInstance3D.
static func set_param(gi: GeometryInstance3D, param: StringName, value: Variant) -> void:
	if gi == null or not is_instance_valid(gi):
		return
	if instance_uniforms_ok():
		gi.set_instance_shader_parameter(param, value)
		return
	for m in _own_materials(gi):
		(m as ShaderMaterial).set_shader_parameter(param, value)


## The object's private material copies (made on first use; remade if its
## mesh changed since).
static func _own_materials(gi: GeometryInstance3D) -> Array:
	var mesh_id := 0
	var mi := gi as MeshInstance3D
	if mi and mi.mesh:
		mesh_id = mi.mesh.get_instance_id()
	var me := gi.get_instance_id()
	if gi.has_meta("_sc_mats") and int(gi.get_meta("_sc_mesh", 0)) == mesh_id and int(gi.get_meta("_sc_owner", 0)) == me:
		return gi.get_meta("_sc_mats")
	var out: Array = []
	if gi.material_override is ShaderMaterial:
		var d := _own_copy(gi.material_override as ShaderMaterial, me)
		gi.material_override = d
		out.append(d)
	elif mi and mi.mesh:
		for i in mi.mesh.get_surface_count():
			var src := mi.get_active_material(i)
			if src is ShaderMaterial:
				var d := _own_copy(src as ShaderMaterial, me)
				mi.set_surface_override_material(i, d)
				out.append(d)
	gi.set_meta("_sc_mats", out)
	gi.set_meta("_sc_mesh", mesh_id)
	gi.set_meta("_sc_owner", me)
	return out


## The material itself if this object already owns it, else a copy it owns.
static func _own_copy(m: ShaderMaterial, owner_id: int) -> ShaderMaterial:
	if int(m.get_meta("_sc_owner", 0)) == owner_id:
		return m
	var d := m.duplicate() as ShaderMaterial
	d.set_meta("_sc_owner", owner_id)
	return d


## Compatibility renderer: a MultiMesh without per-instance colours hands the
## shader COLOR = black (vertex colour x an all-zero instance colour), which
## turned grass, bark and rocks black in the browser. Call this right before
## `mm.instance_count = n`; then fill_colors(mm) after the count is set.
static func prepare_multimesh(mm: MultiMesh) -> void:
	mm.use_colors = Platform.is_compat_renderer()


## White instance colours for a MultiMesh prepared with prepare_multimesh().
static func fill_colors(mm: MultiMesh, from: int = 0) -> void:
	if not mm.use_colors:
		return
	for i in range(from, mm.instance_count):
		mm.set_instance_color(i, Color.WHITE)
