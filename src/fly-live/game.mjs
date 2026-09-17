import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  WORLD,
  createLiveSim,
  dropLiveFood,
  enterMap,
  MAPS,
  setLiveAct,
  setLivePaused,
  setLiveView,
  stepLiveSim,
  surfaceAt,
} from "./sim.mjs";
import { makeFruitMaps, makeLeather, makePaper, makePlaster, makeWoodMaps } from "./textures.mjs";

const SCALE = 0.0028;
const FLY_SCALE = 16;
const FLY_CLEARANCE = 0.0026 * FLY_SCALE;

function simXZ(x, y) {
  return {
    x: (x - WORLD.width * 0.5) * SCALE,
    z: (y - WORLD.height * 0.5) * SCALE,
  };
}

function worldToSim(x, z) {
  return {
    x: x / SCALE + WORLD.width * 0.5,
    y: z / SCALE + WORLD.height * 0.5,
  };
}

function fruitRadius(fruit) {
  return fruit.rx * SCALE;
}

function fruitSurfaceY(x, y, fruits) {
  const ground = surfaceAt(x, y, fruits);
  if (!ground.fruit) return 0.003;
  const r = fruitRadius(ground.fruit);
  const centerY = r * 0.78;
  const height = r * 0.8;
  return centerY + height * Math.sqrt(Math.max(0, 1 - ground.score));
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

const UP = new THREE.Vector3(0, 1, 0);
const _sample = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _basis = new THREE.Matrix4();

function fruitFrame(fruit) {
  const { x, z } = simXZ(fruit.x, fruit.y);
  const rx = fruitRadius(fruit);
  const grape = fruit.kind === "grape";
  return {
    x,
    z,
    rx: grape ? rx * 1.06 : rx,
    ry: grape ? rx * 0.92 : rx * 0.8,
    rz: grape ? fruit.ry * SCALE * 1.06 : fruit.ry * SCALE,
    cy: rx * 0.78,
  };
}

function sitOnFruit(x, z, fruit, pad = 0) {
  const f = fruitFrame(fruit);
  let dx = x - f.x;
  let dz = z - f.z;
  const score = (dx / f.rx) ** 2 + (dz / f.rz) ** 2;
  if (score > 0.92) {
    const s = Math.sqrt(0.92 / Math.max(score, 1e-6));
    dx *= s;
    dz *= s;
  }
  const ny = Math.sqrt(Math.max(0.08, 1 - (dx / f.rx) ** 2 - (dz / f.rz) ** 2));
  const normal = new THREE.Vector3(dx / f.rx, ny, dz / f.rz).normalize();
  const pos = new THREE.Vector3(f.x + dx, f.cy + ny * f.ry, f.z + dz);
  pos.addScaledVector(normal, pad);
  return { pos, normal };
}

function flyPose(fly, fruits) {
  const { x, z } = simXZ(fly.x, fly.y);
  const ground = surfaceAt(fly.x, fly.y, fruits);
  if (!ground.fruit) {
    const y = fly.airborne ? 0.08 + Math.min(1, Math.max(0, (fly.z - 10) / 60)) * 0.3 : 0.004 + FLY_CLEARANCE;
    return { pos: new THREE.Vector3(x, y, z), normal: UP.clone() };
  }
  const lift = fly.airborne ? 0.08 + Math.min(1, Math.max(0, (fly.z - 10) / 60)) * 0.3 : FLY_CLEARANCE + 0.016;
  return sitOnFruit(x, z, ground.fruit, lift);
}

function flyWorld(fly, fruits) {
  return flyPose(fly, fruits).pos;
}

function chaseDesired(out, pos, heading, airborne, fly, fruits, props) {
  const ground = surfaceAt(fly.x, fly.y, fruits);
  const backX = -Math.cos(heading);
  const backZ = -Math.sin(heading);
  if (ground.fruit && !airborne) {
    const r = fruitRadius(ground.fruit);
    out.copy(pos);
    out.y += r * 0.84 + 0.4;
    out.x += backX * (r * 0.36 + 0.18);
    out.z += backZ * (r * 0.36 + 0.18);
  } else {
    out.set(
      pos.x + backX * (airborne ? 0.46 : 0.28),
      pos.y + (airborne ? 0.36 : 0.26),
      pos.z + backZ * (airborne ? 0.46 : 0.28),
    );
  }
  pushOut(out, fruits, props);
  return out;
}

function pushOut(point, fruits, props = [], ignoreFruit = null) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const fruit of fruits) {
      if (ignoreFruit && fruit === ignoreFruit) continue;
      const f = fruitFrame(fruit);
      const rx = f.rx * 1.55;
      const ry = f.ry * 1.55;
      const rz = f.rz * 1.55;
      const dx = (point.x - f.x) / rx;
      const dy = (point.y - f.cy) / ry;
      const dz = (point.z - f.z) / rz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= 1 || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      point.x = f.x + (dx / d) * rx;
      point.y = f.cy + (dy / d) * ry + 0.08;
      point.z = f.z + (dz / d) * rz;
    }
    for (const prop of props) {
      if (prop.kind !== "bottle" && prop.kind !== "glass" && prop.kind !== "cup") continue;
      const { x, z } = simXZ(prop.x, prop.y);
      const radius = prop.kind === "bottle" ? 0.032 : 0.034;
      const height = prop.kind === "bottle" ? 0.2 : 0.08;
      const dx = point.x - x;
      const dz = point.z - z;
      const d = Math.hypot(dx, dz);
      if (d >= radius + 0.05 || point.y > height + 0.08) continue;
      const s = (radius + 0.06) / Math.max(d, 1e-4);
      point.x = x + dx * s;
      point.z = z + dz * s;
      point.y = Math.max(point.y, height + 0.05);
    }
  }
  return point;
}

