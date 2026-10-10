// Golden star sparkles bursting out of an opened chest (MATI's Campout,
// world/chest.gd GPUParticles3D draw pass). Camera-facing four-point stars
// that twinkle and fade with the particle colour ramp (COLOR). HDR, additive.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled, skip_vertex_transform;

uniform float brightness = 2.4;

varying float v_seed;
varying float v_rot;

void vertex() {
	v_seed = fract(float(INSTANCE_ID) * 0.7548777 + 0.31);
	v_rot = v_seed * 6.28 + TIME * (v_seed - 0.5) * 3.0;
	vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
	vec3 upv = normalize(INV_VIEW_MATRIX[1].xyz);
	float s = length(MODEL_MATRIX[0].xyz);
	vec3 wpos = MODEL_MATRIX[3].xyz + (right * VERTEX.x + upv * VERTEX.y) * s;
	VERTEX = (VIEW_MATRIX * vec4(wpos, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float cr = cos(v_rot);
	float sr = sin(v_rot);
	vec2 q = vec2(p.x * cr - p.y * sr, p.x * sr + p.y * cr);
	float r2 = dot(p, p);
	float core = exp(-r2 * 30.0);
	float rays = exp(-abs(q.x) * 16.0) * exp(-abs(q.y) * 2.8) + exp(-abs(q.y) * 16.0) * exp(-abs(q.x) * 2.8);
	float halo = exp(-r2 * 6.0) * 0.2;
	float tw = 0.7 + 0.3 * sin(TIME * (11.0 + v_seed * 14.0) + v_seed * 30.0);
	float shape = core * 1.6 + rays * 0.8 + halo;
	ALBEDO = COLOR.rgb * shape * tw * brightness * COLOR.a;
	ALPHA = 1.0;
}
