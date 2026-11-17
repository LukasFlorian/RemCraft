"""Build a RemCraft card file (and optionally a RemNote import file) from one spec.

The cards are rendered by ``remnote.py`` (next to this script), so the RemCraft
file and the RemNote file always contain the same cards in the same order. The
RemCraft file (``*.cards.json``, format ``remcraft-cards`` v1, see
``references/format.md``) adds where each card belongs: PDF page numbers plus a
verbatim anchor phrase from the slide.

Usage::

    python build_cards.py spec.json -o out/VL03 [--remnote]

writes ``out/VL03.cards.json`` (and ``out/VL03.remnote.md`` with ``--remnote``).

Spec = the ``remnote.py`` JSON spec, plus per card ``"pages"`` and
``"anchor"``, plus top-level ``"source"`` and optional ``"slide_notes"``::

    {"source": {"pdf": "VL03_Scheduling.pdf", "pdf_pages": 41},
     "sections": [{"title": "3 - Scheduling", "cards": [
         {"type": "basic", "front": "...", "back": "...", "pages": [12], "anchor": "Round Robin mit Zeitscheibe"}]}],
     "slide_notes": [{"pages": [12], "anchor": "Round Robin mit Zeitscheibe", "title": "...", "text": "Markdown"}]}
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List, Optional, Sequence

LOCATION_KEYS = ("pages", "anchor")  # not passed to remnote.py
MAX_ANCHOR_WORDS = 15


def load_remnote() -> ModuleType:
    """Import ``remnote.py`` from this script's folder."""
    path = Path(__file__).resolve().parent / "remnote.py"
    spec = importlib.util.spec_from_file_location("remnote", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["remnote"] = module
    spec.loader.exec_module(module)
    return module


def _one_line(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text)).strip()


def card_fields(kind: str, args: Dict[str, Any], card: Any) -> Dict[str, Any]:
    """Readable front/back (+ options/items) of a card.

    Args:
        kind: Spec type (method name of ``remnote.Section``).
        args: The card's keyword arguments.
        card: The rendered ``remnote.Card``.

    Returns:
        ``type``, ``front``, ``back`` and optionally ``options`` / ``items``.
    """
    label = f"({args['label']}) " if args.get("label") else ""
    if kind == "mc":
        n = getattr(card, "n_correct", len(args.get("correct", [])))
        options = [{"text": o, "correct": i < n} for i, o in enumerate(card.children)]
        back = "Richtig: " + "; ".join(o["text"] for o in options if o["correct"])
        expl = args.get("explanations") or {}
        if expl:
            back += " · " + " · ".join(f"{k}: {_one_line(v)}" for k, v in expl.items())
        return {"type": "mc", "front": label + _one_line(args["question"]), "back": back, "options": options}
    if kind == "numeric":
        unit = f" (in {args['unit']})" if args.get("unit") else ""
        return {"type": "numeric", "front": label + _one_line(args["question"]) + unit,
                "back": f"{_one_line(args['answer'])} · Rechenweg: {_one_line(args['how'])}"}
    if kind == "basic":
        back = _one_line(args["back"]) + (f" · {_one_line(args['extra'])}" if args.get("extra") else "")
        return {"type": "basic", "front": _one_line(args["front"]), "back": back}
    if kind == "concept":
        items = [f"{_one_line(k)}: {_one_line(v)}" for k, v in (args.get("descriptors") or {}).items()]
        return {"type": "concept", "front": _one_line(args["term"]), "back": _one_line(args["definition"]), "items": items}
    if kind == "cloze":
        gap = re.compile(r"\{\{(.*?)\}\}(\{\(\{(.*?)\}\)\})?")
        text = _one_line(args["text"])
        front = gap.sub(lambda m: f"[… {m.group(3)}]" if m.group(3) else "[…]", text)
        return {"type": "cloze", "front": front, "back": gap.sub(lambda m: m.group(1), text)}
    if kind == "multiline":
        items = [_one_line(i) for i in args["items"]]
        return {"type": "list" if args.get("ordered") else "set", "front": _one_line(args["question"]), "back": "; ".join(items), "items": items}
    raise ValueError(f"unknown card type {kind!r}")


