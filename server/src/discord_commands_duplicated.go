package main

import (
	"context"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/bwmarrin/discordgo"
)

// /replay
func discordCommandReplay(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	url := getReplayURL(args)
	// We enclose the link in "<>" to prevent Discord from generating a link preview
	msg := "<" + url + ">"
	discordSend(m.ChannelID, "", msg)
}

// /uptime
func discordUptime(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	cameOnline := getCameOnline()
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime: " + err.Error())
		discordSend(m.ChannelID, "", DefaultErrorMsg)
		return
	} else {
		uptime = v
	}

	msg := cameOnline + "\n" + uptime + "\n"
	discordSend(m.ChannelID, "", msg)
}

// Pings @Ping Crew
// Implemented in the chat lobby
func discordPing(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	discordSend(m.ChannelID, "", "You can only use \"/here\" in the lobby area.")
}

// Pings @Trusted Teacher
// Implemented in the chat lobby
func discordTeachMe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	discordSend(m.ChannelID, "", "You can only use \"/teachme\" in the lobby area.")
}

// Subscribes to @Ping Crew
// Args[0] contains the username
func discordSubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discordSend(m.ChannelID, "", "You can only use \"/subscribe\" in the lobby area.")
		return
	}

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discordSend(m.ChannelID, "", "Error: The `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Add user to Ping Crew
	if err := discord.GuildMemberRoleAdd(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSend(m.ChannelID, "", "Error: the `@Ping Crew` role could not be added to your profile.")
		return
	}

	username := args[0]
	// This won't get repeated because the sender is the bot; send it to two different channels
	discordSendToChat(ctx, "@"+username+" is now a member of the @Ping Crew.", "")
	discordSend(m.ChannelID, "", "`@"+username+"` is now a member of the `@Ping Crew`.")
}

// Unsubscribes from @Ping Crew
// Args[0] contains the username
func discordUnsubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discordSend(m.ChannelID, "", "You can only use \"/unsubscribe\" in the lobby area.")
		return
	}

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discordSend(m.ChannelID, "", "Error: the `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Remove user from Ping Crew
	if err := discord.GuildMemberRoleRemove(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSend(m.ChannelID, "", "Error: the `@Ping Crew` role could not be removed from your profile.")
		return
	}

	username := args[0]
	// This won't get repeated because the sender is the bot; send it to two different channels
	discordSendToChat(ctx, "`@"+username+"` has left the `@Ping Crew`.", "")
	discordSend(m.ChannelID, "", "`@"+username+"` has left the `@Ping Crew`.")
}
