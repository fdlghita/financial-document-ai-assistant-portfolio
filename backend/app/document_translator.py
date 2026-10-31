from __future__ import annotations

import os
from typing import List

from langchain_core.messages import HumanMessage, SystemMessage

LANGUAGE_NAMES = {
    "fr": "French",
    "en": "English",
    "ar": "Arabic",
}

SUPPORTED_LANGUAGES = set(LANGUAGE_NAMES)

# fpdf2's built-in core fonts (Helvetica/Times/Courier) use WinAnsi encoding, which
# already covers accented French characters (e, e, a, c...) — no bundled font needed
# for French/English. Arabic script requires a real Unicode font with Arabic glyphs,
# which the standard 14 PDF fonts do not have.
#
# We intentionally do NOT bundle a font file in this repo: most system font files
# (including Windows' own Arial/Tahoma) are licensed for use on the system they ship
# with, not for redistribution as standalone files in a separate project's source
# tree. Instead, we reference an already-installed system font at its OS path, the
# same way any other application on that machine would use it.
_DEFAULT_ARABIC_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
]


def resolve_arabic_font_path() -> str | None:
    """Finds a locally installed Unicode font with Arabic glyph coverage.

    Checks TRANSLATE_ARABIC_FONT_PATH first (explicit override), then a short list
    of common system font locations. Returns None if nothing usable is found —
    callers must surface an honest error rather than silently producing a PDF full
    of missing-glyph boxes.
    """
    override = os.getenv("TRANSLATE_ARABIC_FONT_PATH")
    candidates = ([override] if override else []) + _DEFAULT_ARABIC_FONT_CANDIDATES
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def chunk_text_for_translation(text: str, chunk_size: int = 1200) -> List[str]:
    """Splits text into paragraph-aligned chunks small enough for reasonable local
    LLM latency per call, without cutting mid-sentence where avoidable.
    """
    text = (text or "").strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: List[str] = []
    buffer = ""
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}" if buffer else para
        if len(candidate) > chunk_size and buffer:
            chunks.append(buffer)
            buffer = para
        else:
            buffer = candidate
    if buffer:
        chunks.append(buffer)

    # Hard-wrap the rare paragraph that's still too large on its own.
    final_chunks: List[str] = []
    for chunk in chunks:
        if len(chunk) <= chunk_size * 1.5:
            final_chunks.append(chunk)
        else:
            for i in range(0, len(chunk), chunk_size):
                final_chunks.append(chunk[i : i + chunk_size])
    return final_chunks


def translate_chunk(llm, chunk: str, source_lang: str, target_lang: str) -> str:
    source_name = LANGUAGE_NAMES.get(source_lang, source_lang)
    target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    system_prompt = (
        f"You are a professional financial-document translator. Translate the given "
        f"{source_name} text to {target_name}. Preserve numbers, dates, company names, "
        "and paragraph breaks exactly as they appear. Do not add commentary, notes, "
        "disclaimers, or explanations of any kind — output only the translated text."
    )
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=chunk)])
    return getattr(response, "content", str(response)).strip()


def build_translated_pdf(paragraphs: List[str], target_lang: str, output_path: str, title: str) -> None:
    """Assembles translated paragraphs into a clean, readable PDF.

    This does not attempt to reproduce the original document's layout (tables,
    columns, images) — it produces a plain, well-formatted document containing the
    translated text, which is what was explicitly requested over a much harder and
    less reliable layout-preserving approach.
    """
    from fpdf import FPDF

    is_rtl = target_lang == "ar"
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    if is_rtl:
        font_path = resolve_arabic_font_path()
        if not font_path:
            raise RuntimeError(
                "Aucune police avec des caracteres arabes n'a ete trouvee sur ce systeme. "
                "Definissez la variable d'environnement TRANSLATE_ARABIC_FONT_PATH vers "
                "un fichier .ttf compatible (ex: Tahoma, Noto Naskh Arabic)."
            )
        pdf.add_font("DocFont", "", font_path)
        pdf.set_font("DocFont", size=11)
    else:
        # Core font: no file needed, WinAnsi covers accented French/English text.
        pdf.set_font("Helvetica", size=11)

    def render_text(text: str, size: float) -> None:
        # No bold variant: not every candidate system font ships a matching bold
        # file, so hierarchy is conveyed by size alone (robust across whichever
        # font was actually found).
        rendered = text
        if is_rtl:
            import arabic_reshaper
            from bidi.algorithm import get_display

            rendered = get_display(arabic_reshaper.reshape(text))
        pdf.set_font("DocFont" if is_rtl else "Helvetica", "", size)
        pdf.multi_cell(0, size * 0.6, rendered, align="R" if is_rtl else "L")

    render_text(title, 16)
    pdf.ln(4)

    for para in paragraphs:
        render_text(para, 11)
        pdf.ln(3)

    pdf.output(output_path)
