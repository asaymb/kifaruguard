# Kifaru Guard

Kifaru Guard is a local-first compliance workflow:

1. Upload PDF
2. Run Mine or Bank agent
3. Apply guardrails
4. Write audit trail
5. Send REVIEW cases to HITL queue

## Stack

- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Frontend: React + Vite + Tailwind
- LLM routing: Ollama (tinyllama) -> OpenAI (gpt-4o-mini) -> mock fallback

## Environment Variables

Copy `.env.example` to `.env` locally (never commit `.env`):

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `JWT_SECRET_KEY`
- `AUDIT_HMAC_SECRET` (signatures des lignes d’audit)
- `OPENAI_API_KEY` (optionnel, repli LLM)
- `RUNTIME_CONFIG_PATH`
- `PORT` (backend, ex. `8000` ; Railway injecte souvent `PORT` automatiquement)

## Run (dev)

```bash
docker compose up --build
```

## Run (light prod / Railway-like)

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

## Health Checks

- Backend: `GET /health`
- Ollama container: `ollama list`
- Frontend (Nginx): `GET /` on exposed frontend port

## Tests

Backend (pytest):

```bash
docker compose exec backend pytest -q
```

Frontend (Jest):

```bash
cd frontend && npm install && npm test
```

## Smoke test

```bash
python scripts/smoke_test.py
```

It verifies:

- auth login
- mine + bank run
- audit retrieval
- HITL retrieval

## Runtime configuration

Runtime config file: `config/runtime.yaml`

- Enable/disable agents
- Block status list for guardrails
- LLM routing parameters (models/timeouts/retries)

UI controls are available in Dashboard (Agent Controls + Guardrails).

## Railway deployment notes

- Backend runs on `${PORT}` (fallback `8000`).
- Frontend runs on Nginx with `${PORT}` (default `8080`).
- **GitHub**: push your branch; Railway builds from the connected repo.
- **Frontend → backend**: set `BACKEND_HOST` and `BACKEND_PORT` on the frontend service (private hostname of the API on Railway). See [docs/RAILWAY_GITHUB.md](docs/RAILWAY_GITHUB.md).
- Set secrets in Railway:
  - `JWT_SECRET_KEY`
  - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `OPENAI_API_KEY` (optional)
  - `AUDIT_HMAC_SECRET` (recommended)
- Runtime config file is mounted at `config/runtime.yaml`.
- API and WebSocket traffic can be routed via frontend Nginx (`/auth`, `/agents`, `/audit`, `/hitl`, `/config`, `/health`, `/ws/*`).

## API routes

- `POST /auth/login`
- `POST /agents/run`
- `GET /audit` (pagination + filters)
- `GET /hitl` (pagination + filters)
- `POST /hitl/{id}/approve`
- `POST /hitl/{id}/reject`
- `GET /config/runtime`
- `POST /config/agents`
- `POST /config/guardrails`
- `WS /ws/hitl`

## Production files

- `backend/Dockerfile` (multi-stage, `${PORT}` aware)
- `frontend/Dockerfile` (build + Nginx runtime)
- `frontend/nginx.conf` (SPA + API/WS proxy)
- `docker-compose.prod.yml` (Railway-like setup)
- `RELEASE_CHECKLIST.md` (go-live checklist)

## Non-technical guide: test one full agent flow

1. Open app on `http://localhost:8080`
2. Click **Login as admin**
3. Go to **Run Agent**
4. Select `mine` and upload a PDF
5. Click **Run**
6. Open **Audit Logs** and confirm step-by-step trace
7. For bank sanctions matches, open **HITL Queue** and approve/reject
8. Return to **Dashboard** to see monitoring counters
