// MATI's Campout — procedural sky.
// Per-time gradients (driven by env/sky_keys.gd), sun disk + halo, shaded
// moon, twinkling stars + faint milky way, soft sun-lit clouds, overcast and
// lightning flashes. The radiance cubemap pass (ambient light/reflections)
// skips the expensive detail (stars, fine cloud octaves).
shader_type sky;

uniform vec3 sun_dir = vec3(0.0, 0.7, 0.7);       // unit vector towards the sun
uniform vec3 moon_dir = vec3(0.0, 0.5, 0.86);     // unit vector towards the moon
uniform vec3 zenith_color : source_color = vec3(0.25, 0.47, 0.82);
uniform vec3 horizon_color : source_color = vec3(0.72, 0.83, 0.93);
uniform vec3 horizon_sun_color : source_color = vec3(0.9, 0.93, 0.96);
uniform vec3 ground_color : source_color = vec3(0.3, 0.32, 0.3);
uniform float sky_energy = 1.0;
uniform float horizon_curve = 5.0;

uniform vec3 sun_color : source_color = vec3(1.0, 0.95, 0.88);
uniform float sun_size = 1.1;          // angular radius, degrees
uniform float sun_energy = 24.0;
uniform float sun_halo = 0.5;
uniform float sun_visible = 1.0;

uniform vec3 moon_color : source_color = vec3(0.86, 0.9, 1.0);
uniform float moon_size = 1.9;         // angular radius, degrees
uniform float moon_energy = 2.2;
uniform float moon_visible = 0.0;
uniform vec3 moon_glow_color : source_color = vec3(0.45, 0.55, 0.85);

uniform float stars = 0.0;
uniform float milky_way = 0.45;

uniform float cloud_cover = 0.3;
uniform vec2 cloud_offset = vec2(0.0);
uniform vec3 cloud_light_dir = vec3(0.0, 0.7, 0.7);
uniform vec3 cloud_lit : source_color = vec3(1.0);
uniform vec3 cloud_dark : source_color = vec3(0.6, 0.65, 0.75);

uniform float overcast = 0.0;
uniform vec3 overcast_color : source_color = vec3(0.45, 0.48, 0.53);
uniform float flash = 0.0;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
	p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yxz + 33.33);
	return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash12(i);
	float b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0));
	float d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int octaves) {
	float s = 0.0;
	float a = 0.5;
	mat2 r = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8));
	for (int i = 0; i < octaves; i++) {
		s += a * vnoise(p);
		p = r * p * 2.03 + vec2(17.1, 9.2);
		a *= 0.5;
	}
	return s;
}

float vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
		mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float fbm3(vec3 p, int octaves) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < octaves; i++) {
		s += a * vnoise3(p);
		p = p * 2.07 + vec3(11.3, 5.1, 7.9);
		a *= 0.5;
	}
	return s;
}

// One layer of stars on a 3D grid; `scale` = cells per radian, `density` =
// fraction of cells holding a star.
vec3 star_layer(vec3 dir, float scale, float density, float size, float twinkle_t, bool twinkle) {
	vec3 p = dir * scale;
	vec3 cell = floor(p);
	float h = hash13(cell);
	if (h > density) {
		return vec3(0.0);
	}
	vec3 sp = cell + 0.25 + hash33(cell) * 0.5;
	float d = length(p - sp);
	// Keep stars at least ~1 px wide so they never shimmer away.
	float px = max(length(fwidth(p)), 0.0001);
	float r = max(size, px * 0.8);
	float b = smoothstep(r, 0.0, d) * (size * size) / (r * r);
	float h2 = hash13(cell + 7.7);
	float mag = pow(h2, 3.0) * 2.4 + 0.25;
	if (twinkle) {
		float h3 = hash13(cell + 3.1);
		mag *= 0.72 + 0.28 * sin(twinkle_t * (1.6 + 3.2 * h3) + h3 * 40.0);
	}
	vec3 tint = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.88, 0.72), hash13(cell + 1.9));
	return tint * b * mag;
}

