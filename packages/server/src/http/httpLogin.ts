import { httpLoginData, PROJECT_NAME } from "@hanabi-live/data";
import * as argon2 from "argon2";
import { ReadonlySet } from "complete-common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { createHash, timingSafeEqual } from "node:crypto";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "../constants";
import { setCookieValue } from "../httpSession";
import { logger } from "../logger";
import { models } from "../models";
import {
  getMaxConsecutiveMarks,
  hasUsernameEmoji,
  normalizeString,
  normalizeUsername,
  trimUnicodeWhitespace,
} from "../utils";
import { getClientVersion } from "../version";

const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 15;

/** Every special character other than hyphens, underscores, and periods. */
const ILLEGAL_SPECIAL_CHARACTERS = [
  "`",
  "~",
  "!", // 1
  "@", // 2
  "#", // 3
  "$", // 4
  "%", // 5
  "^", // 6
  "&", // 7
  "*", // 8
  "(", // 9
  ")", // 0
  // Hyphens and underscores are exempt.
  "=",
  "+",
  "[",
  "{",
  "]",
  "}",
  "\\",
  "|",
  ";",
  ":",
  "'",
  '"',
  ",",
  "<",
  // Periods are exempt.
  ">",
  "/",
  "?",
] as const;

const RESERVED_USERNAMES = new ReadonlySet([
  "hanab",
  "hanabi",
  "hanabilive",
  "hanablive",
  "hlive",
  "live",
  "nabilive",
  normalizeUsername(PROJECT_NAME),
]);

/**
 * Handles the first part of login authentication. (The second step is found in "ws.ts".)
 *
 * The user must POST to "/login" with the values from the `HTTPLoginData` interface. If successful,
 * they will receive a cookie from the server that is used to establish a WebSocket connection.
 *
 * By allowing this function to run concurrently with no locking, there is a race condition where a
 * new user can login twice at the same time, causing two database inserts at the same time.
 * However, the UNIQUE SQL constraint on the "username" row and the "normalized_username" row will
 * prevent the 2nd insertion from completing.
 */
export async function httpLogin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = httpLoginData.safeParse(request.body);
  if (!result.success) {
    const missing = ["username", "password", "version"].find((field) =>
      result.error.issues.some((issue) => issue.path[0] === field),
    );
    return await reply
      .code(StatusCodes.UNAUTHORIZED)
      .send(
        missing === undefined
          ? "Invalid login parameters."
          : `You must provide the "${missing}" parameter to log in.`,
      );
  }

  const { password, version, newPassword } = result.data;
  const username = trimUnicodeWhitespace(result.data.username);
  const normalizedUsername = normalizeString(username);
  const usernameError = validateUsername(username, normalizedUsername);
  if (usernameError !== undefined) {
    return await reply.code(StatusCodes.UNAUTHORIZED).send(usernameError);
  }

  const versionError = validateVersion(version);
  if (versionError !== undefined) {
    return await reply.code(StatusCodes.UNAUTHORIZED).send(versionError);
  }

  let user = await models.users.get(username);
  if (user === undefined) {
    const newUserError = await validateNewUser(
      normalizedUsername,
      password,
      newPassword,
    );
    if (newUserError !== undefined) {
      return await reply.code(StatusCodes.UNAUTHORIZED).send(newUserError);
    }

    const passwordHash = await argon2.hash(password);
    const newUser = await models.users.create(
      username,
      normalizedUsername,
      passwordHash,
      request.ip,
    );
    if (newUser === undefined) {
      return await reply
        .code(StatusCodes.INTERNAL_SERVER_ERROR)
        .send(
          `Failed to create a new user with a username of "${username}". Please try again.`,
        );
    }

    user = newUser;
  } else {
    const isLegacy = user.oldPasswordHash !== null;
    const isValidPassword = await passwordMatches(
      password,
      user.passwordHash,
      user.oldPasswordHash,
    );
    if (!isValidPassword) {
      return await reply
        .code(StatusCodes.UNAUTHORIZED)
        .send("That is not the correct password.");
    }

    // Password changes are handled by the same time as normal logins. `newPassword` will be
    // undefined in situations where users are logging in and not changing their password.
    if (isLegacy || (newPassword !== undefined && newPassword !== "")) {
      const newPasswordHash = await argon2.hash(
        newPassword === undefined || newPassword === ""
          ? password
          : newPassword,
      );
      await models.users.setPassword(user.id, newPasswordHash);
    }
  }

  logger.info(`User "${user.username}" logged in from: ${request.ip}`);

  // Save the information to the session cookie.
  setCookieValue(request, "userID", user.id);

  // Return a "200 OK" HTTP code. (Returning a code is not actually necessary but Firefox will
  // complain otherwise.)
  return await reply.send("OK\n");

  // Next, the client will attempt to establish a WebSocket connection, which is handled in
  // "websocket.ts".
}

