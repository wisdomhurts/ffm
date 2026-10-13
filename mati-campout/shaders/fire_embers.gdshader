// The campfire's ember bed (MATI's Campout): a heap of coals with glowing
// cracks that pulse slowly. glow 1 = burning, fades while smouldering after
// the fire goes out; ash 1 = cold grey ash.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform float glow = 1.0;
uniform float ash = 0.0;
uniform float redness = 0.0;
uniform float hdr = 3.2;

varying vec3 obj_pos;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

vec2 cells(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	float f1 = 8.0;
	float f2 = 8.0;
	for (int z = -1; z <= 1; z++) {
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				vec3 g = vec3(float(x), float(y), float(z));
				vec3 o = vec3(hash13(i + g), hash13(i + g + 17.1), hash13(i + g + 41.7));
				float d = length(g + o - f);
				if (d < f1) {
					f2 = f1;
					f1 = d;
				} else if (d < f2) {
					f2 = d;
				}
			}
		}
	}
	return vec2(f1, f2 - f1);
}

void vertex() {
	obj_pos = VERTEX;
}

void fragment() {
	vec2 c = cells(obj_pos * 11.0);
	float crack = 1.0 - smoothstep(0.0, 0.11, c.y);
	float lump = smoothstep(0.0, 0.6, c.x);
	float n = vnoise(obj_pos * 7.0 + vec3(0.0, TIME * 0.25, 0.0));
	float n2 = vnoise(obj_pos * 23.0);
	float pulse = 0.6 + 0.4 * sin(TIME * 1.7 + n * 9.0);
	// Coals: black with grey ash skin on top of each lump.
	vec3 coal = vec3(0.025, 0.02, 0.018) + vec3(0.09) * smoothstep(0.55, 0.9, n2);
	vec3 ash_col = vec3(0.36, 0.34, 0.32) * (0.75 + 0.45 * n2);
	float ash_skin = smoothstep(0.5, 0.95, n2 + lump * 0.25) * 0.55;
	vec3 base = mix(coal, ash_col, clamp(ash_skin + ash, 0.0, 1.0));
	ALBEDO = base;
	ROUGHNESS = 0.95;
	// Glow: cracks between coals, plus hot spots that breathe.
	float hot = crack * (0.55 + 0.45 * n) + smoothstep(0.55, 0.85, n) * (1.0 - lump) * 0.8;
	vec3 ember = mix(vec3(1.0, 0.42, 0.08), vec3(0.9, 0.12, 0.02), clamp(redness + (1.0 - n) * 0.35, 0.0, 1.0));
	float g = clamp(glow, 0.0, 2.0) * (1.0 - ash);
	EMISSION = ember * hot * pulse * g * hdr;
}
