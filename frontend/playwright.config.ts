import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "frontend.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3200",
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
      url: "http://localhost:3201/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3200",
      url: "http://localhost:3200/login",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_URL: "http://localhost:3201",
        NEXT_PUBLIC_API_URL: "http://localhost:3201",
        NEXT_PUBLIC_NETWORK: "TESTNET",
        // Process env wins over .env.local in Next.js. Without this override, a dev machine
        // with the Firebase emulator configured for local work (see frontend/.env.local) leaks
        // into this isolated suite: the login form's real signInWithEmailAndPassword() call
        // targets 127.0.0.1:9099 instead of identitytoolkit.googleapis.com, so the test's
        // page.route() mock on that domain never intercepts it and the call just fails.
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "",
        FIREBASE_AUTH_EMULATOR_HOST: "",
      },
    },
  ],
});
