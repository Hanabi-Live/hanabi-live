package main

import (
	"strconv"
	"strings"
	"time"
)

type ChatMessage struct {
	Msg      string    `json:"msg"`
	Who      string    `json:"who"`
	Discord  bool      `json:"discord"`
	Server   bool      `json:"server"`
	Datetime time.Time `json:"datetime"`
}

func chatMakeMessage(msg string, who string, discord bool, server bool, datetime time.Time) *ChatMessage {
	return &ChatMessage{
		Msg:      msg,
		Who:      who,
		Discord:  discord,
		Server:   server,
		Datetime: datetime,
	}
}

func chatHere(s *Session) {
	// Check to see if enough time has passed from the last @here
	msg := ""
	if time.Since(discordLastAtHere) < discordAtHereTimeout {
		timeCanPingAgain := discordLastAtHere.Add(discordAtHereTimeout)
		minutesLeft := time.Until(timeCanPingAgain).Minutes()
		msg += "You need to wait another " + floatToString(minutesLeft) + " minutes before you can send out another mass ping."
	} else {
		msg += s.Username() + " wants to play. Anyone @here?"
	}
	if len(waitingList) > 0 {
		msg += "\n"
		for _, waiter := range waitingList {
			msg += waiter.DiscordMention + ", "
		}
		msg = strings.TrimSuffix(msg, ", ")
	}
	d := &CommandData{
		Msg:    msg,
		Room:   "lobby",
		Server: true,
		Echo:   true,
	}
	commandChat(nil, d)
}

func chatRandom(s *Session, d *CommandData) {
	var prefix string
	if strings.HasPrefix(d.Msg, "/random ") {
		prefix = "/random "
	} else if strings.HasPrefix(d.Msg, "/rand ") {
		prefix = "/rand "
	}
	msg := strings.TrimPrefix(d.Msg, prefix)
	args := strings.Split(msg, " ")
	if len(args) != 2 {
		return
	}

	var min int
	if v, err := strconv.Atoi(args[0]); err != nil {
		return
	} else {
		min = v
	}

	var max int
	if v, err := strconv.Atoi(args[1]); err != nil {
		return
	} else {
		max = v
	}

	if max-min <= 0 {
		return
	}

	randNum := getRandom(min, max)
	msg = "Random number between " + args[0] + " and " + args[1] + ": **" + strconv.Itoa(randNum) + "**"
	// This is formatted for Discord, so it will look a little weird in the lobby
	d = &CommandData{
		Msg:    msg,
		Room:   "lobby",
		Server: true,
		Echo:   true,
	}
	commandChat(nil, d)
}
