import * as THREE from "three";
import { BONE, GOLD } from "./brand.mjs";

// Reusable homepage concept art; internal paths are schematic, not telemetry.
export function createHologramModel() {
  const scene = new THREE.Group();
  const specimen = new THREE.Group();
  scene.add(specimen);
  const uniforms = {
    time: { value: 0 },
    visibility: { value: 1 },
    color: { value: new THREE.Color(BONE) },
    amber: { value: new THREE.Color(GOLD) },
  };
  const shell = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vNormal;varying vec3 vView;varying vec3 vPoint;varying vec2 vUv;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);
      vView=-view.xyz;vPoint=(modelMatrix*vec4(position,1.)).xyz;vUv=uv;gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float time;uniform float visibility;uniform vec3 color;uniform vec3 amber;
      varying vec3 vNormal;varying vec3 vView;varying vec3 vPoint;varying vec2 vUv;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.5);
        vec2 grid=abs(fract(vUv*vec2(28.,18.)-.5)-.5)/max(fwidth(vUv*vec2(28.,18.)),vec2(.001));
        float wire=1.-min(min(grid.x,grid.y),1.);
        float scanY=1.45-mod(time*.28,2.9);
        float sweep=exp(-pow((vPoint.y-scanY)*17.,2.));
        float bands=.84+.16*sin(vPoint.y*180.);
        vec3 light=mix(color,amber,.12+wire*.15);
        gl_FragColor=vec4(light,(.022+rim*.35+wire*.105+sweep*.26)*bands*visibility);}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const edge = new THREE.LineBasicMaterial({
    color: BONE,
    opacity: 0.52,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const vein = new THREE.LineBasicMaterial({
    color: BONE,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gold = new THREE.LineBasicMaterial({
    color: GOLD,
    opacity: 0.54,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dot = new THREE.MeshBasicMaterial({
    color: BONE,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sphereGeometry = new THREE.SphereGeometry(1, 40, 28);
  function ellipsoid(parent, position, scale, material = shell) {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }
  function curve(parent, points, material = edge, closed = false) {
    const spline = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      closed,
      "centripetal",
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(
      spline.getPoints(48),
    );
    const line = new THREE.Line(geometry, material);
    parent.add(line);
    return spline;
  }
  function ring(parent, center, rx, ry, material, plane = "xy") {
    const points = Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return plane === "xz"
        ? new THREE.Vector3(
            center[0] + rx * Math.cos(a),
            center[1],
            center[2] + ry * Math.sin(a),
          )
        : new THREE.Vector3(
            center[0] + rx * Math.cos(a),
            center[1] + ry * Math.sin(a),
            center[2],
          );
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      material,
    );
    parent.add(line);
  }

  ellipsoid(specimen, [0, 0.02, 0], [0.27, 0.37, 0.22]);
  ellipsoid(specimen, [0, 0.53, 0.02], [0.3, 0.25, 0.23]);
  const profile = [
    [0.018, -1.1],
    [0.11, -1.02],
    [0.21, -0.86],
    [0.28, -0.67],
    [0.28, -0.5],
    [0.22, -0.34],
    [0.15, -0.25],
  ];
  const abdomen = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      48,
    ),
    shell,
  );
  specimen.add(abdomen);
  [-0.38, -0.51, -0.64, -0.77, -0.9].forEach((y, i) =>
    ring(
      specimen,
      [0, y, 0],
      [0.235, 0.28, 0.287, 0.26, 0.188][i],
      [0.235, 0.28, 0.287, 0.26, 0.188][i],
      vein,
      "xz",
    ),
  );

  const eyePositions = [];
  for (const side of [-1, 1]) {
    ellipsoid(specimen, [side * 0.245, 0.54, 0.075], [0.15, 0.205, 0.185]);
    for (let row = 1; row < 18; row++) {
      const theta = (row / 18) * Math.PI;
      for (let col = 0; col < 26; col++) {
        const phi = ((col + (row % 2) * 0.5) / 26) * Math.PI * 2;
        eyePositions.push(
          side * 0.245 + Math.sin(theta) * Math.cos(phi) * 0.153,
          0.54 + Math.cos(theta) * 0.207,
          0.075 + Math.sin(theta) * Math.sin(phi) * 0.188,
        );
      }
    }
    curve(
      specimen,
      [
        [side * 0.11, 0.71, 0.08],
        [side * 0.145, 0.84, 0.11],
        [side * 0.235, 0.91, 0.1],
      ],
      edge,
    );
    ellipsoid(specimen, [side * 0.235, 0.91, 0.1], [0.02, 0.02, 0.02], dot);
    // Three articulated legs on each side of the thorax.
    const legPaths = [
      [
        [side * 0.2, 0.2, 0.01],
        [side * 0.48, 0.32, 0.08],
        [side * 0.57, 0.65, 0.11],
        [side * 0.7, 0.73, 0.14],
      ],
      [
        [side * 0.25, 0.01, 0.03],
        [side * 0.57, -0.17, 0.14],
        [side * 0.84, -0.11, 0.17],
        [side * 0.93, -0.23, 0.19],
      ],
      [
        [side * 0.2, -0.22, 0.01],
        [side * 0.48, -0.48, 0.13],
        [side * 0.56, -0.89, 0.15],
        [side * 0.73, -1.01, 0.18],
      ],
    ];
    legPaths.forEach((points) => {
      curve(specimen, points, edge);
      ellipsoid(specimen, points[1], [0.018, 0.018, 0.018], dot);
      curve(
        specimen,
        points.map((p) => [p[0], p[1], p[2] - 0.022]),
        vein,
      );
    });
  }
  const eyesGeometry = new THREE.BufferGeometry();
  eyesGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(eyePositions, 3),
  );
  specimen.add(
    new THREE.Points(
      eyesGeometry,
      new THREE.PointsMaterial({
        color: BONE,
        size: 0.009,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.16, 0.17, -0.05);
    wing.scale.x = side;
    specimen.add(wing);
    wings.push(wing);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.28, 0.24, 1.03, 0.5, 1.29, 0.22);
    shape.bezierCurveTo(1.56, -0.1, 0.54, -0.46, 0, -0.09);
    shape.closePath();
    const membrane = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 36),
      new THREE.MeshBasicMaterial({
        color: BONE,
        opacity: 0.035,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    wing.add(membrane);
    wing.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(shape.getPoints(72)),
        edge,
      ),
    );
    const veinPaths = [
      [
        [0, 0, 0.003],
        [0.43, 0.18, 0.01],
        [0.88, 0.29, 0.003],
        [1.28, 0.22, 0.003],
      ],
      [
        [0, -0.035, 0.003],
        [0.5, 0.02, 0.01],
        [0.98, 0.04, 0.003],
        [1.29, 0.08, 0.003],
      ],
      [
        [0, -0.07, 0.003],
        [0.42, -0.12, 0.01],
        [0.86, -0.15, 0.003],
        [1.1, -0.09, 0.003],
      ],
      [
        [0.43, 0.18, 0.01],
        [0.49, 0.025, 0.01],
        [0.42, -0.12, 0.01],
      ],
      [
        [0.86, 0.28, 0.003],
        [0.9, 0.04, 0.003],
        [0.81, -0.15, 0.003],
      ],
    ];
    veinPaths.forEach((p) => curve(wing, p, vein));
    for (let i = 1; i < 16; i++) {
      const x = i / 16;
      curve(
        wing,
        [
          [x, 0.16 + Math.sin(x * 2) * 0.05, 0.002],
          [x + 0.025, 0.035, 0.003],
          [x, -0.1, 0.002],
        ],
        new THREE.LineBasicMaterial({
          color: BONE,
          opacity: 0.07,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
    }
  }

  // The internal structure is deliberately schematic, with no data labels.
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  ellipsoid(specimen, [-0.08, 0.55, 0.08], [0.105, 0.085, 0.09], coreMaterial);
  ellipsoid(specimen, [0.08, 0.55, 0.08], [0.105, 0.085, 0.09], coreMaterial);
  const nervePaths = [
    [
      [-0.24, 0.57, 0.1],
      [-0.08, 0.55, 0.14],
      [0, 0.43, 0.1],
      [0, 0.09, 0.12],
      [0, -0.4, 0.12],
      [0, -0.85, 0.06],
    ],
    [
      [0.24, 0.57, 0.1],
      [0.08, 0.55, 0.14],
      [0, 0.43, 0.1],
      [0, 0.09, 0.12],
    ],
    [
      [0, 0.09, 0.12],
      [-0.15, 0.1, 0.1],
      [-0.46, 0.3, 0.09],
    ],
    [
      [0, 0.09, 0.12],
      [0.15, 0.1, 0.1],
      [0.46, 0.3, 0.09],
    ],
    [
      [0, -0.1, 0.12],
      [-0.21, -0.12, 0.09],
      [-0.46, -0.46, 0.13],
    ],
    [
      [0, -0.1, 0.12],
      [0.21, -0.12, 0.09],
      [0.46, -0.46, 0.13],
    ],
  ];
  const pulses = nervePaths.map((p, i) => {
    const path = curve(specimen, p, gold);
    const light = ellipsoid(specimen, p[0], [0.015, 0.015, 0.015], dot);
    return { path, light, phase: i * 0.16 };
  });
  [0.54, 0.09, -0.12, -0.4].forEach((y) =>
    ellipsoid(specimen, [0, y, 0.12], [0.024, 0.024, 0.024], dot),
  );

  const platform = new THREE.Group();
  platform.position.set(0, -1.46, -0.14);
  platform.rotation.x = 0.36;
  scene.add(platform);
  const dimGold = new THREE.LineBasicMaterial({
    color: GOLD,
    opacity: 0.16,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  ring(platform, [0, 0, 0], 1.18, 0.23, dimGold);
  ring(platform, [0, 0, 0], 0.96, 0.185, vein);
  ring(platform, [0, 0, 0], 0.38, 0.074, dimGold);
  const ticks = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ticks.push(
      Math.cos(a) * 1.19,
      Math.sin(a) * 0.232,
      0,
      Math.cos(a) * (i % 8 === 0 ? 1.26 : 1.22),
      Math.sin(a) * (i % 8 === 0 ? 0.25 : 0.24),
      0,
    );
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(ticks, 3),
  );
  platform.add(new THREE.LineSegments(tickGeometry, vein));

  const materials = new Map();
  scene.traverse((object) => {
    if (object.material && object.material !== shell)
      materials.set(object.material, object.material.opacity);
  });
  return {
    group: scene,
    specimen,
    platform,
    setOpacity(value) {
      uniforms.visibility.value = value;
      materials.forEach((opacity, material) => {
        material.opacity = opacity * value;
      });
      scene.visible = value > 0.005;
    },
    update(time, still = false) {
      wings.forEach((wing, i) => {
        wing.rotation.y =
          (i === 0 ? -1 : 1) *
          (0.16 + (still ? 0 : Math.sin(time * 2.5) * 0.025));
      });
      pulses.forEach(({ path, light, phase }) =>
        light.position.copy(path.getPoint((time * 0.12 + phase) % 1)),
      );
      uniforms.time.value = time;
    },
  };
}
