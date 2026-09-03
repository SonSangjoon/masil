import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MASIL_TEST_PORT ?? 4195);
const baseURL = process.env.MASIL_TEST_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/webmcp",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
      channel: "chromium",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.MASIL_TEST_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        // Never silently test another MASIL worktree that happens to own this port.
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
