import * as THREE from "three";
import {
  solveFlyLeg,
  sampleFlyGesture,
  flyFootTarget,
} from "./home-fly-kinematics.mjs";
import { createEmbeddedActivity } from "./home-fly-neural-light.mjs";

const tau = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);

function wingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.16, 0.2, -0.71, 0.59, -1.04, 0.51);
  shape.bezierCurveTo(-1.24, 0.44, -0.86, 0.06, -0.56, 0.025);
  shape.bezierCurveTo(-0.28, -0.035, -0.06, -0.055, 0, 0);
  const membrane = new THREE.ShapeGeometry(shape, 40);
  const positions = membrane.attributes.position;
  const uv = membrane.attributes.uv;
  for (let i = 0; i < positions.count; i++)
    uv.setXY(
      i,
      (positions.getX(i) + 1.14) / 1.14,
      (positions.getY(i) + 0.05) / 0.64,
    );
  const lines = [];
  function addCurve(points) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    const samples = curve.getPoints(40);
    for (let i = 1; i < samples.length; i++)
      lines.push(...samples[i - 1].toArray(), ...samples[i].toArray());
  }
  const outline = shape.getPoints(100);
  for (let i = 1; i < outline.length; i++)
    lines.push(
      outline[i - 1].x,
      outline[i - 1].y,
      0.002,
      outline[i].x,
      outline[i].y,
      0.002,
    );
  addCurve([
    [0, 0, 0.003],
    [-0.31, 0.19, 0.003],
    [-0.71, 0.4, 0.003],
    [-1.04, 0.5, 0.003],
  ]);
  addCurve([
    [0, 0, 0.003],
    [-0.32, 0.11, 0.003],
    [-0.7, 0.26, 0.003],
    [-1.1, 0.42, 0.003],
  ]);
  addCurve([
    [0, 0, 0.003],
    [-0.34, 0.025, 0.003],
    [-0.7, 0.12, 0.003],
    [-1.02, 0.27, 0.003],
  ]);
  addCurve([
    [-0.01, 0, 0.003],
    [-0.29, -0.005, 0.003],
    [-0.58, 0.03, 0.003],
    [-0.84, 0.14, 0.003],
  ]);
  // Short, uneven cross veins keep the membrane organic at small sizes.
  addCurve([
    [-0.34, 0.2, 0.003],
    [-0.37, 0.15, 0.005],
    [-0.4, 0.14, 0.003],
  ]);
  addCurve([
    [-0.64, 0.24, 0.003],
    [-0.61, 0.17, 0.005],
    [-0.59, 0.08, 0.003],
  ]);
  addCurve([
    [-0.78, 0.17, 0.003],
    [-0.74, 0.12, 0.005],
    [-0.71, 0.09, 0.003],
  ]);
  const veins = new THREE.BufferGeometry();
  veins.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  return { membrane, veins };
}

