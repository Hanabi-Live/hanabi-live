import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { logger } from "../logger";

/**
 * This handles part 1 of 2 for login authentication. The user must POST to "/login" with the values
 * of "username", "password", and "version". If successful, they will receive a cookie from the
 * server with an expiry of N seconds.
 *
 * Part 2 is found in "ws.ts".
 *
 * By allowing this function to run concurrently with no locking, there is a race condition where a
 * new user can login twice at the same time and "models.Users.Insert()" will be called twice.
 * However, the UNIQUE SQL constraint on the "username" row and the "normalized_username" row will
 * prevent the 2nd insertion from completing, and the second goroutine will return at that point.
 */
export function httpLogin(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  validate(request);

  const user = {
    username: "alice",
  };

  logger.info(`User "${user.username}" logged in from: ${request.ip}`);

  // Return a "200 OK" HTTP code. (Returning a code is not actually necessary but Firefox will
  // complain otherwise.)
  request.session.set("LOGGED IN", true);
  return reply.code(StatusCodes.OK).send();
}

function validate(_request: FastifyRequest) {
  // TODO
  logger.info(_request.body);
}

/*

func httpLoginValidate(c *gin.Context) (*HTTPLoginData, bool) {
	// Validate that the user sent the required POST values
	username := c.PostForm("username")
	if username == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"username\" parameter.")
		http.Error(
			w,
			"You must provide the \"username\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}
	password := c.PostForm("password")
	if password == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"password\" parameter.")
		http.Error(
			w,
			"You must provide the \"password\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}
	newPassword := c.PostForm("newPassword")
	version := c.PostForm("version")
	if version == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"version\" parameter.")
		http.Error(
			w,
			"You must provide the \"version\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Trim whitespace from both sides
	username = strings.TrimSpace(username)

	// Validate that the username does not contain any whitespace
	for _, letter := range username {
		if unicode.IsSpace(letter) {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\", but it contained whitespace.")
			http.Error(
				w,
				"Usernames cannot contain any whitespace characters.",
				http.StatusUnauthorized,
			)
			return nil, false
		}
	}

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
