# Instructor Workbench — setup and use

A grading and thesis-review tool that runs on your own computer. It has no
account, no subscription, and no server: the whole thing is a folder of files
that your browser runs locally.

---

## Part 1 — Install (once, about five minutes)

### Step 1. Get the folder

Download the project as a ZIP and unzip it somewhere you will not accidentally
delete — `Documents\Workbench` is a good choice, the Desktop is not.

You want the folder that contains `start.bat`, `index.html` and a `js` folder.

### Step 2. Start it

**Windows:** double-click **`start.bat`**.
**macOS:** double-click **`Start Workbench.command`**.
**Linux:** run `./start.sh`.

A black window opens and your browser opens the app. That black window is the
program — **leave it open while you work.** Closing it stops the app.

If Windows shows a blue "Windows protected your PC" box, click **More info →
Run anyway**. That warning appears for any script that did not come from an
app store; the file is a plain text file you can open in Notepad and read.

If Windows Firewall asks for permission, **Cancel** is the correct answer. The
app does not need to accept connections from other computers.

**On a Mac**, the first launch may say the file is "from an unidentified
developer". Right-click **Start Workbench.command → Open → Open**. That is
needed once only. If double-clicking does nothing at all, open Terminal in the
folder and run `chmod +x "Start Workbench.command" start.sh`, then try again.

The Mac version does not need anything installed in the usual case: it uses
Python if present, then Node, then Ruby, then PHP — and macOS ships Ruby. If
it cannot find any of them it says so and points at the Node installer.

### Step 3. Check it works

You should see the app with empty tabs across the top: Overview, Students,
Courses, Gradebook, Analytics, Thesis review, Batch triage, Compare drafts,
Settings.

Go to **Settings** and fill in your name and the current term.

**From now on, to open the app: double-click `start.bat`.** Do not open
`index.html` directly — it will not work, and the reason is technical and
uninteresting.

---

## Part 2 — Set up your teaching

### Students

**Students** tab → fill the form → **Add student**. Choose the level:
Undergraduate, Master's, or PhD. One list covers all three.

### Courses

**Courses** tab → **New course**. Give it a title, a code, and a level.

It arrives with four components — Participation, Midterm, Term paper, Final
exam — worth 10/25/30/35. Rename them, change the weights, delete what you do
not use, add what you do. The app warns you if the weights do not total 100.

Then scroll to **Enrolment** and tick the students in that course.

### Marks

**Gradebook** tab → pick the course → type marks into the grid.

Press **Enter** or **↓** to move down a column, so you can enter a whole
column without touching the mouse.

Leave a cell **empty** for anything not marked yet. Empty is not zero:

- **Running** = the student's score on the work marked so far. This is the
  useful number in week six.
- **Final** = the score counting unmarked work as unearned. This is the number
  at the end of term.

### End of term

**Analytics** tab gives the mean, median, spread, pass rate, grade
distribution, and a list of students below the pass mark. It also shows how
well each assessment agreed with the final mark, which tells you whether an
assessment is doing any work.

**Export Excel** (top right) writes everything to one spreadsheet: the roster,
a sheet per course, statistics, and every thesis finding.

---

## The lock

**Settings → Lock to this computer** is on when the app is installed, and
while it is on nothing can leave the machine. Not the marks, not a student's
name, not a line of anyone's thesis.

It is not a warning and not a hidden button. The block sits on the browser's
own network calls, underneath every feature, so it does not matter which
button is pressed, whether an address was mis-typed, or what a future version
of this app adds — anything addressed to somewhere other than this computer is
refused before it is sent.

A model or a grammar checker running on your own machine still works, because
`localhost` *is* your machine. What is refused is any address that is not.

While the lock is on, the Research tab stands down and says so rather than
offering searches that would fail, and the Claude API option is not offered.

Turning it off takes a confirmation that names what becomes possible: catalogue
lookups that send a student's reference list and thesis statement to Crossref
and OpenAlex, and the Claude API, which sends the entire thesis to Anthropic.
Everything else — marking, the gradebook, thesis analysis, batch triage, draft
comparison, every report — never needed the network and is unaffected either
way.

---

## Asking a question about the literature

**Research** tab → **Ask a question**. Type in your own words — *"what is the
debate about modernist form and empire?"* — and press Ask.

It works with nothing installed. Your question is turned into a search, and
what comes back is real records from OpenAlex: how many matched, the years
they span, the most-cited one to start from, which are free to read, and the
subject terms to search with next. Each source is listed underneath with a
link, an abstract, and buttons to save it or copy it as APA or MLA.

It does not write prose without a model, and it says so rather than
pretending. Nothing there is generated, so nothing there is invented — which
is the half a chatbot gets wrong.

Set a model up in Settings and it writes the answer as well, using those same
records; the sources stay listed beneath so anything the prose names can be
checked against the record without leaving the page.

---

## Setting up how a course is marked

**Courses** tab → open the course → **Assessment components**.

A new course starts with five: Class participation, Vize, Mazeret, Final and
Bütünleme. Change any weight or max score by typing over it, remove what you
do not use, and add your own at the bottom.

