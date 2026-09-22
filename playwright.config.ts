import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

/**
 * Headless Chromium has no GPU, so WebGL is only available through its software rasteriser —
 * which recent versions require to be asked for by name.
 */
const softwareRendering = { args: ["--enable-unsafe-swiftshader"] };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] === undefined ? 0 : 2,
  // Software WebGL crashes the page when several browsers render at once, so run in series.
  workers: 1,
  reporter:
    process.env["CI"] === undefined
      ? [["list"]]
      : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: softwareRendering,
  },

  projects: [
    {
      name: "desktop",
      testMatch: "viewer.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: "mobile.spec.ts",
      // A phone viewport with touch, which is what the layout and gesture split key off.
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
