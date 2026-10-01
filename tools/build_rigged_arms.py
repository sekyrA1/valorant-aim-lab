"""Blender CLI: build editable, skinned first-person arms. Game axes: Y up, -Z forward."""
from pathlib import Path
from math import sin, cos, pi
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models'
bpy.context.preferences.filepaths.save_version=0
A = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, rough=.7):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = rough
    return m

skin = mat('Warm skin', (.40, .235, .145), .62)
cloth = mat('Woven graphite sleeve', (.045, .058, .073), .94)
glove = mat('Supple leather glove', (.075, .085, .09), .8)
seam = mat('Glove raised seams', (.14, .16, .17), .78)

data = bpy.data.armatures.new('AnatomicalArms')
rig = bpy.data.objects.new('ArmsRig', data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
specs = {}
def bone(name, head, tail, parent=None):
    b = data.edit_bones.new(name)
    b.head, b.tail = A @ Vector(head), A @ Vector(tail)
    if parent: b.parent = data.edit_bones[parent]
    specs[name] = (Vector(head), Vector(tail))

for side, x in [('R', .02), ('L', -.46)]:
    shoulder = (x, -.18, .33)
    elbow = (x, -.18, -.03)
    wrist = (x, -.18, -.37)
    bone(side+'_upper', shoulder, elbow)
    bone(side+'_fore', elbow, wrist, side+'_upper')
    bone(side+'_hand', wrist, (x, -.18, -.45), side+'_fore')
    sign = 1 if side == 'R' else -1
    for i, length in enumerate([.072, .082, .077, .061]):
        fx = x + (i-1.5)*.018*sign
        z = -.441 + abs(i-1.3)*.004
        parent = side+'_hand'
        for j, fraction in enumerate([.46, .31, .23]):
            end = z - length*fraction
            name = f'{side}_finger{i}_{j}'
            bone(name, (fx, -.18, z), (fx, -.18, end), parent)
            parent, z = name, end
    thumb = [(x-.032*sign,-.18,-.393), (x-.059*sign,-.18,-.419), (x-.070*sign,-.18,-.444)]
    bone(side+'_thumb0', thumb[0], thumb[1], side+'_hand')
    bone(side+'_thumb1', thumb[1], thumb[2], side+'_thumb0')
bpy.ops.object.mode_set(mode='OBJECT')

def loft(name, rings, material, sides=20):
    # Each ring: center, radii, skin weights. Closed surfaces with rounded ends.
    vertices, faces, weights = [], [], []
    for center, rx, ry, w in rings:
        for j in range(sides):
            angle = 2*pi*j/sides
            vertices.append(A @ (Vector(center)+Vector((rx*cos(angle),ry*sin(angle),0))))
            weights.append(w)
    for k in range(len(rings)-1):
        for j in range(sides):
            a = k*sides+j; b = k*sides+(j+1)%sides
            faces.append((a,a+sides,b+sides,b))
    faces += [tuple(range(sides)), tuple((len(rings)-1)*sides+j for j in reversed(range(sides)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in mesh.polygons: p.use_smooth=True
    groups = {}
    for i, ws in enumerate(weights):
        for name, weight in ws.items():
            if name not in groups: groups[name]=obj.vertex_groups.new(name=name)
            groups[name].add([i], weight, 'REPLACE')
    mod = obj.modifiers.new('Skin deformation', 'ARMATURE')
    mod.object = rig
    obj.parent = rig
    return obj

for side, x in [('R', .02), ('L', -.46)]:
    upper, fore, hand = [side+'_'+s for s in ('upper','fore','hand')]
    def ring(z, rx, ry, w, y=-.18): return ((x,y,z),rx,ry,w)
    loft(side+' sleeve', [ring(z,rx,ry,{upper:1-t,fore:t}) for z,rx,ry,t in [
        (.33,.071,.066,0),(.29,.075,.068,0),(.18,.070,.063,0),(.075,.059,.052,0),
        (.015,.054,.048,.12),(-.03,.055,.046,.5),(-.075,.054,.045,.88),(-.10,.055,.046,1)]],cloth)
    loft(side+' anatomical forearm', [ring(z,rx,ry,{fore:1-t,hand:t}) for z,rx,ry,t in [
        (-.08,.050,.043,0),(-.12,.056,.046,0),(-.18,.052,.042,0),(-.25,.043,.034,0),
        (-.32,.032,.025,0),(-.355,.027,.023,.1),(-.37,.028,.023,.5),(-.39,.029,.023,1)]],skin)
    loft(side+' glove wrist', [ring(z,rx,ry,{fore:1-t,hand:t}) for z,rx,ry,t in [
        (-.343,.033,.028,0),(-.35,.034,.029,0),(-.37,.031,.027,.5),(-.389,.032,.026,1)]],glove)
    loft(side+' palm', [ring(z,rx,ry,{hand:1}) for z,rx,ry in [
        (-.37,.027,.023),(-.39,.036,.025),(-.417,.040,.022),(-.441,.038,.020),(-.449,.029,.015)]],glove)
    sign = 1 if side=='R' else -1
    for i in range(4):
        # Smooth finger tube spans all three phalanges; blend adjacent bones at joints.
        rings=[]
        for j in range(3):
            name=f'{side}_finger{i}_{j}'
            head,tail=specs[name]
            radius=(.010 if i<3 else .0085)*(1-.13*j)
            for t in [0,.22,.72]:
                ws={name:1}
                if t==0 and j: ws={name:.5,f'{side}_finger{i}_{j-1}':.5}
                rings.append((head.lerp(tail,t),radius,radius*.86,ws))
        rings.append((tail,.002,.002,{name:1}))
        loft(f'{side} finger {i}',rings,glove,12)
    for j in range(2):
        name=f'{side}_thumb{j}'; head,tail=specs[name]
        loft(name+' skin',[(head,.013-j*.002,.011,{name:1}),
            (head.lerp(tail,.5),.013-j*.002,.012-j*.002,{name:1}),
            (tail,.009 if j==0 else .004,.009 if j==0 else .004,{name:1})],glove,14)

rig['description']='Deform skeleton: two-bone arm IK and three phalanges per finger. Runtime targets live in armsIK.js.'
rig.show_in_front=True
data.display_type='OCTAHEDRAL'
# Merge surfaces sharing a material to keep runtime draw calls low.
for material in [skin,cloth,glove]:
    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==material]
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    objects[0].name=material.name+' skinned'
# Editable Blender IK controls; runtime uses the same deform chains analytically.
controls=[]
for side,x in [('R',.02),('L',-.46)]:
    targets=[]
    for suffix,pos in [('wrist_target',(x,-.18,-.37)),('elbow_pole',(x+(.3 if side=='R' else -.3),-.45,.05))]:
        obj=bpy.data.objects.new(side+'_'+suffix,None)
        bpy.context.collection.objects.link(obj)
        obj.location=A@Vector(pos);obj.empty_display_type='SPHERE';obj.empty_display_size=.035
        obj.hide_render=True;controls.append(obj);targets.append(obj)
    constraint=rig.pose.bones[side+'_fore'].constraints.new('IK')
    constraint.target=targets[0];constraint.pole_target=targets[1]
    constraint.chain_count=2;constraint.use_stretch=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'arms_rigged.blend'))
for b in rig.pose.bones:
    for constraint in list(b.constraints):b.constraints.remove(constraint)
for obj in controls:bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(OUT/'arms_rigged.glb'), export_format='GLB',
    export_yup=True, export_animations=False, export_skins=True, export_def_bones=True)
print('RIGGED ARMS:',len(data.bones),'bones')
