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
		msg := "You can see the full list of commands here: "
		msg += "https://github.com/Zamiell/hanabi-live/blob/master/src/chatCommand.go"
		chatServerSend(msg)
	}
}

var (
	// Used to store all of the functions that handle each command
	chatCommandMap        = make(map[string]func(*Session, *CommandData))
	chatPregameCommandMap = make(map[string]func(*Session, *CommandData))
)

func chatCommandInit() {
	// General commands
	chatCommandMap["help"] = chatHelp
	chatCommandMap["commands"] = chatHelp
	chatCommandMap["?"] = chatHelp
	chatCommandMap["here"] = chatHere
	chatCommandMap["last"] = chatLast
	chatCommandMap["next"] = waitingListAdd
	chatCommandMap["unnext"] = waitingListRemove
	chatCommandMap["removenext"] = waitingListRemove
	chatCommandMap["list"] = waitingListList
	chatCommandMap["random"] = chatRandom

	// Admin-only commands (from the lobby only)
	chatCommandMap["restart"] = restart
	chatCommandMap["graceful"] = graceful     // This is in the "restart.go" file
	chatCommandMap["ungraceful"] = ungraceful // This is in the "restart.go" file
	chatCommandMap["debug"] = debug

	// Pre-game commands
	chatPregameCommandMap["s"] = chatPregameS
	chatPregameCommandMap["s3"] = chatPregameS3
	chatPregameCommandMap["s4"] = chatPregameS4
	chatPregameCommandMap["s5"] = chatPregameS5
	chatPregameCommandMap["s6"] = chatPregameS6
}

func chatCommand(s *Session, d *CommandData, pregame bool) {
	// Parse the command
	args := strings.Split(d.Msg, " ")
	command := args[0]
	d.Args = args[1:] // This will be an empty slice if there is nothing after the command
	// (we need to pass the arguments through to the command handler)

	// Commands will start with a "/", so we can ignore everything else
	if !strings.HasPrefix(command, "/") {
		return
	}
	command = strings.TrimPrefix(command, "/")
	command = strings.ToLower(command) // Commands are case-insensitive

	// Check to see if there is a command handler for this command
	if !pregame {
		if _, ok := chatCommandMap[command]; !ok {
			chatServerSend("That is not a valid command.")
			return
		}
		chatCommandMap[command](s, d)
	} else {
		if _, ok := chatPregameCommandMap[command]; !ok {
			chatServerSend("That is not a valid command.")
			return
		}
		chatPregameCommandMap[command](s, d)
	}
}
