"""Rebuild the self-hosted fonts in src/app/fonts/.

Google Fonts serves each family as one variable woff2 per subset and lets
unicode-range pick the files. next/font/local cannot declare unicode-range per
file, so this script builds one variable woff2 per family that covers the
latin, latin-ext, cyrillic and cyrillic-ext subsets. The sources are the same
TTFs Google Fonts serves (github.com/google/fonts), shaped the same way: Inter's
opsz axis pinned to 14, JetBrains Mono's wght axis limited to 400-800, the
default layout features plus pnum and tnum. The unicode ranges are read live
from the Google Fonts css2 API.

    uv run --no-project --with fonttools==4.66.1 --with brotli==1.2.0 \
        python scripts/build-fonts.py
"""

import io
import re
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GOOGLE_FONTS_COMMIT = "66928797f271fed5ee428544e7229685e2d90127"
OUT = Path(__file__).resolve().parent.parent / "src" / "app" / "fonts"
SUBSETS = {"latin", "latin-ext", "cyrillic", "cyrillic-ext"}
# Combining marks Google ships in its latin files (pulled in by composite
# glyphs) although they sit outside the latin unicode-range.
EXTRA_CODEPOINTS = {0x0300, 0x0301, 0x0303, 0x0309, 0x0323}
# A current Chrome user agent, so the css2 API answers with woff2 subsets.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
FAMILIES = [
    # (css2 family, google/fonts path, output stem, axis limits)
    ("Inter", "ofl/inter/Inter[opsz,wght].ttf", "Inter", {"opsz": 14}),
    (
        "Plus Jakarta Sans",
        "ofl/plusjakartasans/PlusJakartaSans[wght].ttf",
        "PlusJakartaSans",
        {},
    ),
    (
        "JetBrains Mono",
        "ofl/jetbrainsmono/JetBrainsMono[wght].ttf",
        "JetBrainsMono",
        {"wght": (400, 800)},
    ),
]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        return response.read()


def raw(path):
    url = path.replace("[", "%5B").replace("]", "%5D")
    return fetch(
        f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_COMMIT}/{url}"
    )


def codepoints(family):
    css = fetch(
        "https://fonts.googleapis.com/css2?family="
        + family.replace(" ", "+")
        + ":wght@400"
    ).decode()
    found = set()
    for name, ranges in re.findall(
        r"/\* ([a-z-]+) \*/\s*@font-face \{.*?unicode-range: ([^;]+);", css, re.S
    ):
        if name not in SUBSETS:
            continue
        for part in ranges.split(","):
            low, _, high = part.strip()[2:].partition("-")
            found.update(range(int(low, 16), int(high or low, 16) + 1))
    return found | EXTRA_CODEPOINTS


for family, path, stem, limits in FAMILIES:
    font = TTFont(io.BytesIO(raw(path)), recalcTimestamp=False)
    if limits:
        # Round-trip through bytes: the subsetter trips over the instancer's
        # lazily loaded gvar otherwise.
        buffer = io.BytesIO()
        instancer.instantiateVariableFont(font, limits).save(buffer)
        font = TTFont(io.BytesIO(buffer.getvalue()), recalcTimestamp=False)
    options = subset.Options()
    # Google keeps the numeral-spacing features too; `tabular-nums` needs tnum.
    options.layout_features += ["pnum", "tnum"]
    font.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints(family))
    subsetter.subset(font)
    font.save(OUT / f"{stem}-Variable.woff2")
    license_path = path.rsplit("/", 1)[0] + "/OFL.txt"
    (OUT / f"{stem}-OFL.txt").write_bytes(raw(license_path))
    print(f"{stem}-Variable.woff2: {len(font.getBestCmap())} codepoints")
