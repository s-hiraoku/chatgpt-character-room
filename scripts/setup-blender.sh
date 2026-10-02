#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/dev-environment.sh"
if [[ ! -x "$UVX_BIN" ]]; then
  echo "Install uv first: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi
if [[ ! -x "$BLENDER_BIN" ]]; then
  if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
    echo "Install Blender 5.2.2 for your OS and set BLENDER_BIN. Automatic download supports macOS arm64." >&2
    exit 1
  fi
  downloads="$ROOM_ROOT/.local/downloads"
  mount_dir="$ROOM_ROOT/.local/blender-mount"
  mkdir -p "$downloads" "$mount_dir" "$ROOM_ROOT/.local/blender"
  dmg="$downloads/blender-5.2.2-macos-arm64.dmg"
  curl -fL --retry 2 https://mirror.blender.org/release/Blender5.2/blender-5.2.2-macos-arm64.dmg -o "$dmg"
  # SHA256 from Blender's official 5.2.2 checksum list.
  printf '%s  %s\n' dc4125399b8bfefe283cc1624d6cfc7809d1cac20ace51072127eb371f31f210 "$dmg" | shasum -a 256 -c -
  hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$dmg"
  trap 'hdiutil detach "$mount_dir"' EXIT
  ditto "$mount_dir/Blender.app" "$ROOM_ROOT/.local/blender/Blender.app"
  hdiutil detach "$mount_dir"
  trap - EXIT
fi
"$BLENDER_BIN" --version | head -n 1
mkdir -p "$BLENDERMCP_ADDONS_DIR"
"$ROOM_ROOT/scripts/blender-mcp.sh" install-addon --addons-dir "$BLENDERMCP_ADDONS_DIR"
