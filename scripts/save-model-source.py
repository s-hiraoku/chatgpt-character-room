"""Package only the generated GLBs in a fresh Blender process."""
import sys
from pathlib import Path
import bpy

assets = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
bpy.context.scene.name = 'Darapan Room Assets'
for name in ['room', 'table', 'sofa', 'lamp', 'plant']:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(assets / (name + '.glb')))
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for obj in set(bpy.data.objects) - before:
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        collection.objects.link(obj)
    collection.hide_viewport = name != 'room'
    collection.hide_render = name != 'room'
bpy.ops.wm.save_as_mainfile(filepath=str(assets / 'darapan-room.blend'), compress=True)
print('Saved isolated source .blend with only generated model collections.')
