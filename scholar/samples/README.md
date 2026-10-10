# Test documents

Three documents for checking the Grammar tab. They are generated, not
written by hand, so the same seed gives the same document every time — a
moving target cannot be checked against.

| file | words | pages | findings | density |
|---|---|---|---|---|
| `test-essay.txt` | 560 | — | 56 | fault on nearly every line |
| `test-essay-5pages.docx` | 1,730 | 5 | 117 | 62 per 1,000 words |
| `test-essay-30pages.docx` | 13,506 | 30 | 366 | 26 per 1,000 words |

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

Rebuild them with:

    python3 build-essays.py

The faults are listed in `build-essays.py` beside the rule each one should
trigger, so a miss can be traced without reading the analysis code.

## Known blind spots

Four planted faults are not caught, and they are all one family: agreement
with an ordinary verb rather than an auxiliary — "this chapter examine",
"three novelists writes" — and a resumptive pronoun after a relative clause.
Catching those needs a verb lexicon, and a pattern without one costs false
positives on correct prose, which this checker trades the other way.
LanguageTool handles them, which is the argument for running both.
