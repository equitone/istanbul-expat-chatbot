#!/usr/bin/env python3
"""
build-abstract.py — the one-page conference abstract, as a PDF.

WHY A PDF AND NOT ANOTHER .docx.

Because the PDF path is the one that breaks. A .docx is a zip of XML and the
text comes out as it went in. A PDF has no paragraphs: it has glyphs placed
at coordinates, and the reader has to infer where lines end, where a word was
hyphenated across a line break, and which runs of text are a running header
repeated on every page. That inference is where a grammar checker starts
reporting faults the writer never typed, so a short document whose text is
known exactly is the way to see whether the reader is doing its job.

A real PDF, too, written by a word processor rather than assembled by hand,
because a handmade one would exercise a simpler file than the ones that
actually arrive.

WHAT IS IN IT.

A conference abstract of the length one is actually submitted at, with faults
planted across all three buckets and each one named below beside the rule it
should trigger. The title, the author line, the affiliation, the keywords and
the single reference must all come back CLEAN: they are not sentences, and a
checker that marks them up is the failure this file exists to catch.

    python3 build-abstract.py

Needs LibreOffice on the path, which is what turns the HTML into a PDF.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- the text
#
# Every line that carries a planted fault names the rule it is there to
# trigger. Lines with no comment are there to be left alone.

TITLE = "Rooms That Refuse: Domestic Space and the Limits of Interiority"
AUTHOR = "Deniz Aytemiz"
AFFIL = "Department of English Language and Literature, Ege University"

BODY = [
    # misspelling (seperate), lowercase-i, article-a-an (a interior)
    "i argue that the interwar short story treats the room as a seperate "
    "character rather than as a interior setting, and that this move is what "
    "distinguishes it from the domestic novel it grew out of.",

    # quote-comma-outside, decade-apostrophe, doubled-word (the the)
    "Woolf calls the problem “a room of one’s own”, and by the "
    "1990's the phrase had been read so often as a claim about property that "
    "the the spatial argument underneath it went missing.",

    # discuss-about (extra-preposition), uncountable-plural (literatures)
    "This paper discusses about three such rooms, drawn from two national "
    "literatures, and asks what each one refuses to hold.",

    # subject-verb-agreement, comma-splice
    "The readings shows a pattern, the room becomes legible only once its "
    "occupant stops narrating it.",

    # its-verb (its is), hyphen-as-dash
    "Mansfield’s “The Daughters of the Late Colonel” - which "
    "was serialised before it was collected - is the clearest case, because "
    "its is the furniture and not the sisters that carries the plot.",

    # missing-space-after-punctuation, space-before-punctuation
    "Three terms organise the argument: interiority,domesticity and refusal . "
    "None of them is used here in its familiar sense.",

    # misspelling (occured), despite-of
    "The shift occured across a single decade, despite of the critical "
    "consensus that places it much later.",

    # quote-period-outside, ellipsis-as-two-dots
    "Sait Faik gives the same room to a narrator who will not enter it, and "
    "the story ends on what one critic has called “the unlived "
    "life”. The sequence is silence.. then speech, then silence again.",

    # comma-before-closing-paren, misspelling (arguement)
    "The third section sets the arguement out in full (the readings are "
    "summarised in the appendix,) and considers two objections to it.",

    # different-than, uncountable-plural after a numeral (three novel)
    "My conclusion is different than the one the field has settled on: three "
    "novel of the period already contain the move, and the short story "
    "inherited it rather than inventing it",   # missing-terminal-punctuation

    # clean: this one must produce nothing at all
    "The paper draws on close reading throughout, and on the archival record "
    "only where a serialisation date bears on the argument.",
]

KEYWORDS = "Keywords: interiority, domestic space, Woolf, Mansfield, Sait Faik, short story"
REFERENCE = ("Woolf, Virginia. A Room of One’s Own. London: Hogarth Press, 1929.")

# ---------------------------------------------------------------- the file

CSS = """
@page { size: A4; margin: 2.4cm 2.6cm; }
body { font-family: 'Liberation Serif', Georgia, serif; font-size: 11.5pt; line-height: 1.5; }
h1 { font-size: 15pt; margin: 0 0 6pt; line-height: 1.3; }
.author { font-size: 11pt; margin: 0; }
.affil { font-size: 10pt; font-style: italic; margin: 0 0 18pt; }
p.body { margin: 0 0 9pt; text-align: justify; }
.kw { font-size: 10.5pt; margin-top: 16pt; }
.ref { font-size: 10pt; margin-top: 14pt; text-indent: -1.2em; padding-left: 1.2em; }
"""


def html() -> str:
    paras = "\n".join(f'    <p class="body">{p}</p>' for p in BODY)
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Abstract</title>
<style>{CSS}</style></head>
<body>
    <h1>{TITLE}</h1>
    <p class="author">{AUTHOR}</p>
    <p class="affil">{AFFIL}</p>
{paras}
    <p class="kw">{KEYWORDS}</p>
    <p class="ref">{REFERENCE}</p>
</body></html>
"""


def main() -> int:
    src = HERE / "test-abstract.html"
    src.write_text(html(), encoding="utf-8")
    try:
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(HERE), str(src)],
            check=True, capture_output=True, timeout=180,
        )
    except FileNotFoundError:
        print("LibreOffice (soffice) is not on the path; cannot make the PDF.", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as e:
        print(e.stderr.decode(errors="replace"), file=sys.stderr)
        return 1
    src.unlink()
    out = HERE / "test-abstract.pdf"
    words = sum(len(p.split()) for p in BODY)
    print(f"Built {out.name} ({out.stat().st_size // 1024} KB), {words} words of body text.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
