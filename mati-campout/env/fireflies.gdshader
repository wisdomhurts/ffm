// Fireflies: soft additive billboards that blink in slow, random pulses.
// HDR output so the glow pass gives each one a little halo.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 color : source_color = vec3(0.78, 1.0, 0.38);
uniform float energy = 6.0;
uniform float visibility = 1.0;

varying float blink;

void vertex() {
	// Face the camera, keep the particle's position and scale.
	vec3 scl = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	mat4 bb = mat4(INV_VIEW_MATRIX[0] * scl.x, INV_VIEW_MATRIX[1] * scl.y, INV_VIEW_MATRIX[2] * scl.z, MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = VIEW_MATRIX * bb;
	float seed = fract(sin(float(INSTANCE_ID) * 12.9898 + 4.1) * 43758.5453);
	float t = TIME * (0.55 + seed * 0.6) + seed * 37.0;
	float pulse = pow(max(sin(t), 0.0), 10.0);
	float life = INSTANCE_CUSTOM.y;
	float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.82, 1.0, life));
	blink = (0.06 + pulse) * fade;
}

void fragment() {
	vec2 c = UV * 2.0 - 1.0;
	float d = dot(c, c);
	float core = exp(-d * 22.0);
	float halo = exp(-d * 5.0) * 0.28;
	ALBEDO = color * energy * (core + halo) * blink * visibility;
}
