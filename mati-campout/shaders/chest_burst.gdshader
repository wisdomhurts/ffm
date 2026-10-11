// Light effects for treasure chests (MATI's Campout, world/chest.gd).
//   mode 0  rays: soft shafts of light rising out of an opened chest (on an
//           open cone mesh; `height` = the cone's height)
//   mode 1  flash: a camera-facing glow at the chest mouth
//   mode 2  ground glow: a soft pulsing disc under golden chests
// Additive, unshaded, HDR so the glow pass gives them a halo. `amount`
// (0..1) is animated by the script; plain uniforms only.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled, skip_vertex_transform;

uniform int mode = 0;
uniform vec3 color : source_color = vec3(1.0, 0.82, 0.45);
uniform float intensity = 2.0;
uniform float amount = 1.0;
uniform float height = 1.8;
uniform float seed = 0.0;

varying float v_h;
varying float v_ang;

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

float noise1(float x) {
	float i = floor(x);
	float f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(hash11(i + seed * 17.0), hash11(i + 1.0 + seed * 17.0), f);
}

void vertex() {
	v_h = VERTEX.y / max(height, 0.01) + 0.5;
	v_ang = atan(VERTEX.z, VERTEX.x);
	if (mode == 1) {
		vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
		vec3 upv = normalize(INV_VIEW_MATRIX[1].xyz);
		float s = length(MODEL_MATRIX[0].xyz);
		vec3 wpos = MODEL_MATRIX[3].xyz + (right * VERTEX.x + upv * VERTEX.y) * s;
		// Pull toward the camera so the chest does not clip the glow.
		vec3 to_cam = normalize(INV_VIEW_MATRIX[3].xyz - wpos);
		wpos += to_cam * 0.35 * s;
		VERTEX = (VIEW_MATRIX * vec4(wpos, 1.0)).xyz;
	} else {
		VERTEX = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	}
	NORMAL = vec3(0.0, 0.0, 1.0);
}

void fragment() {
	float a = 0.0;
	vec3 col = color;
	if (mode == 0) {
		// Shafts: a few bright streaks around the cone, slowly turning.
		float u = v_ang / 6.2831853;
		float sh = noise1(u * 22.0 + TIME * 0.6) * 0.6 + noise1(u * 47.0 - TIME * 0.9) * 0.4;
		sh = pow(sh, 2.2) * 1.8;
		float fade = smoothstep(0.0, 0.08, v_h) * pow(1.0 - clamp(v_h, 0.0, 1.0), 1.6);
		a = sh * fade;
		col = mix(color, vec3(1.0, 0.95, 0.82), 0.25 * (1.0 - v_h));
	} else if (mode == 1) {
		vec2 p = UV * 2.0 - 1.0;
		float r2 = dot(p, p);
		float core = exp(-r2 * 9.0);
		float halo = exp(-r2 * 2.6) * 0.35;
		float star = (exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 2.4) + exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 2.4)) * 0.6;
		a = core + halo + star;
		col = mix(color, vec3(1.0, 0.98, 0.92), core * 0.6);
	} else {
		vec2 p = UV * 2.0 - 1.0;
		float r = length(p);
		float pulse = 0.82 + 0.18 * sin(TIME * 1.5 + seed * 6.0);
		a = (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r)) * pulse;
	}
	ALBEDO = col * a * intensity * amount;
	ALPHA = 1.0;
}
