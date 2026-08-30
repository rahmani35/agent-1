"""Deployment script for Vertex AI Agent Engine (Reasoning Engine).

Deploys the RAG Document Agent to Google Cloud Vertex AI Agent Engine.
"""

import argparse
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure agent directory is in Python path
agent_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(agent_dir))
root_dir = agent_dir.parent
sys.path.insert(0, str(root_dir))

# Load root .env
load_dotenv(root_dir / ".env")


def _runtime_env_vars() -> dict:
    """Collect the env vars the agent needs at runtime inside the Agent Engine container.

    The container has no `.env` file, so any configuration the agent reads via
    os.getenv() (model, API key, vector backend settings) must be shipped
    explicitly with the deployment.

    GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are deliberately absent:
    Agent Engine injects them and rejects the deployment with
    "Environment variable name '...' is reserved" if they are set here.
    """
    env_vars = {}

    passthrough = [
        "GEMINI_API_KEY",
        "MODEL_NAME",
        "EMBEDDING_MODEL",
        "VECTOR_BACKEND",
        "FIRESTORE_COLLECTION",
        "FIRESTORE_DATABASE",
        "DB_HOST",
        "DB_PORT",
        "DB_NAME",
        "DB_USER",
        "DB_PASS",
        "DB_SSLMODE",
        "CLOUD_SQL_CONNECTION_NAME",
    ]
    for key in passthrough:
        value = os.getenv(key)
        if value:
            env_vars[key] = value

    missing = [k for k in ("GEMINI_API_KEY", "VECTOR_BACKEND") if k not in env_vars]
    if missing:
        print(f"[!] Warning: {', '.join(missing)} not set; the deployed agent will fall back to defaults.")

    print(f"[*] Passing {len(env_vars)} env var(s) to the Agent Engine runtime: {', '.join(sorted(env_vars))}")
    return env_vars


def deploy_to_agent_engine(
    project_id: str,
    location: str,
    staging_bucket: str,
    display_name: str = "rag-document-agent",
    description: str = "ADK RAG Agent with Cloud SQL pgvector & Firestore Vector Search",
):
    """Packages and deploys the ADK Agent to Vertex AI Agent Engine."""
    print(f"[*] Initializing Vertex AI (Project: {project_id}, Location: {location})...")

    try:
        import vertexai
        from vertexai import agent_engines
        from agent import root_agent
    except ImportError as e:
        print(f"[!] Required SDKs not installed. Run: pip install -r requirements.txt\nError: {e}")
        sys.exit(1)

    vertexai.init(
        project=project_id,
        location=location,
        staging_bucket=staging_bucket,
    )

    print(f"[*] Wrapping root agent '{root_agent.name}' into AdkApp...")
    adk_app = agent_engines.AdkApp(
        agent=root_agent,
        enable_tracing=True,
    )

    print(f"[*] Deploying to Vertex AI Agent Engine (display_name='{display_name}')...")
    print("    This may take a few minutes while the container and environment are provisioned.")

    # Stage a clean copy of the `agent` package for extra_packages.
    #
    # The SDK archives extra_packages with `tarfile.add(path)`, which keeps the
    # given path as the archive member name. An absolute path therefore lands in
    # the container as `var/folders/.../agent` instead of `agent/` at the root of
    # the working directory, and unpickling the agent fails with
    # "No module named 'agent'". Paths must be RELATIVE to the current working
    # directory, so stage the package in a temp dir and run create() from there.
    import shutil
    import tempfile

    staging_dir = tempfile.mkdtemp()
    shutil.copytree(
        str(agent_dir),
        os.path.join(staging_dir, "agent"),
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".venv", "*.egg-info"),
    )
    print(f"[*] Staged agent package for upload: {staging_dir}/agent")

    previous_cwd = os.getcwd()
    os.chdir(staging_dir)
    try:
        remote_agent = agent_engines.create(
            adk_app,
            display_name=display_name,
            description=description,
            requirements=[
                "google-adk>=2.0.0",
                "google-cloud-aiplatform>=1.70.0",
                "google-genai>=0.1.0",
                "google-cloud-firestore>=2.16.0",
                "pgvector>=0.3.0",
                "psycopg[binary]>=3.1.18",
                "pypdf>=4.2.0",
                "cloudpickle>=3.0.0",
                "pydantic>=2.7.0",
                "python-dotenv>=1.0.0",
                "requests>=2.31.0",
            ],
            extra_packages=["agent"],
            env_vars=_runtime_env_vars(),
        )
    finally:
        os.chdir(previous_cwd)
        shutil.rmtree(staging_dir, ignore_errors=True)

    print("\n[✓] Successfully deployed RAG agent to Vertex AI Agent Engine!")
    print(f"    Resource Name : {remote_agent.resource_name}")
    print(f"    Display Name  : {display_name}")
    return remote_agent


