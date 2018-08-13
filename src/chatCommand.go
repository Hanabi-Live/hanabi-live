package main

import (
	"strings"
)

func chatHelp(s *Session, d *CommandData) {
	if d.Discord {
		msg := "General commands:\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "----------------------------------------------------------------------------------\n"
		msg += "/here                 Ping online people to try and get people together for a game\n"
		msg += "/last                 See how long it has been since the last ping\n"
		msg += "/next                 Put yourself on the waiting list\n"
		msg += "/unnext               Take yourself off the waiting list\n"
		msg += "/list                 Show the people on the waiting list\n"
		msg += "/random [min] [max]   Get a random number\n"
		msg += "/rand [min] [max]     Get a random number\n"
		msg += "```\n"
		msg += "Admin-only commands (from the lobby only):\n"
		msg += "```\n"
		msg += "Command               Description\n"
		msg += "----------------------------------------------------------------------------------\n"
		msg += "/restart              Restart the server\n"
		msg += "/graceful             Gracefully restart the server\n"
		msg += "/debug                Print out some server-side info\n"
		msg += "```"
		discordSend(discordLobbyChannel, "", msg)
	} else {
		msg := "You can see the full list of commands here: https://github.com/Zamiell/hanabi-live/blob/master/src/chatCommand.go"
		chatServerSend(msg)
	}
}

func commandChatCommand(s *Session, d *CommandData) {
	// All commands start with a forward slash
	if !strings.HasPrefix(d.Msg, "/") {
		return
	}

	// First, check for commands that will work either in the lobby or from Discord
	if d.Msg == "/help" || d.Msg == "/commands" || d.Msg == "/?" {
		chatHelp(s, d)
		return
	} else if d.Msg == "/here" {
		chatHere(s, d)
		return
	} else if d.Msg == "/last" {
		chatLast()
		return
	} else if d.Msg == "/next" {
		waitingListAdd(s, d)
		return
	} else if d.Msg == "/unnext" {
		waitingListRemove(s, d)
		return
	} else if d.Msg == "/list" {
		waitingListList()
		return
	} else if strings.HasPrefix(d.Msg, "/random ") || strings.HasPrefix(d.Msg, "/rand ") {
		chatRandom(s, d)
		return
	}

	// Second, check for commands that will only work from the lobby
	if !d.Discord {
		if d.Msg == "/restart" {
			restart(s, d)
			return
		} else if d.Msg == "/graceful" {
			graceful(s, d) // This is in the "restart.go" file
			return
		} else if d.Msg == "/debug" {
			debug(s, d)
			return
		}
	}

	// If we have gotten this far, this is an invalid command
	chatServerSend("That is not a valid command.")
}
