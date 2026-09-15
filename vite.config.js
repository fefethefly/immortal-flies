import { rmSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/ready": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        altar: "altar.html",
        economy: "economy.html",
        brain: "brain.html",
        swarm: "swarm.html",
        blueprint: "blueprint.html",
      },
    },
  },
  plugins: [
    {
      name: "omit-full-connectome",
      closeBundle() {
        rmSync("dist/data/malecns-full", { recursive: true, force: true });
      },
    },
  ],
});
