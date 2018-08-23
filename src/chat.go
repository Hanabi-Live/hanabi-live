package main

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

/*
	Chat command functions
*/

func chatHere(s *Session, d *CommandData) {
	// Check to see if enough time has passed from the last @here
	msg := ""
	log.Debug("DEBUG:")
	log.Debug("time.Now():", time.Now())
	log.Debug("discordLastAtHere:", discordLastAtHere)
	log.Debug("since:", time.Since(discordLastAtHere))
	if time.Since(discordLastAtHere) < discordAtHereTimeout {
		timeCanPingAgain := discordLastAtHere.Add(discordAtHereTimeout)
		minutesLeft := int(math.Ceil(time.Until(timeCanPingAgain).Minutes()))
		msg += "In order to prevent spam, you need to wait another " + strconv.Itoa(minutesLeft) + " minutes before you can send out another mass ping."
	} else {
		// If the command was sent from the lobby, "d.Username" will be blank
		if d.Username == "" && s != nil {
			d.Username = s.Username()
		}
		msg += d.Username + " wants to play. Anyone "
		if len(d.Args) > 0 && d.Args[0] == "test" {
			msg += "here? (This is just a test.)"
		} else {
			msg += "@here?"
		}
		if len(d.Args) > 0 && d.Args[0] != "" && d.Args[0] != "test" {
			msg += " " + strings.Join(d.Args, " ")
		}
	}
	if len(waitingList) > 0 {
		msg += "\n" + waitingListGetNum() + ":\n"
		for _, waiter := range waitingList {
			msg += waiter.DiscordMention + ", "
		}
		msg = strings.TrimSuffix(msg, ", ")
	}
	chatServerSend(msg)
}

func chatLast(s *Session, d *CommandData) {
	// Get the time elapsed since the last @here
	elapsedMinutes := int(math.Ceil(time.Since(discordLastAtHere).Minutes()))
	msg := "It has been " + strconv.Itoa(elapsedMinutes) + " minutes since the last mass ping."
	chatServerSend(msg)
}

func chatRandom(s *Session, d *CommandData) {
	errorMsg := "That is not a correct usage of the /random command."

	// We expect something like "/random 2" or "/random 1 2"
	if len(d.Args) != 1 && len(d.Args) != 2 {
		chatServerSend(errorMsg)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		chatServerSend(errorMsg)
		return
	} else {
		arg1 = v
	}
	if len(d.Args) == 2 {
		if v, err := strconv.Atoi(d.Args[1]); err != nil {
			chatServerSend(errorMsg)
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
	if max-min <= 0 {
		chatServerSend(errorMsg)
		return
	}

	randNum := getRandom(min, max)
	msg := "Random number between " + d.Args[0] + " and " + d.Args[1] + ": " + strconv.Itoa(randNum)
	// This is formatted for Discord, so it will look a little weird in the lobby
	chatServerSend(msg)
}

/*
	Subroutines
*/

type ChatMessage struct {
	Msg      string    `json:"msg"`
	Who      string    `json:"who"`
	Discord  bool      `json:"discord"`
	Server   bool      `json:"server"`
	Datetime time.Time `json:"datetime"`
	Room     string    `json:"room"`
}

func chatMakeMessage(msg string, who string, discord bool, server bool, datetime time.Time, room string) *ChatMessage {
	return &ChatMessage{
		Msg:      msg,
		Who:      who,
		Discord:  discord,
		Server:   server,
		Datetime: datetime,
		Room:     room,
	}
}

// chatServerSend is a helper function to give feedback to a user after they type a command
// It will go to the #general channel instead of the #hanabi-live-bot channel
// (since we set "Echo" equal to true)
func chatServerSend(msg string) {
	d := &CommandData{
		Msg:    msg,
		Room:   "lobby",
		Server: true,
		Echo:   true,
	}
	commandChat(nil, d)
}

func chatFillMentions(msg string) string {
	// Discord mentions are in the form of "<@71242588694249472>"
	// By the time the message gets here, it will be sanitized to "&lt;@71242588694249472&gt;"
	// They can also be in the form of "<@!71242588694249472>" (with a "!" after the "@") if a nickname is set for that person
	// We want to convert this to the username, so that the lobby displays messages in a manner similar to the Discord client
	var mentionRegExp *regexp.Regexp
	if v, err := regexp.Compile(`&lt;@!*(\d+?)&gt;`); err != nil {
		log.Error("Failed to create the Discord mention regular expression:", err)
		return msg
	} else {
		mentionRegExp = v
	}

	for {
		match := mentionRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) < 2 {
			break
		}
		discordID := match[1]
		username := discordGetNickname(discordID)
		msg = strings.Replace(msg, "&lt;@"+discordID+"&gt;", "@"+username, -1)
		msg = strings.Replace(msg, "&lt;@!"+discordID+"&gt;", "@"+username, -1)
	}
	return msg
}
