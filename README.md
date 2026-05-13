# WhatsApp Lead-Qualification Bot (Phase 1)

AI-driven WhatsApp bot that greets every Meta-ad-driven inbound message, filters out job-seekers, qualifies real business owners, collects 4 fields (name, industry, team size, website/social), and stores qualified leads in SQLite.

Built with: **TypeScript + Fastify + Meta Cloud API + Gemini 2.5 Flash + SQLite (better-sqlite3)**.

Full design is in [`../.claude/plans/hello-how-are-you-immutable-octopus.md`](../.claude/plans/hello-how-are-you-immutable-octopus.md).

## Local development

```powershell
# 1. Copy env template and fill in real values
copy .env.example .env

# 2. Install deps
npm install

# 3. Run in dev mode (hot reload)
npm run dev
```

In a second terminal, expose the local server to Meta via ngrok:

```powershell
ngrok http 3000
```

Then in Meta Business Suite > WhatsApp > Configuration:
- Callback URL: `https://<your-ngrok-subdomain>.ngrok-free.app/webhook`
- Verify token: same value as `META_VERIFY_TOKEN` in your `.env`
- Subscribe to the `messages` field.

Send yourself a WhatsApp message and watch the logs.

## Production build

```powershell
npm run build
npm start
```

## Deployment (Easypanel)

1. Push this repo to GitHub.
2. In Easypanel: New Service → App → connect the GitHub repo.
3. Build pack: `Dockerfile`.
4. Add a persistent volume mounted at `/app/data` (so the SQLite file survives redeploys).
5. Set environment variables (same keys as `.env.example`).
6. Expose port 3000 and attach a domain. Easypanel handles HTTPS via Let's Encrypt.
7. In Meta Business Suite, point the webhook to `https://<your-domain>/webhook`.

## Files of interest

| Path | What it does |
|---|---|
| `src/prompts/system.ts` | **The bot's brain.** Tune the conversation here. Contains TODO placeholders you must fill in (response window + short pitch). |
| `src/routes/webhook.ts` | Handles Meta verify (`GET /webhook`) and incoming messages (`POST /webhook`). |
| `src/services/gemini.ts` | Calls Gemini with structured-JSON output. |
| `src/services/meta.ts` | Sends WhatsApp messages via Meta Cloud API. |
| `src/services/leads.ts` | All SQLite reads/writes. |
| `src/db/schema.sql` | Database tables: `conversations`, `messages`, `leads`. |

## Inspecting the DB

```powershell
# After messages arrive, peek at the leads table:
npx sqlite3 ./data/leads.db "SELECT * FROM leads;"
```
