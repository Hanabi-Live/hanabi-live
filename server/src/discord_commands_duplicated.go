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
func discordPing(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discord.ChannelMessageSend(m.ChannelID, "You can only use \"/here\" in the lobby area.")
		return
	}

	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		// Not found
		discord.ChannelMessageSend(m.ChannelID, "The `@"+discordPingCrew+"` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	nick := discordGetNickname(m.Author.ID)
	msg := nick + " is looking for a game. <@&" + pingCrew.ID + ">"
	discordSend(m.ChannelID, "", msg)
}

// Pings @Trusted Teacher
func discordTeachMe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discord.ChannelMessageSend(m.ChannelID, "You can only use \"/teachme\" in the lobby area.")
		return
	}

	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		// Not found
		discord.ChannelMessageSend(m.ChannelID, "Error: the `@Trusted Teacher` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	nick := discordGetNickname(m.Author.ID)
	msg := nick + " is looking for a game. <@&" + pingCrew.ID + ">"
	discordSend(m.ChannelID, "", msg)
}

// Subscribes to @Ping Crew
func discordSubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discord.ChannelMessageSend(m.ChannelID, "You can only use \"/subscribe\" in the lobby area.")
		return
	}

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discord.ChannelMessageSend(m.ChannelID, "Error: The `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Add user to Ping Crew
	if err := discord.GuildMemberRoleAdd(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discord.ChannelMessageSend(m.ChannelID, "Error: the `@Ping Crew` role could not be added to your profile.")
		return
	}

	username := discordGetNickname(m.Author.ID)
	discord.ChannelMessageSend(m.ChannelID, "`@"+username+"` is now a member of the `@Ping Crew`.")
}

// Unsubscribes from @Ping Crew
func discordUnsubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.ChannelID != discordChannelSyncWithLobby {
		discord.ChannelMessageSend(m.ChannelID, "You can only use \"/unsubscribe\" in the lobby area.")
		return
	}

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discord.ChannelMessageSend(m.ChannelID, "Error: the `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Remove user from Ping Crew
	if err := discord.GuildMemberRoleRemove(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discord.ChannelMessageSend(m.ChannelID, "Error: the `@Ping Crew` role could not be removed from your profile.")
		return
	}

	username := discordGetNickname(m.Author.ID)
	discord.ChannelMessageSend(m.ChannelID, "`@"+username+"` has left the `@Ping Crew`.")
}
