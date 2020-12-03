package main

import (
	"strconv"
)

func getReplayURL(args []string) string {
	if len(args) == 0 {
		return "The format of the /replay command is: /replay [game ID] [turn number]"
	}

	// Validate that the first argument is a number
	arg1 := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	var id int
	if v, err := strconv.Atoi(arg1); err != nil {
		if _, err := strconv.ParseFloat(arg1, 64); err != nil {
			return "\"" + arg1 + "\" is not a number."
		}
		return "The /replay command only accepts integers."
	} else {
		id = v
	}

	if len(args) == 0 {
		// They specified an ID but not a turn
		path := "/replay/" + strconv.Itoa(id)
		url := getURLFromPath(path)
		return url
	}

	// Validate that the second argument is a number
	arg2 := args[0]
	var turn int
	if v, err := strconv.Atoi(arg2); err != nil {
		if _, err := strconv.ParseFloat(arg2, 64); err != nil {
			return "\"" + arg2 + "\" is not a number."
		}
		return "The /replay command only accepts integers."
	} else {
		turn = v
	}

	// They specified an ID and a turn
	path := "/replay/" + strconv.Itoa(id) + "#" + strconv.Itoa(turn)
	url := getURLFromPath(path)
	return url
}
