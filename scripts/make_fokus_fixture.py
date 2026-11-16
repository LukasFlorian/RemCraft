"""Builds the Fokus test fixture `src/data/testing/fixtures/fokus-data.json`.

Runs the real Fokus app (`quasi_counter_and_regression`) - the same calls as its HTTP API -
to create a data directory with a course, a handout deck (2 slides per page),
notes, ink, text boxes, highlights, markers, imported cards (one disabled),
course files and lectures (pause, drift, check-in, time away, summary, and one
lecture that was never stopped). The directory is stored as
`{relative path: base64}` so the TypeScript importer can be tested against
genuine Fokus output.

Usage: python scripts/make_fokus_fixture.py <path to quasi_counter_and_regression>
"""

import base64
import json
import sys
import tempfile
import time
from pathlib import Path

fokus_root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(fokus_root))
sys.path.insert(0, str(fokus_root / "tests"))

from fokus.app import FokusApp  # noqa: E402
from fokus.config import Config  # noqa: E402
from fokus.tools.make_demo import make_pdf  # noqa: E402
from test_layout_notes import make_handout  # noqa: E402


def put_note(app: FokusApp, did: str, slide: int, **body: object) -> None:
    """Same as ``PUT /api/decks/{id}/notes/{slide}`` (incl. its lecture events)."""
    old = app.decks.notes(did).get(str(slide), {})
    note = app.decks.set_note(did, slide, body.get("text"), body.get("strokes"), body.get("flags"), body.get("boxes"), body.get("marks"))
    if any(body.get(k) is not None for k in ("text", "strokes", "boxes", "marks")):
        app.sessions.log_event("note", {"deck_id": did, "slide": slide, "chars": len(note["text"]), "strokes": len(note["strokes"]), "boxes": len(note["boxes"]), "marks": len(note["marks"])})
    for kind in set(old.get("flags", [])) ^ set(note["flags"]):
        app.sessions.log_event("flag", {"deck_id": did, "slide": slide, "kind": kind, "on": kind in note["flags"]})


with tempfile.TemporaryDirectory() as tmp:
    data = Path(tmp) / "data"
    app = FokusApp(Config(data_dir=str(data)))
    course = app.courses.create("Machine Learning")
    pdf = make_handout(make_pdf(Path(tmp) / "s.pdf"), 6, False)
    app.courses.add_file(course["id"], "handout.pdf", pdf)
    app.courses.add_file(course["id"], "blatt1.txt", b"Uebungsblatt 1")
    # Same as "open" on a course PDF: the PDF becomes a deck of the course.
    deck = app.decks.import_pdf(pdf, "handout.pdf")
    did = app.decks.set_course(deck["id"], course["id"])["id"]

    # Lecture 1: notes, ink, markers, drift, check-in, pause, away, summary.
    s1 = app.start_session("VL 1", did, "Regression verstehen", course["id"])
    app.sessions.set_slide(1)
    put_note(app, did, 1,
             text="Prof: wichtig für Klausur\n? Warum quadratischer Fehler\nLoss >> mittlerer quadratischer Fehler\n  - Unterpunkt eingerückt",
             strokes=[{"c": "#ff3b30", "w": 0.004, "a": 1, "p": [[0.1, 0.1], [0.2, 0.2]]},
                      {"c": "#ffd60a", "w": 0.02, "a": 0.35, "p": [[0.3, 0.3], [0.5, 0.3]]}],
             flags=["important"],
             boxes=[{"id": "b1", "x": 0.6, "y": 0.1, "w": 0.3, "text": "Merken!", "c": "#111111", "s": 0.022}],
             marks=[{"id": "m1", "c": "#ffd60a", "text": "Regression", "rects": [[0.1, 0.1, 0.3, 0.05]]}])
    app.drift()
    session = app.sessions.active
    session.record({"type": "checkin_prompt", "id": "ck1", "prompt": "Was war der Kernpunkt?"})
    app.answer_checkin("ck1", "MSE minimieren", 4, False)
    now = time.time()
    session.record({"type": "away", "t": now, "start": round(now - 30, 3), "end": round(now, 3), "slide": 1})
    app.pause_session(True)
    app.pause_session(False)
    put_note(app, did, 2, flags=["unclear"])
    app.sessions.set_slide(2)
    app.set_session_text(s1.id, "summary", "1. MSE\n2. Gradient\n3. Lernrate")
    app.stop_session()

    # Cards: imported, one practised, one disabled.
    doc = {"format": "fokus-cards", "version": 1, "source": {"pdf": "handout.pdf", "pdf_pages": 3}, "cards": [
        {"type": "basic", "front": "Was minimiert lineare Regression?", "back": "MSE", "pages": [1], "anchor": "Lineare Regression"},
        {"type": "basic", "front": "Deaktivierte Karte", "back": "weg", "pages": [2], "anchor": "Gradient Descent"},
    ], "notes": [{"pages": [2], "anchor": "Gradient Descent", "title": "GD", "text": "**bergab**"}]}
    app.import_cards(did, json.dumps(doc).encode(), "VL01.fokus.json")
    keys = {card["front"]: card["key"] for card in app.cards.data(did)["cards"]}
    app.cards.record(did, keys["Was minimiert lineare Regression?"], True)
    app.cards.set_disabled(did, keys["Deaktivierte Karte"], True)

    # Lecture 2 without course and deck, never stopped (Fokus quit while running).
    app.start_session("Spontane Vorlesung", None)

    # Drop render caches, keep everything else.
    files = {str(p.relative_to(Path(tmp))): base64.b64encode(p.read_bytes()).decode()
             for p in sorted(data.rglob("*")) if p.is_file() and "/cache/" not in str(p)}

out = Path(__file__).resolve().parent.parent / "src/data/testing/fixtures/fokus-data.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(files, indent=0, sort_keys=True))
print(f"{len(files)} files -> {out}")
for k in files:
    print(" ", k)
