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
	msg := "The /issue command has been disabled."
	discordSend(m.ChannelID, "", msg)

	/*
		if len(args) == 0 {
			msg := "The format of the /issue command is: /issue [title] or /issue [id]"
			discordSend(m.ChannelID, "", msg)
			return
		}

		discordUsername := discordGetNickname(m.Author.ID) + "#" + m.Author.Discriminator
		issue, found := discordShouldShowIssue(args)

		if discordUsername != ownerDiscordID && !found {
			msg := "Only the owner of the website can use the /issue command."
			discordSend(m.ChannelID, "", msg)
			return
		}

		if found {
			discordShowIssue(ctx, m.ChannelID, issue, discordUsername)
		} else {
			discordOpenIssue(ctx, m.ChannelID, issue, discordUsername)
		}
	*/
}

func discordShouldShowIssue(args []string) (string, bool) {
	title := strings.Join(args, " ")
	if len(args) != 1 {
		return title, false
	}
	_, err := strconv.Atoi(args[0])
	return title, (err == nil)
}

func discordOpenIssue(ctx context.Context, channelID string, title string, discordUsername string) {
	body := "Issue opened by Discord user: " + discordUsername
	issue := &github.IssueRequest{ // nolint: exhaustivestruct
		Title: &title,
		Body:  &body,
	}

	// Open a new issue on GitHub for this repository
	if _, _, err := gitHubClient.Issues.Create(
		ctx,
		githubRepositoryOwner,
		projectName,
		issue,
	); err != nil {
		logger.Error("Failed to submit a GitHub issue: " + err.Error())
		discordSend(channelID, "", DefaultErrorMsg)
		return
	}

	msg := "Successfully created a GitHub issue: `" + title + "`"
	discordSend(channelID, "", msg)
}

func discordShowIssue(ctx context.Context, channelID string, title string, discordUsername string) {
	id, _ := strconv.Atoi(title)
	var issue *github.Issue
	if v, _, err := gitHubClient.Issues.Get(ctx, githubRepositoryOwner, projectName, id); err != nil {
		discordSend(channelID, "", "Issue `"+strconv.Itoa(id)+"` cannot be found on Github")
		return
	} else {
		issue = v
	}
	msg := "Issue `" + strconv.Itoa(id) + "`: " +
		"[" + *issue.Title + "](" + *issue.URL + ")" +
		" (by " + *issue.User.Name + ")"
	discordSend(channelID, "", msg)
}

// /mem, /memory
// Responds with a private message containing information about memory usage
// Private use only
func discordCommandMemory(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	if m.Author.ID != ownerDiscordID {
		discordSend(m.Author.ID, "", "Only the owner of the website can use the /mem command.")
		return
	}

	msg := getMemoryReport()

	discordSend(m.Author.ID, "", msg)
}
