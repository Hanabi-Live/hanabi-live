package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Waiter is a person who is on the waiting list for the next game
// (they used the "/next" Discord command)
type Waiter struct {
	DiscordMention  string
	DatetimeExpired time.Time
}

func waitingListAlert(g *Game, creator string) {
	if len(waitingList) == 0 {
		return
	}

	// Build a list of everyone on the waiting list
	mentionList := ""
	for _, waiter := range waitingList {
		if waiter.DatetimeExpired.After(time.Now()) {
			mentionList += waiter.DiscordMention + ", "
		}
	}
	mentionList = strings.TrimSuffix(mentionList, ", ")

	// Empty the waiting list
	waitingList = make([]*Waiter, 0)

	// Alert all of the people on the waiting list
	alert := creator + " created a table. (" + variants[g.Options.Variant] + ")\n" + mentionList
	discordSend(discordListenChannels[0], "", alert) // Assume that the first channel listed in the "discordListenChannels" slice is the main channel
}

func waitingListAdd(m *discordgo.MessageCreate) {
	username := discordGetNickname(m)

	// Search through the waiting list to see if they are already on it
	for _, waiter := range waitingList {
		if waiter.DiscordMention == m.Author.Mention() {
			// Update their expiry time
			waiter.DatetimeExpired = time.Now().Add(idleWaitingListTimeout)

			// Let them know
			msg := username + ", you are already on the waiting list."
			discordSend(m.ChannelID, "", msg)
			return
		}
	}

	// Add them to the list
	waiter := &Waiter{
		DiscordMention:  m.Author.Mention(),
		DatetimeExpired: time.Now().Add(idleWaitingListTimeout),
	}
	waitingList = append(waitingList, waiter)

	// Announce it
	msg := username + ", I will ping you when the next table opens.\n"
	msg += "(There "
	if len(waitingList) > 1 {
		msg += "are " + strconv.Itoa(len(waitingList)) + " people"
	} else {
		msg += "is " + strconv.Itoa(len(waitingList)) + " person"
	}
	msg += " on the waiting list.)"
	discordSend(m.ChannelID, "", msg)
}
