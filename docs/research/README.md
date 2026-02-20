# Research Documentation

This directory contains research and analysis documents for LabNote AI development.

## Hardware Appliance Research (Feb 2026)

### [Hardware Appliance OS Architecture Research](hardware-appliance-os-architecture-research.md)
**28 KB | 750+ lines | 50+ sources**

Comprehensive analysis of three leading open-source hardware appliance platforms:
- **Umbrel OS**: Bitcoin-focused personal server with Docker ecosystem
- **CasaOS**: Elegant Docker management for personal cloud
- **Synology DSM**: Enterprise-grade NAS operating system

Topics covered:
- Boot/init processes (systemd, A/B partitions)
- Container orchestration patterns (Docker Compose, umbreld daemon)
- Update mechanisms (OTA, image-based)
- First-run setup wizard patterns
- Reverse proxy architectures (Traefik, Caddy, nginx)
- Data persistence strategies
- AI service deployment on Intel N305 (ODROID H4)
  - Ollama (LLM inference)
  - ONNX Runtime (embedding models, 2-3x speedup)
  - PaddleOCR (OpenVINO, 15x faster)

**Key Findings**:
- Recommended: Traefik for automatic service discovery via Docker labels
- Update strategy: Docker image-based (simpler than A/B partitions)
- AI optimization: ONNX Runtime + OpenVINO for Intel CPUs
- Setup wizard: 7-step flow with adaptive feature detection

### [Appliance Quick Reference](appliance-quick-reference.md)
**16 KB | Concrete Implementation Guide**

Ready-to-use code and configuration examples:
- Complete `docker-compose.yml` with all services
- Traefik configuration (static + dynamic)
- systemd startup service
- Embedding service (FastAPI + ONNX)
- OCR service (PaddleOCR + OpenVINO)
- First-run setup wizard API
- Update and backup scripts
- Performance tuning for ODROID H4

**Quick Access**:
- Docker Compose stack → Lines 5-200
- Traefik config → Lines 203-250
- Embedding service → Lines 280-350
- OCR service → Lines 355-420
- Update/backup scripts → Lines 500-600

## NotebookLM Integration

Research summary has been added to the **LabNote Portable Hardware Research** notebook (`hw-research` alias):
- Source: "OS Architecture Research Summary (Feb 2026)"
- Query examples:
  ```bash
  nlm notebook query hw-research "How does Umbrel handle OTA updates?"
  nlm notebook query hw-research "Best reverse proxy for Docker auto-discovery?"
  nlm notebook query hw-research "PaddleOCR optimization for Intel CPU"
  ```

## Implementation Roadmap

12-week plan to build LabNote AI hardware appliance:

1. **Weeks 1-2**: Core infrastructure (Ubuntu 24.04, systemd, Docker Compose, Traefik)
2. **Weeks 3-4**: Setup wizard (React UI, resource detection, model download)
3. **Weeks 5-6**: AI services (Ollama, ONNX embeddings, PaddleOCR)
4. **Weeks 7-8**: Data persistence & backup (volume management, auto-backup)
5. **Weeks 9-10**: Update system (version manifest, Docker orchestration, rollback)
6. **Weeks 11-12**: Testing & documentation (benchmarks, user docs, disk images)

## Target Hardware

**Primary**: ODROID H4 Ultra
- CPU: Intel Core i3 N305 (8-core, 3.8 GHz boost)
- RAM: 16-48 GB DDR5-4800
- Storage: NVMe SSD
- TDP: 15W (efficient 24/7 operation)

**Also Compatible**: Intel NUCs, ZimaBoard, other x86-64 mini PCs

## Related Documentation

- [VISION.md](../roadmap/VISION.md) - Product vision and positioning
- [UI_UX_INNOVATION_ROADMAP.md](../roadmap/UI_UX_INNOVATION_ROADMAP.md) - SiYuan-inspired UX
- [ROADMAP.md](../../ROADMAP.md) - Feature roadmap (Phases 1-5 complete)

---

**Last Updated**: February 18, 2026
