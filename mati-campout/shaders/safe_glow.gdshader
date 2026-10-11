// Compatibility-renderer stand-in for the night camp haze (a FogVolume on
// Forward+) and the safe-ring decal (decals are not drawn there): a soft
// additive pool of firelight draped on the ground, with a glowing dotted band
// at the edge of the safe circle. Driven by SafeGlow (fx/safe_glow.gd); the
// mesh is centred on the fire, so VERTEX.xz is the offset from it.
shader_type spatial;
render_mode blend_add, unshaded, cull_disabled, depth_draw_never, fog_disabled, shadows_disabled;

uniform vec3 pool_color : source_color = vec3(1.0, 0.56, 0.24);
uniform vec3 ring_color : source_color = vec3(1.0, 0.72, 0.38);
// Safe radius in metres (the band sits exactly here).
uniform float radius = 14.0;
// Strength of the warm pool and of the edge band (0 = off).
uniform float pool = 0.0;
uniform float ring = 0.0;
// Band half-width in metres.
uniform float band_width = 0.32;

varying vec2 v_local;

void vertex() {
	v_local = VERTEX.xz;
}

void fragment() {
	float dist = length(v_local);
	float d = dist / max(radius, 0.5);
	if (d > 1.15) {
		discard;
	}
	// Warm wash: brightest around the fire, fading to nothing at the edge.
	float wash = pow(clamp(1.0 - d, 0.0, 1.0), 1.4);
	// Edge band: a sharp core plus a soft halo, gently dotted like the decal.
	float off = dist - radius;
	float band = exp(-pow(off / band_width, 2.0)) + 0.3 * exp(-pow(off / (band_width * 3.0), 2.0));
	float dots = 0.88 + 0.12 * cos(atan(v_local.y, v_local.x) * 96.0);
	ALBEDO = pool_color * wash * pool + ring_color * band * dots * ring;
}
