// Glowing embers / sparks rising from the campfire (MATI's Campout).
// Tiny additive billboards with a hot core that cool from yellow to deep red
// as they age, twinkling as they tumble. HDR so they bloom at night.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled, skip_vertex_transform;

uniform float brightness = 1.0;
// Stretch along the screen-space motion (0 = round dots).
uniform float twinkle = 1.0;

varying float v_seed;
varying float v_age;

void vertex() {
	v_seed = fract(float(INSTANCE_ID) * 0.7548777 + 0.31);
	v_age = clamp(INSTANCE_CUSTOM.y, 0.0, 1.0);
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	vec3 upv = normalize(INV_VIEW_MATRIX[1].xyz);
	float s = length(MODEL_MATRIX[0].xyz);
	vec3 wpos = MODEL_MATRIX[3].xyz + (right * VERTEX.x + upv * VERTEX.y) * s;
	VERTEX = (VIEW_MATRIX * vec4(wpos, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float core = 1.0 - smoothstep(0.0, 0.35, r);
	float halo = 1.0 - smoothstep(0.0, 1.0, r);
	halo *= halo;
	float tw = 0.65 + 0.35 * sin(TIME * (14.0 + v_seed * 18.0) + v_seed * 40.0);
	tw = mix(1.0, tw, twinkle);
	vec3 hot = vec3(1.0, 0.86, 0.5);
	vec3 warm = vec3(1.0, 0.45, 0.1);
	vec3 cool = vec3(0.75, 0.12, 0.03);
	vec3 col = mix(hot, warm, smoothstep(0.0, 0.45, v_age));
	col = mix(col, cool, smoothstep(0.45, 0.95, v_age));
	float life = smoothstep(0.0, 0.06, v_age) * (1.0 - smoothstep(0.7, 1.0, v_age));
	float e = (core * 5.0 + halo * 1.2) * tw * life * brightness * COLOR.a;
	ALBEDO = col * e;
	ALPHA = 1.0;
}
