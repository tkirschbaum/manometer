# Manual test protocol (real PowerPoint)

The automated tests cover the server, the phone app and the add-in in a browser harness. What only a person with
PowerPoint can check is below. Run it on **Windows** and on the **Mac** (about 30–45 minutes each), fill in the
`W:` / `M:` fields with ✅ / ❌ plus a note, and paste the result back into the chat (or into
[progress.md](progress.md)).

Phase 0 (`spikes/office-spike`, [phase0-checklist.md](phase0-checklist.md)) tests the raw platform behaviour in
more depth; this protocol tests the finished product. If time is short, run this one.

**Setup:** Pulse running (`Start-Pulse` or a server), add-in added ([sideloading.md](sideloading.md)), for steps
with phones the address on the slide must be reachable (tunnel or server). Note versions:

- W: Windows ___ · PowerPoint version (File → Account → About) ___ · local / server
- M: macOS ___ · PowerPoint version (PowerPoint → About) ___ · local / server

---

## A. Insert and edit

| # | Step | Expected | Result |
|---|---|---|---|
| A1 | New presentation, blank slide → insert Pulse | Frame asks "What would you like to ask?" with seven type cards | W: · M: |
| A2 | Drag the frame to fill the slide | Frame resizes; content stays readable | W: · M: |
| A3 | *Multiple choice* → question "Wie geht's?", answers "Gut", "Müde", "Hungrig" (umlauts!) | Header shows code `123 456`-style with a red dot; preview next to the form (large frame); footer "Ready to present" | W: · M: |
| A4 | Click *Done*; then click the slide | *Done* shows the slide as in the slideshow (empty bars, no sample data); clicking it reopens the form | W: · M: |
| A5 | Slide 2: insert Pulse → *Word cloud* | No extra step; same code as slide 1 | W: · M: |
| A6 | Slide 3: *Quiz*, 2 answers, click the correct one, 20 s, *More options* → start *by click* | Footer reports nothing missing | W: · M: |
| A7 | Slide 4: *Leaderboard*; slide 5: *Audience Q&A* → *Switch on audience questions* | Both show their info text, no error | W: · M: |
| A8 | Change slide 1 type via the type menu → confirm | Dialog warns; new type appears | W: · M: |
| A9 | Click outside the frame (on the PowerPoint slide) while editing a complete question | Frame switches back to the slide view | W: · M: |

## B. Duplicate, save, reopen

| # | Step | Expected | Result |
|---|---|---|---|
| B1 | Duplicate slide 1 (right-click → *Duplicate slide*), click into the copy's frame | Toast "Copy detected – created as a new question" (or banner "This question exists twice" → *Use as a separate question*) | W: · M: |
| B2 | Save (Ctrl+S / Cmd+S), close PowerPoint completely, reopen the file | All frames show their questions; same code | W: · M: |
| B3 | Copy the .pptx to a **second computer** with Pulse added, open it | Questions visible; same code | W: · M: |
| B4 | Copy slide 3 into a **different** presentation | Copy becomes a new question there | W: · M: |

## C. Slideshow

| # | Step | Expected | Result |
|---|---|---|---|
| C1 | Start the slideshow from slide 1 (one monitor) | Question, address and code in a slim bar, small QR code; layout fills the slide | W: · M: |
| C1b | Click the address bar on the slide; click again | QR code and code full screen; second click closes it | W: · M: |
| C2 | Three phones (iPhone + Android if possible) scan the QR code | Phones show the question; slide shows the responses as they answer | W: · M: |
| C2b | Slide 2 (word cloud) before anyone answers | Large QR code in the middle with "No responses yet"; disappears with the first word | W: · M: |
| C3 | Next slide (word cloud) | Phones switch to the word cloud within ~1 s; slide 1 is no longer active on the phones | W: · M: |
| C4 | Each phone sends 3 words incl. "Herz", "herz", "Größe" | Words merge case-insensitively; umlauts correct | W: · M: |
| C5 | Quiz slide: click *Start quiz* on the slide | Countdown, then timer; phones answer; correct answer + points shown at the end | W: · M: |
| C6 | Leaderboard slide | Nicknames with points | W: · M: |
| C7 | Q&A: a phone asks a question, others upvote | Question appears on the Q&A slide, sorted by votes | W: · M: |
| C8 | **Presenter view with two monitors** (or *Use presenter view* on one monitor): go through slides 1–3 | Only the **current** slide's question is active on the phones; the next-slide preview does not activate early | W: · M: |
| C9 | During the slideshow turn **Wi-Fi off for 20 s**, then on | Slide shows "Connecting …", then continues; answers sent meanwhile on phones are not lost | W: · M: |
| C10 | Turn a phone's screen off for a minute, back on | Phone reconnects, shows the current question | W: · M: |
| C11 | End the slideshow | Questions deactivate on the phones ("Waiting for the next question") | W: · M: |

## D. Results and export

| # | Step | Expected | Result |
|---|---|---|---|
| D1 | In edit mode: frame → ⋯ → *Open results & export* | Browser opens the dashboard with all slides and counts | W: · M: |
| D2 | *Export Excel* and open the file in Excel | Summary sheet + one sheet per question + Q&A; umlauts correct; question sheets start with participant_ref, then the answer columns | W: · M: |
| D3 | *Export CSV*, double-click to open in Excel | Columns split correctly (semicolon), umlauts correct (UTF-8 BOM) | W: · M: |
| D4 | ⋯ → *Reset results* on slide 1 | Counts on slide 1 go back to 0; other slides unchanged | W: · M: |
| D5 | Dashboard → *Delete all data of this presentation* | Everything gone; questions still in the .pptx; a new slideshow works again | W: · M: |

## E. Notes

Anything odd (flicker, slow start, wrong sizes, texts cut off, PowerPoint warnings):

- W:
- M:
