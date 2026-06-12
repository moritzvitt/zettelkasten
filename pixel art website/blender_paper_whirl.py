import math
import random
from pathlib import Path

import bpy
from mathutils import Euler, Vector


OUTPUT = Path(__file__).with_name("paper_whirl.blend")
random.seed(12)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(name, color, roughness=0.7, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    return material


def make_image_material(path):
    material = bpy.data.materials.new(f"newspaper texture - {path.stem}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path))
    texture.extension = "EXTEND"
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    return material


def make_paper_mesh(name, width, height, curl):
    hw = width / 2
    hh = height / 2
    verts = [
        (-hw, -hh, 0),
        (hw, -hh, curl * 0.35),
        (hw, hh, -curl * 0.2),
        (-hw, hh, curl),
    ]
    faces = [(0, 1, 2, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Newspaper UV")
    uv_coordinates = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for polygon in mesh.polygons:
        for loop_index, uv in zip(polygon.loop_indices, uv_coordinates):
            uv_layer.data[loop_index].uv = uv
    return mesh


def add_paper(name, material, location, rotation, scale=1.0):
    mesh = make_paper_mesh(name, 0.72, 0.96, random.uniform(-0.045, 0.045))
    paper = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(paper)
    paper.data.materials.append(material)
    paper.location = location
    paper.rotation_euler = rotation
    paper.scale = (scale, scale, scale)
    return paper


def keyframe_transform(obj, frame, location, rotation, scale=None):
    obj.location = location
    obj.rotation_euler = rotation
    if scale is not None:
        obj.scale = scale
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    obj.keyframe_insert(data_path="scale", frame=frame)


def set_interpolation(obj, interpolation="SINE"):
    if not obj.animation_data or not obj.animation_data.action:
        return

    action = obj.animation_data.action
    if not hasattr(action, "fcurves"):
        return

    for curve in action.fcurves:
        for keyframe in curve.keyframe_points:
            keyframe.interpolation = interpolation


def add_flat_mark(parent, name, material, location, dimensions):
    bpy.ops.mesh.primitive_cube_add(size=1)
    mark = bpy.context.object
    mark.name = name
    mark.parent = parent
    mark.location = location
    mark.dimensions = dimensions
    mark.data.materials.append(material)
    return mark


def add_newspaper_texture(paper, ink_material, image_material):
    add_flat_mark(
        paper,
        f"{paper.name}_masthead",
        ink_material,
        (0, 0.34, 0.006),
        (0.44, 0.032, 0.003),
    )
    add_flat_mark(
        paper,
        f"{paper.name}_date_rule",
        ink_material,
        (0, 0.285, 0.006),
        (0.58, 0.008, 0.003),
    )

    column_x = [-0.19, 0.0, 0.19]
    for column, x in enumerate(column_x):
        for row in range(7):
            y = 0.2 - row * 0.065 + random.uniform(-0.006, 0.006)
            x_len = random.uniform(0.11, 0.17)
            add_flat_mark(
                paper,
                f"{paper.name}_copy_c{column + 1}_{row + 1}",
                ink_material,
                (x, y, 0.006),
                (x_len, 0.01, 0.003),
            )

    for x in [-0.095, 0.095]:
        add_flat_mark(
            paper,
            f"{paper.name}_column_rule_{x}",
            ink_material,
            (x, -0.02, 0.006),
            (0.006, 0.44, 0.003),
        )

    for i in range(random.randint(1, 2)):
        x = random.choice([-0.19, 0.0, 0.19])
        y = random.uniform(-0.26, -0.1)
        add_flat_mark(
            paper,
            f"{paper.name}_photo_box_{i + 1}",
            image_material,
            (x, y, 0.005),
            (0.14, 0.095, 0.0025),
        )


def add_wind_curve(name, radius, height, material):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 24
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 2

    spline = curve.splines.new("POLY")
    points = 84
    spline.points.add(points - 1)
    for index, point in enumerate(spline.points):
        t = index / (points - 1)
        angle = t * math.tau * 2.4
        r = radius * (0.45 + t * 0.55)
        point.co = (
            math.cos(angle) * r,
            math.sin(angle) * r,
            0.1 + height * t,
            1,
        )

    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def build_scene():
    clear_scene()

    texture_dir = Path(__file__).with_name("textures") / "newspapers"
    texture_paths = sorted(
        path for path in texture_dir.glob("*")
        if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    paper_materials = [make_image_material(path) for path in texture_paths]
    if not paper_materials:
        paper_materials = [
            make_material("newsprint warm white", (0.9, 0.84, 0.68, 1)),
            make_material("newsprint aged cream", (0.78, 0.71, 0.55, 1)),
            make_material("newsprint pale grey", (0.75, 0.73, 0.67, 1)),
        ]
    ink_material = make_material("soft graphite ink", (0.18, 0.15, 0.12, 1))
    image_material = make_material("muted newspaper photo ink", (0.38, 0.37, 0.34, 1))
    floor_material = make_material("matte warm floor", (0.78, 0.72, 0.62, 1))
    wind_material = make_material("transparent wind trails", (0.7, 0.88, 1.0, 0.28), alpha=0.28)

    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.035))
    floor = bpy.context.object
    floor.name = "simple matte floor"
    floor.data.materials.append(floor_material)

    papers = []
    for i in range(24):
        radius = random.uniform(0.0, 0.75)
        angle = random.uniform(0, math.tau)
        start = Vector((
            math.cos(angle) * radius,
            math.sin(angle) * radius * 0.65,
            0.012 + i * 0.006,
        ))
        start_rot = Euler((
            random.uniform(-0.22, 0.22),
            random.uniform(-0.18, 0.18),
            random.uniform(0, math.tau),
        ), "XYZ")
        paper = add_paper(
            f"wind paper {i + 1:02d}",
            random.choice(paper_materials),
            start,
            start_rot,
            random.uniform(0.78, 1.05),
        )
        add_newspaper_texture(paper, ink_material, image_material)
        papers.append((paper, start.copy(), start_rot.copy()))

    for index, (paper, start, start_rot) in enumerate(papers):
        phase = index / len(papers) * math.tau
        radius = random.uniform(1.0, 2.1)
        lift = random.uniform(0.45, 2.35)
        end_angle = phase + math.tau * random.uniform(0.8, 1.55)

        keyframe_transform(paper, 1, start, start_rot, paper.scale)
        keyframe_transform(paper, 14, start, start_rot, paper.scale)

        for frame, spin, height_factor in [(34, 0.55, 0.45), (62, 1.15, 0.82), (96, 1.85, 1.0)]:
            t_angle = phase + math.tau * spin
            location = Vector((
                math.cos(t_angle) * radius,
                math.sin(t_angle) * radius * 0.72,
                lift * height_factor + random.uniform(-0.12, 0.12),
            ))
            rotation = Euler((
                start_rot.x + random.uniform(-1.4, 1.4) + frame * 0.015,
                start_rot.y + random.uniform(-1.1, 1.1) + frame * 0.01,
                end_angle + frame * 0.035,
            ), "XYZ")
            keyframe_transform(paper, frame, location, rotation, paper.scale)

        set_interpolation(paper, "SINE")

    for i, radius in enumerate([0.9, 1.35, 1.8], start=1):
        wind = add_wind_curve(f"wind spiral trail {i}", radius, 2.2 + i * 0.25, wind_material)
        wind.rotation_euler.z = i * 0.55
        wind.keyframe_insert(data_path="rotation_euler", frame=14)
        wind.rotation_euler.z += math.tau * 0.7
        wind.keyframe_insert(data_path="rotation_euler", frame=96)
        set_interpolation(wind, "SINE")

    bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 5))
    key = bpy.context.object
    key.name = "large softbox"
    key.data.energy = 520
    key.data.size = 5

    bpy.ops.object.camera_add(location=(0, -5.6, 3.1), rotation=(math.radians(62), 0, 0))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.name = "camera - paper whirl"
    camera.data.lens = 38

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 110
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.fps = 24
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    if hasattr(bpy.context.scene, "eevee"):
        bpy.context.scene.eevee.taa_render_samples = 64

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (1, 0.98, 0.93)

    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))


if __name__ == "__main__":
    build_scene()
