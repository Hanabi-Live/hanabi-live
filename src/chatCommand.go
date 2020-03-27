package main

import (
	"strings"
)

var (
	// Used to store all of the functions that handle each command
	chatCommandMap = make(map[string]func(*Session, *CommandData, *Table))
)

func chatCommandInit() {
	// General commands (they work both in the lobby and at a table)
	chatCommandMap["help"] = chatHelp
	chatCommandMap["commands"] = chatHelp
	chatCommandMap["?"] = chatHelp
	chatCommandMap["discord"] = chatDiscord
	chatCommandMap["random"] = chatRandom

	// Table-only commands
	chatCommandMap["s"] = chatS
	chatCommandMap["s2"] = chatS2
	chatCommandMap["s3"] = chatS3
	chatCommandMap["s4"] = chatS4
	chatCommandMap["s5"] = chatS5
	chatCommandMap["s6"] = chatS6
	chatCommandMap["startin"] = chatStartIn
	chatCommandMap["pause"] = chatPause
	chatCommandMap["unpause"] = chatUnpause

	// Discord-only commands
	chatCommandMap["here"] = chatHere
	chatCommandMap["last"] = chatLast
	chatCommandMap["next"] = chatNext
	chatCommandMap["unnext"] = chatUnnext
	chatCommandMap["removenext"] = chatUnnext
	chatCommandMap["list"] = chatList
	// (there are additional Discord-only commands in "discord.go")

	// Admin-only commands (from the lobby only)
	chatCommandMap["restart"] = chatRestart
	chatCommandMap["graceful"] = chatGraceful
	chatCommandMap["shutdown"] = chatShutdown
	chatCommandMap["maintenance"] = chatMaintenance
	chatCommandMap["cancel"] = chatCancel
	chatCommandMap["debug"] = chatDebug
}

func chatCommand(s *Session, d *CommandData, t *Table) {
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
	if _, ok := chatCommandMap[command]; !ok {
		chatServerSend("That is not a valid command.", d.Room)
		return
	}
	chatCommandMap[command](s, d, t)
}
