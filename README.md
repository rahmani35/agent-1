# Agent-1 | Document Q&A (RAG) Agent

A production-ready Document Intelligence and Q&A Agent powered by Google ADK / Vertex AI Agent Engine, supporting two cost-effective GCP vector database backends:
1. **Cloud SQL for PostgreSQL (`pgvector` on `db-f1-micro`)** (~$8–$10/month)
2. **Cloud Firestore Vector Search** (Serverless pay-per-operation)

---

## Features

* **Multi-Format Ingestion:** Drag-and-drop parsing for PDF, Markdown (`.md`), and Plain Text (`.txt`, `.json`, `.csv`) with customizable chunk sizes and overlap.
* **Vector Similarity Search:** 768-dimensional embeddings generated with Google's `text-embedding-004`.
* **Dual Vector Store Architecture:** Switch seamlessly between **Cloud SQL** (relational + `pgvector` HNSW index) and **Firestore Vector Search** (k-NN) using `VECTOR_BACKEND=cloudsql|firestore`.
* **Grounded RAG Agent:** Google ADK Agent with a custom `search_documents` tool that retrieves context and synthesizes answers with source citations.
* **FastAPI Gateway:** Secure REST API with Google OAuth ID Token verification and email whitelist enforcement.
* **React 19 + Vite Frontend:** Modern UI with dark/light themes, drag-and-drop document manager, vector search sandbox, and multi-turn chat.

---

## Architecture

```
User -> [ React 19 Frontend ]
             |  (Bearer Google ID Token)
             v
        [ FastAPI Gateway (Cloud Run) ]
             |
             +---> [ Agent / Engine ] (Vertex AI Agent Engine or Local ADK Fallback)
             |          |
             |          +---> [ search_documents Tool ]
             |                     |
             +---------------------+
             |
             +---> Vector Backends:
                     ├── 1. Cloud SQL for PostgreSQL (pgvector HNSW cosine index)
                     └── 2. Cloud Firestore (Vector Search k-NN)
```

---

## Quick Start (Local Development)

### 1. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
Fill in your GCP project credentials:
* `GOOGLE_CLOUD_PROJECT=your-project-id`
* `GEMINI_API_KEY=your-gemini-api-key`
* `VECTOR_BACKEND=firestore` (or `cloudsql`)
* `ALLOWED_USERS=your-email@example.com`
* `GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com`

---

### 2. Setting Up the Vector Databases

#### Option A: Cloud SQL for PostgreSQL (pgvector on db-f1-micro)
1. Create a minimal Cloud SQL instance:
   ```bash
   gcloud sql instances create my-pg-instance \
       --database-version=POSTGRES_16 \
       --tier=db-f1-micro \
       --region=europe-west3 \
       --storage-size=10GB \
       --root-password="YourStrongPassword"
   ```
2. Start the Cloud SQL Auth Proxy locally:
   ```bash
   ./cloud-sql-proxy your-project:europe-west3:my-pg-instance --port 5432
   ```
3. Initialize the table schema and HNSW vector index:
   ```bash
   make init-cloudsql
   ```

#### Option B: Cloud Firestore Vector Search
1. Ensure Firestore is enabled in Native mode in your GCP project.
2. Firestore creates collections and stores vectors on the fly without schema migrations.
3. (Optional) Create a vector index using the Firebase CLI or Google Cloud Console for composite queries.

---

### 3. Run Backend & Frontend

#### Start the FastAPI Gateway:
```bash
make dev-backend
```
* API Documentation available at: [http://localhost:8083/docs](http://localhost:8083/docs)

#### Start the React UI:
```bash
make dev-frontend
```
* Web application available at: [http://localhost:5173](http://localhost:5173)

---

## Deployment to GCP

### 1. Deploy Agent to Vertex AI Agent Engine
```bash
make deploy-agent
```

### 2. Deploy Gateway to Google Cloud Run
```bash
make deploy-backend
```

### 3. Deploy Frontend to Firebase Hosting
```bash
make deploy-frontend
```
