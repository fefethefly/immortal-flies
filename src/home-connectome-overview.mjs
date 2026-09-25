import * as THREE from "three";
import { GOLD } from "./brand.mjs";

export function decodeConnectomeOverview(buffer) {
  const header = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error("Invalid connectome overview");
  const neurons = header.getUint32(0, true),
    edges = header.getUint32(4, true);
  if (!neurons || buffer.byteLength !== 8 + neurons * 6 + edges * 12)
    throw new Error("Incomplete connectome overview");
  return {
    neurons,
    edges,
    positions: new Int16Array(buffer, 8, neurons * 3),
    connections: new Int16Array(buffer, 8 + neurons * 6, edges * 6),
  };
}

export function createConnectomeOverview() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry(),
    connections = new THREE.BufferGeometry();
  const uniforms = {
    alpha: { value: 0 },
    pixel: { value: 1 },
    density: { value: 1 },
    gold: { value: new THREE.Color(GOLD) },
  };
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float grain,activity;varying float depth,seed,fire;uniform float pixel;void main(){fire=activity;seed=grain;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;depth=clamp((p.z+6.)/2.,0.,1.);gl_PointSize=(.65+grain*.65+activity*5.)*pixel;}`,
      fragmentShader: `uniform vec3 gold;uniform float alpha,density;varying float depth,seed,fire;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(mix(gold,vec3(1.,.83,.35),seed*.3+fire*.6),((.15+seed*.25+depth*.045)*density+fire*.85)*alpha*(1.-d*.65));}`,
    }),
  );
  points.frustumCulled = false;
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(connections, edgeMaterial);
  lines.frustumCulled = false;
  group.add(points, lines);
  let loaded = false,
    mapping,
    activity,
    previous;
  return {
    group,
    setData(buffer, activityMap) {
      const data = decodeConnectomeOverview(buffer);
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(data.positions, 3, true),
      );
      geometry.setAttribute(
        "grain",
        new THREE.Float32BufferAttribute(
          Float32Array.from(
            { length: data.neurons },
            (_, i) => ((i * 7919) % 997) / 997,
          ),
          1,
        ),
      );
      connections.setAttribute(
        "position",
        new THREE.BufferAttribute(data.connections, 3, true),
      );
      mapping = new Int32Array(activityMap);
      activity = new Float32Array(data.neurons);
      geometry.setAttribute("activity", new THREE.BufferAttribute(activity, 1));
      loaded = true;
    },
    update({ alpha, pixel, frame, density = 1 }) {
      if (loaded && previous !== frame) {
        activity.fill(0);
        for (const i of frame?.spikes || [])
          if (
            Number.isInteger(i) &&
            i >= 0 &&
            i < mapping.length &&
            mapping[i] >= 0
          )
            activity[mapping[i]] = 1;
        geometry.attributes.activity.needsUpdate = true;
        previous = frame;
      }
      group.visible = loaded && alpha > 0.002;
      uniforms.alpha.value = alpha;
      uniforms.pixel.value = pixel;
      uniforms.density.value = density;
      edgeMaterial.opacity = alpha * 0.035;
    },
  };
}
