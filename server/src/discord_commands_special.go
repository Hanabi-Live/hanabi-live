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
	// Delete the message
	discord.ChannelMessageDelete(m.ChannelID, m.ID)

	if !discordIsUserTheDiscordOwner(m.Author) {
		msg := "Only the owner of the website can use the /memory command."
		discordSendPM(m.Author.ID, msg)
		return
	}

	if len(args) == 0 {
		msg := "The format of the /issue command is: /issue [title] or /issue [id]"
		discordSendPM(m.Author.ID, msg)
		return
	}

	issue, found := discordShouldShowIssue(args)

	if found {
		discordShowIssue(ctx, m.Author.ID, m.ChannelID, issue, discordOwnerFullUsername)
	} else {
		discordOpenIssue(ctx, m.Author.ID, issue, discordOwnerFullUsername)
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

func discordOpenIssue(ctx context.Context, messageAuthorID string, title string, discordUsername string) {
	// Check state of github client
	if gitHubClient == nil {
		discordSendPM(messageAuthorID, "The github client is not available.")
		return
	}

	body := "Issue opened by Discord user: " + discordUsername
	issue := &github.IssueRequest{
		Title: &title,
		Body:  &body,
	}

	// Open a new issue on GitHub for this repository
	id := ""
	if issue, _, err := gitHubClient.Issues.Create(
		context.Background(),
		githubRepositoryOwner,
		projectName,
		issue,
	); err != nil {
		logger.Error("Failed to submit a GitHub issue: " + err.Error())
		discordSend(messageAuthorID, "", DefaultErrorMsg)
		return
	} else {
		id = " (#" + strconv.Itoa(int(*issue.Number)) + ")"
	}

	msg := "Successfully created a GitHub issue: `" + title + "`" + id
	discordSendPM(messageAuthorID, msg)
}

func discordShowIssue(ctx context.Context, messageAuthorID string, channelID string, title string, discordUsername string) {
	// Check state of github client
	if gitHubClient == nil {
		discordSendPM(messageAuthorID, "The github client is not available.")
		return
	}

	id, _ := strconv.Atoi(title)
	var issue *github.Issue
	if v, _, err := gitHubClient.Issues.Get(ctx, githubRepositoryOwner, projectName, id); err != nil {
		discordSendPM(messageAuthorID, "Issue `"+strconv.Itoa(id)+"` cannot be found on Github")
		return
	} else {
		issue = v
	}

	userName := githubGetUserName(*issue.User)
	// Add <, > to link to prevent embeds
	msg := "Issue `" + strconv.Itoa(id) + "`: " +
		"[" + *issue.Title + "](<" + *issue.HTMLURL + ">)" +
		" (by " + userName + ")"
	discordSend(channelID, "", msg)
}

// /mem, /memory
func discordCommandMemory(ctx context.Context, m *discordgo.MessageCreate, args []string) {
	// Delete the message
	discord.ChannelMessageDelete(m.ChannelID, m.ID)

	msg := "Only the owner of the website can use the /memory command."
	if discordIsUserTheDiscordOwner(m.Author) {
		msg = getMemoryReport()
	}

	discordSendPM(m.Author.ID, msg)
}
