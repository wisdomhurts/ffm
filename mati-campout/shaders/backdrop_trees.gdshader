// Distant forest silhouettes beyond the map edge: instanced low-poly firs,
// darker inside, lighter tips; per-instance tint. Engine fog like the map.
//   COLOR.rgb      albedo (sRGB)
//   INSTANCE_CUSTOM.x  brightness (0.5 = 1x), .y  warmth (0..1)
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

global uniform float wetness;

varying vec4 v_inst;

void vertex() {
	v_inst = INSTANCE_CUSTOM;
}

void fragment() {
	vec3 c = pow(COLOR.rgb, vec3(2.2));
	c *= mix(0.7, 1.3, v_inst.x);
	c = mix(c, c * vec3(1.15, 1.05, 0.75), v_inst.y * 0.5);
	c *= mix(1.0, 0.75, wetness);
	ALBEDO = c;
	ROUGHNESS = 0.9;
	SPECULAR = 0.15;
}
