class_name SkyKeys
extends RefCounted
## Time-of-day look table: sky gradient, sun/moon, ambient, fog and grading
## keyframes by clock hour. `sample(hour)` blends the two surrounding keys
## (smoothly) and returns a Dictionary the EnvironmentController applies.
## Colours are written as sRGB hex so they can be tuned by eye against
## docs/ART_DIRECTION.md. Pure data + maths (no nodes), unit-testable.
##
## Keys:
##   zenith, horizon, horizon_sun (horizon on the sun side), ground   sky colours
##   sky_e        sky brightness multiplier
##   sun_col, sun_e     sun colour / energy before the elevation fade
##   moon_e       moonlight energy before the elevation fade
##   amb_col, amb_e, sky_contrib   flat ambient colour/energy, sky ambient share
##   fog_col, fog_d, fog_h, scatter   depth fog colour/density/height density/sun scatter
##   vfog_d, vfog_alb, vfog_emi, vfog_aniso   volumetric fog
##   mist         ground-mist density (fog volume hugging the ground)
##   exposure, sat, contrast   tonemap exposure, saturation, contrast
##   warm, cool   grading: warm highlights / cool shadows amounts
##   cloud_lit, cloud_dark    cloud colours on the lit side / in shade
##   stars        star field visibility

const COLOR_KEYS := ["zenith", "horizon", "horizon_sun", "ground", "sun_col", "amb_col",
	"fog_col", "vfog_alb", "vfog_emi", "cloud_lit", "cloud_dark"]
const FLOAT_KEYS := ["sky_e", "sun_e", "moon_e", "amb_e", "sky_contrib", "fog_d", "fog_h",
	"scatter", "vfog_d", "vfog_aniso", "mist", "exposure", "sat", "contrast", "warm", "cool", "stars"]

const NIGHT := {
	"zenith": "060a1d", "horizon": "223064", "horizon_sun": "202e60", "ground": "0c1124",
	"sky_e": 1.0, "sun_col": "ff9a50", "sun_e": 0.0, "moon_e": 0.16,
	"amb_col": "3e52a0", "amb_e": 0.3, "sky_contrib": 0.2,
	"fog_col": "18224c", "fog_d": 0.0042, "fog_h": 0.02, "scatter": 0.0,
	"vfog_d": 0.011, "vfog_alb": "7d92cc", "vfog_emi": "050818", "vfog_aniso": 0.35,
	"mist": 0.012, "exposure": 1.2, "sat": 0.82, "contrast": 1.05, "warm": 0.05, "cool": 0.09,
	"cloud_lit": "4c5c8c", "cloud_dark": "10172f", "stars": 1.0,
}

