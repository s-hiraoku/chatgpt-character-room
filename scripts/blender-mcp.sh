#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/dev-environment.sh"
if [[ ! -x "$UVX_BIN" ]]; then
  echo "uvx is missing. Install uv or set UVX_BIN to its absolute path." >&2
  exit 1
fi
if [[ $# -eq 0 ]]; then
  exec "$UVX_BIN" --offline --python 3.11 --from mcp-for-blender==2.1.3 mcp-for-blender
fi
exec "$UVX_BIN" --python 3.11 --from mcp-for-blender==2.1.3 mcp-for-blender "$@"
