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
    await page.goto(`http://localhost:${address.port}/new/`);
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
    await page.getByLabel("Username", { exact: true }).fill("testUIDev");
    await page.getByLabel("Password", { exact: true }).fill("testUIDev");
    await page.getByRole("button", { name: "Take a seat" }).click();
    await expect(
      page.getByRole("heading", { name: "Find your next table." }),
    ).toBeVisible();
  } finally {
    try {
      await context.close();
    } finally {
      await server.close();
    }
  }
});