def check_location(where: str, item: Dict[str, Any], pdf_pages: Optional[int]) -> List[str]:
    """Problems with ``pages`` / ``anchor`` of one card or note."""
    errors = []
    pages = item.get("pages", [])
    if not isinstance(pages, list) or not all(isinstance(p, int) and p >= 1 for p in pages):
        errors.append(f"{where}: 'pages' must be a list of PDF page numbers (1-based)")
    elif pdf_pages and any(p > pdf_pages for p in pages):
        errors.append(f"{where}: page {max(pages)} > pdf_pages {pdf_pages}")
    anchor = str(item.get("anchor", ""))
    if not pages and not anchor.strip():
        errors.append(f"{where}: needs 'pages' or 'anchor'")
    if len(anchor.split()) > MAX_ANCHOR_WORDS:
        errors.append(f"{where}: anchor longer than {MAX_ANCHOR_WORDS} words")
    return errors


def build(spec: Dict[str, Any], remnote: ModuleType) -> tuple[Any, Dict[str, Any], List[str]]:
    """Render both files.

    Returns:
        ``(remnote_deck, card_document, errors)``.
    """
    source = dict(spec.get("source", {}))
    pdf_pages = source.get("pdf_pages")
    deck = remnote.Deck(seed=spec.get("seed", 42))
    cards: List[Dict[str, Any]] = []
    errors: List[str] = []
    for s in spec["sections"]:
        sec = deck.section(s["title"])
        for c in s["cards"]:
            c = dict(c)
            kind = c.pop("type")
            loc = {k: c.pop(k) for k in LOCATION_KEYS if k in c}
            card = getattr(sec, kind)(**c)
            where = f"card {len(cards) + 1} ({_one_line(c.get('question') or c.get('front') or c.get('term') or c.get('text'))[:50]})"
            errors += check_location(where, loc, pdf_pages)
            # RemNote shows ">>" as "→" and the numeric house format uses it; RemCraft
            # reserves "→" for answered questions in notes, so card files use ">>".
            line = card.line.replace("→", " >> ", 1) if kind == "numeric" else card.line
            block = [line] + [f"{remnote.INDENT}- {ch}" for ch in card.children]
            cards.append({
                "id": f"c{len(cards) + 1:03d}",
                "section": sec.title,
                **card_fields(kind, c, card),
                "pages": loc.get("pages", []),
                "anchor": str(loc.get("anchor", "")),
                "remnote": "\n".join(block),
            })
    notes = []
    for i, n in enumerate(spec.get("slide_notes", [])):
        errors += check_location(f"slide_note {i + 1}", n, pdf_pages)
        if not str(n.get("text", "")).strip():
            errors.append(f"slide_note {i + 1}: empty text")
        notes.append({"pages": n.get("pages", []), "anchor": str(n.get("anchor", "")), "title": str(n.get("title", "")), "text": str(n.get("text", ""))})
    errors += deck.validate()
    doc = {
        "format": "remcraft-cards",
        "version": 1,
        "created": dt.date.today().isoformat(),
        "source": source,
        "remnote_file": "",
        "cards": cards,
        "notes": notes,
    }
    return deck, doc, errors


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI entry point."""
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("spec", help="JSON spec (remnote.py spec + pages/anchor/source/slide_notes)")
    p.add_argument("-o", "--output", required=True, help="output path without extension, e.g. out/VL03")
    p.add_argument("--remnote", action="store_true", help="also write <output>.remnote.md for RemNote")
    a = p.parse_args(argv)
    remnote = load_remnote()
    spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
    deck, doc, errors = build(spec, remnote)
    if errors:
        print("NOT written, fix these first:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    base = Path(a.output)
    base.parent.mkdir(parents=True, exist_ok=True)
    js = base.with_name(base.name + ".cards.json")
    written = [str(js)]
    if a.remnote:
        md = base.with_name(base.name + ".remnote.md")
        deck.write(str(md))
        doc["remnote_file"] = md.name
        written.append(str(md))
    js.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    kinds: Dict[str, int] = {}
    for c in doc["cards"]:
        kinds[c["type"]] = kinds.get(c["type"], 0) + 1
    print(f"wrote {' and '.join(written)}: {len(doc['cards'])} cards {kinds}, {len(doc['notes'])} slide notes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