function clearLook(cam, look, fruits, props, ignoreFruit) {
  const dx = look.x - cam.x;
  const dy = look.y - cam.y;
  const dz = look.z - cam.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return cam;
  const inv = 1 / len;
  for (let t = 0.04; t < len * 0.62; t += 0.05) {
    _sample.set(cam.x + dx * inv * t, cam.y + dy * inv * t, cam.z + dz * inv * t);
    const ox = _sample.x;
    const oy = _sample.y;
    const oz = _sample.z;
    pushOut(_sample, fruits, props, ignoreFruit);
    if (Math.hypot(_sample.x - ox, _sample.y - oy, _sample.z - oz) < 0.002) continue;
    cam.y = Math.max(cam.y, _sample.y + 0.1);
    cam.x += (cam.x - look.x) * 0.04;
    cam.z += (cam.z - look.z) * 0.04;
    pushOut(cam, fruits, props);
  }
  return cam;
}

function shadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function lathe(points, segments = 20) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function createFlyRig() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8c49a,
    roughness: 0.38,
    metalness: 0.04,
    sheen: 0.35,
    sheenColor: new THREE.Color(0x8a6a32),
    emissive: 0x2a1c0c,
    emissiveIntensity: 0.12,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xe02a22,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    emissive: 0x4a0808,
    emissiveIntensity: 0.25,
  });
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: 0xf0b90b,
    transparent: true,
    opacity: 0.72,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.7 });

  const abdomen = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.00155, 14, 10), bodyMat));
  abdomen.scale.set(1.7, 0.95, 0.95);
  abdomen.position.set(-0.002, 0, 0);
  const thorax = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.00135, 14, 10), bodyMat));
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.00085, 12, 10), bodyMat));
  head.position.set(0.002, 0.00015, 0);
  const eyeL = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.00062, 10, 8), eyeMat));
  const eyeR = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.00062, 10, 8), eyeMat));
  eyeL.position.set(0.00245, 0.00025, 0.00055);
  eyeR.position.set(0.00245, 0.00025, -0.00055);
  const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.0056, 0.0022), wingMat);
  const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.0056, 0.0022), wingMat);
  wingL.position.set(-0.0004, 0.0009, 0.0011);
  wingR.position.set(-0.0004, 0.0009, -0.0011);
  const legs = [];
  for (let i = 0; i < 6; i += 1) {
    const side = i < 3 ? 1 : -1;
    const slot = i % 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.00007, 0.00005, 0.0018, 5), legMat);
    leg.position.set(0.0006 - slot * 0.0011, -0.00062, side * (0.0009 + slot * 0.00015));
    leg.rotation.z = 0.7;
    leg.rotation.x = side * 0.55;
    legs.push(leg);
    group.add(leg);
  }
  group.add(abdomen, thorax, head, eyeL, eyeR, wingL, wingR);
  group.scale.setScalar(FLY_SCALE);
  group.traverse((node) => {
    node.renderOrder = 4;
    node.frustumCulled = false;
  });
  return { group, wingL, wingR, legs };
}

