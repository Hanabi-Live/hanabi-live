package main

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// /here
func chatHere(s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ChatCommandNotInLobbyFail, d.Room)
		return
	}

	// Validate that this is coming from a Discord user
	if d.DiscordID == "" {
		chatServerSend(ChatCommandNotDiscordFail, d.Room)
		return
	}

	// Check to see if enough time has passed from the last @here
	msg := ""
	if time.Since(discordLastAtHere) < DiscordAtHereTimeout {
		timeCanPingAgain := discordLastAtHere.Add(DiscordAtHereTimeout)
		minutesLeft := int(math.Ceil(time.Until(timeCanPingAgain).Minutes()))
		msg += "In order to prevent spam, you need to wait "
		if minutesLeft == 1 {
			msg += "a minute "
		} else {
			msg += "another " + strconv.Itoa(minutesLeft) + " minutes "
		}
		msg += "before you can send out another mass ping."
	} else {
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
			if err := models.Metadata.Put(
				"discord_last_at_here",
				discordLastAtHere.Format(time.RFC3339),
			); err != nil {
				logger.Error("Failed to update the database for the last @here:", err)
				return
			}
		}
	}

	chatServerSend(msg, d.Room)
}

// /last
func chatLast(s *Session, d *CommandData, t *Table) {
	if t != nil {
		chatServerSend(ChatCommandNotInLobbyFail, d.Room)
		return
	}

	// Validate that this is coming from a Discord user
	if d.DiscordID == "" {
		chatServerSend(ChatCommandNotDiscordFail, d.Room)
		return
	}

	// Get the time elapsed since the last @here
	elapsedMinutes := int(math.Ceil(time.Since(discordLastAtHere).Minutes()))
	msg := "It has been " + strconv.Itoa(elapsedMinutes) + " minutes since the last mass ping."
	chatServerSend(msg, d.Room)
}
