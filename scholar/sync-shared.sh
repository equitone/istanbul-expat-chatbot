#!/usr/bin/env bash
# Six analysis modules are shared verbatim with ../instructor. They are pure —
# no DOM, no store — so a copy works, but a copy is exactly how recountIssues
# drifted out of step earlier in this project and silently dropped a count.
#
# This does not prevent the drift. It makes it loud. Run with no argument to
# check, or with "pull" to take the instructor's version.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../instructor/js/analysis"
FILES="text.js lexicons.js bloom.js gaps.js argument.js verify.js grammar.js mechanics.js learner-english.js languagetool.js segments.js"
# turkish.js sits a level up in both apps, not under analysis/.
ROOT_SRC="$HERE/../instructor/js"
ROOT_FILES="turkish.js"
mode="${1:-check}"
status=0
for f in $FILES; do
  if [ ! -f "$SRC/$f" ]; then echo "missing in instructor: $f"; status=1; continue; fi
  if diff -q "$SRC/$f" "$HERE/js/analysis/$f" >/dev/null 2>&1; then
    [ "$mode" = check ] && echo "  same   $f"
  elif [ "$mode" = pull ]; then
    cp "$SRC/$f" "$HERE/js/analysis/$f"; echo "  pulled $f"
  else
    echo "  DRIFT  $f  (run ./sync-shared.sh pull, or reconcile by hand)"; status=1
  fi
done
for f in $ROOT_FILES; do
  if [ ! -f "$ROOT_SRC/$f" ]; then echo "missing in instructor: $f"; status=1; continue; fi
  if diff -q "$ROOT_SRC/$f" "$HERE/js/$f" >/dev/null 2>&1; then
    [ "$mode" = check ] && echo "  same   $f"
  elif [ "$mode" = pull ]; then
    cp "$ROOT_SRC/$f" "$HERE/js/$f"; echo "  pulled $f"
  else
    echo "  DRIFT  $f  (run ./sync-shared.sh pull, or reconcile by hand)"; status=1
  fi
done
exit $status
