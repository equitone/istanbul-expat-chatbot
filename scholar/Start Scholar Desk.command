#!/usr/bin/env bash
# Double-click this on a Mac. It is start.sh with a name Finder will run.
cd "$(dirname "${BASH_SOURCE[0]}")"
exec ./start.sh "$@"
