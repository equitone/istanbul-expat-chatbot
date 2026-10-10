#!/usr/bin/env python3
"""
build-essays.py — generate the two Word test documents.

A .docx is a zip of XML, so no library is needed and the output is
reproducible: the same seed gives the same document, which matters because
these are used to check a grammar checker and a moving target cannot be
checked against.

Two documents, for two different questions.

  test-essay-5pages.docx    Fault-dense. Every rule the checker has is
                            exercised somewhere, so it answers "does this
                            rule still fire".

  test-essay-30pages.docx   Realistic density, roughly one fault every ten
                            sentences. It answers the other question: does
                            the reader still scroll, do the two panes hold
                            their shape, does the Word reader cope, and is
                            the findings list usable at that length.

Both carry numbered headings and a reference list, because those must come
back clean — a checker that marks up the table of contents is the failure
this corpus exists to catch.

    python3 build-essays.py
"""
import random
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

# --------------------------------------------------------------- the prose

# Correct academic sentences. Deliberately varied in shape: a checker tuned
# on short declaratives will pass a test made only of short declaratives.
CLEAN = [
    "The imagined homeland is not a setting in these novels but a device that organises the narration.",
    "Criticism of the 1990s treated the motif as biographical, and that reading has proved difficult to dislodge.",
    "Tanpınar returns to the same street in three separate works, each time from a different distance.",
    "What the récit withholds is as structured as what it supplies.",
    "Translation history complicates the picture, since several of these works reached their readers in Turkish only decades later.",
    "The narrator's memory is unreliable in a specific way: it is precise about rooms and vague about years.",
    "Reception in the periodical press was warmer than the later academic consensus suggests.",
    "A distinction between exile and emigration is assumed throughout the criticism and rarely argued for.",
    "The novel's chronology folds back on itself at the midpoint, and nothing in the prose marks the fold.",
    "Readers encounter the city twice, once as remembered and once as found, and the two never reconcile.",
    "Pamuk's narrators are characteristically unreliable about their own motives rather than about events.",
    "The manuscript circulated privately for some years before any publisher would take it.",
    "Censorship accounts for some of the silences, though not for their placement.",
    "Scholarship in Turkish has addressed the question at length and is poorly represented in the international indexes.",
    "The second edition restores a chapter that the first omitted without explanation.",
    "Critics who read the work as autobiography have had to discount its most formally ambitious passages.",
    "The correspondence is held in two archives and has never been published in full.",
    "A close reading of the opening paragraph shows the device already in operation.",
    "The figure of the locked room recurs in writers who have no plausible knowledge of one another.",
    "Comparative work on this material is thin, and the reasons for that are institutional rather than intellectual.",
    "The translator's preface makes a claim about fidelity that the translation itself does not support.",
    "Periodisation has followed political history here, and the literary evidence does not obviously agree.",
    "Three of the novels were serialised before they appeared as books, which affected their structure.",
    "The protagonist's silence in the final chapter has been read as resignation and as refusal.",
    "Neither reading accounts for the shift in tense that accompanies it.",
    "The city is described in detail that no exile could plausibly retain.",
    "That implausibility is the point, and the criticism has treated it as a flaw.",
    "Letters from the period show the author revising the ending four times.",
    "The published ending is the third of those, not the last.",
    "Archival work would settle several of these questions and has not been undertaken.",
    "The motif appears in poetry of the same decade, which suggests a shared source rather than influence.",
    "Attributing it to a single precursor requires ignoring the chronology.",
    "A quantitative approach would need a corpus that does not yet exist in machine-readable form.",
    "The journals that carried this criticism are not indexed by any of the major databases.",
    "Her argument turns on a distinction between the remembered and the imagined that she does not define.",
    "The distinction is doing real work even so, and it is worth trying to state.",
    "Each of the three novels opens with an arrival and closes without a departure.",
    "The symmetry is too consistent to be accidental and too unremarked to be deliberate.",
    "Reviewers at the time noticed the repetition and treated it as a weakness.",
    "The later criticism inherited that judgement without re-examining it.",
]

