import { createHmac, createHash, randomBytes } from "node:crypto";
import { env } from "./env";
import { models } from "./models";

const IDENTITY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const IDENTITY_TOKEN_NUM_BYTES = 96; // 96 raw bytes encode to 128 base64url characters.
interface RegeneratedIdentityToken {
  readonly token: string;
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

export async function identityTokenRegenerate(
  userID: number,
): Promise<RegeneratedIdentityToken> {
  const token = identityTokenGenerate();
  const tokenHash = identityTokenHash(token);
  const expiresAt = new Date(Date.now() + IDENTITY_TOKEN_TTL_MS);
  await models.userIdentityTokens.upsert(userID, tokenHash, expiresAt);
  return {
    token,
    tokenHash,
    expiresAt,
  };
}
