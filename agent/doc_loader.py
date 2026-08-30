"""Document parsing and chunking module.

Supports PDF, Markdown, and Plain Text files.
"""

import io
import re
import uuid
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class DocumentChunk:
    doc_id: str
    chunk_id: str
    filename: str
    content: str
    chunk_index: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None


def chunk_text(
    text: str,
    doc_id: str,
    filename: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
    base_metadata: Optional[Dict[str, Any]] = None,
) -> List[DocumentChunk]:
    """Split a continuous text string into overlapping chunks."""
    base_meta = base_metadata or {}
    # Normalize whitespace
    clean_text = re.sub(r"\r\n|\r", "\n", text).strip()
    if not clean_text:
        return []

    # Paragraph-based or fixed-length chunking
    paragraphs = clean_text.split("\n\n")
    chunks_text: List[str] = []
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current_chunk) + len(para) + 2 <= chunk_size:
            current_chunk = f"{current_chunk}\n\n{para}".strip()
        else:
            if current_chunk:
                chunks_text.append(current_chunk)
            # If a single paragraph is longer than chunk_size, split by sentences or hard slice
            if len(para) > chunk_size:
                start = 0
                while start < len(para):
                    end = min(start + chunk_size, len(para))
                    chunks_text.append(para[start:end])
                    start += chunk_size - chunk_overlap
                current_chunk = ""
            else:
                current_chunk = para

    if current_chunk:
        chunks_text.append(current_chunk)

    chunks: List[DocumentChunk] = []
    for idx, c_text in enumerate(chunks_text):
        chunk_obj = DocumentChunk(
            doc_id=doc_id,
            chunk_id=f"{doc_id}_chunk_{idx}",
            filename=filename,
            content=c_text,
            chunk_index=idx,
            metadata={
                **base_meta,
                "filename": filename,
                "chunk_index": idx,
                "total_chunks": len(chunks_text),
                "char_count": len(c_text),
            },
        )
        chunks.append(chunk_obj)

    return chunks


def load_pdf_file(
    file_bytes: bytes,
    filename: str,
    doc_id: Optional[str] = None,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> List[DocumentChunk]:
    """Extract text from a PDF file using pypdf and split into chunks."""
    from pypdf import PdfReader

    assigned_doc_id = doc_id or str(uuid.uuid4())
    reader = PdfReader(io.BytesIO(file_bytes))
    all_chunks: List[DocumentChunk] = []

    for page_idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        if page_text.strip():
            page_chunks = chunk_text(
                text=page_text,
                doc_id=assigned_doc_id,
                filename=filename,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                base_metadata={"page_number": page_idx + 1},
            )
            all_chunks.extend(page_chunks)

    # Re-index chunk IDs to be sequential
    for i, c in enumerate(all_chunks):
        c.chunk_index = i
        c.chunk_id = f"{assigned_doc_id}_chunk_{i}"
        c.metadata["chunk_index"] = i
        c.metadata["total_chunks"] = len(all_chunks)

    return all_chunks


def load_text_file(
    text_content: str,
    filename: str,
    doc_id: Optional[str] = None,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> List[DocumentChunk]:
    """Process a plain text or markdown file content into chunks."""
    assigned_doc_id = doc_id or str(uuid.uuid4())
    return chunk_text(
        text=text_content,
        doc_id=assigned_doc_id,
        filename=filename,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        base_metadata={"file_type": "text/markdown"},
    )
