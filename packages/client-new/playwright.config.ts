import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/globalSetup.ts",
  timeout: 60_000,
  fullyParallel: true,
  workers: 2,
  use: {
    browserName: "chromium",
    // Keep game sounds from playing on the machine running the tests.
    launchOptions: { args: ["--mute-audio"] },
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  projects: [{ name: "rust" }],
});
