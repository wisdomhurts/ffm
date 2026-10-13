// Tiny glowing violet motes for shadow puffs (hit / defeat feedback).
// Additive, unshaded, billboarded particles; COLOR from the colour ramp.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 spark_color : source_color = vec3(0.72, 0.45, 1.0);
uniform float energy = 2.6;

void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(
		vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0),
		vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0),
		vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0),
		vec4(0.0, 0.0, 0.0, 1.0));
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float d = dot(p, p);
	float core = exp(-d * 9.0);
	float halo = exp(-d * 2.5) * 0.3;
	ALBEDO = spark_color * COLOR.rgb * (core + halo) * energy * COLOR.a;
}