# One planted fault each, with the rule it should trigger. Comments on the
# right are the rule id, so a miss can be traced without reading the code.
FAULTS = [
    ("This chapter examine how three novelists write exile.", "lexical-verb agreement (known blind spot)"),
    ("The scholarship on this topic were reviewed in the previous section.", "subject-verb-agreement"),
    ("There is several reasons to revisit the question now.", "existential-agreement"),
    ("Informations about the reception of these works is limited.", "uncountable-plural, subject-verb-agreement"),
    ("The argument is persuasive, however this is not the whole story.", "comma-splice"),
    ("According to me, the critical consensus settled too early.", "according-to-me"),
    ("Despite of the volume of work on diaspora, the question remains open.", "despite-of"),
    ("Few studies has asked what the imagined homeland does structurally.", "subject-verb-agreement"),
    ("The findings has been reported elsewhere.", "subject-verb-agreement"),
    ("Several study treats the homeland as mere background.", "plural-determiner, quantifier-singular-noun"),
    ("This phenomena is well documented in the criticism of the period.", "latin-plural"),
    ("These result shows that the assumption is rarely examined.", "plural-determiner"),
    ("Which explains the persistence of the reading.", "fragment"),
    ("The data was collected over two decades.", "latin-plural"),
    ("A analysis of two book reveal the pattern.", "article-a-an, number-singular-noun"),
    ("The author discuss about the theme of return at length.", "extra-preposition"),
    ("In the the second chapter, the question returns.", "doubled-word"),
    ("The narrator does not offer no resolution.", "double-negative"),
    ("The present study aims to understanding the device.", "to-plus-gerund"),
    ("Three student was asked to annotate the passages.", "number-singular-noun, subject-verb-agreement"),
    ("The annotations was then compared across readers.", "subject-verb-agreement"),
    ("The novel were published in 1952, it was translated later.", "comma-splice"),
    ("The translator recieved the manuscript in two seperate parts.", "misspelling x2"),
    ("The distinction is more easier to state than to defend.", "double-comparative"),
    ("Due to the fact that the corpus is small, the results are provisional.", "wordiness"),
    ("It is important to note that neither writer says so directly.", "wordiness"),
    ("The researches on this question are inconclusive.", "uncountable-plural"),
    ("Many people was involved in preparing the transcriptions.", "subject-verb-agreement"),
    ("The criteria is not met by any of the cases examined here.", "latin-plural"),
    ("He were present at both of the interviews.", "subject-verb-agreement"),
    ("The responses was coded independently by two readers.", "subject-verb-agreement"),
    ("These children was tested twice, six months apart.", "subject-verb-agreement"),
    ("The author cites four source in that chapter.", "number-singular-noun"),
    ("Several study of the reception exist, but none is recent.", "quantifier-singular-noun"),
    ("The novel is more better in its revised form.", "double-comparative"),
    ("i would argue that the consequence is a different periodisation.", "lowercase-i"),
    ("The evidence is set out above ( as described in section 3 ).", "bracket-spacing"),
    ("The reading is supported by the evidence!!", "repeated-punctuation"),
    ("The period 1960-1985 saw the motif displaced by another.", "year-range-dash"),
    ("The chapter  returns to this question at its close.", "double-space"),
]

HEADINGS = [
    (1, "1. Introduction"),
    (1, "2. Theoretical Framework"),
    (2, "2.1 The Homeland as a Narrative Device Rather Than a Setting"),
    (2, "2.2 Method"),
    (1, "3. Analysis"),
    (2, "3.1 Doubled and Illusory Reality in the Discourse of the Narrator"),
    (2, "3.2 Melancholia as Authentic Resistance and Transcendence"),
    (2, "3.3 The Spider, the Moth and the Problem of the Real"),
    (1, "4. Reception"),
    (2, "4.1 The Periodical Press"),
    (2, "4.2 The Later Academic Consensus"),
    (1, "5. Discussion"),
    (1, "6. Conclusion"),
]

