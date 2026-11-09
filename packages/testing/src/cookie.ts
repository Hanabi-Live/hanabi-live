// Test-only verification of the session cookies that the server signs.
import type { UserID } from "@hanabi-live/data";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "hanabi.sid";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Decodes a cookie in the form `{id}.{timestamp}.{signature}`. */
export function decodeSessionCookie(
  encoded: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): UserID | undefined {
  const match = /^(\d+)\.(\d+)\.([\w-]+)$/u.exec(encoded);
  if (match === null) {
    return undefined;
  }
  const [, idText, timestampText, signatureText] = match;
  if (
    idText === undefined
    || timestampText === undefined
    || signatureText === undefined
  ) {
    return undefined;
  }
  if (secret === "") {
    throw new Error("Missing session signing key.");
  }
  const expected = createHmac("sha256", secret)
    .update(`${SESSION_COOKIE_NAME}|${idText}.${timestampText}`)
    .digest();
  const actual = Buffer.from(signatureText, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return undefined;
  }
  const id = Number(idText);
  const timestamp = Number(timestampText);
  if (
    id < 1
    || id > 2_147_483_647
    || timestamp < now - SESSION_MAX_AGE_SECONDS
  ) {
    return undefined;
  }
  return id as UserID;
}
