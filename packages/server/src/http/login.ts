import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { HTTPLoginDataSchema } from "../interfaces/HTTPLoginData";
import { logger } from "../logger";

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
export function httpLogin(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const errorReply = validate(request, reply);
  if (errorReply) {
    return errorReply;
  }

  const user = {
    username: "alice",
  };

  logger.info(`User "${user.username}" logged in from: ${request.ip}`);

  // Return a "200 OK" HTTP code. (Returning a code is not actually necessary but Firefox will
  // complain otherwise.)
  request.session.set("LOGGED IN", true);
  return reply.code(StatusCodes.OK).send();
}

function validate(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply | undefined {
  const data = HTTPLoginDataSchema.parse(request.body);
  logger.info(data);

  const usernameHasWhitespace = WHITESPACE_REGEX.test(data.username);
  if (usernameHasWhitespace) {
    logger.info(`IP "${request.ip}" tried to log in, but they are banned.`);
    return reply
      .code(StatusCodes.UNAUTHORIZED)
      .send("Usernames cannot contain any whitespace characters.");
  }

  // TODO

  return undefined;
}

/*

func httpLoginValidate(c *gin.Context) (*HTTPLoginData, bool) {
	// Validate that the username is not excessively short
	if len(username) < MinUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is shorter than " + str.IToA(MinUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+str.IToA(MinUsernameLength)+" characters or more.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username is not excessively long
	if len(username) > MaxUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is longer than " + str.IToA(MaxUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+str.IToA(MaxUsernameLength)+" characters or less.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any special characters in it
	// (other than underscores, hyphens, and periods)
	if strings.ContainsAny(username, "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?") {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has illegal special characters in it.")
		http.Error(
			w,
			"Usernames cannot contain any special characters other than underscores, hyphens, and periods.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any emojis in it
	if match := emojiRegExp.FindStringSubMatch(username); match != nil {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has emojis in it.")
		http.Error(
			w,
			"Usernames cannot contain any emojis.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if numConsecutiveDiacritics(username) > ConsecutiveDiacriticsAllowed {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has " + str.IToA(ConsecutiveDiacriticsAllowed) +
			" or more consecutive diacritics in it.")
		http.Error(
			w,
			"Usernames cannot contain two or more consecutive diacritics.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username is not reserved
	normalizedUsername := normalizeString(username)
	if normalizedUsername == normalizeString(WebsiteName) ||
		normalizedUsername == "hanab" ||
		normalizedUsername == "hanabi" ||
		normalizedUsername == "live" ||
		normalizedUsername == "hlive" ||
		normalizedUsername == "hanablive" ||
		normalizedUsername == "hanabilive" ||
		normalizedUsername == "nabilive" {

		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but that username is reserved.")
		http.Error(
			w,
			"That username is reserved. Please choose a different one.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the version is correct
	// We want to explicitly disallow clients who are running old versions of the code
	// But make an exception for bots, who can just use the string of "bot"
	if version != "bot" {
		var versionNum int
		if v, err := str.AtoI(version); err != nil {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\", but the submitted version is not an integer.")
			http.Error(
				w,
				"The submitted version must be an integer.",
				http.StatusUnauthorized,
			)
			return nil, false
		} else {
			versionNum = v
		}
		currentVersion := getVersion()
		if versionNum != currentVersion {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\" and a version of \"" + version + "\", " +
				"but this is an old version. " +
				"(The current version is " + str.IToA(currentVersion) + ".)")
			http.Error(
				w,
				"You are running an outdated version of the client code.<br />"+
					"(You are on <strong>v"+version+"</strong> and "+
					"the latest is <strong>v"+str.IToA(currentVersion)+"</strong>.)<br />"+
					"Please perform a "+
					"<a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">"+
					"hard-refresh</a> to get the latest version.<br />"+
					"(Note that a hard-refresh is different from a normal refresh.)<br />"+
					"On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />"+
					"On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
				http.StatusUnauthorized,
			)
			return nil, false
		}
	}

	data := &HTTPLoginData{
		IP:                 ip,
		Username:           username,
		Password:           password,
		NewPassword:        newPassword,
		NormalizedUsername: normalizedUsername,
	}
	return data, true
}

*/
