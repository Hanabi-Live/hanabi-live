package main

import (
	"context"
	"encoding/json"
	"io/ioutil"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

type SimpleResponse struct {
	Command  string
	Response string
	Alias    []string
	Private  bool
	IsHelp   bool
}

var OneLiners = make(map[string]SimpleResponse)
var Helpers = make([]string, 0)

func chatAddOneLineResponses() {
	// Make a list of commands so far
	commands := make([]string, 0)

	for c := range chatCommandMap {
		commands = append(commands, "/"+c)
	}

	// Load external one-line responses
	source := path.Join(jsonPath, "chatCommands.json")
	contents, _ := ioutil.ReadFile(source)

	var responses []SimpleResponse
	if err := json.Unmarshal(contents, &responses); err != nil {
		logger.Error("chatInitializeOneLiners: Error during responses init.")
	}

	// General commands (that work both in the lobby and at a table)
	for _, r := range responses {
		OneLiners[r.Command] = r
		chatCommandMap[r.Command] = chatOneLiner
		commands = append(commands, "/"+r.Command)
		if r.IsHelp {
			Helpers = append(Helpers, r.Command)
		}
		for _, alias := range r.Alias {
			OneLiners[alias] = r
			chatCommandMap[alias] = chatOneLiner
			if r.IsHelp {
				Helpers = append(Helpers, r.Command)
			}
		}
	}

	// Add list of commands to helpers
	sort.Strings(commands)
	help := strings.Join(commands, ", ")
	// replace hyphen with non breaking one
	help = strings.Replace(help, "-", "&#8209;", -1)
	for c, r := range OneLiners {
		if r.IsHelp {
			r.Response = "<br>List of commands:<br>" + help + "<br>" + r.Response
			OneLiners[c] = r
		}
	}
}

// Function for all one-line responses
func chatOneLiner(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	r := OneLiners[cmd]
	if r.Private {
		chatServerSendPM(s, r.Response, d.Room)
	} else {
		chatServerSend(ctx, r.Response, d.Room, d.NoTablesLock)
	}
}

// /replay [databaseID] [turn]
func chatReplay(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	msg := getReplayURL(d.Args)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}

// /random [min] [max]
func chatRandom(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
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
			msg := "\"" + d.Args[0] + "\" is not an integer."
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
				msg := "\"" + d.Args[1] + "\" is not an integer."
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
func chatUptime(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
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
func chatTimeLeft(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
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
