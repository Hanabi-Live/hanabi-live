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
		msg := "You can see the full list of commands here: https://github.com/Zamiell/hanabi-live/blob/master/src/chatCommand.go"
		chatServerSend(msg)
	}
}

var (
	// Used to store all of the functions that handle each command
	chatCommandMap = make(map[string]func(*Session, *CommandData))
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
	chatCommandMap["list"] = waitingListList
	chatCommandMap["random"] = chatRandom

	// Admin-only commands (from the lobby only)
	chatCommandMap["restart"] = restart
	chatCommandMap["graceful"] = graceful // This is in the "restart.go" file
	chatCommandMap["debug"] = debug
}

func chatCommand(s *Session, d *CommandData) {
	// Parse the command
	args := strings.Split(d.Msg, " ")
	command := args[0]
	d.Args = args[1:] // This will be an empty slice if there is nothing after the command
	// (we need to pass the arguments through to the command handler)

	// Commands will start with a "!", so we can ignore everything else
	if !strings.HasPrefix(command, "/") {
		return
	}
	command = strings.TrimPrefix(command, "/")
	command = strings.ToLower(command) // Commands are case-insensitive

	// Check to see if there is a command handler for this command
	if _, ok := chatCommandMap[command]; !ok {
		chatServerSend("That is not a valid command.")
		return
	}
	chatCommandMap[command](s, d)
}
