# TrailTales

A travel diary web app: pin your trips on an interactive globe and open a per-trip
dashboard with photo/video gallery, memory notes, expenses, and a timeline.
Collaborators can contribute media via magic links (no account required).

> Scope: Phases 1–4 (MVP) are complete. The project is now in **Phase 5
> (stabilization & UX fixes)**. UI revamp, magic-link uploads, AI itinerary
> planner, and production deployment are tracked in [ROADMAP.md](ROADMAP.md).

## Tech stack

- **Frontend**: React + Vite + TypeScript, `react-globe.gl`, React Query, Zustand, Axios
- **Backend**: Flask (app factory + blueprints), `flask-jwt-extended`, `pymongo`, `boto3`, `itsdangerous`, `flask-limiter`
- **Database**: MongoDB Atlas (free M0)
- **Storage**: AWS S3 (free tier), direct client uploads via presigned URLs

## Repo layout

```
TrailTales/
├── client/          # React + Vite frontend
├── server/          # Flask API
├── .env.example     # Copy to server/.env and client/.env
└── README.md
```

## Quick start

### Prerequisites
- Node 20+, Python 3.11+
- A MongoDB connection string (Atlas M0 free tier works)
- AWS credentials scoped to a single S3 bucket with CORS enabled (needed from Phase 3 onward)

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

See [.env.example](.env.example) for the full list. The most important ones:

- `MONGO_URI` — MongoDB connection string
- `JWT_SECRET_KEY` — long random string
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` — used from Phase 3
- `FRONTEND_ORIGIN` — CORS allowlist for the API
- `VITE_API_BASE_URL` — frontend API base (e.g. `http://localhost:5000/api`)

## Implementation status

- [x] Phase 0 — Scaffolding
- [x] Phase 1 — Auth + shell
- [x] Phase 2 — Globe + trips CRUD
- [x] Phase 3 — Media + notes (S3 presigned uploads)
- [x] Phase 4 — Expenses + timeline
- [x] Phase 5 — Functional improvements & bug fixes (memory save, upload errors, S3 cleanup, expense edit, currency)
- [ ] Phase 6 — GitHub setup & collaboration
- [ ] Phase 7 — UI revamp (Lovable)
- [ ] Phase 8 — Collaborator magic-link uploads
- [ ] Phase 9 — AI itinerary planner
- [ ] Phase 10 — Final polish & deployment

See [ROADMAP.md](ROADMAP.md) for detailed scope per phase.
