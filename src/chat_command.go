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
	chatCommandMap["rules"] = chatRules
	chatCommandMap["guidelines"] = chatRules
	chatCommandMap["new"] = chatNew
	chatCommandMap["beginner"] = chatNew
	chatCommandMap["beginners"] = chatNew
	chatCommandMap["guide"] = chatNew
	chatCommandMap["replay"] = chatReplay
	chatCommandMap["link"] = chatReplay
	chatCommandMap["game"] = chatReplay
	chatCommandMap["random"] = chatRandom
	chatCommandMap["uptime"] = chatUptime
	chatCommandMap["timeleft"] = chatTimeLeft

	// Undocumented info commands (that work only in the lobby)
	chatCommandMap["badhere"] = chatBadHere
	chatCommandMap["wrongchannel"] = chatWrongChannel

	// Table-only commands
	chatCommandMap["changevariant"] = chatChangeVariant
	chatCommandMap["s"] = chatS
	chatCommandMap["s2"] = chatS2
	chatCommandMap["s3"] = chatS3
	chatCommandMap["s4"] = chatS4
	chatCommandMap["s5"] = chatS5
	chatCommandMap["s6"] = chatS6
	chatCommandMap["startin"] = chatStartIn
	chatCommandMap["pause"] = chatPause
	chatCommandMap["unpause"] = chatUnpause
	chatCommandMap["lastmove"] = chatLastMove
	chatCommandMap["findvariant"] = chatFindVariant
	chatCommandMap["randomvariant"] = chatFindVariant

	// Discord-only commands
	chatCommandMap["here"] = chatHere
	chatCommandMap["last"] = chatLast
	chatCommandMap["next"] = chatNext
	chatCommandMap["unnext"] = chatUnnext
	chatCommandMap["removenext"] = chatUnnext
	chatCommandMap["list"] = chatList
	// (there are additional Discord-only commands in "discord.go")

	// Error handlers for website-only commands
	chatCommandMap["pm"] = chatCommandWebsiteOnly
	chatCommandMap["w"] = chatCommandWebsiteOnly
	chatCommandMap["whisper"] = chatCommandWebsiteOnly
	chatCommandMap["msg"] = chatCommandWebsiteOnly
	chatCommandMap["friend"] = chatCommandWebsiteOnly
	chatCommandMap["friends"] = chatCommandWebsiteOnly
	chatCommandMap["unfriend"] = chatCommandWebsiteOnly
	chatCommandMap["version"] = chatCommandWebsiteOnly
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
	if chatCommandFunction, ok := chatCommandMap[command]; !ok {
		chatServerSend("That is not a valid command.", d.Room)
		return
	} else {
		chatCommandFunction(s, d, t)
	}
}

func chatCommandWebsiteOnly(s *Session, d *CommandData, t *Table) {
	chatServerSend("You cannot perform that command from Discord; "+
		"please use the website instead.", d.Room)
}
