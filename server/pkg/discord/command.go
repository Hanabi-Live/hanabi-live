package discord

import (
	"context"
	"strings"

	"github.com/bwmarrin/discordgo"
)

// Note that Discord commands only work in channels outside of the lobby-replication channel.
func (m *Manager) commandFuncMapInit() {
	// Info commands for the #convention-questions channel
	m.commandFuncMap["2p"] = m.command2P
	m.commandFuncMap["2player"] = m.command2P
	m.commandFuncMap["2pquestion"] = m.command2P
	m.commandFuncMap["badquestion"] = m.commandBadQuestion
	m.commandFuncMap["level"] = m.commandLevel
	m.commandFuncMap["loweffort"] = m.commandLowEffort
	m.commandFuncMap["noreplay"] = m.commandScreenshot
	m.commandFuncMap["notation"] = m.commandNotation
	m.commandFuncMap["oop"] = m.commandOOP
	m.commandFuncMap["screenshot"] = m.commandScreenshot
	m.commandFuncMap["undefined"] = m.commandUndefined

	// Special commands for use in other channels
	m.commandFuncMap["issue"] = m.commandIssue

	// Duplicated commands (e.g. commands that also work in the lobby)
	m.commandFuncMap["replay"] = m.commandReplay
	m.commandFuncMap["link"] = m.commandReplay
	m.commandFuncMap["game"] = m.commandReplay
	m.commandFuncMap["uptime"] = m.commandUptime
}

// We need to check for special commands that occur in Discord channels other than #general
// (because the messages will not flow to the normal "chatCommandMap").
func (m *Manager) checkCommand(ctx context.Context, mc *discordgo.MessageCreate) {
	// This code is duplicated from the "chatCommand()" function
	args := strings.Split(mc.Content, " ")
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
	if commandFunc, ok := m.commandFuncMap[command]; ok {
		commandFunc(ctx, mc, args)
	}
	// (do nothing if they sent an invalid command)
}
