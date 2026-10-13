#!/usr/bin/env python3
"""Generate the illustrated item and UI icons for MATI's Campout.

Every item id in data/items.json gets assets/icons/<id>.png (128x128 RGBA),
plus "coins" and the HUD glyphs (ui_heart, ui_fire, ...). Icons are painted
at 4x (512 px) and downsampled, so edges are smooth.

Style: soft illustrated shapes, gentle gradients lit from the top-left,
inner ambient-occlusion along edges, a glossy highlight, a dark rounded
outline and a soft drop shadow - consistent across the whole set.

Usage (from the project folder):
    python3 tools/gen_icons.py              # write every icon
    python3 tools/gen_icons.py wood bone    # only these ids
    python3 tools/gen_icons.py --sheet out.png   # also write a contact sheet
    python3 tools/gen_icons.py --fix-imports     # enable mipmaps in .import files

Requires Pillow and numpy. Original artwork, no external assets.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 4
N = 128
W = N * S
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT_DIR = os.path.join(ROOT, "assets", "icons")
OUTLINE = (30, 21, 34)
SHADOW = (10, 8, 22)

# ----------------------------------------------------------------------------
# colour helpers


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def lt(c, t):
    return mix(c, (255, 251, 240), t)


def dk(c, t):
    """Darken while keeping the hue (shadows lean slightly cool, never grey)."""
    return mix(c, (c[0] * 0.32 + 8, c[1] * 0.3 + 6, c[2] * 0.34 + 20), t)


# ----------------------------------------------------------------------------
# geometry (everything is a polygon so it can be rotated freely)


def ellipse(cx, cy, rx, ry, rot=0.0, n=120):
    r = math.radians(rot)
    cr, sr = math.cos(r), math.sin(r)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + x * cr - y * sr, cy + x * sr + y * cr))
    return pts


def rrect(cx, cy, w, h, r=0.0, rot=0.0, n=10):
    r = min(r, w / 2, h / 2)
    hw, hh = w / 2, h / 2
    pts = []
    corners = [(hw - r, -hh + r, -90), (hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180)]
    for (ox, oy, start) in corners:
        for i in range(n + 1):
            a = math.radians(start + 90 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return xform(pts, rot=rot, offset=(cx, cy))


def stadium(p0, p1, r, n=24):
    (x0, y0), (x1, y1) = p0, p1
    ang = math.atan2(y1 - y0, x1 - x0)
    pts = []
    for i in range(n + 1):
        a = ang - math.pi / 2 + math.pi * i / n
        pts.append((x1 + r * math.cos(a), y1 + r * math.sin(a)))
    for i in range(n + 1):
        a = ang + math.pi / 2 + math.pi * i / n
        pts.append((x0 + r * math.cos(a), y0 + r * math.sin(a)))
    return pts


def tapered(p0, p1, r0, r1, n=20):
    """Capsule whose radius changes from r0 (at p0) to r1 (at p1)."""
    (x0, y0), (x1, y1) = p0, p1
    ang = math.atan2(y1 - y0, x1 - x0)
    pts = []
    for i in range(n + 1):
        a = ang - math.pi / 2 + math.pi * i / n
        pts.append((x1 + r1 * math.cos(a), y1 + r1 * math.sin(a)))
    for i in range(n + 1):
        a = ang + math.pi / 2 + math.pi * i / n
        pts.append((x0 + r0 * math.cos(a), y0 + r0 * math.sin(a)))
    return pts


def star(cx, cy, ro, ri, n=5, rot=-90.0):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + 180.0 * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def xform(pts, rot=0.0, about=(0, 0), offset=(0, 0), scale=1.0):
    r = math.radians(rot)
    cr, sr = math.cos(r), math.sin(r)
    out = []
    for (x, y) in pts:
        x, y = (x - about[0]) * scale, (y - about[1]) * scale
        out.append((x * cr - y * sr + about[0] + offset[0], x * sr + y * cr + about[1] + offset[1]))
    return out


def blob(cx, cy, rx, ry, seed, wobble=0.12, rot=0.0, n=120):
    """Irregular rounded shape (rocks, lumps)."""
    rnd = np.random.RandomState(seed)
    k = [(rnd.uniform(-1, 1) * wobble, rnd.uniform(0, 6.28)) for _ in range(4)]
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        f = 1.0 + sum(amp * math.sin(a * (j + 2) + ph) for j, (amp, ph) in enumerate(k))
        pts.append((rx * f * math.cos(a), ry * f * math.sin(a)))
    return xform(pts, rot=rot, offset=(cx, cy))


# ----------------------------------------------------------------------------
# masks (float32 0..1 at W x W)


def mask(*polys):
    im = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(float(x), float(y)) for (x, y) in p], fill=255)
    return np.asarray(im, dtype=np.float32) / 255.0


def line_mask(segments, width):
    im = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(im)
    for seg in segments:
        d.line([(float(x), float(y)) for (x, y) in seg], fill=255, width=int(width), joint="curve")
        for (x, y) in (seg[0], seg[-1]):
            r = width / 2.0
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.asarray(im, dtype=np.float32) / 255.0


def blur(m, r):
    im = Image.fromarray(np.clip(m * 255.0, 0, 255).astype(np.uint8), "L")
    return np.asarray(im.filter(ImageFilter.GaussianBlur(float(r))), dtype=np.float32) / 255.0


def dilate(m, size):
    im = Image.fromarray(np.clip(m * 255.0, 0, 255).astype(np.uint8), "L")
    return np.asarray(im.filter(ImageFilter.MaxFilter(size)), dtype=np.float32) / 255.0


def union(*ms):
    out = ms[0]
    for m in ms[1:]:
        out = np.maximum(out, m)
    return out


def sub(a, b):
    return a * (1.0 - b)


def shift(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape[:2]
    xs0, xs1 = max(0, -dx), min(w, w - dx)
    ys0, ys1 = max(0, -dy), min(h, h - dy)
    out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = m[ys0:ys1, xs0:xs1]
    return out


_YY, _XX = np.mgrid[0:W, 0:W].astype(np.float32)


# ----------------------------------------------------------------------------
# the canvas


class Icon:
    def __init__(self):
        self.rgb = np.zeros((W, W, 3), dtype=np.float32)
        self.a = np.zeros((W, W), dtype=np.float32)
        self.glow_rgb = np.zeros((W, W, 3), dtype=np.float32)
        self.glow_a = np.zeros((W, W), dtype=np.float32)

    def over(self, col, alpha):
        a = np.clip(alpha, 0.0, 1.0)
        col = np.asarray(col, dtype=np.float32)
        if col.ndim == 1:
            col = np.broadcast_to(col, (W, W, 3))
        out_a = a + self.a * (1.0 - a)
        safe = np.maximum(out_a, 1e-6)[..., None]
        self.rgb = (col * a[..., None] + self.rgb * (self.a * (1.0 - a))[..., None]) / safe
        self.a = out_a

    def paint(self, m, base, light=0.3, dark=0.5, gloss=0.38, ao=0.5, ao_r=None, gloss_pos=(0.32, 0.26),
              gloss_size=(0.26, 0.15), grad="diag", base2=None):
        """Shaded fill: top-left lit gradient, edge occlusion and a soft gloss."""
        if isinstance(base, str):
            base = rgb(base)
        ys, xs = np.nonzero(m > 0.02)
        if len(xs) == 0:
            return
        x0, x1, y0, y1 = float(xs.min()), float(xs.max()), float(ys.min()), float(ys.max())
        w, h = max(x1 - x0, 1), max(y1 - y0, 1)
        if grad == "vert":
            t = (_YY - y0) / h
        elif grad == "horiz":
            t = (_XX - x0) / w
        else:
            t = ((_XX - x0) / w * 0.45 + (_YY - y0) / h * 0.55)
        t = np.clip(t, 0.0, 1.0)[..., None]
        c_top = np.array(lt(base, light), dtype=np.float32)
        c_bot = np.array(dk(base2 if base2 else base, dark), dtype=np.float32)
        col = c_top * (1.0 - t) + c_bot * t
        if ao > 0:
            r = ao_r if ao_r else max(5.0, min(w, h) * 0.04)
            edge = np.clip((m - blur(m, r)) * 2.2, 0.0, 1.0)
            col = col * (1.0 - ao * 0.55 * edge[..., None])
        if gloss > 0:
            gx, gy = x0 + w * gloss_pos[0], y0 + h * gloss_pos[1]
            g = blur(mask(ellipse(gx, gy, w * gloss_size[0], h * gloss_size[1], -28)), max(4.0, min(w, h) * 0.07)) * m
            col = col + (255.0 - col) * (gloss * g)[..., None]
        self.over(col, m)

    def flat(self, m, color, alpha=1.0):
        if isinstance(color, str):
            color = rgb(color)
        self.over(color, m * alpha)

    def lines(self, segments, color, width, clip=None, alpha=1.0, soft=0.0):
        m = line_mask(segments, width)
        if soft > 0:
            m = blur(m, soft)
        if clip is not None:
            m = m * clip
        self.flat(m, color, alpha)

    def glow(self, m, color, radius, strength=0.8):
        if isinstance(color, str):
            color = rgb(color)
        g = np.clip(blur(m, radius) * strength * 1.6, 0.0, 1.0)
        col = np.broadcast_to(np.asarray(color, dtype=np.float32), (W, W, 3))
        out_a = g + self.glow_a * (1.0 - g)
        safe = np.maximum(out_a, 1e-6)[..., None]
        self.glow_rgb = (col * g[..., None] + self.glow_rgb * (self.glow_a * (1.0 - g))[..., None]) / safe
        self.glow_a = out_a

    def sparkle(self, cx, cy, r, color=(255, 252, 230), alpha=1.0):
        m = mask(star(cx, cy, r, r * 0.22, 4, -90))
        self.flat(blur(m, r * 0.08), color, alpha)

    def finish(self, outline=True, shadow=True, outline_px=15):
        h = self.a
        layers_rgb = np.zeros((W, W, 3), dtype=np.float32)
        layers_a = np.zeros((W, W), dtype=np.float32)

        def comp(col, a):
            nonlocal layers_rgb, layers_a
            col = np.asarray(col, dtype=np.float32)
            if col.ndim == 1:
                col = np.broadcast_to(col, (W, W, 3))
            out_a = a + layers_a * (1.0 - a)
            safe = np.maximum(out_a, 1e-6)[..., None]
            layers_rgb = (col * a[..., None] + layers_rgb * (layers_a * (1.0 - a))[..., None]) / safe
            layers_a = out_a

        solid = np.clip(h * 1.4, 0, 1)
        if shadow:
            sh = shift(blur(dilate(solid, 9), 13), 7, 13) * 0.42
            comp(SHADOW, sh)
        if self.glow_a.max() > 0:
            comp(self.glow_rgb, self.glow_a)
        if outline:
            ol = blur(dilate(solid, outline_px), 1.6)
            comp(OUTLINE, ol * 0.92)
        comp(self.rgb, self.a)
        arr = np.dstack([np.clip(layers_rgb, 0, 255), np.clip(layers_a * 255.0, 0, 255)]).astype(np.uint8)
        im = Image.fromarray(arr, "RGBA")
        return im.resize((N, N), Image.LANCZOS)


# ----------------------------------------------------------------------------
# reusable parts


def flame_pts(cx, cy, h, w, lean=0.0, m=1.5, wav=0.0, n=140):
    """Teardrop flame: round base at (cx, cy), pointed tip at height h."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = math.sin(t) * (abs(math.sin(t / 2)) ** m)
        y = -math.cos(t)
        up = (1.0 - y) / 2.0
        x = x * w / 2 + lean * up ** 2 * w * 0.55 + wav * math.sin(up * 8.0) * up * w * 0.08
        pts.append((cx + x, cy - up * h))
    return pts


