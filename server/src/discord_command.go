package main

import (
	"context"

	"github.com/bwmarrin/discordgo"
)

var (
	// Used to store all of the functions that handle each command
	discordCommandMap      = make(map[string]func(context.Context, *discordgo.MessageCreate, []string))
	discordPrivateCommands []string // Array of commands that should not be shown in lobby
)

// Note that Discord commands only work in channels outside of the lobby-replication channel
func discordCommandInit() {
	// Info commands for the #convention-questions channel
	discordCommandMap["2p"] = discordCommand2P
	discordCommandMap["2player"] = discordCommand2P
	discordCommandMap["2pquestion"] = discordCommand2P
	discordCommandMap["badquestion"] = discordCommandBadQuestion
	discordCommandMap["github"] = discordCommandGithub
	discordCommandMap["issues"] = discordCommandGithub
	discordCommandMap["level"] = discordCommandLevel
	discordCommandMap["loweffort"] = discordCommandLowEffort
	discordCommandMap["noreplay"] = discordCommandScreenshot
	discordCommandMap["notation"] = discordCommandNotation
	discordCommandMap["oop"] = discordCommandOOP
	discordCommandMap["screenshot"] = discordCommandScreenshot
	discordCommandMap["undefined"] = discordCommandUndefined
	discordCommandMap["rtfm"] = discordCommandRTFM

	// Duplicated commands (e.g. commands that also work in the lobby)
	discordCommandMap["replay"] = discordCommandReplay
	discordCommandMap["link"] = discordCommandReplay
	discordCommandMap["game"] = discordCommandReplay
	discordCommandMap["uptime"] = discordUptime

	discordCommandMap["ping"] = discordPing
	discordCommandMap["here"] = discordPing
	discordCommandMap["subscribe"] = discordSubscribe
	discordPrivateCommands = append(discordPrivateCommands, "subscribe")
	discordCommandMap["unsubscribe"] = discordUnsubscribe
	discordPrivateCommands = append(discordPrivateCommands, "unsubscribe")
}

func discordCommand(ctx context.Context, m *discordgo.MessageCreate, command string, args []string) {
	// Check to see if there is a command handler for this command
	if discordCommandFunction, ok := discordCommandMap[command]; ok {
		discordCommandFunction(ctx, m, args)
	}
	// (do nothing if they sent an invalid command)
}
