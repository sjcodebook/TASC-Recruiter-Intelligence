import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: { OPENAI_API_KEY: "test-openai-key" },
    coverage: { reporter: ["text", "json"] }
  }
});
