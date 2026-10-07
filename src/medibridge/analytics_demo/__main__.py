"""Run the synthetic analytics API on loopback for local presentations."""

import argparse
from pathlib import Path
from typing import Sequence

import uvicorn

from medibridge.analytics_demo.api import DEFAULT_DB, create_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the local synthetic analytics demo API")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="synthetic analytics SQLite store")
    parser.add_argument("--port", type=int, default=8001, help="local HTTP port (default: 8001)")
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port must be between 1 and 65535")
    app = create_app(args.db)
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
