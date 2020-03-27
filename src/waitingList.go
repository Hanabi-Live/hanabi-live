package main

import (
	"strconv"
	"strings"
	"time"
)

/*
	Main functions
*/

func waitingListInit() {
	if v, err := models.DiscordWaiters.GetAll(); err != nil {
		logger.Fatal("Failed to get the Discord waiters from the database:", err)
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
			chatServerSend("There is not a Discord account matching your username, "+
				"so you cannot use this command.", d.Room)
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
			chatServerSend(d.Username+", you are already on the waiting list.", d.Room)
			return
		}
	}

	// Add them to the database and the slice in memory
	waiter := &Waiter{
		Username:        d.Username,
		DiscordMention:  discordMention,
		DatetimeExpired: time.Now().Add(idleWaitingListTimeout),
	}
	if err := models.DiscordWaiters.Insert(waiter); err != nil {
		msg := "Failed to insert the waiter into the database: " + err.Error()
		logger.Error(msg)
		chatServerSend(msg, d.Room)
		return
	}
	waitingList = append(waitingList, waiter)

	// Announce it
	msg := d.Username + ", I will ping you when the next table opens.\n"
	msg += "(" + waitingListGetNum() + ".)"
	chatServerSend(msg, d.Room)
}

func waitingListRemove(s *Session, d *CommandData) {
	waitingListPurgeOld()

	// If they did the command through the lobby, then we need to find out their Discord ID
	if d.DiscordID == "" {
		d.DiscordID = discordGetID(d.Username)
		if d.DiscordID == "" {
			chatServerSend("There is not a Discord account matching your username, "+
				"so you cannot use this command.", d.Room)
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
			chatServerSend(d.Username+", you have been removed from the waiting list.", d.Room)
			return
		}
	}

	chatServerSend(d.Username+", you are not on the waiting list.", d.Room)
}

func waitingListList(s *Session, d *CommandData) {
	waitingListPurgeOld()
	msg := waitingListGet()
	chatServerSend(msg, d.Room)
}

func waitingListAlert(t *Table, creator string) {
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
	if err := models.DiscordWaiters.DeleteAll(); err != nil {
		msg := "Failed to delete the waiters in the database: " + err.Error()
		logger.Error(msg)
		chatServerSend(msg, "lobby")
		return
	}
	waitingList = make([]*Waiter, 0)

	// Alert all of the people on the waiting list
	msg := creator + " created a table. (" + t.Options.Variant + ")\n" + mentionList
	chatServerSend(msg, "lobby")

	// Also, copy the people who were pinged to the pre-game chat for reference
	chatServerSend("Alerted players: "+usernameList, "table"+strconv.Itoa(t.ID))
}

/*
	Subroutines
*/

func waitingListRemoveSub(i int) {
	// Remove them from the the database
	if err := models.DiscordWaiters.Delete(waitingList[i].Username); err != nil {
		msg := "Failed to delete \"" + waitingList[i].Username + "\" from the database: " + err.Error()
		logger.Error(msg)
		chatServerSend(msg, "lobby")
		return
	}

	// Remove it from the slice in memory
	waitingList = append(waitingList[:i], waitingList[i+1:]...)
}

func waitingListPurgeOld() {
	for i := len(waitingList) - 1; i >= 0; i-- {
		waiter := waitingList[i]
		if time.Now().After(waiter.DatetimeExpired) {
			waitingListRemoveSub(i)
			logger.Info("User \"" + waiter.Username + "\" was purged from the waiting list (due to expiry).")
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