REFERENCES = [
    "Alexandrov, V. (1991). Nabokov's Otherworld. Princeton University Press. https://doi.org/10.1515/9781400861712",
    "Berberova, N., & Nabokov, V. (1967). The Mechanics of Pale Fire. TriQuarterly, 17, 147-159",
    "Connolly, J. W. (1992). Nabokov's Early Fiction: Patterns of Self and Other. Cambridge University Press",
    "Seyhan, A. (2001). Writing Outside the Nation. Princeton University Press",
    "Seyhan, A. (2008). Tales of Crossed Destinies: The Modern Turkish Novel. Modern Language Association",
    "Tanpınar, A. H. (1949). Huzur. Remzi Kitabevi",
    "Venuti, L. (1995). The Translator's Invisibility: A History of Translation. Routledge",
]

TITLE = "Exile and the Imagined Homeland in the Contemporary Turkish Novel"


def paragraph(rng, sentences, fault_every):
    """One paragraph of four to seven sentences, salted at the given rate."""
    out = []
    for _ in range(rng.randint(4, 7)):
        if fault_every and rng.random() < 1.0 / fault_every:
            out.append(rng.choice(FAULTS)[0])
        else:
            out.append(rng.choice(CLEAN))
    return " ".join(out)


def build(target_words, fault_every, seed):
    """Blocks of (level, text); level 0 is body, 1 and 2 are headings."""
    rng = random.Random(seed)
    blocks = [(1, TITLE)]
    words = 0
    h = 0
    # Every fault at least once in the dense version, so no rule goes untested.
    pending = [f[0] for f in FAULTS] if fault_every <= 4 else []

    while words < target_words:
        level, text = HEADINGS[h % len(HEADINGS)]
        h += 1
        blocks.append((level, text))
        for _ in range(rng.randint(2, 4)):
            if pending:
                sentences = [pending.pop(0) for _ in range(min(3, len(pending)))]
                sentences += [rng.choice(CLEAN) for _ in range(2)]
                rng.shuffle(sentences)
                para = " ".join(sentences)
            else:
                para = paragraph(rng, CLEAN, fault_every)
            blocks.append((0, para))
            words += len(para.split())
            if words >= target_words:
                break

    blocks.append((1, "References"))
    for r in REFERENCES:
        blocks.append((0, r))
    return blocks, words


# ---------------------------------------------------------------- the docx

def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

# Enough style definitions that Word renders the headings as headings. The
# text extractor ignores styles entirely, but these files get opened by a
# person too, and a document whose headings look like body text is a poor
# test of whether headings are recognised.
STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
<w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/>
<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="140"/>
<w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>"""


def document_xml(blocks):
    body = []
    for level, text in blocks:
        style = f'<w:pPr><w:pStyle w:val="Heading{level}"/></w:pPr>' if level else ""
        # xml:space="preserve" so a planted double space survives the trip.
        body.append(
            f'<w:p>{style}<w:r><w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>" + "".join(body) +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
        "</w:body></w:document>"
    )


def write_docx(path, blocks):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/document.xml", document_xml(blocks))


if __name__ == "__main__":
    # Target word counts calibrated against a real render rather than a rule
    # of thumb: LibreOffice was asked how many pages each produced and the
    # figure adjusted until it landed on the nose. The short document runs
    # fewer words to the page because it carries proportionally more headings,
    # and a heading costs a line plus the space above and below it.
    for name, target, every, seed in [
        ("test-essay-5pages.docx", 1730, 3, 11),
        ("test-essay-30pages.docx", 13506, 10, 29),
    ]:
        blocks, words = build(target, every, seed)
        out = HERE / name
        write_docx(out, blocks)
        heads = sum(1 for lvl, _ in blocks if lvl)
        print(f"{name:26} {words:6,} words  {len(blocks):4} paragraphs  "
              f"{heads:3} headings  {out.stat().st_size // 1024:4} KB")
