"""Build the first-person GLB assets with Blender's background Python runtime.

Run: blender --background --python tools/build_viewmodels.py
Coordinates below use the game's Three.js convention: -Z points forward.
"""
from pathlib import Path
from math import cos, sin, pi
import bpy
from mathutils import Matrix, Vector


OUT = Path(__file__).resolve().parents[1] / "public" / "models"
OUT.mkdir(parents=True, exist_ok=True)
# Blender Z-up to glTF Y-up, expressed by authoring in game coordinates.
AXIS = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def material(name, color, metallic=0, roughness=0.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def box(name, pos, size, mat, bevel=0.004):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.location = AXIS @ Vector(pos)
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft machined edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def tube(name, start, end, radius_a, radius_b, mat, vertices=12):
    a, b = Vector(start), Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius_a,
                                    radius2=radius_b, depth=direction.length)
    obj = bpy.context.object
    obj.name = name
    obj.location = AXIS @ ((a + b) / 2)
    obj.rotation_euler = (AXIS @ direction).to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(mat)
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def organic_loft(name, rings, mat, sides=14):
    """Smooth oval cross sections for a forearm, palm or curved finger."""
    vertices = []
    faces = []
    for x, y, z, rx, ry in rings:
        for i in range(sides):
            angle = i * 2 * pi / sides
            vertices.append(AXIS @ Vector((x + rx * cos(angle),
                                           y + ry * sin(angle), z)))
    for j in range(len(rings) - 1):
        for i in range(sides):
            k = j * sides + i
            faces.append((k, j * sides + (i + 1) % sides,
                          (j + 1) * sides + (i + 1) % sides, k + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(rings) - 1) * sides + i for i in range(sides)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format='GLB',
                              export_apply=True, export_yup=True)


fabric = material("Midnight woven sleeve", (.035, .05, .075), roughness=.9)
armor = material("Graphite forearm armor", (.085, .11, .15), .35, .5)
glove = material("Textured black glove", (.025, .032, .043), .1, .8)
joint = material("Rubber knuckle padding", (.12, .14, .16), .05, .75)
skin = material("Natural forearm skin", (.49, .31, .23), 0, .86)
cyan = material("Cyan lit inlay", (.01, .75, .86), .2, .25)
orange = material("Amber lit inlay", (.95, .31, .055), .2, .3)
steel = material("Gunmetal", (.075, .095, .12), .8, .36)
black = material("Matte polymer", (.025, .035, .045), .15, .65)
silver = material("Brushed steel", (.42, .5, .53), .85, .28)


def build_arm(side, x, y, z, accent):
    """Layered sleeve, hard wrist cuff, palm and individually jointed fingers."""
    before = set(bpy.context.scene.objects)
    elbow = (x + .11 * side, -.30, z + .36)
    wrist = (x + .012 * side, y - .023, z + .075)
    organic_loft("Upper sleeve", [
        (x + .11 * side, -.30, z + .38, .066, .059),
        (x + .094 * side, -.275, z + .32, .075, .066),
        (x + .071 * side, -.238, z + .255, .069, .06),
    ], fabric)
    organic_loft("Exposed anatomical forearm", [
        (x + .072 * side, -.238, z + .258, .063, .054),
        (x + .059 * side, -.215, z + .225, .069, .056),
        (x + .041 * side, -.18, z + .175, .062, .051),
        (x + .026 * side, -.145, z + .13, .05, .045),
        (x + .012 * side, y - .045, z + .083, .043, .041),
    ], skin)
    tube("Elbow fabric reinforcement", elbow,
         (x + .083 * side, -.255, z + .29), .075, .065, armor, 16)
    box("Sleeve hem", (x + .071 * side, -.238, z + .253),
        (.13, .014, .02), joint, .004)
    tube("Raised armor cuff", (x + .019 * side, y - .05, z + .14),
         (x + .009 * side, y - .025, z + .075), .052, .048, armor, 16)
    tube("Wrist gasket", wrist, (x, y, z + .045), .043, .042, black, 16)
    box("Cuff indicator", (x + .048 * side, y - .012, z + .09),
        (.009, .013, .039), accent, .002)
    organic_loft("Contoured glove and palm", [
        (x, y - .004, z + .055, .037, .029),
        (x, y, z + .023, .045, .032),
        (x, y + .003, z - .017, .048, .028),
        (x, y - .006, z - .052, .043, .022),
    ], glove)
    box("Back-of-hand armor", (x, y + .033, z - .01),
        (.075, .012, .067), armor, .008)
    for finger in range(4):
        fx = x + (finger - 1.5) * .019
        length = .1 - abs(finger - 1.5) * .008
        organic_loft(f"Curved finger {finger + 1}", [
            (fx, y - .006, z - .043, .011, .010),
            (fx, y - .015, z - .065, .011, .009),
            (fx, y - .029, z - .043 - length, .009, .008),
            (fx, y - .034, z - .057 - length, .006, .006),
        ], glove, 10)
        box("Knuckle pad", (fx, y + .025, z - .044),
            (.016, .009, .024), joint, .003)
    tube("Angled thumb base", (x - .047 * side, y, z + .005),
         (x - .058 * side, y - .012, z - .038), .016, .013, glove, 10)
    tube("Thumb tip", (x - .058 * side, y - .012, z - .038),
         (x - .046 * side, y - .028, z - .073), .013, .009, glove, 10)
    # Named arm pivots let the runtime animate the support hand during reload.
    pivot = bpy.data.objects.new("RightArm" if side == 1 else "LeftArm", None)
    bpy.context.collection.objects.link(pivot)
    for obj in set(bpy.context.scene.objects) - before - {pivot}:
        world = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = world


