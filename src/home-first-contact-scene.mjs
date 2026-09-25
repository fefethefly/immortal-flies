import * as THREE from "three";
import { createConnectomeOverview } from "./home-connectome-overview.mjs";
import { createBrain } from "./home-measured-brain.mjs";
import { projectHomeBody } from "./home-field-state.mjs";
import { CANVAS } from "./brand.mjs";
import { createArticulatedFly } from "./home-articulated-fly.mjs";
import { sampleFlyMotion, FLY_FOOT_Y } from "./home-flight-motion.mjs";
import { sampleIdentityTransition } from "./home-chain-identity.mjs";
import {
  createChainField,
  createIdentityParticles,
} from "./home-chain-field.mjs";

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const ease = (v) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

// Art-directed environment with a fully articulated 3D organism. Body
// choreography is expressive; only the measured graph and model frames are data.
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
  renderer.setClearColor(CANVAS);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  camera.position.z = 5;
  const textures = new Set();
  let dead = false,
    failed = false,
    loaded = false,
    raf = 0,
    last = 0;
  let time = 0,
    openingTime = 0,
    openingVersion = read().explorer?.opening || 0;
  let aspect = 1,
    w = 1,
    h = 1,
    mobile = false,
    narrow = false;
  let progress = 0,
    px = 0,
    py = 0,
    pointerX = 0,
    pointerY = 0,
    neural = 0,
    angle = 0,
    response = 0;
  let previousFrame,
    previousExplorer,
    previousPaused,
    previousReduced,
    previousEncounterY,
    previousIdentityY,
    previousHeroBrainY,
    previousFlightPhase;
  let landedAt = -10,
    landingX = 0.72;
  const plane = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    map: { value: null },
    aspect: { value: 1 },
    time: { value: 0 },
    opening: { value: 1 },
    opacity: { value: 1 },
    compact: { value: 0 },
    pointer: { value: new THREE.Vector2() },
    contact: { value: 0 },
    brainPresence: { value: 0 },
    brainFocus: { value: new THREE.Vector2(0.72, 0.62) },
    focus: { value: new THREE.Vector2(0.72, 0.4) },
  };
  const backdrop = new THREE.Mesh(
    plane,
    new THREE.ShaderMaterial({
      uniforms,
      depthWrite: false,
      vertexShader: vertex,
      fragmentShader: `
      uniform sampler2D map;uniform float aspect,time,opening,opacity,contact,compact;
      uniform vec2 pointer,focus,brainFocus;uniform float brainPresence;varying vec2 vUv;
      void main(){
        float imageAspect=1.777;
        float sceneAspect=aspect/mix(1.,.64,compact);
        vec2 sceneUv=vec2(vUv.x,mix(vUv.y,(vUv.y-.36)/.64,compact));
        vec2 cover=vec2(min(1.,sceneAspect/imageAspect),min(1.,imageAspect/sceneAspect));
        float zoom=mix(1.62,1.025,opening);
        vec2 center=vec2(mix(.48,.54,step(aspect,1.)),mix(.66,.5,opening));
        vec2 uv=(sceneUv-.5)*cover/zoom+center;
        float nearLayer=smoothstep(.48,.87,uv.y);
        uv+=pointer*vec2(.008,.005)*(1.+nearLayer*2.);
        uv.y+=sin(uv.x*10.+time*.14)*.0007*nearLayer;
        vec3 c=texture2D(map,uv).rgb;
        float luma=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(luma),c,1.04);
        float light=exp(-length((vUv-focus)*vec2(aspect,1.))*7.);
        c*=.96+contact*light*.65;
        float bottom=1.-smoothstep(.0,.22,vUv.y);
        float left=(1.-smoothstep(.05,.61,vUv.x))*(1.-smoothstep(.45,.72,vUv.y));
        float phoneCopy=(1.-smoothstep(.43,.60,vUv.y))*smoothstep(.06,.24,vUv.y)*step(aspect,1.);
        c*=1.-left*.16-bottom*.08-phoneCopy*.20;
        c*=mix(1.,smoothstep(.12,.38,vUv.y),compact);
        float neuralShade=exp(-length((vUv-brainFocus)*vec2(aspect,1.))*1.8);
        c*=1.-brainPresence*neuralShade*.92;
        c=mix(vec3(.003,.0027,.0022),c,opacity);
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
    }),
  );
  backdrop.position.z = -6;
  scene.add(backdrop);

  const fly = createArticulatedFly({ graph });
  const reflectedFly = createArticulatedFly({ reflection: true });
  const life = fly.root,
    reflection = reflectedFly.root;
  scene.add(life, reflection);
  const chainField = createChainField();
  const identityParticles = createIdentityParticles();
  scene.add(chainField.mesh, identityParticles.points);

  const lightUniforms = {
    focus: { value: new THREE.Vector2(0.72, 0.4) },
    aspect: { value: 1 },
    intensity: { value: 0 },
    time: { value: 0 },
    memory: { value: 0 },
  };
  const light = new THREE.Mesh(
    plane,
    new THREE.ShaderMaterial({
      uniforms: lightUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: vertex,
      fragmentShader: `
      uniform vec2 focus;uniform float aspect,intensity,time,memory;varying vec2 vUv;
      void main(){
        vec2 p=vUv-focus;float y=max(p.y,0.);
        float beam=exp(-pow((p.x+y*.13)/(y*.08+.012),2.))*smoothstep(-.04,.08,p.y);
        float halo=exp(-length(p*vec2(aspect,1.))*18.);
        float traces=0.;
        for(int i=0;i<5;i++){
          float n=float(i);float path=.43+sin(vUv.x*3.8+n*.38+time*.06)*.11+n*.009;
          float d=abs(vUv.y-path);
          traces+=exp(-d*700.)*.06;
        }
        float a=(beam*.22+halo*.38)*intensity+traces*memory;
        a*=smoothstep(0.,.15,vUv.x)*smoothstep(1.,.8,vUv.x);
        gl_FragColor=vec4(.76,.66,.43,a);
      }`,
    }),
  );
  light.position.z = 2;
  scene.add(light);
  const overview = createConnectomeOverview();
  scene.add(overview.group);
  const brain = createBrain(graph, 1);
  scene.add(brain.group);

  // Sparse environmental motes provide depth, never a decorative neuron count.
  const positions = new Float32Array(360 * 3);
  let seed = 61;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < positions.length; i += 3)
    positions.set(
      [(random() - 0.5) * 6, (random() - 0.5) * 2.3, random() * 2],
      i,
    );
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, pixel: { value: 1 } },
      vertexShader: `uniform float time,pixel;varying float a;void main(){vec3 p=position;p.x+=sin(time*.07+p.z)*.025;p.y+=sin(time*.1+p.x*2.)*.016;vec4 q=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*q;gl_PointSize=(.55+p.z*.6)*pixel;a=.07+p.z*.025;}`,
      fragmentShader: `varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.85,.79,.65,a*(1.-r));}`,
    }),
  );
  scene.add(dust);

  const headPosition = new THREE.Vector3();
  const toScreen = (x, y) => [(x - 0.5) * 2 * aspect, (0.5 - y) * 2];
  function draw() {
    if (dead || failed || !loaded) return;
    const state = read(),
      exp = state.explorer || {},
      still = state.paused || state.reduced;
    const target = clamp(state.progress || 0, 0, 5);
    progress = state.reduced ? target : lerp(progress, target, 0.17);
    if (Math.abs(progress - target) < 0.001) progress = target;
    if (exp.opening !== openingVersion) {
      openingVersion = exp.opening;
      openingTime = 0;
    }
    const approach = (a, b) => (state.reduced ? b : lerp(a, b, 0.14));
    pointerX = approach(pointerX, still ? 0 : px);
    pointerY = approach(pointerY, still ? 0 : py);
    neural = approach(neural, exp.mode === "neural" ? 1 : 0);
    angle = approach(angle, exp.rotation || 0);
    const isResponse = exp.busy && exp.record?.kind === "light";
    response = approach(
      response,
      isResponse ? 0.35 + Math.min(1, state.frame.spikes.length / 100) : 0,
    );
    const opening = state.reduced ? 1 : ease(openingTime / 8);
    // Keep the feet on the photographed floor as the opening lens pulls back.
    const sceneAspect = aspect / (mobile ? 0.64 : 1);
    const groundUv =
      0.5 +
      ((0.27 - lerp(0.66, 0.5, opening)) * lerp(1.62, 1.025, opening)) /
        Math.min(1, 1.777 / sceneAspect);
    const groundY = mobile ? 1 - (0.36 + groundUv * 0.64) : 1 - groundUv;
    const encounterY =
      (state.encounterBounds
        ? state.encounterBounds.y + (narrow ? 12 / h : 0)
        : undefined) ??
      (narrow ? Math.min(0.66, 460 / h) : mobile ? 0.29 : 0.49);
    const encounterX = state.encounterBounds?.x ?? (mobile ? 0.5 : 0.27);
    const encounterWidth = state.encounterBounds
      ? Math.min(
          state.encounterBounds.width * 0.94,
          ((state.encounterBounds.height * 1.5) / aspect) *
            (narrow ? 0.74 : 0.9),
        )
      : mobile
        ? 0.88
        : 0.43;
    // Screen x/y, fraction of viewport width, opacity.
    const shots = mobile
      ? [
          [0.78, groundY, narrow ? 0.2 : 0.16, 1],
          [encounterX, encounterY, encounterWidth, 1 - neural],
          [0.72, 0.37, 0.33, 0.24],
          [0.66, 0.66, 0.4, 0.3],
          [0.5, 0.53, 0.48, 0.7],
          [0.5, 0.3, 0.46, 1],
        ]
      : [
          [0.79, groundY, 0.145, 1],
          [encounterX, encounterY, encounterWidth, 1 - neural],
          [0.79, 0.4, 0.27, 0.28],
          [0.78, 0.65, 0.29, 0.35],
          [0.26, 0.5, 0.28, 0.85],
          [0.5, 0.3, 0.23, 1],
        ];
    const index = Math.min(4, Math.floor(progress)),
      t = ease(progress - index);
    const pose = shots[index].map((a, i) => lerp(a, shots[index + 1][i], t));
    const encounter = Math.max(0, 1 - Math.abs(progress - 1) * 2);
    const hero = 1 - ease(progress);
    const identity = sampleIdentityTransition(progress);
    const body = projectHomeBody(state.frame.body);
    const pos = toScreen(pose[0], pose[1]);
    const choreography = sampleFlyMotion(
      Math.max(0, openingTime - 1),
      state.reduced,
    );
    const scale = (pose[2] * 2 * aspect) / 1.85;
    const bodyTravel = mobile ? 0.09 : 0.22;
    const lift = choreography.height * (mobile ? 0.32 : 0.45);
    const floor = toScreen(pose[0], groundY)[1];
    life.position.set(
      pos[0] +
        choreography.x * scale * hero * (mobile ? 0.5 : 1) +
        clamp(body.x, -0.3, 0.3) * bodyTravel * encounter,
      pos[1] +
        (lift - FLY_FOOT_Y) * scale * hero +
        clamp(body.y, -0.25, 0.25) * bodyTravel * encounter,
      1,
    );
    const modelYaw = (state.frame.body.heading * Math.PI) / 180;
    const yaw =
      -0.32 + choreography.yaw * hero + (angle + modelYaw) * encounter;
    // A real rotation reveals the opposite eye, the back and both wing roots.
    life.position.x += 0.21 * scale * Math.cos(yaw) * encounter;
    const identityPosition = toScreen(
      state.identityBounds?.x ?? (mobile ? 0.5 : 0.28),
      state.identityBounds?.y ?? 0.48,
    );
    life.position.x = lerp(
      life.position.x,
      identityPosition[0],
      identity.focus,
    );
    life.position.y = lerp(
      life.position.y,
      identityPosition[1],
      identity.focus,
    );
    life.scale.setScalar(scale);
    life.rotation.set(0.07, yaw, choreography.bank * hero);
    const reveal = state.reduced ? 1 : ease((openingTime - 0.15) / 1.4);
    const baseAlpha = pose[3] * lerp(1, reveal, hero);
    const alpha = baseAlpha * identity.bodyOpacity * (mobile ? 1 - hero : 1);
    const animation = {
      time,
      flight: choreography.flight * hero,
      walk:
        choreography.walk * hero +
        (exp.busy && state.frame.action !== "REST" ? 1 : 0) * encounter,
      alpha,
      groom:
        (choreography.groom || 0) * hero +
        (!exp.busy
          ? Math.pow(Math.max(0, Math.sin(time * 0.65 - 1)), 6) * encounter
          : 0),
      compression:
        (Math.max(0, 1 - Math.abs(((openingTime - 1) % 26) - 5) / 0.45) +
          Math.max(0, 1 - Math.abs(((openingTime - 1) % 26) - 15) / 0.4)) *
        hero,
      turn:
        Math.sin(
          sampleFlyMotion(Math.max(0, openingTime - 1) + 0.2, state.reduced)
            .yaw - choreography.yaw,
        ) * hero,
      frame: state.frame,
      pixel: renderer.getPixelRatio(),
      reduced: state.reduced,
    };
    fly.update(animation);
    identityParticles.points.position.copy(life.position);
    identityParticles.points.scale.copy(life.scale);
    identityParticles.points.rotation.copy(life.rotation);
    if (identity.particleOpacity > 0.002)
      identityParticles.setPositions(fly.sampleSurface());
    identityParticles.update({
      fold: identity.fold,
      alpha: baseAlpha * identity.particleOpacity,
      time,
      pixel: renderer.getPixelRatio(),
    });
    if (
      previousFlightPhase === "landing" &&
      choreography.phase === "walk" &&
      hero > 0.9
    ) {
      landedAt = time;
      landingX = life.position.x / (2 * aspect) + 0.5;
    }
    previousFlightPhase = choreography.phase;
    chainField.update({
      aspect,
      anchorX: mobile ? 0.61 : 0.72,
      floor: 1 - groundY,
      landingX,
      alpha: hero * (1 - identity.focus) * reveal * (mobile ? 0.75 : 1),
      pulse: state.reduced ? 0 : Math.max(0, 1 - (time - landedAt) / 3),
      time,
    });
    reflection.position.set(
      life.position.x,
      floor - (life.position.y - floor) * 0.45,
      -0.5,
    );
    reflection.rotation.copy(life.rotation);
    reflection.scale.set(scale, -scale * 0.45, scale);
    reflectedFly.update({
      ...animation,
      alpha: alpha * hero * Math.max(0.2, 1 - lift * 0.6),
    });
    reflection.visible = !mobile && hero > 0.01;
    fly.getHeadPosition(headPosition);
    const focus = new THREE.Vector2(
      headPosition.x / (2 * aspect) + 0.5,
      headPosition.y / 2 + 0.5,
    );
    canvas.dataset.flightPhase =
      identity.focus > 0.5
        ? "identity"
        : hero > 0.5
          ? choreography.phase
          : "experiment";
    uniforms.focus.value.copy(focus);
    uniforms.time.value = time;
    uniforms.opening.value = lerp(1, opening, hero);
    uniforms.pointer.value.set(pointerX, pointerY);
    uniforms.contact.value = response;
    const darkness = [1, 0.12, 0.1, 0.27, 0.19, 0.5];
    uniforms.opacity.value =
      lerp(darkness[index], darkness[index + 1], t) *
      (1 - encounter * neural * 0.9) *
      (1 - identity.focus * 0.94);
    lightUniforms.focus.value.copy(focus);
    lightUniforms.intensity.value = response * (hero + encounter);
    lightUniforms.time.value = time;
    lightUniforms.memory.value = Math.max(0, 1 - Math.abs(progress - 2)) * 0.7;
    const overviewBounds = state.heroBrainBounds || {
      x: 0.72,
      y: 0.37,
      width: 0.4,
      height: 0.44,
    };
    const overviewPosition = toScreen(overviewBounds.x, overviewBounds.y);
    const overviewScale =
      Math.min(overviewBounds.width * aspect, overviewBounds.height) * 0.98;
    overview.group.position.set(
      lerp(overviewPosition[0], identityPosition[0], identity.focus),
      lerp(overviewPosition[1], identityPosition[1], identity.focus),
      0.5,
    );
    overview.group.scale.setScalar(overviewScale * (1 - identity.focus * 0.92));
    overview.group.rotation.set(
      0.15 + pointerY * 0.035,
      -0.15 + Math.sin(time * 0.08) * 0.16 + pointerX * 0.12,
      -0.04,
    );
    overview.update({
      alpha: hero * reveal * (1 - identity.focus),
      pixel: renderer.getPixelRatio(),
      frame: state.frame,
      density: mobile ? (narrow ? 0.45 : 0.7) : 1,
    });
    uniforms.brainPresence.value = hero;
    uniforms.brainFocus.value.set(overviewBounds.x, 1 - overviewBounds.y);
    const bpos = toScreen(encounterX, encounterY);
    brain.group.position.set(bpos[0], bpos[1], 0);
    brain.group.scale.setScalar(narrow ? 0.48 : mobile ? 0.73 : 1.12);
    brain.group.rotation.set(0.25, angle + pointerX * 0.06, -0.13);
    brain.setOpacity(encounter * neural);
    brain.update(state.frame);
    dust.material.uniforms.time.value = time;
    if (encounter > 0.1)
      onProjection?.({ x: pose[0] * w, y: pose[1] * h, width: pose[2] * w });
    renderer.render(scene, camera);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    aspect = w / h;
    mobile = w < 900;
    narrow = w < 560;
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    const pixel = Math.min(devicePixelRatio || 1, mobile ? 1.4 : 1.75);
    renderer.setPixelRatio(pixel);
    renderer.setSize(w, h, false);
    brain.setPixelRatio(pixel);
    dust.material.uniforms.pixel.value = pixel;
    backdrop.scale.x = light.scale.x = aspect;
    uniforms.aspect.value = lightUniforms.aspect.value = aspect;
    uniforms.compact.value = mobile ? 1 : 0;
    draw();
  }
  function tick(now) {
    if (dead) return;
    if (now - last >= 33) {
      const state = read();
      const changed =
        state.frame !== previousFrame ||
        state.explorer !== previousExplorer ||
        state.paused !== previousPaused ||
        state.reduced !== previousReduced ||
        state.encounterBounds?.y !== previousEncounterY ||
        state.identityBounds?.y !== previousIdentityY ||
        state.heroBrainBounds?.y !== previousHeroBrainY;
      const settling =
        Math.abs(progress - (state.progress || 0)) > 0.001 ||
        Math.abs(neural - (state.explorer?.mode === "neural" ? 1 : 0)) >
          0.001 ||
        Math.abs(angle - (state.explorer?.rotation || 0)) > 0.001;
      if (!document.hidden) {
        if (!state.paused && !state.reduced && loaded) {
          const dt = Math.min((now - last) / 1000, 0.06);
          time += dt;
          openingTime += dt;
        }
        if ((!state.paused && !state.reduced) || changed || settling) draw();
      }
      previousFrame = state.frame;
      previousExplorer = state.explorer;
      previousPaused = state.paused;
      previousReduced = state.reduced;
      previousEncounterY = state.encounterBounds?.y;
      previousIdentityY = state.identityBounds?.y;
      previousHeroBrainY = state.heroBrainBounds?.y;
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }
  const fail = () => {
    if (!dead) {
      failed = true;
      onFailure?.();
    }
  };
  const loader = new THREE.TextureLoader();
  const load = (url) =>
    loader.loadAsync(url).then((texture) => {
      if (dead) {
        texture.dispose();
        return texture;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        4,
        renderer.capabilities.getMaxAnisotropy(),
      );
      textures.add(texture);
      return texture;
    });
  const loadBuffer = (path) =>
    fetch(path).then((response) => {
      if (!response.ok) throw new Error("Connectome overview unavailable");
      return response.arrayBuffer();
    });
  const ready = Promise.all([
    load("/assets/first-contact/membrane-warm.webp"),
    loadBuffer("/assets/first-contact/connectome-overview.bin"),
    loadBuffer("/assets/first-contact/connectome-overview-activity.bin"),
  ])
    .then(([background, structure, mapping]) => {
      if (dead) return;
      uniforms.map.value = background;
      overview.setData(structure, mapping);
      loaded = true;
      draw();
    })
    .catch(fail);
  const pointer = (e) => {
    if (e.pointerType !== "touch") {
      px = e.clientX / w - 0.5;
      py = e.clientY / h - 0.5;
    }
  };
  const leave = () => {
    px = py = 0;
  };
  const lost = (event) => {
    event.preventDefault();
    fail();
  };
  renderer.debug.onShaderError = fail;
  window.addEventListener("pointermove", pointer, { passive: true });
  document.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", lost);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  raf = requestAnimationFrame(tick);
  return {
    ready,
    isAvailable: () => loaded && !failed,
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
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    },
  };
}
