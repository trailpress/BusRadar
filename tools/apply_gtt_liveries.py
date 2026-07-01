from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend" / "public" / "assets" / "vehicles" / "detail"

BLUE = (0, 86, 180, 118)
DEEP_BLUE = (0, 57, 140, 132)
YELLOW = (236, 238, 35, 142)
URBAN_YELLOW = (248, 197, 30, 126)
WHITE = (246, 248, 250, 218)
SUBURBAN_BLUE = (0, 100, 190, 126)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def soft_polygon(draw: ImageDraw.ImageDraw, points, fill):
    draw.polygon(points, fill=fill)


def rounded_band(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, color=(255, 255, 255, 235), scale=1.0):
    f = font(int(44 * scale))
    draw.text((x, y), "GTT", fill=color, font=f, stroke_width=max(1, int(2 * scale)), stroke_fill=(0, 52, 120, 175))
    # small swoosh-like blue/yellow underline to make it read as operator branding without embedding a copied logo file.
    draw.line((x + int(8 * scale), y + int(52 * scale), x + int(92 * scale), y + int(43 * scale)), fill=(255, 202, 35, 220), width=max(3, int(5 * scale)))


def foreground_mask(img: Image.Image) -> Image.Image:
    # Studio backgrounds are dark. This keeps livery layers on the vehicle body instead of rectangular overlays.
    rgb = img.convert("RGB")
    gray = rgb.convert("L")
    bright = gray.point(lambda px: 255 if px > 46 else 0)
    blue = rgb.getchannel("B").point(lambda px: 255 if px > 78 else 0)
    red = rgb.getchannel("R").point(lambda px: 255 if px > 70 else 0)
    mask = ImageChops.lighter(bright, ImageChops.lighter(blue, red))
    # Remove most floor reflection: vehicle body is in the upper/middle part of the render.
    crop = Image.new("L", img.size, 0)
    cd = ImageDraw.Draw(crop)
    cd.rectangle((0, 120, img.width, 665), fill=255)
    mask = ImageChops.multiply(mask, crop)
    return mask.filter(ImageFilter.GaussianBlur(1.3))


def clip_to_vehicle(img: Image.Image, overlay: Image.Image) -> Image.Image:
    alpha = overlay.getchannel("A")
    clipped_alpha = ImageChops.multiply(alpha, foreground_mask(img))
    overlay.putalpha(clipped_alpha)
    return overlay


def apply_overlay(filename: str, mode: str):
    path = ASSETS / filename
    img = Image.open(path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    if mode == "electric":
        # Real GTT electric fleet is visually much more blue/yellow than the previous generic blue-white render.
        soft_polygon(d, [(1035, 232), (1345, 226), (1320, 604), (1088, 618)], YELLOW)
        rounded_band(d, (148, 214, 1030, 242), 12, YELLOW)
        soft_polygon(d, [(95, 482), (985, 482), (955, 625), (85, 620)], BLUE)
        rounded_band(d, (135, 612, 1018, 640), 8, YELLOW)
        mark(d, 360, 510, color=(255, 255, 255, 240), scale=1.0)

    elif mode == "cng":
        soft_polygon(d, [(1092, 240), (1350, 232), (1320, 608), (1130, 622)], URBAN_YELLOW)
        rounded_band(d, (150, 612, 1024, 640), 8, URBAN_YELLOW)
        rounded_band(d, (292, 212, 990, 234), 10, DEEP_BLUE)
        mark(d, 390, 515, color=(255, 255, 255, 238), scale=0.95)

    elif mode == "articulated":
        soft_polygon(d, [(1088, 238), (1382, 230), (1340, 604), (1132, 620)], URBAN_YELLOW)
        rounded_band(d, (118, 608, 1185, 638), 8, URBAN_YELLOW)
        rounded_band(d, (240, 210, 1135, 234), 10, DEEP_BLUE)
        mark(d, 492, 510, color=(255, 255, 255, 238), scale=1.0)

    elif mode == "suburban":
        # Suburban/interurban GTT buses read as blue coaches: reduce the urban white/blue split.
        soft_polygon(d, [(130, 224), (1198, 224), (1160, 602), (122, 620)], SUBURBAN_BLUE)
        rounded_band(d, (170, 246, 1090, 276), 12, (225, 236, 246, 92))
        rounded_band(d, (172, 615, 1094, 642), 8, URBAN_YELLOW)
        mark(d, 420, 515, color=(255, 255, 255, 240), scale=1.0)

    elif mode == "tram":
        rounded_band(d, (170, 575, 1235, 615), 8, URBAN_YELLOW)
        soft_polygon(d, [(1040, 240), (1380, 230), (1340, 590), (1090, 610)], DEEP_BLUE)
        mark(d, 560, 505, color=(255, 255, 255, 238), scale=1.0)

    overlay = clip_to_vehicle(img, overlay)
    composed = Image.alpha_composite(img, overlay)
    # Slight unsharp after overlays so the bands do not look blurred when scaled in the sheet.
    composed = composed.filter(ImageFilter.UnsharpMask(radius=0.6, percent=115, threshold=3))
    composed.save(path)


def main():
    apply_overlay("byd-k9-electric-12m-real-3d.png", "electric")
    apply_overlay("iia-citymood-cng-12m-real-3d.png", "cng")
    apply_overlay("iveco-urbanway-cng-18m-real-3d.png", "articulated")
    apply_overlay("mercedes-conecto-18m-3d.png", "articulated")
    apply_overlay("urban-articulated-18m-3d-v2.png", "articulated")
    apply_overlay("iveco-crossway-suburban-real-3d.png", "suburban")
    apply_overlay("tram-3d.png", "tram")


if __name__ == "__main__":
    main()
