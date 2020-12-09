package main

import (
	"context"
	"fmt"

	"github.com/bwmarrin/discordgo"
)

// /replay
func discordCommandReplay(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	url := getReplayURL(args)
	// We enclose the link in "<>" to prevent Discord from generating a link preview
	msg := fmt.Sprintf("<%v>", url)
	discordSend(m.ChannelID, "", msg)
}

// /uptime
func discordUptime(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	cameOnline := getCameOnline()
	var uptime string
	if v, err := getUptime(); err != nil {
		hLog.Errorf("Failed to get the uptime: %v", err)
		discordSend(m.ChannelID, "", DefaultErrorMsg)
		return
	} else {
		uptime = v
	}

	msg := fmt.Sprintf("%v\n%v\n", cameOnline, uptime)
	discordSend(m.ChannelID, "", msg)
}
