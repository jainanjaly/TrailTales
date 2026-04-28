# TrailTales

A travel diary web app: pin your trips on an interactive globe and open a per-trip
dashboard with photo/video gallery, memory notes, expenses, and a timeline.
Collaborators can contribute media via magic-link invites (no account required).

> Scope: Phases 1–7 are complete. The project is now moving into **Phase 8
> (Reel Generator)**. Public moodboards, print hand-book, UI revamp, AI
> itinerary planner, and production deployment are tracked in
> [ROADMAP.md](ROADMAP.md).

## Tech stack

- **Frontend**: React + Vite + TypeScript, `react-globe.gl`, React Query, Zustand, Axios
- **Backend**: Flask (app factory + blueprints), `flask-jwt-extended`, `pymongo`, `boto3`, `itsdangerous`, `flask-limiter`
- **Database**: MongoDB Atlas (free M0)
- **Storage**: AWS S3 (free tier), direct client uploads via presigned URLs
- **Email**: SendGrid SMTP (collaborator invite delivery)

## Repo layout

```
TrailTales/
├── client/          # React + Vite frontend
├── server/          # Flask API
├── ROADMAP.md       # Phase-by-phase plan
└── README.md
```

Each side has its own `.env.example`: copy `server/.env.example` → `server/.env`
and `client/.env.example` → `client/.env`, then fill in values.

## Quick start

### Prerequisites
- Node 20+, Python 3.11+
- A MongoDB connection string (Atlas M0 free tier works)
- AWS credentials scoped to a single S3 bucket with CORS enabled (Phase 3+)
- (Optional) A SendGrid API key for collaborator invite emails (Phase 7+)

### Server

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # then fill in values
python run.py
```

Server runs on `http://localhost:5000`.

### Client

```powershell
cd client
npm install
copy .env.example .env   # then fill in values
npm run dev
```

Client runs on `http://localhost:5173`.

## Environment variables

See [server/.env.example](server/.env.example) and
[client/.env.example](client/.env.example) for the full list. The most
important ones:

- `MONGO_URI` — MongoDB connection string
- `JWT_SECRET_KEY` — long random string
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` — Phase 3+
- `FRONTEND_ORIGIN` — CORS allowlist for the API
- `VITE_API_BASE_URL` — frontend API base (e.g. `http://localhost:5000/api`)
- `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` — SendGrid SMTP
  for collaborator invite emails (optional; if unset, the owner copies the
  invite link manually)

## Features

- **Globe homepage** — interactive 3D globe with pins for every trip.
- **Per-trip dashboard** — gallery, memory notes, expenses, and timeline.
- **Media uploads** — direct-to-S3 via presigned URLs, with categorized
  upload-error feedback (format / size / quota / network / server). Photos
  reuse the original via `object-fit: cover`; videos get a generated poster.
- **Memory notes** — controlled save (button + close + `beforeunload` guard),
  no debounced typing churn.
- **Expenses** — create / edit, single currency per trip, currency locked
  once expenses exist.
- **Magic-link collaborators** — owner emails per-guest invite links via
  SendGrid. Tokens are one-shot, sha256-hashed at rest, expire after 30 days,
  and revocable. Guests upload via `/contribute/:token` (no account); their
  submissions land as `pending-review` and surface in a moderation panel
  with accept / decline actions.

## Implementation status

- [x] Phase 0 — Scaffolding
- [x] Phase 1 — Auth + shell
- [x] Phase 2 — Globe + trips CRUD
- [x] Phase 3 — Media + notes (S3 presigned uploads)
- [x] Phase 4 — Expenses + timeline
- [x] Phase 5 — Functional improvements & bug fixes
- [x] Phase 6 — GitHub setup & collaboration
- [x] Phase 7 — Collaborator contributions (magic-link uploads + email)
- [ ] Phase 8 — Reel generator (auto storytelling)
- [ ] Phase 9 — AI itinerary planner
- [ ] Phase 10 — Public moodboard
- [ ] Phase 11 — Print hand-book
- [ ] Phase 12 — UI revamp
- [ ] Phase 13 — Final debugging + deployment
- [ ] Phase 14 — Prisma + SonarQube + GitHub Actions

See [ROADMAP.md](ROADMAP.md) for detailed scope per phase.
