# Production deployment

Pulse runs as three containers (`infra/docker-compose.yml`): **Caddy 2** (HTTPS with automatic Let's Encrypt
certificates, WebSockets), the **Pulse server** (Node 22, serves the API, Socket.IO, the participant app under `/`
and the add-in under `/addin/`), **PostgreSQL 16**, plus a small **backup** container (nightly `pg_dump`).

> **Data protection — before real classroom use:** the privacy notice at `/datenschutz` is a **draft** with
> `[PLATZHALTER]`/`[PLACEHOLDER]` fields (controller, contact, legal basis). It must be completed and **reviewed by
> klu's data protection officer** before Pulse is used with students. Source:
> `apps/participant/src/screens/PrivacyScreen.tsx`.

## 1. Requirements

- A Linux VM: 2 vCPU, 4 GB RAM, 20 GB disk (testing: e.g. Hetzner Cloud CX22 in Germany; later a university VM —
  the same files run unchanged).
- Docker Engine with the Compose plugin (`docker compose version`).
- A DNS name pointing to the VM (A and/or AAAA record), e.g. `pulse.example.at`.
- Firewall: inbound **TCP 80 and 443** (UDP 443 optional for HTTP/3). Port 80 is needed for the certificate.
- **Reachable from the public internet**, not only from the campus network or VPN: students join on **mobile data**.
  Mention this explicitly in the conversation with university IT.

Measured with the load test (250 participants, PostgreSQL): server RSS 129 MB, p95 response time 4 ms — the VM
size above has plenty of headroom.

## 2. First installation

```bash
git clone -b claude/please-execute-npl91w https://github.com/tkirschbaum/manometer.git pulse
cd pulse
cp .env.example .env
```

Edit `.env` (every variable is documented in the file). Required:

```bash
APP_DOMAIN=pulse.example.at
NODE_ENV=production
EXPORT_TOKEN_SECRET=...     # node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
PARTICIPANT_HASH_SALT=...   # node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
POSTGRES_PASSWORD=...       # any long random string
```

(No Node on the server? `openssl rand -base64 32` works as well.)

Start:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml ps        # all "running", server "healthy"
curl https://pulse.example.at/healthz                                 # {"ok":true,"db":true}
```

The add-in manifest for this domain is now at `https://pulse.example.at/addin/manifest.xml` — distribute it as
described in [sideloading.md](sideloading.md).

Tip: `alias pulse='docker compose --env-file .env -f infra/docker-compose.yml'` saves typing (`pulse ps`,
`pulse logs -f server`).

## 3. Updates

**Deploy outside lecture times.** Zero-downtime is not a goal: the rebuild takes 1–3 minutes, the restart about
10 seconds. Phones and the add-in reconnect automatically and stored answers are kept, but a quiz question whose
timer is running at that moment is interrupted.

```bash
git pull
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

Database migrations run automatically when the server starts. Changing `APP_DOMAIN` changes the manifest: rebuild
and redistribute `manifest.xml`. After editing `infra/Caddyfile`: `... restart caddy` (Caddy's admin API is off).

## 4. Backups

- The `backup` container runs `pg_dump` every night at **03:15** (TZ, default Europe/Vienna) into the volume
  `pulse_backups` and keeps **7 days**. Dumps are readable only by root inside the volume.
- Copy them off the VM regularly (they contain answers, i.e. personal data — store them as protected as the server):

  ```bash
  docker compose --env-file .env -f infra/docker-compose.yml cp backup:/backups ./pulse-backups
  ```

- Restore a dump:

  ```bash
  docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres \
    pg_restore --clean --if-exists -U pulse -d pulse < pulse-backups/pulse-20261001.dump
  ```

- Manual dump right now: `... exec backup sh -c 'pg_dump -Fc -f /backups/manual.dump'`.

## 5. Data protection by design

- **No IP addresses** are stored. Caddy has **no access log** (deliberately no `log` directive in
  `infra/Caddyfile`); the server logs no request lines, IPs, user agents or answer texts.
- Participants are pseudonymous: a random id per phone; exports show only an 8-character salted hash of it
  (`PARTICIPANT_HASH_SALT`), plus the nickname a participant chose for the quiz.
- **Retention:** a daily job at 03:30 deletes answers, Q&A and leaderboards of presentations without activity for
  `RETENTION_DAYS` (default 90). Lecturers can delete everything earlier in *Results & export*. The questions stay
  in the `.pptx`.
- Backups follow the same data (7 days rolling).
- Security headers: HSTS, CSP (strict for the participant app; `/addin/*` allows Office.js from
  `appsforoffice.microsoft.com` and is embeddable by Office), `nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY` outside the add-in.

## 6. Operations

| Task | Command (prefix `docker compose --env-file .env -f infra/docker-compose.yml`) |
|---|---|
| Status | `ps` |
| Server logs | `logs -f server` |
| Restart | `restart server` |
| Stop / start | `down` / `up -d` (data stays in the volumes) |
| Remove everything incl. data | `down -v` — irreversible |
| Health check | `curl https://{APP_DOMAIN}/healthz` (also used by Docker) |

## 7. Running without Docker

The server is a single Node 22 process: `pnpm install && pnpm build && pnpm start` with `DATABASE_URL` pointing to
PostgreSQL 16 and a reverse proxy for HTTPS (or `TLS_CERT_FILE`/`TLS_KEY_FILE`). Without `DATABASE_URL`, Pulse uses
an embedded database (PGlite) — fine for a laptop and small groups; under the 250-participant load test it used
about 600 MB RAM (PostgreSQL: 129 MB), so use PostgreSQL for lectures.

## 8. Known risks

- [OfficeDev/office-js#6913](https://github.com/OfficeDev/office-js/issues/6913): centrally deployed PowerPoint
  content add-ins not opening after a July 2026 update (sideloading unaffected). Check before a university-wide
  rollout via the admin center.
- Campus Wi-Fi with captive portals or proxies: Socket.IO falls back to HTTP long-polling automatically.
