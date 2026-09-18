import { verifyGenesisAssets } from "./scripts/verify-life-genesis.mjs";
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["three"],
  },
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
        field: "field.html",
        habitat: "habitat.html",
        host: "host.html",
        colony: "colony.html",
        market: "market.html",
        live: "live.html",
        protocol: "protocol.html",
      },
    },
  },
  plugins: [
    {
      name: "verify-pinned-genesis",
      apply: "build",
      async buildStart() {
        const result = await verifyGenesisAssets();
        console.log(`Verified ${result.verifiedFiles} pinned genesis assets`);
      },
    },
  ],
});
