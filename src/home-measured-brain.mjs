import * as THREE from "three";
import { fieldFromCircuit } from "./home-cross-section.mjs";
import { BONE, GOLD } from "./brand.mjs";

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
export function createBrain(graph, pixel) {
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
