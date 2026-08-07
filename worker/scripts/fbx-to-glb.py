import bpy
import sys
import re

argv = sys.argv[sys.argv.index('--') + 1:]
if len(argv) < 2:
    sys.stderr.write('Usage: blender --background --python fbx-to-glb.py -- <input.fbx> <output.glb>\n')
    sys.exit(2)
fbx_path, glb_path = argv[0], argv[1]

for name in ('Cube', 'Camera', 'Light'):
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=True)

for obj in list(bpy.data.objects):
    if obj.type == 'MESH' and re.search(r'Joints', obj.name, re.IGNORECASE):
        bpy.data.objects.remove(obj, do_unlink=True)

actions = list(bpy.data.actions)
if actions:
    first = actions[0]
    bpy.context.scene.frame_start = int(first.frame_range[0])
    bpy.context.scene.frame_end = int(first.frame_range[1])
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            if obj.animation_data is None:
                obj.animation_data_create()
            obj.animation_data.action = first

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_force_sampling=bool(actions),
)