Two of those five have a dash instead of a weight, on purpose. **Mazeret**
stands in for a missed Vize and **Bütünleme** for a failed Final, so each is
set to *replace* the exam it stands in for in the **Replaces** column. A
replacement carries the weight of the exam it replaces and the better of the
two marks counts. Weighting it separately would take the course past 100% and
credit a student twice for one paper.

Use the same **Replaces** setting for any make-up exam you add yourself.

---

## The week at a glance

**Courses** tab → open a course → **When it meets** → click the days it meets,
put in the time and room, and set the date the first week begins.

That is all the **Overview** tab needs to lay out your week. Each class shows
the course, the level, and which meeting of the course it is — *Session 9*,
counted from the first week, so a course meeting twice a week counts twice.

Under each class is a to-do list for that specific meeting. Type and press
Enter. It belongs to that date, so next week's class starts empty. Use **›**
to look ahead and add things to a class weeks away.

---

## Part 3 — Reviewing a thesis

**Thesis review** tab → drop in a Word file, a PDF, or paste the text →
**Analyse**.

The document appears with problems highlighted in colour, and a list beside it
explaining each one. Click a finding to jump to it.

The tabs across the top of the results:

- **Findings** — spelling, grammar, punctuation, register.
- **Level of thinking** — the important one. It places each paragraph on
  Bloom's revised taxonomy (Anderson & Krathwohl 2001): is the student
  *retelling* the novel or *reading* it? The headline number is the share of
  paragraphs that get past restating the primary source. Every row shows the
  exact wording that decided its level, so you can overrule it on sight.
  There is no combined score: Bloom's is a ladder of kinds of thinking, not a
  scale of quality, and a chapter of close analysis is not worse than one that
  proposes a framework.
- **Claims & support** — finds claims the student asserts confidently but
  supports with nothing: no citation, no evidence, no stated reason. Those are
  the passages an examiner opens the viva with. Counts only — the 0–100
  "stress index" that used to sit here was invented for this tool and has been
  removed.
- **Citations** — checks the referencing against APA 7 or MLA 9. Use the
  toggle to switch; the check re-runs.
- **Originality** — compares against the other theses you have saved here,
  which catches two students sharing text. Also flags passages whose writing
  style differs sharply from the rest of the document.
- **Deep research** — checks that the cited sources actually exist.
- **Readability** — sentence length, vocabulary, which sections are present.

**Save review** stores it so you can reopen it later and so the next thesis can
be compared against it.

### Marking a whole cohort

Opening twenty-five files to find out which three need work is the part that
takes the afternoon. **Batch triage** does that pass for you.

**Batch triage** tab → **Choose a folder** (or drag the folder in) → wait.

You get the same submissions back in the order they need reading, and beside
each one the reason it is in that position: an overloaded argument, a high
error rate, references cited but never listed, text shared with another
submission. Click **Open** on any row to read it properly in **Thesis review** —
it is already parsed, so it opens immediately.

Three things worth knowing:

- **It compares the submissions against each other.** Two students who worked
  together are invisible when you read their papers one at a time and obvious
  when both are in the same batch. Bibliographies are excluded from that
  comparison, because a class reading one syllabus cites the same books.
- **It writes nothing.** No marks, no saved reviews, no student assignments.
  Where a filename looks like one of your students it says so as a suggestion,
  and if the filename could be two students it says that instead of choosing.
- **A row with no reasons is not a good thesis.** It is one this tool has
  nothing to say about. It still needs reading; it just does not need reading
  first.

**Export CSV** gives you the whole table — every count and score per file — to
open in Excel.

### Writing the same comment for the fortieth time

Under **A note to the student** in the report dialog there is a **Comment
bank**. Write a note, press **Save this note**, and it is there on every report
from now on — press **Insert** to drop it into the box, then edit it as you
like.

A saved comment can contain `{name}`, `{fullname}` or `{title}`. Those are
filled in at the moment you insert it, not later, so what lands in the box is
the finished sentence and you can see exactly what the student will read.

The comments you use most sit at the top of the list. They are saved with
everything else, so they are in your backup file.

### Checking whether the work is the student's own

The **Integrity** tab runs six checks and ranks what it finds. Upload the
original `.docx` rather than pasting text — a Word file carries its own
editing history, and pasted text carries none.

Three of the checks are things a plagiarism service cannot do:

- **Fabricated sources.** A made-up reference looks perfect and matches
  nothing, so similarity checking passes it. Each reference is looked up in
  two academic catalogues instead. This is the most common integrity problem
  now, because it is what AI tools produce.
- **Author fingerprint.** Compares the writing against that student's own
  earlier submissions saved here. A plagiarism service cannot ask this — their
  own past essay is not plagiarism of anything.
- **File properties.** Word records how long the document was edited, how many
  times it was saved, and who wrote it. A long thesis with three minutes of
  editing across one save is worth asking about.