// Warm translucent cuticle with view-dependent lighting. Every surface is
// geometry: highlights move across the head and abdomen as the animal turns.
function shellMaterial(kind = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { alpha: { value: 1 }, kind: { value: kind } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;
      void main(){vUv=uv;vLocal=position;vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vNormal,vView,vLocal;varying vec2 vUv;uniform float alpha,kind;
      void main(){
        vec3 n=normalize(vNormal),v=normalize(vView);
        float facing=max(dot(n,v),0.);float rim=pow(1.-facing,2.4);
        vec3 l=normalize(vec3(-.25,.8,1.1));
        float diffuse=max(dot(n,l),0.);
        float spec=pow(max(dot(n,normalize(l+v)),0.),84.);
        float soft=pow(max(dot(n,normalize(vec3(.6,.5,1.))),0.),12.);
        float back=pow(max(dot(n,normalize(vec3(.4,-.1,-1.))),0.),3.);
        vec3 c=mix(vec3(.09,.027,.007),vec3(.65,.29,.075),diffuse*.68);
        c+=vec3(1.,.61,.22)*rim*.82+vec3(1.,.93,.77)*(spec*1.6+soft*.17)+vec3(.58,.25,.025)*back;
        float a=.48+diffuse*.1+rim*.32+spec*.09;
        if(kind>1.5){
          // Fine, curved compound-eye facets; no painted pupil or baked light.
          vec2 q=vUv*vec2(48.,28.);q.x+=mod(floor(q.y),2.)*.5;
          vec2 cell=fract(q)-.5;
          float facet=smoothstep(.38,.47,max(abs(cell.x),abs(cell.y)*.86+abs(cell.x)*.5));
          c=mix(vec3(.035,.01,.003),vec3(.4,.135,.014),diffuse*.65);
          c+=vec3(.72,.39,.1)*facet*.13+vec3(1.,.67,.26)*rim*.8+vec3(1.,.91,.72)*(spec*1.6+soft*.2);
          a=.85+rim*.13;
        }else if(kind>.5){
          float band=pow(.5+.5*cos(vUv.y*31.4159),20.);
          c+=vec3(.55,.37,.15)*band*.18;a+=band*.12;
        }
        gl_FragColor=vec4(c,a*alpha);
        #include <colorspace_fragment>
      }`,
  });
}

function abdomenGeometry() {
  const profile = [];
  for (let i = 0; i <= 56; i++) {
    const t = i / 56;
    const radius = Math.pow(Math.sin(Math.PI * t), 0.72) * (0.12 + t * 0.1);
    const segment = 1 - 0.038 * Math.pow(0.5 + 0.5 * Math.cos(t * tau * 5), 10);
    profile.push(new THREE.Vector2(radius * segment, (t - 1) * 0.67));
  }
  const geometry = new THREE.LatheGeometry(profile, 40);
  geometry.rotateZ(-Math.PI / 2);
  geometry.scale(1, 1, 0.91);
  return geometry;
}

export function createArticulatedFly({
  reflection = false,
  graph = null,
} = {}) {
  const root = new THREE.Group();
  root.name = "articulated-drosophila";
  const torso = new THREE.Group();
  root.add(torso);
  const opacityScale = reflection ? 0.13 : 1;
  const shells = [shellMaterial(), shellMaterial(1), shellMaterial(2)];
  const sphere = new THREE.SphereGeometry(
    1,
    reflection ? 24 : 40,
    reflection ? 16 : 28,
  );
  const surfaces = [];
  function ellipsoid(parent, name, position, scale, material = shells[0]) {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    surfaces.push(mesh);
    return mesh;
  }
  ellipsoid(torso, "thorax", [-0.035, 0.025, 0], [0.263, 0.175, 0.177]);
  const abdomen = new THREE.Group();
  abdomen.position.set(-0.14, 0.014, 0);
  torso.add(abdomen);
  const tail = new THREE.Mesh(abdomenGeometry(), shells[1]);
  tail.name = "segmented-abdomen";
  abdomen.add(tail);
  surfaces.push(tail);
  const head = new THREE.Group();
  head.name = "head-pivot";
  head.position.set(0.25, 0.085, 0);
  torso.add(head);
  ellipsoid(head, "head-cuticle", [0.065, 0.025, 0], [0.258, 0.26, 0.214]);
  // Two separate lenses retain the rounded Colony face at every viewing angle.
  for (const side of [-1, 1]) {
    const eye = ellipsoid(
      head,
      `compound-eye-${side}`,
      [0.115, 0.035, side * 0.165],
      [0.187, 0.207, 0.115],
      shells[2],
    );
    eye.rotation.y = side * 0.24;
  }
  ellipsoid(head, "face", [0.27, -0.074, 0], [0.064, 0.058, 0.083]);
  const filamentMaterial = shellMaterial();
  const antennae = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.13, 0.23, side * 0.085);
    head.add(pivot);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(0.02, 0.065, side * 0.014),
      new THREE.Vector3(0.09, 0.14, side * 0.033),
      new THREE.Vector3(0.13, 0.15, side * 0.042),
    ]);
    const stalk = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 16, 0.005, 6, false),
      filamentMaterial,
    );
    pivot.add(stalk);
    const tip = ellipsoid(
      pivot,
      `antenna-tip-${side}`,
      [0.13, 0.15, side * 0.042],
      [0.018, 0.011, 0.012],
    );
    antennae.push({ pivot, side, tip });
  }
  const neural = !reflection && graph ? createEmbeddedActivity(graph) : null;
  if (neural) {
    neural.group.position.set(0.07, 0.045, 0);
    head.add(neural.group);
  }

  const wingParts = [];
  const geometry = wingGeometry();
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.095, 0.16, side * 0.105);
    torso.add(pivot);
    // The same organic fan lives on opposite sides of the thorax in 3D.
    const fan = new THREE.Group();
    fan.rotation.x = (side * Math.PI) / 2;
    pivot.add(fan);
    const uniforms = { alpha: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv;varying vec3 vNormal,vView;void main(){vUv=uv;vec3 p=position;p.z+=sin(uv.x*3.14159)*sin(uv.y*3.14159)*.055;vec4 q=modelViewMatrix*vec4(p,1.);vNormal=normalize(normalMatrix*normal);vView=-q.xyz;gl_Position=projectionMatrix*q;}`,
      fragmentShader: `varying vec2 vUv;varying vec3 vNormal,vView;uniform float alpha;void main(){float facing=abs(dot(normalize(vNormal),normalize(vView)));float rim=pow(1.-facing,2.);float film=.5+.5*sin(facing*12.+vUv.x*7.-vUv.y*4.);vec3 c=mix(vec3(.5,.30,.13),vec3(.83,.84,.73),film*.5+rim*.4);float a=(.08+rim*.19+film*.07)*alpha;gl_FragColor=vec4(c,a);
#include <colorspace_fragment>
}`,
    });
    const mesh = new THREE.Mesh(geometry.membrane, material);
    fan.add(mesh);
    surfaces.push(mesh);
    const veins = new THREE.LineSegments(
      geometry.veins,
      new THREE.LineBasicMaterial({
        color: "#efcd91",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    fan.add(veins);
    const ghost = pivot.clone();
    ghost.children[0].children.forEach((o) => {
      o.material = o.material.clone();
    });
    torso.add(ghost);
    wingParts.push({ pivot, uniforms, veins, ghost, side });
  }
  const legs = [];
  const cylinder = new THREE.CylinderGeometry(0.7, 1, 1, 8);
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const mat = shellMaterial();
      const segments = Array.from(
        { length: 3 },
        () => new THREE.Mesh(cylinder, mat),
      );
      const knee = new THREE.Mesh(sphere, mat);
      const tip = new THREE.Mesh(sphere, mat);
      for (const mesh of [...segments, knee, tip]) root.add(mesh);
      legs.push({ side, i, segments, knee, tip, mat });
    }
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    d = new THREE.Vector3(),
    direction = new THREE.Vector3();
  function segment(mesh, start, end, width) {
    direction.subVectors(end, start);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(width, direction.length(), width);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  // Preallocate a sparse surface sample. Identity dissolves the actual posed
  // body and wings; there is no hidden 2D plate behind the new rig.
  const samples = [];
  for (const mesh of surfaces) {
    const attr = mesh.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(attr.count / 220));
    for (let i = 0; i < attr.count; i += stride) samples.push({ mesh, i });
  }
  const sampleBuffer = new Float32Array(samples.length * 3);
  const local = new THREE.Matrix4(),
    inverse = new THREE.Matrix4(),
    sample = new THREE.Vector3();
  return {
    root,
    getHeadPosition(target) {
      return head.getWorldPosition(target);
    },
    sampleSurface() {
      root.updateWorldMatrix(true, true);
      inverse.copy(root.matrixWorld).invert();
      samples.forEach(({ mesh, i }, index) => {
        local.multiplyMatrices(inverse, mesh.matrixWorld);
        sample
          .fromBufferAttribute(mesh.geometry.attributes.position, i)
          .applyMatrix4(local)
          .toArray(sampleBuffer, index * 3);
      });
      return sampleBuffer;
    },
    update({
      time = 0,
      flight = 0,
      walk = 0,
      alpha = 1,
      groom = 0,
      compression = 0,
      turn = 0,
      frame,
      pixel = 1,
      reduced = false,
    } = {}) {
      root.visible = alpha > 0.002;
      const visibility = alpha * opacityScale;
      const pose = sampleFlyGesture(time, {
        flight,
        walk,
        groom,
        compression,
        turn,
        action: frame?.action,
        reduced,
      });
      const t = reduced ? 0 : time;
      torso.position.y = pose.bob;
      torso.rotation.z = pose.pitch;
      head.rotation.set(0, pose.headYaw, pose.headPitch);
      abdomen.rotation.set(0, pose.tailYaw, pose.tailPitch);
      abdomen.scale.set(1, pose.breath, pose.breath);
      for (const material of [...shells, filamentMaterial])
        material.uniforms.alpha.value = visibility;
      for (const { pivot, side } of antennae) {
        pivot.rotation.z = Math.sin(t * 2.7 + side) * 0.1 + pose.groom * 0.08;
        pivot.rotation.x = Math.sin(t * 1.9 + side * 1.7) * 0.16;
      }
      neural?.update(frame, visibility, pixel);
      for (const { pivot, uniforms, veins, ghost, side } of wingParts) {
        const phase = t * tau * 7.3;
        const rest = side > 0 ? -0.57 : 0.87;
        const flutter = Math.sin(t * 6.4) * 0.035 * (1 - flight);
        pivot.rotation.set(
          rest + side * (Math.sin(phase) * 1.05 * flight + flutter),
          side * 0.07,
          0.05 + flight * 0.11,
        );
        uniforms.alpha.value = visibility;
        veins.material.opacity = visibility * 0.49;
        ghost.visible = flight > 0.1 && !reflection;
        ghost.rotation.copy(pivot.rotation);
        ghost.rotation.x = rest + side * Math.sin(phase - 0.8) * 1.05 * flight;
        ghost.children[0].children[0].material.uniforms.alpha.value =
          visibility * flight * 0.1;
        ghost.children[0].children[1].material.opacity =
          visibility * flight * 0.07;
      }
      torso.updateMatrix();
      for (const { i, side, segments, knee, tip, mat } of legs) {
        a.set(
          [0.105, -0.065, -0.225][i],
          [-0.065, -0.105, -0.075][i],
          side * 0.117,
        ).applyMatrix4(torso.matrix);
        const target = flyFootTarget(t, i, side, {
          walk,
          flight,
          groom: pose.groom,
        });
        const solved = solveFlyLeg(a.toArray(), target, [
          [0.5, 0, -0.7][i],
          0.28,
          side,
        ]);
        b.fromArray(solved.knee);
        c.fromArray(solved.foot);
        d.set(c.x + 0.034, c.y, c.z + side * 0.01);
        segment(segments[0], a, b, 0.012);
        segment(segments[1], b, c, 0.007);
        segment(segments[2], c, d, 0.004);
        knee.position.copy(b);
        knee.scale.setScalar(0.012);
        tip.position.copy(c);
        tip.scale.set(0.009, 0.005, 0.007);
        mat.uniforms.alpha.value = visibility;
      }
    },
  };
}
