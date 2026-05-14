# Botifys — WhatsApp Lead Management

Internal lead-management system for an Indian automation-services business.
Customers click a Meta ad → message your WhatsApp → an AI bot qualifies them →
your sales team works the qualified leads in a private dashboard → calls are
recorded → Gemini summarises every call and tags the lead's temperature.

Built fully as one TypeScript codebase deployed as one container on Easypanel.
No third-party SaaS beyond Meta Cloud API and Google Gemini.

---

## What it does

| Phase | Capability |
|---|---|
| **Phase 1** | WhatsApp bot that greets every Meta-ad-driven message, filters out non-business-owners, collects 4 fields (name, industry, team size, website/social) using Gemini, and stores qualified leads in SQLite |
| **Phase 2** | Internal CRM dashboard for the sales team — login, lead list with filters, lead detail page with full bot conversation, status pipeline (New / Contacted / Hot / Cold / Won / Lost), notes, click-to-call, owner stats page |
| **Phase 3** | Call recording upload + Gemini multimodal audio analysis: full transcript, 3-5 bullet summary, AI verdict (Hot / Warm / Cold / Not interested) with confidence and reasoning, key points, objections, action items |
| **Phase 3.5** | Auto-upload from salesperson's phone via the free [Automate by LlamaLab](https://play.google.com/store/apps/details?id=com.llamalab.automate) Android app — bearer-token endpoint that accepts call recordings and matches them to leads by phone number from the filename |
| **Phase 4** | Salesperson WhatsApp notifications when a new lead qualifies + email error alerts (via Resend) when the bot can't reply to a customer, so the owner can take over manually |
| **Legal** | Public `/privacy`, `/terms`, `/data-deletion` pages required by Meta to take the WhatsApp app to Live mode |

Bot personality is locked: it qualifies and gathers data, never sells or quotes
prices. The sales team handles all value conversation on the call. See
`src/prompts/system.ts` for the full system instruction.

---

## Tech stack

**Backend** — TypeScript (Node 20+), Fastify 5, better-sqlite3, `@google/genai`
SDK (Gemini 2.5 Flash for both qualifying and call analysis), `@fastify/cookie`
+ `@fastify/secure-session` for dashboard auth, `@fastify/multipart` for audio
uploads, `@fastify/static` for serving the dashboard, `zod` for input validation.

**Frontend** — Vite 6 + React 19 + TypeScript, Tailwind CSS 4, React Router v7,
TanStack Query. Editorial-minimalism aesthetic (Fraunces serif, Geist sans,
Geist Mono) keyed to a black/white logo with one warm-orange accent.

**External services** —
- Meta WhatsApp Cloud API for inbound messages and bot replies
- Google Gemini for AI (text + audio multimodal)
- Resend for owner-side error-alert email (free 3,000/month)

**Deploy** — single Docker image (multi-stage: builds backend + frontend) on
Easypanel with one persistent volume at `/app/data` (covers SQLite + audio
files).

---

## Local development

```powershell
# 1. Copy env template and fill in real values
copy .env.example .env
# Edit .env and put your real Meta + Gemini keys

# 2. Install backend deps
npm install

# 3. Install frontend deps
cd web
npm install
cd ..

# 4. Start backend (terminal 1)
npm run dev   # listens on :3000

# 5. Start frontend (terminal 2) — proxies /api to backend
cd web
npm run dev   # listens on :5173 (or 5174 if 5173 is taken)
```

Open `http://localhost:5173/dashboard/login` in your browser.

To test the WhatsApp bot side, expose `:3000` to Meta:

```powershell
# Terminal 3
ngrok http 3000
```

Then in Meta Business Suite → WhatsApp → Configuration:
- Callback URL: `https://<your-ngrok-subdomain>/webhook`
- Verify token: same value as `META_VERIFY_TOKEN` in `.env`
- Subscribe to the `messages` field.

---

## Environment variables

