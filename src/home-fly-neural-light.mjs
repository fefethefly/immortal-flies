import * as THREE from "three";
import { fieldFromCircuit } from "./home-cross-section.mjs";

// A compact display of the measured graph inside the artistic head. Geometry
// is normalized for presentation, not an anatomical reconstruction. Only the
// selected simulation frame can light a neuron; the scene clock cannot.
export function createEmbeddedActivity(graph) {
  const group = new THREE.Group();
  group.name = "measured-head-activity";
  const field = fieldFromCircuit(graph, graph.n);
  const positions = new Float32Array(graph.n * 3);
  let extent = 0.001;
  for (const node of field.neurons)
    extent = Math.max(
      extent,
      Math.abs(node.x),
      Math.abs(node.y),
      Math.abs(node.z),
    );
  field.neurons.forEach((node, i) =>
    positions.set(
      [
        (node.z / extent) * 0.155,
        (node.y / extent) * 0.175,
        (node.x / extent) * 0.15,
      ],
      i * 3,
    ),
  );
  const activity = new Float32Array(graph.n);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("activity", new THREE.BufferAttribute(activity, 1));
  const uniforms = { alpha: { value: 0 }, pixel: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float activity;varying float firing;uniform float pixel;void main(){firing=activity;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=(.65+activity*4.5)*pixel;}`,
    fragmentShader: `varying float firing;uniform float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float glow=exp(-d*d*4.);gl_FragColor=vec4(1.,.65+firing*.12,.22+firing*.17,glow*(.008+firing*.78)*alpha);}`,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 2;
  group.add(points);
  let previous;
  return {
    group,
    update(frame, alpha, pixel) {
      uniforms.alpha.value = alpha;
      uniforms.pixel.value = pixel;
      if (frame === previous) return;
      activity.fill(0);
      for (const i of frame?.spikes || [])
        if (Number.isInteger(i) && i >= 0 && i < activity.length)
          activity[i] = 1;
      geometry.attributes.activity.needsUpdate = true;
      previous = frame;
    },
  };
}