function createScene(sim) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090706);
  scene.fog = new THREE.Fog(0x090706, 8, 22);

  const wood = makeWoodMaps(6);
  const plaster = makePlaster();
  const leather = makeLeather();
  const paper = makePaper();
  const fruitMaps = {};
  for (const kind of ["peach", "amber", "rot", "apple", "citrus", "grape", "melon"]) {
    fruitMaps[kind] = makeFruitMaps(kind);
  }

  const tableW = WORLD.width * SCALE + 0.8;
  const tableD = WORLD.height * SCALE + 0.8;
  const tableMat = new THREE.MeshPhysicalMaterial({
    map: wood.map,
    normalMap: wood.normal,
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
  });
  const world = new THREE.Group();
  scene.add(world);

  const windowLight = new THREE.RectAreaLight(0xffd8a0, 7, 3.2, 2.1);
  windowLight.position.set(-6.4, 2.6, -4.2);
  windowLight.lookAt(0, 0.4, 0);
  scene.add(windowLight);

  const sun = new THREE.DirectionalLight(0xffe1b0, 1.35);
  sun.position.set(-7, 6.2, -3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x3a2a1c, 0.22));
  scene.add(new THREE.HemisphereLight(0xffe6c4, 0x2a1810, 0.28));
  const fill = new THREE.PointLight(0xffc878, 1.6, 10, 1.8);
  fill.position.set(2.2, 2.4, 1.8);
  scene.add(fill);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2efe6,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.88,
    thickness: 0.012,
    ior: 1.5,
    transparent: true,
  });
  const wineMat = new THREE.MeshPhysicalMaterial({ color: 0x5a1020, roughness: 0.2, transmission: 0.15, thickness: 0.02 });
  const metalMat = new THREE.MeshPhysicalMaterial({ color: 0xc8c2b4, metalness: 0.85, roughness: 0.22 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xe8dcc8, roughness: 0.28, clearcoat: 0.5 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d5a22, roughness: 0.7, side: THREE.DoubleSide });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a3218, roughness: 0.7 });

  const fruitGeo = new THREE.SphereGeometry(1, 48, 36);
  const foodMeshes = [];
  const foodMat = new THREE.MeshPhysicalMaterial({ color: 0xf0c24a, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.15 });
  const foodGeo = new THREE.SphereGeometry(0.004, 8, 6);

  const fillWorld = () => {
    while (world.children.length) world.remove(world.children[0]);
    foodMeshes.length = 0;
    const theme = sim.mapId;
    if (theme === "garden") {
      scene.background = new THREE.Color(0x6e8aa0);
      scene.fog = new THREE.Fog(0x6e8aa0, 12, 30);
      windowLight.intensity = 0;
      const grass = shadow(new THREE.Mesh(new THREE.PlaneGeometry(36, 28), new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 0.92 })), false, true);
      grass.rotation.x = -Math.PI / 2;
      world.add(grass);
    } else if (theme === "market") {
      scene.background = new THREE.Color(0x1a120c);
      scene.fog = new THREE.Fog(0x1a120c, 10, 26);
      windowLight.intensity = 0;
      const stone = shadow(new THREE.Mesh(new THREE.PlaneGeometry(34, 26), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.88, map: wood.map })), false, true);
      stone.rotation.x = -Math.PI / 2;
      world.add(stone);
    } else {
      scene.background = new THREE.Color(0x090706);
      scene.fog = new THREE.Fog(0x090706, 8, 22);
      windowLight.intensity = 7;
      const table = shadow(new THREE.Mesh(new THREE.BoxGeometry(tableW, 0.09, tableD), tableMat), true, true);
      table.position.y = -0.045;
      world.add(table);
      const floor = shadow(new THREE.Mesh(new THREE.PlaneGeometry(28, 22), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9, map: wood.map })), false, true);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.15;
      world.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.86, color: 0xb8a888 });
      const back = new THREE.Mesh(new THREE.PlaneGeometry(28, 8), wallMat);
      back.position.set(0, 2.4, -11);
      world.add(back);
      const left = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), wallMat);
      left.position.set(-13, 2.4, 0);
      left.rotation.y = Math.PI / 2;
      world.add(left);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.1), new THREE.MeshStandardMaterial({ color: 0xffe4b8, emissive: 0xffcc88, emissiveIntensity: 1.1 }));
      pane.position.copy(windowLight.position);
      pane.lookAt(0, 0.4, 0);
      world.add(pane);
    }

  for (const fruit of sim.fruits) {
    const maps = fruitMaps[fruit.kind] || fruitMaps.peach;
    const mat = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      normalMap: maps.normal,
      roughness: fruit.kind === "rot" ? 0.78 : 0.48,
      metalness: 0,
      clearcoat: fruit.kind === "rot" ? 0.08 : 0.32,
      clearcoatRoughness: 0.42,
      sheen: 0.35,
      sheenColor: new THREE.Color(0x8a4020),
      normalScale: new THREE.Vector2(1.4, 1.4),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const group = new THREE.Group();
    const { x, z } = simXZ(fruit.x, fruit.y);
    const rx = fruitRadius(fruit);
    const rz = fruit.ry * SCALE;
    const body = shadow(new THREE.Mesh(fruitGeo, mat));
    body.scale.set(rx, rx * 0.8, rz);
    group.add(body);
    const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0036, rx * 0.42, 10), stemMat), true, false);
    stem.position.y = rx * 0.86;
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(rx * 0.22, 14), leafMat);
    leaf.scale.set(1.4, 0.7, 1);
    leaf.position.set(rx * 0.16, rx * 0.98, 0);
    leaf.rotation.set(-0.9, 0.2, -0.5);
    group.add(stem, leaf);
    group.position.set(x, rx * 0.78, z);
    world.add(group);
  }

  const bananaCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.09, 0, 0),
    new THREE.Vector3(0, 0.04, 0.02),
    new THREE.Vector3(0.1, 0.008, 0),
  );
  const bananaGeo = new THREE.TubeGeometry(bananaCurve, 18, 0.016, 10, false);
  const bananaMat = new THREE.MeshPhysicalMaterial({ color: 0xe0c24a, roughness: 0.42, clearcoat: 0.2 });

  for (const prop of sim.props) {
    const { x, z } = simXZ(prop.x, prop.y);
    const s = 0.055 * prop.scale;
    let mesh;
    if (prop.kind === "bottle") {
      mesh = shadow(new THREE.Mesh(lathe([[0.012, 0], [0.02, 0.01], [0.02, 0.1], [0.008, 0.12], [0.007, 0.16]]), glassMat));
      const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 12), wineMat);
      wine.position.y = 0.045;
      const g = new THREE.Group();
      g.add(mesh, wine);
      g.position.set(x, 0, z);
      g.rotation.y = prop.rot;
      world.add(g);
      continue;
    }
    if (prop.kind === "glass" || prop.kind === "cup") {
      const g = new THREE.Group();
      const cup = shadow(new THREE.Mesh(lathe([[0.018, 0], [0.022, 0.004], [0.02, 0.05], [0.024, 0.056]]), glassMat));
      const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), wineMat);
      drink.position.y = 0.016;
      g.add(cup, drink);
      g.position.set(x, 0, z);
      world.add(g);
      continue;
    }
    if (prop.kind === "plate" || prop.kind === "bowl") {
      mesh = shadow(new THREE.Mesh(lathe([[0.002, 0.008], [0.08, 0.01], [0.09, 0.016], [0.086, 0.02]]), ceramic));
      mesh.position.set(x, 0, z);
      mesh.scale.setScalar(prop.kind === "bowl" ? 1.15 : 1);
      world.add(mesh);
      continue;
    }
    if (prop.kind === "board") {
      mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.22), tableMat));
      mesh.position.set(x, 0.01, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "knife") {
      const g = new THREE.Group();
      const blade = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.003, 0.018), metalMat));
      const handle = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.016), new THREE.MeshStandardMaterial({ color: 0x4a2e18 })));
      handle.position.x = -0.1;
      g.add(blade, handle);
      g.position.set(x, 0.01, z);
      g.rotation.y = prop.rot;
      world.add(g);
      continue;
    }
    if (prop.kind === "fork" || prop.kind === "spoon") {
      mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.004, 0.012), metalMat));
      mesh.position.set(x, 0.008, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "banana") {
      mesh = shadow(new THREE.Mesh(bananaGeo, bananaMat));
      mesh.position.set(x, 0.02, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "lemon") {
      mesh = shadow(new THREE.Mesh(fruitGeo, new THREE.MeshPhysicalMaterial({ color: 0xf0d24a, roughness: 0.45, clearcoat: 0.2 })));
      mesh.scale.setScalar(0.04 * prop.scale);
      mesh.position.set(x, 0.032, z);
      world.add(mesh);
      continue;
    }
    if (prop.kind === "grapes") {
      const g = new THREE.Group();
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x5a2a58, roughness: 0.3, clearcoat: 0.45 });
      for (let i = 0; i < 12; i += 1) {
        const bead = shadow(new THREE.Mesh(fruitGeo, mat));
        bead.scale.setScalar(0.012);
        bead.position.set(((i % 4) - 1.5) * 0.016, Math.floor(i / 4) * 0.014, ((i * 0.37) % 1) * 0.02);
        g.add(bead);
      }
      g.position.set(x, 0.02, z);
      world.add(g);
      continue;
    }
    if (prop.kind === "cheese") {
      mesh = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.03, 3), new THREE.MeshPhysicalMaterial({ color: 0xe8c46a, roughness: 0.55 })));
      mesh.position.set(x, 0.016, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "paper") {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.85 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.003, z);
      mesh.rotation.z = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "napkin" || prop.kind === "cloth") {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(prop.kind === "cloth" ? 0.42 : 0.2, 0.16, 8, 6),
        new THREE.MeshStandardMaterial({ map: leather, color: prop.kind === "cloth" ? 0x6a2a22 : 0xe8d8c0, roughness: 0.8, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.004, z);
      mesh.rotation.z = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "leaf") {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.4, s * 0.6), leafMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.004, z);
      mesh.rotation.z = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "tree") {
      const g = new THREE.Group();
      const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.55, 8), stemMat));
      trunk.position.y = 0.28;
      const crown = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), leafMat));
      crown.position.y = 0.62;
      g.add(trunk, crown);
      g.position.set(x, 0, z);
      g.scale.setScalar(prop.scale);
      world.add(g);
      continue;
    }
    if (prop.kind === "bush" || prop.kind === "pot") {
      mesh = shadow(new THREE.Mesh(new THREE.SphereGeometry(prop.kind === "pot" ? 0.05 : 0.09, 10, 8), leafMat));
      mesh.position.set(x, prop.kind === "pot" ? 0.05 : 0.07, z);
      mesh.scale.setScalar(prop.scale);
      world.add(mesh);
      continue;
    }
    if (prop.kind === "compost") {
      mesh = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.95 })));
      mesh.scale.set(1.4, 0.55, 1.1);
      mesh.position.set(x, 0.06, z);
      world.add(mesh);
      continue;
    }
    if (prop.kind === "crate") {
      mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), tableMat));
      mesh.position.set(x, 0.06, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    if (prop.kind === "awning") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.38), new THREE.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.7 }));
      mesh.position.set(x, 0.42, z);
      mesh.rotation.y = prop.rot;
      world.add(mesh);
      continue;
    }
    const colors = { peel: 0xd4a24a, pit: 0x3a2414, seed: 0x5a3a14, shard: 0xc9b48a, cork: 0x8a6232, mold: 0x3a4a22, core: 0x8a5a32 };
    mesh = shadow(new THREE.Mesh(new THREE.SphereGeometry(s * 0.35, 8, 6), new THREE.MeshStandardMaterial({ color: colors[prop.kind] || 0x4a3218, roughness: 0.7 })));
    mesh.position.set(x, s * 0.2, z);
    world.add(mesh);
  }

  const stainMat = new THREE.MeshStandardMaterial({ color: 0x3a1810, transparent: true, opacity: 0.38, roughness: 0.9 });
  for (const stain of sim.stains) {
    const { x, z } = simXZ(stain.x, stain.y);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(stain.r * SCALE, 18), stainMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, 0.0015, z);
    world.add(puddle);
  }
  const juiceMat = new THREE.MeshPhysicalMaterial({ color: 0x8a2a14, transparent: true, opacity: 0.45, roughness: 0.15, clearcoat: 0.4 });
  for (const juice of sim.juices) {
    const a = simXZ(juice.x, juice.y);
    const b = simXZ(juice.tx, juice.ty);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.018), juiceMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((a.x + b.x) / 2, 0.002, (a.z + b.z) / 2);
    strip.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x);
    world.add(strip);
  }

  const dropGeo = new THREE.SphereGeometry(1, 8, 6);
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xf0d48a, roughness: 0.08, transmission: 0.35, thickness: 0.01, transparent: true, opacity: 0.7 });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, sim.drops.length);
  const dummy = new THREE.Object3D();
  sim.drops.forEach((drop, i) => {
    const { x, z } = simXZ(drop.x, drop.y);
    dummy.position.set(x, drop.r * SCALE * 0.5, z);
    dummy.scale.setScalar(drop.r * SCALE);
    dummy.updateMatrix();
    drops.setMatrixAt(i, dummy.matrix);
  });
  drops.castShadow = false;
  drops.receiveShadow = true;
  world.add(drops);

  const gateMat = new THREE.MeshBasicMaterial({ color: 0xf0b90b, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  for (const gate of sim.portals || []) {
    const { x, z } = simXZ(gate.x, gate.y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 24), gateMat);
    ring.position.set(x, 0.28, z);
    world.add(ring);
  }

  };

  const syncFood = () => {
    while (foodMeshes.length < sim.food.length) {
      const crumb = shadow(new THREE.Mesh(foodGeo, foodMat), true, false);
      world.add(crumb);
      foodMeshes.push(crumb);
    }
    foodMeshes.forEach((mesh, i) => {
      const crumb = sim.food[i];
      if (!crumb) {
        mesh.visible = false;
        return;
      }
      const { x, z } = simXZ(crumb.x, crumb.y);
      mesh.visible = true;
      mesh.position.set(x, fruitSurfaceY(crumb.x, crumb.y, sim.fruits) + 0.004, z);
      mesh.scale.setScalar(0.7 + crumb.life * 0.5);
    });
  };
  fillWorld();
  syncFood();

  const fly = createFlyRig();
  scene.add(fly.group);
  const flyShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  flyShadow.rotation.x = -Math.PI / 2;
  scene.add(flyShadow);

  return {
    scene,
    fly,
    flyShadow,
    syncFood,
    rebuild() {
      fillWorld();
      syncFood();
    },
  };
}

