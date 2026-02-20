# LabNote AI Appliance - Quick Reference

Quick-start guide for implementing hardware appliance based on research findings.

## Recommended Docker Compose Stack

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Reverse Proxy with Auto-Discovery
  traefik:
    image: traefik:v3.1
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard (disable in production)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/dynamic:/etc/traefik/dynamic:ro
      - ./letsencrypt:/letsencrypt
    networks:
      - labnote
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.local`)"
      - "traefik.http.routers.dashboard.service=api@internal"

  # PostgreSQL with pgvector
  postgres:
    image: pgvector/pgvector:pg16
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: labnote
      POSTGRES_USER: labnote
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - /DATA/postgres:/var/lib/postgresql/data
    networks:
      - labnote
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  # FastAPI Backend
  labnote-api:
    image: labnote/api:${VERSION:-latest}
    container_name: labnote-api
    restart: unless-stopped
    depends_on:
      - postgres
      - ollama
      - embedding
      - ocr
    environment:
      DATABASE_URL: postgresql://labnote:${DB_PASSWORD}@postgres:5432/labnote
      OLLAMA_URL: http://ollama:11434
      EMBEDDING_URL: http://embedding:8001
      OCR_URL: http://ocr:8868
    volumes:
      - /DATA/notes:/app/data
      - /DATA/logs:/app/logs
    networks:
      - labnote
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`labnote.local`) && PathPrefix(`/api`)"
      - "traefik.http.services.api.loadbalancer.server.port=8000"
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  # React Frontend
  labnote-ui:
    image: labnote/ui:${VERSION:-latest}
    container_name: labnote-ui
    restart: unless-stopped
    networks:
      - labnote
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ui.rule=Host(`labnote.local`)"
      - "traefik.http.services.ui.loadbalancer.server.port=80"
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

  # Ollama LLM Service
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    volumes:
      - /DATA/models/ollama:/root/.ollama
    networks:
      - labnote
    deploy:
      resources:
        limits:
          cpus: '6'
          memory: 8G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ONNX Embedding Service
  embedding:
    image: labnote/embedding:${VERSION:-latest}
    container_name: embedding
    restart: unless-stopped
    environment:
      MODEL_NAME: sentence-transformers/all-MiniLM-L6-v2
      BACKEND: onnx
      OMP_NUM_THREADS: 8
      ONNX_PROVIDER: CPUExecutionProvider
    volumes:
      - /DATA/models/embeddings:/app/models
    networks:
      - labnote
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # PaddleOCR Service
  ocr:
    image: labnote/ocr:${VERSION:-latest}
    container_name: ocr
    restart: unless-stopped
    environment:
      ENABLE_MKLDNN: "True"
      CPU_THREADS: 8
      CPU_MEM: 2000
      USE_GPU: "False"
    volumes:
      - /DATA/models/paddleocr:/root/.paddleocr
    networks:
      - labnote
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 3G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8868/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  labnote:
    driver: bridge

volumes:
  postgres-data:
  ollama-models:
  embedding-models:
  paddleocr-models:
  labnote-data:
```

## Traefik Configuration

### Static Config (`traefik/traefik.yml`)

```yaml
api:
  dashboard: true
  insecure: true  # Disable in production

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt

providers:
  docker:
    exposedByDefault: false
    network: labnote
  file:
    directory: /etc/traefik/dynamic
    watch: true

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

log:
  level: INFO
  filePath: /var/log/traefik/traefik.log

accessLog:
  filePath: /var/log/traefik/access.log
```

## systemd Startup Service

### `/etc/systemd/system/labnote.service`

```ini
[Unit]
Description=LabNote AI Appliance
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/etc/labnote
ExecStartPre=/usr/bin/docker compose pull --quiet
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

**Enable and start**:
```bash
sudo systemctl enable labnote
sudo systemctl start labnote
```

## Embedding Service (FastAPI + ONNX)

### `embedding_service/main.py`

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import os

app = FastAPI()

# Load model with ONNX backend
MODEL_NAME = os.getenv("MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
BACKEND = os.getenv("BACKEND", "onnx")

model = SentenceTransformer(
    MODEL_NAME,
    backend=BACKEND,
    model_kwargs={'provider': 'CPUExecutionProvider'}
)

class EmbedRequest(BaseModel):
    texts: list[str]
    normalize: bool = True

class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimension: int

@app.get("/health")
async def health():
    return {"status": "healthy", "model": MODEL_NAME}

@app.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest):
    try:
        embeddings = model.encode(
            request.texts,
            normalize_embeddings=request.normalize,
            batch_size=32
        )
        return EmbedResponse(
            embeddings=embeddings.tolist(),
            model=MODEL_NAME,
            dimension=embeddings.shape[1]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### `embedding_service/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    fastapi==0.109.0 \
    uvicorn[standard]==0.27.0 \
    sentence-transformers[onnx]==3.2.0 \
    optimum[onnxruntime]==1.20.0

