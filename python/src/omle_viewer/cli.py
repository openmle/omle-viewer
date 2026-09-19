"""CLI entry point: ``omle-viewer <model-file>``

Opens an OMLE model file in the default web browser using the interactive
DAG viewer. Supports JSON (.json) and protobuf binary (.omle, .pb, .bin)
file formats.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="omle-viewer",
        description="Open an OMLE model in the interactive DAG viewer.",
    )
    parser.add_argument(
        "model",
        metavar="MODEL_FILE",
        help="Path to the model file (.json, .omle, .pb)",
    )
    args = parser.parse_args()

    path = Path(args.model)
    if not path.exists():
        print(f"omle-viewer: file not found: {path}", file=sys.stderr)
        sys.exit(1)

    try:
        import omle
    except ImportError:
        print(
            "omle-viewer: the 'omle' package is required. "
            "Install it with: pip install omle",
            file=sys.stderr,
        )
        sys.exit(1)

    ext = path.suffix.lower()
    proto_exts = {".omle", ".pb", ".bin"}

    if ext in proto_exts:
        try:
            model = omle.load(path)
        except ImportError:
            print(
                f"omle-viewer: loading {ext!r} files requires the protobuf extra.\n"
                "Install it with: pip install 'omle[proto]' 'omle-viewer[proto]'",
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        try:
            model = omle.load(path)
        except ValueError as e:
            print(f"omle-viewer: {e}", file=sys.stderr)
            sys.exit(1)

    from .display import show_in_browser
    show_in_browser(model)


if __name__ == "__main__":
    main()
