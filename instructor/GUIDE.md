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

Double-click **`start.bat`**.

A black window opens and your browser opens the app. That black window is the
program — **leave it open while you work.** Closing it stops the app.

If Windows shows a blue "Windows protected your PC" box, click **More info →
Run anyway**. That warning appears for any script that did not come from an
app store; the file is a plain text file you can open in Notepad and read.

If Windows Firewall asks for permission, **Cancel** is the correct answer. The
app does not need to accept connections from other computers.

### Step 3. Check it works

You should see the app with empty tabs across the top: Overview, Students,
Courses, Gradebook, Analytics, Thesis review, Compare drafts, Settings.

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

## Part 3 — Reviewing a thesis

**Thesis review** tab → drop in a Word file, a PDF, or paste the text →
**Analyse**.

The document appears with problems highlighted in colour, and a list beside it
explaining each one. Click a finding to jump to it.

The tabs across the top of the results:

- **Findings** — spelling, grammar, punctuation, register.
- **Argument stress** — the important one. It finds claims the student
  asserts confidently but supports with nothing: no citation, no evidence, no
  stated reason. Those are the passages an examiner opens the viva with. The
  score runs 0 (sound) to 100 (overloaded).
- **Citations** — checks the referencing against APA 7 or MLA 9. Use the
  toggle to switch; the check re-runs.
- **Originality** — compares against the other theses you have saved here,
  which catches two students sharing text. Also flags passages whose writing
  style differs sharply from the rest of the document.
- **Deep research** — checks that the cited sources actually exist.
- **Readability** — sentence length, vocabulary, which sections are present.

**Save review** stores it so you can reopen it later and so the next thesis can
be compared against it.

### Comparing two drafts

**Compare drafts** tab → the old version and the new one → **Compare**.

You get exactly what changed: edited paragraphs with the changed words marked,
what was added, what was cut, what was moved. Use it when a student sends a
revision and says they have addressed your comments.

---

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
