# Déployer Kifaru Guard sur Railway (GitHub)

Railway déploie à partir du code **poussé sur GitHub**. Chaque **push** sur la branche configurée redéploie (selon les réglages du projet).

## Prérequis

1. Repo GitHub à jour (`git push`).
2. **Aucun secret** dans le dépôt : utiliser les **Variables** Railway.

## Architecture recommandée (4 services)

Même dépôt, **4 services** distincts :

| Service    | Source build | Fichier Dockerfile   | Port public typique |
|-----------|----------------|----------------------|----------------------|
| Backend   | GitHub         | **`Dockerfile.backend`** (racine) **ou** `backend/Dockerfile` | celui fourni par Railway (`PORT`) |

**Backend — important :** **Root directory = vide** (racine du repo). Si tu mets `backend/`, l’image n’a plus de dossier `backend` sous `/app` → erreur `No module named 'backend'`. Avec `Dockerfile.backend`, les `COPY` explicites évitent ce piège tant que la racine du repo est le contexte.
| Frontend  | GitHub         | `frontend/Dockerfile`| `8080` (variable `PORT` dans l’image Nginx) |
| Postgres  | Plugin Railway | —                    | interne              |
| Ollama    | Image Docker   | `ollama/ollama`      | interne (`11434`)    |

Dans Railway : **New** → **Database** → PostgreSQL, puis **New** → **GitHub Repo** pour backend et frontend, puis **Empty service** ou **Docker** pour Ollama.

## Variables d’environnement

### Backend

- `PORT` — laissé vide ou égal au port Railway (souvent injecté automatiquement).
- `DATABASE_URL` — URL SQLAlchemy, ex. `postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DBNAME` (fournie par le plugin Postgres, adaptée si besoin).
- `JWT_SECRET_KEY` — secret long et aléatoire.
- `AUDIT_HMAC_SECRET` — secret dédié aux signatures d’audit (recommandé).
- `OPENAI_API_KEY` — optionnel (fallback LLM).
- `RUNTIME_CONFIG_PATH=/app/config/runtime.yaml`

Ajuster `config/runtime.yaml` (volume ou édition post-déploiement) pour l’URL Ollama interne, par ex. :

```yaml
llm:
  local:
    url: http://<nom-service-ollama>:11434/api/generate
    model: tinyllama
```

Remplace `<nom-service-ollama>` par le **hostname interne** du service Ollama sur Railway (souvent le nom du service dans le projet, ex. `ollama` si tu l’as nommé ainsi).

### Frontend (Nginx reverse proxy)

Le frontend proxifie `/auth`, `/agents`, `/audit`, `/hitl`, `/config`, `/health` et `/ws/` vers l’API. Il faut indiquer **où** se trouve le backend sur le réseau privé Railway :

- `PORT=8080` (ou le port exposé par Railway pour le frontend).
- `BACKEND_HOST` — hostname **interne** du service backend (ex. celui affiché dans Railway pour la communication privée entre services, souvent dérivé du nom du service).
- `BACKEND_PORT` — port sur lequel le backend écoute **à l’intérieur** du conteneur (souvent `8000`, ou la valeur de `PORT` du backend si tu l’alignes sur 8000).

Exemple si le service s’appelle `backend` sur le réseau Docker Compose : `BACKEND_HOST=backend`, `BACKEND_PORT=8000`.  
Sur Railway, mets `BACKEND_HOST` / `BACKEND_PORT` pour correspondre au **private networking** de ton projet (noms affichés dans le dashboard).

## Checklist rapide

- [ ] Postgres créé, `DATABASE_URL` copiée / adaptée pour le backend.
- [ ] Backend : Dockerfile `backend/Dockerfile`, variables ci-dessus.
- [ ] Ollama : image officielle, commande de `pull` du modèle (ex. `tinyllama`), même réseau que le backend.
- [ ] Frontend : Dockerfile `frontend/Dockerfile`, `BACKEND_HOST` / `BACKEND_PORT` corrects.
- [ ] `GET /health` sur l’URL publique du backend (ou via le frontend si tout passe par le proxy).
- [ ] Smoke test depuis ta machine : `BASE_URL=https://<url-backend-publique> python scripts/smoke_test.py`

## Pourquoi `BACKEND_HOST` ?

En local, Docker Compose donne le nom DNS `backend`. Sur Railway, ce nom n’existe pas : il faut le hostname interne du service API. Sans cela, Nginx ne peut pas joindre l’API.
