import { defineConfig } from "vite";

// A GitHub Pages project site is served from /<repository>/, so the base is set at build time.
// An empty value means the site is at the root — `||` rather than `??` because the Pages action
// reports a user site as an empty string.
export default defineConfig({
  base: process.env["VITE_BASE"] || "/",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
