// Soft contact shadow under a treasure chest (MATI's Campout, world/chest.gd):
// a dark, blurred blob that grounds the chest on grass and dirt even where
// the sun shadow is faint (overcast, dusk, low quality). Plain uniforms only.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform float strength = 0.6;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	// Rounded-rectangle falloff (the chest's footprint) with soft edges.
	vec2 q = abs(p) - vec2(0.42, 0.36);
	float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0);
	float a = 1.0 - smoothstep(-0.25, 0.55, d);
	ALBEDO = vec3(0.035, 0.03, 0.025);
	ALPHA = a * a * strength;
}