def test_remote_agent(resource_name: str, project_id: str, location: str):
    """Test query against a deployed Vertex AI Agent Engine instance."""
    import vertexai
    from vertexai import agent_engines

    vertexai.init(project=project_id, location=location)
    print(f"[*] Fetching remote agent: {resource_name}")
    remote_agent = agent_engines.get(resource_name)

    sample_prompt = "What documents are available, and what are their main topics?"
    print(f"\n[*] Sending test query:\n    \"{sample_prompt}\"\n")

    print("[*] Streaming response from remote agent:")
    response_text = ""
    for event in remote_agent.stream_query(message=sample_prompt, user_id="test_user"):
        if isinstance(event, dict):
            if event.get("error_message"):
                print(f"\n[!] Error from agent: {event['error_message']}")
                return
            content = event.get("content")
            if content and isinstance(content, dict):
                for part in content.get("parts", []):
                    if isinstance(part, dict) and "text" in part:
                        chunk = part["text"]
                        print(chunk, end="", flush=True)
                        response_text += chunk
            elif event.get("output"):
                chunk = str(event["output"])
                print(chunk, end="", flush=True)
                response_text += chunk
        else:
            print(event)

    print("\n\n[✓] Test query complete!")


def list_deployed_agents(project_id: str, location: str):
    """List all deployed reasoning engine instances in the project and region."""
    import vertexai
    from vertexai import agent_engines

    vertexai.init(project=project_id, location=location)
    print(f"[*] Fetching deployed Agent Engines for project '{project_id}' in '{location}'...\n")

    engines = list(agent_engines.list())
    if not engines:
        print("[!] No deployed Agent Engines found.")
        return []

    print(f"Found {len(engines)} deployed agent(s):\n")
    for idx, engine in enumerate(engines, 1):
        print(f"  {idx}. Display Name  : {engine.display_name}")
        print(f"     Resource Name : {engine.resource_name}")
        print(f"     Engine ID     : {engine.resource_name.split('/')[-1]}")
        print(f"     Created       : {getattr(engine, 'create_time', 'N/A')}\n")
    return engines


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy, list, or test RAG Agent on Vertex AI Agent Engine")
    parser.add_argument("--action", choices=["deploy", "test", "list"], default="deploy", help="Action to perform")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT"), help="Google Cloud Project ID")
    parser.add_argument("--location", default=os.getenv("GOOGLE_CLOUD_REGION", "europe-west3"), help="GCP Region")
    parser.add_argument("--bucket", default=os.getenv("GCS_STAGING_BUCKET"), help="GCS staging bucket (gs://...)")
    parser.add_argument("--name", default="rag-document-agent", help="Display name of the agent engine")
    parser.add_argument("--resource-name", help="Resource name of deployed agent (optional for test; defaults to latest)")

    args = parser.parse_args()

    if not args.project:
        print("[!] Error: Google Cloud Project ID is required. Set GOOGLE_CLOUD_PROJECT in .env or pass --project")
        sys.exit(1)

    if args.action == "deploy":
        if not args.bucket:
            print("[!] Error: Staging bucket is required for deployment. Set GCS_STAGING_BUCKET or pass --bucket gs://your-bucket")
            sys.exit(1)
        deploy_to_agent_engine(
            project_id=args.project,
            location=args.location,
            staging_bucket=args.bucket,
            display_name=args.name,
        )
    elif args.action == "list":
        list_deployed_agents(
            project_id=args.project,
            location=args.location,
        )
    elif args.action == "test":
        resource = args.resource_name
        if not resource:
            print("[*] No --resource-name provided. Finding latest deployed agent...")
            engines = list_deployed_agents(project_id=args.project, location=args.location)
            if not engines:
                sys.exit(1)
            resource = engines[0].resource_name
            print(f"[*] Using latest agent: {resource}\n")

        test_remote_agent(
            resource_name=resource,
            project_id=args.project,
            location=args.location,
        )
