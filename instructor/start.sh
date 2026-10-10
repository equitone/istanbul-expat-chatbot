#!/usr/bin/env bash
# Instructor Workbench — start the app on macOS or Linux.
#   ./start.sh [port]        default 8099
set -uo pipefail

PORT="${1:-8099}"
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
  cat <<'MISSING'

  Instructor Workbench
  ------------------------------------------------------------
  There is nothing on this machine to serve the files with. No
  Python, no Node, no Ruby, no PHP, so the app cannot start.

  Install one of these, then run this again:

    Node       https://nodejs.org        (easiest, just an installer)
    Python 3   https://www.python.org/downloads/

  On a Mac you can also run:  xcode-select --install
  which provides python3.

  Do not try to open index.html on its own. It goes blank: a
  browser refuses to load the app's files straight from a folder.
  ------------------------------------------------------------

MISSING
  read -r -p "  Press Enter to close. " _ || true
  exit 1
fi

cat <<BANNER

  Instructor Workbench
  ------------------------------------------------------------
  Open:    ${ORIGIN}
  Folder:  ${DIR}
  Serving with ${RUNTIME}.

  Everything runs on this computer. Nothing is uploaded.

  Always start it on port ${PORT}. Your grades are stored against
  this exact address, so a different port looks like a fresh,
  empty install.

  Keep this window open while you work. Ctrl-C to stop.
  ------------------------------------------------------------

BANNER

# Open the browser once the server is listening.
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$ORIGIN"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$ORIGIN"
  fi ) >/dev/null 2>&1 &

exec "${CMD[@]}"
