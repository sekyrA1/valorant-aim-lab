"""Render review images for the Blender viewmodels without changing the game.

Run: blender --background --factory-startup --python tools/render_viewmodels.py
"""
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "models"
PREVIEWS = ROOT / "previews"
PREVIEWS.mkdir(exist_ok=True)
AXIS = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def game_pos(x, y, z):
    return AXIS @ Vector((x, y, z))


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def add_light(location, power, size):
    data = bpy.data.lights.new("Studio softbox", type="AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new("Studio softbox", data)
    bpy.context.collection.objects.link(obj)
    obj.location = game_pos(*location)
    obj.rotation_euler = (game_pos(0, -.08, -.25) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def render(weapon, arms):
    reset()
    for name in (weapon, arms):
        bpy.ops.import_scene.gltf(filepath=str(ASSETS / f"{name}.glb"))
    camera_data = bpy.data.cameras.new("Preview camera")
    camera = bpy.data.objects.new("Preview camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = game_pos(.72, .44, 1.1)
    camera.rotation_euler = (game_pos(0, -.08, -.27) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 1.95 if weapon != 'operator' else 2.35
    bpy.context.scene.camera = camera
    add_light((-.55, .9, .75), 36, 1.6)
    add_light((.75, .25, -.8), 24, 1.1)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.world.color = (.018, .027, .038)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(PREVIEWS / f"{weapon}.png")
    bpy.ops.render.render(write_still=True)


for weapon, pose in (("vandal", "tactical_arms"),
                     ("classic", "tactical_arms_pistol"),
                     ("knife", "tactical_arms_knife")):
    render(weapon, pose)
