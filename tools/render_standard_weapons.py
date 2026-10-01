"""Studio contact sheet of the rebuilt meshes; import the actual exported GLBs."""
import bpy, math
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
A=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
for i,name in enumerate(['vandal','phantom','operator','classic','sheriff']):
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'public/models/{name}.glb'))
    offset=Vector((0,-i*.54,0))
    for o in set(scene.objects)-before:
        if o.parent is None:o.location+=A@offset
    # Text lies in the game YZ plane, readable from the positive X studio camera.
    curve=bpy.data.curves.new(name,'FONT');curve.body=name.upper();curve.size=.052;curve.extrude=0
    o=bpy.data.objects.new(name+' label',curve);scene.collection.objects.link(o)
    o.location=A@Vector((.0,.19-i*.54,-1.13))
    o.rotation_euler=(A@Vector((1,0,0))).to_track_quat('Z','Y').to_euler()
    m=bpy.data.materials.new('Label');m.diffuse_color=(.6,.66,.73,1);curve.materials.append(m)
camdata=bpy.data.cameras.new('Studio');cam=bpy.data.objects.new('Studio',camdata);scene.collection.objects.link(cam)
cam.location=A@Vector((4,-.88,.52));target=A@Vector((0,-1.04,-.29))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=2.9;scene.camera=cam
for pos,power,size in [((2,1,-1),450,4),((1,-2,2),320,3),((-1,0,-2),300,2)]:
    d=bpy.data.lights.new('Softbox','AREA');d.energy=power;d.size=size
    o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=A@Vector(pos)
    o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.075,.09,.12)
scene.render.resolution_x=1200;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'previews/standard-arsenal.png')
bpy.ops.render.render(write_still=True)