COPY main.py .

# Pre-download model
ENV MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${MODEL_NAME}', backend='onnx')"

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

## OCR Service (PaddleOCR + OpenVINO)

### `ocr_service/Dockerfile`

```dockerfile
FROM paddlecloud/paddleocr:latest

# Install OpenVINO for best Intel CPU performance
RUN pip install --no-cache-dir \
    openvino==2024.0.0 \
    fastapi==0.109.0 \
    uvicorn[standard]==0.27.0

# Enable MKLDNN
ENV ENABLE_MKLDNN=True
ENV CPU_THREADS=8
ENV USE_GPU=False

COPY app.py /app/app.py
WORKDIR /app

# Pre-download models
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en')"

EXPOSE 8868

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8868"]
```

### `ocr_service/app.py`

```python
from fastapi import FastAPI, UploadFile, HTTPException
from paddleocr import PaddleOCR
import os
import numpy as np
from PIL import Image
import io

app = FastAPI()

# Initialize PaddleOCR with optimizations
ocr = PaddleOCR(
    use_angle_cls=True,
    lang='en',
    use_gpu=False,
    enable_mkldnn=True,
    cpu_threads=int(os.getenv("CPU_THREADS", 8)),
    show_log=False
)

@app.get("/health")
async def health():
    return {"status": "healthy", "backend": "paddleocr+mkldnn"}

@app.post("/ocr")
async def extract_text(file: UploadFile):
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        img_array = np.array(image)

        # Perform OCR
        result = ocr.ocr(img_array, cls=True)

        # Extract text
        text_lines = []
        for line in result[0]:
            text_lines.append({
                "text": line[1][0],
                "confidence": float(line[1][1]),
                "bbox": line[0]
            })

        return {
            "lines": text_lines,
            "full_text": "\n".join([l["text"] for l in text_lines])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## First-Run Setup Wizard API

### `backend/app/api/setup.py`

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import psutil
import subprocess
import os

router = APIRouter()

class SystemRequirements(BaseModel):
    cpu_cores: int
    total_ram_gb: float
    available_storage_gb: float
    meets_requirements: bool

class SetupConfig(BaseModel):
    hostname: str
    admin_username: str
    admin_password: str
    admin_email: str | None = None
    data_directory: str = "/DATA"
    enable_ai_features: bool = True
    enable_ocr: bool = True
    enable_semantic_search: bool = True

@router.get("/system-requirements")
async def check_system():
    cpu_cores = psutil.cpu_count(logical=True)
    ram_gb = psutil.virtual_memory().total / (1024**3)
    storage_gb = psutil.disk_usage("/").free / (1024**3)

    meets_requirements = (
        cpu_cores >= 4 and
        ram_gb >= 4 and
        storage_gb >= 20
    )

    return SystemRequirements(
        cpu_cores=cpu_cores,
        total_ram_gb=round(ram_gb, 2),
        available_storage_gb=round(storage_gb, 2),
        meets_requirements=meets_requirements
    )

@router.get("/network-info")
async def get_network_info():
    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)

    return {
        "hostname": hostname,
        "local_ip": local_ip,
        "suggested_hostname": "labnote.local"
    }

@router.post("/configure")
async def configure_system(config: SetupConfig):
    try:
        # Create data directory
        os.makedirs(config.data_directory, exist_ok=True)

        # Set hostname
        subprocess.run(["hostnamectl", "set-hostname", config.hostname], check=True)

        # Create admin user (implement user creation logic)
        # ... (JWT, password hashing, etc.)

        # Write config file
        config_path = "/etc/labnote/config.yml"
        # ... write YAML config

        # Mark setup as complete
        with open("/var/lib/labnote/setup_complete.flag", "w") as f:
            f.write(config.hostname)

        return {"status": "success", "message": "Setup completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/download-models")
async def download_models():
    # Download Ollama models
    subprocess.Popen(["ollama", "pull", "qwen2.5:7b-q4"])

    # Embedding models pre-downloaded in Docker build

    return {"status": "downloading", "message": "Model download started"}
```

