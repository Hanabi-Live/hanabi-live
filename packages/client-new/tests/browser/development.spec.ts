import type { APIResponse } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { backendProxy } from "../../vite.config";
import { expect, test } from "./fixture";

test(
  "Vite development entry uses the real backend session",
  { tag: "@audit" },
  async ({ browser, backend }) => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const server = await createServer({
      root,
      configFile: path.join(root, "vite.config.ts"),
      server: {
        host: "127.0.0.1",
        port: 0,
        proxy: backendProxy(backend),
      },
    });
    const context = await browser.newContext();
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (
        address === null
        || address === undefined
        || typeof address === "string"
      ) {
        throw new Error("Missing development listener");
      }
      const page = await context.newPage();
      const failedAssets: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failedAssets.push(response.url());
        }
      });
      await page.goto(`http://localhost:${address.port}/new/`);
      await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
      await page.getByLabel("Username", { exact: true }).fill("testUIDev");
      await page.getByLabel("Password", { exact: true }).fill("testUIDev");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page.locator("#lobby-games")).toBeVisible();
      await page.evaluate(async () => await globalThis.document.fonts.ready);
      expect(failedAssets).toEqual([]);
      const history: APIResponse<unknown> = await page.request.get(
        `http://localhost:${address.port}/api/v1/seed-full/missing-development-seed?size=10&page=0`,
      );
      expect(history.status()).toBe(200);
      const games: unknown = await history.json();
      expect(games).toEqual([]);
      const rejected: APIResponse<unknown> = await page.request.post(
        `http://localhost:${address.port}/login`,
        { headers: { Origin: "https://evil.invalid" }, data: {} },
      );
      expect(rejected.status()).toBe(403);
    } finally {
      try {
        await context.close();
      } finally {
        await server.close();
      }
    }
  },
);
