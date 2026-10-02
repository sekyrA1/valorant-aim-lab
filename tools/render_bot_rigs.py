"""Render the vertices actually deformed by Three.js, not a different Blender pose."""
import json
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
A=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
samples={p['id']:p for p in json.loads((ROOT/'previews/bot-poses.json').read_text())}
entries=[('tactical-idle','TACTICAL / IDLE'),('tactical-strafe_right','STRAFE / IK'),('air-air','AIR / JETT'),('electric-slide','SLIDE / NEON')]
for i,(key,label) in enumerate(entries):
    shift=Vector(((i-1.5)*1.45,0,0))
    for m in samples[key]['meshes']:
        data=bpy.data.meshes.new(m['name']);data.from_pydata([A@(Vector(v)+shift) for v in m['vertices']],[],[m['indices'][j:j+3] for j in range(0,len(m['indices']),3)]);data.update()
        obj=bpy.data.objects.new(m['name'],data);bpy.context.collection.objects.link(obj)
        mat=bpy.data.materials.new(m['name']);mat.diffuse_color=(*m['color'],1);mat.use_nodes=True
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*m['color'],1);shader.inputs['Roughness'].default_value=.55
        data.materials.append(mat)
        for p in data.polygons:p.use_smooth=True
    text=bpy.data.curves.new(label,'FONT');text.body=label;text.align_x='CENTER';text.size=.105;text.extrude=.001
    obj=bpy.data.objects.new(label,text);bpy.context.collection.objects.link(obj);obj.location=A@Vector((shift.x,.001,.43))
    # Text lies on the floor, in front of each actor.
    mat=bpy.data.materials.new('Label');mat.diffuse_color=(.65,.87,.95,1);text.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
floor=bpy.context.object;mat=bpy.data.materials.new('Slate');mat.diffuse_color=(.018,.029,.046,1);mat.use_nodes=True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.018,.029,.046,1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8;floor.data.materials.append(mat)
scene=bpy.context.scene
camdata=bpy.data.cameras.new('Studio');cam=bpy.data.objects.new('Studio',camdata);bpy.context.collection.objects.link(cam)
cam.location=A@Vector((4.2,3.7,7.7));cam.rotation_euler=(A@Vector((0,.8,.05))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=6.8;scene.camera=cam
for pos,power,size in [((-3,5,4),1500,5),((4,3,1),1100,4),((0,4,-3),1700,3)]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new('Softbox',data);bpy.context.collection.objects.link(obj);obj.location=A@Vector(pos);obj.rotation_euler=(A@Vector((0,1,0))-obj.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.08,.08,.08)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'previews/bots-rigged.png')
bpy.ops.render.render(write_still=True)