def build_arms(pose, accent):
    reset()
    if pose == "rifle":
        placements = ((1, .05, -.095, .105), (-1, -.055, -.075, -.25))
    elif pose == "pistol":
        placements = ((1, .055, -.12, .11), (-1, -.055, -.145, .015))
    else:  # Knife: the off-hand stays open to the left.
        placements = ((1, .045, -.06, .09), (-1, -.22, -.17, -.10))
    for side, x, y, z in placements:
        build_arm(side, x, y, z, accent)


build_arms("rifle", cyan)
export("tactical_arms")
build_arms("pistol", cyan)
export("tactical_arms_pistol")
build_arms("knife", cyan)
export("tactical_arms_knife")


reset()
# Compact suppressed SMG with clear silhouette and forward handguard.
box("Spectre receiver", (0, .012, -.075), (.10, .115, .34), steel, .012)
box("Upper receiver", (0, .077, -.095), (.085, .038, .33), armor)
box("Side ejection plate", (.052, .027, -.06), (.008, .055, .12), silver)
box("Charging handle", (.061, .077, .045), (.045, .017, .038), black)
box("Forward handguard", (0, .005, -.32), (.088, .09, .22), black, .012)
for side in (-1, 1):
    box("Side vent panel", (.047 * side, .015, -.33), (.006, .026, .15), armor)
    for i in range(3):
        box("Cooling vent", (.052 * side, .018, -.39 + i * .046),
            (.004, .012, .022), cyan, .001)
tube("Suppressor", (0, .019, -.415), (0, .019, -.70), .03, .03, black, 16)
tube("Muzzle ring", (0, .019, -.69), (0, .019, -.71), .033, .033, silver, 16)
box("Angled magazine", (0, -.12, -.015), (.055, .18, .082), black, .006)
box("Magazine floor", (0, -.207, -.009), (.065, .014, .091), cyan)
box("Pistol grip", (0, -.116, .102), (.065, .15, .07), black, .012)
box("Trigger guard", (0, -.07, .045), (.055, .012, .09), silver)
box("Collapsible stock rail", (0, .012, .17), (.05, .034, .18), silver)
box("Stock pad", (0, -.012, .26), (.085, .12, .038), black, .009)
box("Rear sight", (0, .115, .055), (.06, .038, .032), black)
box("Front sight", (0, .112, -.35), (.04, .035, .023), black)
export("spectre")


reset()
# Long, angular precision rifle; amber details separate it from the SMG.
box("Guardian receiver", (0, .015, -.055), (.107, .13, .38), steel, .011)
box("Angular top shell", (0, .088, -.08), (.092, .035, .43), silver, .006)
box("Barrel shroud", (0, .017, -.43), (.085, .09, .36), armor, .01)
for side in (-1, 1):
    box("Inset gold side plate", (.057 * side, .017, -.16),
        (.009, .048, .19), orange, .003)
    box("Shroud vent", (.046 * side, .045, -.48), (.006, .019, .19), black, .002)
tube("Precision barrel", (0, .018, -.56), (0, .018, -.87), .022, .022, black, 16)
tube("Muzzle brake", (0, .018, -.83), (0, .018, -.91), .037, .037, silver, 12)
box("Short magazine", (0, -.12, -.045), (.061, .145, .095), black, .007)
box("Magazine accent", (0, -.19, -.045), (.065, .012, .10), orange)
box("Pistol grip", (0, -.126, .103), (.067, .16, .075), black, .011)
box("Trigger guard", (0, -.065, .05), (.058, .012, .085), silver)
box("Skeleton stock beam", (0, .01, .27), (.055, .048, .24), silver)
box("Stock cheek rest", (0, .055, .37), (.095, .038, .16), black)
box("Stock butt", (0, -.028, .42), (.10, .14, .034), black, .01)
box("Sighting rail", (0, .115, -.06), (.045, .015, .4), black)
box("Rear sight", (0, .139, .07), (.052, .047, .025), black)
box("Front sight", (0, .137, -.43), (.038, .044, .025), black)
export("guardian")


