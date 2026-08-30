"""Vector & Document Ingestion Service.

Coordinates document chunking, embedding generation, and vector store persistence.
"""

import uuid
from typing import List, Dict, Any, Optional
from agent.doc_loader import load_pdf_file, load_text_file, DocumentChunk
from agent.embeddings import get_embeddings, get_embedding
from agent.vector_store import get_vector_store, VectorStore
from .config import get_active_backend


class VectorService:
    """Service layer managing document ingestion and vector retrieval."""

    def __init__(self, backend_override: Optional[str] = None):
        self.backend_override = backend_override

    def _get_store(self) -> VectorStore:
        return get_vector_store(self.backend_override or get_active_backend())

    async def ingest_document(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "text/plain",
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> Dict[str, Any]:
        """Parse file, split into chunks, generate embeddings, and persist into vector store."""
        doc_id = str(uuid.uuid4())
        lower_name = filename.lower()

        # Step 1: Chunk document
        if lower_name.endswith(".pdf") or "pdf" in content_type:
            chunks = load_pdf_file(
                file_bytes=file_bytes,
                filename=filename,
                doc_id=doc_id,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
        else:
            text_str = file_bytes.decode("utf-8", errors="replace")
            chunks = load_text_file(
                text_content=text_str,
                filename=filename,
                doc_id=doc_id,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

        if not chunks:
            raise ValueError(f"No extractable text found in file '{filename}'.")

        # Step 2: Generate embeddings in batches
        chunk_texts = [c.content for c in chunks]
        embeddings = get_embeddings(chunk_texts)

        for chunk, emb in zip(chunks, embeddings):
            chunk.embedding = emb

        # Step 3: Store into active vector database
        store = self._get_store()
        saved_count = store.add_chunks(chunks)

        return {
            "doc_id": doc_id,
            "filename": filename,
            "chunk_count": saved_count,
            "status": "indexed",
        }

    def list_documents(self) -> List[Dict[str, Any]]:
        """List all indexed documents."""
        store = self._get_store()
        return store.list_documents()

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document and its chunks from the vector store."""
        store = self._get_store()
        return store.delete_document(doc_id)

    def search(
        self,
        query: str,
        top_k: int = 5,
        doc_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Direct vector similarity search."""
        query_embedding = get_embedding(query)
        if not query_embedding:
            return []

        store = self._get_store()
        return store.similarity_search(
            query_embedding=query_embedding,
            top_k=top_k,
            doc_id=doc_id,
        )

    def get_health(self) -> Dict[str, Any]:
        """Check vector store health."""
        store = self._get_store()
        return store.health_check()
