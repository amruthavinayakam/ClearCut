"""Generate the deterministic demo rough cut.

Everything here is original and fictional by construction — the brands,
artworks, signage, and music cue are invented for this repo. That matters: a
project about rights clearance must not ship uncleared third-party material.

Produces `backend/app/samples/the_long_way_down_roughcut.mp4`, a ~40s cut with
five deliberately planted clearance candidates, three of which never appear in
the screenplay. Those three are the point of the demo.

    python tools/generate_demo_assets.py
"""

from __future__ import annotations

import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 960, 540
FPS = 24
DURATION = 40.0
TOTAL_FRAMES = int(DURATION * FPS)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "backend" / "app" / "samples"
OUT_MP4 = OUT_DIR / "the_long_way_down_roughcut.mp4"
TMP_WAV = OUT_DIR / "_cue.wav"

# --------------------------------------------------------------------------
# The planted elements. This is the golden dataset the evaluation checks
# recall against, so it lives in one place and is exported alongside the video.
# --------------------------------------------------------------------------

PLANTED = [
    {
        "name": "Midnight Orchard",
        "category": "artwork",
        "start": 8.0,
        "end": 17.5,
        "in_script": False,
        "note": "Gallery poster on the apartment wall. Never in the screenplay — "
        "set decoration added on the day.",
    },
    {
        "name": "Northstar Cola",
        "category": "brand",
        "start": 17.5,
        "end": 25.0,
        "in_script": False,
        "note": "Package design on the table. Unscripted prop.",
    },
    {
        "name": "Harbor Lights, 1961",
        "category": "artwork",
        "start": 25.0,
        "end": 32.0,
        "in_script": True,
        "note": "Framed photograph. The script says 'a photograph' generically; "
        "the cut shows a specific credited work.",
    },
    {
        "name": "The Velvet Room",
        "category": "brand",
        "start": 32.0,
        "end": 40.0,
        "in_script": True,
        "note": "Neon signage for the club named in the screenplay.",
    },
    {
        "name": "Cold Harbor (instrumental cue)",
        "category": "music",
        "start": 0.0,
        "end": 40.0,
        "in_script": False,
        "note": "Music cue under the entire cut. The script only says 'music plays'.",
    },
]


# --------------------------------------------------------------------------
# Fonts
# --------------------------------------------------------------------------


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Best available font, degrading to PIL's bitmap font in a bare container."""
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:  # noqa: BLE001
            continue
    return ImageFont.load_default(size=size)


def _centered(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((WIDTH - (box[2] - box[0])) / 2, y), text, font=font, fill=fill)


# --------------------------------------------------------------------------
# Scene painters
# --------------------------------------------------------------------------


def _grain(image: Image.Image, frame: int, strength: int = 6) -> Image.Image:
    """A little noise so it reads as footage rather than a slide."""
    rng = np.random.default_rng(frame)
    noise = rng.integers(-strength, strength + 1, (HEIGHT, WIDTH, 1), dtype=np.int16)
    array = np.asarray(image, dtype=np.int16) + noise
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))


# Precomputed radial falloff. Drawing nested rectangles with an alpha colour
# does nothing on an RGB image — PIL silently drops the alpha and you get a
# solid black border — so the darkening is applied as a multiply instead.
def _vignette_mask() -> np.ndarray:
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    cx, cy = WIDTH / 2, HEIGHT / 2
    distance = np.sqrt(((xs - cx) / cx) ** 2 + ((ys - cy) / cy) ** 2)
    mask = 1.0 - 0.42 * np.clip((distance - 0.55) / 0.85, 0.0, 1.0) ** 1.6
    return mask[:, :, None]


_VIGNETTE = _vignette_mask()


def _apply_vignette(image: Image.Image) -> Image.Image:
    array = np.asarray(image, dtype=np.float32) * _VIGNETTE
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))


