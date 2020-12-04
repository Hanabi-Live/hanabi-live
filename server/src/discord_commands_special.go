package main

import (
	"context"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/google/go-github/github"
)

// /issue
func discordCommandIssue(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if len(args) == 0 {
		msg := "The format of the /issue command is: /issue [title]"
		discordSend(m.ChannelID, "", msg)
		return
	}

	title := strings.Join(args, " ")
	body := "Issue opened by Discord user: " +
		discordGetNickname(m.Author.ID) + "#" + m.Author.Discriminator

	// Open a new issue on GitHub for this repository
	if _, _, err := gitHubClient.Issues.Create(
		ctx,
		githubRepositoryOwner,
		projectName,
		&github.IssueRequest{ // nolint: exhaustivestruct
			Title: &title,
			Body:  &body,
		},
	); err != nil {
		logger.Error("Failed to submit a GitHub issue:", err)
		discordSend(m.ChannelID, "", DefaultErrorMsg)
		return
	}

	msg := "Successfully created a GitHub issue: `" + title + "`"
	discordSend(m.ChannelID, "", msg)
}
