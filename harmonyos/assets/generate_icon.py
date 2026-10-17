"""Generate the playful Travel Map app icon at Huawei's 1024 px size."""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
S = 3
CANVAS = 1024


def p(v):
    return round(v * S)


def points(values):
    return [(p(x), p(y)) for x, y in values]


image = Image.new("RGBA", (p(CANVAS), p(CANVAS)), "#FFE6A7")
draw = ImageDraw.Draw(image)

# Warm background marks leave the center clear at small launcher sizes.
draw.ellipse((p(-135), p(-170), p(390), p(355)), fill="#FFF1C8")
draw.ellipse((p(792), p(32), p(1038), p(278)), fill="#FFD47F")
draw.ellipse((p(845), p(88), p(975), p(218)), fill="#FFF6D4")

# The folded map is the main object; each panel has a distinct paper tint.
map_outline = points([(122, 363), (365, 305), (610, 363), (878, 302),
                      (878, 760), (635, 829), (390, 771), (122, 835)])
draw.polygon(map_outline, fill="#315D55")
draw.polygon(points([(149, 384), (365, 334), (365, 748), (149, 802)]), fill="#CBE7D2")
draw.polygon(points([(365, 334), (610, 391), (610, 798), (365, 748)]), fill="#F3F0CF")
draw.polygon(points([(610, 391), (850, 338), (850, 739), (610, 798)]), fill="#B8DCCC")
draw.line(points([(365, 334), (365, 748)]), fill="#79AD9E", width=p(13))
draw.line(points([(610, 391), (610, 798)]), fill="#79AD9E", width=p(13))

# A route, with three stops, keeps the trip-planning purpose legible.
route = points([(210, 698), (322, 584), (425, 642), (545, 592), (686, 665), (778, 566)])
draw.line(route, fill="#FFF8E2", width=p(28), joint="curve")
draw.line(route, fill="#F47D65", width=p(14), joint="curve")
for x, y in [(210, 698), (425, 642), (686, 665), (778, 566)]:
    draw.ellipse((p(x - 19), p(y - 19), p(x + 19), p(y + 19)), fill="#FFF8E2")
    draw.ellipse((p(x - 12), p(y - 12), p(x + 12), p(y + 12)), fill="#F47D65")

# Two emoji-style travel companions overlap the map. The larger one is also a map pin.
draw.polygon(points([(397, 396), (618, 400), (510, 602)]), fill="#E76854")
draw.ellipse((p(352), p(211), p(665), p(524)), fill="#E76854")
draw.ellipse((p(374), p(233), p(643), p(502)), fill="#FFCF4F")
draw.arc((p(418), p(271), p(476), p(357)), 200, 340, fill="#4B3C32", width=p(13))
draw.arc((p(538), p(271), p(596), p(357)), 200, 340, fill="#4B3C32", width=p(13))
draw.arc((p(437), p(330), p(579), p(447)), 8, 171, fill="#4B3C32", width=p(15))
draw.ellipse((p(399), p(362), p(431), p(381)), fill="#F7A270")
draw.ellipse((p(585), p(362), p(617), p(381)), fill="#F7A270")

# Little friend and conversation bubble make collaboration obvious.
draw.rounded_rectangle((p(661), p(242), p(889), p(455)), radius=p(75), fill="#fffaf0", outline="#315D55", width=p(16))
draw.polygon(points([(688, 419), (684, 474), (738, 431)]), fill="#315D55")
draw.ellipse((p(686), p(264), p(864), p(442)), fill="#FFCF4F")
draw.ellipse((p(733), p(325), p(749), p(348)), fill="#4B3C32")
draw.ellipse((p(801), p(325), p(817), p(348)), fill="#4B3C32")
draw.arc((p(728), p(327), p(819), p(400)), 7, 172, fill="#4B3C32", width=p(10))

image = image.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS).convert("RGB")
for relative in (
    "AppScope/resources/base/media/app_icon.png",
    "entry/src/main/resources/base/media/app_icon.png",
):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, optimize=True)

preview = ROOT / "assets" / "app_icon_preview.png"
image.save(preview, optimize=True)
print(preview)
