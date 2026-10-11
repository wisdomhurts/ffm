// Moonmirror Lighthouse: the soft volumetric light cone (MATI's Campout).
// An open cone mesh: UV.y runs from the lens (0) to the far end (1).
// Additive, unshaded and fog-free; brightest along the axis (where the
// surface faces the viewer), fading toward the edges, the far end and the
// camera. `intensity` is set by world/landmarks/lighthouse.gd (0 by day).
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded, fog_disabled, shadows_disabled;

uniform float intensity = 0.0;
uniform vec3 beam_color : source_color = vec3(1.0, 0.86, 0.62);
uniform float softness = 2.3;

varying float v_along;

float bh(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float bnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(bh(i), bh(i + vec2(1.0, 0.0)), f.x), mix(bh(i + vec2(0.0, 1.0)), bh(i + vec2(1.0, 1.0)), f.x), f.y);
}

void vertex() {
	v_along = UV.y;
}

void fragment() {
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	float core = pow(facing, softness);
	float along = clamp(v_along, 0.0, 1.0);
	// Bright near the lens, then a long faint tail that still sweeps over the
	// camp across the lake, fading out at the very end.
	float fade = mix(1.0, 0.22, smoothstep(0.0, 0.45, along)) * (1.0 - smoothstep(0.82, 1.0, along));
	fade *= smoothstep(0.0, 0.012, along);
	// Slowly drifting dust and haze in the beam.
	float dust = 0.78 + 0.22 * bnoise(vec2(along * 55.0 - TIME * 0.5, UV.x * 5.0 + TIME * 0.1));
	// Fade out when the camera is right next to (or inside) the cone.
	float near = smoothstep(1.0, 9.0, -VERTEX.z);
	ALBEDO = beam_color;
	ALPHA = clamp(intensity * core * fade * dust * near, 0.0, 1.0);
}
