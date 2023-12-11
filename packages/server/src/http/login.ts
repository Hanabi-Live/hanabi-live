import { HTTPLoginDataSchema, PROJECT_NAME } from "@hanabi/data";
import {
  ReadonlySet,
  getNumConsecutiveDiacritics,
  hasEmoji,
  normalizeString,
  parseIntSafe,
} from "@hanabi/utils";
import * as argon2 from "argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { logger } from "../logger";
import { models } from "../models";
import { getClientVersion } from "../version";

const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 15;
const NUM_CONSECUTIVE_DIACRITICS_ALLOWED = 3;

const RESERVED_USERNAMES = new ReadonlySet([
  normalizeString(PROJECT_NAME),
  "hanab",
  "hanabi",
  "live",
  "hlive",
  "hanablive",
  "hanabilive",
  "nabilive",
]);

const WHITESPACE_REGEX = /\s/;

/**
 * Handles the first part of login authentication. The user must POST to "/login" with the values
 * from the `HTTPLoginData` interface. If successful, they will receive a cookie from the server
 * that is used to establish a WebSocket connection.
 *
 * The next step is found in "ws.ts".
 *
 * By allowing this function to run concurrently with no locking, there is a race condition where a
 * new user can login twice at the same time and a new user will be inserted into the database
 * twice. However, the UNIQUE SQL constraint on the "username" row and the "normalized_username" row
 * will prevent the 2nd insertion from completing.
 */
export async function httpLogin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = HTTPLoginDataSchema.safeParse(request.body);
  if (!result.success) {
    return reply.code(StatusCodes.UNAUTHORIZED).send(result.error);
  }

  const { username, password, version, newPassword } = result.data;

  const versionError = validateVersion(version);
  if (versionError !== undefined) {
    return reply.code(StatusCodes.UNAUTHORIZED).send(versionError);
  }

  const passwordHash = await argon2.hash(password);

  let user = await models.users.get(username);
  if (user === undefined) {
    const normalizedUsername = normalizeString(username);
    const newUserError = await validateNewUser(
      username,
      normalizedUsername,
      password,
      newPassword,
    );
    if (newUserError !== undefined) {
      return reply.code(StatusCodes.UNAUTHORIZED).send(newUserError);
    }

    const newUser = await models.users.create(
      username,
      normalizedUsername,
      passwordHash,
      request.ip,
    );
    if (newUser === undefined) {
      return reply
        .code(StatusCodes.INTERNAL_SERVER_ERROR)
        .send(
          `Failed to create a new user with a username of "${username}". Please try again.`,
        );
    }

    user = newUser;
  } else {
    if (passwordHash !== user.passwordHash) {
      return reply
        .code(StatusCodes.UNAUTHORIZED)
        .send("That is not the correct password.");
    }

    if (newPassword !== undefined && newPassword !== "") {
      const newPasswordHash = await argon2.hash(password);
      await models.users.setPassword(user.id, newPasswordHash);
    }
  }

  logger.info(`User "${user.username}" logged in from: ${request.ip}`);

  // Save the information to the session cookie.
  request.session.set("userID", user.id);

  // Return a "200 OK" HTTP code. (Returning a code is not actually necessary but Firefox will
  // complain otherwise.)
  return reply.code(StatusCodes.OK).send();

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

  const versionInt = parseIntSafe(version);
  if (versionInt === undefined) {
    return "The submitted version must be an integer.";
  }

  const clientVersion = getClientVersion();
  if (clientVersion !== versionInt) {
    return `You are running an outdated version of the client code.<br>(You are on <strong>v${version}</strong> and the latest is <strong>v${clientVersion}</strong>.)<br>Please perform a <a href="https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/">hard-refresh</a> to get the latest version.<br>(Note that a hard-refresh is different from a normal refresh.)<br>On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br>On MacOS, the hotkey for this is: <code>Command + Shift + R</code>`;
  }

  return undefined;
}

async function validateNewUser(
  username: string,
  normalizedUsername: string,
  password: string,
  newPassword: string | undefined,
): Promise<string | undefined> {
  const usernameHasWhitespace = WHITESPACE_REGEX.test(username);
  if (usernameHasWhitespace) {
    return "Usernames cannot contain any whitespace characters.";
  }

  if (username.length < MIN_USERNAME_LENGTH) {
    return `Usernames must be ${MIN_USERNAME_LENGTH} characters or more.`;
  }

  if (username.length > MAX_USERNAME_LENGTH) {
    return `Usernames must be ${MAX_USERNAME_LENGTH} characters or less.`;
  }

  if (username.includes("`~!@#$%^&*()=+[{]}\\|;:'\",<>/?")) {
    return "Usernames cannot contain any special characters other than hyphens, underscores, and periods.";
  }

  if (hasEmoji(username)) {
    return "Usernames cannot contain any emojis.";
  }

  if (
    getNumConsecutiveDiacritics(username) > NUM_CONSECUTIVE_DIACRITICS_ALLOWED
  ) {
    return `Usernames cannot contain ${NUM_CONSECUTIVE_DIACRITICS_ALLOWED} or more consecutive diacritics (i.e. accents).`;
  }

  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    return "That username is reserved. Please choose a different one.";
  }

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
  if (newPassword !== undefined) {
    return "You cannot create an account and change a password at the same time.";
  }

  return undefined;
}