/**
 * We want to explicitly disallow clients who are running old versions of the code. But we make an
 * exception for bots, who can just use the string of "bot".
 */
function validateVersion(version: string): string | undefined {
  if (version === "bot") {
    return undefined;
  }

  const versionInt = Number(version);
  if (!/^[+-]?\d+$/u.test(version) || !Number.isSafeInteger(versionInt)) {
    return "The submitted version must be an integer.";
  }

  const clientVersion = getClientVersion();
  if (clientVersion !== versionInt) {
    return `You are running an outdated version of the client code.<br>(You are on <strong>v${version}</strong> and the latest is <strong>v${clientVersion}</strong>.)<br>Please perform a <a href="https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/">hard-refresh</a> to get the latest version.<br>(Note that a hard-refresh is different from a normal refresh.)<br>On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br>On MacOS, the hotkey for this is: <code>Command + Shift + R</code>`;
  }

  return undefined;
}

function validateUsername(
  username: string,
  normalizedUsername: string,
): string | undefined {
  if (/\p{White_Space}/u.test(username)) {
    return "Usernames cannot contain any whitespace characters.";
  }

  if (Buffer.byteLength(username) < MIN_USERNAME_LENGTH) {
    return `Usernames must be ${MIN_USERNAME_LENGTH} characters or more.`;
  }

  if (Buffer.byteLength(username) > MAX_USERNAME_LENGTH) {
    return `Usernames must be ${MAX_USERNAME_LENGTH} characters or less.`;
  }

  const hasIllegalCharacters = ILLEGAL_SPECIAL_CHARACTERS.some((char) =>
    username.includes(char),
  );
  if (hasIllegalCharacters) {
    return "Usernames cannot contain any special characters other than underscores, hyphens, and periods.";
  }

  if (hasUsernameEmoji(username)) {
    return "Usernames cannot contain any emojis.";
  }

  if (getMaxConsecutiveMarks(username) > NUM_CONSECUTIVE_DIACRITICS_ALLOWED) {
    return "Usernames cannot contain two or more consecutive diacritics.";
  }

  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    return "That username is reserved. Please choose a different one.";
  }
  return undefined;
}

async function validateNewUser(
  normalizedUsername: string,
  password: string,
  newPassword: string | undefined,
): Promise<string | undefined> {
  // At this point, the normal username is longer than `MIN_USERNAME_LENGTH`, so if the normalized
  // username is blank, then it is a transliteration issue.
  if (normalizedUsername === "") {
    return "That username cannot be transliterated to ASCII. Please try using a simpler username or try using less special characters.";
  }

  const similarUsername =
    await models.users.getSimilarUsername(normalizedUsername);
  if (similarUsername !== undefined) {
    return `That username is too similar to the existing user of "${similarUsername}". If you are sure that this is your username, then please check to make sure that you are capitalized your username correctly. If you are logging in for the first time, then please choose a different username.`;
  }

  // Validate that the password is non-empty.
  if (password === "") {
    return "You cannot create an account with an empty password.";
  }

  // Validate that they are not changing their password.
  if (newPassword !== undefined && newPassword !== "") {
    return "You cannot create an account and change a password at the same time.";
  }

  return undefined;
}

async function passwordMatches(
  password: string,
  hash: string | null,
  legacyHash: string | null,
): Promise<boolean> {
  if (legacyHash !== null) {
    return legacyPasswordMatches(password, legacyHash);
  }
  if (hash === null) {
    throw new Error("The account has no usable password hash.");
  }
  return await argon2.verify(hash, password);
}

function legacyPasswordMatches(password: string, expected: string): boolean {
  const digest = createHash("sha256")
    .update(`Hanabi password ${password}`)
    .digest("hex");
  const actualBytes = Buffer.from(digest);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
  );
}
