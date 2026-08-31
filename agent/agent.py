"""Document Q&A RAG Agent using Google ADK and Vector Search.

Equipped with vector retrieval tools supporting both Cloud SQL (pgvector)
and Cloud Firestore Vector Search.
"""

import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Sync GEMINI_API_KEY and GOOGLE_API_KEY for SDK compatibility
if os.getenv("GEMINI_API_KEY") and not os.getenv("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")

from google.adk.agents import Agent
from google.adk.models.google_llm import Gemini
from google.adk.tools import FunctionTool


AGENT_INSTRUCTION = """
You are an expert Document Intelligence and Q&A assistant.
Your goal is to provide accurate, grounded answers based on the user's uploaded documents.

Guidelines:
1. Grounding: When answering questions about uploaded documents, ALWAYS use the `search_documents` tool first to find relevant context.
2. Citations: Reference the source document filename and page/chunk index (e.g. `[Source: document.pdf, Chunk 2]`) when answering based on retrieved information.
3. Honesty & Factuality: If the retrieved documents do not contain the answer, clearly state: "Based on the provided documents, I could not find information about ...". Do not fabricate facts.
4. Formatting: Use structured Markdown with clear headings, bullet points, and code blocks where appropriate.
5. Synthesis: If multiple documents contain complementary facts, synthesize them into a cohesive response.
"""

DEFAULT_MODEL = os.getenv("MODEL_NAME", os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))

# Region serving the chat model on Vertex. The regional endpoints do not all
# carry every model - europe-west3 has no gemini-3.6-flash - so the model call
# goes to the global endpoint while the Agent Engine itself stays regional.
VERTEX_MODEL_LOCATION = os.getenv("VERTEX_MODEL_LOCATION", "global")


def search_documents(query: str, top_k: int = 4) -> str:
    """Search uploaded documents for relevant content chunks matching the query.

    Args:
        query: The search query or question to retrieve context for.
        top_k: Number of most relevant document chunks to return (default 4).

    Returns:
        A formatted string of relevant document chunks with metadata and source citations.
    """
    try:
        from agent.embeddings import get_embedding
        from agent.vector_store import get_vector_store
    except (ImportError, ValueError):
        from embeddings import get_embedding
        from vector_store import get_vector_store

    try:
        query_emb = get_embedding(query)
        if not query_emb:
            return "Error: Could not generate embedding for query."

        store = get_vector_store()
        results = store.similarity_search(query_embedding=query_emb, top_k=top_k)

        if not results:
            return "No matching document chunks found in the database."

        formatted_chunks = []
        for i, res in enumerate(results, 1):
            filename = res.get("filename", "unknown")
            chunk_idx = res.get("chunk_index", 0)
            score = res.get("score", 0.0)
            content = res.get("content", "").strip()
            meta = res.get("metadata", {})
            page_info = f", Page {meta.get('page_number')}" if meta.get("page_number") else ""

            formatted_chunks.append(
                f"--- [Chunk {i} | Source: {filename}{page_info} | Similarity: {score:.2f}] ---\n{content}"
            )

        return "\n\n".join(formatted_chunks)
    except Exception as exc:
        return f"Error executing document search: {str(exc)}"


# Define tool wrapper
search_tool = FunctionTool(func=search_documents)


def create_agent(model_name: Optional[str] = None, use_vertex: Optional[bool] = None) -> Agent:
    """Instantiate and return the configured ADK Document Q&A Agent.

    `use_vertex` selects how the model is reached. On Vertex AI Agent Engine the
    container authenticates with its own service account and there is no API key,
    so the model is bound to a Vertex client explicitly. In the Cloud Run gateway
    an API key is present and the plain model name routes to the Gemini Developer
    API, as before. Defaults to whichever the environment supports.
    """
    selected_model = model_name or DEFAULT_MODEL
    if use_vertex is None:
        use_vertex = not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    model = (
        Gemini(
            model=selected_model,
            client_kwargs={"vertexai": True, "location": VERTEX_MODEL_LOCATION},
        )
        if use_vertex
        else selected_model
    )

    return Agent(
        name="document_rag_assistant",
        model=model,
        description="A Document Q&A RAG agent that retrieves knowledge from Cloud SQL pgvector or Firestore Vector Search.",
        instruction=AGENT_INSTRUCTION,
        tools=[search_tool],
    )


# Default root agent instance
root_agent = create_agent()