**Every finding comes with its innocent explanation, and you should read it.**
A student who drafts in Google Docs and pastes the result in will trip the
editing-time check while having done nothing wrong. None of this is proof.
The right next step is to ask the student about how they worked and to look at
their drafts.

### Comparing two drafts

**Compare drafts** tab → the old version and the new one → **Compare**.

You get exactly what changed: edited paragraphs with the changed words marked,
what was added, what was cut, what was moved. Use it when a student sends a
revision and says they have addressed your comments.

---

## Part 3b — Better grammar checking (optional)

Out of the box, grammar checking uses about forty built-in rules. They are
good at the mistakes that matter in academic writing — subject and verb
disagreement, comma splices, "the criteria is" — and thin on everything else.

**LanguageTool** is a free, open-source grammar checker with thousands of
rules. It runs as a program on your own computer, so the text still goes
nowhere. On a set of test sentences it caught 11 of 15 faults where the
built-in rules caught 4.

They cover different things, so the app uses both when it can.

To add it: install Java (java.com), download LanguageTool from
languagetool.org/download, unzip it, and from that folder run

```
java -cp "languagetool-server.jar" org.languagetool.server.HTTPServer --port 8081 --allow-origin "*"
```

Leave that window open, like the app's own. Then in the app:
**Settings → Grammar engine → Also use LanguageTool → Test LanguageTool.**

Set the variety of English to match how your students write. Under American
English, "summarised" and "analyse" are reported as misspellings.

## Part 4 — The one rule that matters

**Export a backup at the end of every week you enter marks.**

**Settings → Download backup.** Save the file to OneDrive, a USB stick, or
anywhere that is not this computer.

Your data is stored inside your browser, which is private but not permanent.
It will be erased, with no warning and no way to recover it, if:

- you or anyone clears the browser's browsing data / cookies / site data
- a cleanup tool (Disk Cleanup, CCleaner, a "PC optimiser") runs
- you reinstall or reset the browser
- you switch to a different browser, or a different Windows user account
- the browser reclaims space because the disk is nearly full

The app shows a warning on the Overview tab when it has been two weeks since
your last backup. Do not dismiss it.

To recover: **Settings → Restore from backup** → pick the file.

Two smaller points, same theme:

- **Always start with `start.bat`**, never a different method. The saved data
  is tied to the exact address the app runs at. A different port looks like a
  brand-new empty install.
- **Do not use InPrivate / Incognito.** Everything is erased when the window
  closes.

---

## Part 5 — What is private, and what is not

Nothing you enter is uploaded. There is no server to upload it to. Marks,
student names, and thesis texts stay in your browser's storage on this
computer, and the analysis runs on your own processor.

Two features can reach the internet, and only when you press their button:

| Feature | What leaves the computer | Default |
|---|---|---|
| **Deep research** → Verify references | The reference strings only — e.g. "Sontag, S. (1977). On photography." Sent to Crossref and OpenAlex, two public academic catalogues. Never the thesis text, never a student's name. | Off until you press it |
| **AI review** | Depends on which you choose. **Local model:** nothing leaves the computer. **Claude API:** the full thesis text is sent to Anthropic. | Off entirely |

**AI review is switched off when you install it.** If you turn it on, choose
the local option and the guarantee holds. If you choose the Claude option, the
app says plainly that the text is transmitted — check your institution's rules
before using it on student work.

### Being straight about the limits

- **Not encrypted.** Anyone who can log into this Windows account can read the
  data, and so can anyone who takes the laptop. Use a Windows password. If you
  keep sensitive material, turn on BitLocker.
- **Backups are ordinary files.** A backup on a shared drive is readable by
  anyone with that drive.
- **Private is not the same as permanent.** See Part 4.

### Two things it deliberately does not claim

- **It is not a plagiarism checker in the Turnitin sense.** It has no index of
  the web or of published journals. It compares against the theses you have
  saved here, which catches collusion within a cohort, and it verifies that
  cited sources exist, which Turnitin does not do. It cannot tell you a
  passage was copied from a book it has never seen.
- **The AI-writing score is not evidence.** Detectors of this kind mislabel
  human writing routinely, and they are worst on writers whose first language
  is not English. Treat a high score as a reason to talk to the student about
  how they worked, and to ask for drafts and notes. Never record it as a
  finding of misconduct.

---

## If something goes wrong

| Problem | Cause and fix |
|---|---|
| Black window flashes and vanishes | Right-click `start.bat` → Edit, check it is intact. Or open PowerShell in the folder and run `.\start.ps1` to see the error. |
| "Could not open port 8099" | Another program has that port. Run `.\start.ps1 -Port 8100`. **Back up first** — a different port shows an empty install. |
| Browser opens but the page is blank | You opened `index.html` directly. Close it and use `start.bat`. |
| My grades are gone | Almost always a different port or a different browser. Try the other browser first, then restore from your latest backup. |
| A Word file will not open | Save it as `.docx`, not the old `.doc`. Or copy the text and paste it in. |
| A PDF gives almost no text | It is a scan — a picture of pages, with no text in it. It needs OCR first. |
