package chat

import (
	"fmt"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

type commandData struct {
	userID   int
	username string
	room     string
	args     []string
}

func (m *Manager) commandMapInit() {
	// General commands (that work both in the lobby and at a table)
	m.commandMap["help"] = m.commandHelp
	m.commandMap["commands"] = m.commandHelp
	m.commandMap["?"] = m.commandHelp
	m.commandMap["discord"] = m.commandDiscord
	m.commandMap["rules"] = m.commandRules
	m.commandMap["guidelines"] = m.commandRules
	m.commandMap["new"] = m.commandNew
	m.commandMap["beginner"] = m.commandNew
	m.commandMap["beginners"] = m.commandNew
	m.commandMap["guide"] = m.commandNew
	m.commandMap["doc"] = m.commandDoc
	m.commandMap["document"] = m.commandDoc
	m.commandMap["reference"] = m.commandDoc
	m.commandMap["bga"] = m.commandBGA
	m.commandMap["efficiency"] = m.commandEfficiency
	m.commandMap["replay"] = m.commandReplay
	m.commandMap["random"] = m.commandRandom
	m.commandMap["uptime"] = m.commandUptime
	m.commandMap["timeleft"] = m.commandTimeLeft

	// Undocumented info commands (that work only in the lobby)
	m.commandMap["here"] = m.commandHere
	m.commandMap["wrongchannel"] = m.commandWrongChannel

	// Table-only commands (pregame only, table owner only)
	m.commandMap["s"] = m.commandS
	m.commandMap["s2"] = m.commandS2
	m.commandMap["s3"] = m.commandS3
	m.commandMap["s4"] = m.commandS4
	m.commandMap["s5"] = m.commandS5
	m.commandMap["s6"] = m.commandS6
	m.commandMap["startin"] = m.commandStartIn
	m.commandMap["kick"] = m.commandKick
	m.commandMap["impostor"] = m.commandImpostor

	// Table-only commands (pregame or game)
	m.commandMap["missing"] = m.commandMissingScores
	m.commandMap["missingscores"] = m.commandMissingScores
	m.commandMap["missing-scores"] = m.commandMissingScores
	m.commandMap["sharedmissingscores"] = m.commandMissingScores
	m.commandMap["shared-missing-scores"] = m.commandMissingScores
	m.commandMap["findvariant"] = m.commandFindVariant
	m.commandMap["find-variant"] = m.commandFindVariant
	m.commandMap["randomvariant"] = m.commandFindVariant
	m.commandMap["random-variant"] = m.commandFindVariant

	// Table-only commands (game only)
	m.commandMap["pause"] = m.commandPause
	m.commandMap["unpause"] = m.commandUnpause

	// Table-only commands (replay only)
	m.commandMap["suggest"] = m.commandSuggest
	m.commandMap["tags"] = m.commandTags
	m.commandMap["taglist"] = m.commandTags

	// Error handlers for website-only commands
	m.commandMap["pm"] = m.commandWebsiteOnly
	m.commandMap["w"] = m.commandWebsiteOnly
	m.commandMap["whisper"] = m.commandWebsiteOnly
	m.commandMap["msg"] = m.commandWebsiteOnly
	m.commandMap["friend"] = m.commandWebsiteOnly
	m.commandMap["friends"] = m.commandWebsiteOnly
	m.commandMap["unfriend"] = m.commandWebsiteOnly
	m.commandMap["version"] = m.commandWebsiteOnly
}

func (m *Manager) checkCommand(d *chatData, t dispatcher.TableManager) {
	// Parse the command
	args := strings.Split(d.msg, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	// (we need to pass the arguments through to the command handler)

	// Commands will start with a "/", so we can ignore everything else
	if !strings.HasPrefix(command, "/") {
		return
	}
	command = strings.TrimPrefix(command, "/")
	command = strings.ToLower(command) // Commands are case-insensitive

	// Check to see if there is a command handler for this command
	commandFunction, ok := m.commandMap[command]
	if ok {
		commandFunction(&commandData{
			userID:   d.userID,
			username: d.username,
			room:     d.room,
			args:     args,
		}, t)
	} else {
		msg := fmt.Sprintf("The chat command of \"/%v\" is not valid.", command)
		m.ChatServer(msg, d.room)
	}
}

func (m *Manager) commandWebsiteOnly(d *commandData, t dispatcher.TableManager) {
	msg := "You cannot perform that command from Discord; please use the website instead."
	m.ChatServer(msg, d.room)
}
