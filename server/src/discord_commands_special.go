package main

import (
	"strconv"

	"github.com/bwmarrin/discordgo"
)

func discordCommandReplay(m *discordgo.MessageCreate, args []string) {
	if len(args) == 0 {
		msg := "The format of the /replay command is: /replay [game ID] [turn number]"
		discordSend(m.ChannelID, "", msg)
		return
	}

	// Validate that the first argument is a number
	arg1 := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	var id int
	if v, err := strconv.Atoi(arg1); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg1, 64); err != nil {
			msg = "\"" + arg1 + "\" is not a number."
		} else {
			msg = "The /replay command only accepts integers."
		}
		discordSend(m.ChannelID, "", msg)
		return
	} else {
		id = v
	}

	if len(args) == 0 {
		// They specified an ID but not a turn
		path := "/replay/" + strconv.Itoa(id)
		url := getURLFromPath(path)
		// We enclose the link in "<>" to prevent Discord from generating a link preview
		msg := "<" + url + ">"
		discordSend(m.ChannelID, "", msg)
		return
	}

	// Validate that the second argument is a number
	arg2 := args[0]
	var turn int
	if v, err := strconv.Atoi(arg2); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg2, 64); err != nil {
			msg = "\"" + arg2 + "\" is not a number."
		} else {
			msg = "The /replay command only accepts integers."
		}
		discordSend(m.ChannelID, "", msg)
		return
	} else {
		turn = v
	}

	// They specified an ID and a turn
	path := "/replay/" + strconv.Itoa(id) + "#" + strconv.Itoa(turn)
	url := getURLFromPath(path)
	// We enclose the link in "<>" to prevent Discord from generating a link preview
	msg := "<" + url + ">"
	discordSend(m.ChannelID, "", msg)
}