def draw_flame(c, cx, cy, s, inner=True, rot=0.0):
    """Layered campfire flame standing on (cx, cy); about 330*s tall."""
    h, w = 330 * s, 250 * s
    def P(pts):
        return xform(pts, rot=rot, about=(cx, cy))
    left = mask(P(flame_pts(cx - w * 0.28, cy - 10 * s, h * 0.62, w * 0.55, lean=-0.55)))
    right = mask(P(flame_pts(cx + w * 0.3, cy - 10 * s, h * 0.7, w * 0.55, lean=0.5)))
    main = mask(P(flame_pts(cx, cy, h, w, lean=0.18, wav=0.6)))
    outer = union(left, right, main)
    c.glow(outer, (255, 150, 50), 28 * s + 6, 0.75)
    c.paint(outer, "#f26a24", light=0.2, dark=0.2, gloss=0.0, ao=0.15, grad="vert", base2=rgb("#d8401c"))
    mid = mask(P(flame_pts(cx + 4 * s, cy - 6 * s, h * 0.72, w * 0.68, lean=-0.2, wav=0.5)))
    c.paint(mid, "#ffa83a", light=0.25, dark=0.05, gloss=0.0, ao=0.0, grad="vert", base2=rgb("#ff8a2a"))
    if inner:
        core = mask(P(flame_pts(cx + 2 * s, cy - 4 * s, h * 0.44, w * 0.42, lean=0.15)))
        c.paint(core, "#fff3b8", light=0.4, dark=0.0, gloss=0.0, ao=0.0, grad="vert")
    return outer


def draw_coin(c, cx, cy, r, emboss=True, tilt=1.0):
    rim = mask(ellipse(cx, cy + r * 0.08, r, r * tilt))
    c.paint(rim, "#c88a1c", light=0.1, dark=0.45, gloss=0.0)
    face = mask(ellipse(cx, cy, r * 0.97, r * 0.97 * tilt))
    c.paint(face, "#ffc93c", light=0.35, dark=0.25, gloss=0.5, ao=0.6)
    inner = mask(ellipse(cx, cy, r * 0.72, r * 0.72 * tilt))
    c.paint(sub(face, inner) * 0 + inner, "#f4b228", light=0.15, dark=0.3, gloss=0.0, ao=0.4)
    if emboss:
        st = mask(xform(star(cx, cy, r * 0.46, r * 0.2, 5), about=(cx, cy), scale=1.0))
        if tilt != 1.0:
            st = mask([(x, cy + (y - cy) * tilt) for (x, y) in star(cx, cy, r * 0.46, r * 0.2, 5)])
        c.paint(st, "#ffe08a", light=0.4, dark=0.25, gloss=0.2, ao=0.2)


def draw_sack(c, scale, base, tie, patch=None, emblem=None, strap=False, trim=None):
    cx, cy = 256, 290
    s = scale
    body = blob(cx, cy + 20 * s, 168 * s, 150 * s, 7, 0.04)
    neck = rrect(cx, cy - 135 * s, 120 * s, 70 * s, 26 * s)
    top = [(cx - 95 * s, cy - 170 * s), (cx - 40 * s, cy - 205 * s), (cx, cy - 185 * s), (cx + 45 * s, cy - 210 * s),
           (cx + 100 * s, cy - 172 * s), (cx + 60 * s, cy - 140 * s), (cx - 60 * s, cy - 140 * s)]
    m_body = union(mask(body), mask(neck))
    if strap:
        c.paint(mask(stadium((cx - 150 * s, cy - 30 * s), (cx - 60 * s, cy - 150 * s), 16 * s)), dk(rgb(base), 0.3), gloss=0.1)
    c.paint(mask(top), lt(rgb(base), 0.1), gloss=0.2, ao=0.4)
    c.paint(m_body, base, light=0.28, dark=0.45, gloss=0.3)
    # folds
    c.lines([[(cx - 70 * s, cy - 95 * s), (cx - 95 * s, cy + 10 * s), (cx - 85 * s, cy + 100 * s)],
             [(cx + 60 * s, cy - 100 * s), (cx + 90 * s, cy + 0 * s)]], dk(rgb(base), 0.35), 9 * s, clip=m_body, alpha=0.45, soft=3)
    if trim:
        c.lines([[(cx - 150 * s, cy + 95 * s), (cx, cy + 130 * s), (cx + 150 * s, cy + 95 * s)]], trim, 16 * s, clip=m_body, alpha=0.95)
    if patch:
        pm = mask(rrect(cx + 55 * s, cy + 55 * s, 80 * s, 70 * s, 10 * s, rot=12))
        c.paint(pm, patch, gloss=0.15, ao=0.5)
        pts = rrect(cx + 55 * s, cy + 55 * s, 64 * s, 54 * s, 6 * s, rot=12)
        dash = [pts[i:i + 3] for i in range(0, len(pts) - 2, 6)]
        c.lines(dash, lt(rgb(patch), 0.5), 4 * s, alpha=0.8)
    if emblem == "star":
        c.paint(mask(star(cx, cy + 30 * s, 62 * s, 27 * s)), "#ffcc3a", light=0.35, gloss=0.4)
    # rope tie
    c.paint(mask(rrect(cx, cy - 140 * s, 150 * s, 30 * s, 15 * s, rot=-4)), tie, light=0.3, dark=0.4, gloss=0.3)
    c.paint(mask(ellipse(cx + 70 * s, cy - 140 * s, 22 * s, 18 * s)), tie, gloss=0.2)
    c.paint(mask(stadium((cx + 75 * s, cy - 130 * s), (cx + 100 * s, cy - 85 * s), 9 * s)), tie, gloss=0.1)


