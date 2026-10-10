// Shared procedural noise helpers for the vegetation shaders (foliage, bark,
// grass, rock). Value noise + fbm; cheap enough for per-fragment use.

float vg_hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vg_hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

float vg_noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = vg_hash12(i);
	float b = vg_hash12(i + vec2(1.0, 0.0));
	float c = vg_hash12(i + vec2(0.0, 1.0));
	float d = vg_hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float vg_noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float n000 = vg_hash13(i);
	float n100 = vg_hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = vg_hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = vg_hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = vg_hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = vg_hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = vg_hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = vg_hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
		mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float vg_fbm2(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += vg_noise2(p) * a;
		p = p * 2.03 + vec2(17.1, 9.2);
		a *= 0.5;
	}
	return s / 0.9375;
}

float vg_fbm3(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += vg_noise3(p) * a;
		p = p * 2.03 + vec3(17.1, 9.2, 4.7);
		a *= 0.5;
	}
	return s / 0.9375;
}

// Screen-space derivative bump mapping (no tangents needed).
// `pos` and `n` are view-space; returns the perturbed view-space normal.
vec3 vg_bump(vec3 pos, vec3 n, float h, float strength) {
	vec3 dpdx = dFdx(pos);
	vec3 dpdy = dFdy(pos);
	float dhdx = dFdx(h);
	float dhdy = dFdy(h);
	vec3 r1 = cross(dpdy, n);
	vec3 r2 = cross(n, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
	return normalize(abs(det) * n - grad * strength);
}

// Model-space direction of a world-space horizontal wind vector for an
// instance transform that is a yaw rotation + uniform scale. Safe for a
// zero-scaled (hidden) instance.
vec3 vg_wind_local(mat4 model, vec2 wind_dir) {
	vec3 w = vec3(wind_dir.x, 0.0, wind_dir.y);
	vec3 l = vec3(dot(w, model[0].xyz), dot(w, model[1].xyz), dot(w, model[2].xyz));
	return l * inversesqrt(max(dot(l, l), 1e-6));
}
