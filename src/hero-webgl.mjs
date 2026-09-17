import { createHeroParticles } from "./hero-particles.mjs";

const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_meta;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_hit;
uniform float u_dpr;
varying vec3 v_color;
varying float v_alpha;
void main(){
  vec3 p=a_position;
  float kind=a_meta.x;
  float seed=a_meta.y;
  float group=a_meta.z;
  bool wing=kind==1.0||kind==3.0;
  if(wing){
    float flap=sin(u_time*24.0)*0.34;
    float hinge=sign(p.x)*0.13;
    float dx=p.x-hinge;
    p.x=hinge+dx*cos(flap);
    p.z+=abs(dx)*sin(flap);
  }
  float yaw=0.35+sin(u_time*0.22)*0.13+u_pointer.x*0.14;
  float x=p.x*cos(yaw)+p.z*sin(yaw);
  p.z=-p.x*sin(yaw)+p.z*cos(yaw);p.x=x;
  float tilt=-0.4;
  p.xy=mat2(cos(tilt),sin(tilt),-sin(tilt),cos(tilt))*p.xy;
  float distanceToWave=(length(p.xy)-u_hit*1.8)*6.0;
  float wave=exp(-distanceToWave*distanceToWave)*exp(-u_hit*0.7);
  p+=normalize(p+vec3(0.001))*wave*0.045;
  p.y+=sin(u_time*1.1)*0.025;
  float aspect=u_resolution.x/u_resolution.y;
  float fit=min(0.82,aspect*0.76);
  float perspective=2.8/(2.8-p.z);
  gl_Position=vec4(p.x*fit/aspect*perspective,p.y*fit*perspective,0.0,1.0);
  vec3 bone=vec3(0.83,0.84,0.76);
  vec3 gold=vec3(1.0,0.71,0.12);
  v_color=kind==2.0?vec3(1.0,0.21,0.12):(wing?gold:bone);
  v_alpha=kind==1.0?0.30:0.68;
  if(kind==4.0){v_color=vec3(0.51,0.90,0.85);v_alpha=0.12+0.65*pow(max(0.0,sin(seed*15.0-u_time*4.0)),12.0);}
  if(kind==5.0){v_color=vec3(0.56,1.0,0.87);v_alpha=0.9;}
  v_color=mix(v_color,vec3(0.8,1.0,0.94),wave*0.8);
  v_alpha+=wave*0.3;
  float size=kind==5.0?9.0:(kind==4.0?3.0:3.8);
  gl_PointSize=size*u_dpr*perspective;
  // Minimal scene: single fly and neural core. No synthetic society animation.
  if(group!=0.0||kind==6.0){gl_Position=vec4(3.0,3.0,0.0,1.0);gl_PointSize=1.0;}
}`;
const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
void main(){
 float d=length(gl_PointCoord-0.5)*2.0;
 if(d>1.0)discard;
 float glow=exp(-d*d*5.5);
 gl_FragColor=vec4(v_color,glow*v_alpha);
}`;

// Scheduling extracted for node-testable lifecycle verification. `api` supplies
// an `active()` predicate; the loop only re-arms the injected scheduler while
// active, so a paused/hidden/offscreen scene stops by design, not by luck.
export function createHeroLoop({ active, schedule, cancel, render, interval = 32 }) {
  let handle = null, last = 0, generation = 0, running = false;
  function stop() {
    generation++;
    if (handle !== null) cancel(handle);
    handle = null;
    running = false;
  }
  function sync(now = performance.now()) {
    stop();
    render(0);
    if (!active()) return;
    last = now;
    running = true;
    const epoch = generation;
    function frame(now) {
      if (epoch !== generation) return;
      handle = null;
      if (!active()) { running = false; return; }
      if (now - last >= interval) {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        render(dt);
      }
      if (epoch === generation && active()) handle = schedule(frame);
      else running = false;
    }
    handle = schedule(frame);
  }
  return { sync, stop, get running() { return running; } };
}

export function createHeroWebGL(canvas, read, onFailure) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL unavailable");
  const shaders = [],
    buffers = [];
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
  const data = createHeroParticles();
  const buffer = gl.createBuffer();
  buffers.push(buffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  for (const [name, offset] of [
    ["a_position", 0],
    ["a_meta", 12],
  ]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
  }
  const uniforms = Object.fromEntries(
    ["u_resolution", "u_pointer", "u_time", "u_hit", "u_dpr"].map((name) => [
      name,
      gl.getUniformLocation(program, name),
    ]),
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.clearColor(0, 0, 0, 0);
  let time = 0,
    hit = -100,
    width = 1,
    height = 1,
    dpr = 1,
    visible = true,
    lost = false;
  const pointer = [0, 0];
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  function draw() {
    if (lost) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform2f(uniforms.u_pointer, ...pointer);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_hit, time - hit);
    gl.uniform1f(uniforms.u_dpr, dpr);
    gl.drawArrays(gl.POINTS, 0, data.length / 6);
    canvas.dataset.drawCount = String(Number(canvas.dataset.drawCount || 0) + 1);
    canvas.dataset.animationTime = String(time);
    canvas.dataset.paused = String(read().paused);
  }
  const loop = createHeroLoop({
    active: () => !lost && !read().paused && !media.matches && visible && !document.hidden,
    schedule: requestAnimationFrame,
    cancel: cancelAnimationFrame,
    render(dt) { time += dt; draw(); },
  });
  function sync() { loop.sync(); }
  const resize = new ResizeObserver(([entry]) => {
    width = Math.max(1, entry.contentRect.width);
    height = Math.max(1, entry.contentRect.height);
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    sync();
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  const move = (e) => {
    const box = canvas.getBoundingClientRect();
    pointer[0] = (e.clientX - box.left) / width - 0.5;
    pointer[1] = (e.clientY - box.top) / height - 0.5;
  };
  const contextLost = (e) => {
    e.preventDefault();
    lost = true;
    loop.stop();
    onFailure();
  };
  resize.observe(canvas);
  observer.observe(canvas);
  media.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("webglcontextlost", contextLost);
  return {
    sync,
    stimulate() {
      if (read().paused) return false;
      hit = time - (media.matches ? 0.3 : 0);
      draw();
      return true;
    },
    destroy() {
      loop.stop();
      resize.disconnect();
      observer.disconnect();
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("webglcontextlost", contextLost);
      release();
    },
  };
}