def draw_drumstick(c, meat, bone="#f3ead6", rot=-35, steam=False, marbling=False, char=False):
    cx, cy = 256, 256
    m_meat = mask(xform(ellipse(220, 230, 140, 118) + [], rot=0))
    m_meat = mask(xform(blob(215, 235, 140, 120, 3, 0.05), rot=rot, about=(cx, cy)))
    bone_shaft = mask(xform(stadium((300, 300), (395, 395), 26), rot=rot, about=(cx, cy)))
    knob1 = mask(xform(ellipse(395, 420, 30, 30), rot=rot, about=(cx, cy)))
    knob2 = mask(xform(ellipse(422, 392, 30, 30), rot=rot, about=(cx, cy)))
    c.paint(union(bone_shaft, knob1, knob2), bone, light=0.3, dark=0.35, gloss=0.4)
    c.paint(m_meat, meat, light=0.25, dark=0.45, gloss=0.45)
    if marbling:
        segs = [[(170, 200), (210, 225), (250, 215)], [(150, 270), (200, 280)], [(230, 290), (270, 270)]]
        segs = [xform(s, rot=rot, about=(cx, cy)) for s in segs]
        c.lines(segs, (250, 225, 225), 10, clip=m_meat, alpha=0.75, soft=2)
    if char:
        segs = [[(150, 190), (250, 240)], [(140, 245), (240, 300)], [(175, 300), (250, 335)]]
        segs = [xform(s, rot=rot, about=(cx, cy)) for s in segs]
        c.lines(segs, dk(rgb(meat), 0.55), 13, clip=m_meat, alpha=0.6, soft=2)
    if steam:
        draw_steam(c, 170, 70)


def draw_steam(c, x, y, n=3, alpha=0.75):
    for i in range(n):
        ox = x + i * 55
        segs = [[(ox, y + 90), (ox - 18, y + 60), (ox + 4, y + 30), (ox - 10, y)]]
        c.lines(segs, (250, 248, 245), 14, alpha=alpha, soft=3)


def draw_axe(c, head_col, handle_col, kind):
    rot = 0
    cx, cy = 256, 256
    # handle: diagonal from bottom-left to top-right
    hp0, hp1 = (120, 430), (330, 110)
    if kind == "mega":
        c.paint(mask(tapered(hp0, hp1, 22, 20)), handle_col, light=0.25, gloss=0.35)
        for t in (0.18, 0.3):
            px, py = hp0[0] + (hp1[0] - hp0[0]) * t, hp0[1] + (hp1[1] - hp0[1]) * t
            c.paint(mask(xform(rrect(px, py, 58, 14, 6), rot=-56.7, about=(px, py))), "#d9a441", gloss=0.3)
    else:
        c.paint(mask(tapered(hp0, hp1, 19, 16)), handle_col, light=0.25, gloss=0.35)
        # grip wrap
        for t in (0.08, 0.15, 0.22):
            px, py = hp0[0] + (hp1[0] - hp0[0]) * t, hp0[1] + (hp1[1] - hp0[1]) * t
            c.lines([[(px - 22, py - 14), (px + 22, py + 14)]], dk(rgb(handle_col), 0.45), 8, alpha=0.6)
    hx, hy = 318, 128
    if kind == "rusty":
        blade = [(hx - 40, hy - 40), (hx + 40, hy - 10), (hx + 110, hy - 35), (hx + 130, hy + 30), (hx + 115, hy + 105),
                 (hx + 70, hy + 85), (hx + 20, hy + 50), (hx - 30, hy + 40)]
        m = mask(xform(blade, rot=14, about=(hx, hy)))
        c.paint(m, head_col, light=0.15, dark=0.5, gloss=0.18)
        # rust spots + chipped edge
        rnd = np.random.RandomState(4)
        for _ in range(7):
            px, py = hx + rnd.uniform(0, 100), hy + rnd.uniform(-10, 70)
            c.flat(blur(mask(ellipse(px, py, rnd.uniform(8, 16), rnd.uniform(6, 12))), 3) * m, "#6e3518", 0.7)
        edge = xform([(hx + 113, hy - 30), (hx + 128, hy + 30), (hx + 112, hy + 100)], rot=14, about=(hx, hy))
        c.lines([edge], "#c9926a", 9, clip=m, alpha=0.7)
    elif kind == "good":
        blade = [(hx - 40, hy - 45), (hx + 40, hy - 15), (hx + 100, hy - 70), (hx + 140, hy + 20), (hx + 110, hy + 120),
                 (hx + 50, hy + 75), (hx + 20, hy + 55), (hx - 35, hy + 45)]
        m = mask(xform(blade, rot=14, about=(hx, hy)))
        c.paint(m, head_col, light=0.35, dark=0.45, gloss=0.55, base2=rgb("#7d8a98"))
        edge = xform([(hx + 102, hy - 64), (hx + 136, hy + 20), (hx + 108, hy + 112)], rot=14, about=(hx, hy))
        c.lines([edge], (250, 252, 255), 13, clip=m, alpha=0.95)
    else:  # mega: big golden double-bitted head with a glowing starstone
        dx, dy = hp1[0] - hp0[0], hp1[1] - hp0[1]
        ln = math.hypot(dx, dy)
        ux, uy = dx / ln, dy / ln
        nx, ny = -uy, ux
        H = (hp0[0] + dx * 0.8, hp0[1] + dy * 0.8)

        def L(u, v):
            return (H[0] + ux * u + nx * v, H[1] + uy * u + ny * v)
        blades = []
        for side in (1, -1):
            pts = [L(30, 0), L(26, 34 * side)]
            for i in range(25):
                t = -1.0 + 2.0 * i / 24
                pts.append(L(86 * -t, (104 + 26 * (1 - t * t)) * side))
            pts += [L(-26, 34 * side), L(-30, 0)]
            blades.append(mask(pts))
        m = union(*blades)
        c.glow(m, (255, 190, 80), 24, 0.5)
        c.paint(m, head_col, light=0.38, dark=0.35, gloss=0.55, base2=rgb("#e07a1a"))
        for side in (1, -1):
            edge = [L(86 * -(-1.0 + 2.0 * i / 24), (98 + 26 * (1 - (-1.0 + 2.0 * i / 24) ** 2)) * side) for i in range(25)]
            c.lines([edge], (255, 246, 210), 10, clip=m, alpha=0.9)
        hub = mask(ellipse(H[0], H[1], 44, 44))
        c.paint(hub, "#7a4a1c", gloss=0.25)
        gem = mask(ellipse(H[0], H[1], 27, 27))
        c.glow(gem, (127, 214, 255), 16, 0.85)
        c.paint(gem, "#7fd6ff", light=0.45, dark=0.3, gloss=0.6)
        c.sparkle(H[0] + 105, H[1] - 70, 30)


# ----------------------------------------------------------------------------
# item icons


def icon_wood(c):
    def log(cx, cy, length, rad, rot, seed):
        body = rrect(cx, cy, length, rad * 2, rad * 0.5, rot=rot)
        m = mask(body)
        back_end = mask(xform(ellipse(cx - length / 2, cy, rad * 0.42, rad), rot=rot, about=(cx, cy)))
        c.paint(union(m, back_end), "#8a5a33", light=0.22, dark=0.45, gloss=0.25, grad="vert")
        # bark grooves
        segs = []
        for i, off in enumerate((-0.55, -0.12, 0.35, 0.7)):
            yy = cy + off * rad
            segs.append(xform([(cx - length / 2 + 20, yy), (cx - 40 + i * 12, yy + 6), (cx + length / 2 - 30, yy - 3)], rot=rot, about=(cx, cy)))
        c.lines(segs, "#4e301a", 8, clip=m, alpha=0.55, soft=1.5)
        end = mask(xform(ellipse(cx + length / 2, cy, rad * 0.46, rad * 0.98), rot=rot, about=(cx, cy)))
        c.paint(end, "#e2b679", light=0.35, dark=0.25, gloss=0.25, ao=0.7)
        for rr in (0.7, 0.42, 0.16):
            ring = xform(ellipse(cx + length / 2, cy, rad * 0.46 * rr, rad * 0.98 * rr, n=60), rot=rot, about=(cx, cy))
            c.lines([ring + [ring[0]]], "#a8743f", 6, clip=end, alpha=0.75)
    log(232, 200, 290, 66, -18, 1)
    log(262, 330, 310, 74, -18, 2)


def icon_kindling(c):
    sticks = [((130, 400), (380, 110), 15), ((160, 420), (400, 150), 14), ((110, 360), (350, 95), 13),
              ((180, 430), (420, 190), 12), ((145, 380), (395, 125), 14)]
    for (p0, p1, r) in sticks:
        m = mask(stadium(p0, p1, r))
        c.paint(m, "#c9a46b", light=0.3, dark=0.45, gloss=0.3)
        c.paint(mask(ellipse(p1[0], p1[1], r * 0.9, r * 0.9)), "#ecd2a0", gloss=0.0, ao=0.3)
    # twig nubs
    c.paint(mask(stadium((260, 260), (230, 205), 8)), "#b38b54", gloss=0.1)
    # twine
    tw = mask(xform(rrect(262, 268, 150, 34, 14), rot=-48, about=(262, 268)))
    c.paint(tw, "#b4473a", light=0.3, dark=0.4, gloss=0.4)
    c.lines([xform([(205, 268), (320, 268)], rot=-48, about=(262, 268))], "#7e2a22", 5, clip=tw, alpha=0.6)


