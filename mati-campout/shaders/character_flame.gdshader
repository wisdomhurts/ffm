// Additive glow sprites for held items and pickups (MATI's Campout):
//   mode 0  torch flame (upright, flickering teardrop)
//   mode 1  soft round glow
//   mode 2  star flash (muzzle flash, hit spark)
// billboard = 1 faces the camera (flames stay upright), 0 = use the mesh as is
// (e.g. a ground glow disc). Draw on a QuadMesh with UVs 0..1.
shader_type spatial;
render_mode blend_add, unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform int mode = 0;
uniform int billboard = 1;
uniform vec4 core_color : source_color = vec4(1.0, 0.86, 0.5, 1.0);
uniform vec4 edge_color : source_color = vec4(1.0, 0.36, 0.06, 1.0);
uniform float intensity = 1.6;
uniform float flicker_speed = 1.0;

instance uniform float fade = 1.0;
instance uniform float seed = 0.0;

void vertex() {
	if (billboard == 1) {
		vec3 sx = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
		vec3 origin = MODEL_MATRIX[3].xyz;
		vec3 cam = INV_VIEW_MATRIX[3].xyz;
		vec3 up = vec3(0.0, 1.0, 0.0);
		vec3 to_cam = cam - origin;
		to_cam.y = (mode == 0) ? 0.0 : to_cam.y;
		if (length(to_cam) < 0.0001) {
			to_cam = vec3(0.0, 0.0, 1.0);
		}
		to_cam = normalize(to_cam);
		vec3 right;
		if (mode == 0) {
			right = normalize(cross(up, to_cam));
		} else {
			right = INV_VIEW_MATRIX[0].xyz;
			up = INV_VIEW_MATRIX[1].xyz;
			to_cam = INV_VIEW_MATRIX[2].xyz;
		}
		mat4 world = mat4(vec4(right * sx.x, 0.0), vec4(up * sx.y, 0.0), vec4(to_cam * sx.z, 0.0), vec4(origin, 1.0));
		MODELVIEW_MATRIX = VIEW_MATRIX * world;
	}
}

float hash(float n) {
	return fract(sin(n) * 43758.5453);
}

float noise1(float x) {
	float i = floor(x);
	float f = fract(x);
	return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}

void fragment() {
	vec2 uv = UV;
	float t = TIME * flicker_speed + seed * 13.7;
	float d = 0.0;
	vec3 col = core_color.rgb;
	if (mode == 0) {
		// Upright flame: y = 0 at the base, 1 at the tip.
		float y = 1.0 - uv.y;
		float x = (uv.x - 0.5) * 2.0;
		float sway = (noise1(t * 3.1) - 0.5) * 0.35 * y * y;
		x -= sway + sin(y * 9.0 - t * 11.0) * 0.06 * y;
		float width = 0.62 * pow(max(1.0 - y, 0.0), 0.65) * smoothstep(0.0, 0.22, y + 0.05);
		width *= 0.85 + 0.15 * noise1(t * 7.0 + y * 3.0);
		float body = smoothstep(width, width * 0.25, abs(x));
		float tip = smoothstep(1.0, 0.55, y);
		d = body * tip;
		float core = smoothstep(width * 0.55, 0.0, abs(x)) * smoothstep(0.75, 0.15, y);
		col = mix(edge_color.rgb, core_color.rgb, clamp(core * 1.4 + (1.0 - y) * 0.2, 0.0, 1.0));
		d = clamp(d * (0.7 + core * 0.8), 0.0, 1.0);
	} else if (mode == 1) {
		float r = length(uv - vec2(0.5)) * 2.0;
		d = exp(-r * r * 4.5) * smoothstep(1.0, 0.7, r);
		col = mix(edge_color.rgb, core_color.rgb, exp(-r * r * 10.0));
	} else {
		vec2 p = uv - vec2(0.5);
		float r = length(p) * 2.0;
		float a = atan(p.y, p.x);
		float rays = pow(abs(cos(a * 3.0 + seed)), 18.0) * smoothstep(1.0, 0.0, r);
		d = exp(-r * r * 9.0) + rays * 0.9;
		col = mix(edge_color.rgb, core_color.rgb, exp(-r * r * 14.0));
	}
	ALBEDO = col * intensity * fade;
	ALPHA = clamp(d * fade, 0.0, 1.0);
}
