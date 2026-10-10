// Fallback water for the Compatibility renderer (browser / phones): no screen
// or depth texture reads, plain alpha blending with fresnel and moving
// ripples. Used for both the lake and the stream (flow = true).
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

#include "res://shaders/terrain_common.gdshaderinc"

global uniform float night_factor;
global uniform float wind_strength;

uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform vec3 shallow_col : source_color = vec3(0.22, 0.50, 0.47);
uniform vec3 deep_col : source_color = vec3(0.04, 0.17, 0.21);
uniform bool flow = false;
uniform float flow_speed = 0.8;

varying vec4 v_col;

void vertex() {
	v_col = COLOR;
}

void fragment() {
	vec3 wpos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 n;
	if (flow) {
		float speed = flow_speed * (0.5 + v_col.r * 3.0);
		n = tc_nmap(texture(normal_tex, vec2(UV.x * 0.9, UV.y * 0.22 - TIME * speed * 0.22))) * 0.3;
	} else {
		n = tc_nmap(texture(normal_tex, wpos.xz * 0.04 + TIME * 0.01)) * 0.15
			+ tc_nmap(texture(normal_tex, wpos.xz * 0.009 - TIME * 0.003)) * 0.12;
		n *= 0.7 + wind_strength;
	}
	vec3 Nv = normalize((VIEW_MATRIX * vec4(normalize(vec3(n.x, 1.0, n.y)), 0.0)).xyz);
	float ndv = clamp(dot(Nv, -normalize(VERTEX)), 0.0, 1.0);
	float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
	vec3 c = flow ? shallow_col : mix(shallow_col, deep_col, 0.65);
	c = mix(c, c * vec3(0.55, 0.65, 0.95), night_factor * 0.5);
	ALBEDO = c;
	ALPHA = mix(flow ? 0.55 : 0.8, 0.97, fres) * (flow ? v_col.a : 1.0);
	ROUGHNESS = 0.06;
	SPECULAR = 0.5;
	NORMAL = Nv;
}
