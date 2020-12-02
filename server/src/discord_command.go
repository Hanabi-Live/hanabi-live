package main

import (
	"github.com/bwmarrin/discordgo"
)

var (
	// Used to store all of the functions that handle each command
	discordCommandMap = make(map[string]func(*discordgo.MessageCreate, []string))
)

func discordCommandInit() {
	// Special commands
	discordCommandMap["replay"] = discordCommandReplay
	discordCommandMap["link"] = discordCommandReplay
	discordCommandMap["game"] = discordCommandReplay

	// Info commands for the #convention-questions channel
	discordCommandMap["2pquestion"] = discordCommand2PQuestion
	discordCommandMap["2player"] = discordCommand2PQuestion
	discordCommandMap["2p"] = discordCommand2PQuestion
	discordCommandMap["badquestion"] = discordCommandBadQuestion
	discordCommandMap["level"] = discordCommandLevel
	discordCommandMap["loweffort"] = discordCommandLowEffort
	discordCommandMap["noreplay"] = discordCommandScreenshot
	discordCommandMap["notation"] = discordCommandNotation
	discordCommandMap["oop"] = discordCommandOOP
	discordCommandMap["screenshot"] = discordCommandScreenshot
	discordCommandMap["undefined"] = discordCommandUndefined
}

func discordCommand(m *discordgo.MessageCreate, command string, args []string) {
	// Check to see if there is a command handler for this command
	if discordCommandFunction, ok := discordCommandMap[command]; ok {
		discordCommandFunction(m, args)
	}
	// (do nothing if they sent an invalid command)
}
