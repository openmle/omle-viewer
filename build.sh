#!/usr/bin/env bash
# Build the self-contained viewer HTML and copy it into the Python package.
# Run this from the repo root or from omle-viewer/ whenever the viewer changes.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATIC_DIR="$SCRIPT_DIR/python/src/omle_viewer/static"

echo "==> Installing viewer dependencies..."
cd "$SCRIPT_DIR"
npm install

echo "==> Building self-contained viewer HTML..."
npm run build:singlefile

echo "==> Copying viewer.html to $STATIC_DIR..."
mkdir -p "$STATIC_DIR"
cp "$SCRIPT_DIR/dist-singlefile/index.html" "$STATIC_DIR/viewer.html"

echo "==> Static files:"
ls -lh "$STATIC_DIR/"
echo ""
echo "Done. Install (or reinstall) the package with:"
echo "  pip install -e \"$SCRIPT_DIR/python/\""
