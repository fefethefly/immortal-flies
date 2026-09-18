// WebGL point-sprite renderer for the hero flies, drawn as catalog-illustration
// particles. Each palette is one static buffer (local xy, rgb, source alpha,
// flap weight). Per-fly uniforms place, tilt and flap the silhouette.
// Premultiplied source-over so the portrait stays a fly, not a gold nebula.

const VERTEX = `
attribute vec2 a_local;
attribute vec3 a_color;
attribute float a_opacity;
attribute float a_weight;
uniform vec2 u_resolution;
uniform vec2 u_fly;
uniform vec2 u_hinge;
uniform float u_sz;
uniform float u_flap;
uniform float u_tilt;
uniform float u_alpha;
uniform float u_dpr;
varying vec3 v_color;
varying float v_alpha;
void main() {
  vec2 p = a_local;
  float ang = u_flap * a_weight;
  vec2 rel = p - u_hinge;
  float c = cos(ang);
  float s = sin(ang);
  p = u_hinge + vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  float ct = cos(u_tilt);
  float st = sin(u_tilt);
  p = vec2(p.x * ct - p.y * st, p.x * st + p.y * ct);
  vec2 pos = (u_fly + p * u_sz) * u_dpr;
  gl_Position = vec4(pos / (u_resolution * 0.5) - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  gl_PointSize = max(2.8, u_sz * u_dpr * 0.048);
  v_color = a_color;
  v_alpha = u_alpha * a_opacity;
}`;

const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = v_alpha * (1.0 - smoothstep(0.52, 1.0, d));
  if (a < 0.02) discard;
  gl_FragColor = vec4(v_color * a, a);
}`;

export function createFlyPointsGL({ width, height }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const contextAttributes = {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  };
  const gl =
    canvas.getContext("webgl", contextAttributes) ||
    canvas.getContext("experimental-webgl", contextAttributes);
  if (!gl) throw new Error("WebGL unavailable");

  const shaders = [];
  const buffers = [];
  const geometry = new Map();
  let program;
  const release = () => {
    for (const entry of geometry.values()) gl.deleteBuffer(entry.buffer);
    buffers.forEach((b) => gl.deleteBuffer(b));
    if (program) gl.deleteProgram(program);
    shaders.forEach((s) => gl.deleteShader(s));
  };
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    release();
    throw error;
  }

  gl.useProgram(program);
  const geometryOf = (points) => {
    let entry = geometry.get(points);
    if (entry) return entry;
    const verts = new Float32Array(points.count * 7);
    for (let i = 0; i < points.count; i += 1) {
      const o = i * 7;
      verts[o] = points.local[i * 2];
      verts[o + 1] = points.local[i * 2 + 1];
      verts[o + 2] = points.colors[i * 3];
      verts[o + 3] = points.colors[i * 3 + 1];
      verts[o + 4] = points.colors[i * 3 + 2];
      verts[o + 5] = points.opacity[i];
      verts[o + 6] = points.weight[i];
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    entry = { buffer, count: points.count };
    geometry.set(points, entry);
    return entry;
  };

  const uniforms = Object.fromEntries(
    [
      "u_resolution",
      "u_fly",
      "u_hinge",
      "u_sz",
      "u_flap",
      "u_tilt",
      "u_alpha",
      "u_dpr",
    ].map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  const locations = Object.fromEntries(
    ["a_local", "a_color", "a_opacity", "a_weight"].map((name) => [
      name,
      gl.getAttribLocation(program, name),
    ]),
  );

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);

  function bindPoints(points) {
    const entry = geometryOf(points);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
    gl.enableVertexAttribArray(locations.a_local);
    gl.vertexAttribPointer(locations.a_local, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(locations.a_color);
    gl.vertexAttribPointer(locations.a_color, 3, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(locations.a_opacity);
    gl.vertexAttribPointer(locations.a_opacity, 1, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(locations.a_weight);
    gl.vertexAttribPointer(locations.a_weight, 1, gl.FLOAT, false, 28, 24);
    gl.uniform2f(uniforms.u_hinge, points.hinge[0], points.hinge[1]);
    return entry;
  }

  return {
    canvas,
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
    },
    /** items: [{ points, x, y, sz, alpha, flap, tilt }] 已按深度从远到近。 */
    draw(items, { dpr }) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_dpr, dpr);
      let bound = null;
      for (const item of items) {
        if (bound !== item.points) {
          bindPoints(item.points);
          bound = item.points;
        }
        gl.uniform2f(uniforms.u_fly, item.x, item.y);
        gl.uniform1f(uniforms.u_sz, item.sz);
        gl.uniform1f(uniforms.u_flap, item.flap);
        gl.uniform1f(uniforms.u_tilt, item.tilt || 0);
        gl.uniform1f(uniforms.u_alpha, item.alpha);
        gl.drawArrays(gl.POINTS, 0, bound.count);
      }
    },
    destroy: release,
  };
}
