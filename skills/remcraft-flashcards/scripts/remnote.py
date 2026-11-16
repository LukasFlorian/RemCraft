"""Build and validate RemNote-style flashcard outlines (also used for RemCraft card files).

Can be used as a library::

    from remnote import Deck
    deck = Deck()
    sec = deck.section("3 - Scheduling")
    sec.mc("Which algorithms are preemptive?",
           correct=["SRTF", "Round Robin"], wrong=["FCFS", "SJF"])
    sec.numeric("Average waiting time ...?", unit="time units",
                answer="4", how="(0+6+3+7)/4 = 4")
    deck.write("cards.md")

or as a CLI on a JSON spec::

    python remnote.py spec.json -o cards.md
    python remnote.py --check existing.md

JSON spec format: ``{"sections": [{"title": "...", "cards": [{"type": "mc",
...}, ...]}]}`` where each card dict holds the keyword arguments of the
matching ``Section`` method plus ``"type"``.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

INDENT: str = "    "  # 4 spaces per outline level (house format)
LETTERS: str = "ABCDEFGHIJKLMNOP"
# Delimiters RemNote interprets as card triggers. Order matters: longer first.
DELIMITERS: Sequence[str] = (">>>", "<<<", "<><", ">>", "<<", "<>", "><", ">-",
                             "==", "::", ";;", "{{", "}}")
TERMINAL_DISTRACTORS: Sequence[str] = ("none of the above", "all of the above")


@dataclass
class Card:
    """One rendered flashcard: its first line plus optional child lines.

    Attributes:
        line: Text of the card bullet (front, delimiter, and back if any).
        children: Child bullets (MC options, list items, extra details).
        grandchildren: Optional child bullets per child, keyed by child index.
        kind: Card type name, used for statistics.
        delimiter: The delimiter intentionally used on ``line``.
    """

    line: str
    children: List[str] = field(default_factory=list)
    grandchildren: Dict[int, List[str]] = field(default_factory=dict)
    kind: str = "basic"
    delimiter: str = ">>"


def _clean(text: str) -> str:
    """Collapse whitespace so every card stays on exactly one line.

    Args:
        text: Raw text, possibly with newlines or repeated spaces.

    Returns:
        Single-line text with single spaces.
    """
    return re.sub(r"\s+", " ", text).strip()


class Section:
    """A top-level topic bullet that holds cards."""

    def __init__(self, title: str, rng: random.Random) -> None:
        """Create a section.

        Args:
            title: Section title, e.g. ``"3 - Scheduling"``.
            rng: Random generator used to shuffle distractors reproducibly.
        """
        self.title: str = _clean(title)
        self.cards: List[Card] = []
        self._rng: random.Random = rng

    # ------------------------------------------------------------------ MC
    def mc(self, question: str, correct: Sequence[str], wrong: Sequence[str],
           label: Optional[str] = None, explanations: Optional[Dict[str, str]] = None,
           shuffle: bool = True) -> Card:
        """Add a multiple-choice card with correct options first.

        RemNote imports only option A as correct, so all correct options are
        placed first and a ``{CORRECT: A, B}`` tag is appended for manual marking.

        Args:
            question: Question text (one line).
            correct: Correct options (at least one).
            wrong: Wrong options (at least one).
            label: Optional old-exam label such as ``"Klausur 3.4"``.
            explanations: Optional mapping option text -> explanation child bullet.
            shuffle: Shuffle within the correct and within the wrong group.
                "None/All of the above" stay last either way.

        Returns:
            The created card.
        """
        right: List[str] = [_clean(o) for o in correct]
        bad: List[str] = [_clean(o) for o in wrong]
        tail: List[str] = [o for o in bad if o.lower().startswith(TERMINAL_DISTRACTORS)]
        bad = [o for o in bad if o not in tail]
        if shuffle:
            self._rng.shuffle(right)
            self._rng.shuffle(bad)
        opts: List[str] = right + bad + tail
        tag: str = ", ".join(LETTERS[i] for i in range(len(right)))
        prefix: str = f"({label}) " if label else ""
        card = Card(line=f"{prefix}{_clean(question)} {{CORRECT: {tag}}} >>A)",
                    children=opts, kind="mc", delimiter=">>A)")
        card.n_correct = len(right)  # type: ignore[attr-defined]  # used by validator
        if explanations:
            for i, opt in enumerate(opts):
                if opt in explanations:
                    card.grandchildren[i] = [_clean(explanations[opt])]
        self.cards.append(card)
        return card

    # ------------------------------------------------------------- numeric
    def numeric(self, question: str, answer: str, how: str, unit: Optional[str] = None,
                label: Optional[str] = None) -> Card:
        """Add a numeric/calculation card in the house format.

        Args:
            question: Question text.
            answer: Short final answer, e.g. ``"80%"``.
            how: Derivation shown after ``Rechenweg:``.
            unit: Unit hint appended as ``(Numeric answer in <unit>)``.
            label: Optional old-exam label.

        Returns:
            The created card.
        """
        prefix: str = f"({label}) " if label else ""
        hint: str = f" (Numeric answer in {unit})" if unit else " (Numeric answer)"
        line = (f"{prefix}{_clean(question)}{hint}→Korrekte Antwort: "
                f"{_clean(answer)} Rechenweg: {_clean(how)}")
        card = Card(line=line, kind="numeric", delimiter="→")
        self.cards.append(card)
        return card

    # --------------------------------------------------------------- basic
    def basic(self, front: str, back: str, direction: str = ">>",
              extra: Optional[str] = None) -> Card:
        """Add a basic card.

        Args:
            front: Front side.
            back: Back side.
            direction: ``">>"`` forward, ``"<<"`` backward, ``"<>"`` both,
                ``">-"`` disabled.
            extra: Optional Extra Card Detail text shown on the back.

        Returns:
            The created card.
        """
        assert direction in (">>", "<<", "<>", ">-"), direction
        card = Card(line=f"{_clean(front)} {direction} {_clean(back)}",
                    kind="basic", delimiter=direction)
        if extra:
            card.children.append(f"{_clean(extra)} #[[Extra Card Detail]]")
        self.cards.append(card)
        return card

    def concept(self, term: str, definition: str, direction: str = "::",
                descriptors: Optional[Dict[str, str]] = None) -> Card:
        """Add a concept card with optional descriptor children.

        Args:
            term: Concept name (capitalised by convention).
            definition: Definition (back side).
            direction: ``"::"`` two-way, ``":>"`` forward, ``":<"`` backward.
            descriptors: Mapping attribute -> value, rendered as ``attr ;; value``.

        Returns:
            The created card.
        """
        card = Card(line=f"{_clean(term)} {direction} {_clean(definition)}",
                    kind="concept", delimiter=direction)
        for attr, val in (descriptors or {}).items():
            card.children.append(f"{_clean(attr)} ;; {_clean(val)}")
        self.cards.append(card)
        return card

    # --------------------------------------------------------------- cloze
    def cloze(self, text: str) -> Card:
        """Add a cloze card; mark gaps as ``{{gap}}`` and hints as ``{({hint})}``.

        Args:
            text: Sentence containing at least one ``{{…}}`` gap.

        Returns:
            The created card.
        """
        assert "{{" in text, "cloze text needs at least one {{gap}}"
        card = Card(line=_clean(text), kind="cloze", delimiter="{{")
        self.cards.append(card)
        return card

    # ---------------------------------------------------------- multi-line
    def multiline(self, question: str, items: Sequence[str], ordered: bool = False,
                  direction: str = ">>") -> Card:
        """Add a multi-line set card or an ordered list-answer card.

        Args:
            question: Front side.
            items: Answer items (child bullets).
            ordered: ``True`` -> list-answer (``>>1.``, one by one, order matters);
                ``False`` -> set card (``>>>``, all at once).
            direction: ``">>"`` forward, ``"<<"`` backward, ``"<>"`` both.

        Returns:
            The created card.
        """
        if ordered:
            delim = f"{direction}1."
        else:
            delim = {">>": ">>>", "<<": "<<<", "<>": "<><"}[direction]
        card = Card(line=f"{_clean(question)} {delim}", children=[_clean(i) for i in items],
                    kind="list" if ordered else "set", delimiter=delim)
        self.cards.append(card)
        return card


class Deck:
    """A whole RemNote import file made of sections."""

    def __init__(self, seed: int = 42) -> None:
        """Create an empty deck.

        Args:
            seed: Seed for reproducible option shuffling.
        """
        self.sections: List[Section] = []
        self._rng: random.Random = random.Random(seed)

    def section(self, title: str) -> Section:
        """Start a new section and return it.

        Args:
            title: Section title.

        Returns:
            The new section.
        """
        sec = Section(title, self._rng)
        self.sections.append(sec)
        return sec

    def render(self, separators: bool = True) -> str:
        """Render the deck in the house format.

        Args:
            separators: Insert an empty bullet after each card.

        Returns:
            File content.
        """
        out: List[str] = []
        for sec in self.sections:
            out.append(f"- {sec.title}")
            for card in sec.cards:
                out.append(f"{INDENT}- {card.line}")
                for i, child in enumerate(card.children):
                    out.append(f"{INDENT * 2}- {child}")
                    for g in card.grandchildren.get(i, []):
                        out.append(f"{INDENT * 3}- {g}")
                if separators:
                    out.append(f"{INDENT}- ")
        return "\n".join(out) + "\n"

    def validate(self) -> List[str]:
        """Check structural rules before writing.

        Returns:
            Human-readable error messages (empty list = OK).
        """
        errors: List[str] = []
        seen: set = set()
        for sec in self.sections:
            for card in sec.cards:
                key = card.line.split(" {CORRECT")[0]
                if key in seen:
                    errors.append(f"duplicate card: {key[:80]}")
                seen.add(key)
                if card.kind == "mc":
                    n = getattr(card, "n_correct", 0)
                    if n < 1:
                        errors.append(f"MC without correct option: {key[:80]}")
                    if n >= len(card.children):
                        errors.append(f"MC without wrong option: {key[:80]}")
                    if len(set(card.children)) != len(card.children):
                        errors.append(f"MC duplicate option: {key[:80]}")
                errors += [f"{m}: {key[:80]}" for m in stray_delimiters(card)]
        return errors

    def write(self, path: str) -> None:
        """Validate and write the deck; raise on validation errors.

        Args:
            path: Output path (``.md``).

        Raises:
            ValueError: If validation fails.
        """
        errors = self.validate()
        if errors:
            raise ValueError("RemNote deck invalid:\n" + "\n".join(errors))
        Path(path).write_text(self.render(), encoding="utf-8")


def stray_delimiters(card: Card) -> List[str]:
    """Find card-trigger delimiters that appear unintentionally in a card.

    Args:
        card: Card to inspect.

    Returns:
        One message per unexpected delimiter occurrence.
    """
    msgs: List[str] = []
    line = card.line.replace(card.delimiter, "\0", 1)  # drop the intended one
    if card.kind == "cloze":
        line = re.sub(r"\{\{.*?\}\}(\{\(\{.*?\}\)\})?", "", card.line)
    for d in DELIMITERS:
        if d in line:
            msgs.append(f"stray delimiter '{d}' in card text")
            break
    for child in card.children:
        text = child.replace("#[[Extra Card Detail]]", "")
        if card.kind == "concept":
            text = text.replace(";;", "", 1)
        for d in DELIMITERS:
            if d in text:
                msgs.append(f"stray delimiter '{d}' in child '{child[:40]}'")
                break
    return msgs


def check_file(path: str) -> List[str]:
    """Lint an existing RemNote file in the house format.

    Checks MC tag/order consistency (correct options first) and that no card
    text contains a second delimiter.

    Args:
        path: File to check.

    Returns:
        Error messages with line numbers.
    """
    errors: List[str] = []
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    for no, raw in enumerate(lines, 1):
        text = raw.strip()[2:] if raw.strip().startswith("- ") else raw.strip()
        m = re.search(r"\{CORRECT: ([A-Z](?:, [A-Z])*)\}", text)
        if m:
            letters = m.group(1).split(", ")
            if letters != list(LETTERS[: len(letters)]):
                errors.append(f"line {no}: correct options not first ({m.group(1)})")
            if not text.endswith(">>A)"):
                errors.append(f"line {no}: CORRECT tag but no '>>A)' at end")
        body = re.sub(r"\{\{.*?\}\}(\{\(\{.*?\}\)\})?", "", text)
        hits = [d for d in (">>", "<<", "==", "::", ";;") if body.count(d) > 1]
        if hits:
            errors.append(f"line {no}: multiple delimiters {hits}")
    return errors


def build_from_spec(spec: Dict) -> Deck:
    """Build a deck from a JSON-like spec.

    Args:
        spec: ``{"seed": int?, "sections": [{"title": str, "cards": [...]}]}``.

    Returns:
        The populated deck.
    """
    deck = Deck(seed=spec.get("seed", 42))
    for s in spec["sections"]:
        sec = deck.section(s["title"])
        for c in s["cards"]:
            c = dict(c)
            kind = c.pop("type")
            getattr(sec, kind)(**c)  # e.g. sec.mc(question=..., correct=..., wrong=...)
    return deck


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI entry point.

    Args:
        argv: Command-line arguments (defaults to ``sys.argv[1:]``).

    Returns:
        Process exit code.
    """
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("input", help="JSON spec, or a .md file with --check")
    p.add_argument("-o", "--output", default="remnote_cards.md")
    p.add_argument("--check", action="store_true", help="lint an existing .md file")
    a = p.parse_args(argv)
    if a.check:
        errs = check_file(a.input)
        print("\n".join(errs) or "OK")
        return 1 if errs else 0
    deck = build_from_spec(json.loads(Path(a.input).read_text(encoding="utf-8")))
    deck.write(a.output)
    counts: Dict[str, int] = {}
    for sec in deck.sections:
        for card in sec.cards:
            counts[card.kind] = counts.get(card.kind, 0) + 1
    print(f"wrote {a.output}: {sum(counts.values())} cards {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
