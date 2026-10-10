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

**Library** — the sources you hold. A PDF, a Word file, a pasted reference, or
anything you keep from a search. Every other tab reasons over this set and
says how large it was, so a finding about "the literature" is always a finding
about something you can point at.

**Find** — catalogue records from OpenAlex and Crossref, shown as they come.
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
writing. Mistakes, typos and style are counted separately, because a style
suggestion is not an error and burying six real faults under forty
suggestions is how a checker stops being read. Passive-voice share and mixed
British/American spelling are reported too. Nothing needs a model;
LanguageTool is an optional second pass, merged in with duplicates dropped.

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
expanding an outline. Point it at a local model (Ollama serves an
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

Ten analysis modules are shared verbatim with `../instructor`: `text.js`,
`lexicons.js`, `bloom.js`, `gaps.js`, `argument.js`, `verify.js`,
`grammar.js`, `mechanics.js`, `learner-english.js`, `languagetool.js`. They are
pure — no DOM, no store — so a copy works. A copy is also how a counting
helper drifted out of step earlier in this project and silently dropped a
category, so `./sync-shared.sh` diffs them and `package.sh` refuses to build
when they have moved apart.

## Where your data is

In this browser, under whichever address you opened the app at —
`http://localhost:8130` for the served version, the file's own origin for
`ScholarDesk.html`. Clearing site data erases it. Export a backup from
Settings now and then.

If the browser will not store at all, every tab still works and nothing is
kept; the app says this in black across the top rather than leaving it in the
console, because the cost of finding out later is an afternoon's work.
