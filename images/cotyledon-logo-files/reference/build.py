"""
Cotyledon — powered by Ember OS. Logo kit builder.

Inputs (work/):
  tile.png            Cotyledon tile, cut from the reference with a rounded mask (876 px native)
  word_alpha.npy      COTYLEDON wordmark, luminance-keyed from the reference (1532 px native)
  ember badge         Ember OS square icon from the Ember web library
Endorsement "POWERED BY EMBER OS" is vector type (Poppins + Montserrat), rendered at exact size.

Run:  python3 build.py
"""
import os, io, sys
import numpy as np, cairosvg
from PIL import Image, ImageDraw
sys.path.insert(0, "/home/claude/muse-ember/source")
import build as B                                   # shared endorsement type engine
HERE = os.path.dirname(os.path.abspath(__file__))
B.MONT_B = os.path.join(HERE, "work/montserrat-latin-700-normal.woff")
B.MONT_L = os.path.join(HERE, "work/montserrat-latin-300-normal.woff")
OUT = os.path.join(HERE, "cotyledon-logo-files")

# ---------------------------------------------------------------- palette (decided 2026-09-28)
PAL = dict(
    forest="#0E3326",      # dark background (study B)
    cream_bg="#F4EEE3",    # light background (study F)
    cream="#F6ECDA",       # COTYLEDON on dark
    ink="#0E3326",         # COTYLEDON on light
    mint="#9ED5B5",        # endorsement on dark (the cotyledon leaves)
    copper="#B8733A",      # endorsement on light (the topsoil)
)
SURFACES = {   # name: (background or None, wordmark color, endorsement color)
    "dark-background": (PAL["forest"], PAL["cream"], PAL["mint"]),
    "light-background": (PAL["cream_bg"], PAL["ink"], PAL["copper"]),
    "on-dark": (None, PAL["cream"], PAL["mint"]),
    "on-light": (None, PAL["ink"], PAL["copper"]),
}

TILE = Image.open(os.path.join(HERE, "work/tile.png"))
ALPHA = np.load(os.path.join(HERE, "work/word_alpha.npy"))
EMBER = Image.open("/home/claude/ember-library/icon/ember-mark-square-512.png").convert("RGBA")


def rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fit(im, w=None, h=None):
    if w: h = round(im.height * w / im.width)
    else: w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)


def wordmark(color):
    o = np.zeros((*ALPHA.shape, 4), "uint8"); o[..., :3] = rgb(color)
    o[..., 3] = (ALPHA * 255).astype("uint8")
    im = Image.fromarray(o, "RGBA")
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox())


def endorsement(color, cap, stacked=False):
    g, w, h = (B.endorsement_stacked if stacked else B.endorsement)(color, cap)
    png = cairosvg.svg2png(bytestring=B.svg(w + 4, h + 4, f'<g transform="translate(2 2)">{g}</g>').encode())
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


def ember_badge(size):
    b = fit(EMBER, w=size); m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 * 40 / 176, fill=255)
    b.putalpha(m.resize((size, size), Image.LANCZOS)); return b


def canvas(w, h, bg):
    return Image.new("RGBA", (round(w), round(h)), (rgb(bg) + (255,)) if bg else (0, 0, 0, 0))


