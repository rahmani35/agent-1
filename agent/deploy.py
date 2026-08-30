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

    agent_py_path = str(agent_dir / "agent.py")
    vector_store_py_path = str(agent_dir / "vector_store.py")
    embeddings_py_path = str(agent_dir / "embeddings.py")
    doc_loader_py_path = str(agent_dir / "doc_loader.py")

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
        ],
        extra_packages=[
            agent_py_path,
            vector_store_py_path,
            embeddings_py_path,
            doc_loader_py_path,
        ],
    )

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
