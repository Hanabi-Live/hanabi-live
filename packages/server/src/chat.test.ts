import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { WebSocket } from "ws";
import { z } from "zod";
import { validateAndNormalizeChatMsg } from "./chat";
import { wsWarning } from "./wsHelpers";

jest.mock("./models", () => ({ models: {} }));
jest.mock("./wsHelpers", () => ({
  wsWarning: jest.fn(),
}));

const fixturePath = path.resolve(
  __dirname,
  "../../../server/src/testdata/chat_protocol.json",
);
const corpus = z
  .array(
    z.strictObject({
      name: z.string(),
      input: z.string(),
      normalized: z.string(),
      valid: z.boolean(),
    }),
  )
  .parse(JSON.parse(readFileSync(fixturePath, "utf8")));

describe("Go chat input compatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(corpus)("$name", ({ input, normalized, valid }) => {
    const result = validateAndNormalizeChatMsg({} as WebSocket, input);
    expect(result).toBe(valid ? normalized : undefined);
    expect(wsWarning).toHaveBeenCalledTimes(valid ? 0 : 1);
  });
});
