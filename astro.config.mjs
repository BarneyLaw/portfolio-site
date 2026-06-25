import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  // We manage images ourselves (sprite frames via import.meta.glob), so we
  // don't need sharp-based image optimization.
  image: {
    service: { entrypoint: "astro/assets/services/noop" },
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
