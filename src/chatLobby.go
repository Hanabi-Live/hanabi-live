package main

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// /here
func chatHere(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	// Check to see if enough time has passed from the last @here
	msg := ""
	if time.Since(discordLastAtHere) < discordAtHereTimeout {
		timeCanPingAgain := discordLastAtHere.Add(discordAtHereTimeout)
		minutesLeft := int(math.Ceil(time.Until(timeCanPingAgain).Minutes()))
		msg += "In order to prevent spam, "
		msg += "you need to wait another " + strconv.Itoa(minutesLeft) + " minutes "
		msg += "before you can send out another mass ping."
	} else {
		// If the command was sent from the lobby, "d.Username" will be blank
		if d.Username == "" && s != nil {
			d.Username = s.Username()
		}
		msg += d.Username + " wants to play. Anyone "
		test := false
		if len(d.Args) > 0 && d.Args[0] == "test" {
			test = true
			msg += "here? (This is just a test.)"
		} else {
			msg += "@here?"
		}
		if len(d.Args) > 0 && d.Args[0] != "" && d.Args[0] != "test" {
			msg += " " + strings.Join(d.Args, " ")
		}

		// Record the time of the "@here" ping so that we can enforce the time limit
		if !test {
			discordLastAtHere = time.Now()
			if err := db.DiscordMetadata.Put("last_at_here", discordLastAtHere.Format(time.RFC3339)); err != nil {
				log.Error("Failed to update the database for the last @here:", err)
				return
			}
		}
	}
	if len(waitingList) > 0 {
		msg += "\n" + waitingListGetNum() + ":\n"
		for _, waiter := range waitingList {
			msg += waiter.DiscordMention + ", "
		}
		msg = strings.TrimSuffix(msg, ", ")
	}
	chatServerSend(msg, d.Room)
}

// /last
func chatLast(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	// Get the time elapsed since the last @here
	elapsedMinutes := int(math.Ceil(time.Since(discordLastAtHere).Minutes()))
	msg := "It has been " + strconv.Itoa(elapsedMinutes) + " minutes since the last mass ping."
	chatServerSend(msg, d.Room)
}

// /next
func chatNext(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	waitingListAdd(s, d)
}

// /unnext
func chatUnnext(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	waitingListRemove(s, d)
}

// /list
func chatList(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	waitingListList(s, d)
}

// /restart
func chatRestart(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	shutdown(true)
}

// /graceful
func chatGraceful(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	graceful(true)
}

// /shutdown
func chatShutdown(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	graceful(false)
}

// /maintenance
func chatMaintenance(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	if !isAdmin(s, d) {
		return
	}

	shuttingDown = true
	chatServerSend("The server is entering maintenance mode. "+
		"New game creation has been disabled.", "lobby")
}

// /cancel
func chatCancel(s *Session, d *CommandData, t *Table) {
	// Validate the channel
	if d.Room != "lobby" {
		chatServerSend("You can only perform this command in the lobby.", d.Room)
		return
	}

	if !isAdmin(s, d) {
		chatServerSend("You must be an admin in order to perform this command.", d.Room)
		return
	}

	shuttingDown = false
	chatServerSend("Server restart has been canceled. New game creation has been enabled.", d.Room)
}
