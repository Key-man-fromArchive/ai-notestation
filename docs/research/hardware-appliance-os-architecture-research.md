# Hardware Appliance OS Architecture Research

**Research Date**: February 18, 2026
**Purpose**: Design patterns for LabNote AI hardware appliance based on successful open-source products

---

## Executive Summary

This research analyzes three leading open-source hardware appliance platforms (Umbrel OS, CasaOS, Synology DSM) and evaluates deployment strategies for AI services (Ollama, embedding models, PaddleOCR) on Intel N305-based hardware (ODROID H4).

**Key Findings**:
- **Container orchestration**: Docker Compose with automatic service discovery via labels (Traefik/Caddy)
- **Update mechanism**: Dual A/B partition OTA or systemd-managed service updates
- **Setup wizard**: Web-based first-run configuration with admin user creation
- **Reverse proxy**: Automatic container discovery using Docker labels + Let's Encrypt
- **AI inference**: ONNX Runtime for embeddings (2-3x speedup), OpenVINO for PaddleOCR on Intel CPUs

---

## Platform Analysis

### 1. Umbrel OS

**Architecture**: Bitcoin-focused personal server OS with Docker-based app ecosystem

#### Boot/Init Process
- **systemd integration**: `umbrel-startup.service` handles initialization at boot
- Eliminates rc.local boot scripts, reduces first-boot time
- Services installed at `/etc/systemd/system/`
- Dual-partition (A/B) root filesystem for safe updates

#### Container Orchestration
- **Docker + Docker Compose** for all applications
- Central `umbreld` daemon (backend service) coordinates:
  - User management
  - App store operations
  - App lifecycle (install/start/stop/remove)
  - File management
  - System operations
- **tRPC API layer** connects React frontend to umbreld backend
- Apps isolated in Docker containers with web-based UIs
- Auto-patching of docker-compose.yml for compatibility
- Dependency resolution built into app platform

#### Update Mechanism (OTA)
- **Dual-partition A/B upgrade model**
- Updates applied to inactive partition while running from active
- Systemd services updated during OTA
- Historical issue: SD card vs. external storage sync challenges
- Recent improvements to handle custom installations

#### App Store
- **Supports ARM64 and x86-64** architectures
- Apps defined in GitHub repository: `getumbrel/umbrel-apps`
- Each app has:
  - `docker-compose.yml`
  - App metadata (name, version, description)
  - Resource requirements
- Features: Tor support, resource monitoring, auto-discovery
- Users can install third-party Docker containers outside app store

#### Networking/Reverse Proxy
- Uses nginx or Traefik (community preference varies)
- Automatic HTTPS with Let's Encrypt
- Tor hidden service support for each app

#### Data Persistence
- External storage support (USB drives, SSDs)
- App data volumes managed per container
- Configuration stored in umbreld database

