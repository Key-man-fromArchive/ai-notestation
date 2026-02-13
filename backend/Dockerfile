# @TASK P0-T0.2 - Backend Dockerfile (FastAPI + Python 3.12)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#system-architecture
#
# Layer caching strategy:
#   1. Copy pyproject.toml first for dependency caching
#   2. Install dependencies (cached unless pyproject.toml changes)
#   3. Copy application code (changes frequently)

FROM python:3.12-slim

# Install system dependencies required by asyncpg, lxml, and PaddleOCR (OpenCV)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        libxml2-dev \
        libxslt1-dev \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition first for Docker layer caching
COPY pyproject.toml .

# Install Python dependencies (editable mode for development)
RUN pip install --no-cache-dir -e ".[dev]"

# Pin numpy<2.4 — PaddleOCR-VL crashes with numpy>=2.4 due to
# "only 0-dimensional arrays can be converted to Python scalars"
# See: https://github.com/PaddlePaddle/PaddleOCR/issues/17462
RUN pip install --no-cache-dir "numpy<2.4"

# Copy application code
COPY . .

# Expose the FastAPI port
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
