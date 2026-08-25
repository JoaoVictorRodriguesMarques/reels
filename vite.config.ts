import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  cloudflare: false,
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
      }),
    ],
  },
  tanstackStart: {
    server: {
      entry: "server",
    },
  },
});
