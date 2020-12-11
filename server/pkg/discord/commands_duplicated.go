package discord

import (
	"context"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/bwmarrin/discordgo"
)

// nolint: godot
// /replay
func (m *Manager) commandReplay(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	url := util.GetReplayURL(m.httpManager.Domain, m.httpManager.UseTLS, args)
	// We enclose the link in "<>" to prevent Discord from generating a link preview
	msg := fmt.Sprintf("<%v>", url)
	m.Send(mc.ChannelID, "", msg)
}

// nolint: godot
// /uptime
func (m *Manager) commandUptime(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	cameOnline := m.coreManager.GetCameOnline()
	var uptime string
	if v, err := m.coreManager.GetUptime(); err != nil {
		m.logger.Errorf("Failed to get the uptime: %v", err)
		m.Send(mc.ChannelID, "", constants.DefaultErrorMsg)
		return
	} else {
		uptime = v
	}

	msg := fmt.Sprintf("%v\n%v\n", cameOnline, uptime)
	m.Send(mc.ChannelID, "", msg)
}
