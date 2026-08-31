"""Embedding utility for generating vector representations of document chunks and queries.

Uses Google's gemini-embedding-001 model (configured to 768 dimensions).
Supports both Google GenAI Client (API Key) and Vertex AI.
"""

import os
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_REGION", "europe-west3")


def get_embedding(text: str) -> List[float]:
    """Generate a 768-dimensional vector embedding for a single text query or chunk."""
    results = get_embeddings([text])
    return results[0] if results else []


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a batch of text strings.

    Tries Google GenAI Client (gemini-embedding-001 with output_dimensionality=768)
    and falls back to Vertex AI if configured.
    """
    if not texts:
        return []

    # Clean empty or whitespace-only texts to avoid API errors
    cleaned_texts = [t.strip() if t.strip() else " " for t in texts]

    # Attempt 1: google.genai Client, by API key where one is configured and by
    # the ambient service account (Vertex) otherwise - the latter is the case
    # inside Agent Engine, which has no API key. Both routes return identical
    # gemini-embedding-001 vectors, so an index built through one is searchable
    # through the other.
    last_err: Optional[Exception] = None
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if api_key:
            client = genai.Client(api_key=api_key)
        else:
            client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

        # Resolve model name: if text-embedding-004 is requested, use gemini-embedding-001
        target_model = EMBEDDING_MODEL_NAME
        if "text-embedding-004" in target_model:
            target_model = "gemini-embedding-001"

        config = types.EmbedContentConfig(output_dimensionality=768)

        # Batch in chunks of 50 to avoid payload limits
        embeddings: List[List[float]] = []
        batch_size = 50
        for i in range(0, len(cleaned_texts), batch_size):
            batch = cleaned_texts[i : i + batch_size]
            response = client.models.embed_content(
                model=target_model,
                contents=batch,
                config=config,
            )
            if hasattr(response, "embeddings") and response.embeddings:
                for emb in response.embeddings:
                    embeddings.append(list(emb.values))
            elif hasattr(response, "embedding") and response.embedding:
                embeddings.append(list(response.embedding.values))

        if embeddings:
            return embeddings
    except Exception as genai_err:
        last_err = genai_err

    # Attempt 2: Vertex AI TextEmbeddingModel
    try:
        import vertexai
        from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput

        if PROJECT_ID:
            vertexai.init(project=PROJECT_ID, location=LOCATION)
        model = TextEmbeddingModel.from_pretrained("text-embedding-004")

        embeddings = []
        batch_size = 50
        for i in range(0, len(cleaned_texts), batch_size):
            batch = cleaned_texts[i : i + batch_size]
            inputs = [TextEmbeddingInput(text=t, task_type="RETRIEVAL_DOCUMENT") for t in batch]
            results = model.get_embeddings(inputs)
            embeddings.extend([r.values for r in results])
        return embeddings
    except Exception as vertex_err:
        raise RuntimeError(
            f"Failed to generate embeddings. GenAI attempt: {last_err}. Vertex attempt: {vertex_err}"
        ) from vertex_err

    raise RuntimeError(f"Failed to generate embeddings. GenAI attempt: {last_err}")
