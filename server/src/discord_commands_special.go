package main

import (
	"context"
	"strconv"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/bwmarrin/discordgo"
	"github.com/google/go-github/github"
)

// /issue
func discordCommandIssue(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if len(args) == 0 {
		msg := "The format of the /issue command is: /issue [title] or /issue [id]"
		discordSend(m.ChannelID, "", msg)
		return
	}

	discordUsername := discordGetNickname(m.Author.ID) + "#" + m.Author.Discriminator
	if discordUsername != ownerDiscordID {
		msg := "Only the owner of the website can use the /issue command."
		discordSend(m.ChannelID, "", msg)
		return
	}

	issue, found := discordShouldShowIssue(args)

	if found {
		discordShowIssue(ctx, m, issue, discordUsername)
	} else {
		discordOpenIssue(ctx, m, issue, discordUsername)
	}
}

func discordShouldShowIssue(args []string) (string, bool) {
	title := strings.Join(args, " ")
	if len(args) != 1 {
		return title, false
	}
	_, err := strconv.Atoi(args[0])
	return title, (err == nil)
}

func discordOpenIssue(ctx context.Context, m *discordgo.MessageCreate, title string, discordUsername string) {
	body := "Issue opened by Discord user: " + discordUsername

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
		logger.Error("Failed to submit a GitHub issue: " + err.Error())
		discordSend(m.ChannelID, "", DefaultErrorMsg)
		return
	}

	msg := "Successfully created a GitHub issue: `" + title + "`"
	discordSend(m.ChannelID, "", msg)

}

func discordShowIssue(ctx context.Context, m *discordgo.MessageCreate, title string, discordUsername string) {
	id, _ := strconv.Atoi(title)
	var issue *github.Issue
	if v, _, err := gitHubClient.Issues.Get(ctx, githubRepositoryOwner, projectName, id); err != nil {
		discordSend(m.ChannelID, "", "Issue `"+strconv.Itoa(id)+"` cannot be found on Github")
		return
	} else {
		issue = v
	}
	msg := "Issue `" + strconv.Itoa(id) + "`: " +
		"[" + *issue.Title + "](" + *issue.URL + ")" +
		" (by " + *issue.User.Name + ")"
	discordSend(m.ChannelID, "", msg)
}
