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


def _overlap_tail(text: str, overlap: int) -> str:
    """Return the last `overlap` characters of `text`, snapped to a word boundary.

    Used to repeat the end of one chunk at the start of the next so a fact split
    across a chunk boundary stays retrievable from at least one whole chunk.
    """
    if overlap <= 0 or not text:
        return ""
    if len(text) <= overlap:
        return text.strip()

    tail = text[-overlap:]
    # Drop a leading partial word so the overlap starts cleanly.
    boundary = re.search(r"\s", tail)
    if boundary:
        tail = tail[boundary.end():]
    return tail.strip()


def _pack_paragraphs(paragraphs: List[str], chunk_size: int) -> List[str]:
    """Group paragraphs into disjoint pieces of at most `chunk_size` characters.

    Paragraphs longer than `chunk_size` are hard-sliced. The pieces returned do
    not overlap; `chunk_text` layers the overlap on afterwards.
    """
    groups: List[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current:
            groups.append(current)
            current = ""

        if len(para) > chunk_size:
            for start in range(0, len(para), chunk_size):
                groups.append(para[start : start + chunk_size])
        else:
            current = para

    if current:
        groups.append(current)

    return groups


def chunk_text(
    text: str,
    doc_id: str,
    filename: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
    base_metadata: Optional[Dict[str, Any]] = None,
) -> List[DocumentChunk]:
    """Split a continuous text string into overlapping chunks.

    Text is packed into pieces of at most `chunk_size` characters on paragraph
    boundaries where possible, then each piece after the first is prefixed with
    the trailing `chunk_overlap` characters of the piece before it. Every pair of
    consecutive chunks therefore shares context, whether the split fell on a
    paragraph boundary or inside an oversized paragraph.

    A chunk can reach `chunk_size + chunk_overlap` characters as a result: the
    size bound applies to new content, and the repeated overlap sits on top.
    """
    base_meta = base_metadata or {}
    # Normalize whitespace
    clean_text = re.sub(r"\r\n|\r", "\n", text).strip()
    if not clean_text:
        return []

    # Keep the parameters in a range where overlap is meaningful: an overlap at
    # or above chunk_size would repeat a whole piece into the next one.
    chunk_size = max(1, chunk_size)
    overlap = max(0, min(chunk_overlap, chunk_size - 1))

    groups = _pack_paragraphs(clean_text.split("\n\n"), chunk_size)

    chunks_text: List[str] = []
    for idx, group in enumerate(groups):
        tail = _overlap_tail(groups[idx - 1], overlap) if idx > 0 else ""
        chunks_text.append(f"{tail} {group}" if tail else group)

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