**Sources**:
- [Umbrel Apps GitHub](https://github.com/getumbrel/umbrel-apps)
- [Umbrel systemd services OTA updates](https://github.com/getumbrel/umbrel/issues/109)
- [Enable Umbrel systemd services at build](https://github.com/getumbrel/umbrel-os/pull/89)

---

### 2. CasaOS

**Architecture**: Elegant Docker management UI for personal cloud systems

#### Boot/Init Process
- **Not a standalone OS** - runs on top of Ubuntu, Debian, Raspberry Pi OS, CentOS
- One-liner installation script for quick deployment
- Full compatibility with x86 (Intel NUC, ZimaBoard) and ARM (Raspberry Pi)

#### Container Orchestration
- **Docker daemon socket access required** (`/var/run/docker.sock`)
- `entrypoint.sh` orchestrates service startup with dependency order and readiness checks
- Two critical mounts:
  1. Data volume for persistence (`/DATA`)
  2. Docker socket for container management
- CasaOS-LocalStorage service for disk management
- **MergerFS integration** for combining multiple storage devices into `/DATA`

#### First-Run Setup Wizard
- Web-based wizard prompts for:
  - Admin username and password creation
  - Basic network configuration
- Immediate access to web UI after first login

#### App Management
- Custom app store with Docker Compose templates
- Export/import application configurations
- No built-in backup/restore (community-requested feature)

#### Networking/Reverse Proxy
- Integrates with external reverse proxies (Traefik, Caddy, nginx)
- No built-in automatic reverse proxy like Umbrel
- Users typically run nginx Proxy Manager as separate container

#### Data Persistence Strategy
- **Primary data location**: `/DATA` (MergerFS union mount)
- **System/app data**: `/var/lib/casaos`
- Backup strategy (community scripts):
  1. Stop all containers
  2. Zip each app's Docker volumes
  3. Restart containers
- Recommendation: USB SSDs for data, SD cards only for OS
- Volume migration supported via manual copy to new drives

**Sources**:
- [CasaOS GitHub](https://github.com/IceWhaleTech/CasaOS)
- [Run CasaOS inside Docker container guide](https://www.blog.brightcoding.dev/2025/12/10/%F0%9F%9A%80-run-casaos-inside-a-docker-container-the-ultimate-safety-first-guide-for-2025)
- [CasaOS data migration guide](https://community.bigbeartechworld.com/t/how-to-migrate-casaos-data-to-a-new-drive-and-mount-it-permanently/217)
- [CasaOS backup discussion](https://github.com/IceWhaleTech/CasaOS/issues/1041)

---

### 3. Synology DSM

**Architecture**: Proprietary Linux-based OS for NAS appliances

#### Linux Base
- **Linux kernel** with custom init system
- nginx pre-installed as core web server
- Layered architecture:
  - Hardware drivers (custom for Synology hardware)
  - Linux kernel
  - DSM core services
  - Package system (Synology packages)
  - Web UI

#### Reverse Proxy
- **Built-in nginx reverse proxy** in Application Portal
- GUI configuration generates `/etc/nginx/app.d/server.ReverseProxy.conf`
- Each reverse proxy rule = new server block in nginx config
- Standard ports:
  - 80/443: nginx reverse proxy (external)
  - 5000/5001: DSM web interface (internal)
- Advanced users can inject custom nginx config via includes in `/etc/nginx/nginx.conf`

#### Package Management
- Centralized Package Center with official + community repositories
- Packages installed to `/var/packages/`
- Docker support via Docker package
- Resource scheduling (CPU/memory limits per package)

#### Update Mechanism
- **DSM Update** system with delta updates
- Downloaded to separate partition, verified, then applied
- Rollback capability if update fails
- Automatic or manual update modes

#### Networking Features
- **Let's Encrypt integration** for automatic SSL certificates
- Dynamic DNS support (multiple providers)
- Firewall, VPN server/client
- Link aggregation, bonding, VLANs

**Sources**:
- [Synology Reverse Proxy under the hood](https://www.synoforum.com/resources/synology-reverse-proxy-under-the-hood.135/)
- [nginx reverse proxy on Synology](https://www.devxperiences.com/pzwp1/2021/01/13/configuring-nginx-as-a-proxy-server-on-a-synology-nas-server/)
- [Access DSM through nginx reverse proxy](https://forum.synology.com/enu/viewtopic.php?t=101676)

---

## Reverse Proxy Pattern Comparison

### Traefik (Recommended for Auto-Discovery)

**Advantages**:
- **Automatic service discovery** via Docker labels
- Native Let's Encrypt integration
- Dynamic configuration updates (no reload needed)
- HTTP/2, gRPC support

**Configuration Pattern**:
```yaml
# docker-compose.yml
services:
  myapp:
    image: myapp:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.tls=true"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
```

**Sources**:
- [Automatic Docker reverse-proxy with Traefik](https://cylab.be/blog/258/automatic-docker-reverse-proxy-with-traefik)
- [Service AutoDiscovery Using Traefik](https://medium.com/@deepeshtripathi/service-autodiscovery-using-traefik-for-docker-containers-6f3f2ef4f1e1)

### Caddy (Simplest Configuration)

**Advantages**:
- **Automatic HTTPS** by default
- Simpler configuration syntax
- Lower resource usage than Traefik

**Configuration Pattern** (with caddy-docker-proxy):
```yaml
# docker-compose.yml
services:
  myapp:
    image: myapp:latest
    labels:
      - "caddy=service.example.com"
      - "caddy.reverse_proxy={{upstreams}}"
```

**Limitation**: No native Docker service discovery; requires `caddy-docker-proxy` add-on

**Sources**:
- [Caddy Docker Proxy GitHub](https://github.com/lucaslorentz/caddy-docker-proxy)
- [Reverse Proxy Comparison: Traefik vs. Caddy vs. Nginx](https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/)

---

## First-Run Setup Wizard Patterns

### Common Elements
1. **Network detection**: Auto-discover local IP, suggest hostname
2. **Admin account creation**: Username + strong password
3. **Storage configuration**: Select data directory or mount external drive
4. **Timezone/locale selection**
5. **Optional services**: Enable/disable components based on resources

### Implementation Patterns

**UniFi OS Server** (Ubiquiti):
- Web-based wizard on first boot
- Steps: Network → Admin → Cloud (optional) → Finish
- Self-hosted mode skips cloud registration

**Homey Self-Hosted**:
- Hardware-first approach (ships as appliance)
- Wizard accessible via local network discovery
- Minimal configuration required

**Check Point Appliances**:
- CLI wizard option for headless setup
- Web wizard for GUI setup
- Two-stage: basic config → advanced features

**Red Hat Virtualization**:
- Automated setup scripts for self-hosted engine
- Answer file for unattended installation
- Health check integration post-setup

**Sources**:
- [UniFi OS Server self-hosting](https://itadon.com/blog/unifi-os-server-self-hosting/)
- [Check Point First Time Configuration Wizard](https://sc1.checkpoint.com/documents/SMB_R80.20.50/Help/Locally_Managed/EN/Topics/First-Time-Configuration-Wizard.htm)
- [Red Hat Virtualization Self-Hosted Engine Guide](https://docs.redhat.com/en/documentation/red_hat_virtualization/4.0/html-single/self-hosted_engine_guide/index)

---

## AI Service Deployment on ODROID H4 (Intel N305)

### Hardware Profile: ODROID H4 Ultra
- **CPU**: Intel Core i3 N305 (8-core, 2.0 GHz base, 3.8 GHz boost)
- **Memory**: Up to 48 GB DDR5-4800
- **Architecture**: x86-64 (Alder Lake-N)
- **TDP**: 15W (efficient for 24/7 operation)

**Source**: [ODROID H4 Ultra product page](https://www.hardkernel.com/shop/odroid-h4-ultra/)

---

### 1. Ollama (LLM Inference)

#### Deployment Strategy
- **Docker**: Official `ollama/ollama` image or CPU-optimized variants
- **CPU-only mode** (no GPU required)
- Accept network connections via environment variables

#### Configuration
```bash
# Install Ollama on ODROID H4
curl -fsSL https://ollama.com/install.sh | sh

# Docker deployment
docker run -d \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  --name ollama \
  ollama/ollama
```

#### Performance Considerations
- Use smaller quantized models (7B Q4, 13B Q4) for CPU inference
- `num_thread` parameter tuning for N305's 8 cores
- Expected throughput: 5-15 tokens/sec for 7B models on CPU

**Sources**:
- [How to Run Ollama on ODROID H4](https://www.picocluster.com/blogs/picocluster-software-engineering/run-ollama-local-ai-chat-odroid-h4)
- [Ollama CPU Docker image](https://hub.docker.com/r/arunskurian/ollama-cpu)

---

### 2. Embedding Model Serving (sentence-transformers)

#### ONNX Runtime (Recommended)

**Performance Gains**:
- **2-3x speedup** on CPU vs. vanilla PyTorch
- **Up to 3x with quantization** (INT8) at minimal accuracy loss
- Specific benchmark: 25.6ms → 12.3ms latency (2.09x) with 100% accuracy retention

#### Implementation
```python
from sentence_transformers import SentenceTransformer

# Load with ONNX backend
model = SentenceTransformer(
    'sentence-transformers/all-MiniLM-L6-v2',
    backend='onnx',
    model_kwargs={'provider': 'CPUExecutionProvider'}
)

# Inference
embeddings = model.encode(["Hello world", "Another sentence"])
```

#### Installation
```bash
pip install sentence-transformers[onnx]
# or for full optimization toolkit
pip install sentence-transformers optimum[onnxruntime]
```

#### Best Practices
- **Model selection**: Use efficient models (all-MiniLM-L6-v2, all-mpnet-base-v2)
- **Batch processing**: Process multiple texts together for better CPU utilization
- **Quantization**: Apply INT8 quantization via Optimum library
- **Thread tuning**: Match OMP_NUM_THREADS to available cores (8 for N305)

#### Alternative: OpenVINO Backend
- Intel-optimized inference engine
- Similar speedup to ONNX Runtime on Intel CPUs
- Better integration with Intel hardware features (AVX-512, VNNI)

**Sources**:
- [Speeding up Inference - Sentence Transformers docs](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- [Sentence Transformers v3.2.0 - ONNX improvements](https://www.marktechpost.com/2024/10/17/from-onnx-to-static-embeddings-what-makes-sentence-transformers-v3-2-0-a-game-changer/)
- [Accelerate Sentence Transformers with Hugging Face Optimum](https://www.philschmid.de/optimize-sentence-transformers)

---

### 3. PaddleOCR (Document OCR)

#### CPU Optimization Strategies

**1. MKLDNN Acceleration**
- Intel Math Kernel Library for Deep Neural Networks
- Significant speedup on Intel CPUs
- Can reduce inference time from 30s to 6s per page (Docker vs. optimized)

**Enabling MKLDNN**:
```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(
    use_angle_cls=True,
    lang='en',
    use_gpu=False,
    enable_mkldnn=True,  # Enable Intel optimization
    cpu_threads=8,       # Match N305 core count
)
```

**2. OpenVINO Conversion (Best Performance)**

**Conversion Path**: PaddlePaddle → ONNX → OpenVINO

**Benefits**:
- Intel CPU-optimized inference
- INT8 quantization support
- Up to **15x faster** inference with optimizations
- Lower memory footprint

**Deployment**:
```bash
# Install OpenVINO
pip install openvino openvino-dev

# Convert PaddleOCR model to ONNX
paddle2onnx --model_dir paddleocr_model \
            --model_filename inference.pdmodel \
            --params_filename inference.pdiparams \
            --save_file model.onnx

# Convert ONNX to OpenVINO IR
mo --input_model model.onnx --output_dir openvino_model
```

#### Docker Deployment

**Official Image**:
```dockerfile
FROM paddlecloud/paddleocr:latest

# Enable MKLDNN and set CPU threads
ENV ENABLE_MKLDNN=True
ENV CPU_THREADS=8
ENV CPU_MEM=2000  # Memory cleanup threshold (MB)

# Expose API port
EXPOSE 8868

CMD ["python3", "-m", "paddleocr", "--use_gpu=False"]
```

#### Memory Management
- Stable at ~1.5 GB after processing many images
- Use `--cpu_mem` parameter to trigger cleanup when threshold exceeded
- Docker resource limits recommended: `--memory=3g --cpus=8`

#### Production Best Practices
- **Pre-download models** to avoid runtime latency
- **Fixed model paths** for consistency
- **Load balancing** for high-availability deployments
- **Version pinning**: Lock paddlepaddle and paddleocr versions
- **Health check endpoints** for monitoring

**Sources**:
- [PaddleOCR High-Performance Inference docs](http://www.paddleocr.ai/main/en/version3.x/deployment/high_performance_inference.html)
- [PaddleOCR Docker slow inference issue](https://github.com/PaddlePaddle/PaddleOCR/issues/10147)
- [PaddleOCR in Production Systems](https://medium.com/@ankitladva11/what-it-really-takes-to-use-paddleocr-in-production-systems-d63e38ded55e)
- [PaddleOCR inference 15x faster with OpenVINO](https://medium.com/@sachadehe/paddleocr-inference-up-to-15x-faster-ii-95a38bf13c71)
- [OpenVINO PaddlePaddle support](https://blog.openvino.ai/blog-posts/openvino-tm-enable-paddlepaddle-quantized-model)

---

## Architecture Recommendations for LabNote AI Appliance

### Recommended Stack

#### OS Layer
- **Base OS**: Ubuntu Server 24.04 LTS (minimal install)
- **Init system**: systemd with custom `labnote-startup.service`
- **Container runtime**: Docker Engine + Docker Compose V2

#### Application Layer
```
┌─────────────────────────────────────────┐
│         LabNote Web UI (React)          │
│     Port 3000 (internal via Traefik)    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Traefik Reverse Proxy v3.x         │
│        Ports 80/443 (external)          │
│    - Auto service discovery             │
│    - Let's Encrypt ACME                 │
│    - Docker label configuration         │
└─────────────────────────────────────────┘
                    ↓
┌──────────────┬──────────────┬───────────┐
│  FastAPI     │  PostgreSQL  │  AI Stack │
│  Backend     │  + pgvector  │           │
│              │              │  - Ollama │
│              │              │  - ONNX   │
│              │              │  - OCR    │
└──────────────┴──────────────┴───────────┘
```

#### Docker Compose Service Definitions

**Core Services**:
1. **PostgreSQL 16 + pgvector**: Database with vector extensions
2. **FastAPI Backend**: Main API server
3. **React Frontend**: Build artifacts served via nginx
4. **Traefik**: Reverse proxy with auto-discovery
5. **Ollama**: LLM inference engine
6. **Embedding Service**: ONNX Runtime-based FastAPI service
7. **OCR Service**: PaddleOCR with MKLDNN/OpenVINO

**Configuration Pattern**:
```yaml
services:
  traefik:
    image: traefik:v3.1
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik:/etc/traefik
      - ./letsencrypt:/letsencrypt
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.local`)"

  labnote-api:
    image: labnote/api:latest
    depends_on:
      - postgres
      - ollama
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`labnote.local`) && PathPrefix(`/api`)"
      - "traefik.http.services.api.loadbalancer.server.port=8000"

  labnote-ui:
    image: labnote/ui:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.ui.rule=Host(`labnote.local`)"
      - "traefik.http.services.ui.loadbalancer.server.port=80"

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-models:/root/.ollama
    deploy:
      resources:
        limits:
          cpus: '6'
          memory: 8G

  embedding:
    image: labnote/embedding:latest
    environment:
      - OMP_NUM_THREADS=8
      - ONNX_PROVIDER=CPUExecutionProvider
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 2G

  ocr:
    image: labnote/ocr:latest
    environment:
      - ENABLE_MKLDNN=True
      - CPU_THREADS=8
      - CPU_MEM=2000
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 3G

volumes:
  postgres-data:
  ollama-models:
  labnote-data:
```

### Update Mechanism

**Approach**: Docker image-based updates (simpler than A/B partitions)

1. **Version manifest** hosted on GitHub releases
2. **Update check**: Daily cron job compares current vs. available version
3. **Update process**:
   - Download new Docker images
   - Stop services (graceful shutdown)
   - Backup database
   - Start services with new images
   - Health check verification
   - Rollback on failure (restore old images)

**Advantages over A/B partitions**:
- No complex partition management
- Smaller download size (only changed layers)
- Easier development and testing
- Standard Docker workflow

### First-Run Setup Wizard

**Flow**:
1. **Welcome screen**: Detect language, show system requirements check
2. **Network configuration**:
   - Auto-detect local IP
   - Set hostname (default: `labnote.local`)
   - Configure DNS (optional)
3. **Admin account**:
   - Username
   - Strong password (with strength meter)
   - Email (optional, for notifications)
4. **Storage setup**:
   - Detect available drives
   - Select data directory (default: `/DATA`)
   - Optional: Mount external USB drive for backups
5. **Feature selection** (adaptive to resources):
   - Detect RAM: Enable AI features if ≥8GB
   - Detect CPU cores: Tune thread counts
   - Checkboxes: OCR, LLM assistant, Semantic search
6. **Model download** (if AI enabled):
   - Progress bar for downloading:
     - Ollama model (e.g., qwen2.5:7b-q4)
     - Embedding model (all-MiniLM-L6-v2)
     - PaddleOCR models
7. **Summary & Launch**:
   - Show configuration summary
   - "Start LabNote AI" button
   - Auto-redirect to main UI on completion

**Implementation**: FastAPI backend endpoint `/api/setup` with React wizard UI

### Data Persistence Strategy

**Directory Structure**:
```
/DATA/
├── postgres/          # PostgreSQL data
├── notes/             # Uploaded files, attachments
├── models/            # Ollama models, embedding cache
├── backups/           # Automatic daily backups
└── logs/              # Application logs

/etc/labnote/
├── config.yml         # User configuration
└── docker-compose.yml # Service definitions

/var/lib/labnote/
└── setup_complete.flag  # First-run wizard status
```

**Backup Strategy**:
- **Daily automatic backups** to `/DATA/backups/`
- **Retention**: 7 days local, optional offsite sync
- **Backup contents**:
  - PostgreSQL dump (pg_dump)
  - `/DATA/notes/` directory (rsync)
  - Configuration files
- **Restore wizard**: Accessible from settings or CLI

---

## Comparative Summary

| Feature | Umbrel OS | CasaOS | Synology DSM | LabNote AI (Recommended) |
|---------|-----------|--------|--------------|--------------------------|
| **Base OS** | Custom Linux | Runs on Ubuntu/Debian | Proprietary Linux | Ubuntu Server 24.04 |
| **Container Runtime** | Docker | Docker | Docker | Docker + Compose V2 |
| **Reverse Proxy** | nginx/Traefik | External (manual) | nginx (built-in) | Traefik (auto-discovery) |
| **Service Discovery** | App metadata + daemon | Manual config | GUI-generated nginx | Docker labels |
| **Update Method** | A/B partition OTA | APT packages | Delta updates | Docker image pull |
| **First-Run Wizard** | Web-based | Web-based | Hardware-integrated | Web-based (FastAPI + React) |
| **Backup** | Manual/3rd-party | Community scripts | Hyper Backup | Built-in daily auto-backup |
| **AI Optimization** | N/A | N/A | Limited | ONNX, OpenVINO, MKLDNN |
| **Target Hardware** | RPi, x86 mini-PC | RPi, x86, NAS | Synology hardware | ODROID H4, Intel NUCs |
| **License** | Open source | Open source | Proprietary | Open source (AGPL v3) |

---

## Implementation Roadmap for LabNote AI Appliance

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create minimal Ubuntu 24.04 base image
- [ ] Develop systemd startup service
- [ ] Build Docker Compose stack with Traefik
- [ ] Implement health check endpoints

### Phase 2: Setup Wizard (Week 3-4)
- [ ] Design wizard UI (React)
- [ ] Implement `/api/setup` backend logic
- [ ] Resource detection (RAM, CPU, storage)
- [ ] Admin account creation + JWT auth
- [ ] Model download with progress tracking

### Phase 3: AI Service Integration (Week 5-6)
- [ ] Containerize Ollama with pre-configured models
- [ ] Build ONNX Runtime embedding service (FastAPI)
- [ ] Integrate PaddleOCR with OpenVINO/MKLDNN
- [ ] Performance benchmarking on ODROID H4
- [ ] Adaptive service scaling based on resources

### Phase 4: Data Persistence & Backup (Week 7-8)
- [ ] Implement `/DATA` volume management
- [ ] Automatic daily backup service (cron)
- [ ] Backup/restore wizard UI
- [ ] External drive detection and mounting
- [ ] Migration tool for existing LabNote installations

### Phase 5: Update System (Week 9-10)
- [ ] Version manifest service (GitHub API)
- [ ] Docker image update orchestration
- [ ] Pre-flight checks (disk space, compatibility)
- [ ] Rollback mechanism on failure
- [ ] Update notification system

### Phase 6: Testing & Documentation (Week 11-12)
- [ ] End-to-end testing on ODROID H4
- [ ] Performance benchmarking vs. cloud deployment
- [ ] User documentation (setup, maintenance)
- [ ] Video tutorial for first-run wizard
- [ ] Publish disk images for direct flashing

---

## References

### Umbrel OS
- [Umbrel Apps GitHub Repository](https://github.com/getumbrel/umbrel-apps)
- [Update Umbrel OS systemd services via OTA updates](https://github.com/getumbrel/umbrel/issues/109)
- [Enable Umbrel systemd services at build](https://github.com/getumbrel/umbrel-os/pull/89)
- [Umbrel Review 2026](https://blockdyor.com/umbrel-review/)

### CasaOS
- [CasaOS GitHub Repository](https://github.com/IceWhaleTech/CasaOS)
- [Run CasaOS Inside Docker Container Guide](https://www.blog.brightcoding.dev/2025/12/10/%F0%9F%9A%80-run-casaos-inside-a-docker-container-the-ultimate-safety-first-guide-for-2025)
- [CasaOS Data Migration Guide](https://community.bigbeartechworld.com/t/how-to-migrate-casaos-data-to-a-new-drive-and-mount-it-permanently/217)
- [CasaOS Backup Discussion](https://github.com/IceWhaleTech/CasaOS/issues/1041)

### Synology DSM
- [Synology Reverse Proxy Under the Hood](https://www.synoforum.com/resources/synology-reverse-proxy-under-the-hood.135/)
- [Configuring NGINX as Reverse Proxy on Synology](https://www.devxperiences.com/pzwp1/2021/01/13/configuring-nginx-as-a-proxy-server-on-a-synology-nas-server/)

### Reverse Proxy
- [Automatic Docker Reverse-Proxy with Traefik](https://cylab.be/blog/258/automatic-docker-reverse-proxy-with-traefik)
- [Caddy Docker Proxy GitHub](https://github.com/lucaslorentz/caddy-docker-proxy)
- [Reverse Proxy Comparison: Traefik vs. Caddy vs. Nginx](https://www.programonaut.com/reverse-proxies-compared-traefik-vs-caddy-vs-nginx-docker/)

### ODROID H4 / Ollama
- [ODROID H4 Ultra Product Page](https://www.hardkernel.com/shop/odroid-h4-ultra/)
- [How to Run Ollama on ODROID H4](https://www.picocluster.com/blogs/picocluster-software-engineering/run-ollama-local-ai-chat-odroid-h4)

### Embedding Models
- [Speeding up Inference - Sentence Transformers](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- [Sentence Transformers v3.2.0 Game-Changer](https://www.marktechpost.com/2024/10/17/from-onnx-to-static-embeddings-what-makes-sentence-transformers-v3-2-0-a-game-changer/)
- [Accelerate Sentence Transformers with Hugging Face Optimum](https://www.philschmid.de/optimize-sentence-transformers)

### PaddleOCR
- [PaddleOCR High-Performance Inference](http://www.paddleocr.ai/main/en/version3.x/deployment/high_performance_inference.html)
- [PaddleOCR Docker Slow Inference Issue](https://github.com/PaddlePaddle/PaddleOCR/issues/10147)
- [PaddleOCR in Production Systems](https://medium.com/@ankitladva11/what-it-really-takes-to-use-paddleocr-in-production-systems-d63e38ded55e)
- [PaddleOCR 15x Faster with OpenVINO](https://medium.com/@sachadehe/paddleocr-inference-up-to-15x-faster-ii-95a38bf13c71)
- [OpenVINO PaddlePaddle Support](https://blog.openvino.ai/blog-posts/openvino-tm-enable-paddlepaddle-quantized-model)

### Setup Wizards
- [UniFi OS Server Self-Hosting](https://itadon.com/blog/unifi-os-server-self-hosting/)
- [Check Point First Time Configuration Wizard](https://sc1.checkpoint.com/documents/SMB_R80.20.50/Help/Locally_Managed/EN/Topics/First-Time-Configuration-Wizard.htm)
- [Red Hat Virtualization Self-Hosted Engine Guide](https://docs.redhat.com/en/documentation/red_hat_virtualization/4.0/html-single/self-hosted_engine_guide/index)