export function createLiveGame(parent, hooks = {}) {
  const sim = createLiveSim(7);
  const bootMap = new URLSearchParams(window.location.search).get("map");
  if (bootMap && MAPS[bootMap] && bootMap !== "kitchen") {
    enterMap(sim, bootMap);
    sim.travel = 0;
  }
  RectAreaLightUniformsLib.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(parent.clientWidth || 1280, parent.clientHeight || 800);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  parent.appendChild(renderer.domElement);

  const { scene, fly, flyShadow, syncFood, rebuild } = createScene(sim);
  let mapEpoch = sim.mapEpoch;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(48, (parent.clientWidth || 1280) / (parent.clientHeight || 800), 0.05, 48);
  const start = flyWorld(sim.fly, sim.fruits);
  const camFollow = {
    heading: sim.fly.heading,
    pos: chaseDesired(new THREE.Vector3(), start, sim.fly.heading, false, sim.fly, sim.fruits, sim.props),
  };
  camera.position.copy(camFollow.pos);
  camera.lookAt(start.x, start.y + 0.006, start.z);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(parent.clientWidth || 1280, parent.clientHeight || 800), 0.045, 0.2, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const chase = new THREE.Vector3();
  const look = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();

  const onPointer = (event) => {
    if (event.target.closest?.(".fly-live-hud")) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const simPoint = worldToSim(hit.x, hit.z);
    dropLiveFood(sim, simPoint.x, simPoint.y);
    setLiveAct(sim, "FORAGE");
    hooks.onForced?.("FORAGE");
    syncFood();
  };
  renderer.domElement.addEventListener("pointerdown", onPointer);

  const applyCamera = (pos, heading, airborne) => {
    if (sim.view === "pilot") {
      fly.group.visible = false;
      flyShadow.visible = false;
      camera.fov = airborne ? 72 : 82;
      camera.near = 0.003;
      camera.updateProjectionMatrix();
      const ahead = airborne ? 0.16 : 0.07;
      camera.position.set(pos.x, pos.y + 0.004, pos.z);
      camera.lookAt(pos.x + Math.cos(heading) * ahead, pos.y + (airborne ? 0.008 : -0.012), pos.z + Math.sin(heading) * ahead);
      return;
    }
    fly.group.visible = true;
    flyShadow.visible = true;
    camera.fov = airborne ? 44 : 48;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    camFollow.heading += wrapAngle(heading - camFollow.heading) * 0.08;
    chaseDesired(chase, pos, camFollow.heading, airborne, sim.fly, sim.fruits, sim.props);
    camFollow.pos.lerp(chase, 0.1);
    pushOut(camFollow.pos, sim.fruits, sim.props);
    look.set(pos.x, pos.y + 0.018, pos.z);
    clearLook(camFollow.pos, look, sim.fruits, sim.props, surfaceAt(sim.fly.x, sim.fly.y, sim.fruits).fruit);
    camera.position.copy(camFollow.pos);
    camera.lookAt(look);
  };

  const animateFly = (stateFly, pose) => {
    const { pos, normal } = pose;
    fly.group.position.copy(pos);
    if (stateFly.airborne) {
      fly.group.rotation.set(-0.18, -stateFly.heading, 0);
      fly.group.quaternion.setFromEuler(fly.group.rotation);
    } else {
      _fwd.set(Math.cos(stateFly.heading), 0, Math.sin(stateFly.heading));
      _fwd.addScaledVector(normal, -_fwd.dot(normal)).normalize();
      if (_fwd.lengthSq() < 0.01) _fwd.set(Math.cos(stateFly.heading), 0, Math.sin(stateFly.heading));
      _right.crossVectors(_fwd, normal).normalize();
      _up.copy(normal).normalize();
      _up.crossVectors(_right, _fwd).normalize();
      _basis.makeBasis(_fwd, _up, _right);
      fly.group.quaternion.setFromRotationMatrix(_basis);
    }
    const flap = stateFly.airborne ? Math.sin(stateFly.flap * 2.4) * 0.7 : 0.08;
    fly.wingL.rotation.set(0.15, 0.15, 0.4 + flap);
    fly.wingR.rotation.set(0.15, -0.15, -0.4 - flap);
    fly.legs.forEach((leg, i) => {
      const slot = i % 3;
      const walk = !stateFly.airborne && (stateFly.motor === "WALK" || stateFly.motor === "SEARCH" || stateFly.motor === "SETTLE");
      const kick = walk ? Math.sin(stateFly.gait * 2.2 + slot * 2) * 0.35 : 0;
      const groom = stateFly.motor === "GROOM" && slot === 0 ? Math.sin(stateFly.groom * 0.45) * 0.6 : 0;
      leg.rotation.z = 0.7 + kick + groom;
    });
    flyShadow.position.set(pos.x + 0.004, fruitSurfaceY(stateFly.x, stateFly.y, sim.fruits) + 0.0016, pos.z + 0.003);
    flyShadow.scale.setScalar(stateFly.airborne ? 2.4 : 1.6);
    flyShadow.material.opacity = stateFly.airborne ? 0.12 : 0.3;
  };

  const frame = (now) => {
    const dt = Math.min(32, now - last);
    last = now;
    stepLiveSim(sim, dt / 16.67);
    if (sim.mapEpoch !== mapEpoch) {
      mapEpoch = sim.mapEpoch;
      rebuild();
      camFollow.heading = sim.fly.heading;
      const next = flyWorld(sim.fly, sim.fruits);
      camFollow.pos.copy(chaseDesired(new THREE.Vector3(), next, sim.fly.heading, true, sim.fly, sim.fruits, sim.props));
    }
    const pose = flyPose(sim.fly, sim.fruits);
    animateFly(sim.fly, pose);
    applyCamera(pose.pos, sim.fly.heading, sim.fly.airborne);
    syncFood();
    composer.render();
    hooks.onFrame?.(sim);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const resize = () => {
    const w = parent.clientWidth || 1280;
    const h = parent.clientHeight || 800;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize);

  observer.observe(parent);

  return {
    sim,
    setPaused(value) {
      setLivePaused(sim, value);
    },
    setAct(act) {
      if (act) setLiveAct(sim, act);
      else sim.forced = null;
    },
    setView(view) {
      setLiveView(sim, view);
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointer);
      composer.dispose();
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}
