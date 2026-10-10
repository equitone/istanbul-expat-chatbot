#!/usr/bin/env bash
# Scholar Desk — start the served version on macOS or Linux.
#   ./start.sh [port]        default 8130
#
# The single file ScholarDesk.html opens with no server at all. Use this when
# you want the served version, which every browser will store data for.
set -uo pipefail

PORT="${1:-8130}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGIN="http://localhost:${PORT}"
cd "$DIR"

# Pick a runtime before promising an address.
#
# Presence on PATH is not enough. macOS ships a `python3` stub that does
# nothing but open the Xcode Command Line Tools installer, so every candidate
# is made to execute something trivial before it is trusted. Without that, the
# script announces a server, opens a browser at it, and then dies.
usable() { "$@" >/dev/null 2>&1; }

if usable python3 -c ''; then
  RUNTIME="python3"; CMD=(python3 -m http.server "$PORT" --bind 127.0.0.1)
elif usable python -c ''; then
  RUNTIME="python"; CMD=(python -m http.server "$PORT" --bind 127.0.0.1)
elif usable node -e ''; then
  RUNTIME="node"; CMD=(node "$DIR/serve.js" "$PORT")
elif usable ruby -e ''; then
  RUNTIME="ruby"; CMD=(ruby "$DIR/serve.rb" "$PORT")
elif usable php -r ''; then
  RUNTIME="php"; CMD=(php -S "localhost:$PORT" -t "$DIR")
else
  echo
  echo "  Scholar Desk"
  echo "  ------------------------------------------------------------"
  echo "  There is nothing on this machine to serve the files with. No"
  echo "  Python, no Node, no Ruby, no PHP."
  echo
  if [ -f "$DIR/ScholarDesk.html" ]; then
    # Not a dead end. The single file needs nothing at all.
    cat <<'SINGLE'
  You do not need any of them. Open this instead:

      ScholarDesk.html     (in this same folder, double-click it)

  That is the whole app in one file and needs no server. Open it
  in Chrome or Firefox rather than Safari: Safari will not save
  anything for a file opened this way, and the app says so at
  the top if that happens.
  ------------------------------------------------------------

SINGLE
    if command -v open >/dev/null 2>&1; then
      read -r -p "  Press Enter to open it now, or Ctrl-C to close. " _ || true
      open "$DIR/ScholarDesk.html"
      exit 0
    fi
    read -r -p "  Press Enter to close. " _ || true
  else
    # Only reachable in a source checkout: the release zip always ships it.
    cat <<'BUILDIT'
  Install Node from https://nodejs.org and run this again, or build
  the single-file version with:  node bundle.js
  ------------------------------------------------------------

BUILDIT
    read -r -p "  Press Enter to close. " _ || true
  fi
  exit 1
fi

cat <<BANNER

  Scholar Desk
  ------------------------------------------------------------
  Open:    ${ORIGIN}
  Folder:  ${DIR}
  Serving with ${RUNTIME}.

  Always start it on port ${PORT}. Your library and drafts are
  stored against this exact address, so a different port looks
  like a fresh, empty install.

  Keep this window open while you work. Ctrl-C to stop.
  ------------------------------------------------------------

BANNER

# Open the browser once the server is listening.
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$ORIGIN"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$ORIGIN"
  fi ) >/dev/null 2>&1 &

exec "${CMD[@]}"
