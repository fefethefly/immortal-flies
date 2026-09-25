import * as THREE from "three";
import { BONE, GOLD, EYE } from "./brand.mjs";
import { projectHomeBody } from "./home-field-state.mjs";

const lineMaterial = (color, opacity) =>
  new THREE.LineBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
function line(points, mat, segments = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  return segments
    ? new THREE.LineSegments(geometry, mat)
    : new THREE.Line(geometry, mat);
}

// The terrain and contour rings are a spatial frame for the local experiment,
// not measurements of a biological habitat or other simulated inhabitants.
export function createFieldEnvironment() {
  const group = new THREE.Group(),
    terrain = new THREE.Group();
  group.add(terrain);
  const contourMat = lineMaterial(GOLD, 0.1),
    gridMat = lineMaterial(BONE, 0.06),
    rimMat = lineMaterial(GOLD, 0.35);
  for (let r = 0.22; r < 4.85; r += 0.095) {
    const points = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      const ripple =
        Math.sin(a * 3 + r * 1.7) * 0.085 + Math.sin(a * 7 - r * 0.8) * 0.03;
      const radius = r + ripple * Math.min(1, r);
      const elevation =
        Math.exp(-Math.pow(r - 1.6, 2) * 1.5) * (0.14 + 0.1 * Math.sin(a * 2)) +
        Math.sin(r * 2.2 + a * 2) * 0.055;
      points.push(Math.cos(a) * radius, Math.sin(a) * radius, elevation);
    }
    terrain.add(line(points, contourMat));
  }
  const ticks = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const r = 3.8,
      end = r + (i % 15 === 0 ? 0.18 : 0.04);
    ticks.push(
      Math.cos(a) * r,
      Math.sin(a) * r,
      0.015,
      Math.cos(a) * end,
      Math.sin(a) * end,
      0.015,
    );
  }
  terrain.add(line(ticks, rimMat, true));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    terrain.add(
      line(
        [
          Math.cos(a) * 0.3,
          Math.sin(a) * 0.3,
          -0.01,
          Math.cos(a) * 4.6,
          Math.sin(a) * 4.6,
          -0.01,
        ],
        gridMat,
      ),
    );
  }
  // A soft annular light field, kept subtle so the specimen remains dominant.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 11),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        opacity: { value: 1 },
        color: { value: new THREE.Color(GOLD) },
      },
      vertexShader: `varying vec2 p;void main(){p=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 p;uniform float opacity;uniform vec3 color;void main(){float d=length(p);float ring=exp(-pow((d-.20)*13.,2.));float core=exp(-d*15.);gl_FragColor=vec4(color,(ring*.025+core*.015)*opacity);}`,
    }),
  );
  terrain.add(glow);
  terrain.rotation.x = -0.98;
  terrain.rotation.z = -0.2;
  terrain.position.set(0, -1.0, -0.65);

  const trailMat = lineMaterial(GOLD, 0.8);
  const trail = line([0, 0, 0], trailMat);
  group.add(trail);
  const signalMat = lineMaterial(BONE, 0.5);
  const signal = new THREE.Group();
  for (let ring = 0; ring < 3; ring++) {
    const points = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * Math.PI * 2,
        r = 0.25 + ring * 0.12;
      points.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    signal.add(line(points, signalMat));
  }
  group.add(signal);
  let previousRecord,
    previousIndex = -1;
  return {
    group,
    update({ alpha, time, record, frameIndex, frame, busy, still }) {
      group.visible = alpha > 0.005;
      contourMat.opacity = 0.1 * alpha;
      gridMat.opacity = 0.06 * alpha;
      rimMat.opacity = 0.35 * alpha;
      glow.material.uniforms.opacity.value = alpha;
      terrain.rotation.z = -0.2 + (still ? 0 : Math.sin(time * 0.025) * 0.025);
      if (record !== previousRecord || frameIndex !== previousIndex) {
        const coordinates = (
          record?.frames.slice(0, frameIndex + 1) || []
        ).flatMap(({ body }) => {
          const p = projectHomeBody(body);
          return [p.x, p.y, -0.07];
        });
        trail.geometry.dispose();
        trail.geometry = new THREE.BufferGeometry();
        trail.geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            coordinates.length ? coordinates : [0, 0, 0],
            3,
          ),
        );
        previousRecord = record;
        previousIndex = frameIndex;
      }
      trailMat.opacity = 0.8 * alpha;
      trail.visible = !!record && frameIndex > 0;
      signal.visible = busy && frameIndex > 0 && frameIndex <= 6;
      const p = projectHomeBody(frame.body);
      signal.position.set(p.x - 0.9, p.y + 0.5, -0.1);
      signal.scale.setScalar(0.6 + frameIndex * 0.09);
      signalMat.color.set(
        record?.kind === "threat"
          ? EYE
          : record?.kind === "food"
            ? GOLD
            : BONE,
      );
      signalMat.opacity = alpha * 0.7;
    },
  };
}
