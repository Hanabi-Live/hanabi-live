package main

import (
	"context"
	"strconv"
	"time"
)

// /help
func chatHelp(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "You can see the list of chat commands here: https://github.com/Zamiell/hanabi-live/blob/master/docs/CHAT_COMMANDS.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /discord
func chatDiscord(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "Join the Discord server: https://discord.gg/FADvkJp"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /rules
func chatRules(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "Please follow the community guidelines: https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /new
func chatNew(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "If you are looking to \"get into\" the game and spend a lot of time to play with experienced players, the Hyphen-ated group is always looking for more members. To start with, please read the beginners guide, which goes over how we play and how to join our next game: https://hanabi.github.io/docs/beginner/"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /doc
func chatDoc(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "The strategy reference for the Hyphen-ated group: https://hanabi.github.io/docs/reference/"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /bga
func chatBGA(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "If you have experience playing with the Board Game Arena convention framework and you are interested in playing with the Hyphen-ated group, then read this: https://github.com/hanabi/hanabi.github.io/blob/main/misc/BGA.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /efficiency
func chatEfficiency(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := "Info on efficiency calculation: https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /replay [databaseID] [turn]
func chatReplay(ctx context.Context, s *Session, d *CommandData, t *Table) {
	msg := getReplayURL(d.Args)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /random [min] [max]
func chatRandom(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		msg := "The format of the /random command is: /random [min] [max]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		if _, err := strconv.ParseFloat(d.Args[0], 64); err != nil {
			msg := "\"" + d.Args[0] + "\" is not a number."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		} else {
			msg := "The /random command only accepts integers."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		}
		return
	} else {
		arg1 = v
	}
	if len(d.Args) == 2 {
		if v, err := strconv.Atoi(d.Args[1]); err != nil {
			if _, err := strconv.ParseFloat(d.Args[1], 64); err != nil {
				msg := "\"" + d.Args[1] + "\" is not a number."
				chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			} else {
				msg := "The /random command only accepts integers."
				chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
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
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	randNum := getRandom(min, max)
	msg := "Random number between " + strconv.Itoa(min) + " and " + strconv.Itoa(max) + ": " +
		strconv.Itoa(randNum)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /uptime
func chatUptime(ctx context.Context, s *Session, d *CommandData, t *Table) {
	chatServerSend(ctx, getCameOnline(), d.Room, d.NoTablesLock)
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime: " + err.Error())
		chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
		return
	} else {
		uptime = v
	}
	chatServerSend(ctx, uptime, d.Room, d.NoTablesLock)
}

// /timeleft
func chatTimeLeft(ctx context.Context, s *Session, d *CommandData, t *Table) {
	var timeLeft string
	if v, err := getTimeLeft(); err != nil {
		logger.Error("Failed to get the time left: " + err.Error())
		chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
		return
	} else {
		timeLeft = v
	}

	chatServerSend(ctx, timeLeft, d.Room, d.NoTablesLock)
}

func getTimeLeft() (string, error) {
	if shuttingDown.IsNotSet() {
		return "The server is not scheduled to shutdown any time soon.", nil
	}

	timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
	timeLeftSeconds := int(timeLeft.Seconds())
	var durationString string
	if v, err := secondsToDurationString(timeLeftSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}

	return "Time left until server shutdown: " + durationString, nil
}
