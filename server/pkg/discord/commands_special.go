package discord

import (
	"context"
	"fmt"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/bwmarrin/discordgo"
)

// nolint: godot
// /issue
func (m *Manager) commandIssue(ctx context.Context, mc *discordgo.MessageCreate, args []string) {
	if m.gitHubManager == nil {
		msg := "The GitHub client is not initialized."
		m.Send(mc.ChannelID, "", msg)
		return
	}

	if len(args) == 0 {
		msg := "The format of the /issue command is: /issue [title]"
		m.Send(mc.ChannelID, "", msg)
		return
	}

	title := strings.Join(args, " ")
	body := fmt.Sprintf(
		"Issue opened by Discord user: %v#%v",
		m.getNickname(mc.Author.ID),
		mc.Author.Discriminator,
	)
	if err := m.gitHubManager.NewIssue(ctx, title, body); err != nil {
		m.logger.Errorf("Failed to create a new issue on GitHub: %v", err)
		m.Send(mc.ChannelID, "", constants.DefaultErrorMsg)
		return
	}

	msg := fmt.Sprintf("Successfully created a GitHub issue: `%v`", title)
	m.Send(mc.ChannelID, "", msg)
}
