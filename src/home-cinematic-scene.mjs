import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createParticleOrganism } from "./home-particle-organism.mjs";
import { createBrain } from "./home-measured-brain.mjs";
import { projectHomeBody } from "./home-field-state.mjs";
import { BONE, GOLD, CANVAS } from "./brand.mjs";

const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * (3 - 2 * x);

function createMedium() {
  const geometry = new THREE.BufferGeometry(),
    positions = [],
    seeds = [];
  let seed = 73;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 14000; i++) {
    positions.push((random() - 0.5) * 16, random(), (random() - 0.5) * 4);
    seeds.push(random(), random(), random());
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 3));
  const uniforms = {
    time: { value: 0 },
    alpha: { value: 0.18 },
    pulse: { value: 0 },
    pixel: { value: 1 },
    gold: { value: new THREE.Color(GOLD) },
    bone: { value: new THREE.Color(BONE) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 seed;uniform float time,pixel,pulse;varying float glow;varying float amber;
      void main(){vec3 p=position;float curve=sin(p.x*.45+time*.045);
      p.y=(p.y-.5)*(.28+sin(p.x*.6)*.13)+curve*.7-1.65;
      p.z+=sin(p.x*.4+seed.x)*.5;
      p.y+=sin(p.x*1.5-time*.4+seed.z*5.)*.08;
      float wave=exp(-pow((p.x+4.-pulse*9.)*1.3,2.))*step(.001,pulse)*(1.-step(.99,pulse));p.y+=wave*.35;
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
      gl_PointSize=(.6+seed.y*1.3+wave*1.7)*pixel*7./-v.z;
      glow=.12+seed.z*.45+wave*.6;amber=seed.x;}`,
    fragmentShader: `uniform float alpha;uniform vec3 bone,gold;varying float glow,amber;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(mix(bone,gold,amber*.65),exp(-d*d*3.)*glow*alpha);}`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, uniforms };
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
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(CANVAS, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(37, 1, 0.1, 50);
  camera.position.z = 7;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.5, 0.8);
  composer.addPass(bloom);
  const film = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c=pow(max(c,vec3(0.)),vec3(1.32));float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;float vignette=1.-pow(length((vUv-.5)*vec2(1.,.7)),1.7)*.42;gl_FragColor=vec4(c*vignette+grain*.0012,1.);}`,
  });
  composer.addPass(film);
  composer.addPass(new OutputPass());
  const fly = createParticleOrganism(innerWidth < 700),
    brain = createBrain(graph, renderer.getPixelRatio());
  scene.add(fly.group, brain.group);
  const medium = createMedium();
  scene.add(medium.points);
  const mist = new THREE.Mesh(
    new THREE.PlaneGeometry(35, 24),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float time;varying vec2 p;void main(){vec2 q=p-.5;float halo=exp(-dot(q*vec2(4.,5.),q*vec2(4.,5.))*2.);float glow=exp(-pow((q.x-q.y*.5-.05)*6.,2.))*exp(-abs(q.y)*6.);float noise=sin(q.x*21.+sin(q.y*17.+time*.04))*sin(q.y*23.-time*.025)*.5+.5;gl_FragColor=vec4(.45,.42,.34,(halo*.0048+glow*.003)*(noise*.25+.75));}`,
    }),
  );
  mist.position.z = -8;
  scene.add(mist);

  let dead = false,
    failed = false,
    raf = 0,
    last = 0,
    time = 0,
    mobile = false,
    narrow = false,
    viewportHeight = 720,
    progress = 0;
  let px = 0,
    py = 0,
    tiltX = 0,
    tiltY = 0,
    neural = 0,
    rotation = 0,
    bodyX = 0,
    bodyY = 0,
    bodyAngle = -0.48;
  let lastFrame, lastExplorer, lastPaused, lastReduced;
  const projected = new THREE.Vector3();
  const viewportPoint = (x, y) => {
    const height =
      2 *
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      camera.position.z;
    return [(x - 0.5) * height * camera.aspect, (0.5 - y) * height];
  };
  function draw() {
    if (dead || failed) return;
    const state = read(),
      still = state.paused || state.reduced,
      exp = state.explorer || {};
    const target = clamp(state.progress || 0, 0, 5);
    progress = state.reduced ? target : mix(progress, target, 0.16);
    if (Math.abs(target - progress) < 0.001) progress = target;
    const approach = (a, b) => (state.reduced ? b : mix(a, b, 0.12));
    neural = approach(neural, exp.mode === "neural" ? 1 : 0);
    rotation = approach(rotation, exp.rotation || 0);
    tiltX = approach(tiltX, still ? 0 : px);
    tiltY = approach(tiltY, still ? 0 : py);
    const body = projectHomeBody(state.frame.body);
    bodyX = approach(bodyX, clamp(body.x, -0.38, 0.38));
    bodyY = approach(bodyY, clamp(body.y, -0.32, 0.32));
    const angleDelta = Math.atan2(
      Math.sin(body.heading - bodyAngle),
      Math.cos(body.heading - bodyAngle),
    );
    bodyAngle += state.reduced ? angleDelta : angleDelta * 0.12;
    // Screen coordinates keep each composition clear of the semantic content.
    // pose = [screen x, screen y, scale, alpha, dissolve, expansion, z rotation]
    const encounterY = narrow ? Math.min(0.66, 460 / viewportHeight) : 0.29;
    const shots = mobile
      ? [
          [0.5, 0.35, 1.28, 1, 0, 0, -0.5],
          [
            0.5,
            encounterY,
            narrow ? 0.9 : 1.04,
            1 - neural * 0.96,
            0,
            0,
            bodyAngle,
          ],
          [0.5, 0.35, 1.3, 0.78, 1, 0, -0.12],
          [0.5, 0.4, 1.7, 0.65, 1, 1, -0.25],
          [0.5, 0.5, 1.28, 0.65, 1, 1, -0.25],
          [0.5, 0.29, 0.92, 1, 0, 0, -0.35],
        ]
      : [
          [0.5, 0.36, 1.72, 1, 0, 0, -0.48],
          [0.27, 0.5, 1.12, 1 - neural * 0.96, 0, 0, bodyAngle],
          [0.54, 0.36, 1.8, 0.8, 1, 0, -0.12],
          [0.52, 0.49, 2.45, 0.65, 1, 1, -0.25],
          [0.28, 0.5, 1.65, 0.75, 1, 1, -0.25],
          [0.5, 0.32, 1.2, 1, 0, 0, -0.35],
        ];
    const index = Math.min(4, Math.floor(progress)),
      t = smooth(progress - index),
      a = shots[index],
      b = shots[index + 1];
    const values = a.map((v, i) => mix(v, b[i], t));
    const position = viewportPoint(values[0], values[1]);
    const interactionWeight = Math.max(0, 1 - Math.abs(progress - 1) * 2);
    fly.group.position.set(
      position[0] + bodyX * interactionWeight,
      position[1] + bodyY * interactionWeight,
      0,
    );
    fly.group.scale.setScalar(values[2]);
    fly.specimen.rotation.set(
      0.3 + tiltY * 0.1,
      -0.18 + tiltX * 0.16 + rotation * interactionWeight,
      values[6],
    );
    const birth = still ? 0 : 1 - smooth(clamp(time / 2.6, 0, 1));
    fly.update({
      time,
      alpha: values[3],
      dissolve: values[4],
      expansion: values[5],
      birth: birth * 0.8,
      pixel: renderer.getPixelRatio(),
      pointerX: tiltX,
      pointerY: tiltY,
    });
    const neuralPosition = viewportPoint(
      mobile ? 0.5 : 0.28,
      mobile ? encounterY : 0.5,
    );
    brain.group.position.set(neuralPosition[0], neuralPosition[1], 0.05);
    brain.group.scale.setScalar(narrow ? 1.65 : mobile ? 2.0 : 2.8);
    brain.group.rotation.set(0.5, -0.2 + rotation + tiltX * 0.1, -0.2);
    brain.setOpacity(interactionWeight * neural);
    brain.update(state.frame);
    medium.uniforms.time.value = time;
    medium.uniforms.alpha.value = mix(0.31, 0.1, values[5]);
    medium.uniforms.pixel.value = renderer.getPixelRatio();
    medium.uniforms.pulse.value = exp.busy ? (exp.frameIndex || 0) / 24 : 0;
    medium.points.rotation.z = -0.17 + tiltX * 0.025;
    mist.material.uniforms.time.value = time;
    if (interactionWeight > 0.1) {
      projected
        .copy(neural > 0.5 ? brain.group.position : fly.group.position)
        .project(camera);
      const rect = canvas.getBoundingClientRect();
      onProjection?.({
        x: (projected.x * 0.5 + 0.5) * rect.width,
        y: (-projected.y * 0.5 + 0.5) * rect.height,
        width: Math.min(
          rect.width * (mobile ? 0.86 : 0.42),
          rect.height * 0.64,
        ),
      });
    }
    composer.render();
  }
  function resize() {
    const box = canvas.getBoundingClientRect(),
      w = Math.max(1, box.width),
      h = Math.max(1, box.height);
    mobile = w < 900;
    narrow = w < 560;
    viewportHeight = h;
    const pixel = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    renderer.setPixelRatio(pixel);
    composer.setPixelRatio(pixel);
    brain.setPixelRatio(pixel);
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
        const settling =
          Math.abs(progress - (state.progress || 0)) > 0.001 ||
          Math.abs(neural - (state.explorer?.mode === "neural" ? 1 : 0)) >
            0.001 ||
          Math.abs(rotation - (state.explorer?.rotation || 0)) > 0.001;
        if (
          (!state.paused && !state.reduced) ||
          settling ||
          state.frame !== lastFrame ||
          state.explorer !== lastExplorer ||
          state.paused !== lastPaused ||
          state.reduced !== lastReduced
        )
          draw();
        lastFrame = state.frame;
        lastExplorer = state.explorer;
        lastPaused = state.paused;
        lastReduced = state.reduced;
      }
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }
  const pointer = (event) => {
    if (event.pointerType !== "touch") {
      px = event.clientX / innerWidth - 0.5;
      py = event.clientY / innerHeight - 0.5;
    }
  };
  const leave = () => {
    px = py = 0;
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
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
      renderer.dispose();
    },
  };
}
