"""Enable the project-local addon and start its loopback socket in Blender."""
import os
import addon_utils
import bpy

addon_utils.enable("blender_mcp", default_set=True, persistent=True)
prefs = bpy.context.preferences.addons["blender_mcp"].preferences
prefs.telemetry_consent = False
bpy.context.scene.blendermcp_auto_start_server = False
bpy.context.scene.blendermcp_port = int(os.environ["BLENDER_PORT"])

from blender_mcp import BlenderMCPServer

server = BlenderMCPServer(host=os.environ["BLENDER_HOST"], port=bpy.context.scene.blendermcp_port)
bpy.types.blendermcp_server = server
server.start()
if not server.running:
    raise RuntimeError("Blender MCP could not start. Check whether port 9876 is already in use.")
bpy.context.scene.blendermcp_server_running = True
print("Character Room: Blender MCP listening on 127.0.0.1:9876")
