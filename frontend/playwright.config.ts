import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1024 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: [
    {
      command: "node tests/mock-api.mjs",
      url: "http://localhost:3101/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100/login",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_URL: "http://localhost:3101",
        NEXT_PUBLIC_API_URL: "http://localhost:3101",
        NEXT_PUBLIC_NETWORK: "TESTNET",
      },
    },
  ],
});
