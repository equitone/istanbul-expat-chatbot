#!/usr/bin/env bash
# Build ScholarDesk.zip.
#
# The folder holds the app two ways, because neither alone is enough:
#
#   ScholarDesk.html          one file, double-click, no runtime needed
#   start.command + js/       the served version on macOS and Linux
#   start.bat + js/           the same on Windows, via PowerShell's own
#                             HttpListener, so nothing has to be installed
#
# The single file exists because ES modules cannot load over file:// — a
# browser treats them as cross origin and refuses, so double-clicking
# index.html gives a blank page and nothing on screen explains why. The served
# version exists because a page opened from a folder has no origin Safari will
# store against, so the single file cannot be relied on to keep anything.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$DIR/../ScholarDesk.zip}"
STAGE="$(mktemp -d)"
APP="$STAGE/ScholarDesk"

"$DIR/sync-shared.sh" >/dev/null || { echo "Shared analysis modules have drifted from ../instructor."; "$DIR/sync-shared.sh"; exit 1; }

mkdir -p "$APP"
# vendor/ holds the PDF and Word parsers. Without them the app would fetch
# them from a CDN on first use, which fails on a machine with no internet and
# makes an outbound request the app otherwise never makes.
cp -R "$DIR/index.html" "$DIR/styles.css" "$DIR/js" "$DIR/vendor" "$DIR/serve.js" "$DIR/serve.rb" "$DIR/start.sh" "$APP/"
cp "$DIR/Start Scholar Desk.command" "$DIR/start.bat" "$DIR/start.ps1" "$APP/"
chmod +x "$APP/start.sh" "$APP/Start Scholar Desk.command"
[ -f "$DIR/README.md" ] && cp "$DIR/README.md" "$APP/"
printf "export const BUILD = '%s';\n" "$(date +%Y-%m-%d-%H%M)" > "$APP/js/version.js"

# The single file is built from the staged copy, so it carries the same stamp.
node "$DIR/bundle.js" "$APP/ScholarDesk.html" "$APP" >/dev/null

cat > "$APP/START-HERE.txt" <<'EOS'
Scholar Desk

Two ways in. Both are the same app.

1. JUST OPEN IT  —  any computer
   Double-click  ScholarDesk.html
   Use Chrome, Edge or Firefox rather than Safari. Safari will not save
   anything for a file opened this way; the app says so at the top if that
   happens.

2. RUN IT PROPERLY  —  every browser then stores your work, Safari included
   Mac:      double-click  Start Scholar Desk.command
   Windows:  double-click  start.bat
   Linux:    run  ./start.sh
   Then open http://localhost:8130 if a browser does not open by itself.
   Keep the black window open while you work.

   Windows needs nothing installed: start.bat uses a web server built into
   Windows itself. On a Mac it will use whatever it finds — Python, Node,
   Ruby or PHP — and tells you to open ScholarDesk.html if it finds none.

   Always use port 8130. Your library is kept against that exact address, so
   another port looks like a fresh, empty install.

Do NOT double-click index.html. It will not work — it goes blank, because a
browser refuses to load the app's modules straight from a folder. That file
is for the served version only.

The two ways keep separate libraries, because the browser stores them under
different addresses. Pick one and stay with it, or move your work across with
the export and import buttons in Settings.

No installer, no account, no build step. Export a backup from Settings now and
then.

What works with no model at all: searching the catalogues, finding a person,
the coverage map and the counted gaps, the argument evaluation, Bloom, the
prose check, the grammar checker, the calls list and all reference
formatting. A model is needed only to write up the gaps, to find lines of
argument, and to expand an outline.
EOS

rm -f "$OUT"
(cd "$STAGE" && zip -qr9 "$OUT" ScholarDesk)
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
