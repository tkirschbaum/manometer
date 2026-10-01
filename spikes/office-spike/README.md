# Phase 0 Office spike

Throwaway diagnostics add-in for PowerPoint. It answers the **[VERIFY]** questions in
[`docs/master-prompt.md`](../../docs/master-prompt.md) before any product code depends on them.
The step-by-step test procedure is in [`docs/phase0-checklist.md`](../../docs/phase0-checklist.md);
results go into [`docs/phase0-findings.md`](../../docs/phase0-findings.md).

No dependencies, no build step: a Node 22 server (`server.mjs`) and a plain HTML/JS page (`public/`).

## What it does

Every inserted spike frame is one **instance**. Each instance:

- shows platform, Office version, display language, active view (`edit` / `read`) and the
  `ActiveViewChanged` / `DocumentSelectionChanged` events it receives;
- reads the current slide via `getSelectedDataAsync(SlideRange)` on load, on click, on
  `DocumentSelectionChanged` and every second (polling), and applies the activation rule from
  master prompt §6.6: in slideshow it turns green with **ON SCREEN** only when the current slide
  is the slide it is bound to;
- binds itself to its slide on the first click in edit view and detects slide copies (§6.5);
- stores its own settings (`Office.context.document.settings`, key `pulseSpike`) and can write,
  read back, and write a 50 kB payload;
- tries the document-level stores through the PowerPoint API (`presentation.tags`, custom document
  properties, custom XML parts), lists the shapes on its slide and can resize a shape to the full slide;
- writes a heartbeat to `localStorage` and `BroadcastChannel` and lists the other live instances it can see;
- logs lifecycle events (load, visibility, focus, page hide), rendering activity (frames per second),
  key presses and clicks during the slideshow;
- can register a service worker to test whether it still starts when the server is unreachable.

Everything is shown on screen **and** sent to the spike server, so instances you cannot see
(presenter view, next-slide preview, other slides) still report what they observed.

| URL | Purpose |
|---|---|
| `https://localhost:3443/logs` | Live log of all instances; add markers like `W-T7 start` |
| `https://localhost:3443/report.md` | Summary per instance + condensed timeline. **Paste this back.** |
| `https://localhost:3443/logs.ndjson` | Raw log (also written to `logs/` on disk) |

## Run it (Windows and Mac)

Needs Node 22 (`node -v`). From this folder:

```sh
npm run certs      # once: npx office-addin-dev-certs install (trusts a localhost certificate)
npm start          # keep this terminal open
```

Open `https://localhost:3443/logs` in your normal browser. It must load without a certificate warning.

Sideload into PowerPoint (close PowerPoint first):

```sh
npm run sideload   # registers manifest.xml and opens PowerPoint with the spike on a slide
```

This uses `office-addin-dev-settings sideload` and works on Windows and Mac. After that, the spike can
be inserted on any slide via **Insert → Add-ins → My Add-ins** (Windows: tab *Developer Add-ins*).
Menu names differ slightly between builds; note what you saw in the checklist.

Manual alternatives if `sideload` fails:

- **Windows:** share this folder on the network (e.g. `\\YOURPC\office-spike`), add the share under
  *File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs*, tick
  *Show in Menu*, restart PowerPoint, then *Insert → Add-ins → My Add-ins → Shared Folder*.
- **Mac:** copy `manifest.xml` to `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/`
  (create `wef` if missing), restart PowerPoint, *Insert → Add-ins → My Add-ins*.

Remove the registration later with `npm run unregister`.

### Variant: one server for both machines (quick tunnel)

If you would rather not install Node on the Mac, run the server only on Windows and expose it:

```sh
npm run start:http                                   # http://localhost:3080, no certificate needed
cloudflared tunnel --url http://localhost:3080       # prints https://<random>.trycloudflare.com
node make-manifest.mjs https://<random>.trycloudflare.com   # writes manifest.tunnel.xml
```

Sideload `manifest.tunnel.xml` on both machines (manual way above; `npm run sideload` only accepts
localhost). Both manifests use the same add-in Id, so a `.pptx` saved on one machine opens the spike on
the other. Register only one variant per machine. The tunnel URL changes every time `cloudflared`
restarts, so the manifest has to be regenerated and sideloaded again.

## Files

| File | |
|---|---|
| `server.mjs` | HTTPS static server + log collector (loopback only) |
| `make-manifest.mjs` | Generates `manifest.xml` (localhost) or `manifest.tunnel.xml` |
| `manifest.xml` | XML add-in-only manifest, `ContentApp`, host `Presentation`, 960×540 requested |
| `public/index.html` | Loads Office.js from Microsoft's CDN, captures `history` methods before it loads |
| `public/spike.js` | All probes and the on-screen display |
| `public/sw.js` | Network-first service worker, registered only on demand (T10) |

This folder is deleted or archived after Phase 0. Nothing in it is product code.