def icon_stone(c):
    m2 = mask(blob(340, 345, 92, 72, 11, 0.08))
    c.paint(m2, "#7d8085", light=0.3, dark=0.45, gloss=0.3)
    m = mask(blob(225, 270, 160, 128, 5, 0.09, rot=-8))
    c.paint(m, "#9a9c9f", light=0.32, dark=0.5, gloss=0.38)
    # cracks / speckles
    c.lines([[(170, 230), (205, 262), (190, 300)]], "#5e6064", 7, clip=m, alpha=0.6)
    rnd = np.random.RandomState(2)
    for _ in range(9):
        px, py = rnd.uniform(120, 330), rnd.uniform(190, 360)
        c.flat(mask(ellipse(px, py, 6, 5)) * m, "#6b6e72", 0.6)
    c.flat(blur(mask(ellipse(260, 330, 40, 22, -10)), 6) * m, "#6f9050", 0.5)  # moss dab


def icon_coal(c):
    chunks = [
        ([(150, 300), (190, 220), (270, 190), (320, 240), (300, 330), (210, 360)], 1),
        ([(270, 330), (300, 260), (370, 240), (420, 300), (390, 380), (300, 390)], 2),
        ([(130, 400), (150, 340), (230, 350), (250, 410), (190, 440)], 3),
    ]
    for pts, i in chunks:
        m = mask(pts)
        c.paint(m, "#34343c", light=0.25, dark=0.45, gloss=0.25, grad="diag")
        # facets
        cxp = sum(p[0] for p in pts) / len(pts)
        cyp = sum(p[1] for p in pts) / len(pts)
        facet = mask([pts[0], pts[1], (cxp, cyp)])
        c.flat(facet * m, (120, 130, 160), 0.35)
        facet2 = mask([pts[1], pts[2], (cxp, cyp)])
        c.flat(facet2 * m, (170, 180, 210), 0.3)
    c.glow(mask(ellipse(280, 420, 120, 26)), (255, 120, 40), 22, 0.35)
    c.sparkle(300, 225, 22, alpha=0.9)


def icon_cloth(c):
    m1 = mask(rrect(256, 315, 300, 120, 28, rot=-6))
    c.paint(m1, "#e8dcc0", light=0.25, dark=0.4, gloss=0.25)
    m2 = mask(rrect(250, 225, 290, 120, 28, rot=4))
    c.paint(m2, "#c86b5a", light=0.28, dark=0.42, gloss=0.35)
    # fold line + stitches
    c.lines([[(115, 250), (390, 268)]], "#8c3f33", 8, clip=m2, alpha=0.5, soft=2)
    pts = rrect(250, 225, 260, 92, 18, rot=4)
    dash = [pts[i:i + 2] for i in range(0, len(pts) - 1, 4)]
    c.lines(dash, "#f6d9c8", 5, alpha=0.85)
    c.lines([[(120, 335), (395, 300)]], "#b3a383", 7, clip=m1, alpha=0.5, soft=2)


def icon_scrap_metal(c):
    plate = [(110, 330), (170, 190), (300, 160), (360, 230), (330, 380), (200, 410)]
    m = mask(plate)
    c.paint(m, "#9aa4ad", light=0.35, dark=0.45, gloss=0.4)
    c.lines([[(160, 300), (300, 210)]], "#6b747c", 9, clip=m, alpha=0.5)
    for (x, y) in ((175, 225), (305, 195), (320, 345), (205, 380)):
        c.paint(mask(ellipse(x, y, 13, 13)), "#c9d0d6", gloss=0.5, ao=0.3)
    c.flat(blur(mask(ellipse(240, 340, 40, 20, 20)), 8) * m, "#a0522d", 0.45)
    # gear
    gx, gy, r = 340, 330, 92
    teeth = []
    for i in range(8):
        a = i * 45
        teeth.append(rrect(gx + math.cos(math.radians(a)) * r, gy + math.sin(math.radians(a)) * r, 46, 40, 8, rot=a))
    g = union(mask(ellipse(gx, gy, r, r)), *[mask(t) for t in teeth])
    g = sub(g, mask(ellipse(gx, gy, 32, 32)))
    c.paint(g, "#b8c0c8", light=0.3, dark=0.5, gloss=0.45)


def icon_bone(c):
    rot = -35
    shaft = mask(xform(rrect(256, 256, 260, 62, 30), rot=rot, about=(256, 256)))
    knobs = [mask(xform(ellipse(x, y, 44, 44), rot=rot, about=(256, 256))) for (x, y) in
             ((126, 222), (126, 290), (386, 222), (386, 290))]
    c.paint(union(shaft, *knobs), "#efe6cf", light=0.35, dark=0.38, gloss=0.5)


def icon_shadow_shard(c):
    pts = [(256, 70), (330, 210), (310, 400), (250, 450), (190, 380), (180, 220)]
    m = mask(pts)
    c.glow(m, (150, 110, 255), 30, 0.75)
    c.paint(m, "#5b4a9e", light=0.25, dark=0.5, gloss=0.2, base2=rgb("#2e2260"))
    c.flat(mask([(256, 70), (330, 210), (256, 250), (180, 220)]) * m, (190, 170, 255), 0.45)
    c.flat(mask([(256, 250), (330, 210), (310, 400), (250, 450)]) * m, (30, 20, 70), 0.35)
    c.lines([[(256, 80), (256, 440)]], (200, 185, 255), 5, clip=m, alpha=0.5)
    side = [(330, 300), (380, 260), (395, 340), (350, 390)]
    m2 = mask(side)
    c.paint(m2, "#6c5ab8", light=0.25, dark=0.5, gloss=0.2)
    c.sparkle(200, 150, 34)
    c.sparkle(370, 210, 22, alpha=0.8)


def icon_amber(c):
    pts = xform(flame_pts(256, 440, 400, 290, lean=0.0, m=1.1), rot=16, about=(256, 300))
    m = mask(pts)
    c.glow(m, (255, 175, 60), 28, 0.6)
    c.paint(m, "#ffb43a", light=0.3, dark=0.4, gloss=0.65, base2=rgb("#d0641a"))
    inner = mask(xform(ellipse(262, 330, 80, 95), rot=16, about=(256, 300)))
    c.flat(blur(inner, 26) * m, (255, 236, 160), 0.6)
    facet = mask(xform([(256, 60), (330, 250), (256, 300), (190, 250)], rot=16, about=(256, 300)))
    c.flat(facet * m, (255, 240, 190), 0.18)
    leaf = mask(xform(ellipse(270, 345, 34, 14), rot=-30, about=(270, 345)))
    c.paint(leaf, "#8a5a14", gloss=0.0, ao=0.0)
    c.lines([[(250, 360), (292, 330)]], "#6a4210", 4, alpha=0.8)
    c.sparkle(200, 200, 34)


def icon_starstone(c):
    m = mask(blob(256, 280, 165, 140, 21, 0.07, rot=10))
    c.glow(m, (127, 214, 255), 30, 0.7)
    c.paint(m, "#5aa9d6", light=0.3, dark=0.5, gloss=0.4, base2=rgb("#2d5f9a"))
    st = mask(star(256, 275, 92, 38, 5))
    c.glow(st, (200, 245, 255), 14, 0.9)
    c.paint(st, "#d8f6ff", light=0.5, dark=0.1, gloss=0.3, ao=0.2)
    c.sparkle(370, 160, 32)
    c.sparkle(140, 370, 22, alpha=0.8)


def icon_battery(c):
    rot = -30
    body = mask(xform(rrect(256, 270, 150, 290, 34), rot=rot, about=(256, 256)))
    nub = mask(xform(rrect(256, 110, 60, 40, 10), rot=rot, about=(256, 256)))
    c.paint(nub, "#c9ced6", gloss=0.4)
    c.paint(body, "#e8d14b", light=0.3, dark=0.45, gloss=0.5)
    band = mask(xform(rrect(256, 350, 150, 120, 0), rot=rot, about=(256, 256))) * body
    c.paint(band, "#3a3a46", light=0.25, dark=0.4, gloss=0.25)
    plus = union(mask(xform(rrect(256, 220, 64, 18, 6), rot=rot, about=(256, 256))),
                 mask(xform(rrect(256, 220, 18, 64, 6), rot=rot, about=(256, 256))))
    c.flat(plus, "#7a5c10", 0.9)
    bolt = xform([(262, 312), (236, 356), (258, 356), (246, 398), (284, 342), (262, 342), (276, 312)], rot=rot, about=(256, 256))
    c.flat(mask(bolt), "#ffe56b", 1.0)


def icon_berries(c):
    leaf1 = mask(xform(ellipse(330, 150, 80, 36), rot=-30, about=(330, 150)))
    leaf2 = mask(xform(ellipse(200, 140, 70, 32), rot=25, about=(200, 140)))
    c.paint(leaf2, "#5f8f3e", light=0.3, gloss=0.3)
    c.paint(leaf1, "#6fa048", light=0.3, gloss=0.3)
    c.lines([[(270, 130), (300, 160), (330, 150)], [(270, 130), (220, 145)]], "#3f6a2a", 6, alpha=0.7)
    c.lines([[(268, 120), (240, 210)], [(268, 120), (330, 230)], [(268, 120), (270, 200)]], "#5a3a22", 8)
    for (x, y, r) in ((180, 300, 78), (330, 310, 82), (255, 380, 80), (260, 235, 70)):
        m = mask(ellipse(x, y, r, r))
        c.paint(m, "#c2335d", light=0.3, dark=0.45, gloss=0.6)
        c.flat(mask(ellipse(x + r * 0.15, y - r * 0.55, r * 0.14, r * 0.1)), "#5a1428", 0.6)


