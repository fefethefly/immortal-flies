import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { fieldFromCircuit } from "./home-cross-section.mjs";
import { createHologramModel } from "./home-hologram-model.mjs";
import { createFieldEnvironment } from "./home-field-environment.mjs";
import { projectHomeBody } from "./home-field-state.mjs";
import { BONE, GOLD } from "./brand.mjs";

// Each pose is [x, y, z, scale, opacity]. The same scene persists throughout
// the document. Only measured graph nodes respond to recorded simulation spikes.
const SHOTS = [
  {
    brain: [0, -0.85, 0, 2.65, 1],
    fly: [0, 0, 0, 1, 0],
    memory: 0,
    swarm: 0,
    world: [0, 0, -1, 1, 0],
  },
  {
    brain: [-1.8, 0.1, 0, 1.95, 0],
    fly: [-1.8, 0, 0, 1.6, 1],
    memory: 0,
    swarm: 0,
    world: [0, 0, -1, 1, 0],
  },
  {
    brain: [-1.8, 0.75, 0, 0.3, 0],
    fly: [-1.8, 0.05, 0, 1.65, 1],
    memory: 0,
    swarm: 0,
    world: [0, 0, -1, 1, 0],
  },
  {
    brain: [1.8, 0.6, 0, 0.3, 0],
    fly: [1.8, 0.05, 0, 1.25, 1],
    memory: 1,
    swarm: 0,
    world: [0, 0, -1, 1, 0],
  },
  {
    brain: [0, 0.6, 0, 0.3, 0],
    fly: [0, -1.4, 0, 0.52, 1],
    memory: 0,
    swarm: 1,
    world: [0, 0, -1, 1, 0],
  },
  {
    brain: [0, 0, 0, 1, 0],
    fly: [0, 0, -1, 0.4, 0],
    memory: 0,
    swarm: 0,
    world: [0, 0, -1, 1.7, 0.55],
  },
  {
    brain: [0, 0, 0, 1, 0],
    fly: [0, 0, -1, 0.4, 0],
    memory: 0,
    swarm: 0,
    world: [-1.85, 0.1, -0.5, 1.3, 1],
  },
  {
    brain: [0, 0, 0, 1, 0],
    fly: [0, 0.65, 0, 1.05, 1],
    memory: 0,
    swarm: 0,
    world: [0, 0, -1, 1, 0],
  },
];
const MOBILE_SHOTS = [
  { ...SHOTS[0], brain: [0, -0.65, 0, 2.6, 1] },
  { ...SHOTS[1], brain: [0, 0.7, 0, 1.55, 0], fly: [0, 1.35, 0, 1.15, 1] },
  { ...SHOTS[2], fly: [0, 1.35, 0, 1.15, 1] },
  { ...SHOTS[3], fly: [0, 1.35, 0, 0.88, 1] },
  { ...SHOTS[4], fly: [0, 1.2, 0, 0.48, 1] },
  { ...SHOTS[5], world: [0, 0.6, -1, 1.6, 0.5] },
  { ...SHOTS[6], world: [0, 1.3, -1, 1.05, 0.7] },
  { ...SHOTS[7], fly: [0, 1.8, 0, 0.95, 1] },
];
const mix = THREE.MathUtils.lerp;
const smooth = (x) => x * x * (3 - 2 * x);
function material(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
function lines(points, mat, segments = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  return segments
    ? new THREE.LineSegments(geometry, mat)
    : new THREE.Line(geometry, mat);
}
function orbit(radius, mat, start = 0, length = Math.PI * 2) {
  const points = [];
  for (let i = 0; i <= 180; i++) {
    const a = start + (i / 180) * length;
    points.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  return lines(points, mat);
}

function createBrain(graph, pixel) {
  const group = new THREE.Group();
  if (!graph)
    return { group, update() {}, setOpacity() {}, setPixelRatio() {} };
  const field = fieldFromCircuit(graph, graph.n);
  const positions = new Float32Array(graph.n * 3),
    activity = new Float32Array(graph.n),
    seeds = new Float32Array(graph.n);
  field.neurons.forEach((node, i) => {
    positions.set([node.x, node.y, node.z], i * 3);
    seeds[i] = ((i * 7919) % 1000) / 1000;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("activity", new THREE.BufferAttribute(activity, 1));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    opacity: { value: 1 },
    pixel: { value: pixel },
    bone: { value: new THREE.Color(BONE) },
    gold: { value: new THREE.Color(GOLD) },
  };
  const points = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float activity;attribute float seed;uniform float pixel;varying float firing;varying float grain;
      void main(){firing=activity;grain=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
      gl_PointSize=min(26.,(.85+seed*1.15+activity*7.)*pixel*(5./-p.z));}`,
    fragmentShader: `uniform float opacity;uniform vec3 bone;uniform vec3 gold;varying float firing;varying float grain;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
      float a=exp(-d*d*4.)*(.22+grain*.5+firing*1.4)*opacity;
      gl_FragColor=vec4(mix(bone,gold,.14+firing*.38)*(1.+firing*.5),a);}`,
  });
  group.add(new THREE.Points(geometry, points));
  // Render sampled, measured edges as fine straight connections. No invented
  // fiber trajectories or decorative firing events are added to the graph.
  const connections = [];
  field.edges.forEach(([a, b], i) => {
    if (i % 6 === 0)
      connections.push(
        ...positions.subarray(a * 3, a * 3 + 3),
        ...positions.subarray(b * 3, b * 3 + 3),
      );
  });
  const edge = material(BONE, 0.006);
  group.add(lines(connections, edge, true));
  let previous;
  return {
    group,
    setPixelRatio(value) {
      uniforms.pixel.value = value;
    },
    update(frame) {
      if (frame === previous) return;
      activity.fill(0);
      for (const i of frame?.spikes || [])
        if (i < activity.length) activity[i] = 1;
      geometry.attributes.activity.needsUpdate = true;
      previous = frame;
    },
    setOpacity(value) {
      uniforms.opacity.value = value;
      edge.opacity = 0.006 * value;
      group.visible = value > 0.005;
    },
  };
}

function createSwarm(model) {
  // Merge a simplified outline once; satellites share geometry rather than
  // each allocating another renderer or duplicating the detailed materials.
  model.group.updateMatrixWorld(true);
  const positions = [],
    vector = new THREE.Vector3();
  model.specimen.traverse((object) => {
    if (!object.isLine) return;
    const a = object.geometry.attributes.position;
    for (let i = 1; i < a.count; i++)
      for (const j of [i - 1, i]) {
        vector.fromBufferAttribute(a, j).applyMatrix4(object.matrixWorld);
        positions.push(vector.x, vector.y, vector.z);
      }
  });
  [
    [0, 0.53, 0.02, 0.3, 0.25],
    [0, 0.02, 0, 0.27, 0.37],
    [0, -0.67, 0, 0.27, 0.43],
  ].forEach(([x, y, z, rx, ry]) => {
    for (let i = 0; i < 48; i++)
      for (const a of [(i / 48) * Math.PI * 2, ((i + 1) / 48) * Math.PI * 2])
        positions.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry, z);
  });
  const group = new THREE.Group(),
    mat = material(BONE, 0.45),
    wire = lines(positions, mat, true);
  const nodes = [
    [-2.6, 0.65, -0.3],
    [-1.5, -1.2, 0.1],
    [1.4, 0.8, -0.6],
    [2.6, -0.7, -0.1],
    [0.2, 1.15, -1],
    [-3.4, -0.5, -1],
    [3.4, 0.8, -1.4],
    [0.4, -1.65, -0.4],
  ];
  const flies = nodes.map((p, i) => {
    const fly = wire.clone();
    fly.position.set(...p);
    fly.scale.setScalar(0.2 + (i % 3) * 0.035);
    fly.rotation.set(0.3, -0.2 + i * 0.13, i * 0.51 - 0.6);
    group.add(fly);
    return fly;
  });
  const paths = [];
  nodes.forEach((p, i) => {
    paths.push(...p, 0, 0, 0);
    if (i) paths.push(...p, ...nodes[i - 1]);
  });
  const linkMaterial = material(GOLD, 0.17);
  group.add(lines(paths, linkMaterial, true));
  return {
    group,
    update(time, opacity, mobile) {
      group.visible = opacity > 0.005;
      mat.opacity = 0.45 * opacity;
      linkMaterial.opacity = 0.17 * opacity;
      group.scale.setScalar(mobile ? 0.52 : 0.8);
      group.position.y = mobile ? 1.2 : -1.4;
      flies.forEach((fly, i) => {
        fly.position.y = nodes[i][1] + Math.sin(time * 0.35 + i) * 0.06;
      });
    },
  };
}

function createWorld() {
  const group = new THREE.Group(),
    globe = new THREE.Group();
  group.add(globe);
  const positions = [];
  for (let i = 0; i < 4400; i++) {
    const y = 1 - (i / 4399) * 2,
      r = Math.sqrt(1 - y * y),
      a = i * 2.39996323;
    positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const dots = new THREE.PointsMaterial({
    color: BONE,
    size: 0.013,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  globe.add(new THREE.Points(geometry, dots));
  const grid = material(BONE, 0.13);
  for (let i = -4; i <= 4; i++) {
    const y = i / 5,
      r = Math.sqrt(1 - y * y),
      ring = orbit(r, grid);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    globe.add(ring);
  }
  for (let i = 0; i < 8; i++) {
    const meridian = orbit(1, grid);
    meridian.rotation.y = (i * Math.PI) / 8;
    globe.add(meridian);
  }
  const arcMaterial = material(GOLD, 0.42);
  const arcs = [];
  for (let i = 0; i < 3; i++) {
    const arc = orbit(
      1.3 + i * 0.25,
      arcMaterial,
      0.25 + i * 0.6,
      Math.PI * 1.7,
    );
    arc.rotation.set(0.85 + i * 0.38, 0.15 + i * 0.4, -0.35 + i * 0.3);
    group.add(arc);
    arcs.push(arc);
  }
  const rim = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { alpha: { value: 1 }, color: { value: new THREE.Color(GOLD) } },
    vertexShader: `varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float alpha;uniform vec3 color;varying vec3 n;varying vec3 v;void main(){float r=pow(1.-abs(dot(normalize(n),normalize(v))),4.);gl_FragColor=vec4(color,r*.18*alpha);}`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.015, 48, 32), rim));
  return {
    group,
    update(time, alpha, selected) {
      group.visible = alpha > 0.005;
      dots.opacity = 0.36 * alpha;
      grid.opacity = 0.13 * alpha;
      arcMaterial.opacity = 0.42 * alpha;
      rim.uniforms.alpha.value = alpha;
      globe.rotation.set(0.15, time * 0.035, -0.18);
      arcs.forEach((arc, i) => {
        arc.rotation.z =
          -0.35 + i * 0.3 + time * 0.025 * (i % 2 ? 1 : -1) + selected * 0.16;
      });
    },
  };
}

export function createImmersiveScene(
  canvas,
  graph,
  read,
  onFailure,
  onProjection,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.5),
  );
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80);
  camera.position.z = 7;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const brain = createBrain(graph, renderer.getPixelRatio());
  scene.add(brain.group);
  const fly = createHologramModel();
  scene.add(fly.group);
  fly.platform.visible = false;
  const swarm = createSwarm(fly);
  scene.add(swarm.group);
  const field = createFieldEnvironment();
  scene.add(field.group);
  const world = createWorld();
  scene.add(world.group);
  const memory = new THREE.Group(),
    memoryMaterials = [];
  for (let i = 0; i < 4; i++) {
    const mat = material(i % 2 ? GOLD : BONE, 0.2),
      ring = orbit(1.7 + i * 0.16, mat, 0.2 + i * 0.6, Math.PI * 1.65);
    ring.rotation.set(0.55 + i * 0.22, 0.2 + i * 0.3, i * 0.4);
    memory.add(ring);
    memoryMaterials.push(mat);
  }
  scene.add(memory);
  const orbitGroup = new THREE.Group(),
    orbitMaterials = [];
  for (let i = 0; i < 3; i++) {
    const mat = material(i === 0 ? GOLD : BONE, i === 0 ? 0.18 : 0.07),
      ring = orbit(
        2.65 + i * 0.24,
        mat,
        0.35 * i,
        Math.PI * (i === 0 ? 1.9 : 2),
      );
    ring.rotation.set(0.55 + i * 0.45, -0.2 + i * 0.12, -0.14);
    orbitGroup.add(ring);
    orbitMaterials.push(mat);
  }
  scene.add(orbitGroup);
  const dust = [];
  let seed = 43;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1000; i++)
    dust.push((random() - 0.5) * 32, (random() - 0.5) * 20, -2 - random() * 15);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(dust, 3),
  );
  const stars = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: BONE,
      size: 0.012,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  const atmosphere = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 26),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float time;varying vec2 p;void main(){vec2 q=p-.5;
      float halo=exp(-length(q*vec2(3.,5.))*5.);
      float beams=pow(max(0.,sin(atan(q.y,q.x)*5.+time*.018)),12.)*.1;
      gl_FragColor=vec4(.44,.31,.12,(halo+beams*halo)*.006);}`,
    }),
  );
  atmosphere.position.set(0, 0, -9);
  scene.add(atmosphere);

  let dead = false,
    failed = false,
    raf = 0,
    last = 0,
    time = 0,
    mobile = false,
    narrow = false,
    progress = 0,
    pointerX = 0,
    pointerY = 0,
    tiltX = 0,
    tiltY = 0,
    focus = 0,
    neural = 0,
    rotation = 0,
    bodyX = 0,
    bodyY = 0,
    bodyAngle = -0.55;
  const projected = new THREE.Vector3();
  // Position a composition in viewport space, leaving semantic UI a clear area.
  const viewportPoint = (x, y) => {
    const height =
      2 *
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      camera.position.z;
    return [(x - 0.5) * height * camera.aspect, (0.5 - y) * height];
  };
  const pose = (object, a, b, t) => {
    object.position.set(
      mix(a[0], b[0], t),
      mix(a[1], b[1], t),
      mix(a[2], b[2], t),
    );
    object.scale.setScalar(mix(a[3], b[3], t));
    return mix(a[4], b[4], t);
  };
  function draw() {
    if (dead || failed) return;
    const state = read(),
      still = state.paused || state.reduced;
    const target = Math.max(0, Math.min(7, state.progress || 0));
    progress = state.reduced
      ? Math.round(target)
      : progress + (target - progress) * 0.15;
    if (Math.abs(target - progress) < 0.001) progress = target;
    const exp = state.explorer || { mode: "world" };
    const approach = (current, next) =>
      state.reduced ? next : mix(current, next, 0.11);
    focus = approach(focus, exp.mode === "world" ? 0 : 1);
    neural = approach(neural, exp.mode === "neural" ? 1 : 0);
    rotation = approach(rotation, exp.rotation || 0);
    const body = projectHomeBody(state.frame.body);
    bodyX = approach(bodyX, body.x);
    bodyY = approach(bodyY, body.y);
    let angleDelta = Math.atan2(
      Math.sin(body.heading - bodyAngle),
      Math.cos(body.heading - bodyAngle),
    );
    bodyAngle += state.reduced ? angleDelta : angleDelta * 0.14;
    const base = viewportPoint(
      mobile ? 0.5 : mix(0.7, 0.34, focus),
      mobile ? mix(0.59, narrow ? 0.39 : 0.35, focus) : 0.49,
    );
    const spatialScale = mobile ? 0.74 : 1;
    // Follow long journeys without changing their coordinates or losing the
    // selectable specimen beyond the viewport. The trail shares this origin.
    const followX = bodyX - THREE.MathUtils.clamp(bodyX, -0.55, 0.55);
    const followY = bodyY - THREE.MathUtils.clamp(bodyY, -0.4, 0.4);
    const zoom = mobile
      ? mix(0.91, narrow ? 1.0 : 0.87, focus)
      : mix(1.24, 1.65, focus);
    const fieldWeight = 1 - smooth(Math.min(1, progress));
    const exploreShot = {
      brain: [base[0], base[1], 0.05, mobile ? 1.75 : 2.35, neural],
      fly: [
        base[0] + (bodyX - followX) * spatialScale,
        base[1] + (bodyY - followY) * spatialScale,
        0,
        zoom,
        1 - neural * 0.97,
      ],
      memory: 0,
      swarm: 0,
      world: [0, 0, -1, 1, 0],
    };
    const index = Math.min(6, Math.floor(progress)),
      t = smooth(progress - index),
      shots = mobile ? MOBILE_SHOTS : SHOTS,
      a = index === 0 ? exploreShot : shots[index],
      b = shots[index + 1];
    tiltX += (pointerX - tiltX) * 0.04;
    tiltY += (pointerY - tiltY) * 0.04;
    const brainAlpha = pose(brain.group, a.brain, b.brain, t);
    brain.setOpacity(brainAlpha);
    brain.update(state.frame);
    brain.group.rotation.set(
      0.56 + (still ? 0 : tiltY * 0.1),
      0.28 +
        progress * 0.1 +
        rotation * fieldWeight +
        (still ? 0 : Math.sin(time * 0.12) * 0.08 + tiltX * 0.12),
      -0.2,
    );
    const flyAlpha = pose(fly.group, a.fly, b.fly, t);
    fly.setOpacity(flyAlpha);
    fly.update(time, still);
    fly.specimen.rotation.set(
      0.36 + (still ? 0 : tiltY * 0.12),
      -0.26 +
        rotation * fieldWeight +
        (still ? 0 : tiltX * 0.3 + Math.sin(time * 0.18) * 0.08),
      mix(-0.28, bodyAngle, fieldWeight),
    );
    fly.specimen.position.y = still ? 0 : Math.sin(time * 0.7) * 0.025;
    field.group.position.set(
      base[0] - followX * spatialScale,
      base[1] - followY * spatialScale,
      0,
    );
    field.group.scale.setScalar(spatialScale);
    field.update({
      alpha: fieldWeight * mix(1, 0.38, focus) * (1 - neural * 0.6),
      time,
      record: exp.record,
      frameIndex: exp.frameIndex || 0,
      frame: state.frame,
      busy: exp.busy,
      still,
    });
    if (fieldWeight > 0.5) {
      projected
        .copy(neural > 0.5 ? brain.group.position : fly.group.position)
        .project(camera);
      const rect = canvas.getBoundingClientRect();
      const sceneHeight =
        2 *
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
        camera.position.z;
      onProjection?.({
        x: (projected.x * 0.5 + 0.5) * rect.width,
        y: (-projected.y * 0.5 + 0.5) * rect.height,
        width: Math.min(
          rect.width * (mobile ? 0.76 : 0.36),
          (((neural > 0.5 ? 2.7 : 2.6) * zoom) / sceneHeight) * rect.height,
        ),
      });
    }
    const memoryAlpha = mix(a.memory, b.memory, t);
    memory.visible = memoryAlpha > 0.005;
    memory.position.copy(fly.group.position);
    memory.scale.setScalar(mobile ? 0.72 : 1.1);
    memory.rotation.y = still ? 0.1 : time * 0.04;
    memoryMaterials.forEach((mat) => (mat.opacity = 0.2 * memoryAlpha));
    swarm.update(time, mix(a.swarm, b.swarm, t), mobile);
    const worldAlpha = pose(world.group, a.world, b.world, t);
    world.update(time, worldAlpha, state.world || 0);
    orbitGroup.visible = brainAlpha > 0.005;
    orbitGroup.position.copy(brain.group.position);
    orbitGroup.scale.setScalar(
      mobile ? 0.64 : mix(1, 0.73, Math.min(1, progress)),
    );
    orbitGroup.rotation.z = still ? 0 : time * 0.015;
    orbitMaterials.forEach(
      (mat, i) => (mat.opacity = (i === 0 ? 0.18 : 0.07) * brainAlpha),
    );
    stars.rotation.set(
      still ? 0 : tiltY * 0.015,
      still ? 0 : tiltX * 0.025,
      time * 0.0015,
    );
    atmosphere.material.uniforms.time.value = time;
    composer.render();
  }
  function resize() {
    const box = canvas.getBoundingClientRect(),
      w = Math.max(1, box.width),
      h = Math.max(1, box.height);
    mobile = w < 900;
    narrow = w < 560;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      mobile ? 1.25 : 1.5,
    );
    if (renderer.getPixelRatio() !== pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
      brain.setPixelRatio(pixelRatio);
    }
    camera.aspect = w / h;
    camera.position.z = 7 / Math.min(1, camera.aspect / 0.95);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    draw();
  }
  function tick(now) {
    if (dead) return;
    if (now - last >= 33) {
      const state = read();
      if (!document.hidden && !failed) {
        if (!state.paused && !state.reduced)
          time += Math.min((now - last) / 1000, 0.06);
        if (
          (!state.paused && !state.reduced) ||
          Math.abs(
            progress -
              (state.reduced
                ? Math.round(state.progress || 0)
                : state.progress || 0),
          ) > 0.001 ||
          state.frame !== lastFrame ||
          Math.abs(focus - (state.explorer?.mode === "world" ? 0 : 1)) >
            0.001 ||
          Math.abs(neural - (state.explorer?.mode === "neural" ? 1 : 0)) >
            0.001 ||
          Math.abs(rotation - (state.explorer?.rotation || 0)) > 0.001 ||
          Math.abs(bodyX - projectHomeBody(state.frame.body).x) > 0.001 ||
          Math.abs(bodyY - projectHomeBody(state.frame.body).y) > 0.001
        )
          draw();
        lastFrame = state.frame;
      }
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }
  let lastFrame;
  const pointer = (event) => {
    if (event.pointerType !== "touch") {
      pointerX = event.clientX / innerWidth - 0.5;
      pointerY = event.clientY / innerHeight - 0.5;
    }
  };
  const leave = () => {
    pointerX = 0;
    pointerY = 0;
  };
  const lost = (event) => {
    event.preventDefault();
    failed = true;
    onFailure?.();
  };
  renderer.debug.onShaderError = () => {
    failed = true;
    onFailure?.();
  };
  window.addEventListener("pointermove", pointer, { passive: true });
  document.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", lost);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  raf = requestAnimationFrame(tick);
  return {
    isAvailable: () => !failed,
    redraw: draw,
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", lost);
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      composer.passes.forEach((pass) => pass.dispose?.());
      composer.dispose();
      renderer.dispose();
    },
  };
}