## [hour, overrides on top of the previous key ("_night": start again from NIGHT)]
const RAW := [
	[0.0, {}],
	[4.3, {"horizon": "212e60", "stars": 0.95}],
	[5.4, {
		"zenith": "1b285a", "horizon": "6a6a9a", "horizon_sun": "b07a88", "ground": "1a1f35",
		"moon_e": 0.08, "amb_col": "6a6ea8", "amb_e": 0.62, "sky_contrib": 0.45,
		"fog_col": "5c5a88", "fog_d": 0.006, "fog_h": 0.04,
		"vfog_d": 0.014, "vfog_alb": "a8a8d8", "vfog_emi": "141633", "vfog_aniso": 0.4,
		"mist": 0.026, "exposure": 1.2, "stars": 0.3, "sat": 0.92, "contrast": 1.03,
		"warm": 0.04, "cool": 0.08, "cloud_lit": "c88aa0", "cloud_dark": "3a3a62"}],
	[6.2, {
		"zenith": "46649e", "horizon": "e9b089", "horizon_sun": "ffad66", "ground": "5a5560",
		"sun_col": "ffa860", "sun_e": 1.0, "moon_e": 0.0, "amb_col": "b8a0a0", "amb_e": 0.75,
		"sky_contrib": 0.7, "fog_col": "d8a888", "fog_d": 0.004, "fog_h": 0.05, "scatter": 0.5,
		"vfog_d": 0.011, "vfog_alb": "ffd8b8", "vfog_emi": "000000", "vfog_aniso": 0.6,
		"mist": 0.03, "exposure": 1.1, "stars": 0.0, "sat": 1.02, "contrast": 1.03,
		"warm": 0.07, "cool": 0.06, "cloud_lit": "ffb48a", "cloud_dark": "7a6a80"}],
	[7.6, {
		"zenith": "4a7cc8", "horizon": "eed9c4", "horizon_sun": "ffe0b8", "ground": "6a7060",
		"sun_col": "ffd6a0", "sun_e": 1.4, "amb_col": "b8c4d8", "amb_e": 0.65, "sky_contrib": 0.75,
		"fog_col": "c9d3dd", "fog_d": 0.003, "fog_h": 0.04, "scatter": 0.35,
		"vfog_d": 0.008, "vfog_alb": "f0f0ff", "vfog_aniso": 0.55, "mist": 0.018,
		"exposure": 1.0, "sat": 1.05, "contrast": 1.03, "warm": 0.05, "cool": 0.05,
		"cloud_lit": "fff0e0", "cloud_dark": "9aa4b8"}],
	[10.0, {
		"zenith": "1f5cc8", "horizon": "a9c8e8", "horizon_sun": "dce8f2", "ground": "6c7466",
		"sun_col": "fff1dc", "sun_e": 1.55, "amb_col": "c0d0e8", "amb_e": 0.6, "sky_contrib": 0.7,
		"fog_col": "b8cde0", "fog_d": 0.0016, "fog_h": 0.02, "scatter": 0.15,
		"vfog_d": 0.003, "vfog_alb": "ffffff", "vfog_aniso": 0.5, "mist": 0.0,
		"exposure": 0.95, "sat": 1.12, "contrast": 1.08, "warm": 0.04, "cool": 0.04,
		"cloud_lit": "ffffff", "cloud_dark": "a8b4c8"}],
	[15.6, {"sun_col": "ffe8c8", "horizon": "c4d6e8", "horizon_sun": "f0ead8", "sun_e": 1.45}],
	[17.4, {
		"zenith": "3d64b8", "horizon": "e6c6a6", "horizon_sun": "ffb05a", "ground": "6a5a48",
		"sun_col": "ffb868", "sun_e": 1.45, "amb_col": "c8b098", "amb_e": 0.6, "sky_contrib": 0.7,
		"fog_col": "e0b585", "fog_d": 0.002, "fog_h": 0.03, "scatter": 0.45,
		"vfog_d": 0.005, "vfog_alb": "ffe0b0", "vfog_aniso": 0.6, "mist": 0.0,
		"exposure": 1.0, "sat": 1.12, "contrast": 1.07, "warm": 0.09, "cool": 0.06,
		"cloud_lit": "ffd0a0", "cloud_dark": "8a7a90"}],
	[18.6, {
		"zenith": "2a2e72", "horizon": "e88a68", "horizon_sun": "ff7428", "ground": "4a3a40",
		"sun_col": "ff8030", "sun_e": 1.3, "amb_col": "a87898", "amb_e": 0.75, "sky_contrib": 0.65,
		"fog_col": "b87a74", "fog_d": 0.0018, "fog_h": 0.04, "scatter": 0.3,
		"vfog_d": 0.0045, "vfog_alb": "ffc090", "vfog_aniso": 0.55, "mist": 0.004,
		"exposure": 1.1, "sat": 1.08, "contrast": 1.06, "warm": 0.1, "cool": 0.08,
		"cloud_lit": "ff9a70", "cloud_dark": "5a4870"}],
	[19.3, {
		"zenith": "1c2152", "horizon": "6c5a8e", "horizon_sun": "b05a50", "ground": "22223a",
		"sun_e": 0.0, "moon_e": 0.1, "amb_col": "6a5a9a", "amb_e": 0.6, "sky_contrib": 0.45,
		"fog_col": "5c4e80", "fog_d": 0.005, "fog_h": 0.04, "scatter": 0.3,
		"vfog_d": 0.016, "vfog_alb": "b0a0d8", "vfog_emi": "120f2a", "vfog_aniso": 0.4,
		"mist": 0.012, "exposure": 1.2, "stars": 0.3, "sat": 0.95, "contrast": 1.04,
		"warm": 0.06, "cool": 0.09, "cloud_lit": "a06a8a", "cloud_dark": "2a2448"}],
	[20.4, {"_night": true, "moon_e": 0.16, "stars": 0.85}],
	[24.0, {}],
]

static var _keys: Array = []


## Expand RAW into full keys once (each key inherits the previous one).
static func _ensure() -> void:
	if not _keys.is_empty():
		return
	var cur: Dictionary = NIGHT.duplicate()
	for entry in RAW:
		var h: float = entry[0]
		var over: Dictionary = entry[1]
		if h >= 24.0 or over.has("_night"):
			cur = NIGHT.duplicate()
		for k in over:
			if not str(k).begins_with("_"):
				cur[k] = over[k]
		var full := {}
		for k in COLOR_KEYS:
			full[k] = Color.html(str(cur[k]))
		for k in FLOAT_KEYS:
			full[k] = float(cur[k])
		_keys.append([h, full])


static func key_count() -> int:
	_ensure()
	return _keys.size()


## Blend of the two keys around `hour` (0..24).
static func sample(hour: float) -> Dictionary:
	_ensure()
	var h := fposmod(hour, 24.0)
	var i := 0
	while i < _keys.size() - 2 and h >= float(_keys[i + 1][0]):
		i += 1
	var a: Array = _keys[i]
	var b: Array = _keys[i + 1]
	var span := maxf(float(b[0]) - float(a[0]), 0.0001)
	var t := clampf((h - float(a[0])) / span, 0.0, 1.0)
	t = t * t * (3.0 - 2.0 * t)
	return blend(a[1], b[1], t)


static func blend(a: Dictionary, b: Dictionary, t: float) -> Dictionary:
	var out := {}
	for k in COLOR_KEYS:
		out[k] = (a[k] as Color).lerp(b[k], t)
	for k in FLOAT_KEYS:
		out[k] = lerpf(float(a[k]), float(b[k]), t)
	return out
