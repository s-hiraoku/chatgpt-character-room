"""Run through build-room-models.mjs (Blender MCP).
No external textures: the GLBs use geometry and glTF-compatible materials.
"""
import bpy
import math
import random

ASSET_DIR = __ASSET_DIR__
random.seed(17)

# Build in a separate scene; keep the user's active scene and selection intact.
original_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('DarapanRoomAssets')
bpy.context.window.scene = scene
materials = {}

def material(name, color, metal=0, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = 0.65
    p.inputs['Metallic'].default_value = metal
    if glow:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = glow
    materials[name] = m
    return m

wood = material('Walnut', (0.18,0.09,0.065))
wood2 = material('Warm wood', (0.25,0.13,0.085))
wall = material('Midnight walls', (0.055,0.055,0.1))
trim = material('Graphite trim', (0.04,0.045,0.07), 0.3)
fabric = material('Velvet lavender', (0.16,0.115,0.22))
pillow = material('Cream textile', (0.65,0.56,0.58))
purple = material('Lavender neon', (0.42,0.13,0.95), glow=3)
cyan = material('Cyan neon', (0.05,0.65,0.9), glow=2)
amber = material('Warm light', (1,0.48,0.15), glow=2)
leaf = material('Leaves', (0.065,0.22,0.13))
city = material('City silhouettes', (0.025,0.04,0.085))
ceramic = material('Porcelain', (0.58,0.54,0.63))
rug = material('Rug', (0.08,0.075,0.13))

collections = []

def move_to_collection(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collections[-1].objects.link(obj)

def box(name, pos, dims, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    move_to_collection(obj)
    return obj

def cylinder(name, pos, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=pos)
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(mat)
    move_to_collection(obj)
    return obj

def sphere(name, pos, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=pos)
    obj=bpy.context.object
    obj.name=name
    obj.scale=scale
    obj.data.materials.append(mat)
    move_to_collection(obj)
    return obj

def begin(name):
    collection=bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collections.append(collection)

def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collections[-1].objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=list(collections[-1].objects)[0]
    result=bpy.ops.export_scene.gltf(filepath=ASSET_DIR+'/'+name+'.glb', export_format='GLB', use_selection=True, use_active_scene=True, export_extras=True)
    if 'FINISHED' not in result:
        raise RuntimeError('Could not export '+name)

try:
    begin('room')
    box('Foundation',(0,0,-0.14),(8.2,6.2,0.25),trim)
    for i in range(24):
        box('Floor plank',(-3.83+i*0.333,0,0),(0.327,6,0.045),wood if i%3 else wood2)
    box('Left wall',(-4,0,1.75),(0.16,6,3.5),wall)
    box('Window left pillar',(-3.6,3,1.75),(0.8,0.16,3.5),wall)
    box('Desk wall',(2.65,3,1.75),(2.7,0.16,3.5),wall)
    box('Window sill',(-0.95,3,0.42),(4.7,0.28,0.14),trim)
    box('Window top',(-0.95,3,3.36),(4.7,0.2,0.3),trim)
    for x in [-3.23,-1.7,0,1.33]:
        box('Window mullion',(x,3,1.9),(0.065,0.18,2.85),trim)
    box('Window crossbar',(-0.95,3,1.22),(4.7,0.13,0.06),trim)
    box('Window cyan edge',(1.27,2.88,1.95),(0.025,0.025,2.8),cyan)
    box('Window glow',(-0.96,2.88,0.5),(4.5,0.025,0.018),purple)
    box('Left shelf',(-3.7,1.25,2.1),(0.5,2,0.08),wood2)
    for j in range(7):
        box('Shelf book',(-3.65,0.6+j*0.13,2.29),(0.22,0.09,0.3+0.05*(j%2)),fabric if j%2 else ceramic)
    box('Shelf light',(-3.7,1.25,2.04),(0.35,1.9,0.018),amber)
    box('Desk top',(2.5,2.26,0.92),(2.5,0.98,0.11),wood2,0.04)
    for x in [1.44,3.55]:
        box('Desk leg',(x,2.25,0.45),(0.08,0.8,0.9),trim)
    box('Monitor',(2.42,2.48,1.55),(1.3,0.09,0.76),trim,0.06)
    box('Monitor screen',(2.42,2.422,1.55),(1.16,0.015,0.64),purple)
    box('Monitor stand',(2.42,2.48,1.12),(0.09,0.1,0.3),trim)
    box('Keyboard',(2.32,2.08,1.015),(0.75,0.24,0.04),trim,0.015)
    box('Keyboard glow',(2.32,2.08,1.039),(0.67,0.19,0.008),cyan)
    cylinder('Desk mug',(3.4,2.1,1.08),0.09,0.2,ceramic)
    box('Chair seat',(2.5,1.12,0.55),(0.65,0.65,0.14),fabric,0.07)
    box('Chair back',(2.5,0.83,1.01),(0.66,0.12,0.82),fabric,0.06)
    cylinder('Chair leg',(2.5,1.12,0.25),0.05,0.45,trim)
    box('Chair foot',(2.5,1.12,0.06),(0.65,0.08,0.07),trim)
    box('Desk shelf',(2.7,2.75,2.55),(2.2,0.42,0.07),wood2)
    box('Desk shelf glow',(2.7,2.52,2.48),(2.1,0.02,0.018),amber)
    box('Rug',(0,-0.15,0.035),(5.6,3.8,0.016),rug,0.14)
    # Geometry-only skyline keeps exports self contained.
    for i in range(14):
        x=-6.8+i*0.96
        h=random.uniform(1.6,4.6)
        y=random.uniform(5,7)
        box('City tower',(x,y,h/2-0.4),(0.7,0.65,h),city)
        for j in range(4):
            box('City window',(x+0.12*(j%2),y-0.332,j*0.56+0.35),(0.23,0.012,0.08),cyan if (i+j)%3 else amber)
    sphere('Moon',(-1.5,8,4.0),(0.38,0.08,0.38),ceramic)
    export('room')

    begin('table')
    cylinder('Round walnut top',(0,0,0.57),0.84,0.09,wood2)
    for x,y in [(-0.53,-0.36),(0.53,-0.36),(-0.53,0.36),(0.53,0.36)]:
        box('Table leg',(x,y,0.28),(0.055,0.055,0.56),trim)
    cylinder('Cup',(-0.36,-0.04,0.72),0.09,0.18,ceramic)
    box('Book',(0.25,0.04,0.65),(0.4,0.28,0.045),fabric,0.01)
    export('table')

    begin('sofa')
    box('Sofa base',(0,0,0.32),(2.8,1.12,0.38),fabric,0.12)
    box('Sofa back',(0,0.46,0.91),(2.75,0.26,0.95),fabric,0.12)
    for x in [-1.3,1.3]:
        box('Sofa arm',(x,0,0.65),(0.23,1.18,0.55),fabric,0.09)
    for x in [-0.6,0.6]:
        box('Sofa cushion',(x,-0.1,0.56),(1.16,0.83,0.19),fabric,0.08)
        box('Sofa pillow',(x,0.28,0.9),(0.56,0.22,0.52),pillow,0.1)
    for x in [-1.08,1.08]:
        for y in [-0.4,0.4]:
            box('Sofa foot',(x,y,0.095),(0.08,0.08,0.19),trim)
    # Panda pillow patches.
    for x in [-0.73,-0.47]:
        sphere('Panda patch',(x,0.145,0.94),(0.085,0.016,0.105),trim)
    export('sofa')

    begin('lamp')
    cylinder('Lamp base',(0,0,0.04),0.29,0.07,trim)
    cylinder('Lamp stem',(0,0,0.89),0.025,1.72,trim)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.31, radius2=0.16, depth=0.28, location=(0,0,1.83))
    obj=bpy.context.object
    obj.name='Lamp shade'
    obj.data.materials.append(wood2)
    move_to_collection(obj)
    cylinder('Lamp glow',(0,0,1.68),0.27,0.012,amber)
    export('lamp')

    begin('plant')
    cylinder('Plant pot',(0,0,0.24),0.26,0.48,trim)
    for i in range(9):
        a=i*math.tau/9
        sphere('Leaf',(math.cos(a)*0.2,math.sin(a)*0.2,0.7+(i%3)*0.12),(0.12,0.22,0.28),leaf)
    export('plant')
    print('Exported room, table, sofa, lamp and plant GLBs.')
finally:
    bpy.context.window.scene=original_scene