def scene_title(t: float) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (8, 9, 12))
    draw = ImageDraw.Draw(image)
    fade = min(1.0, t / 1.2) * min(1.0, max(0.0, (8.0 - t) / 1.2))
    value = int(230 * fade)
    _centered(draw, 210, "THE LONG WAY DOWN", _font(58, bold=True), (value, value, value))
    _centered(draw, 290, "rough cut v3  ·  picture not locked", _font(22), (value // 2, value // 2, value // 2))
    _centered(draw, 330, "40 sec assembly", _font(18), (value // 3, value // 3, value // 3))
    return image


def scene_poster(t: float) -> Image.Image:
    """Apartment wall. The MIDNIGHT ORCHARD poster is unscripted set decoration."""
    image = Image.new("RGB", (WIDTH, HEIGHT), (34, 30, 38))
    draw = ImageDraw.Draw(image)

    # Wall wash
    for y in range(HEIGHT):
        shade = 34 + int(16 * (y / HEIGHT))
        draw.line([(0, y), (WIDTH, y)], fill=(shade, shade - 4, shade + 4))

    # Slow push-in on the poster
    progress = min(1.0, t / 9.5)
    scale = 1.0 + 0.10 * progress
    pw, ph = int(250 * scale), int(350 * scale)
    px, py = int(WIDTH * 0.56), int(HEIGHT * 0.20)

    draw.rectangle([px + 6, py + 8, px + pw + 6, py + ph + 8], fill=(16, 14, 18))
    draw.rectangle([px, py, px + pw, py + ph], fill=(232, 226, 214), outline=(70, 62, 58), width=3)

    # Poster art: concentric orchard arcs
    cx, cy = px + pw // 2, py + int(ph * 0.42)
    for i in range(7):
        radius = int((22 + i * 15) * scale)
        tone = (150 - i * 12, 40 + i * 14, 90 + i * 8)
        draw.arc([cx - radius, cy - radius, cx + radius, cy + radius], 195, 345, fill=tone, width=4)
    draw.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(226, 178, 66))

    title_font = _font(max(12, int(21 * scale)), bold=True)
    small_font = _font(max(9, int(12 * scale)))
    box = draw.textbbox((0, 0), "MIDNIGHT ORCHARD", font=title_font)
    draw.text(
        (cx - (box[2] - box[0]) / 2, py + int(ph * 0.74)),
        "MIDNIGHT ORCHARD",
        font=title_font,
        fill=(44, 36, 40),
    )
    box = draw.textbbox((0, 0), "R. OKONKWO  ·  1974", font=small_font)
    draw.text(
        (cx - (box[2] - box[0]) / 2, py + int(ph * 0.82)),
        "R. OKONKWO  ·  1974",
        font=small_font,
        fill=(110, 96, 92),
    )

    # Foreground figure, backlit
    draw.ellipse([120, 250, 330, 620], fill=(20, 18, 22))
    draw.ellipse([175, 175, 285, 290], fill=(26, 23, 28))
    return image


def scene_can(t: float) -> Image.Image:
    """Table top. NORTHSTAR COLA is an unscripted prop."""
    image = Image.new("RGB", (WIDTH, HEIGHT), (26, 24, 22))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 300, WIDTH, HEIGHT], fill=(58, 42, 30))
    draw.rectangle([0, 296, WIDTH, 306], fill=(80, 60, 44))

    drift = int(14 * math.sin(t * 0.55))
    cx = WIDTH // 2 + drift
    top, bottom = 150, 400
    left, right = cx - 62, cx + 62

    draw.rounded_rectangle([left, top, right, bottom], radius=12, fill=(198, 202, 210))
    draw.rectangle([left, top + 74, right, top + 168], fill=(24, 58, 122))
    draw.ellipse([left, top - 12, right, top + 18], fill=(224, 228, 234), outline=(150, 156, 166))

    star_y = top + 96
    for i in range(5):
        angle = -math.pi / 2 + i * 2 * math.pi / 5
        draw.line(
            [cx, star_y, cx + 15 * math.cos(angle), star_y + 15 * math.sin(angle)],
            fill=(238, 214, 96),
            width=4,
        )

    brand_font = _font(19, bold=True)
    box = draw.textbbox((0, 0), "NORTHSTAR", font=brand_font)
    draw.text((cx - (box[2] - box[0]) / 2, top + 122), "NORTHSTAR", font=brand_font, fill=(240, 242, 248))
    small = _font(12)
    box = draw.textbbox((0, 0), "COLA", font=small)
    draw.text((cx - (box[2] - box[0]) / 2, top + 146), "COLA", font=small, fill=(196, 206, 226))

    # Condensation
    rng = np.random.default_rng(7)
    for _ in range(26):
        dx = int(rng.integers(left + 8, right - 8))
        dy = int(rng.integers(top + 30, bottom - 20))
        draw.ellipse([dx, dy, dx + 3, dy + 4], fill=(228, 232, 240))
    return image


def scene_photo(t: float) -> Image.Image:
    """Framed photograph — the script says 'a photograph', the cut shows a specific work."""
    image = Image.new("RGB", (WIDTH, HEIGHT), (30, 32, 36))
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        shade = 30 + int(20 * (y / HEIGHT))
        draw.line([(0, y), (WIDTH, y)], fill=(shade, shade + 2, shade + 6))

    fw, fh = 420, 300
    fx, fy = (WIDTH - fw) // 2, 120
    draw.rectangle([fx - 14, fy - 14, fx + fw + 14, fy + fh + 14], fill=(58, 46, 34))
    draw.rectangle([fx, fy, fx + fw, fy + fh], fill=(196, 200, 198))

    # Harbour at dusk, monochrome
    for y in range(fy, fy + int(fh * 0.62)):
        k = (y - fy) / (fh * 0.62)
        tone = int(150 + 70 * k)
        draw.line([(fx, y), (fx + fw, y)], fill=(tone, tone + 3, tone + 8))
    draw.rectangle([fx, fy + int(fh * 0.62), fx + fw, fy + fh], fill=(74, 78, 84))

    for i, (bx, bh) in enumerate([(60, 54), (130, 78), (210, 46), (290, 66), (350, 38)]):
        base = fy + int(fh * 0.62)
        draw.rectangle([fx + bx, base - bh, fx + bx + 30, base], fill=(52, 56, 62))
        if (i + int(t)) % 3 == 0:
            draw.rectangle([fx + bx + 8, base - bh + 10, fx + bx + 16, base - bh + 20], fill=(226, 206, 140))

    glint = int(24 * math.sin(t * 1.4))
    draw.ellipse([fx + 180 + glint, fy + 210, fx + 200 + glint, fy + 220], fill=(228, 226, 214))

    cap = _font(13)
    draw.text((fx + 6, fy + fh + 20), "HARBOR LIGHTS, 1961  ·  est. of M. Vance", font=cap, fill=(150, 152, 158))
    return image


def scene_neon(t: float) -> Image.Image:
    """Exterior. THE VELVET ROOM signage — the club named in the screenplay."""
    image = Image.new("RGB", (WIDTH, HEIGHT), (10, 10, 18))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, WIDTH, 360], fill=(14, 13, 24))
    draw.rectangle([0, 360, WIDTH, HEIGHT], fill=(20, 18, 26))

    flicker = 1.0 if (math.sin(t * 9.0) > -0.75) else 0.55
    warm = (int(228 * flicker), int(70 * flicker), int(120 * flicker))
    dim = (int(120 * flicker), int(36 * flicker), int(66 * flicker))

    sign_font = _font(50, bold=True)
    text = "THE VELVET ROOM"
    box = draw.textbbox((0, 0), text, font=sign_font)
    tx = (WIDTH - (box[2] - box[0])) / 2
    for offset in (4, 3, 2):
        draw.text((tx - offset, 150 - offset), text, font=sign_font, fill=dim)
        draw.text((tx + offset, 150 + offset), text, font=sign_font, fill=dim)
    draw.text((tx, 150), text, font=sign_font, fill=warm)

    draw.line([tx, 226, tx + (box[2] - box[0]), 226], fill=warm, width=3)
    sub = _font(19)
    box2 = draw.textbbox((0, 0), "LIVE  ·  NIGHTLY", font=sub)
    draw.text(((WIDTH - (box2[2] - box2[0])) / 2, 240), "LIVE  ·  NIGHTLY", font=sub, fill=dim)

    # Wet street reflection
    for i in range(40):
        y = 400 + i * 3
        alpha = max(0, 60 - i)
        draw.line([(WIDTH / 2 - 150, y), (WIDTH / 2 + 150, y)], fill=(alpha, alpha // 3, alpha // 2))
    return image


SCENES = [
    (0.0, 8.0, scene_title),
    (8.0, 17.5, scene_poster),
    (17.5, 25.0, scene_can),
    (25.0, 32.0, scene_photo),
    (32.0, 40.0, scene_neon),
]


def render_frame(index: int) -> Image.Image:
    t = index / FPS
    for start, end, painter in SCENES:
        if start <= t < end:
            image = _apply_vignette(painter(t - start))
            # Short dissolve into each new setup.
            if t - start < 0.5 and start > 0:
                black = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
                image = Image.blend(black, image, (t - start) / 0.5)
            return _grain(image, index)
    return _grain(_apply_vignette(scene_neon(8.0)), index)


# --------------------------------------------------------------------------
# Audio — an original instrumental cue
# --------------------------------------------------------------------------


def write_cue(path: Path) -> None:
    """A simple original minor-key figure. Sine partials, no samples, no borrowing."""
    rate = 44100
    total = int(rate * DURATION)
    audio = np.zeros(total, dtype=np.float64)

    # A minor-ish descending progression, four bars looping.
    progression = [220.00, 174.61, 196.00, 164.81]  # A3, F3, G3, E3
    bar = DURATION / 8

    for bar_index in range(8):
        root = progression[bar_index % len(progression)]
        start = int(bar_index * bar * rate)
        end = min(total, int((bar_index + 1) * bar * rate))
        n = end - start
        if n <= 0:
            continue
        t = np.arange(n) / rate

        # Root, fifth, and octave with gentle partials.
        voice = (
            0.34 * np.sin(2 * np.pi * root * t)
            + 0.20 * np.sin(2 * np.pi * root * 1.5 * t)
            + 0.12 * np.sin(2 * np.pi * root * 2.0 * t)
            + 0.05 * np.sin(2 * np.pi * root * 3.0 * t)
        )
        # Slow swell per bar so it breathes.
        envelope = np.minimum(1.0, t / 0.6) * np.minimum(1.0, (bar - t) / 0.9 + 0.15)
        audio[start:end] += voice * np.clip(envelope, 0, 1)

    # Overall fade in/out.
    fade = int(rate * 1.5)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)

    peak = np.max(np.abs(audio)) or 1.0
    samples = np.int16(audio / peak * 0.28 * 32767)

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"".join(struct.pack("<h", int(s)) for s in samples))