def mushroom(c, cap, stem, ox=0, oy=0, s=1.0, rot=0.0, spots=True):
    stem_m = mask(xform(rrect(256 + ox, 330 + oy, 110 * s, 190 * s, 40 * s), rot=rot, about=(256 + ox, 300 + oy)))
    c.paint(stem_m, stem, light=0.3, dark=0.35, gloss=0.3, grad="horiz")
    cap_pts = []
    for i in range(61):
        a = math.pi + math.pi * i / 60
        cap_pts.append((256 + ox + math.cos(a) * 170 * s, 250 + oy + math.sin(a) * 150 * s))
    cap_pts += [(256 + ox + 170 * s, 262 + oy), (256 + ox, 285 + oy), (256 + ox - 170 * s, 262 + oy)]
    cap_m = mask(xform(cap_pts, rot=rot, about=(256 + ox, 300 + oy)))
    c.paint(cap_m, cap, light=0.3, dark=0.45, gloss=0.5)
    if spots:
        for (x, y, r) in ((-70, -60, 20), (20, -100, 16), (85, -40, 18), (-10, -30, 12)):
            p = xform([(256 + ox + x * s, 250 + oy + y * s)], rot=rot, about=(256 + ox, 300 + oy))[0]
            c.flat(mask(ellipse(p[0], p[1], r * s, r * s * 0.8)) * cap_m, "#f3e6cc", 0.85)
    return cap_m


def icon_mushroom(c):
    mushroom(c, "#b57c4f", "#efe3c9", ox=60, oy=40, s=0.62, rot=12, spots=False)
    mushroom(c, "#c7a07a", "#f2e8d2", ox=-20, oy=0, s=1.0, rot=-8)


def icon_roasted_mushroom(c):
    c.paint(mask(stadium((130, 450), (390, 70), 11)), "#a8794a", gloss=0.3)
    cap = mushroom(c, "#8f6038", "#d8b98a", ox=0, oy=20, s=0.95, rot=-12, spots=False)
    c.lines([[(140, 200), (360, 160)], [(150, 245), (370, 205)]], "#4a2a14", 12, clip=cap, alpha=0.55, soft=2)
    draw_steam(c, 170, 20, 3, 0.7)


def icon_raw_meat(c):
    draw_drumstick(c, "#d9706e", marbling=True)


def icon_cooked_meat(c):
    draw_drumstick(c, "#9c5530", char=True, steam=True)


def icon_jerky(c):
    def strip(cx, cy, rot, col):
        pts = []
        for i in range(21):
            t = i / 20
            x = -150 + 300 * t
            y = math.sin(t * 6.0) * 14
            pts.append((x, y - 34))
        for i in range(20, -1, -1):
            t = i / 20
            x = -150 + 300 * t
            y = math.sin(t * 6.0 + 0.6) * 14
            pts.append((x, y + 34))
        m = mask(xform(pts, rot=rot, offset=(cx, cy)))
        c.paint(m, col, light=0.25, dark=0.45, gloss=0.3)
        c.lines([xform([(-120, 0), (-40, 8), (40, -6), (120, 4)], rot=rot, offset=(cx, cy))], dk(rgb(col), 0.4), 7, clip=m, alpha=0.5)
    strip(250, 180, -20, "#8a4a2a")
    strip(260, 270, -12, "#7a3e24")
    strip(262, 360, -24, "#6a3420")


def icon_canned_beans(c):
    body = mask(rrect(256, 280, 250, 300, 30))
    c.paint(body, "#c6ccd4", light=0.3, dark=0.45, gloss=0.4, grad="horiz")
    label = mask(rrect(256, 290, 254, 190, 6)) * body
    c.paint(label, "#c4562d", light=0.28, dark=0.4, gloss=0.35, grad="horiz")
    c.paint(mask(rrect(256, 290, 150, 96, 40)), "#f1d9a6", gloss=0.2, ao=0.3)
    for (x, y) in ((225, 280), (258, 300), (290, 278), (240, 310), (275, 268)):
        c.paint(mask(ellipse(x, y, 18, 13, 30)), "#a5502a", gloss=0.5, ao=0.2)
    top = mask(ellipse(256, 132, 125, 34))
    c.paint(top, "#dfe4ea", light=0.3, gloss=0.4, ao=0.6)
    c.lines([ellipse(256, 132, 95, 24, n=60)], "#9aa2ac", 5, alpha=0.7)


def icon_trail_mix(c):
    bowl_pts = []
    for i in range(41):
        a = math.pi * i / 40
        bowl_pts.append((256 + math.cos(a) * 190, 250 + math.sin(a) * 170))
    rnd = np.random.RandomState(8)
    pile = mask(ellipse(256, 250, 175, 70))
    c.paint(pile, "#b98d4a", gloss=0.1)
    bits = []
    for i in range(26):
        x, y = rnd.uniform(110, 400), rnd.uniform(180, 265)
        kind = i % 4
        col = ["#d9a35c", "#5b3a2a", "#8f4f2c", "#e9d3a6"][kind]
        bits.append((x, y, col, kind))
    for (x, y, col, kind) in sorted(bits, key=lambda b: b[1]):
        if kind == 0:
            m = mask(ellipse(x, y, 26, 17, rnd.uniform(-40, 40)))
        elif kind == 1:
            m = mask(ellipse(x, y, 16, 14))
        elif kind == 2:
            m = mask(blob(x, y, 20, 16, int(x), 0.15))
        else:
            m = mask(ellipse(x, y, 22, 15, rnd.uniform(-40, 40)))
        c.paint(m, col, light=0.3, gloss=0.45, ao=0.3)
    bowl = mask(bowl_pts)
    c.paint(bowl, "#6b8fb8", light=0.3, dark=0.45, gloss=0.35)
    c.lines([[(85, 260), (427, 260)]], "#a9c6e3", 18, alpha=0.9)
    c.lines([[(150, 330), (190, 360)], [(240, 350), (280, 370)], [(330, 330), (365, 352)]], "#f4f0e6", 10, clip=bowl, alpha=0.6)


def icon_bandage(c):
    rot = -38
    strip = mask(xform(rrect(256, 256, 400, 150, 70), rot=rot, about=(256, 256)))
    c.paint(strip, "#f2e3cc", light=0.25, dark=0.35, gloss=0.4)
    pad = mask(xform(rrect(256, 256, 140, 112, 22), rot=rot, about=(256, 256)))
    c.paint(pad, "#fbf7ef", light=0.2, dark=0.25, gloss=0.2, ao=0.6)
    for dx in (-140, -100, 100, 140):
        for dy in (-30, 30):
            p = xform([(256 + dx, 256 + dy)], rot=rot, about=(256, 256))[0]
            c.flat(mask(ellipse(p[0], p[1], 8, 8)), "#c8b394", 0.8)
    cross = union(mask(xform(rrect(256, 256, 70, 22, 6), rot=rot, about=(256, 256))),
                  mask(xform(rrect(256, 256, 22, 70, 6), rot=rot, about=(256, 256))))
    c.flat(cross, "#e05555", 0.85)


def icon_medkit(c):
    handle = sub(mask(rrect(256, 150, 170, 100, 36)), mask(rrect(256, 168, 110, 70, 20)))
    c.paint(handle, "#7a7f88", gloss=0.4)
    box = mask(rrect(256, 290, 360, 250, 44))
    c.paint(box, "#e04848", light=0.28, dark=0.42, gloss=0.45)
    c.lines([[(80, 205), (432, 205)]], "#a62f2f", 10, clip=box, alpha=0.6)
    cross = union(mask(rrect(256, 300, 150, 52, 12)), mask(rrect(256, 300, 52, 150, 12)))
    c.paint(cross, "#fbf7f2", light=0.2, dark=0.2, gloss=0.3, ao=0.3)


def icon_rusty_axe(c):
    draw_axe(c, "#a0522d", "#7a5636", "rusty")


def icon_good_axe(c):
    draw_axe(c, "#c0c8d0", "#a8703a", "good")


def icon_mega_axe(c):
    draw_axe(c, "#ffb02e", "#5b3420", "mega")


def icon_wooden_bat(c):
    m = mask(tapered((120, 410), (380, 110), 18, 46))
    c.paint(m, "#c08a4c", light=0.32, dark=0.42, gloss=0.5)
    c.paint(mask(ellipse(118, 412, 30, 30)), "#a0703a", gloss=0.3)
    grip = mask(tapered((130, 398), (205, 310), 21, 24)) * 1.0
    c.paint(grip, "#3d5a8a", light=0.25, gloss=0.3)
    for t in (0.2, 0.45, 0.7):
        px, py = 130 + 75 * t, 398 - 88 * t
        c.lines([[(px - 22, py - 18), (px + 22, py + 18)]], "#2a3f63", 6, clip=grip, alpha=0.8)
    c.lines([[(250, 270), (345, 160)]], "#e8c18f", 8, clip=m, alpha=0.5, soft=2)