All listed in `.env.example`. The required ones (the bot won't boot without
them) are validated by `src/config.ts` on startup.

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | HTTP port |
| `NODE_ENV` | no (default `production`) | Logging level |
| `META_VERIFY_TOKEN` | **yes** | Shared secret with Meta for webhook verification |
| `META_PHONE_NUMBER_ID` | **yes** | Cloud API phone number ID for outbound sends |
| `META_WHATSAPP_ACCESS_TOKEN` | **yes** | Bearer token for Meta Cloud API (use a permanent System User token in production) |
| `GEMINI_API_KEY` | **yes** | From https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no (default `gemini-2.5-flash`) | Both qualifying chat and call analysis |
| `DB_PATH` | no (default `./data/leads.db`) | SQLite file path |
| `DASHBOARD_PASSWORD` | **yes** | Shared password for the team dashboard |
| `SESSION_SECRET` | **yes** (≥32 chars) | Signs session cookies |
| `AUDIO_DIR` | no (default `./data/audio`) | Where uploaded call recordings are stored |
| `MAX_AUDIO_BYTES` | no (default 100 MB) | Upload ceiling per file |
| `AUTO_UPLOAD_TOKEN` | **yes** (≥24 chars) | Bearer token for the salesperson's phone automation app |
| `SALESPERSON_PHONES` | no | Comma-separated WhatsApp numbers (with country code, no `+`) to notify on each qualified lead |
| `DASHBOARD_PUBLIC_URL` | no (default `https://whatsapp.botifys.com`) | Used in WhatsApp + email deep links |
| `RESEND_API_KEY` | no | Sign up at https://resend.com (free 3,000/mo). Leave empty to disable email alerts |
| `ALERT_EMAIL` | no | Where error alerts go |
| `ALERT_FROM_EMAIL` | no (default `onboarding@resend.dev`) | Sender — works out of the box; verify your domain in Resend later |

---

## Production deploy (Easypanel)

