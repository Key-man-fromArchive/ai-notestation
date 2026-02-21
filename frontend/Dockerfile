# @TASK P0-T0.2 - Frontend Dockerfile (React 19 + Vite)
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#system-architecture
#
# Layer caching strategy:
#   1. Copy package.json and lock file first for dependency caching
#   2. Install npm dependencies (cached unless package.json changes)
#   3. Copy application code (changes frequently)

FROM node:22-slim

WORKDIR /app

# Copy dependency definitions first for Docker layer caching
COPY package.json package-lock.json* ./

# Install npm dependencies (run twice to work around npm 10/11 lockfile compat issue)
RUN npm install --legacy-peer-deps && npm install --legacy-peer-deps

# Copy application code
COPY . .

# Expose the Vite dev server port
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
