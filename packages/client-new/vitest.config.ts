import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config.ts";

export default mergeConfig(
  vite({ command: "serve", mode: "test" }),
  defineConfig({
    test: {
      include: ["tests/*.test.{ts,tsx}"],
      environment: "node",
      restoreMocks: true,
    },
  }),
);
