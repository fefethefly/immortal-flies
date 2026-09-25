import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { createHologramModel } from "./home-hologram-model.mjs";
import { BONE, GOLD } from "./brand.mjs";

// A visual interpretation of a fly. These particles never represent neurons;
// measured neural activity is rendered separately from the circuit graph.
export function createParticleOrganism(compact = false) {
  const source = createHologramModel();
  source.group.updateMatrixWorld(true);
  const positions = [],
    normals = [],
    seeds = [],
    parts = [],
    paths = [];
  const p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    matrix = new THREE.Matrix3();
  let seed = 7183;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const shells = [];
  source.specimen.traverse((object) => {
    if (
      (object.isMesh && object.material.type === "ShaderMaterial") ||
      (object.isMesh && object.geometry.type === "ShapeGeometry")
    ) {
      const wing = object.geometry.type === "ShapeGeometry";
      const eye = !wing && object.scale.x < 0.2 && object.scale.y > 0.1;
      const count = Math.round(
        (wing
          ? 17000
          : eye
            ? 5500
            : object.geometry.type === "LatheGeometry"
              ? 14500
              : 10500) * (compact ? 0.52 : 1),
      );
      const sampler = new MeshSurfaceSampler(object)
        .setRandomGenerator(random)
        .build();
      matrix.getNormalMatrix(object.matrixWorld);
      for (let i = 0; i < count; i++) {
        sampler.sample(p, n);
        p.applyMatrix4(object.matrixWorld);
        n.applyMatrix3(matrix).normalize();
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        seeds.push(random(), random(), random());
        parts.push(wing ? 1 : eye ? 2 : 0);
      }
      shells.push({
        geometry: object.geometry.clone().applyMatrix4(object.matrixWorld),
        wing,
      });
    }
    if (object.isLine) {
      const a = object.geometry.attributes.position;
      for (let i = 1; i < a.count; i++) {
        for (const j of [i - 1, i]) {
          p.fromBufferAttribute(a, j).applyMatrix4(object.matrixWorld);
          paths.push(p.x, p.y, p.z);
        }
      }
    }
  });
  const discardedGeometries = new Set(),
    discardedMaterials = new Set();
  source.group.traverse((object) => {
    if (object.geometry) discardedGeometries.add(object.geometry);
    if (object.material) discardedMaterials.add(object.material);
  });
  discardedGeometries.forEach((g) => g.dispose());
  discardedMaterials.forEach((m) => m.dispose());

  const group = new THREE.Group(),
    specimen = new THREE.Group();
  group.add(specimen);
  const uniforms = {
    time: { value: 0 },
    alpha: { value: 1 },
    pixel: { value: 1 },
    dissolve: { value: 0 },
    expansion: { value: 0 },
    birth: { value: 0 },
    pointer: { value: new THREE.Vector2() },
    bone: { value: new THREE.Color(BONE) },
    gold: { value: new THREE.Color(GOLD) },
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 3));
  geometry.setAttribute("part", new THREE.Float32BufferAttribute(parts, 1));
  const pointsMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 seed; attribute float part;
      uniform float time,pixel,dissolve,expansion,birth; uniform vec2 pointer;
      varying float light,grain,kind;
      void main(){
        vec3 p=position;
        vec3 drift=vec3(sin(p.y*5.+time*.35+seed.x*6.),cos(p.z*7.+time*.25+seed.y*6.),sin(p.x*4.-time*.3+seed.z*6.));
        p+=drift*(.004+pow(seed.x,12.)*.11);
        if(part>.5 && part<1.5){p.z+=sin(p.x*2.4+time*1.8)*abs(p.x)*.024;}
        float a=seed.x*6.2831853;
        float radius=.52+seed.y*.28;
        vec3 stream=vec3((seed.x-.5)*5.6,sin(seed.x*7.+time*.09)*.33+cos(a*8.+seed.y*2.)*radius*.24,sin(a*8.+seed.y*2.)*radius*.35);
        float sphereY=seed.y*2.-1.; float sphereR=sqrt(1.-sphereY*sphereY);
        vec3 world=vec3(cos(a)*sphereR,sphereY,sin(a)*sphereR)*(1.1+seed.z*.16);
        world+=drift*.025;
        p=mix(p,mix(stream,world,expansion),dissolve);
        float disperse=pow(seed.z,2.)*birth;
        p+=vec3(cos(a)*2.2,sin(a)*1.6,seed.y*2.-1.)*disperse;
        p.xy+=pointer*.035*(1.-dissolve)*(1.+seed.z);
        vec4 view=modelViewMatrix*vec4(p,1.);
        vec3 nor=normalize(normalMatrix*normal);
        float rim=pow(1.-abs(dot(nor,normalize(-view.xyz))),1.5);
        light=.25+rim*.55+max(0.,dot(nor,normalize(vec3(-.4,.8,1.))))*.4;
        grain=seed.z;kind=part;
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp((.7+seed.y*.8+pow(seed.z,18.)*1.8)*pixel*6./-view.z, .6, 7.);
      }`,
    fragmentShader: `uniform float alpha;uniform vec3 bone,gold;varying float light,grain,kind;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
      float glow=exp(-d*d*3.5);float amber=kind>1.5?.38:.06;
      vec3 color=mix(bone,gold,amber+pow(grain,20.)*.4);
      gl_FragColor=vec4(color*(.75+light*.7),glow*(.2+light*.55)*alpha);}`,
  });
  const points = new THREE.Points(geometry, pointsMaterial);
  points.frustumCulled = false;
  specimen.add(points);
  const shellMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 n,v;varying vec3 pos;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-p.xyz;pos=position;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float time,alpha,dissolve,birth;uniform vec3 bone,gold;varying vec3 n,v,pos;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.6);
      float silk=pow(.5+.5*sin(pos.x*34.+pos.y*17.+sin(pos.y*12.+time*.22)*2.),7.);
      float sheen=pow(max(0.,dot(normalize(n),normalize(vec3(-.4,.8,1.)))),12.);
      gl_FragColor=vec4(mix(bone,gold,.05+silk*.08),(.018+rim*.09+sheen*.022+silk*.01)*alpha*(1.-dissolve)*(1.-birth));}`,
  });
  shells.forEach(({ geometry }) =>
    specimen.add(new THREE.Mesh(geometry, shellMaterial)),
  );
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(paths, 3),
  );
  const lineMaterial = new THREE.LineBasicMaterial({
    color: BONE,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  specimen.add(new THREE.LineSegments(pathGeometry, lineMaterial));
  return {
    group,
    specimen,
    update({
      time,
      alpha,
      dissolve = 0,
      expansion = 0,
      birth = 0,
      pixel = 1,
      pointerX = 0,
      pointerY = 0,
    }) {
      group.visible = alpha > 0.001;
      uniforms.time.value = time;
      uniforms.alpha.value = alpha;
      uniforms.dissolve.value = dissolve;
      uniforms.expansion.value = expansion;
      uniforms.birth.value = birth;
      uniforms.pixel.value = pixel;
      uniforms.pointer.value.set(pointerX, pointerY);
      lineMaterial.opacity = 0.15 * alpha * (1 - dissolve) * (1 - birth);
    },
  };
}
