// Glowing shadow-creature eyes: camera-facing almond glints with a soft halo.
//
// Each eye is a quad whose four vertices share the eye centre (VERTEX); UV
// gives the corner. The quad is expanded in view space so far-away eyes keep
// a minimum on-screen size (a Watcher's pale eyes stay readable between the
// trees). NORMAL is the eye's forward direction and TANGENT its "right"
// direction (both skinned with the head) so the glints fade when the creature
// looks away and tilt with the head.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, skip_vertex_transform, fog_disabled, shadows_disabled;

uniform vec3 eye_color : source_color = vec3(1.0, 0.45, 0.12);
uniform vec3 core_color : source_color = vec3(1.0, 0.86, 0.6);
uniform float energy = 5.0;
uniform float core_size = 0.045;
uniform float halo_size = 0.2;
uniform float min_angle = 0.0018;
uniform float aspect = 0.55;

instance uniform float eye_flare : instance_index(3) = 0.0;
instance uniform float dissolve : instance_index(0) = 0.0;

varying float facing;
varying float core_frac;
varying float fade_far;

void vertex() {
	vec4 c = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec3 fwd = normalize((MODELVIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 right = (MODELVIEW_MATRIX * vec4(TANGENT, 0.0)).xyz;
	vec3 to_cam = normalize(-c.xyz);
	facing = dot(fwd, to_cam);
	float dist = max(-c.z, 0.05);
	float size = max(halo_size * (1.0 + eye_flare * 0.3), dist * min_angle * 3.0);
	core_frac = clamp(max(core_size, dist * min_angle) / size, 0.02, 1.0);
	fade_far = 1.0 - smoothstep(70.0, 110.0, dist);
	// Screen-space basis that follows the head roll.
	vec2 r2 = right.xy;
	r2 = length(r2) > 0.0001 ? normalize(r2) : vec2(1.0, 0.0);
	vec2 u2 = vec2(-r2.y, r2.x);
	vec2 corner = UV * 2.0 - 1.0;
	c.xyz += to_cam * 0.05;
	c.xy += (r2 * corner.x + u2 * corner.y) * size;
	VERTEX = c.xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	vec2 q = p / vec2(core_frac, core_frac * aspect);
	float r = length(q);
	float core = 1.0 - smoothstep(0.55, 1.0, r);
	float hot = 1.0 - smoothstep(0.0, 0.6, r);
	float halo = exp(-dot(p, p) * 4.5) * 0.16;
	float vis = smoothstep(-0.15, 0.4, facing) * (1.0 - smoothstep(0.05, 0.6, dissolve)) * fade_far;
	float e = energy * (1.0 + 1.3 * eye_flare);
	vec3 col = eye_color * (core * e + halo * energy * (1.0 + 0.8 * eye_flare));
	col += core_color * hot * e * 0.45;
	ALBEDO = col * vis;
}
