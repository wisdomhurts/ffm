shader_type canvas_item;
// Full-screen HUD effects: dark vignette (fire out), red damage / heartbeat
// edges and an icy frost border when the player is freezing.

uniform float aspect = 1.7778;
uniform float dark_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 dark_color : source_color = vec4(0.02, 0.025, 0.06, 1.0);
uniform float hurt_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 hurt_color : source_color = vec4(0.78, 0.06, 0.04, 1.0);
uniform float frost_amount : hint_range(0.0, 1.0) = 0.0;
uniform float time_s = 0.0;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		v += amp * noise(p);
		p *= 2.03;
		amp *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 p = UV - 0.5;
	p.x *= aspect;
	float r = length(p) / (0.5 * length(vec2(aspect, 1.0)));
	vec4 col = vec4(0.0);

	// Dark vignette while the campfire is out.
	float dv = smoothstep(0.35, 1.05, r) * dark_amount;
	col = mix(col, vec4(dark_color.rgb, 1.0), dv * 0.92);

	// Frost: crystalline noise creeping in from the edges.
	if (frost_amount > 0.001) {
		vec2 q = UV * vec2(aspect, 1.0);
		float n = fbm(q * 6.0);
		float crack = 1.0 - smoothstep(0.0, 0.035, abs(fbm(q * 14.0 + 3.1) - 0.5));
		float crack2 = 1.0 - smoothstep(0.0, 0.02, abs(fbm(q * 31.0 - 1.7) - 0.5));
		float reach = 1.0 - frost_amount * 0.42;
		float edge = smoothstep(reach, reach + 0.2, r + (n - 0.5) * 0.3);
		float lines = max(crack, crack2 * 0.7) * smoothstep(reach - 0.06, reach + 0.1, r + (n - 0.5) * 0.3);
		float sparkle = smoothstep(0.9, 1.0, noise(UV * 260.0 + time_s * 0.15)) * edge;
		vec3 ice = mix(vec3(0.6, 0.78, 0.96), vec3(0.94, 0.98, 1.0), clamp(lines + edge * 0.35, 0.0, 1.0));
		float fa = clamp(edge * (0.32 + 0.3 * n) + lines * 0.55, 0.0, 1.0) * min(frost_amount * 1.4, 1.0);
		col.rgb = mix(col.rgb, ice, clamp(fa * 1.4, 0.0, 1.0));
		col.a = max(col.a, fa);
		col.rgb += vec3(sparkle) * 0.7;
		col.a = max(col.a, sparkle * 0.8);
	}

	// Red damage flash / low-health heartbeat at the edges.
	float hv = smoothstep(0.45, 1.1, r) * hurt_amount;
	col.rgb = mix(col.rgb, hurt_color.rgb, clamp(hv * 1.2, 0.0, 1.0));
	col.a = max(col.a, hv * 0.85);
	col.a = max(col.a, dv * 0.92);
	COLOR = col;
}
