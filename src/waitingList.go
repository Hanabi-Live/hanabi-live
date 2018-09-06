package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
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

func waitingListAdd(s *Session, d *CommandData) {
	waitingListPurgeOld()

	// If they did the command through the lobby, then we need to find out their Discord ID
	if d.DiscordID == "" {
		d.DiscordID = discordGetID(d.Username)
		if d.DiscordID == "" {
			chatServerSend("There is not a Discord account matching your username, so you cannot use this command.")
			return
		}
	}

	// Compile their Discord mention, which is in the format of "<@1234567890>"
	discordMention := "<@" + d.DiscordID + ">"

	// Search through the waiting list to see if they are already on it
	for _, waiter := range waitingList {
		if waiter.DiscordMention == discordMention {
			// Update their expiry time
			waiter.DatetimeExpired = time.Now().Add(idleWaitingListTimeout)

			// Let them know
			chatServerSend(d.Username + ", you are already on the waiting list.")
			return
		}
	}

	// Add them to the database and the slice in memory
	waiter := &models.Waiter{
		Username:        d.Username,
		DiscordMention:  discordMention,
		DatetimeExpired: time.Now().Add(idleWaitingListTimeout),
	}
	db.DiscordWaiters.Insert(waiter)
	waitingList = append(waitingList, waiter)

	// Announce it
	msg := d.Username + ", I will ping you when the next table opens.\n"
	msg += "(" + waitingListGetNum() + ".)"
	chatServerSend(msg)
}

func waitingListRemove(s *Session, d *CommandData) {
	waitingListPurgeOld()

	// If they did the command through the lobby, then we need to find out their Discord ID
	if d.DiscordID == "" {
		d.DiscordID = discordGetID(d.Username)
		if d.DiscordID == "" {
			chatServerSend("There is not a Discord account matching your username, so you cannot use this command.")
			return
		}
	}

	// Compile their Discord mention, which is in the format of "<@1234567890>"
	discordMention := "<@" + d.DiscordID + ">"

	// Search through the waiting list to see if they are already on it
	for i, waiter := range waitingList {
		if waiter.DiscordMention == discordMention {
			// Remove them
			waitingListRemoveSub(i)

			// Let them know
			chatServerSend(d.Username + ", you have been removed from the waiting list.")
			return
		}
	}

	chatServerSend(d.Username + ", you are not on the waiting list.")
}

func waitingListList(s *Session, d *CommandData) {
	waitingListPurgeOld()
	msg := waitingListGet()
	chatServerSend(msg)
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

	// Empty the waiting list in the database and in memory
	db.DiscordWaiters.DeleteAll()
	waitingList = make([]*models.Waiter, 0)

	// Alert all of the people on the waiting list
	alert := creator + " created a table. (" + variants[g.Options.Variant].Name + ")\n" + mentionList
	chatServerSend(alert)
}

/*
	Subroutines
*/

func waitingListRemoveSub(i int) {
	// Remove them from the the database
	db.DiscordWaiters.Delete(waitingList[i].Username)

	// Remove it from the slice in memory
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

func waitingListGet() string {
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

	return msg
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
