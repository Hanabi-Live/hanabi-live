import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { expect, test } from "./fixture";

test("Vite development entry uses the real backend session", async ({
  browser,
  backend,
}, info) => {
  test.skip(
    info.project.name !== "go",
    "One development-proxy check is sufficient.",
  );
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/login": backend,
        "/logout": backend,
        "/test-cookie": backend,
        "/public": backend,
        "/game": backend,
        "/ws": { target: backend.replace("http:", "ws:"), ws: true },
      },
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
  } finally {
    try {
      await context.close();
    } finally {
      await server.close();
    }
  }
});
