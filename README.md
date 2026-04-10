# Kifaru Guard

Plateforme de **gouvernance d’agents** avec audit, garde-fous et file d’attente **HITL** (humain dans la boucle), orientée conformité.

En quelques minutes vous pouvez :

1. Lancer la stack locale avec **Docker** (Postgres + Ollama + API + frontend).
2. Déployer l’API sur **Railway** sans modifier le code (variables d’environnement uniquement).

---

## Architecture

| Composant | Rôle |
|-----------|------|
| **Backend** | FastAPI, SQLAlchemy, PostgreSQL |
| **Frontend** | React, Vite, Tailwind, Nginx (proxy API) |
| **LLM** | Voir section *Comportement LLM* ci-dessous |

---

## Comportement LLM (environnement)

La configuration est centralisée dans `backend/app/core/config.py` et `backend/app/core/llm_service.py`.

| `ENVIRONMENT` | Ollama (par défaut) | Ordre d’appel |
|---------------|---------------------|----------------|
| `development` | Activé | Ollama → OpenAI (si clé) → réponse de repli sûre |
| `production`  | Désactivé | OpenAI (si clé) → réponse de repli sûre |

Surcharge explicite : **`OLLAMA_ENABLED=1`** ou **`0`** (prioritaire sur la dérivation ci-dessus).

Sur **Railway**, définissez `ENVIRONMENT=production` et **`OPENAI_API_KEY`** pour un LLM externe ; sans clé, l’API renvoie un message de repli contrôlé (pas d’appel Ollama).

---

## Démarrage local (Docker)

### Prérequis

- Docker + Docker Compose v2

### Commande unique (développement avec Ollama)

```bash
docker compose up --build
```

- **Frontend** : http://localhost:8080  
- **API** : http://localhost:8000  
- **Santé API** : `GET http://localhost:8000/health`

Les services **postgres** et **ollama** ont des *healthchecks* ; le **backend** attend Postgres (script `scripts/wait_for_db.py`) et ne démarre qu’après base joignable. Le **frontend** attend un backend sain.

### Profil « proche production » (sans Ollama)

Même logique que Railway côté LLM : pas d’Ollama, OpenAI ou repli.

```bash
copy .env.example .env   # Windows — éditer JWT_SECRET_KEY, AUDIT_HMAC_SECRET, ALLOWED_ORIGINS
docker compose -f docker-compose.prod.yml --env-file .env up --build
```

---

## Variables d’environnement

Le fichier **`.env.example`** à la racine décrit toutes les variables. Résumé :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | Oui en **production** | URL SQLAlchemy + psycopg2 |
| `JWT_SECRET_KEY` | Oui | Signature JWT |
| `AUDIT_HMAC_SECRET` | Oui | Intégrité des lignes d’audit |
| `ENVIRONMENT` | Recommandé | `development` ou `production` |
| `ALLOWED_ORIGINS` | Recommandé | Origines CORS (séparées par `,`) |
| `OPENAI_API_KEY` | Recommandé en prod | LLM cloud si Ollama désactivé |
| `OLLAMA_ENABLED` | Non | Forcer Ollama on/off |
| `RUNTIME_CONFIG_PATH` | Non | Défaut `/app/config/runtime.yaml` |
| `PORT` | Non | Port d’écoute (Railway injecte souvent `PORT`) |

**Frontend (build)** : `VITE_API_BASE_URL` — laisser **vide** en Docker pour utiliser le proxy Nginx (même origine). Voir `frontend/.env.example`.

---

## Déploiement Railway

1. **Backend** : même dépôt, **Root directory** = racine du repo, Dockerfile **`Dockerfile.backend`** (voir `railway.json`).
2. Variables minimales : `DATABASE_URL` (format `postgresql+psycopg2://...`), `JWT_SECRET_KEY`, `AUDIT_HMAC_SECRET`, `ENVIRONMENT=production`, `ALLOWED_ORIGINS`, `OPENAI_API_KEY` (fortement recommandé).
3. **Démarrage** : l’image exécute `wait_for_db`, `seed_data`, puis  
   `uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}`  
   (le module d’application est **`backend.app.main`**, pas `app.main` à la racine).
4. **Frontend** : service séparé, `frontend/Dockerfile`, variables `BACKEND_HOST` / `BACKEND_PORT` (réseau privé Railway).

Détails complémentaires : [docs/RAILWAY_GITHUB.md](docs/RAILWAY_GITHUB.md).

---

## Structure utile du dépôt

```
backend/app/core/config.py      # Configuration centralisée
backend/app/core/llm_service.py # Fournisseurs Ollama / OpenAI / repli
config/runtime.yaml             # Agents, garde-fous, paramètres LLM YAML
docker-compose.yml              # Dev local + Ollama
docker-compose.prod.yml         # Stack sans Ollama
Dockerfile.backend              # Image API (Railway / build explicite)
scripts/wait_for_db.py          # Attente Postgres au démarrage
```

---

## Tests

**Backend** (dans le conteneur ou venv avec dépendances) :

```bash
docker compose exec backend pytest -q
```

**Frontend** :

```bash
cd frontend && npm ci && npm test
```

---

## Smoke test

```bash
python scripts/smoke_test.py
```

---

## Journalisation au démarrage (API)

Au démarrage réussi, les logs incluent notamment :

- `environment` (valeur de `ENVIRONMENT`)
- `database=connected`
- `llm=...` et `ollama_enabled=true|false`

---

## Parcours utilisateur (démo)

1. Ouvrir http://localhost:8080  
2. Se connecter (admin démo en développement si `ALLOW_ADMIN_SEED=1`)  
3. **Run Agent** — PDF  
4. **Audit logs** / **Case** / **HITL** selon le résultat  

---

## Fichiers de référence

- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) — checklist mise en production  
- [docs/RAILWAY_GITHUB.md](docs/RAILWAY_GITHUB.md) — Railway pas à pas  
