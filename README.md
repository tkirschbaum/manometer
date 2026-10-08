# Pulse — live voting inside PowerPoint

Pulse is a self-hosted alternative to Mentimeter that lives **inside your PowerPoint slides**. You put a Pulse
frame on a slide, type a question, and during the slideshow the audience answers on their phones — no app, no
account. Results appear live on the slide.

- Slide types: multiple choice, word cloud, open question, scale, quiz (with leaderboard), audience Q&A
- Everything is stored in your `.pptx` (the questions) and on your own server (the answers) — no third-party cloud
- Export of all answers as Excel or CSV, automatic deletion after 90 days (DSGVO)
- German and English, works on Windows and Mac (PowerPoint desktop app)

---

## 1. Download

**[⬇ Download Pulse (ZIP)](https://github.com/tkirschbaum/manometer/archive/refs/heads/claude/please-execute-npl91w.zip)**

Unzip it somewhere you'll find again, e.g. `Documents\Pulse` (Windows) or `~/Documents/Pulse` (Mac).

Or with git:

```bash
git clone -b claude/please-execute-npl91w https://github.com/tkirschbaum/manometer.git pulse
```

## 2. Install (once, about 5 minutes)

You need **Node.js 22 LTS or newer**: <https://nodejs.org> → "LTS" → install with the defaults.

### Windows

1. Open the unzipped folder and **double-click `Start-Pulse.cmd`**.
2. The first start installs everything. Windows shows a **security warning about installing a certificate
   ("localhost")** — click **Yes**. That certificate lets PowerPoint load Pulse over HTTPS from your own computer.
3. When the browser opens `https://localhost:3443`, Pulse is running. **Keep the black window open** while you
   work with Pulse; closing it stops Pulse.

### Mac

1. Open the unzipped folder, **right-click `Start-Pulse.command` → Open → Open** (the right-click is only needed
   the first time, because the file was downloaded from the internet).
2. The first start installs everything and asks for your **Mac password** to trust the `localhost` certificate.
3. When the browser opens `https://localhost:3443`, Pulse is running. **Keep the Terminal window open.**

> If double-clicking does nothing on the Mac: open Terminal, type `cd ` (with a space), drag the Pulse folder into
> the window, press Enter, then run `bash Start-Pulse.command`.

<details>
<summary>The same steps by hand (terminal)</summary>

```bash
npm install -g pnpm        # Mac: sudo npm install -g pnpm
pnpm install
pnpm setup:local           # .env with random secrets, localhost certificate, build, add-in registration
pnpm start                 # → https://localhost:3443
```

</details>

## 3. Add Pulse to PowerPoint (once)

The setup already registered the add-in. **Restart PowerPoint**, then:

- **Windows:** *Insert → Add-ins → My Add-ins* (newer versions: *Home → Add-ins → More Add-ins → My Add-ins*) →
  tab **Developer Add-ins** → **Pulse** → *Add*.
- **Mac:** *Insert → Add-ins → My Add-ins* → **Pulse** (under *Developer Add-ins*).

A Pulse frame appears on the slide. If Pulse is not in the list, see [docs/sideloading.md](docs/sideloading.md).

## 4. Use it

1. On a slide: *Insert → My Add-ins → Pulse*. Drag the frame so it fills the slide.
2. Pulse asks **"What would you like to ask?"** — pick a type (e.g. *Multiple choice*).
3. Type the question and the answers. With a large enough frame you see a live preview next to the form.
4. Click **Done**: the frame now shows the slide exactly as the audience will see it. Click it to edit again.
5. **Save the presentation** (Ctrl+S / Cmd+S) — the question lives in the file.
6. Start the slideshow. The slide shows the question and the 6-digit code, with a small QR code in the corner
   (shown large while nobody has answered yet). Click the code bar to show QR code, address and code full screen.
   Results appear live.
7. Afterwards: in the editor's **⋯ menu → Open results & export** → Excel/CSV.

More slides: insert another Pulse frame and pick a type — all questions of a presentation share one code
automatically. Duplicating a Pulse slide is fine too: Pulse notices the copy and turns it into a new question.

The German one-page guide for lecturers is [docs/presenter-guide.de.md](docs/presenter-guide.de.md).

## 5. Let phones join

Phones can't reach `localhost` on your laptop. Two options:

**A — One click, no server needed: `Start-Pulse-Online`**

Double-click **`Start-Pulse-Online.command`** (Mac) or **`Start-Pulse-Online.cmd`** (Windows) instead of
`Start-Pulse`. It starts Pulse together with a free Cloudflare tunnel, sets the public address by itself and prints
it, e.g. `Phones join at: https://something-random.trycloudflare.com`. The slides show that address and QR code
automatically — nothing to edit. The first start downloads `cloudflared` once (or uses an installed one). The
address changes with every start, which is fine: the slides update themselves when they connect. Keep the window
open while presenting; closing it stops Pulse and the tunnel. (From a terminal: `pnpm start:online`.)

Manual way, if you prefer: install cloudflared (`brew install cloudflared` / `winget install --id
Cloudflare.cloudflared`), run `cloudflared tunnel --url https://localhost:3443 --no-tls-verify` and put the printed
address into `.env` as `PUBLIC_BASE_URL=…`, then restart Pulse.

**B — Real use in lectures:** run Pulse on a server with a fixed domain (e.g. `pulse.example.at`). See
[docs/deployment.md](docs/deployment.md): one `docker compose up` on any Linux VM (Hetzner, university VM), HTTPS
included. Then generate the add-in manifest for that domain and give it to colleagues
([docs/sideloading.md](docs/sideloading.md)).

## 6. Good to know

- **PowerPoint on the web is not supported** (desktop app on Windows and Mac only).
- The answers live on the Pulse server, the questions in the `.pptx`. Opening the file on another computer works
  as long as that computer also has Pulse added (same server).
- Data protection: no IP addresses are stored, answers are deleted 90 days after the last activity, everything can
  be deleted earlier in *Results & export*. The privacy notice at `/datenschutz` is a **draft** that klu's data
  protection officer must review before real classroom use.
- Status and known limitations: [docs/progress.md](docs/progress.md). Before relying on it in a lecture, please run
  the 30-minute check in [docs/manual-test-protocol.md](docs/manual-test-protocol.md) once on your machine.

## 7. For developers

```bash
pnpm install
pnpm dev                   # https://localhost:3443 with hot reload (both apps via Vite middleware)
                           #   add-in harness without PowerPoint: https://localhost:3443/addin/?harness=1
pnpm check                 # typecheck + lint + unit/integration tests
pnpm build && pnpm test:e2e
pnpm build && pnpm test:load
```

Layout: `apps/server` (Fastify + Socket.IO + Drizzle), `apps/participant` (phone app), `apps/addin` (PowerPoint
add-in), `packages/shared` (zod contracts, i18n, tokens), `infra/` (Docker, Caddy). Conventions are in
[CLAUDE.md](CLAUDE.md), the full specification in [docs/master-prompt.md](docs/master-prompt.md).
