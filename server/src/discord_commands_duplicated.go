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
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName("Ping Crew"); !ok {
		// Not found
		discordSend(m.Author.ID, "", "The `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}
	// ping
	nick := discordGetNickname(m.Author.ID)
	discordSend(discordChannelSyncWithLobby, "", nick+" is looking for a game. <@&"+pingCrew.ID+">")
}

// Subscribes to @Ping Crew
func discordSubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName("Ping Crew"); !ok {
		// Not found
		discordSend(m.Author.ID, "", "The `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}
	if err := discord.GuildMemberRoleAdd(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSend(m.Author.ID, "", "The `@Ping Crew` role could not be added to your profile.")
		return
	}
	discordSend(m.Author.ID, "", "The `@Ping Crew` role has been successfully added to your profile. Remove it with `/unsubscribe`.")
}

// Unsubscribes from @Ping Crew
func discordUnsubscribe(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	var pingCrew *discordgo.Role
	if r, ok := discordGetRoleByName("Ping Crew"); !ok {
		// Not found
		discordSend(m.Author.ID, "", "The `@Ping Crew` role could not be found.")
		return
	} else {
		pingCrew = r
	}
	if err := discord.GuildMemberRoleRemove(discordGuildID, m.Author.ID, pingCrew.ID); err != nil {
		discordSend(m.Author.ID, "", "The `@Ping Crew` role could not be removed from your profile.")
		return
	}
	discordSend(m.Author.ID, "", "The `@Ping Crew` role has been successfully removed from your profile. Add it with `/subscribe`.")
}
