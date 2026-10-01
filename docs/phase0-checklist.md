# Phase 0 checklist (run on Windows and Mac)

Run this once on **PowerPoint for Windows (Microsoft 365)** and once on **PowerPoint for Mac**.
Expect about 60–90 minutes per platform. Setup and background: [`spikes/office-spike/README.md`](../spikes/office-spike/README.md).

**How to answer:** fill in the `W:` (Windows) and `M:` (Mac) fields with a short answer (`yes`, `no`, a number,
or one sentence). Where a step says *(log)*, the spike records the answer automatically and you only need
to send the report at the end. Things only a human can see (what is on screen, which key worked) are the
important ones to write down.

**Markers:** at the start of each test, type a marker such as `W-T7` into the marker field on
`https://localhost:3443/logs` (or the spike panel) and press *Add marker*. This lets me match the log to the steps.

**What to send back:**

1. This file with your `W:` / `M:` answers.
2. The content of `https://localhost:3443/report.md` from each machine (copy everything, or attach the
   `.ndjson` file from `spikes/office-spike/logs/`).
3. If possible, a photo or screenshot for T8 (presenter view) and T10.1 (server stopped).

---

## T0 Setup (once per machine)

- 0.1 `node -v` shows v22 or later. — W: ___ M: ___
- 0.2 In `spikes/office-spike`: `npm run certs` (confirm the certificate prompt; the Mac asks for your password).
- 0.3 `npm start`, then open `https://localhost:3443/logs` in your browser. Loads without a certificate warning? — W: ___ M: ___
- 0.4 `npm run validate` (needs internet; Microsoft's manifest check). Result, especially any errors: — W: ___ M: ___
- 0.5 Close PowerPoint. `npm run sideload`. Does PowerPoint open with the spike on a slide? — W: ___ M: ___
- 0.6 PowerPoint version, build and update channel (Windows: *File → Account → About PowerPoint*; Mac: *PowerPoint → About PowerPoint*). — W: ___ M: ___
- 0.7 OS version. — W: ___ M: ___

## T1 Test deck and probes

- 1.1 Create a new blank presentation, 16:9 (*Design → Slide Size → Widescreen*). Build exactly this deck:

  | # | Slide |
  |---|---|
  | 1 | Title slide "Start" |
  | 2 | Spike **A** (blank layout + *Insert → Add-ins → My Add-ins → Pulse Office Spike*) |
  | 3 | Title slide "Zwischenfolie" |
  | 4 | Spike **B** |
  | 5 | Title slide "Ende" |

  Save as `phase0-win.pptx` / `phase0-mac.pptx`. Exact menu path you used to insert the spike:
  — W: ___ M: ___
- 1.2 Right after inserting spike A, before touching it: does the frame fill the whole slide? Frame size in
  PowerPoint (*Shape Format → Size*, in cm) and the spike's *Frame* value (px):
  — W: ___ M: ___
- 1.3 On slide 2 click **Run probes** and wait about 10 seconds. Then click **Copy report** and paste it here
  (if copying fails, the text appears in a box below the buttons; it is also in the log). *(log)*
  — W: (paste) M: (paste)
- 1.4 Click **Open logs in browser**. Does your normal browser open the log page? — W: ___ M: ___

## T2 Frame size

- 2.1 On slide 2 click **List shapes on this slide**. Is the spike frame in the list? Which name and type does it have?
  — W: ___ M: ___
- 2.2 Click **Fit to slide** on that row. Does the frame now cover the whole slide? *(log: ppt.fitShape)*
  — W: ___ M: ___
- 2.3 Drag a corner of the frame to resize it by hand. Does the *Frame* value in the spike update immediately,
  and does the content reflow without reloading? — W: ___ M: ___
- 2.4 Leave the frame filling the slide (fit again, or drag it to full size) for the rest of the tests.

## T3 Settings (per instance, in the file)

- 3.1 Slide 2: **Write random value + save** → note the value (A1). Slide 4: same (B1). Back to slide 2:
  still A1? — W: A1=___ B1=___ still A1: ___ M: A1=___ B1=___ still A1: ___
- 3.2 Ctrl+S / Cmd+S. Quit PowerPoint completely (Windows: close all windows; Mac: Cmd+Q). Reopen the file.
  Slide 2 shows A1 and slide 4 shows B1? *Item* ids unchanged? — W: ___ M: ___
- 3.3 Slide 2: write a new value (A2). Close the file **without saving**. Reopen. Which value is shown: A1 or A2?
  — W: ___ M: ___
- 3.4 Slide 2: write a new value (A3), do **not** save, and start the slideshow from the current slide
  (Windows: Shift+F5; Mac: *Slide Show → Play from Current Slide*). Does the slideshow show *Value* A3?
  Press Esc. — W: ___ M: ___
- 3.5 Slide 2: **Write 50 kB + save**. Does the log show `settings.save` with `ok: true`? Save, quit, reopen:
  does the `settings.read` entry show `bigLength: 50000`? Then **Remove 50 kB + save** and save the file. *(log)*
  — W: ___ M: ___

## T4 Slide identity and duplication

- 4.1 Slide 2: click once anywhere inside the spike (the first click binds it; if you already clicked in T3, it is
  bound already). *Bound slide* shows a number (S2). Slide 4: same (S4).
  — W: S2=___ S4=___ M: S2=___ S4=___
- 4.2 Save, quit, reopen. Click into slide 2 and slide 4. Still S2 and S4? Log shows `bind.ok`? — W: ___ M: ___
- 4.3 Right-click slide 4 in the thumbnail pane → *Duplicate Slide*. Go to the new slide 5 **without clicking into
  the frame**. Does the yellow banner say *COPY DETECTED (load)*? Then click into the frame: does the *Item* change
  and show *(from …)*? New *Bound slide* (S5), different from S4?
  — W: banner on load ___ forked on click ___ S5=___ M: banner on load ___ forked on click ___ S5=___
- 4.4 Back to slide 4, click into it: still S4, original item id, no banner? — W: ___ M: ___
- 4.5 Select slide 2 in the thumbnail pane, Ctrl+C, click below the last slide, Ctrl+V. On the pasted slide: copy
  detected (on load or on click)? Then delete the pasted slide. — W: ___ M: ___
- 4.6 Drag slide 2 in the thumbnail pane to position 3 and back to position 2. Click into it: `bind.ok`, no copy
  detected? — W: ___ M: ___
- 4.7 Select only the frame on slide 4 (click its border so the frame is selected, not its content), Ctrl+C, go to
  slide 1, Ctrl+V. Does the pasted frame load? Copy detected? Then delete the pasted frame. — W: ___ M: ___
- 4.8 Copy slide 4 into a brand-new presentation (Ctrl+N, then paste). Does the spike load there, with slide 4's
  *Value*? Copy detected? Keep this second presentation open for T6.3, then close it without saving.
  — W: ___ M: ___

The deck should now be: 1 Start, 2 A, 3 Zwischenfolie, 4 B, 5 B-copy, 6 Ende. Every spike has been clicked once.
Save.

## T5 Document-level store (PowerPoint API)

- 5.1 Slide 2: **Write tag**, **Write custom property**, **Write custom XML**. For each row in the T1 table
  (`ppt.tag.write`, `ppt.customProperty.write`, `ppt.customXml.write`): ok or fail, and the error text if it failed.
  — W: tag ___ prop ___ xml ___ M: tag ___ prop ___ xml ___
- 5.2 Slide 4: **Read tag**, **Read custom property**, **Read custom XML**. Same values as written on slide 2?
  — W: ___ M: ___
- 5.3 Save, quit, reopen. Slide 5: read all three again. Values still there? — W: ___ M: ___
- 5.4 Insert a new spike on a new slide 7 and click **Run probes**. Do the rows `ppt.tag.read`,
  `ppt.customProperty.read`, `ppt.customXml.read` show the values? Then delete slide 7. — W: ___ M: ___
- 5.5 Is the custom property visible to users? (Windows: *File → Info → Properties → Advanced Properties → Custom*;
  Mac: *File → Properties → Custom*.) — W: ___ M: ___

## T6 localStorage and cross-instance signals

- 6.1 In edit view, show slide 2, then slide 4, then slide 2 again. In the T6 table on slide 2: how many other
  instances are listed? Are `storageEvents` and `broadcastMessages` above 0? — W: ___ M: ___
- 6.2 Note `firstSeen` and `loadsOnThisDevice`. Quit PowerPoint, reopen. `firstSeen` unchanged, `loads` higher?
  — W: ___ M: ___
- 6.3 With the second presentation from 4.8 open next to this one: does the T6 table list instances from the
  other file? — W: ___ M: ___

## T7 Slideshow and activation

Marker: `W-T7` / `M-T7`.

- 7.1 Select slide 1 in the thumbnail pane and start from the beginning (Windows: F5; Mac: *Play from Start*).
- 7.2 Advance to slide 2. Does the spike turn green with **ON SCREEN**? Roughly how long after the slide appears
  (instantly, about 1 s, longer)? — W: ___ M: ___
- 7.3 Advance through slides 3, 4, 5, 6, then go back to 4 and 2. Is every spike slide ON SCREEN while shown?
  Did you ever see a spike slide showing OFF SCREEN while it was the current slide? — W: ___ M: ___
- 7.4 Type `5` and press Enter (jump to slide 5). ON SCREEN? — W: ___ M: ___
- 7.5 Press Esc. Any visible reload or flicker of the spikes when leaving the slideshow? — W: ___ M: ___
- 7.6 Select slide 4 in the thumbnail pane, start from the current slide. Slide 4 ON SCREEN? — W: ___ M: ___
- 7.7 *View → Reading View* (Mac: if available). What does the spike show? — W: ___ M: ___

## T8 Presenter view

Marker: `W-T8` / `M-T8`.

- 8.1 One monitor. Windows: Alt+F5. Mac: *Slide Show → Presenter View*. Navigate 1 → 2 → 3 → 4 → 5.
- 8.2 On the presenter screen, is the **current** slide's spike live (HUD updating) or a still image?
  What does it show (ON / OFF SCREEN)? — W: ___ M: ___
- 8.3 Is the **next-slide preview** live or a still image? If live, what does its HUD show? — W: ___ M: ___
- 8.4 Two monitors (if available: extend the display, then F5 with presenter view on the laptop). On the audience
  screen, is only the current spike slide ON SCREEN? Anything different from one monitor? — W: ___ M: ___
- 8.5 Photo or screenshot of the presenter screen while slide 4 is current (slide 5 is then the preview). — W: ___ M: ___

## T9 Interaction during the slideshow

Marker: `W-T9` / `M-T9`.

- 9.1 In the slideshow on slide 2: hover over *Hover test*. Does it highlight? Click *Click test*. Does the counter
  go up? — W: ___ M: ___
- 9.2 Directly after clicking: press → (right arrow). Does the slideshow advance? If not, try Space, PageDown and a
  presenter remote if you have one. Which ones work? — W: ___ M: ___
- 9.3 If the keys stopped working: how did you get control back (click on the slide outside the frame, Esc, …)?
  — W: ___ M: ___
- 9.4 Mouse wheel over the frame: does it change slides or do nothing? — W: ___ M: ___

## T10 Offline behaviour

Marker: `W-T10` / `M-T10`.

- 10.1 **Server stopped, no service worker.** Save, quit PowerPoint. Stop the server (Ctrl+C in its terminal).
  Reopen the file. What does slide 2 show in edit view (a still image of the spike, an error box, an empty frame)?
  Start the slideshow: what does slide 2 show? Screenshot if possible.
  — W: edit ___ slideshow ___ M: edit ___ slideshow ___
- 10.2 Start the server again (`npm start`), reopen the file. Slide 2: **Register service worker**. Does
  `sw.register` say ok? On the Mac, *navigator.serviceWorker is not available* is a valid answer: note it and skip
  10.3. Quit, reopen, slide 2 → **Status**: `controlled: true`? — W: ___ M: ___
- 10.3 Stop the server. Quit and reopen PowerPoint with the file. Does the spike start (HUD visible, *Server* down)?
  Start the slideshow: does ON SCREEN still work? — W: ___ M: ___
- 10.4 **Server lost during the slideshow.** Start the server. Start the slideshow, go to slide 2 (ON SCREEN).
  Stop the server. Does slide 2 keep working (*Server* down)? Advance to slide 4: does it start? Start the server
  again: does *Server* return to up within about 10 seconds? — W: ___ M: ___
- 10.5 **No internet at all** (Wi-Fi off; the local server keeps running). Quit and reopen the file. Does the spike
  start? (Office.js itself comes from Microsoft's CDN.) — W: ___ M: ___
- 10.6 Turn Wi-Fi back on. Slide 2: **Unregister + clear caches**.

## T11 Same file on the other platform

- 11.1 Open the Windows deck on the Mac (and/or the other way round), with the spike sideloaded there.
  Do *Item*, *Value* and *Bound slide* match what the first machine showed? Click into each spike: `bind.ok`, no
  copy detected? — W→M: ___ M→W: ___

## T12 Optional: PowerPoint on the web

Only if it is quick for you. Upload a deck with the spike to OneDrive and open it in PowerPoint on the web
(the spike needs to be added there via *Insert → Add-ins → Upload My Add-in* with `manifest.xml`).

- 12.1 What does the T1 report show for `platform`? Does the banner say *PowerPoint on the web detected*? — ___

---

Thank you. Paste everything back in one message; I will fill in `docs/phase0-findings.md` and the decisions.
