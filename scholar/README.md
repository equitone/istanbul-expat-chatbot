# Scholar Desk

A research desk that runs on your own machine. Separate from the Instructor
Workbench in this repository, and built for the person doing the research
rather than the person marking it.

No build step, no installer, no account. Two ways to start it, both the same
app:

- **Double-click `ScholarDesk.html`.** The whole app in one file, with no
  server and no runtime. Open it in Chrome or Firefox, not Safari — Safari
  refuses to store anything for a file opened this way, and the app says so
  across the top if that happens.
- **Run the served version**: `./start.sh` (or double-click *Start Scholar
  Desk.command* on a Mac), then `http://localhost:8130`. Every browser stores
  data for this, Safari included.

Do not double-click `index.html`. It goes blank. ES modules are refused when
loaded straight from a folder — the browser treats each file as a separate,
opaque origin and blocks the import — so the entry point only works behind a
server. That refusal is the reason `ScholarDesk.html` exists: `bundle.js`
resolves the module graph itself and writes every module, the stylesheet and
the entry point into one file with no external request of any kind.

The two ways keep separate libraries, because the browser files them under
different addresses. Pick one, or move your work across with the export and
import buttons in Settings.

## What it does

**Library** — the sources you hold, and the knowledge the rest of the app is
allowed to use. A PDF, a Word file, a pasted reference, or anything you keep
from a search. Each one has a tick box: ticked, the other tabs read it;
unticked, none of them will, though it stays in the list. So you can keep
forty books and reason over the eight that bear on the chapter you are
writing, without deleting anything. Every tab says how large the set it used
was, so a finding about "the literature" is always a finding about something
you can point at.

**Find** — catalogue records from five indexes, shown as they come:
OpenAlex and Crossref, plus DOAJ for open-access and national journals,
Semantic Scholar because its index is built differently and misses different
things, and OpenLibrary for books, which is where literary scholarship
actually lives and where an article index will tell you a field is empty.
No summaries, because a summary is where invention gets in. Searching for a
person is two steps: the name resolves to candidate author records with
enough detail to tell them apart, and only then are that person's works
fetched by id. A name is not an identifier, and a plain name search returns
everything that merely mentions them. Where OpenAlex has no author record —
it only creates one after disambiguating someone across several works, so
early-career researchers and anyone publishing mainly in books have none — a
looser text search runs underneath, labelled as such, marking which hits
carry the name on the by-line. A search that fails says so on the page, with
what the catalogue actually replied.

**Gaps** — name a field and a few hundred real catalogue records are
fetched, placed on four axes (framework, period, method, region) and
cross-tabulated. Crossings where two well-represented areas never meet are
counted. With a model configured, those counted holes are turned into
research questions; without one you still get the arithmetic. Your own
library is the other option, which answers a different question: where your
reading is thin, rather than where the field is.

Every result carries the query, how many works matched, how many were
examined, and the standing caveat — monographs are indexed far more thinly
than articles, and Turkish-language scholarship thinly in both catalogues.
The only claim it can make is "nothing in these N works does this".

**Evaluate** — three readings of one text, all local:

- *Argument*: where it holds and where it does not, each line tied to a count,
  plus the sentences asserted with certainty and supported by nothing.
- *Level of thinking*: Bloom's revised taxonomy, paragraph by paragraph.
- *Prose*: whether the writing carries the patterns that mark machine prose.

**Write** — arguments, then an outline, then expansion from your own notes, in
that order. A section with no notes cannot be expanded. Sources for the topic
are fetched from the catalogues and ranked by citation count, so it argues
from work the field has had to respond to rather than only from what is on
your shelf; yours come first and are never crowded out.

**Grammar** — the Instructor Workbench's checker pointed at your own
writing, with its text beside its findings. Three buckets, counted and
coloured separately, split on what the fix changes: **grammar** when a word
changes form or one is missing, **punctuation** when a mark or a space is
wrong and no word needs to change, **typos** when the word itself is wrong.
Making someone hunting a comma problem read past forty misspellings is how a
checker stops being read.

Only things that are wrong are listed. The style rules — passive voice,
wordiness, sentence length — still exist and the Instructor Workbench shows
them, but they are matters of taste and this tab does not. The passive-voice
share stays as a figure, because a proportion is a count rather than a
verdict. Click anything underlined to find it in the list, or a
finding to jump back to it in the text. Each category can be switched off.
Passive-voice share and mixed British/American spelling are reported too, and
the whole thing saves as a self-contained HTML report that prints to PDF with
the highlighting intact.

Takes a pasted passage or a file: PDF, Word, RTF, text or Markdown, read in
the browser and dropped into the box so you can see what came out of the PDF
before it becomes forty findings about a running header.

Headings, numbered subsections and reference-list entries are left alone by
the rules that assume a sentence. A thesis has a section break every page or
two, and a checker that marks up the table of contents is one nobody
finishes reading.

The punctuation rules come from one book, June Casagrande's *The Best
Punctuation Book, Period*, and every punctuation finding names the chapter
behind it, so a disagreement is settled by opening the book rather than by
arguing with the app. Settings asks which style you write in, because the
four major styles disagree in real places and those are exactly the places a
checker otherwise marks correct writing wrong. The en dash is the clearest
case: it exists only in book style, so under the academic setting a
hyphenated date range is left alone. Sentence spacing splits the same way,
one space in three styles and either in academic writing, which turns that
rule into a consistency check. Anything the book calls the writer's
judgement — commas around "however", commas between short independent
clauses — is not checked at all.

Nothing needs a model, and nothing leaves the computer: the rules run in the
page. LanguageTool is an optional second pass that catches more, and it can
also be run on this computer — Settings has the Docker and Java commands, and
then nothing you check leaves the machine either. If you point it at someone
else's server instead, the Grammar tab says so in those words, naming the
address, above the box you are pasting into.

**Calls** — conferences, journal issues, prizes, grants and fellowships,
with what is left on the clock. The list you keep is the reliable half.
Sources are a rotation of sites to check: where one publishes a feed and
permits it, items are fetched and deadlines pulled out of the text; where it
does not, it keeps an open button and the date you last looked, and says why.
There is no API for literature CFPs, and an empty list that silently means
"could not read" would say "nothing is open".

**References** — APA 7 or MLA 9, formatted from fields by rules, with no
model anywhere near it. Take them from your library, paste a bibliography, or
type them. A missing publisher is reported as missing rather than invented,
and the list copies out with the italics intact.

## JSTOR, Project MUSE, Scopus and the MLA Bibliography

These cannot be searched from here, and the app does not pretend to. They
publish no interface a web page may call: JSTOR and MUSE have no public
search API, and Scopus's needs an Elsevier key tied to a subscribing
institution's network and refuses browser requests by design. The MLA
International Bibliography is licensed through EBSCO or ProQuest.

So the Find tab builds your search into each one's own URL and opens it in a
tab, where your university login already applies. Export what you find as RIS
or BibTeX, drop the file into the Library, and those records join everything
else: counted in the coverage figures, placed on the gap map if they carry an
abstract, and checkable because they keep their DOI. The same panel links
YÖK's thesis centre and DergiPark, which no international index covers
properly.

Writing a fake Scopus search that silently returned nothing would be worse
than this in every way, and invisible.

## Two rules the whole thing is built on

**A model is never asked what exists.** Not what the literature says, not who
wrote what, not what the gaps are. Those questions produce fluent invention,
and an invented citation is the worst possible output because it is
indistinguishable from a real one until someone goes looking. The model is
asked only to interpret material already on the page: these counted holes,
this argument I have already measured, this outline I wrote.

**Everything it says that names a source is checked** against your library
before you see it, and the number of suggestions discarded for citing
something that was not there is reported rather than hidden.

## What needs a model and what does not

Works with nothing installed: the catalogue searches, author lookup, the
coverage map and counted gaps, the argument evaluation, Bloom, the prose
check, the grammar checker, the calls list and all reference formatting.

Needs a model: the write-up on the Gaps tab, the argument finder, and
expanding an outline. Nothing else, and in particular not the Grammar tab,
which imports nothing from the model layer at all.

Settings can ask a local server which models it actually has — the box stays
free text, because every server names its models differently and a fixed
list would be wrong within a month, but a name typed from memory fails
silently at the moment you press a Write button. One click fills it with
something that exists. Point it at a local model (Ollama serves an
OpenAI-compatible endpoint at `http://localhost:11434/v1`) and nothing leaves
the machine at all; point it at the Claude API and your notes and sources are
sent to Anthropic when you press a Write button. Settings says which.

## The prose check

Built from the Wikipedia essay "Signs of AI writing": the flagged vocabulary,
stock phrases, unnamed authority ("studies show"), negative parallelism, em
dash density, stacked transitions, reflexive rule-of-three, and closing
paragraphs that restate.

It is a style judgement and never a claim about who wrote something. The same
patterns appear in perfectly human prose by anyone trained on business
English, and no honest tool can tell the difference. The drafting tab runs it
over the model's own output before you ever read it, because a tool that
emits the patterns it tells you to remove is not worth having.

## Shared code

Thirteen modules are shared verbatim with `../instructor`: `text.js`,
`lexicons.js`, `bloom.js`, `gaps.js`, `argument.js`, `verify.js`,
`grammar.js`, `mechanics.js`, `punctuation.js`, `learner-english.js`,
`languagetool.js`, `segments.js`, and `turkish.js` a level up. They are
pure — no DOM, no store — so a copy works. A copy is also how a counting
helper drifted out of step earlier in this project and silently dropped a
category, so `./sync-shared.sh` diffs them and `package.sh` refuses to build
when they have moved apart.

## The PDF and Word readers

They ship in `vendor/` beside the app, so a PDF opens with no internet and
nothing is fetched. Keep that folder next to `ScholarDesk.html` or
`index.html`; without it the app falls back to a CDN for the parser, which
works online and fails offline.

Opened from a folder rather than served, the parser runs on the main thread,
because browsers will not start a background worker from a `file://` page. A
long PDF is slower that way. The served version has no such limit.

## The offline switch

Top right, in the header. On, and nothing can leave this computer: every way
a page has of sending something — `fetch`, `XMLHttpRequest`, `sendBeacon`,
WebSocket, EventSource — is replaced before a single line of the app loads,
so there is no order in which some part of it gets an unwrapped one. It reads
its setting straight out of storage rather than asking the app, for the same
reason, and it fails shut: if it cannot read the setting, it blocks.

Addresses on this computer are left alone, because a model or a LanguageTool
server running here is not data leaving.

It ships off. Half of what this app does is search catalogues, and shipping
with that dead would read as broken rather than as careful. On, the header
inverts so the state is visible from every tab, and the tabs that need the
internet say they were refused rather than failing like a bad connection.

## Where your data is

In this browser, under whichever address you opened the app at —
`http://localhost:8130` for the served version, the file's own origin for
`ScholarDesk.html`. Clearing site data erases it. Export a backup from
Settings now and then.

If the browser will not store at all, every tab still works and nothing is
kept; the app says this in black across the top rather than leaving it in the
console, because the cost of finding out later is an afternoon's work.
