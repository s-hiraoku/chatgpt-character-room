#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/dev-environment.sh"
if [[ ! -x "$BLENDER_BIN" || ! -f "$BLENDERMCP_ADDONS_DIR/blender_mcp.py" ]]; then
  echo "Run npm run setup:blender first. See docs/development-environment.md." >&2
  exit 1
fi
mkdir -p "$BLENDER_USER_CONFIG"
exec "$BLENDER_BIN" "$@" --python "$ROOM_ROOT/scripts/bootstrap-blender.py"
