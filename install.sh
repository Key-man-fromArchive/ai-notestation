#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# LabNote AI — Interactive Install Script
# ─────────────────────────────────────────────

# Color support (fallback to no-op if terminal doesn't support it)
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  BOLD=$(tput bold)
  GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3)
  RED=$(tput setaf 1)
  CYAN=$(tput setaf 6)
  RESET=$(tput sgr0)
else
  BOLD="" GREEN="" YELLOW="" RED="" CYAN="" RESET=""
fi

# ── Flags ────────────────────────────────────
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
    -h|--help)
      echo "Usage: $0 [--yes|-y]"
      echo "  --yes, -y   Non-interactive mode (skip prompts, use defaults)"
      exit 0
      ;;
  esac
done

# ── Helpers ──────────────────────────────────
info()  { echo "${GREEN}[INFO]${RESET}  $*"; }
warn()  { echo "${YELLOW}[WARN]${RESET}  $*"; }
err()   { echo "${RED}[ERROR]${RESET} $*" >&2; }
ask()   {
  if $AUTO_YES; then
    echo ""
    return
  fi
  local prompt="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    read -rp "${CYAN}$prompt${RESET} [$default]: " answer
    echo "${answer:-$default}"
  else
    read -rp "${CYAN}$prompt${RESET}: " answer
    echo "$answer"
  fi
}

# ── Banner ───────────────────────────────────
echo ""
echo "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║          LabNote AI Installer        ║"
echo "  ║     AI-Powered Research Platform     ║"
echo "  ╚══════════════════════════════════════╝"
echo "${RESET}"

# ── 1. Pre-flight checks ────────────────────
info "Running pre-flight checks..."

# Docker
if ! command -v docker &>/dev/null; then
  err "Docker is not installed. Please install Docker first: https://docs.docker.com/get-docker/"
  exit 1
fi
info "Docker found: $(docker --version)"

# Docker Compose
COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  err "Docker Compose is not installed."
  err "Install it via: https://docs.docker.com/compose/install/"
  exit 1
fi
info "Docker Compose found: $COMPOSE_CMD"

# Port availability
check_port() {
  local port=$1 name=$2
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || \
     lsof -i ":${port}" &>/dev/null 2>&1; then
    warn "Port $port ($name) is already in use. Containers may fail to start."
  fi
}
check_port 3000 "Frontend"
check_port 5432 "PostgreSQL"
check_port 8001 "Backend API"

echo ""

# ── 2. Environment setup ────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f .env ]]; then
  info ".env file already exists — skipping environment setup."
  info "To reconfigure, delete .env and re-run this script."
