#!/usr/bin/env bash
# Shared paths for the Blender launcher and its MCP server.
ROOM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export UV_CACHE_DIR="$ROOM_ROOT/.local/uv-cache"
export UV_TOOL_DIR="$ROOM_ROOT/.local/uv-tools"
export UV_PYTHON_INSTALL_DIR="$ROOM_ROOT/.local/python"
export UV_PYTHON_PREFERENCE=only-managed
export BLENDER_USER_CONFIG="$ROOM_ROOT/.local/blender-user/config"
export BLENDER_USER_SCRIPTS="$ROOM_ROOT/.local/blender-user/scripts"
export BLENDERMCP_ADDONS_DIR="$BLENDER_USER_SCRIPTS/addons"
export BLENDER_HOST=127.0.0.1
export BLENDER_PORT=9876
export BLENDER_MCP_SAFE_MODE=1
export DISABLE_TELEMETRY=true
export BLENDERMCP_NO_UPDATE_CHECK=1
export BLENDER_MCP_APPS=0
export BLENDER_MCP_OPENAI_FORMS=0
BLENDER_BIN="${BLENDER_BIN:-$ROOM_ROOT/.local/blender/Blender.app/Contents/MacOS/Blender}"
UVX_BIN="${UVX_BIN:-$(command -v uvx || true)}"
if [[ -z "$UVX_BIN" && -x "$HOME/.local/bin/uvx" ]]; then
  UVX_BIN="$HOME/.local/bin/uvx"
fi