# --------------------------------------------------------------------------
# Encode
# --------------------------------------------------------------------------


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Rendering {TOTAL_FRAMES} frames at {WIDTH}x{HEIGHT} ({DURATION:.0f}s)...")

    print("  writing music cue...")
    write_cue(TMP_WAV)

    command = [
        ffmpeg_exe(),
        "-y",
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS),
        "-i", "-",
        "-i", str(TMP_WAV),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest",
        str(OUT_MP4),
    ]

    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for index in range(TOTAL_FRAMES):
            process.stdin.write(render_frame(index).tobytes())
            if index % (FPS * 5) == 0:
                print(f"    {index / FPS:>5.1f}s / {DURATION:.0f}s")
        process.stdin.close()
    except BrokenPipeError:
        pass

    _, stderr = process.communicate()
    if process.returncode != 0:
        print("ffmpeg failed:", stderr.decode("utf-8", "replace")[-2000:], file=sys.stderr)
        return 1

    TMP_WAV.unlink(missing_ok=True)
    size = OUT_MP4.stat().st_size
    print(f"\nWrote {OUT_MP4} ({size / 1_000_000:.1f} MB)")
    print("\nPlanted clearance candidates:")
    for element in PLANTED:
        flag = "in script" if element["in_script"] else "UNSCRIPTED"
        print(f"  [{flag:>10}] {element['start']:>5.1f}-{element['end']:<5.1f} {element['name']} ({element['category']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

