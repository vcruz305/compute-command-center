#!/usr/bin/env bash
# Clean environment (avoids Hermes PYTHONPATH contamination of the venv).
cd "$(dirname "$0")"
exec env -i PATH=/usr/bin:/bin HOME=/root PYTHONUNBUFFERED=1 \
  ./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8090
