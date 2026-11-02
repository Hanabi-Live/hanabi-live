import type { UserID } from "@hanabi-live/data";
import { describe, expect, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  decodeSessionCookie,
  encodeSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./sessionCookie";

const filename = path.resolve(
  __dirname,
  "../../../server/src/testdata/session_protocol.json",
);
const sampleSchema = z.strictObject({
  userID: z.number().int(),
  timestamp: z.number().int(),
  cookie: z.string(),
});
const corpusSchema = z.strictObject({
  key: z.string(),
  samples: z.array(sampleSchema),
});
const corpus = corpusSchema.parse(JSON.parse(readFileSync(filename, "utf8")));

function encoded(buffer: Buffer): string {
  return buffer
    .toString("base64url")
    .padEnd(Math.ceil(buffer.length / 3) * 4, "=");
}

function signedPayload(
  payload: Buffer,
  timestamp: number,
  name = SESSION_COOKIE_NAME,
) {
  const message = `${timestamp}|${encoded(payload)}`;
  const mac = createHmac("sha256", corpus.key)
    .update(`${name}|${message}`)
    .digest();
  return encoded(Buffer.concat([Buffer.from(`${message}|`), mac]));
}

describe("Go session cookie compatibility", () => {
  test.each(corpus.samples)(
    "authenticates and reproduces Go's cookie for $userID",
    (sample) => {
      expect(
        decodeSessionCookie(sample.cookie, corpus.key, sample.timestamp),
      ).toBe(sample.userID);
      expect(
        encodeSessionCookie(
          sample.userID as UserID,
          corpus.key,
          sample.timestamp,
        ),
      ).toBe(sample.cookie);
    },
  );

  test("rejects tampering and a different signing key without decoding a session", () => {
    const cookie = encodeSessionCookie(42 as UserID, corpus.key, 1000);
    const envelope = Buffer.from(cookie, "base64url");
    envelope[0] = 0xb1; // Changing raw timestamp bytes must not survive ASCII decoding.
    expect(
      decodeSessionCookie(encoded(envelope), corpus.key, 1000),
    ).toBeUndefined();
    expect(
      decodeSessionCookie(cookie, `${corpus.key}-wrong`, 1000),
    ).toBeUndefined();
    const changedMAC = Buffer.from(cookie, "base64url");
    const last = changedMAC.length - 1;
    const lastByte = changedMAC[last];
    assertDefined(lastByte, "Missing synthetic signature.");
    changedMAC[last] = (lastByte + 1) % 256;
    expect(
      decodeSessionCookie(encoded(changedMAC), corpus.key, 1000),
    ).toBeUndefined();
  });

  test("matches Go's one-year expiration boundary", () => {
    const cookie = encodeSessionCookie(42 as UserID, corpus.key, 1000);
    expect(
      decodeSessionCookie(cookie, corpus.key, 1000 + SESSION_MAX_AGE_SECONDS),
    ).toBe(42);
    expect(
      decodeSessionCookie(cookie, corpus.key, 1001 + SESSION_MAX_AGE_SECONDS),
    ).toBeUndefined();
  });

  test("rejects malformed or wrong-name payloads even with an authentic MAC", () => {
    const cookie = encodeSessionCookie(42 as UserID, corpus.key, 1000);
    const envelope = Buffer.from(cookie, "base64url");
    const start = envelope.indexOf("|") + 1;
    const end = envelope.indexOf("|", start);
    const payload = Buffer.from(
      envelope.subarray(start, end).toString(),
      "base64url",
    );
    const trailing = Buffer.concat([payload, Buffer.from([0])]);
    expect(
      decodeSessionCookie(signedPayload(trailing, 1000), corpus.key, 1000),
    ).toBeUndefined();
    expect(
      decodeSessionCookie(
        signedPayload(payload, 1000, "another-cookie"),
        corpus.key,
        1000,
      ),
    ).toBeUndefined();
    const invalidLength = Buffer.from(payload);
    invalidLength[0] = 127;
    expect(
      decodeSessionCookie(signedPayload(invalidLength, 1000), corpus.key, 1000),
    ).toBeUndefined();
    expect(decodeSessionCookie(`${cookie}!`, corpus.key, 1000)).toBeUndefined();
    expect(
      decodeSessionCookie("x".repeat(4097), corpus.key, 1000),
    ).toBeUndefined();
  });

  test.each([0, -1, 1.5, 2_147_483_648])(
    "refuses to issue an invalid database user ID %s",
    (id) => {
      expect(() => encodeSessionCookie(id as UserID, corpus.key, 1000)).toThrow(
        "Invalid session user ID",
      );
    },
  );
});
