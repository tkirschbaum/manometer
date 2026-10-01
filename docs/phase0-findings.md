# Phase 0 findings — Office platform verification

Status: **waiting for results from Tobias.** The spike and checklist are ready; Windows and Mac columns are empty
until the checklist in [`phase0-checklist.md`](phase0-checklist.md) has been run. Phase 0 is not accepted until
the result table below is filled and the *Decisions* section is final (master prompt §16).

## 1. Test environment

| | Windows | Mac |
|---|---|---|
| PowerPoint version / build / channel | | |
| OS version | | |
| Spike served from (localhost / tunnel) | | |
| Date of run | | |

## 2. Results

V-IDs map every **[VERIFY]** in the master prompt (plus a few checks added in Phase 0, marked *added*) to the
checklist steps that answer them. The *Expected* column is what desk research suggests before the run
(see §3); it is **not** a result.

| ID | Question | Spec | Steps | Expected (unverified) | Windows | Mac |
|---|---|---|---|---|---|---|
| V1 | `getActiveViewAsync` returns `edit` in Normal view and `read` in the slideshow; `ActiveViewChanged` fires when entering and leaving the slideshow. | §6.6 | T7.2, T7.5, T7.7 | Yes on desktop (Microsoft documents the event as never firing only on the web). | | |
| V2 | Instance lifecycle: does the edit-view instance survive into the slideshow (same instance id) or is a new one created? Are instances on other slides loaded at slideshow start or when reached, and unloaded when left? Do off-screen instances keep rendering? *(added detail)* | §6.6 | T7 (log), T8 (log) | Unknown. `ActiveViewChanged` exists, which suggests instances survive the switch. | | |
| V3 | Slide ids from `getSelectedDataAsync(SlideRange)` are stable across save/close/reopen and differ for duplicated slides; same ids on Win and Mac for the same file. | §6.5 | T4.1–4.3, T4.6, T11 | Yes. The id is the slide id stored in the file (`p:sldId`); a duplicated slide gets a new one. | | |
| V4 | In the slideshow, `getSelectedDataAsync(SlideRange)` returns the slide currently shown (start from beginning, from current slide, forward/back, jump by number). | §6.6 | T7.2–7.4, T7.6 | Unknown. **Critical for activation.** | | |
| V5 | `DocumentSelectionChanged` fires during the slideshow when the slide changes (and in edit view). | §6.6 | T7 (log: `event.selectionChanged`) | Unknown; polling every 1 s is the fallback either way. | | |
| V6 | Presenter view: how many instances load per slide (presenter screen, audience screen, next-slide preview)? Does the slide-id rule keep only the current slide's instances ON SCREEN? | §6.6 | T8 | Unknown. Preview may be a still image (snapshot). | | |
| V7 | Settings are per add-in instance (each frame has its own). | §6.3 | T3.1 | Yes. In the `.pptx` format every frame is its own `webextension` part with its own `<we:properties>` (checked in Microsoft's sideload template). | | |
| V8 | Settings survive save/close/reopen; unsaved changes are lost on "Don't save"; the slideshow sees settings written but not yet saved to disk; a 50 kB value fits. | §6.3 | T3.2–3.5 | Yes / yes / probably / probably. | | |
| V9 | Duplicating a slide copies the settings, and copy detection (bound slide ≠ current slide) works: on load and on first click; also for copy/paste of slides, copy/paste of only the frame, and paste into another presentation. | §6.3, §6.5 | T4.3–4.5, T4.7, T4.8 | Copy: yes (the part is copied with the slide). Detection on load: unknown, on click: expected yes. | | |
| V10 | A document-level store is reachable from a **content** add-in: `PowerPoint.run` works at all; `presentation.tags`, custom document properties, custom XML parts can be written, read from another instance, and survive reopen; a new instance can read them without user action. | §2, §6.4 | T1.3, T5 | Unknown. The PowerPoint API is documented with task pane examples only. Tags need PowerPointApi 1.3; custom properties and custom XML parts need 1.7 (Win 2412 / Mac 16.92). | | |
| V11 | `localStorage` works, is shared between instances (and between open presentations), persists across PowerPoint restarts; `storage` events and `BroadcastChannel` reach other instances. | §6.4 fallback, §6.5 fallback | T6 | Windows (WebView2): likely shared and persistent. Mac (WKWebView): unknown. | | |
| V12 | Frame size on insert with `RequestedWidth/Height` 960×540; can the frame be resized to the full slide programmatically (PowerPoint API shapes); does the page reflow on manual resize? | §6.2 | T1.2, T2 | The manifest values are pixels (maximum 1000). If PowerPoint maps them at 96 DPI, 960 px = 720 pt, three quarters of a 16:9 slide (960 pt wide), and no allowed value reaches full width. Programmatic resize depends on V10 and on the frame appearing as a shape. | | |
| V13 | Office.js sets `history.pushState` / `replaceState` to null. | §6.9 | T1.3 (`office.ready` → `history`) | Unknown; the add-in restores them either way. | | |
| V14 | `Office.context.ui.openBrowserWindow` opens the system browser from a content add-in. | §6.8 | T1.4 | Yes where `OpenBrowserWindowApi 1.1` is supported. | | |
| V15 | `Office.context.displayLanguage` value (for add-in UI language). | §6.8 | T1.3 | For example `de-AT` or `de-DE`. | | |
| V16 | Interaction in the slideshow *(added)*: clicks and hover work inside the frame; after a click, do arrow keys / Space / presenter remote still advance the slides? | §6.7 (quiz start button, hide on hover) | T9 | Unknown. Risk: the add-in keeps keyboard focus after a click. | | |
| V17 | Offline *(added)*: what is shown when the server is unreachable while the file opens (no service worker)? Does a service worker work in the Office webview and let the add-in start offline? What happens when the server is lost during the slideshow, and with no internet at all? | Principle 4 | T10 | `AllowSnapshot` (default `true`) shows a still image of the add-in when the server can't be reached. Service worker: likely on Windows, unknown on Mac. | | |
| V18 | PowerPoint on the web is detectable (`Office.context.platform === OfficeOnline`). | §6.6 | T12 (optional) | Yes. | | |
| V19 | Microsoft 365 admin center menu naming for central deployment. | §13 | — | **Deferred to Phase 8** (verify at rollout time). | n/a | n/a |

## 3. Desk research (before the run)

Done from the cloud session in Phase 0. Microsoft Learn itself was blocked by the session's network policy;
facts come from web search results and the Office tooling packages.

- **PowerPoint API requirement sets** (minimum builds): 1.3 (tags) Win 2111 / Mac 16.55; 1.5 Win 2208 / Mac 16.64;
  1.6 (selection APIs) Win 2410 / Mac 16.90; 1.7 (custom and document properties, custom XML parts) Win 2412 /
  Mac 16.92; 1.8 (bindings, tables) Win 2504 / Mac 16.96; 1.9 Win 2508 / Mac 16.100; 1.10 Win 2601 / Mac 16.105.
  Perpetual Office 2021/2024 stops at 1.5 or lower. Source: OfficeDev/office-js-docs-reference,
  `powerpoint-api-requirement-sets.md`.
- **ActiveViewChanged**: Microsoft's PowerPoint add-in docs tell content add-ins to read the active view and handle
  `ActiveViewChanged`, and state that on the web the event never fires because the slideshow is a new session.
  Source: OfficeDev/office-js-docs-pr, `docs/powerpoint/powerpoint-add-ins.md`.
- **AllowSnapshot**: default `true`; stores a snapshot image of the content add-in in the document, shown in hosts
  without add-in support and *"if the application can't connect to the server hosting the add-in"*. Note: the
  snapshot can contain whatever the add-in displayed (for Pulse: join code and results).
- **Content add-ins in the `.pptx`**: Microsoft's sideload template (`office-addin-dev-settings`,
  `PowerPointPresentationWithContent.pptx`) stores the frame as `ppt/slides/udata/data.xml`, a `we:webextension`
  part with its own `<we:properties/>` (the settings) and a `<we:snapshot>` image relationship. One part per frame
  supports V7 and V9.
