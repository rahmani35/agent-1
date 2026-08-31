"""FastAPI Gateway Application for Agent-1 Document Q&A (RAG).

Supports Cloud SQL (pgvector on db-f1-micro) & Firestore Vector Search.
"""

from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
    Query,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from agent.doc_loader import (
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    MAX_CHUNK_SIZE,
    MIN_CHUNK_SIZE,
)
from .config import PORT, REASONING_ENGINE_ID, get_active_backend, set_active_backend
from .auth import (
    GoogleAuthRequest,
    AuthResponse,
    UserProfile,
    get_current_user,
    verify_google_id_token,
)
from .engine import execute_agent_query, remote_agent
from .vector_service import VectorService
from .drive_service import GoogleDriveService

vector_service = VectorService()
drive_service = GoogleDriveService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[*] Agent-1 RAG Gateway started. Active Vector Backend: {get_active_backend()}")
    yield
    print("[*] Shutting down Agent-1 Gateway.")


app = FastAPI(
    title="Agent-1 Gateway | Document Q&A RAG Agent",
    description="Grounded Document Q&A Agent with Cloud SQL pgvector, Firestore Vector Search, and Google Drive Auto-Sync.",
    version="1.1.0",
    lifespan=lifespan,
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


OVERLAP_TOO_LARGE = "chunk_overlap must be smaller than chunk_size."


class ChunkingParams:
    """Validated chunking query parameters.

    Bounds are enforced here rather than left to the chunker: an overlap at or
    above the chunk size, or a non-positive chunk size, produces degenerate
    chunking, and a caller that asks for it should be told rather than silently
    given something else.
    """

    def __init__(
        self,
        chunk_size: int = Query(
            default=DEFAULT_CHUNK_SIZE,
            ge=MIN_CHUNK_SIZE,
            le=MAX_CHUNK_SIZE,
            description="Max character length per chunk",
        ),
        chunk_overlap: int = Query(
            default=DEFAULT_CHUNK_OVERLAP,
            ge=0,
            lt=MAX_CHUNK_SIZE,
            description="Characters repeated from the previous chunk",
        ),
    ):
        if chunk_overlap >= chunk_size:
            # Literal 422: the Starlette constant for it was renamed and the old
            # name now warns on every rejected request.
            raise HTTPException(
                status_code=422,
                detail=f"{OVERLAP_TOO_LARGE} Got chunk_overlap={chunk_overlap}, chunk_size={chunk_size}.",
            )
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap


# Request & Response Models
class BackendSwitchRequest(BaseModel):
    backend: str = Field(..., description="Target vector backend: 'firestore' or 'cloudsql'")


class DriveSyncRequest(BaseModel):
    folder_id: str = Field(..., description="Google Drive Folder ID to vectorize")
    folder_name: Optional[str] = Field(default=None, description="Optional human-readable folder name")
    drive_token: Optional[str] = Field(default=None, description="Optional user OAuth access token for Google Drive")
    chunk_size: int = Field(default=DEFAULT_CHUNK_SIZE, ge=MIN_CHUNK_SIZE, le=MAX_CHUNK_SIZE)
    chunk_overlap: int = Field(default=DEFAULT_CHUNK_OVERLAP, ge=0, lt=MAX_CHUNK_SIZE)

    @model_validator(mode="after")
    def _overlap_below_size(self) -> "DriveSyncRequest":
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError(OVERLAP_TOO_LARGE)
        return self


class ChatRequest(BaseModel):
    message: str = Field(..., description="The user question or query about documents.")
    session_id: str = Field(default="default_session", description="Session ID for multi-turn conversations.")


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query string.")
    top_k: int = Field(default=5, description="Number of results to retrieve.")
    doc_id: Optional[str] = Field(default=None, description="Optional doc_id to filter by.")


class AgentResponse(BaseModel):
    response: str
    user_id: str
    session_id: str
    backend: str


# Authentication Endpoints
@app.post("/auth/google", response_model=AuthResponse, tags=["Authentication"])
async def authenticate_with_google(request: GoogleAuthRequest):
    """Authenticate with Google OAuth ID Token and check allowed whitelist."""
    profile = verify_google_id_token(request.id_token)
    return AuthResponse(token=request.id_token, user=profile)


@app.get("/auth/me", response_model=UserProfile, tags=["Authentication"])
async def get_my_profile(current_user: UserProfile = Depends(get_current_user)):
    """Validate current session and return authenticated user profile."""
    return current_user


# System & Settings Endpoints
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint reporting vector store and agent engine status."""
    backend = get_active_backend()
    v_health = vector_service.get_health()
    return {
        "status": "ok",
        "agent": "rag-document-agent",
        "active_backend": backend,
        "vector_store": v_health,
        "agent_engine_connected": remote_agent is not None,
        "engine_id": REASONING_ENGINE_ID,
    }


@app.get("/settings/backend", tags=["Settings"])
async def get_backend_setting(current_user: UserProfile = Depends(get_current_user)):
    """Get the currently active vector database backend."""
    return {
        "active_backend": get_active_backend(),
        "vector_health": vector_service.get_health(),
    }


@app.post("/settings/backend", tags=["Settings"])
async def switch_backend(
    request: BackendSwitchRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """Dynamically switch active vector backend ('firestore' or 'cloudsql')."""
    new_backend = set_active_backend(request.backend)
    health = vector_service.get_health()
    return {
        "message": f"Switched active vector backend to '{new_backend}'.",
        "active_backend": new_backend,
        "vector_health": health,
    }


# Google Drive Endpoints
@app.get("/drive/browse", tags=["Google Drive"])
async def browse_drive(
    parent_id: str = Query(default="root", description="Folder ID to explore or 'root'"),
    x_drive_token: Optional[str] = Header(None, alias="X-Drive-Token"),
    current_user: UserProfile = Depends(get_current_user),
):
    """Browse Google Drive folders and see supported file previews."""
    try:
        data = drive_service.browse_folders(parent_id=parent_id, drive_token=x_drive_token)
        return data
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google Drive exploration failed: {str(exc)}",
        ) from exc


@app.post("/drive/sync", tags=["Google Drive"])
async def sync_drive_folder(
    request: DriveSyncRequest,
    x_drive_token: Optional[str] = Header(None, alias="X-Drive-Token"),
    current_user: UserProfile = Depends(get_current_user),
):
    """Vectorize all files from a Google Drive folder and purge deleted ones."""
    try:
        drive_token = request.drive_token or x_drive_token
        report = await drive_service.sync_folder(
            folder_id=request.folder_id,
            folder_name=request.folder_name,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
            vector_service=vector_service,
            drive_token=drive_token,
        )
        return {
            "message": f"Folder '{request.folder_name or request.folder_id}' synchronized successfully.",
            **report,
            "synced_by": current_user.email,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google Drive synchronization failed: {str(exc)}",
        ) from exc


@app.get("/", tags=["System"])
async def root():
    """Root info endpoint."""
    backend = get_active_backend()
    return {
        "message": "Agent-1 Document Q&A Gateway is running.",
        "docs_url": "/docs",
        "active_vector_backend": backend,
        "endpoints": [
            "/auth/google",
            "/auth/me",
            "/settings/backend",
            "/drive/browse",
            "/drive/sync",
            "/documents/upload",
            "/documents",
            "/documents/search",
            "/chat",
            "/health",
        ],
    }


# Document Management Endpoints
@app.post("/documents/upload", tags=["Documents"])
async def upload_document(
    file: UploadFile = File(...),
    chunking: ChunkingParams = Depends(),
    current_user: UserProfile = Depends(get_current_user),
):
    """Upload a document (PDF, TXT, MD), chunk it, generate embeddings, and store in vector DB."""
    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        result = await vector_service.ingest_document(
            file_bytes=file_bytes,
            filename=file.filename or "uploaded_doc",
            content_type=file.content_type or "text/plain",
            chunk_size=chunking.chunk_size,
            chunk_overlap=chunking.chunk_overlap,
        )
        return {
            "message": "Document successfully indexed.",
            **result,
            "uploaded_by": current_user.email,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document ingestion failed: {str(exc)}",
        ) from exc


@app.get("/documents", tags=["Documents"])
async def list_documents(current_user: UserProfile = Depends(get_current_user)):
    """List all indexed documents in the active vector store."""
    try:
        docs = vector_service.list_documents()
        return {"documents": docs, "count": len(docs), "backend": get_active_backend()}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list documents: {str(exc)}",
        ) from exc


@app.delete("/documents/{doc_id}", tags=["Documents"])
async def delete_document(
    doc_id: str,
    current_user: UserProfile = Depends(get_current_user),
):
    """Delete a document and all its chunks from the active vector store."""
    try:
        success = vector_service.delete_document(doc_id)
        return {"success": success, "doc_id": doc_id}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(exc)}",
        ) from exc


@app.post("/documents/search", tags=["Documents"])
async def search_documents_endpoint(
    request: SearchRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """Direct vector similarity search against the active vector database."""
    try:
        results = vector_service.search(
            query=request.query,
            top_k=request.top_k,
            doc_id=request.doc_id,
        )
        return {"results": results, "count": len(results), "backend": get_active_backend()}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vector search failed: {str(exc)}",
        ) from exc


# Protected Chat / RAG Endpoint
@app.post("/chat", response_model=AgentResponse, tags=["Agent"])
async def chat_rag(
    request: ChatRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    """Ask a question about uploaded documents using the RAG Agent."""
    try:
        response_text = await execute_agent_query(
            prompt=request.message,
            user_id=current_user.email,
            session_id=request.session_id,
        )
        return AgentResponse(
            response=response_text,
            user_id=current_user.email,
            session_id=request.session_id,
            backend=get_active_backend(),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent reasoning execution failed: {str(exc)}",
        ) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=PORT, reload=True)