def receiver(name, accent):
    box(f"{name} lower receiver", (0, .005, -.075), (.105, .115, .41), steel, .011)
    box(f"{name} top cover", (0, .073, -.11), (.095, .038, .42), armor, .006)
    box("Ejection port", (.056, .03, -.09), (.006, .034, .105), silver, .002)
    box("Charging handle", (.065, .075, .06), (.045, .017, .035), black)
    box("Grip", (0, -.124, .11), (.065, .17, .075), black, .012)
    box("Trigger", (0, -.068, .055), (.046, .013, .07), silver, .003)
    for side in (-1, 1):
        box("Receiver accent", (.057 * side, .02, -.20),
            (.007, .012, .12), accent, .002)


def rails(rear, front):
    box("Picatinny rail", (0, .108, (rear + front) / 2),
        (.047, .015, abs(front - rear)), black, .002)
    for z in (rear, front):
        box("Iron sight", (0, .135, z), (.055, .045, .021), black, .003)


reset()
# Vandal: angular receiver, exposed muzzle brake and curved-looking magazine.
receiver("Vandal", orange)
box("Long faceted handguard", (0, .012, -.40), (.089, .093, .31), armor, .011)
for side in (-1, 1):
    for i in range(4):
        box("Handguard cooling slot", (.047 * side, .026, -.51 + i * .066),
            (.007, .018, .03), black, .002)
tube("Barrel", (0, .02, -.53), (0, .02, -.76), .023, .023, black, 16)
tube("Slotted muzzle brake", (0, .02, -.73), (0, .02, -.82), .034, .034, silver, 12)
for side in (-1, 1):
    box("Brake port", (.032 * side, .02, -.78), (.006, .015, .029), black, .002)
box("Curved magazine upper", (0, -.13, -.05), (.06, .16, .10), black, .007)
box("Curved magazine lower", (0, -.215, -.028), (.062, .08, .10), black, .007)
box("Magazine floorplate", (0, -.257, -.018), (.068, .012, .11), orange)
box("Stock beam", (0, .012, .27), (.06, .05, .24), black)
box("Stock cheek pad", (0, .058, .36), (.088, .045, .14), armor)
box("Stock butt", (0, -.025, .42), (.095, .135, .035), black, .01)
rails(.09, -.49)
export("vandal")


reset()
# Phantom: smooth body with a full length integral suppressor.
receiver("Phantom", cyan)
box("Smooth rifle shroud", (0, .017, -.37), (.102, .108, .29), armor, .014)
for side in (-1, 1):
    box("Side inset", (.055 * side, .017, -.36), (.007, .042, .17), black)
    box("Side illuminated strip", (.06 * side, .046, -.35), (.006, .01, .21), cyan)
tube("Long suppressor", (0, .02, -.45), (0, .02, -.80), .033, .033, black, 20)
tube("Suppressor collar", (0, .02, -.51), (0, .02, -.54), .039, .039, silver, 20)
tube("Muzzle cap", (0, .02, -.79), (0, .02, -.81), .036, .036, armor, 20)
box("Straight magazine", (0, -.13, -.05), (.059, .17, .093), black, .009)
box("Magazine cap", (0, -.217, -.05), (.064, .013, .10), silver)
box("Stock connector", (0, .015, .245), (.057, .065, .19), armor)
box("Buttstock", (0, -.03, .345), (.099, .13, .055), black, .012)
rails(.065, -.39)
export("phantom")


reset()
# Classic: compact slide and separate grip, scaled for the pistol hand pose.
box("Classic slide", (0, .045, -.08), (.07, .061, .29), silver, .008)
box("Classic slide top", (0, .081, -.075), (.066, .015, .26), armor, .004)
box("Classic frame", (0, -.009, -.055), (.067, .055, .235), black, .01)
box("Classic barrel nose", (0, .042, -.234), (.05, .042, .032), black, .004)
box("Classic grip", (0, -.105, .035), (.065, .165, .082), glove, .012)
box("Classic magazine", (0, -.126, .035), (.045, .12, .057), black, .004)
box("Classic magazine floor", (0, -.192, .035), (.059, .012, .071), silver)
for side in (-1, 1):
    box("Grip texture plate", (.036 * side, -.116, .039),
        (.007, .11, .063), armor, .004)
    box("Slide status light", (.038 * side, .057, -.105),
        (.005, .01, .14), cyan, .002)
