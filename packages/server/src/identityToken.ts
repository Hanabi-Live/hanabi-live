import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";
import { env } from "./env";
import { models } from "./models";

const IDENTITY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const IDENTITY_TOKEN_NUM_BYTES = 24;
const IDENTITY_TOKEN_NONCE_BYTES = 12;

interface RegeneratedIdentityToken {
  readonly token: string;
  readonly tokenEncrypted: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

function getIdentityTokenKey(): Buffer {
  return createHash("sha256").update(env.SESSION_SECRET).digest();
}

export function identityTokenIsExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

function identityTokenGenerate(): string {
  return randomBytes(IDENTITY_TOKEN_NUM_BYTES).toString("base64url");
}

export function identityTokenHash(token: string): string {
  return createHmac("sha256", getIdentityTokenKey()).update(token).digest("hex");
}

function identityTokenEncrypt(token: string): string {
  const key = getIdentityTokenKey();
  const nonce = randomBytes(IDENTITY_TOKEN_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]).toString("base64url");
}

export function identityTokenDecrypt(tokenEncrypted: string): string {
  const payload = Buffer.from(tokenEncrypted, "base64url");
  if (payload.length <= IDENTITY_TOKEN_NONCE_BYTES + 16) {
    throw new Error("Identity token payload is too short.");
  }

  const nonce = payload.subarray(0, IDENTITY_TOKEN_NONCE_BYTES);
  const tag = payload.subarray(IDENTITY_TOKEN_NONCE_BYTES, IDENTITY_TOKEN_NONCE_BYTES + 16);
  const ciphertext = payload.subarray(IDENTITY_TOKEN_NONCE_BYTES + 16);

  const decipher = createDecipheriv("aes-256-gcm", getIdentityTokenKey(), nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export async function identityTokenRegenerate(
  userID: number,
): Promise<RegeneratedIdentityToken> {
  const token = identityTokenGenerate();
  const tokenEncrypted = identityTokenEncrypt(token);
  const tokenHash = identityTokenHash(token);
  const expiresAt = new Date(Date.now() + IDENTITY_TOKEN_TTL_MS);
  await models.userIdentityTokens.upsert(userID, tokenEncrypted, tokenHash, expiresAt);
  return {
    token,
    tokenEncrypted,
    tokenHash,
    expiresAt,
  };
}
