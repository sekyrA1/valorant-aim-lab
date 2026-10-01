"""Original meshes modeled from the official VALORANT arsenal's standard silhouettes.
Blender CLI, game coordinates Y-up / -Z forward. Keeps existing muzzle/grip sockets.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models'
SOURCE=ROOT/'assets/blender'
SOURCE.mkdir(parents=True,exist_ok=True)
A=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
bpy.context.preferences.filepaths.save_version=0

def material(name,c,metal,rough):
    m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
gun=material('Graphite cerakote',(.048,.055,.061),.65,.38)
edge=material('Machined dark steel',(.095,.105,.116),.8,.32)
poly=material('Black reinforced polymer',(.018,.021,.024),.05,.76)
rubber=material('Textured grip rubber',(.009,.011,.012),0,.9)
black=material('Recesses',(.004,.005,.006),.2,.55)
silver=material('Satin cylinder steel',(.22,.24,.26),.88,.27)
glass=material('Coated optic glass',(.015,.046,.058),.75,.14)
roles={}

def finish(o,name,mat,bevel=.002,role='static'):
    o.name=name;o.data.materials.append(mat);roles[o.name]=role
    if bevel:
        mod=o.modifiers.new('Edge chamfer','BEVEL');mod.width=bevel;mod.segments=2
        mod=o.modifiers.new('Face weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40
    return o

def profile(name,points,width,mat=gun,x=0,bevel=.002,role='static'):
    n=len(points)
    vertices=[A@Vector((x+s*width/2,y,z)) for s in [-1,1] for z,y in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,bevel,role)

def box(name,pos,size,mat=gun,bevel=.002,role='static'):
    bpy.ops.mesh.primitive_cube_add(size=1,location=A@Vector(pos));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel,role)

def tube(name,a,b,r,mat=gun,r2=None,role='static',sides=24):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=r,radius2=r if r2 is None else r2,depth=(b-a).length,location=A@((a+b)/2))
    o=bpy.context.object;o.rotation_euler=(A@(b-a)).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,.0008,role)

def bore(z,y,r,outer):
    # Annular muzzle with a recessed dark bore instead of a flat solid cylinder.
    verts=[];faces=[];N=32
    for depth,radius in [(z,outer),(z,r),(z+.025,r)]:
        verts += [A@Vector((radius*math.cos(i*2*math.pi/N),y+radius*math.sin(i*2*math.pi/N),depth)) for i in range(N)]
    for k in range(2):
        for i in range(N):faces.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
    m=bpy.data.meshes.new('Muzzle opening');m.from_pydata(verts,[],faces);m.update()
    bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free()
    o=bpy.data.objects.new('Muzzle opening',m);bpy.context.collection.objects.link(o);finish(o,'Muzzle opening',edge,0)
    tube('Bore shadow',(0,y,z+.026),(0,y,z+.028),r,black)

def path(name,points,r,mat=gun,role='static'):
    for i in range(len(points)-1):tube(name+str(i),points[i],points[i+1],r,mat,role=role,sides=10)

def grip(z=.10,style='rifle'):
    if style=='rifle':
        outline=[(z-.033,-.035),(z+.025,-.047),(z+.074,-.192),(z+.017,-.213),(z-.003,-.18)]
    else:
        outline=[(z-.034,-.032),(z+.033,-.041),(z+.022,-.075),(z+.033,-.112),
                 (z+.070,-.179),(z+.076,-.201),(z+.018,-.221),(z+.003,-.206),
                 (z+.01,-.185),(z-.012,-.112),(z-.036,-.074)]
    profile('Swept pistol grip',outline,.060,poly,bevel=.007)
    for s in [-1,1]:
        profile('Grip inset',[(z+.005,-.084),(z+.034,-.085),(z+.060,-.179),(z+.023,-.187)],.003,rubber,x=s*.031,bevel=.002)
        for i in range(7):
            y=-.103-i*.012
            box('Grip traction',(s*.033,y,z+.03+(-y-.10)*.25),(.002,.003,.025),poly if style!='rifle' else edge,.0005)
            if style!='rifle':
                for j in range(3):box('Grip stipple',(s*.0335,y+.004,z+.02+j*.008+(-y-.10)*.25),(.001,.002,.002),gun,.0002)
    path('Open trigger guard',[(0,-.048,z-.014),(0,-.10,z-.025),(0,-.105,z-.098),(0,-.086,z-.122),(0,-.049,z-.12)],.007,poly)
    path('Curved trigger',[(0,-.047,z-.059),(0,-.071,z-.065),(0,-.084,z-.08)],.0045,edge)

def sights(front,rear=.08):
    for z in [front,rear]:
        box('Sight pedestal',(0,.094,z),(.044,.016,.036),poly)
        for s in [-1,1]:profile('Sight protecting ear',[(z-.014,.099),(z-.008,.126),(z+.012,.12),(z+.015,.099)],.008,gun,x=s*.018,bevel=.001)
    box('Front sight blade',(0,.11,front),(.006,.022,.009),edge,.0005)
    box('Rear notch',(0,.104,rear),(.03,.006,.007),edge,.0005)

def pins(zs,y=.015,width=.10):
    for z in zs:
        for s in [-1,1]:
            tube('Recessed receiver pin',(s*(width/2),y,z),(s*(width/2+.003),y,z),.006,edge,sides=12)
            box('Pin slot',(s*(width/2+.0035),y,z),(.001,.0015,.007),black,.0002)

def magazine(curved=False,z=-.05,depth=.21,width=.057):
    if curved:
        pts=[]
        for i in range(13):
            t=i/12;pts.append((z-.042-.13*t*t,-.045-depth*t))
        for i in reversed(range(13)):
            t=i/12;pts.append((z+.044-.13*t*t,-.045-depth*t))
        profile('Curved box',pts,width,poly,role='magazine',bevel=.003)
        for s in [-1,1]:
            for offset in [-.026,0,.026]:
                path('Magazine pressed rib',[(s*(width/2+.001),-.065-depth*t,z+offset-.13*t*t) for t in [i/12 for i in range(11)]],.002,gun,'magazine')
        profile('Angled floor plate',[(z-.18,-depth-.03),(z-.088,-depth-.03),(z-.088,-depth-.045),(z-.18,-depth-.045)],width+.009,edge,role='magazine')
    else:
        profile('Box magazine',[(z-.048,-.045),(z+.041,-.045),(z+.048,-depth),(z-.043,-depth-.009)],width,poly,role='magazine')
        box('Magazine floor',(0,-depth-.007,z), (width+.008,.014,.102),gun,role='magazine')
        for s in [-1,1]:
            profile('Magazine recessed side',[(z-.035,-.075),(z+.029,-.075),(z+.035,-depth+.013),(z-.03,-depth+.007)],.002,rubber,x=s*(width/2+.001),role='magazine')

def rifle(kind):
    phantom=kind=='phantom'
    profile('Faceted upper receiver',[(-.36,-.027),(-.355,.058),(-.30,.083),(.075,.083),(.14,.049),(.13,-.037),(-.08,-.052)],.102,gun,bevel=.004)
    profile('Lower receiver',[(-.17,-.025),(.125,-.025),(.11,-.06),(.028,-.076),(-.002,-.056),(-.02,-.09),(-.135,-.077)],.087,poly)
    grip();pins([.09,-.04,-.23],.014)
    for s in [-1,1]:
        profile('Upper bevel facet',[(-.32,.054),(.069,.054),(.12,.032),(-.345,.032)],.003,edge,x=s*.052,bevel=.0008)
    box('Ejection recess',(.053,.031,-.025),(.003,.024,.127),black)
    box('Bolt carrier',(.055,.033,-.024),(.002,.016,.098),edge)
    box('Selector lever',(.049,-.025,.06),(.005,.008,.034),edge)
    box('Charging latch',(.065,.042,.045),(.034,.012,.023),poly)
    # Low top rail with individual teeth, not oversized sight blocks.
    box('Optic mounting rail',(0,.087,-.06),(.031,.007,.24),poly)
    for i in range(12):box('Rail tooth',(0,.093,.042-i*.019),(.038,.006,.009),gun,.0005)
    if not phantom:
        profile('Vandal tapered handguard',[(-.55,-.054),(-.52,.071),(-.285,.077),(-.23,-.024),(-.30,-.044)],.086,gun)
        for s in [-1,1]:
            for i in range(4):
                z=-.49+i*.048
                profile('Upper cooling recess',[(z-.017,.062),(z+.016,.062),(z+.025,.045),(z-.010,.045)],.002,black,x=s*.044,bevel=.001)
            for i in range(13):box('Handguard lower traction',(s*.044,-.035,-.50+i*.017),(.003,.025,.003),poly,.0005)
        tube('Exposed barrel',(0,.019,-.54),(0,.019,-.79),.016,edge)
        tube('Gas tube',(0,.065,-.51),(0,.065,-.645),.008,gun)
        profile('Front sight tower',[(-.657,.018),(-.657,.10),(-.641,.117),(-.632,.116),(-.633,.018)],.020,gun)
        tube('Muzzle brake',(0,.019,-.77),(0,.019,-.817),.024,gun)
        for z in [-.774,-.791]:tube('Brake collar',(0,.019,z),(0,.019,z-.005),.026,edge)
        bore(-.82,.019,.012,.024)
        sights(-.648)
        magazine(True)
        profile('Vandal angular stock',[(.14,.046),(.414,.046),(.429,.024),(.43,-.126),(.343,-.126),(.284,-.049),(.15,-.017)],.075,poly,bevel=.004)
        for s in [-1,1]:profile('Stock triangular panel',[(.316,-.012),(.405,-.012),(.405,-.105),(.366,-.096)],.003,gun,x=s*.039)
        box('Rubber butt',(0,-.04,.433),(.080,.177,.017),rubber,.004)
    else:
        profile('Phantom enclosed fore-end',[(-.48,-.024),(-.466,.070),(-.31,.075),(-.18,.042),(-.21,-.047),(-.43,-.047)],.097,gun,bevel=.005)
        for s in [-1,1]:
            profile('Long side inset',[(-.435,.036),(-.28,.036),(-.255,.015),(-.418,.006)],.003,poly,x=s*.050)
            for i in range(3):box('Fore-end vents',(s*.051,.058,-.40+i*.041),(.002,.010,.025),black,.001)
        tube('Faceted suppressor',(0,.02,-.47),(0,.02,-.807),.033,gun,sides=8)
        for z in [-.49,-.508,-.526]:tube('Suppressor rear grooves',(0,.02,z),(0,.02,z-.004),.034,poly,sides=8)
        bore(-.81,.02,.011,.031)
        sights(-.433)
        magazine(False,depth=.21)
        profile('Phantom telescopic stock',[(.14,.028),(.37,.028),(.389,.011),(.389,-.098),(.28,-.094),(.247,-.035),(.14,-.029)],.077,poly,bevel=.006)
        for s in [-1,1]:profile('Stock lower inset',[(.277,-.038),(.37,-.015),(.37,-.079),(.30,-.076)],.002,gun,x=s*.04)
        box('Stock cheek surface',(0,.029,.265),(.082,.014,.19),gun)
        box('Buttpad',(0,-.036,.39),(.083,.14,.015),rubber,.004)

def pistol():
    profile('Classic slide',[(-.247,.022),(-.247,.065),(-.23,.083),(.048,.083),(.067,.053),(.064,.011),(-.22,.011)],.070,gun,bevel=.0025,role='slide')
    for s in [-1,1]:
        profile('Slide bevel',[(-.227,.078),(.04,.078),(.055,.058),(-.236,.058)],.002,edge,x=s*.035,role='slide')
        for i in range(6):
            z=.018-i*.009
            profile('Rear slide serration',[(z,.052),(z+.004,.052),(z+.013,.02),(z+.009,.02)],.002,black,x=s*.036,bevel=.0004,role='slide')
        for i in range(3):box('Forward slide serration',(s*.036,.029,-.20+i*.012),(.002,.025,.004),black,.0004,'slide')
    box('Slide ejection opening',(0,.084,-.064),(.033,.002,.055),black,.001,'slide')
    profile('Polymer dust cover',[(-.239,.009),(.061,.011),(.08,-.031),(.019,-.047),(-.089,-.043),(-.22,-.025)],.065,poly,bevel=.004)
    grip(.025,'classic')
    # Magazine is mostly inside the swept grip; its base is visible and detachable.
    profile('Classic internal magazine',[(.011,-.071),(.050,-.073),(.091,-.201),(.055,-.214)],.041,poly,role='magazine')
    profile('Classic magazine floor',[(.051,-.211),(.095,-.197),(.10,-.209),(.049,-.225)],.059,poly,role='magazine')
    tube('Barrel',(0,.046,-.228),(0,.046,-.246),.016,edge)
    bore(-.25,.046,.010,.016)
    box('Front blade',(0,.089,-.224),(.012,.010,.012),poly,.001,'slide')
    for s in [-1,1]:box('Rear notch ear',(s*.018,.09,.037),(.01,.015,.018),poly,.001,'slide')
    pins([.006,-.10],-.017,.066)

def revolver():
    profile('Sheriff frame',[(-.15,.07),(.081,.07),(.119,.013),(.076,-.065),(-.033,-.079),(-.115,-.052)],.082,gun)
    # Cylinder remains visible outside the narrower frame, with six chamber flutes.
    tube('Cylinder drum',(0,.012,.005),(0,.012,-.113),.058,silver,role='cylinder',sides=48)
    for i in range(6):
        a=i*math.tau/6;x=.053*math.cos(a);y=.012+.053*math.sin(a)
        tube('Cylinder flute',(x,y,-.012),(x,y,-.087),.008,gun,role='cylinder',sides=12)
        tube('Chamber recess',(x*.70,.012+(y-.012)*.70,-.114),(x*.70,.012+(y-.012)*.70,-.116),.010,black,role='cylinder')
    profile('Long hexagonal barrel shroud',[(-.407,.021),(-.407,.07),(-.386,.092),(-.128,.082),(-.105,.039),(-.118,-.027),(-.35,-.027),(-.397,-.016)],.071,gun,bevel=.004)
    for s in [-1,1]:profile('Barrel side facet',[(-.384,.057),(-.159,.057),(-.137,.035),(-.36,.024)],.003,edge,x=s*.036)
    tube('Underbarrel ejector',(0,-.013,-.143),(0,-.013,-.31),.012,edge)
    bore(-.411,.053,.014,.022)
    grip(.10,'sheriff')
    profile('Raised hammer',[(.073,.062),(.091,.086),(.118,.067),(.12,.048)],.025,edge)
    box('Front sight',(0,.10,-.375),(.012,.018,.026),poly)
    for s in [-1,1]:box('Rear sight ear',(s*.018,.083,.058),(.009,.017,.025),poly)
    pins([.068],.034,.084)

def sniper():
    profile('Operator angular chassis',[(-.57,-.044),(-.54,.045),(-.46,.07),(.102,.066),(.143,.026),(.12,-.05),(-.14,-.061),(-.31,-.039)],.115,gun,bevel=.003)
    for s in [-1,1]:
        profile('Chassis side facet',[(-.51,.041),(-.29,.041),(-.18,-.021),(-.43,-.014)],.003,edge,x=s*.058)
        for i in range(3):box('Chassis cooling recess',(s*.06,.04,-.46+i*.036),(.002,.012,.025),black)
    grip(.10);magazine(False,z=-.11,depth=.118,width=.070)
    tube('Long heavy barrel',(0,.025,-.54),(0,.025,-1.065),.018,edge)
    tube('Barrel shoulder',(0,.025,-.545),(0,.025,-.60),.024,gun)
    tube('Octagonal muzzle brake',(0,.025,-1.025),(0,.025,-1.147),.035,gun,sides=8)
    for s in [-1,1]:
        for z in [-1.06,-1.105]:box('Brake lateral ports',(s*.034,.026,z),(.002,.022,.028),black,.003)
    bore(-1.15,.025,.012,.033)
    profile('Precision stock',[(.13,.023),(.45,.023),(.46,-.015),(.46,-.124),(.39,-.123),(.33,-.044),(.14,-.035)],.081,poly)
    box('Adjustable cheek rest',(0,.05,.355),(.088,.039,.19),poly,.007)
    box('Recoil buttpad',(0,-.048,.466),(.092,.169,.026),rubber,.004)
    for z in [-.14,.016]:
        box('Scope pedestal',(0,.076,z),(.054,.039,.036),poly)
        tube('Scope clamp',(0,.146,z+.012),(0,.146,z-.012),.039,gun)
    tube('Scope main tube',(0,.146,.08),(0,.146,-.26),.027,poly)
    tube('Objective taper',(0,.146,-.20),(0,.146,-.30),.027,gun,r2=.047)
    tube('Objective hood',(0,.146,-.30),(0,.146,-.33),.047,gun)
    tube('Objective glass',(0,.146,-.331),(0,.146,-.332),.040,glass)
    tube('Eyepiece',(0,.146,.073),(0,.146,.127),.035,poly)
    tube('Rear glass',(0,.146,.128),(0,.146,.129),.028,glass)
    tube('Elevation turret',(0,.168,-.078),(0,.208,-.078),.019,gun)
    tube('Windage turret',(.022,.146,-.078),(.047,.146,-.078),.018,gun)
    path('Bolt handle',[(.048,.043,.052),(.088,.041,.052),(.092,-.002,.064)],.008,edge,'bolt')
    tube('Bolt knob',(.092,-.002,.052),(.092,-.002,.079),.015,poly,role='bolt')
    pins([-.28,.09],-.003,.118)

def export(name):
    # Bake bevels, then merge each action into a single multi-material mesh.
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':continue
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        o.select_set(False)
    for role in sorted(set(roles.values())):
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and roles.get(o.name)==role]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        obj=objects[0];obj.name=role+'_surfaces'
        anchor=bpy.data.objects.new('Action_'+role,None);bpy.context.collection.objects.link(anchor)
        if role!='static':anchor['viewmodelRole']=role
        obj.parent=anchor
    bpy.context.scene['reference']='https://playvalorant.com/en-us/arsenal/ — original modeled approximation, standard finish'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_extras=True,export_animations=False)
    print('BUILT',name)

for name in ['vandal','phantom','classic','sheriff','operator']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);roles.clear()
    if name in ['vandal','phantom']:rifle(name)
    elif name=='classic':pistol()
    elif name=='sheriff':revolver()
    else:sniper()
    export(name)
