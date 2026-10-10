// Little star glints that twinkle on gatherables so kids notice them
// (fx/sparkle.gd). Camera-facing, additive, HDR so the glow pass gives each
// flash a soft halo. A bit stronger at dusk, still visible at night.
//
// INSTANCE_CUSTOM: x phase (0..1), y size (m), z speed, w strength (0..1).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, skip_vertex_transform, shadows_disabled, fog_disabled;

global uniform float night_factor;

uniform vec3 color : source_color = vec3(1.0, 0.9, 0.66);
uniform float energy = 2.6;
uniform float fade_near = 18.0;
uniform float fade_far = 30.0;
uniform float strength = 1.0;

varying float v_flash;
varying float v_rot;

void vertex() {
	vec4 c = MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0);
	float dist = max(-c.z, 0.05);
	float phase = INSTANCE_CUSTOM.x;
	float speed = INSTANCE_CUSTOM.z;
	float t = TIME * speed + phase * 6.2832;
	// Mostly dark, then a quick twinkle.
	float pulse = pow(max(sin(t), 0.0), 14.0);
	float idle = 0.09 * (0.5 + 0.5 * sin(t * 0.37 + 1.3));
	// Dusk (night_factor 0.15..0.6) is the strongest, deep night a bit less.
	float dusk = 1.0 + 0.8 * smoothstep(0.08, 0.45, night_factor) - 0.35 * smoothstep(0.75, 1.0, night_factor);
	float fade = 1.0 - smoothstep(fade_near, fade_far, dist);
	v_flash = (pulse + idle) * dusk * fade * INSTANCE_CUSTOM.w * strength;
	v_rot = t * 0.15 + phase * 3.0;
	float size = INSTANCE_CUSTOM.y * (0.65 + 0.55 * pulse);
	vec3 to_cam = normalize(-c.xyz);
	c.xyz += to_cam * 0.12;
	vec2 corner = UV * 2.0 - 1.0;
	c.xy += corner * size;
	VERTEX = c.xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
	if (v_flash < 0.002) {
		// Fully dark: collapse so it costs no fragments.
		VERTEX = vec3(0.0, 0.0, 1.0);
	}
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float cr = cos(v_rot);
	float sr = sin(v_rot);
	vec2 q = vec2(p.x * cr - p.y * sr, p.x * sr + p.y * cr);
	float r2 = dot(p, p);
	float core = exp(-r2 * 38.0);
	float halo = exp(-r2 * 7.0) * 0.18;
	float rays = exp(-abs(q.x) * 22.0) * exp(-abs(q.y) * 3.2) + exp(-abs(q.y) * 22.0) * exp(-abs(q.x) * 3.2);
	float diag = (exp(-abs(q.x + q.y) * 30.0) + exp(-abs(q.x - q.y) * 30.0)) * exp(-r2 * 9.0) * 0.35;
	float shape = core * 1.4 + rays * 0.7 + diag + halo;
	ALBEDO = color * energy * shape * v_flash;
}