def sword(c, blade_col, guard_col, grip_col, glow=None):
    rot = 45
    bx, by = 256, 256
    blade = xform([(-20, -200), (0, -232), (20, -200), (22, 60), (-22, 60)], rot=rot, offset=(bx - 20, by + 20))
    m = mask(blade)
    if glow:
        c.glow(m, glow, 26, 0.85)
    c.paint(m, blade_col, light=0.4, dark=0.4, gloss=0.5, grad="horiz")
    c.lines([xform([(0, -210), (0, 50)], rot=rot, offset=(bx - 20, by + 20))], lt(rgb(blade_col), 0.6), 6, clip=m, alpha=0.8)
    guard = mask(xform(rrect(0, 70, 150, 30, 14), rot=rot, offset=(bx - 20, by + 20)))
    c.paint(guard, guard_col, light=0.35, gloss=0.5)
    grip = mask(xform(rrect(0, 130, 34, 100, 12), rot=rot, offset=(bx - 20, by + 20)))
    c.paint(grip, grip_col, light=0.25, gloss=0.3)
    pommel = mask(xform(ellipse(0, 190, 26, 26), rot=rot, offset=(bx - 20, by + 20)))
    c.paint(pommel, guard_col, light=0.35, gloss=0.5)


def icon_sword(c):
    sword(c, "#cfd8e3", "#9a6a3a", "#5a3a22")


def icon_starsteel_sword(c):
    sword(c, "#8be0ff", "#ffc23a", "#2f3f7a", glow=(120, 220, 255))
    c.sparkle(370, 140, 40)
    c.sparkle(300, 230, 22, alpha=0.9)


def icon_revolver(c):
    rot = -8
    barrel = mask(xform(rrect(300, 205, 250, 52, 16), rot=rot, about=(256, 256)))
    c.paint(barrel, "#6d6f78", light=0.35, dark=0.45, gloss=0.5)
    frame = mask(xform([(180, 180), (260, 175), (270, 270), (200, 290), (160, 260)], rot=rot, about=(256, 256)))
    c.paint(frame, "#5d6068", light=0.3, gloss=0.4)
    cyl = mask(xform(rrect(225, 225, 110, 82, 26), rot=rot, about=(256, 256)))
    c.paint(cyl, "#80838d", light=0.35, gloss=0.5)
    for dx in (-30, 0, 30):
        p = xform([(225 + dx, 225)], rot=rot, about=(256, 256))[0]
        c.lines([[(p[0], p[1] - 30), (p[0], p[1] + 30)]], "#4a4c55", 7, clip=cyl, alpha=0.7)
    grip = mask(xform([(165, 250), (225, 270), (200, 400), (140, 420), (110, 390)], rot=rot, about=(256, 256)))
    c.paint(grip, "#8a5a33", light=0.3, gloss=0.4)
    c.lines([xform([(160, 300), (190, 380)], rot=rot, about=(256, 256))], "#5c3a20", 6, clip=grip, alpha=0.6)
    guard = sub(mask(xform(ellipse(235, 300, 45, 38), rot=rot, about=(256, 256))),
                mask(xform(ellipse(235, 296, 28, 22), rot=rot, about=(256, 256))))
    c.paint(guard, "#5d6068", gloss=0.3)
    c.paint(mask(xform(rrect(410, 175, 16, 24, 4), rot=rot, about=(256, 256))), "#5d6068", gloss=0.2)


def icon_rifle(c):
    rot = -32
    o = (256, 256)
    barrel = mask(xform(rrect(320, 240, 330, 26, 12), rot=rot, about=o))
    c.paint(barrel, "#4f525c", light=0.35, gloss=0.5)
    stock = mask(xform([(40, 250), (190, 232), (290, 236), (300, 270), (170, 285), (60, 320), (30, 300)], rot=rot, about=o))
    c.paint(stock, "#7a5236", light=0.3, dark=0.45, gloss=0.45)
    rec = mask(xform(rrect(235, 238, 110, 40, 10), rot=rot, about=o))
    c.paint(rec, "#5d606a", gloss=0.4)
    scope = mask(xform(rrect(245, 200, 120, 30, 15), rot=rot, about=o))
    c.paint(scope, "#33363e", light=0.3, gloss=0.5)
    c.paint(mask(xform(ellipse(305, 200, 14, 18), rot=rot, about=o)), "#7fb0d6", gloss=0.5)
    trig = sub(mask(xform(ellipse(225, 280, 26, 22), rot=rot, about=o)), mask(xform(ellipse(225, 276, 16, 13), rot=rot, about=o)))
    c.paint(trig, "#4f525c", gloss=0.2)


def bullet(c, x, y, h, w, case_col, tip_col):
    case = mask(rrect(x, y + h * 0.15, w, h * 0.7, w * 0.18))
    c.paint(case, case_col, light=0.35, dark=0.4, gloss=0.55, grad="horiz")
    tip = []
    for i in range(31):
        a = math.pi + math.pi * i / 30
        tip.append((x + math.cos(a) * w / 2, y - h * 0.2 + math.sin(a) * h * 0.32))
    tip += [(x + w / 2, y - h * 0.2), (x - w / 2, y - h * 0.2)]
    tip.append((x - w / 2, y - h * 0.18))
    tm = mask(tip + [(x + w / 2, y - h * 0.18)])
    tm = union(tm, mask(rrect(x, y - h * 0.2, w, 20, 2)))
    c.paint(tm, tip_col, light=0.35, gloss=0.5, grad="horiz")
    c.lines([[(x - w / 2, y + h * 0.42), (x + w / 2, y + h * 0.42)]], dk(rgb(case_col), 0.4), 8, alpha=0.6)


def icon_revolver_rounds(c):
    for (x, y) in ((170, 300), (256, 270), (342, 300)):
        bullet(c, x, y, 200, 70, "#d8b04a", "#b87a3e")


def icon_rifle_rounds(c):
    for (x, y) in ((200, 270), (312, 250)):
        case = mask(rrect(x, y + 60, 74, 250, 12))
        c.paint(case, "#c99a3a", light=0.35, dark=0.4, gloss=0.55, grad="horiz")
        neck = mask([(x - 37, y - 60), (x + 37, y - 60), (x + 22, y - 95), (x - 22, y - 95)])
        c.paint(neck, "#c99a3a", light=0.35, gloss=0.4, grad="horiz")
        tip = mask([(x - 22, y - 92), (x + 22, y - 92), (x + 8, y - 170), (x, y - 180), (x - 8, y - 170)])
        c.paint(tip, "#a9653a", light=0.3, gloss=0.5, grad="horiz")
        c.lines([[(x - 37, y + 165), (x + 37, y + 165)]], "#7d5a1c", 8, alpha=0.6)


def icon_flashlight(c):
    rot = -35
    o = (256, 256)
    beam = mask(xform([(330, 200), (500, 120), (512, 330), (330, 300)], rot=0, about=o))
    beam = mask(xform([(350, 230), (490, 120), (500, 330)], rot=0))
    c.glow(beam, (255, 240, 160), 18, 0.55)
    body = mask(xform(rrect(200, 300, 230, 84, 30), rot=rot, about=o))
    c.paint(body, "#3d6fb4", light=0.32, dark=0.45, gloss=0.5)
    for dx in (-60, -30, 0):
        p = xform([(200 + dx, 300)], rot=rot, about=o)[0]
        c.lines([xform([(p[0], p[1] - 40), (p[0], p[1] + 40)], rot=rot, about=p)], "#2a4f86", 7, clip=body, alpha=0.7)
    head = mask(xform([(300, 250), (380, 225), (380, 375), (300, 350)], rot=rot, about=o))
    c.paint(head, "#4a80c8", light=0.35, gloss=0.5)
    lens = mask(xform(ellipse(382, 300, 22, 78), rot=rot, about=o))
    c.paint(lens, "#fff2b0", light=0.5, dark=0.1, gloss=0.6)
    c.glow(lens, (255, 240, 170), 20, 0.8)
    btn = mask(xform(rrect(215, 255, 36, 18, 8), rot=rot, about=o))
    c.paint(btn, "#e04848", gloss=0.4)


def icon_torch(c):
    c.paint(mask(tapered((200, 460), (290, 210), 18, 26)), "#8a5a33", light=0.25, gloss=0.35)
    wrap = mask(xform(rrect(292, 200, 82, 100, 22), rot=20, about=(292, 200)))
    c.paint(wrap, "#c9a46b", light=0.25, gloss=0.3)
    c.lines([xform([(255, 175), (330, 185)], rot=20, about=(292, 200)), xform([(255, 210), (330, 220)], rot=20, about=(292, 200))],
            "#8f6a3a", 7, clip=wrap, alpha=0.7)
    draw_flame(c, 300, 160, 0.48)


