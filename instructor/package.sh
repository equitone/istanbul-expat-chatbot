#!/usr/bin/env bash
# Build the ZIP to hand to an instructor.
#
# Ships the app and its fixtures, not the repository: no git history, no
# screenshots, no nesting. Unzipping gives one folder with start.bat at the
# top, which is the whole install.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$DIR/../InstructorWorkbench.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/InstructorWorkbench"
cp -r "$DIR"/index.html "$DIR"/styles.css "$DIR"/js "$DIR"/vendor \
      "$DIR"/samples "$DIR"/GUIDE.md \
      "$DIR"/start.bat "$DIR"/start.ps1 "$DIR"/start.sh \
      "$STAGE/InstructorWorkbench/"

cat > "$STAGE/InstructorWorkbench/START-HERE.txt" <<'TXT'
INSTRUCTOR WORKBENCH
====================

TO START:  double-click  start.bat

A black window will open, and your browser will open the app.
Leave the black window open while you work. Closing it stops the app.

If Windows says "Windows protected your PC":
    click  More info  ->  Run anyway
If Windows Firewall asks for permission:
    click  Cancel   (the app does not need network access)

Do NOT double-click index.html. It will not work.

Full instructions, including the backup rule, are in GUIDE.md
(open it with Notepad, or any Markdown reader).

Everything runs on this computer. Nothing is uploaded.
TXT

rm -f "$OUT"
(cd "$STAGE" && zip -qr9 "$OUT" InstructorWorkbench)
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