box("Trigger guard", (0, -.07, -.045), (.052, .014, .09), silver, .003)
box("Rear sight", (0, .102, .017), (.045, .03, .022), black)
box("Front sight", (0, .103, -.19), (.032, .027, .018), black)
export("classic")


reset()
# Sheriff: squared revolver frame with a visibly faceted cylinder.
box("Sheriff frame", (0, .015, -.035), (.089, .11, .27), steel, .011)
tube("Six chamber cylinder", (0, .012, .005), (0, .012, -.10),
     .066, .066, silver, 6)
for side in (-1, 1):
    box("Cylinder end plate", (.065 * side, .012, -.045),
        (.008, .077, .085), armor, .003)
box("Heavy barrel housing", (0, .048, -.245), (.07, .075, .30), steel, .006)
tube("Bore liner", (0, .051, -.36), (0, .051, -.405), .023, .023, black, 16)
box("Muzzle face", (0, .049, -.398), (.078, .084, .025), silver, .003)
box("Revolver grip", (0, -.12, .11), (.07, .17, .09), black, .015)
box("Gold grip emblem", (.039, -.12, .11), (.005, .043, .028), orange)
box("Hammer", (0, .097, .095), (.032, .041, .04), silver)
box("Rear sight", (0, .109, .072), (.047, .025, .02), black)
box("Front sight", (0, .107, -.36), (.032, .029, .018), black)
export("sheriff")


reset()
# Operator: massive long-range rifle and raised telescopic optic.
receiver("Operator", orange)
box("Thick receiver shell", (0, .015, -.10), (.13, .14, .52), armor, .014)
box("Long fore-end", (0, .005, -.49), (.105, .102, .42), steel, .011)
tube("Heavy barrel", (0, .025, -.66), (0, .025, -1.08), .03, .03, black, 16)
tube("Large muzzle brake", (0, .025, -1.03), (0, .025, -1.15), .052, .052, silver, 12)
for side in (-1, 1):
    box("Muzzle brake vent", (.052 * side, .025, -1.095),
        (.007, .02, .041), black)
box("Short box magazine", (0, -.13, -.11), (.075, .16, .13), black)
box("Magazine base", (0, -.214, -.11), (.08, .014, .14), orange)
box("Rear stock beam", (0, -.007, .30), (.071, .06, .28), silver)
box("Cheek rest", (0, .055, .40), (.113, .046, .18), black)
box("Shoulder pad", (0, -.045, .49), (.12, .18, .049), black, .012)
box("Scope mount", (0, .129, -.055), (.055, .055, .14), black)
tube("Scope optical tube", (0, .18, .075), (0, .18, -.25),
     .048, .048, black, 20)
tube("Objective bell", (0, .18, -.22), (0, .18, -.29),
     .059, .059, silver, 20)
tube("Rear eyepiece", (0, .18, .08), (0, .18, .12),
     .055, .055, armor, 20)
box("Scope adjustment dial", (0, .24, -.07), (.045, .025, .045), silver)
box("Bolt handle", (.081, .055, .055), (.068, .018, .035), silver)
export("operator")


reset()
# Knife blade is custom geometry, not a blunt box.
box("Wrapped knife handle", (0, .005, .075), (.045, .048, .205), black, .012)
for i in range(5):
    box("Handle wrap", (0, .032, .002 + i * .037),
        (.048, .006, .015), armor, .002)
box("Crossguard", (0, .017, -.04), (.105, .043, .022), silver, .004)
blade_vertices = [(0, .015, -.05), (.038, .015, -.11),
                  (.035, .015, -.29), (0, .015, -.41),
                  (-.035, .015, -.29), (-.038, .015, -.11),
                  (0, .035, -.05), (.025, .035, -.12),
                  (.023, .035, -.29), (0, .035, -.39),
                  (-.023, .035, -.29), (-.025, .035, -.12)]
verts = [AXIS @ Vector(v) for v in blade_vertices]
faces = [(0, 1, 2, 3, 4, 5), (6, 11, 10, 9, 8, 7)]
faces += [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
mesh = bpy.data.meshes.new("Ground combat blade")
mesh.from_pydata(verts, [], faces)
mesh.update()
blade = bpy.data.objects.new("Ground combat blade", mesh)
bpy.context.collection.objects.link(blade)
blade.data.materials.append(silver)
for side in (-1, 1):
    tube("Colored cutting edge", (.032 * side, .024, -.12),
         (.026 * side, .024, -.31), .003, .002, cyan, 8)
tube("Pommel loop", (0, .005, .17), (0, .005, .20), .027, .027, armor, 12)
export("knife")

print("Exported:", *(str(p) for p in OUT.glob('*.glb')))
