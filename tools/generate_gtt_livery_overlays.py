from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "frontend" / "public" / "assets" / "vehicles" / "detail"

BLUE = (0, 64, 164, 118)
DEEP_BLUE = (0, 39, 120, 138)
YELLOW = (255, 217, 22, 132)
YELLOW_SOFT = (255, 226, 45, 118)
BLACK_GLASS = (6, 11, 17, 90)
WHITE = (245, 247, 246, 160)
TRAM_GREY = (168, 172, 174, 130)


def font(size: int, bold: bool = True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def poly(draw: ImageDraw.ImageDraw, points, fill):
    draw.polygon(points, fill=fill)


def text(draw: ImageDraw.ImageDraw, xy, value: str, size: int, fill=YELLOW):
    draw.text(xy, value, font=font(size), fill=fill)


def save(base_name: str, out_name: str, painter):
    img = Image.open(ASSET_DIR / base_name).convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    painter(draw, img.size)
    composed = Image.alpha_composite(img, layer)
    composed.save(ASSET_DIR / out_name)


def byd(draw, size):
    w, h = size
    poly(draw, [(0.07*w, 0.60*h), (0.78*w, 0.60*h), (0.94*w, 0.51*h), (0.93*w, 0.72*h), (0.11*w, 0.73*h)], YELLOW)
    poly(draw, [(0.08*w, 0.70*h), (0.94*w, 0.70*h), (0.93*w, 0.81*h), (0.11*w, 0.81*h)], DEEP_BLUE)
    poly(draw, [(0.66*w, 0.50*h), (0.84*w, 0.50*h), (0.91*w, 0.60*h), (0.73*w, 0.62*h)], DEEP_BLUE)
    poly(draw, [(0.38*w, 0.62*h), (0.58*w, 0.62*h), (0.67*w, 0.72*h), (0.48*w, 0.72*h)], (0, 64, 164, 95))
    draw.rounded_rectangle((0.72*w, 0.40*h, 0.81*w, 0.45*h), radius=8, fill=(255, 226, 45, 145))
    text(draw, (0.735*w, 0.400*h), "GTT", int(0.030*w), fill=(0, 39, 120, 210))
    draw.rectangle((0.11*w, 0.805*h, 0.78*w, 0.817*h), fill=(255, 178, 0, 155))


def urban_12(draw, size):
    w, h = size
    poly(draw, [(0.09*w, 0.61*h), (0.74*w, 0.61*h), (0.92*w, 0.53*h), (0.92*w, 0.70*h), (0.10*w, 0.72*h)], YELLOW_SOFT)
    poly(draw, [(0.06*w, 0.70*h), (0.94*w, 0.69*h), (0.93*w, 0.81*h), (0.10*w, 0.81*h)], BLUE)
    poly(draw, [(0.56*w, 0.62*h), (0.76*w, 0.62*h), (0.68*w, 0.70*h), (0.48*w, 0.70*h)], DEEP_BLUE)
    draw.rectangle((0.11*w, 0.805*h, 0.72*w, 0.817*h), fill=(255, 161, 0, 155))
    draw.rounded_rectangle((0.58*w, 0.39*h, 0.67*w, 0.44*h), radius=8, fill=(255, 226, 45, 145))
    text(draw, (0.595*w, 0.392*h), "GTT", int(0.030*w), fill=(0, 39, 120, 210))


def urban_18(draw, size):
    w, h = size
    poly(draw, [(0.04*w, 0.59*h), (0.40*w, 0.59*h), (0.39*w, 0.70*h), (0.04*w, 0.70*h)], YELLOW_SOFT)
    poly(draw, [(0.52*w, 0.59*h), (0.91*w, 0.59*h), (0.95*w, 0.69*h), (0.52*w, 0.70*h)], YELLOW_SOFT)
    poly(draw, [(0.03*w, 0.69*h), (0.42*w, 0.69*h), (0.42*w, 0.81*h), (0.04*w, 0.81*h)], BLUE)
    poly(draw, [(0.51*w, 0.69*h), (0.95*w, 0.68*h), (0.95*w, 0.81*h), (0.52*w, 0.81*h)], BLUE)
    poly(draw, [(0.25*w, 0.60*h), (0.38*w, 0.60*h), (0.33*w, 0.69*h), (0.20*w, 0.69*h)], DEEP_BLUE)
    poly(draw, [(0.67*w, 0.60*h), (0.84*w, 0.60*h), (0.78*w, 0.69*h), (0.61*w, 0.69*h)], DEEP_BLUE)
    draw.rectangle((0.04*w, 0.805*h, 0.90*w, 0.817*h), fill=(255, 161, 0, 155))
    draw.rounded_rectangle((0.72*w, 0.39*h, 0.81*w, 0.44*h), radius=8, fill=(255, 226, 45, 145))
    text(draw, (0.735*w, 0.392*h), "GTT", int(0.027*w), fill=(0, 39, 120, 210))


def tram(draw, size):
    w, h = size
    poly(draw, [(0.08*w, 0.50*h), (0.90*w, 0.49*h), (0.96*w, 0.62*h), (0.10*w, 0.70*h)], TRAM_GREY)
    draw.rectangle((0.12*w, 0.66*h, 0.88*w, 0.70*h), fill=DEEP_BLUE)
    draw.rectangle((0.12*w, 0.62*h, 0.88*w, 0.635*h), fill=YELLOW_SOFT)
    draw.rounded_rectangle((0.48*w, 0.46*h, 0.57*w, 0.515*h), radius=9, fill=(240, 240, 235, 170))
    text(draw, (0.495*w, 0.462*h), "GTT", int(0.033*w), fill=DEEP_BLUE)


def interurban(draw, size):
    w, h = size
    poly(draw, [(0.06*w, 0.58*h), (0.87*w, 0.56*h), (0.95*w, 0.68*h), (0.10*w, 0.76*h)], (0, 83, 172, 175))
    draw.rectangle((0.12*w, 0.40*h, 0.88*w, 0.455*h), fill=YELLOW_SOFT)
    draw.rectangle((0.10*w, 0.78*h, 0.86*w, 0.795*h), fill=(255, 171, 0, 200))
    text(draw, (0.63*w, 0.405*h), "GTT", int(0.037*w), fill=DEEP_BLUE)


def main():
    save("byd-k9-electric-12m-real-3d.png", "byd-k9-electric-12m-gtt-livery-3d.png", byd)
    save("byd-electric-12m-3d-v2.png", "iveco-eway-electric-12m-gtt-livery-3d.png", byd)
    save("urban-standard-12m-3d.png", "urban-standard-12m-gtt-livery-3d.png", urban_12)
    save("urban-articulated-18m-3d-v2.png", "urban-articulated-18m-gtt-livery-3d.png", urban_18)
    save("tram-3d.png", "tram-gtt-livery-3d.png", tram)
    save("interurban-blue-12m-3d.png", "interurban-blue-12m-gtt-livery-3d.png", interurban)


if __name__ == "__main__":
    main()
