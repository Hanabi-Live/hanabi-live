// Test-only verification of the legacy-compatible cookies issued by the server.
import type { UserID } from "@hanabi-live/data";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "hanabi.sid";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function requireCookie(valid: boolean): asserts valid {
  if (!valid) {
    throw new SyntaxError("Malformed session cookie.");
  }
}

class GobReader {
  private offset = 0;
  private readonly data: Buffer;

  constructor(data: Buffer) {
    this.data = data;
  }

  private byte(): number {
    const value = this.data[this.offset];
    requireCookie(value !== undefined);
    this.offset++;
    return value;
  }

  unsigned(): number {
    const first = this.byte();
    if (first < 128) {
      return first;
    }
    const count = 256 - first;
    requireCookie(count <= 8);
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = value * 256 + this.byte();
      requireCookie(Number.isSafeInteger(value));
    }
    return value;
  }

  signed(): number {
    const value = this.unsigned();
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
  }

  private bytes(): Buffer {
    const length = this.unsigned();
    requireCookie(length <= this.data.length - this.offset);
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  frame(): GobReader {
    return new GobReader(this.bytes());
  }

  text(): string {
    return this.bytes().toString("utf8");
  }

  expect(bytes: readonly number[]): void {
    for (const byte of bytes) {
      requireCookie(this.byte() === byte);
    }
  }

  end(): void {
    requireCookie(this.offset === this.data.length);
  }
}

function decodeUserID(payload: Buffer): UserID {
  const stream = new GobReader(payload);
  const definition = stream.frame();
  const mapType = -definition.signed();
  requireCookie(mapType >= 64);
  // Go's map[interface{}]interface{} type declaration; type IDs can vary by process.
  definition.expect([4, 1, 2]);
  requireCookie(definition.signed() === mapType);
  definition.expect([0, 1, 16, 1, 16, 0, 0]);
  definition.end();

  const values = stream.frame();
  requireCookie(values.signed() === mapType);
  values.expect([0, 1]); // A scalar map containing exactly one entry.
  requireCookie(values.text() === "string" && values.signed() === 6);
  const key = values.frame();
  key.expect([0]);
  requireCookie(key.text() === "userID");
  key.end();
  requireCookie(values.text() === "int" && values.signed() === 2);
  const number = values.frame();
  number.expect([0]);
  const id = number.signed();
  number.end();
  values.end();
  stream.end();
  requireCookie(id > 0 && id <= 2_147_483_647);
  return id as UserID;
}

function base64(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_");
}

function decodeBase64(value: string): Buffer | undefined {
  if (value.length % 4 !== 0 || !/^[\w-]*={0,2}$/u.test(value)) {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64url");
  return base64(decoded) === value ? decoded : undefined;
}

function signature(secret: string, value: string | Buffer): Buffer {
  if (secret === "") {
    throw new Error("Missing session signing key.");
  }
  return createHmac("sha256", secret)
    .update(`${SESSION_COOKIE_NAME}|`)
    .update(value)
    .digest();
}

/** Decode only the server's signed userID map, not arbitrary gob objects. */
export function decodeSessionCookie(
  encoded: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): UserID | undefined {
  if (encoded.length > 4096) {
    return undefined;
  }
  const envelope = decodeBase64(encoded);
  if (envelope === undefined) {
    return undefined;
  }
  const first = envelope.indexOf("|");
  const second = envelope.indexOf("|", first + 1);
  if (first < 1 || second < first + 2) {
    return undefined;
  }
  const message = envelope.subarray(0, second);
  const actual = envelope.subarray(second + 1);
  const expected = signature(secret, message);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return undefined;
  }
  const timestampText = envelope.subarray(0, first).toString("utf8");
  const timestamp = Number(timestampText);
  if (
    !/^\d+$/u.test(timestampText)
    || !Number.isSafeInteger(timestamp)
    || timestamp < now - SESSION_MAX_AGE_SECONDS
  ) {
    return undefined;
  }
  const payload = decodeBase64(
    envelope.subarray(first + 1, second).toString("utf8"),
  );
  if (payload === undefined) {
    return undefined;
  }
  try {
    return decodeUserID(payload);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return undefined;
  }
}
