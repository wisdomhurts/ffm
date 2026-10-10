class_name MineBits
extends RefCounted
## Mine pieces shared by Bram's Dig and the Old Mine: a timber-framed
## entrance in a rocky berm (shallow dark adit or a short walkable tunnel)
## and mine-cart tracks that follow the ground.

const TIMBER := Color("#6e5236")
const TIMBER_OLD := Color("#5d5044")
const ROCK := Color("#7b766e")


## Entrance at `t` (site-local; origin = middle of the mouth on the floor,
## local +Z = out of the hill, local -Z = into it).
##   depth <= 0.5: a shallow adit closed by darkness (decorative, solid);
##   depth > 0.5: an open tunnel `depth` deep with walls, a ceiling, timber
##                sets and a dark rock face at the end (walkable).
## `mound` 0..1 = how big the rocky hill around it is. `old` = weathered
## timber. Collision on the site body.
static func portal(site: LandmarkSite, t: Transform3D, w: float, h: float, depth: float, mound: float, old: bool, seed_v: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var k := site.big
	var wood := TIMBER_OLD if old else TIMBER
	var hw := w * 0.5
	var post_r := 0.13
	var deep := depth > 0.5
	var tunnel := maxf(depth, 0.45)
	# Frame at the mouth: posts, a heavy cap, a sill log.
	for s in [-1.0, 1.0]:
		var sd: float = s
		k.log_piece(t * Vector3(sd * (hw + 0.06), -0.35, 0.0), t * Vector3(sd * (hw + 0.04), h + 0.05, 0.0), post_r, seed_v + int(sd * 3.0), true, wood)
	k.log_piece(t * Vector3(-hw - 0.45, h + 0.16, 0.05), t * Vector3(hw + 0.45, h + 0.18, 0.05), post_r * 1.15, seed_v + 5, true, wood.darkened(0.05))
	# Inside: walls and ceiling of rough rock, timber sets.
	var wall := ROCK.darkened(0.25)
	k.paint(wall, 0.95, 0.0, 0.0, CampKit.P.STONE)
	var noise := FastNoiseLite.new()
	noise.seed = seed_v + 11
	noise.frequency = 1.4
	var bumpy := func(p: Vector3, n: Vector3) -> Vector3:
		return p + n * noise.get_noise_3dv(p * 1.2) * 0.12
	var segs := maxi(int(tunnel / 0.6), 1)
	# surface() faces along du x dv: run u so every face looks into the tunnel.
	for s in [-1.0, 1.0]:
		var sd: float = s
		var f := func(u: float, v: float) -> Vector3:
			var uu := u if sd < 0.0 else 1.0 - u
			var p := Vector3(sd * (hw + 0.02), lerpf(-0.6, h, v), -uu * tunnel)
			return t * bumpy.call(p, Vector3(sd, 0, 0))
		k.surface(f, segs, 4)
	var fc := func(u: float, v: float) -> Vector3:
		var p := Vector3(lerpf(-hw - 0.02, hw + 0.02, v), h + 0.02 + sin(v * PI) * 0.15, -u * tunnel)
		return t * bumpy.call(p, Vector3.UP)
	k.surface(fc, segs, 4)
	# The far end: a dark rock face (gradient to near black), facing out.
	k.paint(Color("#3a342e"), 1.0, 0.0, 0.0, LandmarkKit.LP.DARK)
	var back := -tunnel
	var fb := func(u: float, v: float) -> Vector3:
		return t * Vector3(lerpf(-hw - 0.05, hw + 0.05, u), lerpf(-0.6, h + 0.2, v), back)
	k.surface(fb, 3, 3)
	# Timber sets every 1.3 m.
	var z := -0.9
	while z > -tunnel + 0.3:
		for s in [-1.0, 1.0]:
			var sd: float = s
			k.log_piece(t * Vector3(sd * (hw - 0.12), -0.3, z), t * Vector3(sd * (hw - 0.14), h - 0.05, z), 0.1, seed_v + int(z * 10.0), true, wood)
		k.log_piece(t * Vector3(-hw + 0.02, h - 0.1, z), t * Vector3(hw - 0.02, h - 0.1, z), 0.11, seed_v + int(z * 7.0), true, wood.darkened(0.08))
		z -= 1.3
	# Rocky berm / mound around the mouth (kept outside the tunnel).
	var rocks := 6 + int(mound * 6.0)
	for i in rocks:
		var side := -1.0 if i % 2 == 0 else 1.0
		var tier := float(i / 2) / maxf(float(rocks / 2), 1.0)
		var r := lerpf(0.9, 1.6 + mound * 1.4, rng.randf())
		var x := side * (hw + 0.45 + r * 0.95 + tier * mound * 1.2)
		var y := lerpf(0.2, h * 0.9, tier) + rng.randf_range(-0.2, 0.3)
		var zz := -r * 0.7 - tier * (0.6 + mound * 1.5)
		var c := t * Vector3(x, y, zz)
		k.paint(ROCK.lerp(Color("#8c8579"), rng.randf()), 0.92, 0.0, 0.0, CampKit.P.STONE)
		k.blob(c, Vector3(r, r * 0.8, r * 0.9), seed_v + 40 + i, 0.15, 14, 9)
		site.cyl(r * 0.85, r * 1.6, Transform3D(Basis.IDENTITY, c))
	# Over the cap: a row of rocks so the frame sits in the hill.
	var caps := 2 + int(mound * 3.0)
	for i in caps:
		var x := lerpf(-hw - 0.4, hw + 0.4, (float(i) + 0.5) / caps)
		var r := lerpf(0.9, 1.3 + mound * 1.5, rng.randf())
		var c := t * Vector3(x, h + 0.4 + r * 0.75, -r * 0.75 - 0.15)
		k.paint(ROCK.lerp(Color("#6f6a62"), rng.randf()), 0.92, 0.0, 0.0, CampKit.P.STONE)
		k.blob(c, Vector3(r * 1.1, r * 0.75, r), seed_v + 80 + i, 0.15, 14, 9)
	if mound > 0.3:
		# Earth cap over the tunnel (its underside stays above the ceiling)
		# and rocks closing the back.
		var ry := 1.2 + mound * 1.2
		k.paint(Color("#6a5a48"), 0.97, 0.0, 0.0, LandmarkKit.LP.EARTH)
		k.blob(t * Vector3(0, h + 0.35 + ry, -tunnel * 0.55 - 0.6), Vector3(hw + 2.2 + mound, ry, tunnel * 0.6 + 1.6), seed_v + 99, 0.15, 16, 10)
		for i in 3:
			var r := 1.5 + mound * 0.8
			var c := t * Vector3((float(i) - 1.0) * (hw + 0.6), h * 0.5, -tunnel - r * 0.75)
			k.paint(ROCK.lerp(Color("#857f74"), rng.randf()), 0.92, 0.0, 0.0, CampKit.P.STONE)
			k.blob(c, Vector3(r * 1.1, r, r), seed_v + 120 + i, 0.15, 14, 9)
			site.cyl(r * 0.9, r * 2.0, Transform3D(Basis.IDENTITY, c))
	# Collision: frame posts, the inside walls and roof, the end.
	for s in [-1.0, 1.0]:
		var sd: float = s
		site.box(Vector3(0.5, h + 1.0, tunnel + 0.4), t * Transform3D(Basis.IDENTITY, Vector3(sd * (hw + 0.27), (h + 1.0) * 0.5 - 0.5, -tunnel * 0.5 + 0.1)))
	site.box(Vector3(w + 1.0, 1.0, tunnel + 0.4), t * Transform3D(Basis.IDENTITY, Vector3(0, h + 0.55, -tunnel * 0.5 + 0.1)))
	site.box(Vector3(w, h + 1.0, 0.4), t * Transform3D(Basis.IDENTITY, Vector3(0, (h + 1.0) * 0.5 - 0.5, back - 0.2 if deep else -0.25)))
	var wc := t.origin
	site.zone(wc.x, wc.z, hw + 1.2)
	var inner := t * Vector3(0, 0, -tunnel * 0.5)
	site.zone(inner.x, inner.z, hw + 1.6)


## Boards nailed across the top of an entrance (one hangs loose), leaving the
## lower part open to squeeze through.
static func boards(site: LandmarkSite, t: Transform3D, w: float, h: float, seed_v: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var hw := w * 0.5
	var k := site.detail
	var c := Color("#8a7a62")
	# Two crossed boards high up.
	for s in [-1.0, 1.0]:
		var sd: float = s
		var a := Vector3(-hw - 0.15, h - 0.05 - (0.45 if sd > 0.0 else 0.0), 0.2)
		var b := Vector3(hw + 0.15, h - 0.5 + (0.45 if sd > 0.0 else 0.0), 0.2)
		var d := b - a
		var bb := Basis(Vector3.BACK, atan2(d.y, d.x))
		LandmarkProps.slat(k, t * Transform3D(bb, (a + b) * 0.5 + Vector3(0, 0, 0.02 * sd)), Vector3(d.length(), 0.18, 0.04), c.lerp(Color("#9c8a70"), rng.randf()))
	# A horizontal board above head height and one hanging from a nail.
	LandmarkProps.slat(k, t * Transform3D(Basis.IDENTITY, Vector3(0, h - 0.15, 0.25)), Vector3(w + 0.4, 0.2, 0.04), c.darkened(0.1))
	LandmarkProps.slat(k, t * Transform3D(Basis(Vector3.BACK, 1.25), Vector3(-hw + 0.22, h - 0.75, 0.26)), Vector3(1.0, 0.17, 0.04), c)
	k.paint(Color("#3a3a3d"), 0.4, 0.8, 0.0, MeshKit.Pat.NONE)
	k.sphere(t * Vector3(-hw + 0.05, h - 0.3, 0.29), 0.02, 6, 4)


## Mine-cart tracks from a to b (site-local XZ; y follows the ground).
static func tracks(site: LandmarkSite, a: Vector3, b: Vector3, seed_v: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var flat := Vector3(b.x - a.x, 0.0, b.z - a.z)
	var length := flat.length()
	if length < 0.5:
		return
	var dir := flat / length
	var side := Vector3(-dir.z, 0.0, dir.x)
	var n := int(length / 0.6) + 1
	var gauge := 0.31
	var rails: Array[PackedVector3Array] = [PackedVector3Array(), PackedVector3Array()]
	for i in n + 1:
		var p := a + dir * length * float(i) / n
		var y := site.gmin(p.x, p.z, 0.4) + 0.05
		var bb := Basis(Vector3.UP, atan2(dir.x, dir.z) + rng.randf_range(-0.06, 0.06))
		LandmarkProps.slat(site.detail, Transform3D(bb, Vector3(p.x, y, p.z)), Vector3(0.95, 0.1, 0.18), Color("#5e4a36").lerp(Color("#6e5a44"), rng.randf()))
		for r in 2:
			var s := -1.0 if r == 0 else 1.0
			rails[r].append(Vector3(p.x, y + 0.1, p.z) + side * s * gauge)
	site.detail.paint(Color("#5a524c"), 0.45, 0.7, 0.0, MeshKit.Pat.RUST)
	for r in 2:
		var pts: PackedVector3Array = rails[r]
		for i in pts.size() - 1:
			var p0 := pts[i]
			var p1 := pts[i + 1]
			var d := p1 - p0
			var bb := MeshKit.basis_y(d)
			site.detail.rbox(Transform3D(bb, (p0 + p1) * 0.5), Vector3(0.05, d.length() + 0.01, 0.07), 0.01, 1)
	var steps := int(length / 2.0) + 1
	for i in steps + 1:
		var p := a + dir * length * float(i) / steps
		site.zone(p.x, p.z, 0.6)
