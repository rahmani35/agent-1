FROM python:3.11-slim

WORKDIR /app

# Install build dependencies & libpq for postgresql driver
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application and agent definitions
COPY backend/ ./backend/
COPY agent/ ./agent/

ENV PORT=8080
ENV PYTHONPATH="/app"

EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}"]