- **Slide ids**: the common API's `SlideRange` id (a number) cannot be used directly with the PowerPoint API's
  slide ids (strings like `256#…`); see OfficeDev/office-js issue #2474. The spike logs both.
- **Rollout risk (Phase 8)**: OfficeDev/office-js issue #6913 (open, labelled regression): since a July 2026
  update, PowerPoint content add-ins deployed centrally (Microsoft 365 admin center) do not open from the store
  dialog on Windows or Mac. Sideloading is not affected. Check the issue status again before the university-wide
  rollout.
- **Sideloading tool**: `office-addin-dev-settings sideload <manifest> desktop --app PowerPoint` registers the
  manifest (Windows registry / Mac `wef` folder) and opens a presentation with the content add-in already
  inserted; it only accepts manifests whose `SourceLocation` is `localhost`.
- **Manifest validation**: `office-addin-manifest validate` uses Microsoft's online validation service, which this
  cloud session cannot reach. The manifest parses locally (`office-addin-manifest info`); online validation is
  checklist step T0.4.

## 4. Decisions

All decisions are **pending** until the results are in. Each one has a decision rule so the outcome follows
directly from the table. If a result contradicts the master prompt in a way the rules don't cover, I stop and ask
with two options (master prompt §18).

### D1 Deck linking for new instances (§6.4)

