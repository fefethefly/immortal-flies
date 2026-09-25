import * as THREE from "three";
import { fieldFromCircuit } from "./home-cross-section.mjs";
import { GOLD, BONE } from "./brand.mjs";

// Measured graph topology; layout includes the existing deterministic position
// completion. Camera motion is decorative. Only recorded spikes drive firing.
export function createLivingScene(canvas, graph, read, onFailure) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 30);
  camera.position.z = 2.9;
  const group = new THREE.Group();
  scene.add(group);
  const field = fieldFromCircuit(graph, graph.n);
  const positions = new Float32Array(graph.n * 3);
  const strength = new Float32Array(graph.n);
  const seeds = new Float32Array(graph.n);
  field.neurons.forEach((node, i) => {
    positions.set([node.x, node.y, node.z], i * 3);
    seeds[i] = ((i * 7919) % 1000) / 1000;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("strength", new THREE.BufferAttribute(strength, 1));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      gold: { value: new THREE.Color(GOLD) },
      bone: { value: new THREE.Color(BONE) },
      pixel: { value: renderer.getPixelRatio() },
    },
    vertexShader: `attribute float strength; attribute float seed;
      uniform float pixel; varying float vStrength; varying float vSeed;
      void main(){vStrength=strength;vSeed=seed;
        vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
        gl_PointSize=(1.4+seed*1.8+strength*5.)*pixel*(2.5/-p.z);}`,
    fragmentShader: `uniform vec3 gold;uniform vec3 bone;varying float vStrength;varying float vSeed;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
        float a=exp(-d*d*4.)*(.35+vSeed*.45+vStrength*.9);
        gl_FragColor=vec4(mix(mix(gold,bone,.3+vSeed*.55),bone,vStrength),a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.Points(geometry, material));
  const edges = field.edges.filter((_, i) => i % 2 === 0);
  const linePositions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => {
    linePositions.set(positions.subarray(a * 3, a * 3 + 3), i * 6);
    linePositions.set(positions.subarray(b * 3, b * 3 + 3), i * 6 + 3);
  });
  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  group.add(new THREE.LineSegments(lines, lineMaterial));

  let width = 1,
    height = 1,
    visible = true,
    dead = false,
    raf = 0;
  let last = 0,
    time = 0,
    previousFrame;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    width = box.width || 1;
    height = box.height || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw(true);
  };
  function draw(force = false) {
    if (dead || (!force && (!visible || document.hidden))) return;
    const { frame, reduced, paused, progress = 0 } = read();
    if (frame !== previousFrame) {
      strength.fill(0);
      for (const index of frame?.spikes || [])
        if (index < strength.length) strength[index] = 1;
      geometry.attributes.strength.needsUpdate = true;
      previousFrame = frame;
    }
    const motion = !reduced && !paused;
    const yaw = motion ? Math.sin(time * 0.13) * 0.12 : 0;
    group.rotation.set(0.6, 0.38 + yaw + progress * 0.45, -0.2);
    group.position.y = motion ? Math.sin(time * 0.35) * 0.02 : 0;
    group.scale.setScalar(1 + progress * 0.1);
    renderer.render(scene, camera);
  }
  const tick = (now) => {
    if (dead) return;
    const state = read();
    if (now - last >= 33) {
      if (visible && !document.hidden && !state.paused && !state.reduced)
        time += Math.min((now - last) / 1000, 0.05);
      if ((!state.reduced && !state.paused) || previousFrame !== state.frame)
        draw();
      last = now;
    }
    raf = requestAnimationFrame(tick);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) draw(true);
  });
  io.observe(canvas);
  const contextLost = (event) => {
    event.preventDefault();
    onFailure?.();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();
  raf = requestAnimationFrame(tick);
  return {
    redraw: () => draw(true),
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      geometry.dispose();
      material.dispose();
      lines.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    },
  };
}
