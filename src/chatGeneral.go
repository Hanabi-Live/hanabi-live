package main

import (
	"fmt"
	"strconv"
	"time"
)

// /help
func chatHelp(s *Session, d *CommandData, t *Table) {
	msg := "You can see the list of chat commands here: "
	msg += "https://github.com/Zamiell/hanabi-live/blob/master/docs/CHAT_COMMANDS.md"
	chatServerSend(msg, d.Room)
}

// /rules
func chatRules(s *Session, d *CommandData, t *Table) {
	msg := "Please follow the Hanabi Live community guidelines: "
	msg += "https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md"
	chatServerSend(msg, d.Room)
}

// /discord
func chatDiscord(s *Session, d *CommandData, t *Table) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerSend(msg, d.Room)
}

// /random [min] [max]
func chatRandom(s *Session, d *CommandData, t *Table) {
	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		chatServerSend("That is not a correct usage of the /random command.", d.Room)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		if _, err := strconv.ParseFloat(d.Args[0], 64); err != nil {
			chatServerSend("\""+d.Args[0]+"\" is not a number.", d.Room)
		} else {
			chatServerSend("The /random command only accepts integers.", d.Room)
		}
		return
	} else {
		arg1 = v
	}
	if len(d.Args) == 2 {
		if v, err := strconv.Atoi(d.Args[1]); err != nil {
			if _, err := strconv.ParseFloat(d.Args[1], 64); err != nil {
				chatServerSend("\""+d.Args[1]+"\" is not a number.", d.Room)
			} else {
				chatServerSend("The /random command only accepts integers.", d.Room)
			}
			return
		} else {
			arg2 = v
		}
	}

	// Assign min and max, depending on how many arguments were passed
	var min, max int
	if len(d.Args) == 1 {
		min = 1
		max = arg1
	} else if len(d.Args) == 2 {
		min = arg1
		max = arg2
	}

	// Do a sanity check
	if min >= max {
		msg := strconv.Itoa(min) + " is greater than or equal to " + strconv.Itoa(max) + ", " +
			"so that request is nonsensical."
		chatServerSend(msg, d.Room)
		return
	}

	randNum := getRandom(min, max)
	msg := "Random number between " + strconv.Itoa(min) + " and " + strconv.Itoa(max) + ": " +
		strconv.Itoa(randNum)
	chatServerSend(msg, d.Room)
}

// /uptime
func chatUptime(s *Session, d *CommandData, t *Table) {
	chatServerSend(getCameOnline(), d.Room)
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime:", err)
		chatServerSend(defaultErrorMsg, d.Room)
		return
	} else {
		uptime = v
	}
	chatServerSend(uptime, d.Room)
}
func getCameOnline() string {
	return "The server came online at: " + formatTimestampUnix(datetimeStarted)
}
func getUptime() (string, error) {
	elapsedTime := time.Since(datetimeStarted)
	elapsedSeconds := elapsedTime.Seconds()
	elapsedSecondsString := fmt.Sprintf("%f", elapsedSeconds)
	var durationString string
	if v, err := secondsToDurationString(elapsedSecondsString); err != nil {
		return "", err
	} else {
		durationString = v
	}
	return "Uptime: " + durationString, nil
}

// /debug
// Even though "/debug" is an admin-only command,
// we wait to be able to use it both in the lobby and in-game
func chatDebug(s *Session, d *CommandData, t *Table) {
	if !isAdmin(s, d) {
		return
	}

	debug()
}
