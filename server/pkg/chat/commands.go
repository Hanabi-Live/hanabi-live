package chat

import (
	"context"
	"fmt"
	"strings"
)

func (m *Manager) commandMapInit() {
	// General commands (that work both in the lobby and at a table)
	m.commandMap["help"] = commandHelp
	m.commandMap["commands"] = commandHelp
	m.commandMap["?"] = commandHelp
	m.commandMap["discord"] = commandDiscord
	m.commandMap["rules"] = commandRules
	m.commandMap["guidelines"] = commandRules
	m.commandMap["new"] = commandNew
	m.commandMap["beginner"] = commandNew
	m.commandMap["beginners"] = commandNew
	m.commandMap["guide"] = commandNew
	m.commandMap["doc"] = commandDoc
	m.commandMap["document"] = commandDoc
	m.commandMap["reference"] = commandDoc
	m.commandMap["bga"] = commandBGA
	m.commandMap["efficiency"] = commandEfficiency
	m.commandMap["replay"] = commandReplay
	m.commandMap["random"] = commandRandom
	m.commandMap["uptime"] = commandUptime
	m.commandMap["timeleft"] = commandTimeLeft

	// Undocumented info commands (that work only in the lobby)
	m.commandMap["here"] = commandHere
	m.commandMap["wrongchannel"] = commandWrongChannel

	// Table-only commands (pregame only, table owner only)
	m.commandMap["s"] = commandS
	m.commandMap["s2"] = commandS2
	m.commandMap["s3"] = commandS3
	m.commandMap["s4"] = commandS4
	m.commandMap["s5"] = commandS5
	m.commandMap["s6"] = commandS6
	m.commandMap["startin"] = commandStartIn
	m.commandMap["kick"] = commandKick
	m.commandMap["impostor"] = commandImpostor

	// Table-only commands (pregame or game)
	m.commandMap["missing"] = commandMissingScores
	m.commandMap["missingscores"] = commandMissingScores
	m.commandMap["missing-scores"] = commandMissingScores
	m.commandMap["sharedmissingscores"] = commandMissingScores
	m.commandMap["shared-missing-scores"] = commandMissingScores
	m.commandMap["findvariant"] = commandFindVariant
	m.commandMap["find-variant"] = commandFindVariant
	m.commandMap["randomvariant"] = commandFindVariant
	m.commandMap["random-variant"] = commandFindVariant

	// Table-only commands (game only)
	m.commandMap["pause"] = commandPause
	m.commandMap["unpause"] = commandUnpause

	// Table-only commands (replay only)
	m.commandMap["suggest"] = commandSuggest
	m.commandMap["tags"] = commandTags
	m.commandMap["taglist"] = commandTags

	// Error handlers for website-only commands
	m.commandMap["pm"] = commandCommandWebsiteOnly
	m.commandMap["w"] = commandCommandWebsiteOnly
	m.commandMap["whisper"] = commandCommandWebsiteOnly
	m.commandMap["msg"] = commandCommandWebsiteOnly
	m.commandMap["friend"] = commandCommandWebsiteOnly
	m.commandMap["friends"] = commandCommandWebsiteOnly
	m.commandMap["unfriend"] = commandCommandWebsiteOnly
	m.commandMap["version"] = commandCommandWebsiteOnly
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
		msg := fmt.Sprintf("The chat command of \"/%v\" is not valid.", command)
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}

func commandWebsiteOnly(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "You cannot perform that command from Discord; please use the website instead."
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
