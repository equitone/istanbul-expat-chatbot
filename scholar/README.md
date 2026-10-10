# Scholar Desk

A research desk that runs on your own machine. Separate from the Instructor
Workbench in this repository, and built for the person doing the research
rather than the person marking it.

Open `index.html`, or run `node serve.js 8130` and go to
`http://localhost:8130`. No build step, no installer, no account.

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
everything that merely mentions them.

**Gaps** — your library placed on four axes (framework, period, method,
region) and cross-tabulated. Crossings where two well-represented areas never
meet are counted. With a model configured, those counted holes are turned
into research questions; without one you still get the arithmetic.

**Evaluate** — three readings of one text, all local:

- *Argument*: where it holds and where it does not, each line tied to a count,
  plus the sentences asserted with certainty and supported by nothing.
- *Level of thinking*: Bloom's revised taxonomy, paragraph by paragraph.
- *Prose*: whether the writing carries the patterns that mark machine prose.

**Write** — arguments, then an outline, then expansion from your own notes, in
that order. A section with no notes cannot be expanded.

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
coverage map and counted gaps, the argument evaluation, Bloom, and the prose
check.

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

Six analysis modules are shared verbatim with `../instructor`: `text.js`,
`lexicons.js`, `bloom.js`, `gaps.js`, `argument.js`, `verify.js`. They are
pure — no DOM, no store — so a copy works. A copy is also how a counting
helper drifted out of step earlier in this project and silently dropped a
category, so `./sync-shared.sh` diffs them and `package.sh` refuses to build
when they have moved apart.

## Where your data is

In this browser, for whichever address you open the app on. Clearing site
data erases it. Export a backup from Settings now and then.
