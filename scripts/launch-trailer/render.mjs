#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../public");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/launch-trailer");
const FINAL = join(ROOT, "launch/immortal-fly-site-launch.mp4");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4177;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;
const DURATION = 30;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

const preview = process.argv.includes("--preview");
const PREVIEW_TIMES = [1.6, 6.4, 12.6, 18.4, 23.4, 28.0];

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const data = await readFile(file);
        res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("missing");
      }
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cdp(ws, method, params = {}, sessionId) {
  const id = cdp.nextId++;
  const payload = sessionId
    ? { id, method, params, sessionId }
    : { id, method, params };
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cdp.pending.delete(id);
      reject(new Error(`CDP timeout ${method}`));
    }, 30000);
    cdp.pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    });
  });
  ws.send(JSON.stringify(payload));
  return done;
}
cdp.nextId = 1;
cdp.pending = new Map();

async function connectChrome() {
  const userData = join(OUT_DIR, ".chrome-profile");
  await rm(userData, { recursive: true, force: true });
  await mkdir(userData, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=9223`,
      `--user-data-dir=${userData}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let chromeErr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeErr += chunk.toString();
  });
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json/version");
      if (res.ok) {
        const info = await res.json();
        return { chrome, wsUrl: info.webSocketDebuggerUrl };
      }
    } catch {}
    await wait(150);
  }
  chrome.kill();
  throw new Error(`Chrome debug port did not open. ${chromeErr.slice(-800)}`);
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const fn = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        fn(msg);
      }
    });
  });
}

async function ffmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await serve();
  const { chrome, wsUrl } = await connectChrome();
  const ws = await openSocket(wsUrl);
  try {
    const { targetId } = await cdp(ws, "Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp(ws, "Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const send = (method, params) => cdp(ws, method, params, sessionId);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/launch/?capture=1` });
    for (let i = 0; i < 80; i++) {
      const ready = await send("Runtime.evaluate", {
        expression: "window.__ready === true && document.fonts.status === 'loaded'",
        returnByValue: true,
      });
      if (ready.result.value) break;
      await wait(100);
    }
    await wait(200);

    const times = preview
      ? PREVIEW_TIMES
      : Array.from({ length: DURATION * FPS }, (_, i) => i / FPS);

    const framesDir = join(OUT_DIR, preview ? "preview" : "frames");
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      await send("Runtime.evaluate", {
        expression: `window.__seek(${t}); 1`,
      });
      const shot = await send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 92,
        captureBeyondViewport: false,
      });
      const name = preview ? `t-${t.toFixed(1).replace(".", "_")}.jpg` : String(i).padStart(5, "0") + ".jpg";
      await writeFile(join(framesDir, name), Buffer.from(shot.data, "base64"));
      if (!preview && i % 48 === 0) console.log(`captured ${i}/${times.length}`);
    }

    if (preview) {
      console.log(`preview frames → ${framesDir}`);
      return;
    }

    const audio = join(OUT_DIR, "bed.wav");
    await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=58:sample_rate=44100:duration=${DURATION}`,
      "-f",
      "lavfi",
      "-i",
      `anoisesrc=color=brown:amplitude=0.035:sample_rate=44100:duration=${DURATION}`,
      "-filter_complex",
      "[0:a]volume=0.045[a1];[1:a]highpass=f=180,lowpass=f=2400,volume=0.09[a2];[a1][a2]amix=inputs=2:duration=first,afade=t=in:st=0:d=1.5,afade=t=out:st=28.2:d=1.7[a]",
      "-map",
      "[a]",
      audio,
    ]);

    const tmp = join(OUT_DIR, "immortal-fly-site-launch.mp4");
    await ffmpeg([
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      join(framesDir, "%05d.jpg"),
      "-i",
      audio,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "17",
      "-preset",
      "medium",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      tmp,
    ]);
    await writeFile(FINAL, await readFile(tmp));
    console.log(`wrote ${FINAL}`);
  } finally {
    ws.close();
    chrome.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
