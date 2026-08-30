"""Google Drive Integration & Synchronization Service.

Enables visual folder browsing, document extraction, vectorization,
and automatic purging of removed/trashed files.
"""

import io
import os
from typing import List, Dict, Any, Optional
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import google.auth

from agent.doc_loader import load_pdf_file, load_text_file
from agent.embeddings import get_embeddings
from .vector_service import VectorService

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

SUPPORTED_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.google-apps.document": "gdoc",
    "text/plain": "text",
    "text/markdown": "markdown",
    "text/csv": "text",
    "application/json": "text",
}


class GoogleDriveService:
    """Service for interacting with Google Drive API and synchronizing folders."""

    def _get_drive_client(self, drive_token: Optional[str] = None):
        """Initialize Drive API client using user token or Application Default Credentials."""
        import google.oauth2.credentials

        if drive_token:
            creds = google.oauth2.credentials.Credentials(token=drive_token)
            return build("drive", "v3", credentials=creds, cache_discovery=False)

        try:
            credentials, _ = google.auth.default(scopes=SCOPES)
            return build("drive", "v3", credentials=credentials, cache_discovery=False)
        except Exception as exc:
            raise RuntimeError(
                "Failed to authenticate with Google Drive API. Please connect with your Google account."
            ) from exc

    def browse_folders(self, parent_id: str = "root", drive_token: Optional[str] = None) -> Dict[str, Any]:
        """Browse subfolders and retrieve supported file counts for an interactive explorer."""
        drive = self._get_drive_client(drive_token=drive_token)

        # 1. Fetch current folder metadata (if not root)
        current_folder = {"id": parent_id, "name": "My Drive"}
        if parent_id != "root":
            try:
                f_meta = drive.files().get(fileId=parent_id, fields="id, name, parents").execute()
                current_folder = {"id": f_meta.get("id"), "name": f_meta.get("name", "Folder")}
            except Exception:
                pass

        # 2. List subfolders
        try:
            q_folders = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            results_folders = (
                drive.files()
                .list(
                    q=q_folders,
                    pageSize=50,
                    fields="files(id, name, modifiedTime, webViewLink, shared)",
                    orderBy="name",
                )
                .execute()
            )
            folders = results_folders.get("files", [])

            # 3. List supported document files in current folder
            q_files = f"'{parent_id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
            results_files = (
                drive.files()
                .list(
                    q=q_files,
                    pageSize=100,
                    fields="files(id, name, mimeType, size, modifiedTime, webViewLink)",
                    orderBy="name",
                )
                .execute()
            )
            all_files = results_files.get("files", [])
        except Exception as exc:
            err_str = str(exc)
            if "insufficient" in err_str.lower() or "403" in err_str:
                raise RuntimeError(
                    "Google Drive permission error: Insufficient authentication scopes on your Google Cloud login.\n"
                    "Please run this command in your terminal to grant Drive access:\n\n"
                    'gcloud auth application-default login --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/userinfo.email,openid"'
                ) from exc
            raise

        supported_files = [
            f for f in all_files if f.get("mimeType") in SUPPORTED_MIME_TYPES or f.get("name", "").endswith((".pdf", ".md", ".txt"))
        ]

        return {
            "current_folder": current_folder,
            "parent_id": parent_id,
            "folders": folders,
            "supported_files": supported_files,
            "total_files": len(all_files),
        }

    def _download_or_export_file(self, drive_file: Dict[str, Any], drive_token: Optional[str] = None) -> tuple[bytes, str]:
        """Download binary file or export Google Doc to text."""
        drive = self._get_drive_client(drive_token=drive_token)
        file_id = drive_file["id"]
        mime_type = drive_file.get("mimeType", "")
        file_name = drive_file.get("name", "document")

        if mime_type == "application/vnd.google-apps.document":
            # Export Google Doc to plain text
            request = drive.files().export_media(fileId=file_id, mimeType="text/plain")
            exported_bytes = request.execute()
            return exported_bytes, "text/plain"
        else:
            # Download binary media
            request = drive.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return fh.getvalue(), mime_type

    async def sync_folder(
        self,
        folder_id: str,
        folder_name: Optional[str] = None,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
        vector_service: Optional[VectorService] = None,
        drive_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synchronize an entire Google Drive folder with the active vector store."""
        drive = self._get_drive_client(drive_token=drive_token)
        v_service = vector_service or VectorService()
        store = v_service._get_store()

        # Step 1: List all active files in the folder
        q = f"'{folder_id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
        results = (
            drive.files()
            .list(
                q=q,
                pageSize=200,
                fields="files(id, name, mimeType, modifiedTime, webViewLink)",
            )
            .execute()
        )
        active_drive_files = results.get("files", [])
        active_file_map = {f["id"]: f for f in active_drive_files}

        added_docs = []
        updated_docs = []
        total_chunks = 0

        # Step 2: Ingest / Update files
        for f in active_drive_files:
            f_id = f["id"]
            f_name = f.get("name", "unnamed_file")
            f_mime = f.get("mimeType", "")
            f_url = f.get("webViewLink", "")
            doc_id = f"gdrive_{f_id}"

            # Only process supported formats
            if f_mime not in SUPPORTED_MIME_TYPES and not f_name.endswith((".pdf", ".md", ".txt", ".csv")):
                continue

            try:
                file_bytes, content_type = self._download_or_export_file(f, drive_token=drive_token)
                if not file_bytes:
                    continue

                if f_name.lower().endswith(".pdf") or "pdf" in content_type:
                    chunks = load_pdf_file(
                        file_bytes=file_bytes,
                        filename=f_name,
                        doc_id=doc_id,
                        chunk_size=chunk_size,
                        chunk_overlap=chunk_overlap,
                    )
                else:
                    text_str = file_bytes.decode("utf-8", errors="replace")
                    chunks = load_text_file(
                        text_content=text_str,
                        filename=f_name,
                        doc_id=doc_id,
                        chunk_size=chunk_size,
                        chunk_overlap=chunk_overlap,
                    )

                if chunks:
                    # Attach Google Drive metadata
                    for c in chunks:
                        c.metadata["folder_id"] = folder_id
                        c.metadata["folder_name"] = folder_name or folder_id
                        c.metadata["drive_file_id"] = f_id
                        c.metadata["drive_url"] = f_url
                        c.metadata["source"] = "gdrive"

                    # Generate embeddings
                    chunk_texts = [c.content for c in chunks]
                    embeddings = get_embeddings(chunk_texts)
                    for c, emb in zip(chunks, embeddings):
                        c.embedding = emb

                    saved = store.add_chunks(chunks)
                    total_chunks += saved
                    added_docs.append({"doc_id": doc_id, "filename": f_name, "chunks": saved})
            except Exception as err:
                print(f"[!] Error vectorizing Drive file '{f_name}' ({f_id}): {err}")

        # Step 3: Purge removed / deleted files from Vector Store
        existing_docs = store.list_documents()
        removed_docs = []

        for doc in existing_docs:
            d_id = doc.get("doc_id", "")
            # Check if this document belongs to Google Drive and this specific folder
            if d_id.startswith("gdrive_"):
                raw_drive_id = d_id.replace("gdrive_", "")
                if raw_drive_id not in active_file_map:
                    # File was deleted or moved out of the Google Drive folder!
                    store.delete_document(d_id)
                    removed_docs.append({"doc_id": d_id, "filename": doc.get("filename", "")})

        return {
            "status": "synchronized",
            "folder_id": folder_id,
            "folder_name": folder_name or folder_id,
            "active_files_in_drive": len(active_drive_files),
            "vectorized_documents": added_docs,
            "purged_documents": removed_docs,
            "total_chunks_indexed": total_chunks,
        }
