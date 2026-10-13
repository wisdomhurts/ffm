// Forest silhouettes on the far shore and far hills, with the backdrop's own
// distance haze (engine fog disabled). See backdrop_trees.gdshader.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx, fog_disabled;

global uniform float wetness;

uniform vec3 haze_color : source_color = vec3(0.62, 0.70, 0.80);
uniform float haze_density = 0.0011;
uniform float haze_max = 0.8;
uniform float haze_energy = 1.0;
uniform vec3 sun_dir = vec3(0.0, 0.5, 0.8);
uniform vec3 sun_scatter : source_color = vec3(0.0);

varying vec4 v_inst;
varying vec3 v_world;

void vertex() {
	v_inst = INSTANCE_CUSTOM;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 c = pow(COLOR.rgb, vec3(2.2));
	c *= mix(0.7, 1.3, v_inst.x);
	c = mix(c, c * vec3(1.15, 1.05, 0.75), v_inst.y * 0.5);
	c *= mix(1.0, 0.75, wetness);
	float dist = length(v_world - CAMERA_POSITION_WORLD);
	float haze = clamp(1.0 - exp(-dist * haze_density) + (1.0 - smoothstep(0.0, 120.0, v_world.y)) * 0.08, 0.0, haze_max);
	vec3 vdir = normalize(v_world - CAMERA_POSITION_WORLD);
	vec3 hc = haze_color + sun_scatter * pow(max(dot(vdir, normalize(sun_dir)), 0.0), 6.0);
	ALBEDO = c * (1.0 - haze);
	EMISSION = hc * haze * haze_energy;
	ROUGHNESS = 0.9;
	SPECULAR = 0.15;
}
