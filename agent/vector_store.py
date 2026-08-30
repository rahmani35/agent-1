"""Vector store abstraction layer supporting:
1. Cloud SQL for PostgreSQL (pgvector on db-f1-micro)
2. Cloud Firestore Vector Search (serverless k-NN)
"""

import json
import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

from .doc_loader import DocumentChunk

load_dotenv()


class VectorStore(ABC):
    """Abstract interface for Vector Stores."""

    @abstractmethod
    def init_db(self) -> None:
        """Initialize database schema, tables, or collections."""
        pass

    @abstractmethod
    def add_chunks(self, chunks: List[DocumentChunk]) -> int:
        """Store document chunks and their embedding vectors."""
        pass

    @abstractmethod
    def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        doc_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Find the top-k most similar document chunks to the query vector."""
        pass

    @abstractmethod
    def list_documents(self) -> List[Dict[str, Any]]:
        """List all unique documents and their chunk counts."""
        pass

    @abstractmethod
    def delete_document(self, doc_id: str) -> bool:
        """Delete all chunks belonging to a document."""
        pass

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """Verify vector store connectivity and readiness."""
        pass


# ==============================================================================
# 1. Cloud SQL for PostgreSQL with pgvector
# ==============================================================================

class CloudSqlPgVectorStore(VectorStore):
    """PostgreSQL Vector Store using pgvector extension (optimized for db-f1-micro)."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        connection_name: Optional[str] = None,
    ):
        self.host = host or os.getenv("DB_HOST", "127.0.0.1")
        self.port = int(port or os.getenv("DB_PORT", "5432"))
        self.database = database or os.getenv("DB_NAME", "postgres")
        self.user = user or os.getenv("DB_USER", "postgres")
        self.password = password or os.getenv("DB_PASSWORD") or os.getenv("DB_PASS", "")
        self.connection_name = connection_name or os.getenv("CLOUD_SQL_CONNECTION_NAME")

    def _get_connection(self):
        import psycopg
        from pgvector.psycopg import register_vector

        try:
            connect_kwargs = {
                "host": self.host,
                "port": self.port,
                "dbname": self.database,
                "user": self.user,
                "password": self.password,
                "autocommit": True,
                "connect_timeout": 10,
            }
            # Automatically require SSL for remote hosts (e.g. Supabase, Neon, AWS RDS)
            if self.host not in ("127.0.0.1", "localhost") and not self.host.startswith("/"):
                connect_kwargs["sslmode"] = os.getenv("DB_SSLMODE", "require")

            conn = psycopg.connect(**connect_kwargs)
            try:
                register_vector(conn)
            except Exception:
                # Extension might not be created in this database yet
                with conn.cursor() as cur:
                    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                register_vector(conn)
            return conn
        except Exception as exc:
            raise ConnectionError(
                f"Cloud SQL / PostgreSQL connection failed on {self.host}:{self.port} (database: '{self.database}', user: '{self.user}').\n"
                "If connecting to Cloud SQL, start the Cloud SQL Auth Proxy: './cloud-sql-proxy <instance-connection-name> --port 5432'\n"
                f"Underlying error: {exc}"
            ) from exc

    def init_db(self) -> None:
        """Create pgvector extension and document_chunks table with HNSW index."""
        import psycopg

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS document_chunks (
                        id TEXT PRIMARY KEY,
                        doc_id TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        chunk_index INT NOT NULL,
                        content TEXT NOT NULL,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        embedding vector(768),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
                # Create HNSW index for fast approximate nearest neighbor search
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS doc_chunks_embedding_hnsw_idx 
                    ON document_chunks USING hnsw (embedding vector_cosine_ops);
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS doc_chunks_doc_id_idx 
                    ON document_chunks (doc_id);
                    """
                )
        finally:
            conn.close()

    def add_chunks(self, chunks: List[DocumentChunk]) -> int:
        if not chunks:
            return 0

        self.init_db()
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                for chunk in chunks:
                    meta_json = json.dumps(chunk.metadata or {})
                    emb = chunk.embedding
                    cur.execute(
                        """
                        INSERT INTO document_chunks (id, doc_id, filename, chunk_index, content, metadata, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            metadata = EXCLUDED.metadata,
                            embedding = EXCLUDED.embedding;
                        """,
                        (
                            chunk.chunk_id,
                            chunk.doc_id,
                            chunk.filename,
                            chunk.chunk_index,
                            chunk.content,
                            meta_json,
                            emb,
                        ),
                    )
            return len(chunks)
        finally:
            conn.close()

    def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        doc_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                if doc_id:
                    cur.execute(
                        """
                        SELECT id, doc_id, filename, chunk_index, content, metadata,
                               (1 - (embedding <=> %s::vector)) AS score
                        FROM document_chunks
                        WHERE doc_id = %s AND embedding IS NOT NULL
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s;
                        """,
                        (query_embedding, doc_id, query_embedding, top_k),
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, doc_id, filename, chunk_index, content, metadata,
                               (1 - (embedding <=> %s::vector)) AS score
                        FROM document_chunks
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s;
                        """,
                        (query_embedding, query_embedding, top_k),
                    )

                results = []
                for row in cur.fetchall():
                    results.append({
                        "id": row[0],
                        "doc_id": row[1],
                        "filename": row[2],
                        "chunk_index": row[3],
                        "content": row[4],
                        "metadata": row[5] if isinstance(row[5], dict) else json.loads(row[5] or "{}"),
                        "score": float(row[6]) if row[6] is not None else 0.0,
                    })
                return results
        finally:
            conn.close()

    def list_documents(self) -> List[Dict[str, Any]]:
        self.init_db()
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT doc_id, filename, COUNT(*) as chunk_count, MAX(created_at) as uploaded_at
                    FROM document_chunks
                    GROUP BY doc_id, filename
                    ORDER BY uploaded_at DESC;
                    """
                )
                docs = []
                for row in cur.fetchall():
                    docs.append({
                        "doc_id": row[0],
                        "filename": row[1],
                        "chunk_count": int(row[2]),
                        "uploaded_at": str(row[3]),
                    })
                return docs
        finally:
            conn.close()

    def delete_document(self, doc_id: str) -> bool:
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM document_chunks WHERE doc_id = %s;", (doc_id,))
                return True
        finally:
            conn.close()

    def health_check(self) -> Dict[str, Any]:
        try:
            conn = self._get_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
            conn.close()
            return {"backend": "cloudsql", "status": "connected", "database": self.database}
        except Exception as e:
            return {"backend": "cloudsql", "status": "error", "error": str(e)}


# ==============================================================================
# 2. Cloud Firestore Vector Search (Serverless k-NN)
# ==============================================================================

class FirestoreVectorStore(VectorStore):
    """Firestore Vector Store using native Vector and find_nearest search."""

    def __init__(
        self,
        collection_name: Optional[str] = None,
        project_id: Optional[str] = None,
        database: Optional[str] = None,
    ):
        self.collection_name = collection_name or os.getenv("FIRESTORE_COLLECTION", "document_chunks")
        self.project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        self.database = database or os.getenv("FIRESTORE_DATABASE", "(default)")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google.cloud import firestore

            if self.project_id:
                self._client = firestore.Client(project=self.project_id, database=self.database)
            else:
                self._client = firestore.Client(database=self.database)
        return self._client

    def init_db(self) -> None:
        """Firestore does not require DDL schema setup."""
        pass

    def add_chunks(self, chunks: List[DocumentChunk]) -> int:
        if not chunks:
            return 0

        from google.cloud.firestore_v1.vector import Vector

        db = self._get_client()
        batch = db.batch()
        batch_size = 0
        total_saved = 0

        for chunk in chunks:
            doc_ref = db.collection(self.collection_name).document(chunk.chunk_id)
            data = {
                "doc_id": chunk.doc_id,
                "chunk_id": chunk.chunk_id,
                "filename": chunk.filename,
                "chunk_index": chunk.chunk_index,
                "content": chunk.content,
                "metadata": chunk.metadata or {},
                "created_at": firestore_timestamp(),
            }
            if chunk.embedding:
                data["embedding"] = Vector(chunk.embedding)

            batch.set(doc_ref, data)
            batch_size += 1

            # Firestore batch limit is 500 operations
            if batch_size >= 400:
                batch.commit()
                total_saved += batch_size
                batch = db.batch()
                batch_size = 0

        if batch_size > 0:
            batch.commit()
            total_saved += batch_size

        return total_saved

    def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        doc_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        from google.cloud.firestore_v1.vector import Vector
        from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

        db = self._get_client()
        coll = db.collection(self.collection_name)

        if doc_id:
            query = coll.where(filter=firestore_filter("doc_id", "==", doc_id))
        else:
            query = coll

        try:
            # Firestore Vector Search using find_nearest
            vector_query = query.find_nearest(
                vector_field="embedding",
                query_vector=Vector(query_embedding),
                distance_measure=DistanceMeasure.COSINE,
                limit=top_k,
                distance_result_field="distance",
            )
            docs = vector_query.get()
            results = []
            for d in docs:
                doc_data = d.to_dict()
                dist = doc_data.get("distance", 0.0)
                # For cosine distance: similarity = 1 - distance
                score = max(0.0, 1.0 - float(dist)) if dist is not None else 0.0
                results.append({
                    "id": d.id,
                    "doc_id": doc_data.get("doc_id"),
                    "filename": doc_data.get("filename"),
                    "chunk_index": doc_data.get("chunk_index"),
                    "content": doc_data.get("content", ""),
                    "metadata": doc_data.get("metadata", {}),
                    "score": score,
                })
            return results
        except Exception as err:
            # Fallback: In-memory cosine similarity if Firestore Vector Index is still building
            return self._fallback_in_memory_search(query_embedding, top_k, doc_id)

    def _fallback_in_memory_search(
        self, query_embedding: List[float], top_k: int, doc_id: Optional[str]
    ) -> List[Dict[str, Any]]:
        """Fallback in-memory cosine search across collection."""
        import math

        db = self._get_client()
        coll = db.collection(self.collection_name)
        query = coll.where(filter=firestore_filter("doc_id", "==", doc_id)) if doc_id else coll
        docs = query.limit(200).get()

        scored = []
        for d in docs:
            data = d.to_dict()
            vec = data.get("embedding")
            if vec is not None:
                # vec can be Vector object or list
                vec_list = list(vec) if hasattr(vec, "__iter__") else []
                if len(vec_list) == len(query_embedding):
                    dot = sum(a * b for a, b in zip(vec_list, query_embedding))
                    norm_a = math.sqrt(sum(a * a for a in vec_list))
                    norm_b = math.sqrt(sum(b * b for b in query_embedding))
                    score = dot / (norm_a * norm_b) if (norm_a and norm_b) else 0.0
                    scored.append((score, d.id, data))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, doc_key, data in scored[:top_k]:
            results.append({
                "id": doc_key,
                "doc_id": data.get("doc_id"),
                "filename": data.get("filename"),
                "chunk_index": data.get("chunk_index"),
                "content": data.get("content", ""),
                "metadata": data.get("metadata", {}),
                "score": float(score),
            })
        return results

    def list_documents(self) -> List[Dict[str, Any]]:
        db = self._get_client()
        docs = db.collection(self.collection_name).select(["doc_id", "filename", "created_at"]).stream()

        doc_map: Dict[str, Dict[str, Any]] = {}
        for d in docs:
            data = d.to_dict()
            doc_id = data.get("doc_id")
            if not doc_id:
                continue
            if doc_id not in doc_map:
                doc_map[doc_id] = {
                    "doc_id": doc_id,
                    "filename": data.get("filename", "untitled"),
                    "chunk_count": 0,
                    "uploaded_at": str(data.get("created_at", "")),
                }
            doc_map[doc_id]["chunk_count"] += 1

        return list(doc_map.values())

    def delete_document(self, doc_id: str) -> bool:
        db = self._get_client()
        docs = db.collection(self.collection_name).where(filter=firestore_filter("doc_id", "==", doc_id)).stream()
        batch = db.batch()
        count = 0
        for d in docs:
            batch.delete(d.reference)
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        if count > 0:
            batch.commit()
        return True

    def health_check(self) -> Dict[str, Any]:
        try:
            db = self._get_client()
            _ = list(db.collection(self.collection_name).limit(1).stream())
            return {
                "backend": "firestore",
                "status": "connected",
                "collection": self.collection_name,
                "project": self.project_id or "default",
            }
        except Exception as e:
            return {"backend": "firestore", "status": "error", "error": str(e)}


def firestore_timestamp():
    from google.cloud import firestore
    return firestore.SERVER_TIMESTAMP


def firestore_filter(field_name: str, op_string: str, value: Any):
    from google.cloud.firestore_v1.base_query import FieldFilter
    return FieldFilter(field_name, op_string, value)


# ==============================================================================
# Vector Store Factory
# ==============================================================================

def get_vector_store(backend: Optional[str] = None) -> VectorStore:
    """Instantiate and return the configured VectorStore."""
    selected_backend = (backend or os.getenv("VECTOR_BACKEND", "firestore")).lower().strip()

    if selected_backend in ("cloudsql", "postgres", "pgvector"):
        return CloudSqlPgVectorStore()
    elif selected_backend in ("firestore", "firebase"):
        return FirestoreVectorStore()
    else:
        # Default to Firestore
        return FirestoreVectorStore()
