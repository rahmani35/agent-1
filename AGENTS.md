# Agent-1 Monorepo Architecture & Invariants

## Repository Structure

```
agent-1/
├── agent/
│   ├── agent.py            # ADK RAG Agent with `search_documents` function tool
│   ├── doc_loader.py       # PDF, Markdown, and TXT chunking logic
│   ├── embeddings.py       # text-embedding-004 embedding generation
│   ├── vector_store.py     # CloudSqlPgVectorStore & FirestoreVectorStore
│   ├── deploy.py           # Vertex AI Agent Engine deployer
│   └── requirements.txt
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI routes + document upload/search
│   │   ├── auth.py         # Google ID token verification & whitelist
│   │   ├── config.py       # Environment configuration
│   │   ├── engine.py       # Session mapping, async stream handler & local fallback
│   │   └── vector_service.py # Ingestion & similarity search service
│   └── requirements.txt
├── frontend/
│   ├── src/{components,context,services}/
│   ├── vite.config.js      # Injects __APP_VERSION__ / __BUILD_SHA__
│   └── package.json
├── Dockerfile              # Gateway image. MUST stay at repo root
├── .dockerignore           # MUST stay at repo root
├── firebase.json           # Hosting config -> frontend/dist
├── Makefile                # Developer commands
└── .github/workflows/      # Deploy pipelines (agent, backend, frontend)
```

---

## Invariants

1. **`Dockerfile` and `.dockerignore` stay at the repository root.**
   `gcloud run deploy --source .` builds the Dockerfile located at the root of the source directory. The `COPY` commands bundle both `backend/` and `agent/`.

2. **The gateway container bundles `agent/`.**
   `backend/app/engine.py` imports `agent.agent`, and `backend/app/vector_service.py` imports `agent.vector_store` and `agent.embeddings`.

3. **Dual Vector Backend Support:**
   The active backend is controlled via `VECTOR_BACKEND=cloudsql` or `VECTOR_BACKEND=firestore`.
   - **Cloud SQL (`pgvector`)**: Runs on `db-f1-micro` or higher. Automatically executes `CREATE EXTENSION IF NOT EXISTS vector;` and builds HNSW cosine indexes on `document_chunks (embedding vector(768))`.
   - **Firestore Vector Search**: Uses Firestore `Vector` and `find_nearest` with `DistanceMeasure.COSINE`.

4. **Async Non-Blocking Stream Collection:**
   Never await `async_stream_query` directly on the main event loop. Buffer with `asyncio.to_thread(_collect_stream_sync, ...)` to prevent event loop blocking.

5. **Google ID Token Authentication:**
   The Google ID token is verified against `GOOGLE_CLIENT_ID` and emails are checked against `ALLOWED_USERS`.

---

## Commands

```bash
make dev-backend      # uvicorn backend.app.main:app --port 8083 --reload
make dev-frontend     # vite dev server on :5173
make build-frontend   # compile production frontend
make test-agent       # smoke test agent
make deploy-agent     # deploy to Vertex AI Agent Engine
make deploy-backend   # deploy to Google Cloud Run
make deploy-frontend  # deploy to Firebase Hosting
make init-cloudsql    # initialize Cloud SQL pgvector tables and HNSW index
```