else
  info "Setting up environment variables..."
  cp .env.example .env

  # Auto-generate secrets
  JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  info "Generated JWT_SECRET"

  # Generate OAUTH_ENCRYPTION_KEY (Fernet-compatible)
  if command -v python3 &>/dev/null && python3 -c "from cryptography.fernet import Fernet" 2>/dev/null; then
    OAUTH_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  else
    OAUTH_KEY=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  fi
  sed -i "s|^OAUTH_ENCRYPTION_KEY=.*|OAUTH_ENCRYPTION_KEY=${OAUTH_KEY}|" .env
  info "Generated OAUTH_ENCRYPTION_KEY"

  if ! $AUTO_YES; then
    echo ""
    echo "${BOLD}Synology NAS Configuration (optional — press Enter to skip)${RESET}"
    NAS_URL=$(ask "  NAS URL (e.g. http://192.168.1.100:5000)")
    if [[ -n "$NAS_URL" ]]; then
      NAS_USER=$(ask "  NAS Username" "admin")
      NAS_PASS=$(ask "  NAS Password")
      sed -i "s|^SYNOLOGY_URL=.*|SYNOLOGY_URL=${NAS_URL}|" .env
      sed -i "s|^SYNOLOGY_USER=.*|SYNOLOGY_USER=${NAS_USER}|" .env
      sed -i "s|^SYNOLOGY_PASSWORD=.*|SYNOLOGY_PASSWORD=${NAS_PASS}|" .env
      info "NAS configuration saved."
    else
      info "Skipping NAS configuration."
    fi

    echo ""
    echo "${BOLD}AI API Keys (optional — at least one recommended)${RESET}"
    OPENAI_KEY=$(ask "  OpenAI API Key")
    ANTHROPIC_KEY=$(ask "  Anthropic API Key")
    GOOGLE_KEY=$(ask "  Google API Key")
    ZHIPUAI_KEY=$(ask "  ZhipuAI API Key")

    [[ -n "$OPENAI_KEY" ]]    && sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI_KEY}|" .env
    [[ -n "$ANTHROPIC_KEY" ]] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_KEY}|" .env
    [[ -n "$GOOGLE_KEY" ]]    && sed -i "s|^GOOGLE_API_KEY=.*|GOOGLE_API_KEY=${GOOGLE_KEY}|" .env
    [[ -n "$ZHIPUAI_KEY" ]]   && sed -i "s|^ZHIPUAI_API_KEY=.*|ZHIPUAI_API_KEY=${ZHIPUAI_KEY}|" .env

    KEY_COUNT=0
    [[ -n "$OPENAI_KEY" ]]    && ((KEY_COUNT++)) || true
    [[ -n "$ANTHROPIC_KEY" ]] && ((KEY_COUNT++)) || true
    [[ -n "$GOOGLE_KEY" ]]    && ((KEY_COUNT++)) || true
    [[ -n "$ZHIPUAI_KEY" ]]   && ((KEY_COUNT++)) || true

    if [[ $KEY_COUNT -gt 0 ]]; then
      info "$KEY_COUNT AI provider(s) configured."
    else
      warn "No AI keys configured. AI features will be unavailable."
      warn "You can add them later by editing the .env file."
    fi
  else
    info "Non-interactive mode — using defaults for optional settings."
    info "Edit .env later to add NAS and AI API keys."
  fi
  echo ""
fi

# ── 3. Build & Start ────────────────────────
info "Building and starting containers..."
$COMPOSE_CMD up -d --build

# ── 4. Wait for DB ──────────────────────────
info "Waiting for database to be ready..."
SECONDS_WAITED=0
MAX_WAIT=60
while [[ $SECONDS_WAITED -lt $MAX_WAIT ]]; do
  if docker exec labnote-db pg_isready -U labnote -d labnote &>/dev/null; then
    break
  fi
  sleep 2
  SECONDS_WAITED=$((SECONDS_WAITED + 2))
  printf "."
done
echo ""

if [[ $SECONDS_WAITED -ge $MAX_WAIT ]]; then
  err "Database did not become ready within ${MAX_WAIT}s."
  err "Check logs: $COMPOSE_CMD logs db"
  exit 1
fi
info "Database is ready. (${SECONDS_WAITED}s)"

# ── 5. Run Migrations ───────────────────────
info "Running database migrations..."
$COMPOSE_CMD exec -T backend alembic upgrade head
info "Migrations complete."

# ── 6. Success ───────────────────────────────
echo ""
echo "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║     LabNote AI is up and running!    ║"
echo "  ╚══════════════════════════════════════╝"
echo "${RESET}"
echo "  ${CYAN}Frontend${RESET}   http://localhost:3000"
echo "  ${CYAN}API Docs${RESET}   http://localhost:8001/docs"
echo ""
echo "  ${BOLD}Next steps:${RESET}"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Create your account via the Sign Up page"
echo "  3. (Optional) Configure NAS & AI keys in Settings"
echo ""
echo "  Useful commands:"
echo "    $COMPOSE_CMD logs -f        # View logs"
echo "    $COMPOSE_CMD down           # Stop all services"
echo "    $COMPOSE_CMD up -d          # Restart services"
echo ""
