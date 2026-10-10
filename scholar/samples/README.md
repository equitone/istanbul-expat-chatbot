# Test documents

Four documents for checking the Grammar tab. They are generated, not
written by hand, so the same seed gives the same document every time — a
moving target cannot be checked against.

| file | words | pages | findings | density |
|---|---|---|---|---|
| `test-essay.txt` | 560 | — | 56 | fault on nearly every line |
| `test-essay-5pages.docx` | 1,730 | 5 | 117 | 62 per 1,000 words |
| `test-essay-30pages.docx` | 13,506 | 30 | 366 | 26 per 1,000 words |
| `test-abstract.pdf` | 285 | 1 | 25 | a conference abstract, fault on most sentences |

The page counts were calibrated against a real render rather than a rule of
thumb: LibreOffice was asked how many pages each produced and the target word
count adjusted until it landed on the nose.

**The short one answers "does this rule still fire".** Every rule the checker
has is exercised somewhere in it, at a density no real chapter would reach.

**The long one answers a different question**: does the Word reader cope,
does the reader pane still scroll, do the two panes hold their shape, and is
a list of 366 findings still usable. Its fault density is what a real draft
looks like.

Both carry numbered headings at two levels and a reference list, because
those must come back **clean**. A finding on a section heading or a
bibliography entry means a regression — that is the main thing this corpus
is here to catch.

**The abstract answers the PDF question.** A .docx is a zip of XML and the
text comes out as it went in; a PDF has no paragraphs at all, only glyphs
placed at coordinates, and the reader has to work out where lines end and
which blocks are front matter. That inference is where a checker starts
reporting faults nobody typed. It is a real PDF, written by a word processor
rather than assembled by hand, so it exercises the file shape that actually
arrives.

One thing it shows that the Word files cannot: the affiliation line and the
first sentence of the body come back as a single block, because nothing in
the PDF marks where one ended. Front matter in a PDF is not reliably
separable, so it is not reliably protected either. Nothing is falsely
flagged on it here, but that is the place to look if something ever is.

Rebuild them with:

    python3 build-essays.py        # the two Word files
    python3 build-abstract.py      # the PDF, via LibreOffice

The faults are listed in `build-essays.py` and `build-abstract.py` beside
the rule each one should trigger, so a miss can be traced without reading
the analysis code.

## Known blind spots

Four planted faults in the essays are not caught, and they are all one
family: agreement with an ordinary verb rather than an auxiliary — "this
chapter examine", "three novelists writes" — and a resumptive pronoun after
a relative clause. Catching those needs a verb lexicon, and a pattern
without one costs false positives on correct prose, which this checker
trades the other way. LanguageTool handles them, which is the argument for
running both.

The abstract misses two of its planted faults, from the same family and one
beside it: "The readings shows a pattern" (plural subject, ordinary verb)
and the comma splice in that same sentence, which the splice rule will not
claim because it cannot tell that what follows the comma is an independent
clause without knowing "becomes" is a verb. Both are the verb lexicon
again. Everything else planted in it comes back, 25 findings across 21
rules, and the title, author, affiliation, keywords and reference come back
clean.
