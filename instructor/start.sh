#!/usr/bin/env bash
# Serve the workbench and print the local-model setup it expects.
# Usage: ./start.sh [port]      (default 8099)
set -euo pipefail

PORT="${1:-8099}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGIN="http://localhost:${PORT}"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required to serve the files."; exit 1; }

cat <<BANNER

  Instructor Workbench
  ────────────────────────────────────────────────────────────
  App:      ${ORIGIN}
  Serving:  ${DIR}

  For AI review with a local model, in a SECOND terminal:

    OLLAMA_ORIGINS=${ORIGIN} OLLAMA_CONTEXT_LENGTH=32768 ollama serve
    ollama pull qwen2.5:14b        # in a third terminal, once

  Then in the app: Settings → AI review → enable → Local → Ollama
  → model qwen2.5:14b → context 32768 → Test connection.

  OLLAMA_ORIGINS is what lets this page talk to Ollama at all.
  OLLAMA_CONTEXT_LENGTH is what stops a long thesis being silently
  truncated. Both matter.

  Everything except AI review and the Deep research buttons works
  with no network and no model.

  Ctrl-C to stop.
  ────────────────────────────────────────────────────────────

BANNER

cd "$DIR"
exec python3 -m http.server "$PORT"
