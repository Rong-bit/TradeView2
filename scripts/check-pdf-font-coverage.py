#!/usr/bin/env python3
"""檢查各語系說明書字元是否落在對應 PDF 字型子集內。"""
from __future__ import annotations

import re
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "public" / "fonts"
I18N = ROOT / "utils" / "i18n"

LANG_FONT = {
    "en": "NotoSansLatin",
    "de": "NotoSansLatin",
    "fr": "NotoSansLatin",
    "pt": "NotoSansLatin",
    "zh-TW": "NotoSansTC",
    "zh-CN": "NotoSansSC",
    "ja": "NotoSansJP",
    "ko": "NotoSansKR",
    "ar": "NotoSansArabic",
    "hi": "NotoSansDevanagari",
}

LATIN_SAMPLE = "TradeView iOS/Android DRIP FAQ Q&A 0123456789"


def cmap(path: Path) -> set[int]:
    font = TTFont(path)
    codes: set[int] = set()
    for table in font["cmap"].tables:
        codes.update(table.cmap.keys())
    return codes


def extract_doc(text: str) -> str:
    m = re.search(r"documentationContent:\s*`", text)
    if not m:
        return ""
    start = m.end()
    end = text.find("`", start)
    return text[start:end] if end != -1 else ""


def normalize_pdf_punctuation(text: str) -> str:
    """Mirror utils/documentationPdfTextLayout.ts"""
    import re as _re

    text = (
        text.replace("\uFF08", "(")
        .replace("\uFF09", ")")
        .replace("\uFF0C", ",")
        .replace("\uFF1B", ";")
        .replace("\uFF1A", ":")
        .replace("\uFF0F", "/")
        .replace("\uFF0B", "+")
        .replace("\uFF1D", "=")
        .replace("\u300C", '"')
        .replace("\u300D", '"')
        .replace("\u2192", "->")
        .replace("\u2194", "<->")
        .replace("\u2248", "~=")
        .replace("\u2260", "!=")
        .replace("\u3001", ",")
        .replace("\u00D7", "x")
    )
    text = _re.sub(r"[\u2212\u2013\u2014]", "-", text)
    text = (
        text.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201C", '"')
        .replace("\u201D", '"')
        .replace("\u00AB", '"')
        .replace("\u00BB", '"')
        .replace("\u2026", "...")
        .replace("\u2460", "(1)")
        .replace("\u2461", "(2)")
    )
    text = _re.sub(r"\u26A0\uFE0F?", "[!]", text)
    text = _re.sub(r"\U0001F50D", "", text)
    text = text.replace("\uFE0F", "")
    return text


def main() -> None:
    font_cm: dict[str, set[int]] = {}
    for prefix in sorted(set(LANG_FONT.values())):
        path = FONTS / f"{prefix}-Regular.ttf"
        if path.exists():
            font_cm[prefix] = cmap(path)

    print("=== Latin 混排字元在各字型中的支援 ===")
    labels = [
        ("latin", "NotoSansLatin"),
        ("tc", "NotoSansTC"),
        ("jp", "NotoSansJP"),
        ("kr", "NotoSansKR"),
        ("ar", "NotoSansArabic"),
        ("hi", "NotoSansDevanagari"),
    ]
    for label, prefix in labels:
        cm = font_cm[prefix]
        missing = sorted({c for c in LATIN_SAMPLE if ord(c) not in cm})
        print(f"{label:6} {'OK' if not missing else '缺: ' + ''.join(missing)}")

    print("\n=== 各語系說明書缺字（標點正規化後；ar/hi 拉丁混排另用 fallback） ===")
    for path in sorted(I18N.glob("*.ts")):
        if path.name in ("types.ts", "index.ts"):
            continue
        lang = path.stem
        prefix = LANG_FONT.get(lang)
        if not prefix:
            continue
        doc = normalize_pdf_punctuation(extract_doc(path.read_text(encoding="utf-8")))
        if not doc:
            continue
        cm = font_cm[prefix]
        if lang in ("ar", "hi"):
            cm = cm | font_cm["NotoSansLatin"]
        missing = sorted(
            {c for c in doc if ord(c) >= 32 and ord(c) not in cm},
            key=lambda c: ord(c),
        )
        if not missing:
            print(f"{lang:6} OK")
        else:
            sample = " ".join(
                f"{c}(U+{ord(c):04X})" for c in missing[:15]
            )
            print(f"{lang:6} 缺 {len(missing)} 字: {sample}")


if __name__ == "__main__":
    main()
