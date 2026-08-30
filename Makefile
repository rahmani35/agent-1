.PHONY: help dev-backend dev-frontend deploy-agent deploy-backend deploy-frontend test-agent build-frontend init-cloudsql

help:
	@echo "Agent-1 (Document Q&A RAG) Management Commands:"
	@echo "  make dev-backend     - Run FastAPI Gateway server locally (Port 8084)"
	@echo "  make dev-frontend    - Run React Vite dev server (Port 5174)"
	@echo "  make test-agent      - Test RAG Agent locally / remote"
	@echo "  make deploy-agent    - Deploy RAG Agent to Vertex AI Agent Engine"
	@echo "  make deploy-backend  - Deploy Gateway to Google Cloud Run"
	@echo "  make deploy-frontend - Build and deploy React UI to Firebase Hosting"
	@echo "  make init-cloudsql   - Initialize Cloud SQL pgvector database schema"

dev-backend:
	.venv/bin/uvicorn backend.app.main:app --port 8084 --reload

dev-frontend:
	cd frontend && PATH=/opt/homebrew/bin:$$PATH npm run dev

build-frontend:
	cd frontend && PATH=/opt/homebrew/bin:$$PATH npm run build

test-agent:
	.venv/bin/python agent/deploy.py --action test

deploy-agent:
	.venv/bin/python agent/deploy.py --action deploy

deploy-backend:
	gcloud run deploy agent1-backend \
		--source . \
		--project learn-agent-deployment \
		--region europe-west3 \
		--allow-unauthenticated

deploy-frontend: build-frontend
	npx firebase-tools deploy --only hosting

init-cloudsql:
	.venv/bin/python -c "from agent.vector_store import get_vector_store; store = get_vector_store('cloudsql'); store.init_db(); print('Cloud SQL pgvector initialized successfully!')"
