package main

import (
	"context"
	"strings"
)

var (
	// Used to store all of the functions that handle each command
	chatCommandMap = make(map[string]func(context.Context, *Session, *CommandData, *Table, string))
)

func chatCommandInit() {
	// General commands (that work both in the lobby and at a table)
	chatCommandMap["replay"] = chatReplay
	chatCommandMap["random"] = chatRandom
	chatCommandMap["uptime"] = chatUptime
	chatCommandMap["timeleft"] = chatTimeLeft

	// Undocumented info commands (that work only in the lobby)
	chatCommandMap["here"] = chatHere
	chatCommandMap["ping"] = chatHere
	chatCommandMap["teachme"] = chatTeachMe
	chatCommandMap["wrongchannel"] = chatWrongChannel

	// Table-only commands (pregame only, table owner only)
	chatCommandMap["s"] = chatS
	chatCommandMap["s2"] = chatS
	chatCommandMap["s3"] = chatS
	chatCommandMap["s4"] = chatS
	chatCommandMap["s5"] = chatS
	chatCommandMap["s6"] = chatS
	chatCommandMap["si"] = chatStartIn
	chatCommandMap["startin"] = chatStartIn
	chatCommandMap["kick"] = chatKick
	chatCommandMap["impostor"] = chatImpostor

	// Table-only commands (pregame or game)
	chatCommandMap["m"] = chatMissingScores
	chatCommandMap["missing"] = chatMissingScores
	chatCommandMap["missingscores"] = chatMissingScores
	chatCommandMap["missing-scores"] = chatMissingScores
	chatCommandMap["sharedmissingscores"] = chatMissingScores
	chatCommandMap["shared-missing-scores"] = chatMissingScores
	chatCommandMap["fv"] = chatFindVariant
	chatCommandMap["findvariant"] = chatFindVariant
	chatCommandMap["find-variant"] = chatFindVariant
	chatCommandMap["randomvariant"] = chatFindVariant
	chatCommandMap["random-variant"] = chatFindVariant

	// Table-only commands (game only)
	// chatCommandMap["pause"] = chatPause
	// chatCommandMap["unpause"] = chatUnpause

	// Table-only commands (replay only)
	chatCommandMap["suggest"] = chatSuggest
	chatCommandMap["tags"] = chatTags
	chatCommandMap["taglist"] = chatTags

	chatAddOneLineResponses()
}

func chatCommand(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Parse the message
	var command string
	if cmd, args := chatParseCommand(d.Msg); cmd == "" {
		// it's a plain text
		return
	} else {
		command = cmd
		d.Args = args
	}

	// Check to see if there is a command handler for this command
	chatCommandFunction, ok := chatCommandMap[command]
	if ok {
		chatCommandFunction(ctx, s, d, t, command)
	}
}

// Returns true if the command should be shown on the chat.
// Handles immediately commands that reply via PM.
// Handles immediately invalid commands by informing the user.
func chatCommandShouldOutput(ctx context.Context, s *Session, d *CommandData, t *Table) bool {
	// Parse the message
	var command string
	if cmd, _ := chatParseCommand(d.Msg); cmd == "" {
		// it's a plain text
		return true
	} else {
		command = cmd
	}

	msg := "The chat command of \"/" + command + "\" is not valid. Use \"/help\" to get a list of available commands."

	// Search for existing handler
	if _, ok := chatCommandMap[command]; !ok {
		// There's no handler, inform via PM
		chatServerSendPM(s, msg, d.Room)
		return false
	}

	// Search for private one-line responses and handle them
	if _, ok := OneLiners[command]; ok && OneLiners[command].Private {
		chatCommandMap[command](ctx, s, d, t, command)
		return false
	}

	return true
}

// Parses a message, searching for /<string>.
// Returns empty command if it's a normal string.
func chatParseCommand(msg string) (string, []string) {
	args := strings.Split(msg, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	// (we need to pass the arguments through to the command handler)

	// Commands will start with a "/", so we can ignore everything else
	if !strings.HasPrefix(command, "/") {
		return "", []string{}
	}

	command = strings.TrimPrefix(command, "/")
	command = strings.ToLower(command) // Commands are case-insensitive

	return command, args
}
