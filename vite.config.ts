import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works from any path (GitHub Pages, file server, USB stick).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