1. Push to GitHub.
2. Easypanel → **+ Service → App** → connect the GitHub repo.
3. Build pack: **Dockerfile** (auto-detected).
4. Mount a persistent volume at **`/app/data`** (covers both SQLite and audio).
5. Set environment variables in Easypanel's **Environment** tab (see table above).
6. Expose port **3000** and attach an HTTPS domain (Easypanel issues Let's Encrypt automatically).
7. In Meta Business Suite → WhatsApp → Configuration:
   - Callback URL: `https://<your-domain>/webhook`
   - Verify token: same as `META_VERIFY_TOKEN`
   - Subscribe to `messages`
8. **First-time only** for a real number, register it on the Cloud API:
   ```
   POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/register
   Authorization: Bearer {ACCESS_TOKEN}
   { "messaging_product": "whatsapp", "pin": "<6-digit PIN you choose>" }
   ```
   And subscribe the App to the WABA:
   ```
   POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
   Authorization: Bearer {ACCESS_TOKEN}
   ```
   Both return `{"success": true}`.
9. For Meta Live mode, set the public Privacy Policy / Terms / Data Deletion URLs to:
   - `https://<your-domain>/privacy`
   - `https://<your-domain>/terms`
   - `https://<your-domain>/data-deletion`

---

## Public routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Health check |
| GET | `/webhook` | Meta verify handshake |
| POST | `/webhook` | Meta delivers WhatsApp events here |
| GET | `/privacy`, `/terms`, `/data-deletion` | Legal pages required for Meta Live |
| POST | `/api/calls/auto-upload` | Phone automation app uploads recordings here (Bearer-auth, no session) |

## Authenticated routes (session cookie)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Set session cookie from password |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Check current session |
| GET | `/api/leads` | List leads with filters |
| GET | `/api/leads/:phone` | One lead's full record |
| GET | `/api/leads/:phone/messages` | Bot conversation transcript |
| PATCH | `/api/leads/:phone` | Update status / notes |
| DELETE | `/api/conversations/:phone` | Reset everything for a phone (conversation + messages + lead + calls). Lets you re-test with a phone that got disqualified |
| GET | `/api/leads/:phone/calls` | List call recordings for a lead |
| POST | `/api/leads/:phone/calls` | Upload a call recording (multipart) |
| GET | `/api/calls/:id` | One call record |
| GET | `/api/calls/:id/audio` | Stream the audio file |
| POST | `/api/calls/:id/analyze` | Re-run Gemini analysis on a call |
| DELETE | `/api/calls/:id` | Delete a call (file + DB row) |
| GET | `/api/stats` | Dashboard aggregations (leads + calls + verdict distribution + top objections) |

## Static SPA

| Path | Purpose |
|---|---|
| `/dashboard/*` | The React dashboard SPA (served from `web/dist` after build) |

---

## Project structure

```
.
├── src/                                    Backend (Node + TypeScript + Fastify)
│   ├── index.ts                            Bootstrap
│   ├── server.ts                           Fastify app + plugin/route registration
│   ├── config.ts                           Typed env-var loader
│   ├── routes/
│   │   ├── webhook.ts                      Meta verify + incoming message handler
│   │   ├── auth.ts                         Login / logout / me
│   │   ├── leads.ts                        Lead CRUD + reset
│   │   ├── calls.ts                        Call recording upload, list, audio stream, analyze, delete
│   │   ├── auto-upload.ts                  Bearer-auth endpoint for phone automation app
│   │   ├── stats.ts                        Dashboard aggregations
│   │   └── legal.ts                        /privacy, /terms, /data-deletion
│   ├── services/
│   │   ├── meta.ts                         Meta Cloud API send + webhook parse
│   │   ├── gemini.ts                       Gemini text turn for the qualifying flow
│   │   ├── leads.ts                        SQLite reads/writes for conversations, messages, leads
│   │   ├── calls.ts                        SQLite reads/writes for call recordings
│   │   ├── stats.ts                        Aggregation queries
│   │   ├── audio-storage.ts                Disk save / stream / delete for audio files
│   │   ├── ai-call-analysis.ts             Gemini multimodal audio call (inline + Files API)
│   │   ├── phone-extract.ts                Regex to pull phone number from Android call-recording filenames
│   │   ├── notify.ts                       WhatsApp notification to salespeople on new lead
│   │   └── alert.ts                        Email alert via Resend on customer-facing errors
│   ├── prompts/
│   │   ├── system.ts                       The bot's brain (qualifying conversation)
│   │   └── call-analysis.ts                Gemini system instruction for call analysis
│   ├── middleware/
│   │   └── auth.ts                         Session preHandler hook
│   └── db/
│       ├── schema.ts                       Canonical CREATE TABLE for fresh installs
│       ├── migrations.ts                   Idempotent ALTER TABLE for existing DBs
│       └── client.ts                       better-sqlite3 singleton
├── web/                                    Frontend (Vite + React 19 + Tailwind 4)
│   ├── src/
│   │   ├── main.tsx                        React entry + router + 401 redirect listener
│   │   ├── App.tsx                         Shell with header, theme toggle, logout
│   │   ├── routes/
│   │   │   ├── login.tsx                   Editorial split-screen login (theme-locked)
│   │   │   ├── leads-list.tsx              Mobile-first lead cards + filters + search
│   │   │   ├── lead-detail.tsx             Identity + status + notes + WhatsApp transcript + calls section
│   │   │   └── stats.tsx                   Hero + volume + pipeline + industries + verdict distribution + top objections
│   │   ├── components/
│   │   │   ├── status-badge.tsx            6 lead-status badges (New/Contacted/Hot/Cold/Won/Lost)
│   │   │   ├── status-select.tsx           Native picker styled
│   │   │   ├── conversation-bubble.tsx     WhatsApp-style chat transcript
│   │   │   ├── auth-guard.tsx              Redirects to /login if /api/auth/me fails
│   │   │   ├── theme-toggle.tsx            Light/dark + persists
│   │   │   ├── call-uploader.tsx           File-picker for uploading call recordings
│   │   │   ├── calls-list.tsx              List of call cards with 5s polling while any is processing
│   │   │   ├── call-card.tsx               Expandable card: audio player + transcript + summary + verdict + actions
│   │   │   ├── audio-player.tsx            HTML5 audio with graceful "file missing" state
│   │   │   └── verdict-badge.tsx           4 call-verdict badges (Hot/Warm/Cold/Not interested)
│   │   ├── lib/
│   │   │   ├── api.ts                      Fetch wrapper + typed endpoints + 401 redirect dispatch
│   │   │   └── format.ts                   Time-ago, phone, title-case helpers
│   │   └── styles/globals.css              Tailwind theme + design tokens (dark-mode aware)
│   ├── vite.config.ts                      basename=/dashboard + dev proxy to :3000
│   └── package.json
├── data/                                   Persistent volume content (gitignored)
│   ├── leads.db                            SQLite database
│   └── audio/                              Call recordings, organised by phone subfolder
├── Dockerfile                              Multi-stage: backend build, frontend build, runtime
├── docker-compose.yml                      Local dev with volume mount
├── .env.example                            All env vars documented
├── .env                                    (gitignored) your actual secrets
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md                               This file
```

---

## How to test things end-to-end

### Bot reply
Send `Hii` from any phone (other than the bot's own number) to your business
WhatsApp number. Within ~5 seconds the bot replies asking if you're a
business owner. Walk through the flow → after the closing message a row
appears in the dashboard's leads list with status `New`.

### Reset a phone (e.g. yours, after testing)
```powershell
$cookies = "$env:TEMP\cookies.txt"
curl.exe -s -X POST "https://<your-domain>/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{\"password\":\"<DASHBOARD_PASSWORD>\"}' -c $cookies
curl.exe -s -X DELETE "https://<your-domain>/api/conversations/<phone>" -b $cookies
```

### Call recording flow
Open a lead in the dashboard → "Upload call recording" → pick an audio file
from your computer → wait 10–30 seconds → expand the call card to see the
AI verdict + transcript + summary.

### Auto-upload from a salesperson's phone
Install [Automate by LlamaLab](https://play.google.com/store/apps/details?id=com.llamalab.automate)
on the salesperson's Android phone. Build one flow:
1. **File observe** trigger → path = phone's call-recording folder (e.g. `/storage/emulated/0/Recordings/Call/`), event = "Modified"
2. **HTTP request** action → POST to `https://<your-domain>/api/calls/auto-upload`, header `Authorization: Bearer <AUTO_UPLOAD_TOKEN>`, multipart body with `audio` file + `filename` field

Recordings auto-upload as soon as the salesperson hangs up. Phone numbers
are extracted from the filename and matched against existing leads.

---

## Inspecting the production DB

In Easypanel → service → **Console** tab:

```sh
# Open the DB
sqlite3 /app/data/leads.db

# Useful queries
SELECT phone, state, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 10;
SELECT phone, name, industry, status FROM leads ORDER BY created_at DESC;
SELECT id, phone, status, verdict, duration_seconds FROM calls ORDER BY created_at DESC;
```

(If `sqlite3` isn't in the container, exec `apt-get install -y sqlite3` first.)

---

## Cost estimate (typical scale)

| Component | Per 100 leads/month, ~30 calls of 30 min | At 10× |
|---|---|---|
| Easypanel (your existing VPS) | already paid | already paid |
| Meta Cloud API (free tier) | ₹0 | ₹0 |
| Gemini 2.5 Flash (text qualification) | ~₹10 | ~₹100 |
| Gemini 2.5 Flash (audio analysis) | ~₹70 | ~₹700 |
| Resend (free 3,000/mo emails) | ₹0 | ₹0 |
| **Total marginal cost** | **~₹80/month** | **~₹800/month** |

Storage on the Easypanel volume covers SQLite + audio files. At ~100 calls/month
× ~5 MB Opus per call = ~500 MB/month, free until your VPS disk fills.
