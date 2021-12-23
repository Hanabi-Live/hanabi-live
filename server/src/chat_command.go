package main

import (
	"context"
	"strings"
)

var (
	// Used to store all of the functions that handle each command
	chatCommandMap = make(map[string]func(context.Context, *Session, *CommandData, *Table))
)

func chatCommandInit() {
	// General commands (that work both in the lobby and at a table)
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
	chatCommandMap["doc"] = chatDoc
	chatCommandMap["levels"] = chatLevels
	chatCommandMap["learningpath"] = chatLevels
	chatCommandMap["path"] = chatLevels
	chatCommandMap["document"] = chatDoc
	chatCommandMap["reference"] = chatDoc
	chatCommandMap["bga"] = chatBGA
	chatCommandMap["efficiency"] = chatEfficiency
	chatCommandMap["replay"] = chatReplay
	chatCommandMap["random"] = chatRandom
	chatCommandMap["uptime"] = chatUptime
	chatCommandMap["timeleft"] = chatTimeLeft

	// Undocumented info commands (that work only in the lobby)
	chatCommandMap["here"] = chatHere
	chatCommandMap["wrongchannel"] = chatWrongChannel

	// Table-only commands (pregame only, table owner only)
	chatCommandMap["s"] = chatS
	chatCommandMap["s2"] = chatS2
	chatCommandMap["s3"] = chatS3
	chatCommandMap["s4"] = chatS4
	chatCommandMap["s5"] = chatS5
	chatCommandMap["s6"] = chatS6
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

	// Error handlers for website-only commands
	chatCommandMap["pm"] = chatCommandWebsiteOnly
	chatCommandMap["w"] = chatCommandWebsiteOnly
	chatCommandMap["whisper"] = chatCommandWebsiteOnly
	chatCommandMap["msg"] = chatCommandWebsiteOnly
	chatCommandMap["f"] = chatCommandWebsiteOnly
	chatCommandMap["friend"] = chatCommandWebsiteOnly
	chatCommandMap["friends"] = chatCommandWebsiteOnly
	chatCommandMap["unfriend"] = chatCommandWebsiteOnly
	chatCommandMap["version"] = chatCommandWebsiteOnly
}

func chatCommand(ctx context.Context, s *Session, d *CommandData, t *Table) {
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
	chatCommandFunction, ok := chatCommandMap[command]
	if ok {
		chatCommandFunction(ctx, s, d, t)
	} else {
		msg := "The chat command of \"/" + command + "\" is not valid."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}

func chatCommandWebsiteOnly(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "You cannot perform that command from Discord; please use the website instead."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
