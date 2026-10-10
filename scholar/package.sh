#!/usr/bin/env bash
# Build ScholarDesk.zip: one folder, open index.html or run start.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$DIR/../ScholarDesk.zip}"
STAGE="$(mktemp -d)"
APP="$STAGE/ScholarDesk"

"$DIR/sync-shared.sh" >/dev/null || { echo "Shared analysis modules have drifted from ../instructor."; "$DIR/sync-shared.sh"; exit 1; }

mkdir -p "$APP"
cp -R "$DIR/index.html" "$DIR/styles.css" "$DIR/js" "$DIR/serve.js" "$APP/"
[ -f "$DIR/README.md" ] && cp "$DIR/README.md" "$APP/"
printf "export const BUILD = '%s';\n" "$(date +%Y-%m-%d-%H%M)" > "$APP/js/version.js"

cat > "$APP/start.command" <<'EOS'
#!/usr/bin/env bash
cd "$(dirname "$0")" && node serve.js 8130
EOS
chmod +x "$APP/start.command"

cat > "$APP/START-HERE.txt" <<'EOS'
Scholar Desk

Double-click start.command (Mac), or run:  node serve.js 8130
Then open http://localhost:8130

No installer, no account, no build step. Your library and drafts are kept in
the browser's storage for whichever address you open it on, so keep using the
same one, and export a backup from Settings now and then.

What works with no model at all: searching the catalogues, finding a person,
the coverage map and the counted gaps, the argument evaluation, Bloom, and the
prose check. A model is needed only to write up the gaps, to find lines of
argument, and to expand an outline.
EOS

rm -f "$OUT"
(cd "$STAGE" && zip -qr9 "$OUT" ScholarDesk)
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