def icon_map(c):
    panels = [[(80, 150), (190, 110), (190, 400), (80, 440)], [(190, 110), (320, 150), (320, 440), (190, 400)],
              [(320, 150), (432, 110), (432, 400), (320, 440)]]
    shades = ["#e3cf9f", "#d6c08f", "#e3cf9f"]
    ms = []
    for p, s in zip(panels, shades):
        m = mask(p)
        ms.append(m)
        c.paint(m, s, light=0.25, dark=0.3, gloss=0.15, ao=0.35)
    allm = union(*ms)
    c.lines([[(110, 380), (170, 330), (240, 350), (300, 270), (360, 240)]], "#8a5a33", 9, clip=allm, alpha=0.85)
    for i, p in enumerate([(130, 350), (200, 335), (265, 320)]):
        pass
    c.flat(blur(mask(blob(250, 200, 60, 40, 5, 0.2)), 4) * allm, "#7fae6a", 0.55)
    c.flat(blur(mask(blob(380, 330, 40, 30, 9, 0.2)), 4) * allm, "#6aa3c9", 0.6)
    x, y = 370, 220
    c.lines([[(x - 26, y - 26), (x + 26, y + 26)], [(x - 26, y + 26), (x + 26, y - 26)]], "#d9412e", 15)
    c.flat(mask(ellipse(110, 380, 16, 16)), "#ffb347")


def icon_old_sack(c):
    draw_sack(c, 0.74, "#9b7b55", "#6b4a2f", patch="#b9a07a")


def icon_good_sack(c):
    draw_sack(c, 0.84, "#7d8f4e", "#c9a46b")


def icon_mega_sack(c):
    draw_sack(c, 0.93, "#3f7fa6", "#e8c88a", strap=True, trim="#ffb347")


def icon_best_sack(c):
    draw_sack(c, 1.02, "#a64fbf", "#ffcc3a", emblem="star", strap=True, trim="#ffcc3a")
    c.sparkle(400, 150, 30)


def icon_coins(c):
    draw_coin(c, 200, 330, 105, tilt=0.45)
    draw_coin(c, 330, 340, 100, tilt=0.45)
    draw_coin(c, 265, 290, 105, tilt=0.45)
    draw_coin(c, 270, 200, 120)


# ----------------------------------------------------------------------------
# UI glyphs


def heart_pts(cx, cy, s):
    pts = []
    for i in range(160):
        t = 2 * math.pi * i / 160
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * s, cy + y * s))
    return pts


def ui_heart(c):
    m = mask(heart_pts(256, 262, 12.5))
    c.paint(m, "#e5484d", light=0.32, dark=0.45, gloss=0.65, gloss_pos=(0.3, 0.3))


def ui_hunger(c):
    draw_drumstick(c, "#e08a3c", rot=-40)


def ui_warmth(c):
    tube = mask(rrect(256, 210, 96, 300, 48))
    bulb = mask(ellipse(256, 370, 84, 84))
    c.paint(union(tube, bulb), "#eef2f6", light=0.2, dark=0.3, gloss=0.5)
    fill = union(mask(rrect(256, 260, 46, 230, 23)), mask(ellipse(256, 370, 58, 58)))
    c.paint(fill, "#ff6a3d", light=0.3, dark=0.35, gloss=0.4, base2=rgb("#e8392b"))
    for y in (130, 175, 220, 265):
        c.lines([[(300, y), (330, y)]], "#9aa6b4", 9)


def ui_fire(c):
    for (p0, p1) in (((140, 440), (380, 380)), ((140, 385), (380, 445))):
        c.paint(mask(stadium(p0, p1, 26)), "#8a5a33", light=0.25, gloss=0.3)
    draw_flame(c, 256, 380, 0.98)


def ui_coin(c):
    draw_coin(c, 256, 256, 180)


def ui_sun(c):
    m = mask(ellipse(256, 256, 120, 120))
    rays = []
    for i in range(10):
        a = i * 36
        rays.append(mask(xform(rrect(256, 256 - 190, 46, 80, 23), rot=a, about=(256, 256))))
    r = union(*rays)
    c.glow(m, (255, 210, 90), 30, 0.6)
    c.paint(r, "#ffb347", light=0.3, dark=0.3, gloss=0.2)
    c.paint(m, "#ffd34d", light=0.4, dark=0.35, gloss=0.55)


def ui_moon(c):
    m = sub(mask(ellipse(240, 256, 175, 175)), mask(ellipse(330, 200, 150, 150)))
    c.glow(m, (170, 190, 255), 26, 0.5)
    c.paint(m, "#e7e2c3", light=0.35, dark=0.4, gloss=0.4, base2=rgb("#9fb0e0"))
    for (x, y, r) in ((170, 300, 18), (200, 380, 12), (130, 230, 10)):
        c.flat(mask(ellipse(x, y, r, r)) * m, "#c9c3a0", 0.7)
    c.sparkle(380, 330, 36)
    c.sparkle(420, 200, 20, alpha=0.9)


def ui_sack(c):
    draw_sack(c, 1.0, "#b08a5a", "#6b4a2f")


def ui_map(c):
    icon_map(c)


def ui_lock(c):
    shackle = sub(mask(rrect(256, 190, 220, 260, 110)), mask(rrect(256, 200, 140, 200, 70)))
    shackle = shackle * mask(rrect(256, 140, 400, 220, 0))
    c.paint(shackle, "#aeb6c0", light=0.35, gloss=0.5)
    body = mask(rrect(256, 320, 290, 220, 44))
    c.paint(body, "#f0b43c", light=0.35, dark=0.42, gloss=0.5)
    hole = union(mask(ellipse(256, 305, 30, 30)), mask([(240, 310), (272, 310), (282, 380), (230, 380)]))
    c.flat(hole, "#6b4317", 0.9)


def ui_home_arrow(c):
    arrow = [(256, 40), (430, 260), (330, 260), (330, 470), (182, 470), (182, 260), (82, 260)]
    m = mask(arrow)
    c.paint(m, "#ffc04d", light=0.3, dark=0.22, gloss=0.4, base2=rgb("#f39a2e"))
    tent = mask([(256, 300), (306, 400), (206, 400)])
    c.flat(tent, "#6b3f1a", 0.85)
    c.flat(mask([(256, 350), (272, 400), (240, 400)]), "#ffe2a8", 0.9)


def ui_eye(c):
    outer = []
    for i in range(80):
        t = 2 * math.pi * i / 80
        outer.append((256 + math.cos(t) * 200, 256 + math.sin(t) * 120 * abs(math.sin(t)) ** 0.6 * (1 if math.sin(t) >= 0 else 1)))
    m = mask(outer)
    c.paint(m, "#f6f3ea", light=0.2, dark=0.3, gloss=0.3)
    iris = mask(ellipse(256, 256, 82, 82)) * m
    c.paint(iris, "#5f7fbf", light=0.35, dark=0.4, gloss=0.2)
    c.flat(mask(ellipse(256, 256, 38, 38)), "#1b1c30")
    c.flat(mask(ellipse(228, 228, 18, 18)), "#ffffff", 0.95)


def ui_tent(c):
    back = mask([(256, 90), (450, 420), (62, 420)])
    c.paint(back, "#d9cfb0", light=0.25, dark=0.4, gloss=0.3)
    side = mask([(256, 90), (450, 420), (330, 420)])
    c.paint(side, "#c0703f", light=0.2, dark=0.4, gloss=0.2)
    door = mask([(256, 190), (320, 420), (192, 420)])
    c.paint(door, "#4a2c1c", light=0.2, dark=0.2, gloss=0.0)
    c.flat(blur(mask([(256, 250), (300, 420), (212, 420)]), 10), "#ffb347", 0.75)
    c.lines([[(256, 90), (256, 50)]], "#6b4a2f", 14)
    c.paint(mask([(256, 50), (320, 70), (256, 92)]), "#e5484d", gloss=0.2)
    c.lines([[(40, 430), (472, 430)]], "#6f8f4e", 18)


def ui_star(c):
    m = mask(star(256, 270, 210, 95, 5))
    c.paint(m, "#ffd04a", light=0.3, dark=0.22, gloss=0.5, base2=rgb("#f5a623"))


def round_badge(c, col):
    m = mask(ellipse(256, 256, 200, 200))
    c.paint(m, col, light=0.3, dark=0.42, gloss=0.45)
    return m


def ui_check(c):
    round_badge(c, "#4caf6a")
    c.lines([[(160, 265), (230, 335), (360, 185)]], "#ffffff", 52)


def ui_cross(c):
    round_badge(c, "#e0524a")
    c.lines([[(175, 175), (337, 337)], [(337, 175), (175, 337)]], "#ffffff", 52)


def ui_info(c):
    round_badge(c, "#5f7fbf")
    c.flat(mask(ellipse(256, 160, 34, 34)), "#ffffff")
    c.flat(mask(rrect(256, 300, 62, 170, 26)), "#ffffff")


def ui_warn(c):
    tri = [(256, 50), (470, 430), (42, 430)]
    m = mask(tri)
    m = blur(m, 14)
    m = np.clip((m - 0.35) * 3.0, 0, 1)
    c.paint(m, "#ffc04d", light=0.3, dark=0.22, gloss=0.4, base2=rgb("#f39a2e"))
    c.flat(mask(rrect(256, 260, 56, 170, 26)), "#3a2410")
    c.flat(mask(ellipse(256, 380, 32, 32)), "#3a2410")


