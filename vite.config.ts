import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createAiHandler } from "./server/ai.ts";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "idbuild-local-ai",
      configureServer(server) {
        server.middlewares.use(createAiHandler());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createAiHandler());
      },
    },
  ],
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: {
    rollupOptions: { input: { main: "index.html", verify: "verify.html" } },
  },
});
