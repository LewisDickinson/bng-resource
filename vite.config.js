import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// This is a multi-page app, not a single-page React app: the landing page is
// plain HTML/CSS/JS, and /simple and /detailed are each their own small React
// app. Vite builds each entry below into its own bundle, and Netlify serves
// the resulting folder structure directly — dist/index.html,
// dist/simple/index.html, dist/detailed/index.html — matching the landing
// page's ./simple/ and ./detailed/ links exactly.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        simple: resolve(__dirname, "simple/index.html"),
        detailed: resolve(__dirname, "detailed/index.html"),
        about: resolve(__dirname, "about/index.html"),
      },
    },
  },
});
