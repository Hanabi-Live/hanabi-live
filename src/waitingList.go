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
	if err := db.DiscordWaiters.Insert(waiter); err != nil {
		msg := "Failed to insert the waiter into the database: " + err.Error()
		log.Error(msg)
		chatServerSend(msg)
		return
	}
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
	usernameList := ""
	for _, waiter := range waitingList {
		usernameList += waiter.Username + ", "
	}
	usernameList = strings.TrimSuffix(usernameList, ", ")
	mentionList := ""
	for _, waiter := range waitingList {
		mentionList += waiter.DiscordMention + ", "
	}
	mentionList = strings.TrimSuffix(mentionList, ", ")

	// Empty the waiting list in the database and in memory
	if err := db.DiscordWaiters.DeleteAll(); err != nil {
		msg := "Failed to delete the waiters in the database: " + err.Error()
		log.Error(msg)
		chatServerSend(msg)
		return
	}
	waitingList = make([]*models.Waiter, 0)

	// Alert all of the people on the waiting list
	alert := creator + " created a table. (" + g.Options.Variant + ")\n" + mentionList
	chatServerSend(alert)

	// Also, copy the people who were pinged to the pre-game chat for reference
	chatServerPregameSend("Alerted players: "+usernameList, g.ID)
}

/*
	Subroutines
*/

func waitingListRemoveSub(i int) {
	// Remove them from the the database
	if err := db.DiscordWaiters.Delete(waitingList[i].Username); err != nil {
		msg := "Failed to delete \"" + waitingList[i].Username + "\" from the database: " + err.Error()
		log.Error(msg)
		chatServerSend(msg)
		return
	}

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
