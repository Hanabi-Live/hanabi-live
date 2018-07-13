package main

import (
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Waiter is a person who is on the waiting list for the next game
// (they used the "/next" Discord command)
type Waiter struct {
	Username          string
	DiscordMention    string
	DatetimeRequested time.Time
}

func waitingListAlert(g *Game, creator string) {
	if len(waitingList) == 0 {
		return
	}

	// Build a list of everyone on the waiting list
	mentionList := ""
	for _, waiter := range waitingList {
		mentionList += waiter.DiscordMention + ", "
	}
	mentionList = strings.TrimSuffix(mentionList, ", ")

	// Empty the waiting list
	waitingList = make([]*Waiter, 0)

	// Alert all of the people on the waiting list
	alert := creator + " created a table. (" + variants[g.Options.Variant] + ")\n" + mentionList
	discordSend(discordListenChannels[0], "", alert) // Assume that the first channel listed in the "discordListenChannels" slice is the main channel
}

func waitingListAdd(m *discordgo.MessageCreate) {
	// Get the Discord guild object
	var guild *discordgo.Guild
	if v, err := discord.Guild(discordListenChannels[0]); err != nil { // Assume that the first channel ID is the same as the server ID
		log.Error("Failed to get the Discord guild.")
	} else {
		guild = v
	}

	// Get their custom nickname for the Discord server, if any
	var username string
	for _, member := range guild.Members {
		if member.User.ID != m.Author.ID {
			continue
		}

		if member.Nick == "" {
			username = member.User.Username
		} else {
			username = member.Nick
		}
	}

	msg := username + ", I will ping you when the next table opens."
	discordSend(m.ChannelID, "", msg)
	waiter := &Waiter{
		Username:          username,
		DiscordMention:    m.Author.Mention(),
		DatetimeRequested: time.Now(),
	}
	waitingList = append(waitingList, waiter)

	// Remove them from the waiting list if a game has not started
	go waitingListTimeout(waiter)
}

func waitingListTimeout(oldWaiter *Waiter) {
	// Delay for a reasonable amount of time
	time.Sleep(idleWaitingListTimeout)

	// Prevent race conditions
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// See if they are still on the waiting list
	for i, waiter := range waitingList {
		if waiter == oldWaiter {
			// They are still on the waiting list, so remove them
			waitingList = append(waitingList[:i], waitingList[i+1:]...)
			log.Info("Removed " + waiter.Username + " from the waiting list since the waiting timeout has elapsed.")
			break
		}
	}
}
