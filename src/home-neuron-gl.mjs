// WebGL point-sprite renderer for the dense MaleCNS neuron field.
// Renders into an offscreen canvas that the 2D hero compositor stamps in
// with a single drawImage, so the HUD, flies and event layers stay intact.
// Falls back to nothing on context loss; callers keep a 2D sampled path.

const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_color;
attribute float a_rare;
attribute float a_activity;
uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_zoom;
uniform float u_time;
uniform float u_dim;
varying vec3 v_color;
varying float v_alpha;
varying float v_activity;
void main() {
  vec3 p = a_position;
  float sy = sin(u_yaw);
  float cy = cos(u_yaw);
  float sp = sin(u_pitch);
  float cp = cos(u_pitch);
  float x1 = p.x * cy + p.z * sy;
  float z1 = -p.x * sy + p.z * cy;
  float y2 = p.y * cp - z1 * sp;
  float z2 = p.y * sp + z1 * cp;
  float persp = 1.0 / max(0.42, 1.26 - z2 * 0.28);
  float scale = min(u_resolution.x * 0.44, u_resolution.y * 0.54) * u_zoom;
  vec2 pos = vec2(
    u_resolution.x * 0.5 + x1 * scale * persp,
    u_resolution.y * 0.5 - y2 * scale * persp
  );
  gl_Position = vec4(pos / (u_resolution * 0.5) - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  float size = (a_rare > 0.5 ? 3.3 : 2.5) * (1.0 + max(a_activity, 0.0) * 0.7) * persp;
  gl_PointSize = min(60.0, size * 2.0 * u_dpr);
  float depth01 = (z2 + 1.15) / 2.3;
  float breath = 0.86 + 0.14 * sin(u_time * 0.6 + (p.x + p.y) * 9.0);
  float rareAdd = a_rare > 0.5 ? 0.1 : 0.0;
  v_alpha = min(1.0, (0.64 + depth01 * 0.36 + max(a_activity, 0.0) * 0.7 + rareAdd) * u_dim * breath);
  if (a_activity < 0.0) v_alpha = 0.0;
  v_color = a_color;
  v_activity = max(a_activity, 0.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
varying float v_activity;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float spread = mix(5.5, 1.7, v_activity);
  float glow = exp(-d * d * spread);
  gl_FragColor = vec4(v_color, glow * v_alpha);
}`;

export function createNeuronFieldGL(
  { positions, colors, rare, count },
  { width, height, onLost } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const contextAttributes = {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  };
  const gl =
    canvas.getContext("webgl", contextAttributes) ||
    canvas.getContext("experimental-webgl", contextAttributes);
  if (!gl) throw new Error("WebGL unavailable");

  const shaders = [];
  const buffers = [];
  let program;
  const release = () => {
    buffers.forEach((b) => gl.deleteBuffer(b));
    if (program) gl.deleteProgram(program);
    shaders.forEach((s) => gl.deleteShader(s));
  };
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
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

  const staticData = new Float32Array(count * 7);
  for (let i = 0; i < count; i += 1) {
    const o = i * 7;
    staticData[o] = positions[i * 3];
    staticData[o + 1] = positions[i * 3 + 1];
    staticData[o + 2] = positions[i * 3 + 2];
    staticData[o + 3] = colors[i * 3];
    staticData[o + 4] = colors[i * 3 + 1];
    staticData[o + 5] = colors[i * 3 + 2];
    staticData[o + 6] = rare[i];
  }
  const staticBuffer = gl.createBuffer();
  buffers.push(staticBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, staticBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, staticData, gl.STATIC_DRAW);
  for (const [name, offset] of [
    ["a_position", 0],
    ["a_color", 12],
    ["a_rare", 24],
  ]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      name === "a_rare" ? 1 : 3,
      gl.FLOAT,
      false,
      28,
      offset,
    );
  }

  const activityBuffer = gl.createBuffer();
  buffers.push(activityBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, activityBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, count * 4, gl.DYNAMIC_DRAW);
  const activityLoc = gl.getAttribLocation(program, "a_activity");
  gl.enableVertexAttribArray(activityLoc);
  gl.vertexAttribPointer(activityLoc, 1, gl.FLOAT, false, 0, 0);

  const uniforms = Object.fromEntries(
    [
      "u_resolution",
      "u_dpr",
      "u_yaw",
      "u_pitch",
      "u_zoom",
      "u_time",
      "u_dim",
    ].map((name) => [name, gl.getUniformLocation(program, name)]),
  );

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);

  let lost = false;
  const lose = () => {
    if (lost) return;
    lost = true;
    onLost?.();
  };
  const onContextLost = (event) => {
    event.preventDefault();
    lose();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  return {
    canvas,
    resize(w, h) {
      if (lost) return;
      canvas.width = w;
      canvas.height = h;
    },
    draw(activity, { yaw, pitch, zoom, dim, time, width, height, dpr }) {
      if (lost || gl.isContextLost?.()) {
        lose();
        return false;
      }
      try {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uniforms.u_resolution, width, height);
        gl.uniform1f(uniforms.u_dpr, dpr);
        gl.uniform1f(uniforms.u_yaw, yaw);
        gl.uniform1f(uniforms.u_pitch, pitch);
        gl.uniform1f(uniforms.u_zoom, zoom);
        gl.uniform1f(uniforms.u_time, time);
        gl.uniform1f(uniforms.u_dim, dim);
        gl.bindBuffer(gl.ARRAY_BUFFER, activityBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, activity);
        gl.drawArrays(gl.POINTS, 0, count);
        return true;
      } catch {
        lose();
        return false;
      }
    },
    destroy() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      release();
    },
  };
}
