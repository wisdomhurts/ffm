// Small camera-facing progress ring shown above a gatherable while the
// player is gathering it. Drawn on top of everything (no depth test) so
// leaves never hide it.
shader_type spatial;
render_mode unshaded, blend_mix, depth_test_disabled, depth_draw_never, cull_disabled, skip_vertex_transform, shadows_disabled, fog_disabled;

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform float alpha = 1.0;
uniform float size = 0.17;
uniform vec3 fill_color : source_color = vec3(1.0, 0.76, 0.34);
uniform vec3 track_color : source_color = vec3(0.07, 0.06, 0.09);

void vertex() {
	vec4 c = MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0);
	float dist = max(-c.z, 0.05);
	// Keep a readable on-screen size when far, never huge when close.
	float s = max(size, dist * 0.022);
	c.xy += (UV * 2.0 - 1.0) * s;
	VERTEX = c.xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	p.y = -p.y;
	float r = length(p);
	float aa = fwidth(r) * 1.2;
	// Angle clockwise from 12 o'clock, 0..1.
	float ang = fract(atan(p.x, p.y) / 6.2832 + 1.0);
	float band = smoothstep(0.58 - aa, 0.58 + aa, r) * (1.0 - smoothstep(0.9 - aa, 0.9 + aa, r));
	float outline = smoothstep(0.52 - aa, 0.52 + aa, r) * (1.0 - smoothstep(0.98 - aa, 0.98 + aa, r));
	float done = step(ang, progress);
	vec3 col = mix(track_color, fill_color * 1.25, done * band);
	// Soft inner disc so the ring reads on any background.
	float disc = 1.0 - smoothstep(0.52 - aa, 0.52 + aa, r);
	float a = max(outline * mix(0.55, 1.0, done * band), disc * 0.28);
	col = mix(col, track_color, disc);
	ALBEDO = col;
	ALPHA = a * alpha;
}
