import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tmp",
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: [["json", { outputFile: process.env.PW_JSON_REPORT || "./tmp/report.json" }]]
});