# ---------------------------------------------------------------- layouts (T = tile width in px)
def stacked(T, bg, wc, ec, badge=False):
    t = fit(TILE, w=T); wm = fit(wordmark(wc), w=round(T * 1.36))
    en = endorsement(ec, max(8, round(T * 0.047)))
    pad = round(T * 0.16); g1 = round(T * 0.17); g2 = round(T * 0.11)
    row_w, row_h = en.width, en.height
    if badge:
        bs = round(en.height * 2.6); bg_gap = round(en.height * 0.9)
        row_w, row_h = bs + bg_gap + en.width, bs
    W = max(t.width, wm.width, row_w) + pad * 2
    H = pad + t.height + g1 + wm.height + g2 + row_h + pad
    c = canvas(W, H, bg); y = pad
    c.alpha_composite(t, ((W - t.width) // 2, y)); y += t.height + g1
    c.alpha_composite(wm, ((W - wm.width) // 2, y)); y += wm.height + g2
    x = (W - row_w) // 2
    if badge:
        c.alpha_composite(ember_badge(bs), (x, y)); x += bs + bg_gap
        c.alpha_composite(en, (x, y + (bs - en.height) // 2))
    else:
        c.alpha_composite(en, (x, y))
    return c


def horizontal(h, bg, wc, ec, badge=False):
    """Header lockup. h = tile height in px."""
    t = fit(TILE, h=h); wm = fit(wordmark(wc), h=round(h * 0.27))
    pad = round(h * 0.30); gap = round(h * 0.17)
    x_t = pad + t.width + gap
    if not badge:
        en = endorsement(ec, max(7, round(wm.height * 0.30)))
        g = round(wm.height * 0.42); block = wm.height + g + en.height
        W = x_t + max(wm.width, en.width) + pad; H = h + pad * 2
        c = canvas(W, H, bg); c.alpha_composite(t, (pad, pad))
        y = pad + (h - block) // 2
        c.alpha_composite(wm, (x_t, y)); c.alpha_composite(en, (x_t + 2, y + wm.height + g))
        return c
    en = endorsement(ec, max(8, round(wm.height * 0.40)), stacked=True)
    bs = round(h * 0.40); x_div = x_t + wm.width + round(gap * 1.1); x_b = x_div + round(gap * 1.1)
    W = x_b + bs + round(bs * 0.28) + en.width + pad; H = h + pad * 2
    c = canvas(W, H, bg); c.alpha_composite(t, (pad, pad))
    c.alpha_composite(wm, (x_t, pad + (h - wm.height) // 2))
    d = ImageDraw.Draw(c); lc = rgb(ec) + (140,)
    d.rectangle([x_div, pad + round(h * .22), x_div + max(1, round(h / 130)), pad + round(h * .78)], fill=lc)
    c.alpha_composite(ember_badge(bs), (x_b, pad + (h - bs) // 2))
    c.alpha_composite(en, (x_b + round(bs * 1.28), pad + (h - en.height) // 2))
    return c


def endorsement_file(cap, bg, ec, badge=False):
    en = endorsement(ec, cap); pad = round(cap * 0.6)
    if not badge:
        c = canvas(en.width + pad * 2, en.height + pad * 2, bg); c.alpha_composite(en, (pad, pad)); return c
    bs = round(cap * 2.6); gap = round(cap * 0.75)
    c = canvas(pad + bs + gap + en.width + pad, bs + pad * 2, bg)
    c.alpha_composite(ember_badge(bs), (pad, pad)); c.alpha_composite(en, (pad + bs + gap, pad + (bs - en.height) // 2))
    return c


# ---------------------------------------------------------------- build
def save(im, rel):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True); return rel


def build():
    files = []
    for s, (bg, wc, ec) in SURFACES.items():
        # stacked: @2x master has the tile at 600 px (within the 876 px source)
        files += [save(stacked(600, bg, wc, ec), f"stacked/cotyledon-stacked-{s}@2x.png"),
                  save(stacked(300, bg, wc, ec), f"stacked/cotyledon-stacked-{s}.png"),
                  save(stacked(600, bg, wc, ec, True), f"stacked/cotyledon-stacked-badge-{s}@2x.png"),
                  save(stacked(300, bg, wc, ec, True), f"stacked/cotyledon-stacked-badge-{s}.png")]
        # header: tile 80 px @1x (typical nav bar), 160 @2x, plus a 200 px large version
        for h, tag in ((80, ""), (160, "@2x"), (200, "-large")):
            files.append(save(horizontal(h, bg, wc, ec), f"header/cotyledon-header-{s}{tag}.png"))
        for h, tag in ((80, ""), (160, "@2x")):
            files.append(save(horizontal(h, bg, wc, ec, True), f"header/cotyledon-header-badge-{s}{tag}.png"))
        # endorsement alone
        files += [save(endorsement_file(28, bg, ec), f"endorsement/powered-by-ember-os-{s}.png"),
                  save(endorsement_file(56, bg, ec), f"endorsement/powered-by-ember-os-{s}@2x.png"),
                  save(endorsement_file(28, bg, ec, True), f"endorsement/powered-by-ember-os-badge-{s}.png"),
                  save(endorsement_file(56, bg, ec, True), f"endorsement/powered-by-ember-os-badge-{s}@2x.png")]
    # wordmark alone
    for name, (bg, col) in {"on-dark": (None, PAL["cream"]), "on-light": (None, PAL["ink"]),
                            "dark-background": (PAL["forest"], PAL["cream"]),
                            "light-background": (PAL["cream_bg"], PAL["ink"])}.items():
        for w, tag in ((1500, "-full"), (600, ""), (300, "-small")):
            wm = fit(wordmark(col), w=w); pad = round(w * 0.06)
            c = canvas(wm.width + pad * 2, wm.height + pad * 2, bg); c.alpha_composite(wm, (pad, pad))
            files.append(save(c, f"wordmark/cotyledon-wordmark-{name}{tag}.png"))
    # icon: tile alone, transparent rounded corners
    files.append(save(TILE, "icon/cotyledon-icon-876-native.png"))
    up = fit(TILE, w=1024); files.append(save(up, "icon/cotyledon-icon-1024-upscaled.png"))
    for px in (512, 256, 192, 180, 128, 64, 48, 32, 16):
        files.append(save(fit(TILE, w=px), f"icon/cotyledon-icon-{px}.png"))
    for s in ("dark-background", "light-background"):        # icon centered on brand background
        bgc = SURFACES[s][0]; c = canvas(1024, 1024, bgc); t = fit(TILE, w=760)
        c.alpha_composite(t, ((1024 - t.width) // 2, (1024 - t.height) // 2))
        files.append(save(c, f"icon/cotyledon-icon-on-{s.split('-')[0]}-square-1024.png"))
    fit(TILE, w=256).save(os.path.join(OUT, "icon/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    files.append("icon/favicon.ico")
    return files


if __name__ == "__main__":
    f = build(); print(len(f), "files")
