# Kifaru Guard Release Checklist

## Platform & Ports
- [ ] Backend listens on `${PORT}` (fallback `8000`) and is reachable.
- [ ] Frontend container listens on `${PORT}` (default `8080`) via Nginx.
- [ ] Railway service port mapping is configured.
- [ ] Frontend has `BACKEND_HOST` / `BACKEND_PORT` set to the backend’s **private** hostname and port (not `backend` unless that is your actual Railway service name on the private network).

## Secrets & Environment
- [ ] `JWT_SECRET_KEY` set as secret.
- [ ] `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` set.
- [ ] `OPENAI_API_KEY` set (optional; fallback still works without it).
- [ ] `RUNTIME_CONFIG_PATH` set (`/app/config/runtime.yaml`).
- [ ] `AUDIT_HMAC_SECRET` set (recommended for production audit signatures).

## Health & Observability
- [ ] `/health` responds `200` when DB is available.
- [ ] Backend logs stream to stdout/stderr (Railway log viewer).
- [ ] Backend healthcheck passes in compose/prod.
- [ ] Ollama healthcheck (`ollama list`) passes.

## LLM Routing & Fallback
- [ ] Local LLM (tinyllama) responds in production.
- [ ] OpenAI fallback works when local fails.
- [ ] Final mock fallback returns `Unable to process request safely`.
- [ ] Runtime model routing is configurable from `config/runtime.yaml`.

## Security & Validation
- [ ] JWT protects operational endpoints.
- [ ] Input sanitization is active for audit persistence.
- [ ] PDF upload and `file_path` validation are enforced.
- [ ] Audit trail includes HMAC signature in persisted output.

## Runtime Config & Guardrails
- [ ] Agent toggles work from Dashboard (`mine`, `bank`).
- [ ] Guardrails dynamic statuses are editable from UI.
- [ ] Runtime config endpoints:
  - [ ] `GET /config/runtime`
  - [ ] `POST /config/agents`
  - [ ] `POST /config/guardrails`

## HITL & Realtime
- [ ] `WS /ws/hitl` works behind reverse proxy.
- [ ] HITL updates broadcast on create/approve/reject.

## Testing
- [ ] Backend tests pass: `pytest -q`.
- [ ] Frontend tests pass: `npm test`.
- [ ] Smoke test passes: `python scripts/smoke_test.py`.
- [ ] End-to-end workflow validated: upload PDF -> agent -> guardrail -> audit -> HITL.

## Docker & Volumes
- [ ] `docker-compose.prod.yml` starts all required services.
- [ ] Persistent volumes mounted for:
  - [ ] `data/`
  - [ ] `config/`
  - [ ] `logs/`
  - [ ] PostgreSQL data
  - [ ] Ollama model cache

## Commands (Railway-friendly)
- [ ] Dev: `docker compose up --build`
- [ ] Prod: `docker compose -f docker-compose.prod.yml --env-file .env up --build -d`
