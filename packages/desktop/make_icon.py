from PIL import Image, ImageDraw

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # black rounded square
    pad = max(1, int(size * 0.14))
    inner = size - pad * 2
    r = max(4, int(size * 0.22))
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=(10, 10, 11, 255))
    # red outline
    outline_w = max(1, int(size * 0.07))
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=None, outline=(225, 6, 0, 255), width=outline_w)
    # white "C" letter
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("arialbd.ttf", max(8, int(size * 0.55)))
    except:
        try:
            font = ImageFont.truetype("arial.ttf", max(8, int(size * 0.55)))
        except:
            font = ImageFont.load_default()
    txt = "C"
    bbox = draw.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - int(size * 0.02)
    draw.text((x, y), txt, font=font, fill=(255, 255, 255, 255))

    # ensure alpha is preserved when saving
    return img

sizes = [256, 128, 64, 48, 32, 16]
imgs = [make_icon(s) for s in sizes]

import io, struct
buf = io.BytesIO()
imgs[0].save(buf, format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[1:])

with open(r"C:\Users\fakef\OneDrive\Desktop\Code Platform\cowxcode\packages\desktop\ui\icon.ico", "wb") as f:
    f.write(buf.getvalue())

print(f"icon.ico written: {len(buf.getvalue())} bytes, sizes: {sizes}")
