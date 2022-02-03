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
		// Delete the message
		discord.ChannelMessageDelete(m.ChannelID, m.ID) // nolint: errcheck
		discordSendPM(m.Author.ID, "You can only use \"/here\" in the lobby area.")
		return
	}

	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		// Not found
		discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role could not be found.")
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
	// Delete the message
	discord.ChannelMessageDelete(m.ChannelID, m.ID) // nolint: errcheck

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Add user to Ping Crew
	if err := discord.GuildMemberRoleAdd(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role could not be added to your profile.")
		return
	}

	discordSendPM(m.Author.ID, "The `@Ping Crew` role has been successfully added to your profile. Remove it with `/unsubscribe`.")
}

// Unsubscribes from @Ping Crew
func discordUnsubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	// Delete the message
	discord.ChannelMessageDelete(m.ChannelID, m.ID) // nolint: errcheck

	// Find Ping Crew
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName(discordPingCrew); !ok {
		discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role could not be found.")
		return
	} else {
		pingCrew = r
	}

	// Remove user from Ping Crew
	if err := discord.GuildMemberRoleRemove(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role could not be removed from your profile.")
		return
	}

	discordSendPM(m.Author.ID, "The `@"+discordPingCrew+"` role has been successfully removed from your profile. Add it with `/subscribe`.")
}
