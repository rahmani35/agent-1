"""Vertex AI Agent Engine Streaming Client & Local Fallback.
"""

import asyncio
from collections import OrderedDict
from typing import Optional
from .config import PROJECT_ID, LOCATION, REASONING_ENGINE_ID

CLIENT_SESSION_STATE_KEY = "client_session_id"
_SESSION_CACHE_MAX = 512
_session_cache: "OrderedDict[tuple[str, str], str]" = OrderedDict()

remote_agent = None

try:
    import vertexai
    from vertexai import agent_engines

    if PROJECT_ID:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
    if REASONING_ENGINE_ID:
        print(f"[*] Connecting to Vertex AI Agent Engine: {REASONING_ENGINE_ID}")
        remote_agent = agent_engines.get(REASONING_ENGINE_ID)
        print("[✓] Connected to Vertex AI Agent Engine successfully!")
except Exception as e:
    print(f"[!] Warning: Could not connect to remote Agent Engine ({e}). Local fallback enabled.")


_local_runner = None


def _get_local_runner():
    """Build (once) the in-process ADK runner used when Agent Engine is unreachable."""
    global _local_runner
    if _local_runner is None:
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from agent.agent import root_agent

        _local_runner = Runner(
            agent=root_agent,
            app_name=root_agent.name,
            session_service=InMemorySessionService(),
            auto_create_session=True,
        )
    return _local_runner


def _cache_put(user_id: str, client_session_id: str, engine_session_id: str) -> None:
    _session_cache[(user_id, client_session_id)] = engine_session_id
    _session_cache.move_to_end((user_id, client_session_id))
    while len(_session_cache) > _SESSION_CACHE_MAX:
        _session_cache.popitem(last=False)


async def _find_tagged_session(user_id: str, client_session_id: str) -> Optional[str]:
    """Look for an existing engine session tagged with this client session key."""
    listing = await remote_agent.async_list_sessions(user_id=user_id)
    sessions = listing.get("sessions", []) if isinstance(listing, dict) else (listing or [])
    for session in sessions:
        state = session.get("state") or {}
        if state.get(CLIENT_SESSION_STATE_KEY) == client_session_id:
            return session.get("id")
    return None


async def resolve_remote_session(user_id: str, client_session_id: Optional[str]) -> Optional[str]:
    """Map a client session key to a persistent Agent Engine session ID."""
    if not client_session_id:
        return None

    cached = _session_cache.get((user_id, client_session_id))
    if cached:
        _session_cache.move_to_end((user_id, client_session_id))
        return cached

    try:
        existing = await _find_tagged_session(user_id, client_session_id)
        if existing:
            _cache_put(user_id, client_session_id, existing)
            return existing

        created = await remote_agent.async_create_session(
            user_id=user_id,
            state={CLIENT_SESSION_STATE_KEY: client_session_id},
        )
        engine_session_id = created.get("id") if isinstance(created, dict) else getattr(created, "id", None)
        if not engine_session_id:
            raise RuntimeError(f"Agent Engine returned no session ID: {created!r}")

        _cache_put(user_id, client_session_id, engine_session_id)
        return engine_session_id
    except Exception as exc:
        print(f"[!] Warning: could not establish session '{client_session_id}' ({exc}). Falling back to a stateless turn.")
        return None


def _collect_stream_sync(query_kwargs: dict) -> str:
    """Drain the Agent Engine event stream into one string. Blocking."""
    response_text = ""
    for event in remote_agent.stream_query(**query_kwargs):
        if isinstance(event, dict):
            if event.get("error_message"):
                raise RuntimeError(event["error_message"])
            content = event.get("content")
            if content and isinstance(content, dict):
                for part in content.get("parts", []):
                    if isinstance(part, dict) and "text" in part:
                        response_text += part["text"]
            elif event.get("output"):
                response_text += str(event["output"])
    return response_text


async def _collect_stream(query_kwargs: dict) -> str:
    """Collect the full agent response without stalling the event loop."""
    return await asyncio.to_thread(_collect_stream_sync, query_kwargs)


async def execute_agent_query(prompt: str, user_id: str, session_id: Optional[str] = None) -> str:
    """Stream reasoning execution from the deployed Vertex AI Agent Engine or local fallback."""
    if remote_agent:
        engine_session_id = await resolve_remote_session(user_id, session_id)
        query_kwargs = {"message": prompt, "user_id": user_id}
        if engine_session_id:
            query_kwargs["session_id"] = engine_session_id

        try:
            response_text = await _collect_stream(query_kwargs)
        except Exception:
            if not engine_session_id:
                raise
            # Session may have expired; clear and retry once
            _session_cache.pop((user_id, session_id), None)
            retry_session_id = await resolve_remote_session(user_id, session_id)
            if not retry_session_id or retry_session_id == engine_session_id:
                raise
            query_kwargs["session_id"] = retry_session_id
            response_text = await _collect_stream(query_kwargs)

        return response_text.strip() or "No response received from Agent Engine."

    # Fallback to local ADK agent runner
    from google.genai import types

    runner = _get_local_runner()
    content = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])

    response_text = ""
    async for event in runner.run_async(user_id=user_id, session_id=session_id or "default", new_message=content):
        if hasattr(event, "error_message") and event.error_message:
            raise RuntimeError(event.error_message)
        if hasattr(event, "content") and event.content:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    response_text += part.text
        elif hasattr(event, "output") and event.output:
            response_text += str(event.output)

    return response_text.strip() or "No response generated."
