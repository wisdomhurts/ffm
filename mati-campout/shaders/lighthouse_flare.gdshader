// Moonmirror Lighthouse: the glow of the lamp seen from afar (MATI's Campout).
// A camera-facing quad pushed a little toward the viewer so the halo sits in
// front of the lantern room. `intensity` is set every frame by
// world/landmarks/lighthouse.gd: a steady night glow plus a bright flash when
// the rotating beam sweeps past the camera.
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded, fog_disabled, shadows_disabled;

uniform float intensity = 0.0;
uniform vec3 flare_color : source_color = vec3(1.0, 0.82, 0.55);
uniform float push = 2.6;

void vertex() {
	// Billboard: keep the quad's size, face the camera.
	vec3 center = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	vec3 up = normalize(INV_VIEW_MATRIX[1].xyz);
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - center);
	// Grow with distance so the lamp still reads as a bright star across the lake.
	float dist = length(CAMERA_POSITION_WORLD - center);
	float sx = length(MODEL_MATRIX[0].xyz) * max(1.0, dist / 70.0);
	vec3 wp = center + to_cam * push + (right * VERTEX.x + up * VERTEX.y) * sx;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(wp, 1.0);
}

void fragment() {
	vec2 d = UV * 2.0 - 1.0;
	float r = length(d);
	float halo = exp(-r * r * 9.0) * 0.9 + exp(-r * 3.2) * 0.25;
	// Four soft streaks for a lens-like sparkle.
	float streak = exp(-abs(d.y) * 40.0) * exp(-abs(d.x) * 2.5) + exp(-abs(d.x) * 40.0) * exp(-abs(d.y) * 2.5);
	float a = (halo + streak * 0.35) * (1.0 - smoothstep(0.85, 1.0, r));
	ALBEDO = flare_color;
	ALPHA = clamp(a * intensity, 0.0, 1.0);
}
