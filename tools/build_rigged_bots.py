"""Blender CLI: weighted full-body bots, four IK chains, baked glTF clips.
Game coordinates: X right, Y up, +Z forward. No external assets required.
Run: blender --background --python tools/build_rigged_bots.py
"""
from pathlib import Path
from math import sin, cos, pi
import json
import bpy
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/bots'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'previews').mkdir(exist_ok=True)
A = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
FPS = 30
CLIPS = {'idle': 2, 'run': .8, 'strafe_left': .8, 'strafe_right': .8,
         'dash': .6, 'air': 1.2, 'slide': 1.2, 'shoot': .3, 'throw': .5, 'death': .8}
bpy.context.preferences.filepaths.save_version = 0


def material(name, color, rough=.7, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat


def build(kind):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = 61
    palette = {
        'tactical': [( .07,.085,.11), (.18,.22,.27), (.055,.06,.075), (.9,.025,.065), (.025,.035,.05)],
        'air': [(.06,.25,.32), (.35,.63,.65), (.72,.45,.32), (.10,.84,.91), (.80,.88,.92)],
        'electric': [(.035,.065,.17), (.085,.17,.30), (.54,.28,.14), (.035,.65,1), (.02,.19,.72)]
    }[kind]
    mats = [material(name, color, .8 if i != 1 else .42, .2 if i == 1 else 0, 1.8 if i == 3 else 0)
            for i, (name, color) in enumerate(zip(['Suit','Armor','Skin','Accent','Hair'], palette))]
    data = bpy.data.armatures.new('BotSkeleton')
    rig = bpy.data.objects.new('BotRig', data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    specs = {}

    def bone(name, head, tail, parent=None):
        b = data.edit_bones.new(name)
        b.head, b.tail = A @ Vector(head), A @ Vector(tail)
        if parent:
            b.parent = data.edit_bones[parent]
        specs[name] = (Vector(head), Vector(tail))
        return b

    bone('root', (0,0,0), (0,.12,0))
    bone('pelvis', (0,.88,0), (0,1.04,0), 'root')
    bone('spine', (0,1.04,0), (0,1.23,0), 'pelvis')
    bone('chest', (0,1.23,0), (0,1.43,0), 'spine')
    bone('neck', (0,1.43,0), (0,1.51,0), 'chest')
    bone('head', (0,1.51,0), (0,1.73,0), 'neck')
    width = .255 if kind == 'tactical' else .225
    for side, sign in [('L', -1), ('R', 1)]:
        shoulder = (sign*width,1.40,0)
        elbow = (sign*(width+.17),1.17,.035)
        wrist = (sign*(width+.205),.92,.09)
        bone('clavicle_'+side, (sign*.075,1.40,0), shoulder, 'chest')
        bone('upper_arm_'+side, shoulder, elbow, 'clavicle_'+side)
        bone('forearm_'+side, elbow, wrist, 'upper_arm_'+side)
        bone('hand_'+side, wrist, (wrist[0],wrist[1],wrist[2]+.12), 'forearm_'+side)
        hip = (sign*.135,.88,0)
        knee = (sign*.135,.49,.055)
        ankle = (sign*.135,.11,0)
        bone('thigh_'+side, hip, knee, 'pelvis')
        bone('shin_'+side, knee, ankle, 'thigh_'+side)
        bone('foot_'+side, ankle, (sign*.135,.055,.19), 'shin_'+side)
        bone('toe_'+side, (sign*.135,.055,.19), (sign*.135,.045,.28), 'foot_'+side)
    bpy.ops.object.mode_set(mode='OBJECT')
    vertices, faces, weights, slots = [], [], [], []

    def surface(points, polys, ws, slot):
        offset = len(vertices)
        vertices.extend(A @ Vector(p) for p in points)
        weights.extend(ws)
        faces.extend(tuple(offset+i for i in poly) for poly in polys)
        slots.extend([slot]*len(polys))

    def tube(name, rings, slot, sides=14):
        # Perpendicular rings preserve anatomical taper and blend weights at joints.
        direction = (Vector(rings[-1][0])-Vector(rings[0][0])).normalized()
        right = direction.cross(Vector((0,0,1)))
        if right.length < .1:
            right = direction.cross(Vector((0,1,0)))
        right.normalize()
        depth = right.cross(direction).normalized()
        pts, ws, polys = [], [], []
        for center, rx, rz, w in rings:
            for i in range(sides):
                angle = 2*pi*i/sides
                pts.append(Vector(center)+rx*cos(angle)*right+rz*sin(angle)*depth)
                ws.append(w)
        for j in range(len(rings)-1):
            for i in range(sides):
                a = j*sides+i
                b = j*sides+(i+1)%sides
                polys.append((a,a+sides,b+sides,b))
        polys += [tuple(range(sides)), tuple((len(rings)-1)*sides+i for i in reversed(range(sides)))]
        surface(pts, polys, ws, slot)

    def oval(center, scale, bone_name, slot, rings=9, sides=14):
        points, polys = [], []
        for j in range(rings+1):
            latitude = pi * (.001+(1-.002)*j/rings)
            for i in range(sides):
                longitude = 2*pi*i/sides
                points.append((center[0]+scale[0]*sin(latitude)*cos(longitude),
                               center[1]+scale[1]*cos(latitude), center[2]+scale[2]*sin(latitude)*sin(longitude)))
        for j in range(rings):
            for i in range(sides):
                a = j*sides+i; b = j*sides+(i+1)%sides
                polys.append((a,b,b+sides,a+sides))
        polys += [tuple(reversed(range(sides))), tuple(rings*sides+i for i in range(sides))]
        surface(points, polys, [{bone_name:1}]*len(points), slot)

    def box(center, size, bone_name, slot, angle=0):
        points = []
        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            dx,dy,dz = x*size[0]/2,y*size[1]/2,z*size[2]/2
            points.append((center[0]+dx,center[1]+dy*cos(angle)-dz*sin(angle),center[2]+dy*sin(angle)+dz*cos(angle)))
        surface(points, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,4,7,3),(1,2,6,5)], [{bone_name:1}]*8, slot)

    torso = [(.85,.165,.12,{'pelvis':1}),(.94,.20,.14,{'pelvis':.7,'spine':.3}),
             (1.03,.155,.12,{'pelvis':.25,'spine':.75}),(1.14,.175,.125,{'spine':.7,'chest':.3}),
             (1.27,.205,.145,{'spine':.2,'chest':.8}),(1.36,.22,.135,{'chest':1}),
             (1.40,.20,.12,{'chest':1}),(1.44,.09,.08,{'chest':.5,'neck':.5})]
    tube('Torso', [((0,y,0),rx,rz,w) for y,rx,rz,w in torso], 0, 20)
    tube('Neck', [((0,y,0),.067,.062,{'neck':1}) for y in [1.40,1.47,1.53]], 2)
    oval((0,1.62,.013),(.151,.18,.14), 'head', 1 if kind=='tactical' else 2, 12,20)
    if kind == 'tactical':
        box((0,1.66,.144),(.25,.045,.025),'head',3)
        box((0,1.55,.133),(.15,.055,.04),'head',0)
    else:
        oval((0,1.725,-.015),(.155,.095,.142),'head',4)
        oval((0,1.615,.148),(.025,.039,.022),'head',2,6,10)
        for sign in [-1,1]:
            oval((sign*.066,1.656,.140),(.032,.009,.014),'head',0,5,10)
            box((sign*.064,1.680,.134),(.057,.011,.014),'head',4)
            oval((sign*.149,1.626,.012),(.025,.041,.023),'head',2,6,10)
        box((0,1.564,.134),(.06,.008,.012),'head',0)
        if kind == 'air':
            oval((0,1.828,-.075),(.08,.08,.085),'head',4)
            for sign in [-1,1]:
                tube('Fringe', [((sign*x,y,z),r,r,{'head':1}) for x,y,z,r in
                     [(.04,1.78,.09,.043),(.10,1.725,.12,.032),(.13,1.60,.11,.01)]],4,10)
        else:
            for sign in [-1,1]:
                tube('Electric braid', [((sign*x,y,z),r,r,{'head':1}) for x,y,z,r in
                     [(.095,1.77,-.02,.045),(.17,1.82,-.06,.04),(.23,1.67,-.14,.032),(.25,1.53,-.18,.008)]],4,10)
    # Separate armor islands remain attached to the weighted torso, not floating boxes.
    box((0,1.28,.141),(.30,.23,.035),'chest',1)
    box((0,1.12,.137),(.19,.065,.03),'spine',1)
    box((0,1.29,.166),(.065,.12,.018),'chest',3)
    box((0,.97,.139),(.30,.055,.025),'pelvis',1)
    for sign in [-1,1]:
        box((sign*.115,1.17,.149),(.073,.115,.047),'spine',0)
        box((sign*.18,1.31,.13),(.024,.16,.022),'chest',3)
    for side, sign in [('L',-1),('R',1)]:
        upper, fore, hand = ['upper_arm_'+side,'forearm_'+side,'hand_'+side]
        shoulder, elbow = specs[upper]
        _, wrist = specs[fore]
        rings = []
        for j in range(13):
            t=j/12
            if t <= .5:
                p=shoulder.lerp(elbow,t*2); r=.073 + .016*sin(pi*t*2)
                blend=max(0,(t-.37)/.26)
                w={upper:1-blend,fore:blend}
            else:
                p=elbow.lerp(wrist,(t-.5)*2); r=.069-(t-.5)*.06
                blend=min(1,(t-.37)/.26)
                hand_blend=max(0,(t-.90)/.1)*.4
                w={upper:1-blend,fore:blend-hand_blend,hand:hand_blend}
            rings.append((p,r,r*.88,{name:value for name,value in w.items() if value>0}))
        tube('Arm',rings,0)
        oval(shoulder+Vector((0,-.012,0)),(.092,.105,.088),upper,1)
        oval(elbow,(.075,.07,.068),fore,1)
        oval(wrist+Vector((0,0,.055)),(.049,.034,.068),hand,0,8,12)
        for finger in range(4):
            oval(wrist+Vector((sign*(finger-1.5)*.019,-.01,.115)),(.009,.022,.036),hand,0,5,8)
        thigh, shin, foot = ['thigh_'+side,'shin_'+side,'foot_'+side]
        hip,knee=specs[thigh]; _,ankle=specs[shin]
        rings=[]
        for j in range(15):
            t=j/14
            p=hip.lerp(knee,t*2) if t<=.5 else knee.lerp(ankle,(t-.5)*2)
            r=.105-.035*t+.013*sin(t*2*pi)
            blend=min(1,max(0,(t-.38)/.24))
            f=max(0,(t-.92)/.08)*.5
            rings.append((p,r,r*.88,{thigh:1-blend,shin:blend-f,foot:f}))
        tube('Leg',rings,0)
        oval(knee+Vector((0,0,.054)),(.085,.093,.044),shin,1)
        oval((sign*.135,.074,.089),(.081,.071,.176),foot,1)
        box((sign*.135,.025,.09),(.145,.025,.26),foot,0)
        box((sign*.135,.075,.237),(.093,.027,.014),foot,3)

    mesh=bpy.data.meshes.new('WeightedBotSurface')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('BotSurface',mesh);bpy.context.collection.objects.link(obj)
    for mat in mats: mesh.materials.append(mat)
    for i,poly in enumerate(mesh.polygons): poly.material_index=slots[i];poly.use_smooth=len(poly.vertices)==4
    for name in specs: obj.vertex_groups.new(name=name)
    for i, ws in enumerate(weights):
        total=sum(ws.values())
        for name,w in ws.items():
            if w>0: obj.vertex_groups[name].add([i],w/total,'REPLACE')
    mod=obj.modifiers.new('Armature skin deformation','ARMATURE');mod.object=rig;obj.parent=rig
    # A separate rigid weapon is also skinned to the right hand.
    body_counts=(len(vertices),len(faces))
    vertices,faces,weights,slots=[],[],[],[]
    wrist=specs['hand_R'][0]
    if kind=='tactical':
        for center,size,slot in [((0,.018,.08),(.072,.092,.26),1),((0,.029,.31),(.036,.036,.28),1),
                                 ((0,.003,.235),(.058,.064,.20),0),((0,.024,-.15),(.053,.093,.19),1),
                                 ((0,-.08,.115),(.038,.14,.06),0),((0,-.035,-.015),(.038,.11,.045),0),
                                 ((0,.075,.085),(.027,.036,.064),0),((0,.09,.12),(.012,.015,.025),3)]:
            box(wrist+Vector(center),size,'hand_R',slot)
    elif kind == 'air':
        for x in [-.07,0,.07]:
            tube('Ability blade',[(wrist+Vector((x,0,.04)),.016,.012,{'hand_R':1}),
                                  (wrist+Vector((x,0,.22)),.023,.015,{'hand_R':1}),
                                  (wrist+Vector((x,0,.38)),.001,.001,{'hand_R':1})],3,6)
    else:
        # Neon fires energy from her hand rather than carrying Jett's knives.
        oval(wrist+Vector((0,0,.12)),(.050,.047,.075),'hand_R',3,8,12)
        for x in [-.045,.045]:
            box(wrist+Vector((x,.008,.09)),(.015,.02,.13),'hand_R',3)
    weaponmesh=bpy.data.meshes.new('AbilityOrRifle');weaponmesh.from_pydata(vertices,[],faces);weaponmesh.update()
    weapon=bpy.data.objects.new('BotWeapon',weaponmesh);bpy.context.collection.objects.link(weapon)
    for mat in mats: weaponmesh.materials.append(mat)
    for i,p in enumerate(weaponmesh.polygons): p.material_index=slots[i]
    vg=weapon.vertex_groups.new(name='hand_R');vg.add(list(range(len(vertices))),1,'REPLACE')
    modifier=weapon.modifiers.new('Hand skin','ARMATURE');modifier.object=rig;weapon.parent=rig

    controls={}
    for side,sign in [('L',-1),('R',1)]:
        for name,position in [('wrist_'+side,specs['hand_'+side][0]),('elbow_pole_'+side,(sign*.7,1.08,.21)),
                              ('ankle_'+side,specs['foot_'+side][0]),('knee_pole_'+side,(sign*.135,.5,.75))]:
            empty=bpy.data.objects.new('IK_'+name,None);bpy.context.collection.objects.link(empty)
            empty.location=A@Vector(position);empty.empty_display_type='SPHERE';empty.empty_display_size=.06
            empty.hide_render=True;controls[name]=empty
        for chain,target,pole in [('forearm_','wrist_','elbow_pole_'),('shin_','ankle_','knee_pole_')]:
            c=rig.pose.bones[chain+side].constraints.new('IK');c.name='Two bone IK'
            c.target=controls[target+side];c.pole_target=controls[pole+side];c.chain_count=2;c.use_stretch=False
            c.pole_angle= -pi/2
        for bone_name,target in [('hand_'+side,'wrist_'+side),('foot_'+side,'ankle_'+side)]:
            controls[target].rotation_mode='QUATERNION';controls[target].rotation_quaternion=data.bones[bone_name].matrix_local.to_quaternion()
            c=rig.pose.bones[bone_name].constraints.new('COPY_ROTATION');c.target=controls[target]
            c.target_space='WORLD';c.owner_space='WORLD'

    def offset(name, xyz):
        rig.pose.bones[name].location=data.bones[name].matrix_local.to_3x3().inverted() @ (A@Vector(xyz))

    def turn(name, axis, angle):
        rest=data.bones[name].matrix_local.to_quaternion()
        world=Quaternion(A@Vector(axis),angle)
        rig.pose.bones[name].rotation_quaternion=rest.inverted()@world@rest

    def pose(clip,t):
        for p in rig.pose.bones: p.location=(0,0,0);p.rotation_mode='QUATERNION';p.rotation_quaternion=(1,0,0,0);p.scale=(1,1,1)
        feet={'L':Vector((-.135,.11,0)),'R':Vector((.135,.11,0))}
        hands={'L':Vector((-.09,1.24,.43)),'R':Vector((.20,1.23,.40))}
        bob=.008*sin(t*pi*2)
        if clip in ['run','strafe_left','strafe_right']:
            cycle=t*pi*2
            bob=.022*(1-cos(cycle*2))
            for side,sign in [('L',-1),('R',1)]:
                phase=cycle+(0 if sign<0 else pi)
                stride=.24*cos(phase);lift=.11*max(0,sin(phase))
                if clip=='run':feet[side].z=stride
                else: feet[side].x+=stride*(1 if clip=='strafe_right' else -1)
                feet[side].y+=lift
            turn('pelvis',(0,1,0),.05*sin(cycle));turn('chest',(0,1,0),-.025*sin(cycle))
            if clip=='run':turn('spine',(1,0,0),.055)
        elif clip=='dash':
            bob=-.12;turn('spine',(1,0,0),.4);turn('chest',(1,0,0),.12)
            feet['L']+=Vector((-.045,.17,-.24));feet['R']+=Vector((.03,.06,.30))
            hands['L']+=Vector((-.12,-.09,-.04));hands['R']+=Vector((.04,-.04,.05))
        elif clip in ['air','throw']:
            bob=.035*sin(t*2*pi)
            feet['L']+=Vector((-.065,.33,-.17));feet['R']+=Vector((.02,.1,.17))
            hands['L']=Vector((-.40,1.20,.26));hands['R']=Vector((.39,1.31,.31))
            if clip=='throw':hands['R']+=Vector((-.15,.03,.16*sin(pi*t)))
        elif clip=='slide':
            bob=-.62;turn('spine',(1,0,0),.32);turn('chest',(1,0,0),-.15)
            feet['L']=Vector((-.22,.11,.53));feet['R']=Vector((.24,.11,-.21))
            hands['L']=Vector((-.18,.66,.39));hands['R']=Vector((.22,.71,.44))
        elif clip=='shoot':
            pulse=sin(pi*min(1,t*2))*(1-t)
            hands['L'].z-=pulse*.055;hands['R'].z-=pulse*.075
            turn('chest',(1,0,0),-.045*pulse)
        elif clip=='death':
            collapse=t*t*(3-2*t);bob=-.56*collapse
            turn('spine',(1,0,0),.80*collapse);turn('chest',(1,0,0),.55*collapse)
            turn('head',(1,0,0),.25*collapse)
            feet['L'].z-=.10*collapse;feet['R'].z-=.15*collapse
            hands['L']=hands['L'].lerp(Vector((-.3,.12,.62)),collapse)
            hands['R']=hands['R'].lerp(Vector((.30,.14,.65)),collapse)
        offset('pelvis',(0,bob,0))
        for side in ['L','R']:
            controls['wrist_'+side].location=A@hands[side]
            controls['ankle_'+side].location=A@feet[side]
        bpy.context.view_layer.update()

    # Keep editable IK target animation in the .blend; sample evaluated deform bones
    # into independent actions for glTF, which cannot transport Blender constraints.
    sampled={}
    for clip,duration in CLIPS.items():
        frames=round(duration*FPS)
        samples=[]
        for frame in range(frames+1):
            scene.frame_set(frame+1);pose(clip,frame/frames)
            samples.append({p.name:p.matrix.copy() for p in rig.pose.bones})
        sampled[clip]=samples
    for clip,duration in CLIPS.items():
        action=bpy.data.actions.new('IK controls • '+clip)
        for empty in controls.values():empty.animation_data_clear()
        rig.animation_data_clear();rig.animation_data_create();rig.animation_data.action=action
        frames=round(duration*FPS)
        for frame in range(frames+1):
            scene.frame_set(frame+1);pose(clip,frame/frames)
            for p in rig.pose.bones:
                p.keyframe_insert('location',frame=frame+1,group=p.name);p.keyframe_insert('rotation_quaternion',frame=frame+1,group=p.name)
            for empty in controls.values(): empty.keyframe_insert('location',frame=frame+1)
        # Control actions retain their names and can be selected in the action editor.
        for empty in controls.values():
            if empty.animation_data and empty.animation_data.action:empty.animation_data.action.name='IK '+clip+' • '+empty.name;empty.animation_data.action.use_fake_user=True
        action.use_fake_user=True
    rig.animation_data_clear()
    for empty in controls.values():empty.animation_data_clear()
    scene.frame_set(1);pose('idle',0)
    rig['asset_kind']=kind;rig['clip_pipeline']='Blender two bone IK → visual bake → glTF'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{kind}.blend'))
    for p in rig.pose.bones:
        for c in list(p.constraints):p.constraints.remove(c)
    for empty in controls.values():bpy.data.objects.remove(empty,do_unlink=True)
    rig.animation_data_create()
    for clip,samples in sampled.items():
        action=bpy.data.actions.new(clip);rig.animation_data.action=action
        for frame,matrices in enumerate(samples,1):
            scene.frame_set(frame)
            # Setting parent first lets Blender derive each local basis from its
            # visual matrix. Every chain is sampled after the IK solver.
            for p in rig.pose.bones:
                rest=p.bone.matrix_local
                p.matrix_basis=(rest.inverted() @ p.parent.bone.matrix_local @ matrices[p.parent.name].inverted() @ matrices[p.name]) if p.parent else rest.inverted() @ matrices[p.name]
                p.keyframe_insert('location',frame=frame,group=p.name)
                p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
                p.keyframe_insert('scale',frame=frame,group=p.name)
        track=rig.animation_data.nla_tracks.new();track.name=clip
        track.strips.new(clip,1,action);track.mute=True
    rig.animation_data.action=None
    for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);obj.select_set(True);weapon.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{kind}.glb'),export_format='GLB',use_selection=True,
        export_yup=True,export_skins=True,export_def_bones=True,export_animations=True,
        export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False)
    return {'kind':kind,'bones':len(data.bones),'vertices':body_counts[0], 'faces':body_counts[1],
            'ikChains':4,'clips':CLIPS,'height':1.80}


manifest={'generator':'Blender CLI','fps':FPS,'models':[build(kind) for kind in ['tactical','air','electric']]}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('RIGGED BOTS COMPLETE:',json.dumps(manifest))
