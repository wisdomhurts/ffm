// Rain streaks (GPUParticles3D draw pass, aligned to velocity by the emitter).
// Unshaded for speed; brightness follows the scene light (set per frame) and
// drops near the campfire pick up a warm glow from the shared fire globals.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

global uniform vec3 fire_position;
global uniform float fire_strength;
global uniform float night_factor;

uniform vec4 tint : source_color = vec4(0.74, 0.79, 0.86, 0.28);
uniform float brightness = 1.0;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float a = smoothstep(0.0, 0.4, UV.y) * smoothstep(1.0, 0.7, UV.y);
	float x = UV.x * 2.0 - 1.0;
	a *= 1.0 - x * x;
	float fd = distance(world_pos, fire_position);
	vec3 fire = vec3(1.0, 0.56, 0.24) * fire_strength * (0.3 + night_factor) * 1.6 / (1.0 + fd * fd * 0.15);
	ALBEDO = tint.rgb * brightness + fire;
	// Drops right at the camera would be huge smears: fade them out.
	float near_fade = smoothstep(1.5, 4.5, length(VERTEX));
	ALPHA = a * tint.a * near_fade;
}
