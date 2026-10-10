// Shared helpers for the terrain, water and backdrop shaders.

// Cheap hash / value noise (used where a texture lookup is not convenient).
float tc_hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float tc_hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

float tc_vnoise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = tc_hash12(i);
	float b = tc_hash12(i + vec2(1.0, 0.0));
	float c = tc_hash12(i + vec2(0.0, 1.0));
	float d = tc_hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float tc_vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float n000 = tc_hash13(i);
	float n100 = tc_hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = tc_hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = tc_hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = tc_hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = tc_hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = tc_hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = tc_hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
		mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Rotate a 2D coordinate (breaks up texture tiling between scales).
vec2 tc_rot(vec2 p, float a) {
	float s = sin(a);
	float c = cos(a);
	return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float tc_seg_dist(vec2 p, vec2 a, vec2 b) {
	vec2 ab = b - a;
	float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
	return length(p - (a + ab * t));
}

// Triplanar sample of a tiling texture (world-space position and normal).
vec4 tc_triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
	vec3 w = pow(abs(n), vec3(4.0));
	w /= max(w.x + w.y + w.z, 0.0001);
	vec4 x = texture(tex, p.zy * scale);
	vec4 y = texture(tex, p.xz * scale);
	vec4 z = texture(tex, p.xy * scale);
	return x * w.x + y * w.y + z * w.z;
}

// Unpack a tangent-space normal map texel to -1..1 XY.
vec2 tc_nmap(vec4 t) {
	return t.xy * 2.0 - 1.0;
}
