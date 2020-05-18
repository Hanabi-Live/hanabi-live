package main

import (
	"strconv"
	"time"
)

// /help
func chatHelp(s *Session, d *CommandData, t *Table) {
	msg := "You can see the list of chat commands here: " +
		"https://github.com/Zamiell/hanabi-live/blob/master/docs/CHAT_COMMANDS.md"
	chatServerSend(msg, d.Room)
}

// /rules
func chatRules(s *Session, d *CommandData, t *Table) {
	msg := "Please follow the Hanabi Live community guidelines: " +
		"https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md"
	chatServerSend(msg, d.Room)
}

// /new
func chatNew(s *Session, d *CommandData, t *Table) {
	msg := "If you are looking to \"get into\" Hanabi and spend a lot of time to play with " +
		"experienced players, the Hyphen-ated group is always looking for more members. " +
		"To start with, please read the beginners guide: " +
		"https://github.com/Zamiell/hanabi-conventions/blob/master/Beginner.md"
	chatServerSend(msg, d.Room)
}

// /discord
func chatDiscord(s *Session, d *CommandData, t *Table) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerSend(msg, d.Room)
}

// /replay [game ID] [turn]
func chatReplay(s *Session, d *CommandData, t *Table) {
	if len(d.Args) == 0 {
		chatServerSend(
			"The format of the /replay command is: /replay [game ID] [turn number]",
			d.Room,
		)
		return
	}

	// Validate that the first argument is a number
	arg1 := d.Args[0]
	d.Args = d.Args[1:] // This will be an empty slice if there is nothing after the command
	var id int
	if v, err := strconv.Atoi(arg1); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg1, 64); err != nil {
			msg = "\"" + arg1 + "\" is not a number."
		} else {
			msg = "The /replay command only accepts integers."
		}
		chatServerSend(msg, d.Room)
		return
	} else {
		id = v
	}

	if len(d.Args) == 0 {
		// They specified an ID but not a turn
		msg := "https://hanabi.live/replay/" + strconv.Itoa(id)
		chatServerSend(msg, d.Room)
		return
	}

	// Validate that the second argument is a number
	arg2 := d.Args[0]
	var turn int
	if v, err := strconv.Atoi(arg2); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg2, 64); err != nil {
			msg = "\"" + arg2 + "\" is not a number."
		} else {
			msg = "The /replay command only accepts integers."
		}
		chatServerSend(msg, d.Room)
		return
	} else {
		turn = v
	}

	// They specified an ID and a turn
	msg := "https://hanabi.live/replay/" + strconv.Itoa(id) + "/" + strconv.Itoa(turn)
	chatServerSend(msg, d.Room)
}

// /random [min] [max]
func chatRandom(s *Session, d *CommandData, t *Table) {
	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		chatServerSend("The format of the /random command is: /random [min] [max]", d.Room)
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
		chatServerSend(DefaultErrorMsg, d.Room)
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
	elapsedSeconds := int(elapsedTime.Seconds())
	var durationString string
	if v, err := secondsToDurationString(elapsedSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}
	return "Uptime: " + durationString, nil
}

// /timeleft
func chatTimeLeft(s *Session, d *CommandData, t *Table) {
	var timeLeft string
	if v, err := getTimeLeft(); err != nil {
		logger.Error("Failed to get the time left:", err)
		chatServerSend(DefaultErrorMsg, d.Room)
		return
	} else {
		timeLeft = v
	}

	chatServerSend(timeLeft, d.Room)
}

func getTimeLeft() (string, error) {
	if !shuttingDown {
		return "The server is not scheduled to restart any time soon.", nil
	}

	timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
	timeLeftSeconds := int(timeLeft.Seconds())
	var durationString string
	if v, err := secondsToDurationString(timeLeftSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}

	return "Time left until server restart: " + durationString, nil
}