void sky() {
	vec3 dir = normalize(EYEDIR);
	float y = dir.y;
	float up = max(y, 0.0);
	bool detail = !AT_CUBEMAP_PASS;

	// --- Gradient: zenith -> horizon, warmer on the sun's side ---------------
	vec2 flat_dir = normalize(dir.xz + vec2(0.0001));
	vec2 flat_sun = normalize(sun_dir.xz + vec2(0.0001));
	float sun_side = pow(clamp(dot(flat_dir, flat_sun) * 0.5 + 0.5, 0.0, 1.0), 2.2);
	vec3 horizon = mix(horizon_color, horizon_sun_color, sun_side);
	float t = pow(1.0 - up, horizon_curve);
	vec3 col = mix(zenith_color, horizon, t);
	// Below the horizon: fade to the ground/fog colour.
	col = mix(col, ground_color, smoothstep(0.0, -0.12, y));

	// --- Sun glow and disk ----------------------------------------------------
	float sd = dot(dir, sun_dir);
	float sun_lift = smoothstep(-0.25, 0.05, sun_dir.y);
	float glow = pow(max(sd, 0.0), 6.0) * 0.35 + pow(max(sd, 0.0), 48.0) * 0.9;
	col += sun_color * glow * sun_halo * sun_lift * (1.0 - overcast * 0.8);
	float sun_ang = acos(clamp(sd, -1.0, 1.0));
	float sun_r = radians(sun_size);
	float disk = smoothstep(sun_r, sun_r * 0.85, sun_ang);
	float limb = mix(0.55, 1.0, sqrt(clamp(1.0 - sun_ang / sun_r, 0.0, 1.0)));
	float sun_e = detail ? sun_energy : sun_energy * 0.15;
	vec3 sun_disk = sun_color * disk * limb * sun_e * sun_visible * smoothstep(-0.01, 0.01, y);

	// --- Moon -------------------------------------------------------------------
	vec3 moon = vec3(0.0);
	float md = dot(dir, moon_dir);
	float moon_ang = acos(clamp(md, -1.0, 1.0));
	float moon_r = radians(moon_size);
	vec3 moon_halo = moon_glow_color * (exp(-moon_ang * 9.0) * 0.5 + exp(-moon_ang * 40.0) * 0.6) * moon_visible;
	float moon_mask = 0.0;
	if (moon_ang < moon_r * 1.2 && detail) {
		vec3 up_ref = abs(moon_dir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
		vec3 tx = normalize(cross(up_ref, moon_dir));
		vec3 ty = cross(moon_dir, tx);
		vec2 q = vec2(dot(dir, tx), dot(dir, ty)) / sin(moon_r);
		float rr = length(q);
		moon_mask = smoothstep(1.0, 0.93, rr);
		vec3 n = vec3(q, sqrt(max(1.0 - rr * rr, 0.0)));
		// Fixed waxing-gibbous phase, lit from the upper right.
		float lit = smoothstep(-0.18, 0.3, dot(n, normalize(vec3(0.75, 0.35, 0.55))));
		float maria = fbm(q * 2.3 + vec2(3.0, 1.0), 4);
		float albedo = mix(1.0, 0.68, smoothstep(0.45, 0.7, maria));
		albedo *= 0.92 + 0.08 * vnoise(q * 14.0);
		float shade = mix(0.035, 1.0, lit) * albedo * mix(0.82, 1.0, n.z);
		moon = moon_color * shade * moon_energy * moon_mask * moon_visible;
	}

	// --- Stars + milky way -----------------------------------------------------
	vec3 night = vec3(0.0);
	if (stars > 0.001 && detail && y > -0.05) {
		float horizon_ext = smoothstep(-0.02, 0.3, y);
		vec3 band_n = normalize(vec3(0.55, 0.42, -0.72));
		float band = exp(-pow(dot(dir, band_n) / 0.2, 2.0));
		vec3 s = star_layer(dir, 120.0, 0.16, 0.12, TIME, true) * 1.4;
		s += star_layer(dir, 260.0, 0.22 + band * 0.25, 0.1, TIME * 1.3, true) * 0.7;
		s += star_layer(dir.zxy, 520.0, 0.18 + band * 0.4, 0.1, 0.0, false) * 0.35;
		float mw = fbm3(dir * 4.0 + vec3(4.0, 2.0, 1.0), 5);
		float lanes = smoothstep(0.45, 0.65, fbm3(dir * 9.0 + vec3(1.3, 7.7, 2.2), 4));
		float core = exp(-pow(dot(dir, band_n) / 0.09, 2.0));
		vec3 mw_col = mix(vec3(0.3, 0.32, 0.55), vec3(0.5, 0.45, 0.6), core) * (band * 0.7 + core * 0.5)
			* smoothstep(0.25, 0.75, mw) * (1.0 - lanes * 0.65) * milky_way;
		night = (s + mw_col * 0.2) * stars * horizon_ext * (1.0 - moon_mask);
	}

	// --- Clouds -------------------------------------------------------------------
	float cloud_a = 0.0;
	vec3 cloud_col = vec3(0.0);
	float cover = clamp(max(cloud_cover, overcast * 0.95), 0.0, 1.0);
	if (cover > 0.01 && y > -0.02) {
		vec2 cuv = dir.xz / (y + 0.14) * 0.9 + cloud_offset;
		int oct = detail ? 5 : 3;
		// Gentle domain warp gives billowy, less blobby shapes.
		vec2 warp = vec2(vnoise(cuv * 0.45 + 3.7), vnoise(cuv * 0.45 + 9.1)) - 0.5;
		cuv += warp * 0.6;
		float n = fbm(cuv, oct);
		float th = mix(0.72, 0.18, cover);
		float dens = smoothstep(th, th + 0.16, n);
		vec2 ldir = normalize(cloud_light_dir.xz + vec2(0.0001)) * 0.18;
		float n2 = fbm(cuv + ldir, detail ? 4 : 2);
		float lit = clamp(0.62 + (n - n2) * 3.2, 0.0, 1.0);
		// Thick cores are darker underneath.
		float thick = smoothstep(th + 0.05, th + 0.4, n);
		lit *= 1.0 - thick * 0.45;
		lit = mix(lit, 0.35, overcast * 0.7);
		cloud_col = mix(cloud_dark, cloud_lit, lit);
		// Silver lining around the light source.
		float cd = max(dot(dir, cloud_light_dir), 0.0);
		cloud_col += cloud_lit * pow(cd, 12.0) * (1.0 - dens) * 1.6;
		float fade = smoothstep(-0.02, 0.18, y);
		cloud_a = dens * fade * mix(0.9, 1.0, overcast);
		// Distant clouds melt into the horizon haze.
		cloud_col = mix(cloud_col, horizon, (1.0 - fade) * 0.6 + smoothstep(0.25, 0.0, y) * 0.35);
	}

	// --- Overcast: flatten everything to a soft grey dome ----------------------
	vec3 oc = mix(overcast_color * 0.75, overcast_color, smoothstep(0.6, 0.0, up));
	col = mix(col, oc, overcast * 0.85);

	col += night * (1.0 - cloud_a);
	col += sun_disk * (1.0 - cloud_a) * (1.0 - overcast);
	col += moon * (1.0 - cloud_a * 0.85);
	col = mix(col, cloud_col, cloud_a);
	col += moon_halo * (1.0 - cloud_a * 0.5) * (1.0 - overcast * 0.6);
	// Lightning lights the cloud deck from inside.
	col += vec3(0.75, 0.8, 1.0) * flash * (0.35 + cloud_a * 1.2) * smoothstep(-0.05, 0.4, y);

	COLOR = col * sky_energy;
}
