import * as THREE from 'three';

// Coordinates follow the supplied A-site reference: Generator left, Dice right,
// Hell below Heaven, and the A Main arch offset toward the Tree/Switch side.
export const ASCENT_A = Object.freeze({ mainX: -6, mainZ: 16, siteHeight: 1.05, heavenHeight: 5.2 });

export function rushGroundHeight(x, z, colliders, radius = .45) {
  let height = 0;
  for (const box of colliders) {
    if (box.walkable && x + radius > box.min.x && x - radius < box.max.x &&
        z + radius > box.min.z && z - radius < box.max.z) height = Math.max(height, box.max.y);
  }
  return height;
}

// Small deterministic tile textures, shared by the meshes, work without external assets.
function masonryTexture(kind) {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / (kind === 'cobble' ? 16 : 32));
    const width = kind === 'cobble' ? 32 : 64;
    const seam = y % (kind === 'cobble' ? 16 : 32) < 2 || (x + (row % 2) * width / 2) % width < 2;
    const noise = ((x * 13 + y * 7 + (x * y) % 19) % 17) - 8;
    const value = seam ? 117 : 215 + noise;
    const offset = (y * size + x) * 4;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'cobble' ? 12 : 5, kind === 'cobble' ? 12 : 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function buildAscentASite(map) {
  map.clearMap();
  const group = map.currentMapGroup;
  group.name = 'Ascent A';
  const stoneTexture = masonryTexture('stone'), cobbleTexture = masonryTexture('cobble');
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const plaster = mat(0xc9bbb0), pale = mat(0xdcd0ba), brick = mat(0xa99783, { map: stoneTexture });
  const stone = mat(0xaaa6a4, { map: stoneTexture }), cobble = mat(0x8c878c, { map: cobbleTexture });
  const dark = mat(0x404842, { metalness: .45, roughness: .65 }), trim = mat(0x72776c, { metalness: .5 });
  const green = mat(0x4e765e, { metalness: .3 }), wood = mat(0x9b7756), grass = mat(0x69774a);
  const energy = mat(0x99dba6, { emissive: 0x4a9569, emissiveIntensity: .38 });
  const metal = mat(0x696961, { metalness: .65, roughness: .45 });
  const box = (name, x, y, z, w, h, d, material, solid = false, walkable = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y + h / 2, z);
    if (walkable || name === 'Courtyard cobblestones') {
      // World-scaled top UVs keep the thin stair treads from squeezing a whole tile pattern.
      const uv = mesh.geometry.getAttribute('uv'), vertices = mesh.geometry.getAttribute('position');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + vertices.getX(i)) / 34, (z + vertices.getZ(i)) / 28);
    }
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      map.addColliderBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      map.colliders.at(-1).walkable = walkable;
    }
    return mesh;
  };
  const rod = (name, from, to, radius, material) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
    mesh.name = name; mesh.position.copy(a.add(b).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const slab = ASCENT_A.siteHeight;
  box('Courtyard cobblestones', 0, -.25, 2, 30, .25, 44, cobble);
  box('Raised planting site', 0, 0, -12.5, 28, slab, 19, stone, true, true);
  // Six shallow risers can be climbed by the player and by the attacker navigation.
  for (let i = 0; i < 6; i++) {
    box(`Site stair ${i + 1}`, 0, 0, -.25 - i * .5, 28, (i + 1) * slab / 6, .5, stone, true, true);
    box('Stair nose', 0, (i + 1) * slab / 6 - .03, -.005 - i * .5, 28, .04, .055, pale);
  }
  // Perimeter architecture is asymmetric, rather than an empty rectangular arena.
  box('Tree-side facade', -14.4, 0, -2, 1.2, 11, 40, plaster, true);
  box('Bricks-side facade', 14.4, 0, -2, 1.2, 11.5, 40, pale, true);
  box('Back facade', 0, 0, -22, 30, 12, 1.2, plaster, true);
  box('Main left facade', -11.5, 0, 16, 5, 9.5, 1.2, plaster, true);
  box('Main right facade', 5.5, 0, 16, 17, 10.5, 1.2, pale, true);
  // Real arch opening: vertical jambs and a filled semicircular spandrel, not a torus on a wall.
  const archX = ASCENT_A.mainX, radius = 3, spring = 3.3;
  const archShape = new THREE.Shape();
  archShape.moveTo(-radius, 9.5); archShape.lineTo(radius, 9.5); archShape.lineTo(radius, spring);
  archShape.absarc(0, spring, radius, 0, Math.PI, false); archShape.lineTo(-radius, 9.5);
  const archWall = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape, { depth: 1.2, bevelEnabled: false, curveSegments: 24 }), plaster);
  archWall.name = 'A Main arch wall'; archWall.position.set(archX, 0, 15.4);
  archWall.castShadow = archWall.receiveShadow = true; group.add(archWall);
  map.addColliderBox(archX - radius, spring + radius, 15.4, archX + radius, 9.5, 16.6);
  for (let i = 0; i < 18; i++) {
    const angle = (i + .5) * Math.PI / 18;
    const voussoir = box('Arch cut stone', archX + Math.cos(angle) * 3.12,
      spring + Math.sin(angle) * 3.12 - .16, 15.25, .56, .32, .34, brick);
    voussoir.rotation.z = angle - Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    box('Arch jamb', archX + side * 3.12, 0, 15.25, .32, spring, .35, brick);
    box('A Main corridor wall', archX + side * 3.5, 0, 20, 1, 7, 8, plaster, true);
  }
  box('A Main ceiling', archX, 6.5, 20, 8, .5, 8, brick, true);
  box('A Main back wall', archX, 0, 24, 8, 7, 1, plaster, true);
  // Generator is a tall industrial cabinet with a recessed circular cooling fan.
  box('Generator plinth', -9.9, slab, -7.7, 4.8, .25, 6.5, dark, true);
  box('Generator housing', -9.9, slab + .25, -7.7, 4.2, 4.1, 5.9, green, true);
  box('Generator top rim', -9.9, slab + 4.35, -7.7, 4.4, .16, 6.1, trim);
  for (const x of [-11.9, -7.9]) box('Generator vertical frame', x, slab + .3, -7.7, .15, 4, 6, trim);
  box('Generator fan recess', -9.9, slab + 1.1, -4.72, 2.5, 2.6, .1, dark);
  const fan = new THREE.Mesh(new THREE.TorusGeometry(1.02, .09, 8, 32), trim);
  fan.name = 'Generator fan'; fan.position.set(-9.9, slab + 2.4, -4.61); group.add(fan);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const blade = box('Cooling fan blade', -9.9 + Math.sin(angle) * .6, slab + 2.4 + Math.cos(angle) * .6 - .14,
      -4.59, .23, .75, .06, metal);
    blade.rotation.z = -angle + .4;
  }
  for (let y = 1.5; y < 4; y += .32) box('Generator vent', -7.77, slab + y, -8.2, .045, .08, 3.6, dark);
  for (const x of [-11.5, -8.3]) rod('Generator cable', [x, slab + .08, -4.4], [x + .5, slab + .08, -2.3], .055, dark);
  // Dice: low radianite cover, framed luminous panels and X bracing.
  const crate = (name, x, y, z, w, h, d, material = green, luminous = true) => {
    box(name, x, y, z, w, h, d, material, true);
    for (const side of [-1, 1]) {
      const faceZ = z + side * (d / 2 + .015);
      box(`${name} panel`, x, y + .22, faceZ, w - .35, h - .44, .025, luminous ? energy : wood);
      for (const sx of [-1, 1]) rod(`${name} diagonal`, [x + sx * (w / 2 - .15), y + .16, faceZ + side * .025],
        [x - sx * (w / 2 - .15), y + h - .16, faceZ + side * .025], .055, trim);
      for (const sx of [-1, 1]) box('Crate corner', x + sx * (w / 2 - .08), y, faceZ, .16, h, .12, trim);
      for (const yy of [y, y + h - .14]) box('Crate edge', x, yy, faceZ, w, .14, .12, trim);
    }
    box('Crate lid', x, y + h, z, w + .04, .07, d + .04, trim);
  };
  crate('Dice radianite', 2.5, slab, -8.3, 2.7, 2.6, 2.6);
  crate('Dice stone crate', 5.2, slab, -8.3, 2.7, 2.15, 2.6, brick, false);
  // A raised wooden/metal balcony over a deep shaded Hell alcove.
  box('Heaven floor', 0, ASCENT_A.heavenHeight - .45, -18.8, 18, .45, 5.4, wood, true);
  box('Hell left pillar', -8.6, slab, -13.1, .8, 4.15, .8, brick, true);
  box('Hell right pillar', 8.6, slab, -13.1, .8, 4.15, .8, brick, true);
  box('Hell back timber', 0, slab, -21.32, 17, 3.6, .15, wood);
  for (const x of [-5.7, 0, 5.7]) box('Hell timber support', x, slab, -21.1, .18, 3.7, .28, trim);
  box('Heaven front beam', 0, 4.7, -16.05, 18.2, .55, .55, dark);
  box('Heaven balcony lip', 0, 5.2, -16.05, 18.2, .7, .2, green, true);
  for (const x of [-8.8, -4.4, 0, 4.4, 8.8]) box('Heaven balcony brace', x, 5.2, -15.88, .12, .75, .15, trim);
  box('Heaven upper facade', 0, 7.9, -21.4, 18, 4, .4, plaster);
  box('Heaven left wing', -11.4, slab, -18.3, 5.8, 9.8, 6.2, plaster, true);
  box('Heaven right wing', 11.4, slab, -18.3, 5.8, 9.8, 6.2, pale, true);
  // Narrow stone stack, tarp and barrels at the right side of Hell.
  crate('Hell stone stack', 7.3, slab, -13.5, 1.7, 2.1, 1.6, brick, false);
  const tarp = box('Hell folded tarp', 7.2, slab + 2.15, -13.5, 1.85, .15, 1.65, mat(0x687367));
  tarp.rotation.z = .08;
  // Front planters frame the central stairs, as in the supplied reference.
  for (const [x, w] of [[-10.4, 6.8], [11, 5.6]]) {
    box('Raised planter soil', x, 0, -1.15, w, slab, 3.7, grass, true);
    box('Planter front rim', x, slab - .3, .7, w, .3, .35, pale);
    for (const side of [-1, 1]) box('Planter side rim', x + side * w / 2, slab - .3, -1.15, .28, .3, 3.7, pale);
    for (let i = 0; i < 15; i++) {
      const px = x - w / 2 + .5 + (i * .67) % (w - 1);
      const pz = -2.6 + (i * .31) % 3;
      box('Planter foliage', px, slab, pz, .16, .09, .16, i % 3 ? grass : mat(0xb7a765));
    }
  }
  // A Main's plaster frontage has stone footing, pilasters and shuttered upper windows.
  for (const [x, w] of [[-11.5, 5], [5.5, 17]]) {
    box('Main stone footing', x, 0, 15.35, w, .65, .22, brick);
    box('Main cornice', x, 9.1, 15.15, w, .24, .5, brick);
  }
  for (const x of [-13.5, -9.3, -2.7, 5.7, 13.5]) {
    box('Main facade pilaster', x, .65, 15.3, .4, 8.45, .3, pale);
    box('Pilaster capital', x, 8.8, 15.12, .75, .35, .45, brick);
  }
  for (const x of [1.5, 7.8, 11.6]) {
    box('Main upper window trim', x, 6.8, 15.3, 1.7, 2, .2, brick);
    box('Main upper window recess', x, 6.95, 15.17, 1.4, 1.7, .1, dark);
    for (const side of [-1, 1]) box('Main window shutter', x + side * .48, 6.95, 15.08, .38, 1.7, .09, green);
    box('Main window sill', x, 6.7, 15.05, 1.95, .14, .4, pale);
  }
  const clay = mat(0xa07860);
  for (const x of [-11.4, 11.4]) {
    const roof = box('Heaven wing terracotta roof', x, 10.6, -18.3, 6.3, .24, 7, clay);
    roof.rotation.z = x < 0 ? .14 : -.14;
    box('Wing roof cornice', x, 10.55, -15.1, 6.5, .27, .45, brick);
    for (const px of [x - 1.2, x + 1.2]) {
      box('Wing upper shutter', px, 7.4, -15.12, 1.25, 1.8, .12, green);
      box('Wing window sill', px, 7.32, -15.02, 1.55, .13, .25, pale);
    }
  }
  // Painted A marking on the site-side wall.
  const marking = mat(0x718477);
  rod('Site A marking left', [13.74, 2.7, -11.8], [13.74, 4.6, -12.5], .055, marking);
  rod('Site A marking right', [13.74, 4.6, -12.5], [13.74, 2.7, -13.2], .055, marking);
  rod('Site A marking crossbar', [13.74, 3.35, -12.05], [13.74, 3.35, -12.95], .045, marking);
  crate('Bricks wooden crate', 12.2, slab, -4.3, 2.8, 2.8, 2.5, wood, false);
  // Brick cubby on the front right and the closed mechanical Tree door on the left.
  box('Bricks lower return', 11.4, 0, 7.1, 4.8, 1.25, 1.1, brick, true);
  box('Bricks wall buttress', 13.1, 0, 6, 1.4, 5.5, 2.8, plaster, true);
  box('Tree door surround', -13.68, 0, 4.8, .3, 5.2, 5.6, brick);
  box('Tree mechanical door', -13.45, 0, 4.8, .18, 4.6, 4.1, green, true);
  for (let z = 3; z <= 6.7; z += .46) box('Door metal slat', -13.32, .2, z, .12, 4.2, .07, trim);
  box('Tree door lintel', -13.1, 4.6, 4.8, .6, .45, 4.8, dark);
  box('Switch console', -13.08, 1.4, 8, .3, .55, .45, dark);
  box('Switch illuminated button', -12.9, 1.52, 8, .035, .2, .2, energy);
  // Architectural trim, windows, shutters, rain pipes, cables and warm sconces.
  for (const side of [-1, 1]) {
    const x = side * 13.75;
    for (const y of [.25, 6.9, 10.6]) box('Facade cornice', x, y, -2, .35, .2, 36, brick);
    for (const z of [-11, -4, 3, 10]) {
      box('Window frame', x - side * .04, 7.5, z, .18, 2, 1.7, brick);
      box('Window recess', x - side * .15, 7.65, z, .08, 1.7, 1.35, dark);
      for (const dz of [-.54, .54]) box('Window shutter', x - side * .23, 7.6, z + dz, .07, 1.8, .42, green);
    }
    rod('Rain pipe', [side * 13.55, .1, 11], [side * 13.55, 9.8, 11], .065, dark);
    rod('Overhead utility cable', [side * 13.45, 6.7, 14], [side * 13.45, 6.5, -14], .025, dark);
    for (const z of [8, -11]) {
      box('Wall lantern bracket', side * 13.35, 3.6, z, .42, .1, .2, dark);
      box('Wall lantern', side * 13.16, 3.15, z, .2, .4, .2, mat(0xffddad, { emissive: 0xffcb89, emissiveIntensity: .7 }));
    }
  }
  // Thin painted site outline instead of the former translucent red square.
  for (const x of [-10.1, 7.3]) box('Plant boundary stripe', x, slab + .012, -8.9, .045, .008, 13, pale);
  for (const z of [-15.4, -3.4]) box('Plant boundary stripe', -1.4, slab + .012, z, 17.4, .008, .045, pale);
  const sun = new THREE.DirectionalLight(0xffedda, 2.1);
  sun.position.set(-16, 30, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 75, left: -29, right: 29, top: 30, bottom: -30 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .025; sun.shadow.radius = 2;
  group.add(sun, new THREE.HemisphereLight(0xc0d8f1, 0x8a7462, 1.3));
  const hellLight = new THREE.PointLight(0xffdcad, 9, 9, 2);
  hellLight.position.set(0, 3.4, -20); group.add(hellLight);
  map.scene.background = new THREE.Color(0xb4cedf);
  map.scene.fog = new THREE.FogExp2(0xb4cedf, .002);
  return { spawnPos: new THREE.Vector3(8, slab, -6), spawnYawDeg: 149 };
}
