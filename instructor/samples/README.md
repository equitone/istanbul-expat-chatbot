# Test fixtures

Files to try the workbench on before you use real student work.

| File | What it is for |
|---|---|
| `thesis-v1.txt` | A short chapter with deliberate faults: over-stressed claims, a circular paragraph, agreement errors, a comma splice, a fragment, a topic jump, and a reference that is never cited. Expect an Overloaded stress score. |
| `thesis-v2.txt` | A revision of `v1`. One paragraph rewritten, one deleted, a conclusion added. Use both in **Compare drafts**. |
| `other-student.txt` | A different student's chapter that shares one paragraph verbatim with `thesis-v1.txt`. Save both under **Thesis review**, then run **Originality → Run comparison** to see the shared passage found. |
| `grammar-test.txt` | Sixteen numbered sentences, each with one planted fault. The table below says what each should produce, so you can verify the engine rather than guess. |
| `ai-flavoured.txt` | Written to trip every AI-writing indicator. Compare its score with `thesis-v1.txt`, which is human-written and scores low. This is the fastest way to see how noisy the signal is, and why it is labelled an indicator rather than a verdict. |

None of these are real student work.


## `grammar-test.txt` — expected findings

Paste it into **Thesis review → Analyse**, then filter the legend to
**Spelling & mechanics** and **Grammar & style**. Fifteen of the sixteen
sentences should raise a high- or medium-severity finding; sentence 13 raises
only low-severity style notes, which is correct — wordiness is a suggestion,
not an error.

| # | Planted fault | Rule that should fire |
|---|---|---|
| 1 | `The the` | `doubled-word` |
| 2 | `recieved`, `seperate` | `misspelling` ×2 |
| 3 | `These result` | `plural-determiner` |
| 4 | `participants was`, `findings has` | `subject-verb-agreement` ×2 |
| 5 | `criteria is` | `latin-plural` |
| 6 | `There is many` + comma splice | `existential-agreement`, `comma-splice` |
| 7 | `, however` joining two clauses | `comma-splice` |
| 8 | `However` with no comma | `introductory-comma` |
| 9 | Subordinate clause alone | `fragment` |
| 10 | `This demonstrates` | `vague-referent` |
| 11 | `Its is` | `its-verb` |
| 12 | `more significant then` | `then-compare` |
| 13 | `In order to`, `due to the fact that`, `can't` | wordiness + register — **low severity only** |
| 14 | `amount of participants` | `amount-count` |
| 15 | `A unexpected` | `article-a-an` |
| 16 | `scholarship … were`, `a lot of` | `subject-verb-agreement`, `alot` |

Totals: **33 findings — 16 high, 5 medium, 12 low.** In the legend that reads
as Grammar & style 23, Spelling & mechanics 8, Structure 1, Argument 1. The low
ones are passive voice and wordiness spread across the file, which is expected
and is why the legend lets you switch a category off.

If you get roughly these numbers, the analysis engine is installed correctly.