def ui_chest(c):
    body = mask(rrect(256, 320, 380, 200, 26))
    lid = mask(rrect(256, 190, 380, 120, 50))
    c.paint(body, "#9a6235", light=0.28, dark=0.45, gloss=0.3)
    c.paint(lid, "#b07240", light=0.3, dark=0.42, gloss=0.45)
    for x in (130, 382):
        c.paint(mask(rrect(x, 280, 40, 330, 10)), "#e0a43c", light=0.3, gloss=0.4)
    c.paint(mask(rrect(256, 255, 70, 80, 14)), "#ffcf4a", light=0.3, gloss=0.5)
    c.flat(mask(ellipse(256, 250, 10, 14)), "#6b4317")
    c.glow(mask(rrect(256, 240, 300, 20, 6)), (255, 210, 120), 14, 0.5)


def ui_boot(c):
    for (x, y, r) in ((180, 330, 0), (330, 210, 0)):
        sole = mask(ellipse(x, y, 62, 100, -15))
        c.paint(sole, "#8a6a4a", light=0.3, gloss=0.3)
        for i, (dx, dy, rr) in enumerate(((-40, -120, 18), (-12, -132, 17), (16, -130, 16), (40, -118, 15))):
            p = xform([(x + dx, y + dy)], rot=-15, about=(x, y))[0]
            c.paint(mask(ellipse(p[0], p[1], rr, rr)), "#8a6a4a", gloss=0.2)


def ui_paw(c):
    pad = mask(blob(256, 320, 120, 100, 4, 0.04))
    c.paint(pad, "#5b4a9e", light=0.3, dark=0.45, gloss=0.4)
    for (x, y, r) in ((130, 190, 52), (210, 130, 56), (302, 130, 56), (382, 190, 52)):
        c.paint(mask(ellipse(x, y, r, r * 1.15)), "#5b4a9e", light=0.3, dark=0.45, gloss=0.45)


def ui_trophy(c):
    cup = []
    for i in range(41):
        a = math.pi * i / 40
        cup.append((256 + math.cos(a) * 150, 150 + math.sin(a) * 180))
    cup = [(106, 90), (406, 90)] + cup[::-1][::-1]
    cup = [(106, 90), (406, 90)] + [(256 + math.cos(math.pi * i / 40) * 150, 150 + math.sin(math.pi * i / 40) * 170) for i in range(41)]
    handles = sub(union(mask(ellipse(110, 170, 70, 70)), mask(ellipse(402, 170, 70, 70))),
                  union(mask(ellipse(110, 170, 40, 40)), mask(ellipse(402, 170, 40, 40))))
    c.paint(handles, "#e8a32a", gloss=0.3)
    c.paint(mask(cup), "#ffc93c", light=0.38, dark=0.42, gloss=0.55, base2=rgb("#e8892b"))
    c.paint(mask(rrect(256, 350, 50, 80, 10)), "#e8a32a", gloss=0.3)
    c.paint(mask(rrect(256, 420, 210, 60, 16)), "#8a5a33", light=0.3, gloss=0.3)
    c.paint(mask(star(256, 180, 60, 26)), "#fff1b0", gloss=0.2, ao=0.2)


def ui_snowflake(c):
    segs = []
    for i in range(6):
        a = math.radians(i * 60 - 90)
        ex, ey = 256 + math.cos(a) * 200, 256 + math.sin(a) * 200
        segs.append([(256, 256), (ex, ey)])
        for t, l in ((0.55, 60), (0.8, 45)):
            px, py = 256 + math.cos(a) * 200 * t, 256 + math.sin(a) * 200 * t
            for s in (-1, 1):
                b = a + s * math.radians(50)
                segs.append([(px, py), (px + math.cos(b) * l, py + math.sin(b) * l)])
    m = line_mask(segs, 34)
    c.glow(m, (190, 230, 255), 18, 0.5)
    c.paint(m, "#cfeaff", light=0.3, dark=0.35, gloss=0.3, base2=rgb("#7fb3e8"))


def ui_skip(c):
    ui_star(c)


# ----------------------------------------------------------------------------


ITEM_DRAW = {
    "wood": icon_wood, "kindling": icon_kindling, "stone": icon_stone, "coal": icon_coal, "cloth": icon_cloth,
    "scrap_metal": icon_scrap_metal, "bone": icon_bone, "shadow_shard": icon_shadow_shard, "amber": icon_amber,
    "starstone": icon_starstone, "battery": icon_battery, "berries": icon_berries, "mushroom": icon_mushroom,
    "roasted_mushroom": icon_roasted_mushroom, "raw_meat": icon_raw_meat, "cooked_meat": icon_cooked_meat,
    "jerky": icon_jerky, "canned_beans": icon_canned_beans, "trail_mix": icon_trail_mix, "bandage": icon_bandage,
    "medkit": icon_medkit, "rusty_axe": icon_rusty_axe, "good_axe": icon_good_axe, "mega_axe": icon_mega_axe,
    "wooden_bat": icon_wooden_bat, "sword": icon_sword, "starsteel_sword": icon_starsteel_sword,
    "revolver": icon_revolver, "rifle": icon_rifle, "revolver_rounds": icon_revolver_rounds,
    "rifle_rounds": icon_rifle_rounds, "flashlight": icon_flashlight, "torch": icon_torch, "map": icon_map,
    "old_sack": icon_old_sack, "good_sack": icon_good_sack, "mega_sack": icon_mega_sack, "best_sack": icon_best_sack,
    "coins": icon_coins,
}

UI_DRAW = {
    "ui_heart": ui_heart, "ui_hunger": ui_hunger, "ui_warmth": ui_warmth, "ui_fire": ui_fire, "ui_coin": ui_coin,
    "ui_sun": ui_sun, "ui_moon": ui_moon, "ui_sack": ui_sack, "ui_map": ui_map, "ui_lock": ui_lock,
    "ui_home_arrow": ui_home_arrow, "ui_eye": ui_eye, "ui_tent": ui_tent, "ui_star": ui_star,
    "ui_check": ui_check, "ui_cross": ui_cross, "ui_info": ui_info, "ui_warn": ui_warn, "ui_chest": ui_chest,
    "ui_boot": ui_boot, "ui_paw": ui_paw, "ui_trophy": ui_trophy, "ui_snowflake": ui_snowflake,
}


def generic_icon(item):
    """Fallback for item ids added later without a dedicated drawing."""
    def draw(c):
        col = item.get("color", "#9caf88")
        m = mask(blob(256, 270, 170, 150, abs(hash(item.get("name", "x"))) % 1000, 0.06))
        c.paint(m, col, light=0.32, dark=0.45, gloss=0.5)
        c.sparkle(350, 180, 40)
    return draw


def render(fn):
    c = Icon()
    fn(c)
    return c.finish()


def fix_imports():
    """Turn on mipmaps for icon textures so they stay smooth when drawn small."""
    n = 0
    for f in sorted(os.listdir(OUT_DIR)):
        if not f.endswith(".png.import"):
            continue
        p = os.path.join(OUT_DIR, f)
        with open(p) as fh:
            s = fh.read()
        if "mipmaps/generate=false" in s:
            s = s.replace("mipmaps/generate=false", "mipmaps/generate=true")
            with open(p, "w") as fh:
                fh.write(s)
            n += 1
    print("enabled mipmaps in %d .import files" % n)


def main(argv):
    if "--fix-imports" in argv:
        fix_imports()
        return
    sheet_path = None
    if "--sheet" in argv:
        i = argv.index("--sheet")
        sheet_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    only = [a for a in argv if not a.startswith("--")]
    with open(os.path.join(ROOT, "data", "items.json")) as fh:
        items = json.load(fh)
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = []
    for iid, item in items.items():
        jobs.append((iid, ITEM_DRAW.get(iid) or generic_icon(item)))
        if iid not in ITEM_DRAW:
            print("note: %s uses the generic icon" % iid)
    jobs.append(("coins", ITEM_DRAW["coins"]))
    for k, fn in UI_DRAW.items():
        jobs.append((k, fn))
    done = []
    for iid, fn in jobs:
        if only and iid not in only:
            continue
        im = render(fn)
        im.save(os.path.join(OUT_DIR, iid + ".png"), optimize=True)
        done.append((iid, im))
    print("wrote %d icons to %s" % (len(done), OUT_DIR))
    if sheet_path and done:
        cols = 8
        rows = (len(done) + cols - 1) // cols
        cell = 150
        sheet = Image.new("RGBA", (cols * cell, rows * cell), (34, 44, 38, 255))
        d = ImageDraw.Draw(sheet)
        for i, (iid, im) in enumerate(done):
            x, y = (i % cols) * cell, (i // cols) * cell
            sheet.alpha_composite(im, (x + 11, y + 4))
            small = im.resize((48, 48), Image.LANCZOS)
            sheet.alpha_composite(small, (x + cell - 50, y + cell - 50))
            d.text((x + 4, y + cell - 14), iid[:18], fill=(230, 220, 200, 255))
        sheet.save(sheet_path)
        print("sheet:", sheet_path)


if __name__ == "__main__":
    main(sys.argv[1:])