## Update Script

### `/usr/local/bin/labnote-update`

```bash
#!/bin/bash
set -e

GITHUB_REPO="your-org/labnote-ai"
CURRENT_VERSION=$(cat /etc/labnote/version.txt)
COMPOSE_FILE="/etc/labnote/docker-compose.yml"

echo "Current version: $CURRENT_VERSION"

# Fetch latest release
LATEST_VERSION=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | jq -r .tag_name)

if [ "$CURRENT_VERSION" == "$LATEST_VERSION" ]; then
    echo "Already on latest version"
    exit 0
fi

echo "New version available: $LATEST_VERSION"

# Backup database
echo "Backing up database..."
docker exec postgres pg_dump -U labnote labnote > "/DATA/backups/pre-update-$CURRENT_VERSION.sql"

# Pull new images
echo "Pulling new images..."
cd /etc/labnote
VERSION=$LATEST_VERSION docker compose pull

# Stop services
echo "Stopping services..."
docker compose down

# Start with new images
echo "Starting services with new images..."
VERSION=$LATEST_VERSION docker compose up -d

# Health check
sleep 10
if docker compose ps | grep -q "unhealthy"; then
    echo "Health check failed! Rolling back..."
    VERSION=$CURRENT_VERSION docker compose up -d
    exit 1
fi

# Update version file
echo $LATEST_VERSION > /etc/labnote/version.txt
echo "Update complete: $CURRENT_VERSION -> $LATEST_VERSION"
```

**Cron job** (`/etc/cron.daily/labnote-update-check`):
```bash
#!/bin/bash
/usr/local/bin/labnote-update >> /var/log/labnote/update.log 2>&1
```

## Backup Script

### `/usr/local/bin/labnote-backup`

```bash
#!/bin/bash
set -e

BACKUP_DIR="/DATA/backups"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Database backup
echo "Backing up database..."
docker exec postgres pg_dump -U labnote labnote | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"

# Notes backup
echo "Backing up notes..."
rsync -a --delete /DATA/notes/ "$BACKUP_DIR/notes-$DATE/"

# Config backup
echo "Backing up config..."
cp /etc/labnote/config.yml "$BACKUP_DIR/config-$DATE.yml"

# Cleanup old backups
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "notes-*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +
find "$BACKUP_DIR" -name "config-*.yml" -mtime +$RETENTION_DAYS -delete

echo "Backup complete: $DATE"
```

**Cron job** (`/etc/cron.daily/labnote-backup`):
```bash
#!/bin/bash
/usr/local/bin/labnote-backup >> /var/log/labnote/backup.log 2>&1
```

## Performance Tuning for ODROID H4

### `/etc/environment` additions

```bash
# ONNX Runtime optimizations
OMP_NUM_THREADS=8
OMP_WAIT_POLICY=ACTIVE
ONNX_RUNTIME_THREADING_STRATEGY=intra_op

# PaddlePaddle MKLDNN
ENABLE_MKLDNN=1
```

### Docker Daemon Config (`/etc/docker/daemon.json`)

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  }
}
```

## Resource Allocation for 16GB RAM System

| Service | CPUs | Memory | Notes |
|---------|------|--------|-------|
| Traefik | 0.5 | 256MB | Lightweight proxy |
| PostgreSQL | 2 | 2GB | Shared buffers tuned |
| FastAPI | 2 | 2GB | API server |
| Frontend | 1 | 512MB | Static serving |
| Ollama | 6 | 8GB | LLM inference (primary workload) |
| Embedding | 4 | 2GB | ONNX CPU inference |
| OCR | 8 | 3GB | PaddleOCR (on-demand) |

**Total**: ~18GB (allows burst for Ollama, OCR scales down when idle)

---

For full research with 50+ sources, see `/docs/research/hardware-appliance-os-architecture-research.md`
