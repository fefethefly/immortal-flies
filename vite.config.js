import { rmSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
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

