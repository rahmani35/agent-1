"""Configuration loader for the FastAPI Gateway.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load root .env
root_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(root_dir / ".env")

# Google Cloud Settings
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_REGION", "europe-west3")
GCS_STAGING_BUCKET = os.getenv("GCS_STAGING_BUCKET")

# Model Settings
MODEL_NAME = os.getenv("MODEL_NAME", os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")

# Vector Store Settings
_ACTIVE_VECTOR_BACKEND = os.getenv("VECTOR_BACKEND", "firestore").lower()

def get_active_backend() -> str:
    global _ACTIVE_VECTOR_BACKEND
    return _ACTIVE_VECTOR_BACKEND

def set_active_backend(backend: str) -> str:
    global _ACTIVE_VECTOR_BACKEND
    norm = backend.lower().strip()
    if norm in ("cloudsql", "postgres", "pgvector"):
        _ACTIVE_VECTOR_BACKEND = "cloudsql"
    elif norm in ("firestore", "firebase"):
        _ACTIVE_VECTOR_BACKEND = "firestore"
    else:
        _ACTIVE_VECTOR_BACKEND = "firestore"
    return _ACTIVE_VECTOR_BACKEND

# Cloud SQL PostgreSQL settings
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
CLOUD_SQL_CONNECTION_NAME = os.getenv("CLOUD_SQL_CONNECTION_NAME")

# Firestore settings
FIRESTORE_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "document_chunks")
FIRESTORE_DATABASE = os.getenv("FIRESTORE_DATABASE", "(default)")

# Auth & Access Control
ALLOWED_USERS = [
    email.strip().lower()
    for email in os.getenv("ALLOWED_USERS", "").split(",")
    if email.strip()
]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Vertex AI Agent Engine resource
REASONING_ENGINE_ID = os.getenv("REASONING_ENGINE_ID", "")

# Server
PORT = int(os.getenv("PORT", "8084"))
