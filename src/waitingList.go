package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/bwmarrin/discordgo"
)

/*
	Main functions
*/

func waitingListInit() {
	if v, err := db.DiscordWaiters.GetAll(); err != nil {
		log.Fatal("Failed to get the Discord waiters from the database:", err)
	} else {
		waitingList = v
	}
}

func waitingListAdd(m *discordgo.MessageCreate) {
	waitingListPurgeOld()
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

	// Add them to the database and the slice in memory
	waiter := &models.Waiter{
		Username:        username,
		DiscordMention:  m.Author.Mention(),
		DatetimeExpired: time.Now().Add(idleWaitingListTimeout),
	}
	db.DiscordWaiters.Insert(waiter)
	waitingList = append(waitingList, waiter)

	// Announce it
	msg := username + ", I will ping you when the next table opens.\n"
	msg += "(" + waitingListGetNum() + ".)"
	discordSend(m.ChannelID, "", msg)
}

func waitingListRemove(m *discordgo.MessageCreate) {
	waitingListPurgeOld()
	username := discordGetNickname(m)

	// Search through the waiting list to see if they are already on it
	for i, waiter := range waitingList {
		if waiter.DiscordMention == m.Author.Mention() {
			// Remove them
			waitingListRemoveSub(i)

			// Let them know
			msg := username + ", you have been removed from the waiting list."
			discordSend(m.ChannelID, "", msg)
			return
		}
	}

	msg := username + ", you are not on the waiting list."
	discordSend(m.ChannelID, "", msg)
}

func waitingListList(m *discordgo.MessageCreate) {
	waitingListPurgeOld()
	msg := waitingListGetNum()
	if len(waitingList) == 0 {
		msg += "."
	} else {
		msg += ":\n"
		for _, waiter := range waitingList {
			msg += waiter.Username + ", "
		}
		msg = strings.TrimSuffix(msg, ", ")

	}
	discordSend(m.ChannelID, "", msg)
}

func waitingListAlert(g *Game, creator string) {
	waitingListPurgeOld()
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
	waitingList = make([]*models.Waiter, 0)

	// Alert all of the people on the waiting list
	alert := creator + " created a table. (" + variants[g.Options.Variant].Name + ")\n" + mentionList

	for _, s := range sessions {
		s.NotifyChat(alert, "", false, true, time.Now(), "lobby")
	}

	// Assume that the first channel listed in the "discordListenChannels" slice is the main channel
	discordSend(discordListenChannels[0], "", alert)
}

/*
	Subroutines
*/

func waitingListRemoveSub(i int) {
	// Remove them from the the database
	db.DiscordWaiters.Delete(waitingList[i].Username)

	// Remove it to the slice in memory
	waitingList = append(waitingList[:i], waitingList[i+1:]...)
}

func waitingListPurgeOld() {
	for {
		deleted := false
		for i, waiter := range waitingList {
			if time.Now().After(waiter.DatetimeExpired) {
				deleted = true
				waitingListRemoveSub(i)
				log.Info("User \"" + waiter.Username + "\" was purged from the waiting list (due to expiry).")
				break
			}
		}
		if !deleted {
			break
		}
	}
}

func waitingListGetNum() string {
	msg := "There "
	if len(waitingList) == 1 {
		msg += "is 1 person"
	} else {
		msg += "are " + strconv.Itoa(len(waitingList)) + " people"
	}
	msg += " on the waiting list"
	return msg
}