- **Option A (preferred by the spec):** document-level store (the first of tags / custom property / custom XML
  that passes V10 on both platforms), plus the `localStorage` registry as safety net.
- **Option B:** `localStorage` deck registry only (requires V11: shared and persistent on both platforms).
- **Rule:** A if V10 passes on Windows **and** Mac for write, cross-instance read, persistence and silent read by a
  new instance; otherwise B. If V11 also fails on a platform, new instances there cannot find the deck on their
  own. Linking by typing the join code is not an option because presenter actions need the secret, which is never
  shown on screen (§6.3), so that case is a spec conflict I would raise with options.
- **Decision:** pending.

### D2 Duplicate detection (§6.5)

- **Option A:** slide-id binding (`boundSlideId`) with copy check on first editor interaction.
- **Option B:** heartbeat fallback in `localStorage` (two live edit-view instances with the same item id).
- **Rule:** A if V3 and V9 pass on both platforms (ids stable, different after duplication, detection on click).
  B only where A fails and V11 passes. Note from the spike design: the heartbeat must compare edit-view instances
  only, because presenter view may legitimately run the same item twice (V6).
- **Decision:** pending.

### D3 Slideshow activation signal (§6.6)

- **Option A (spec):** `SlideRange` slide id compared with `boundSlideId`, checked on entering `read`, on
  `DocumentSelectionChanged` (if V5) and by 1 s polling.
- **Option B:** if V4 fails (the id does not follow the slideshow), use lifecycle/visibility signals measured in
  V2/V6 (rendering active, visibility) instead. This would change §6.6 behaviour and needs your approval.
- **Rule:** A if V4 passes on both platforms and V6 shows no false ON SCREEN in presenter view.
- **Decision:** pending.

### D4 Frame sizing (§6.2)

- **Option A:** the editor offers "An Folie anpassen" which resizes the frame via the PowerPoint API.
- **Option B (spec fallback):** one-line hint "Rahmen auf Foliengröße ziehen" with a small illustration.
- **Rule:** A only if V12 shows the frame as a shape that can be resized on both platforms (this also needs V10:
  `PowerPoint.run` works). Otherwise B. The stage layout must work at any 16:9-ish size in both cases.
- **Decision:** pending.

### D5 Use of `PowerPoint.run` inside the content add-in (§2)

- **Rule:** allowed only for features where V10 / V12 pass on both platforms, always feature-detected with the
  common-API path as fallback. Otherwise not used at all.
- **Decision:** pending.

### D6 Offline start (principle 4)

- **Option A:** service worker for `/addin/` (network-first, cache fallback, including Office.js), so the add-in
  starts from cache and renders join URL, code and QR from settings.
- **Option B:** rely on the `AllowSnapshot` image for the case "server unreachable when the file opens" and on the
  already-loaded instance for "server lost during the slideshow".
- **Rule:** A on every platform where V17 shows the service worker works and the add-in starts offline; B where it
  doesn't. If V17 shows that neither gives a usable slide (no snapshot, blank frame), this is a spec conflict to
  raise (principle 4 cannot be met as written).
- **Decision:** pending.

### D7 Clicks during the slideshow (§6.7)

- **Rule:** if V16 shows that clicking in the frame takes the keyboard away from the slideshow, the quiz default
  stays `startMode: 'auto'`, the "Quiz starten" button and hide buttons stay, and the presenter guide explains how
  to return control (the exact action from T9.3). If keys keep working, no change.
- **Decision:** pending.

## 5. Deviations and additions in Phase 0

- Added V16 (keyboard focus after clicks), V17 (offline start) and the lifecycle/rendering details in V2, because
  §6.7 (clickable quiz start) and principle 4 (never a broken slide) depend on them and nothing else in the plan
  verifies them.
- The spike is plain JavaScript with no build step and no dependencies (allowed: Phase 0 is a throwaway spike, not
  covered by the §2 stack).
- The spike server uses the same port as the later dev server (3443) and the same dev certificates, so the
  certificate setup carries over to Phase 1.
