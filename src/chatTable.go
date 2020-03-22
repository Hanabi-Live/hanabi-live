package main

import (
	"strconv"
	"time"
)

/*
	Game chat commands
*/

// /s
func chatS(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, len(t.Players)+1)
}

// /s2
func chatS2(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 2)
}

// /s3
func chatS3(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 3)
}

// /s4
func chatS4(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 4)
}

// /s5
func chatS5(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 5)
}

// /s6
func chatS6(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 6)
}

// /startin
func chatStartIn(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if t.Running {
		chatServerSend("The game is already started, so you cannot use that command.", d.Room)
		return
	}

	if s.UserID() != t.Owner {
		chatServerSend("Only the table owner can use that command.", d.Room)
		return
	}

	// If the user did not specify the amount of minutes, assume 1
	if len(d.Args) != 1 {
		d.Args = []string{"1"}
	}

	var minutesToWait int
	if v, err := strconv.Atoi(d.Args[0]); err != nil {
		chatServerSend("You must specify the amount of minutes to wait. (e.g. \"/startin 1\")",
			d.Room)
		return
	} else {
		minutesToWait = v
	}

	timeToWait := time.Duration(minutesToWait) * time.Minute
	timeToStart := time.Now().Add(timeToWait)
	t.DatetimePlannedStart = timeToStart
	announcement := "The game will automatically start in " + strconv.Itoa(minutesToWait) +
		" minute"
	if minutesToWait != 1 {
		announcement += "s"
	}
	announcement += "."
	chatServerSend(announcement, d.Room)
	go startIn(t, timeToWait, timeToStart)
}

// /pause
func chatPause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if !t.Running {
		chatServerSend("The game is not yet started, so you cannot use that command.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "pause",
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if !t.Running {
		chatServerSend("The game is not yet started, so you cannot use that command.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "unpause",
	})
}

/*
	Subroutines
*/

func automaticStart(s *Session, d *CommandData, t *Table, numPlayers int) {
	if t == nil {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if t.Running {
		chatServerSend("The game is already started, so you cannot use that command.", d.Room)
		return
	}

	if s.UserID() != t.Owner {
		chatServerSend("Only the table owner can use that command.", d.Room)
		return
	}

	if len(t.Players) == numPlayers {
		commandTableStart(s, nil)
	} else {
		t.AutomaticStart = numPlayers
		chatServerSend("The game will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", d.Room)
	}
}

func startIn(t *Table, timeToWait time.Duration, datetimePlannedStart time.Time) {
	// Sleep until it is time to automatically start
	time.Sleep(timeToWait)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the table still exists
	if _, ok := tables[t.ID]; !ok {
		return
	}

	// Check to see if the game has already started
	if t.Running {
		return
	}

	// Check to see if the planned start time has changed
	if datetimePlannedStart != t.DatetimePlannedStart {
		return
	}

	// Check to see if the owner is present
	for _, p := range t.Players {
		if p.ID == t.Owner {
			if !p.Present {
				room := "table" + strconv.Itoa(t.ID)
				chatServerSend("Aborting automatic game start since the table creator is away.",
					room)
				return
			}

			logger.Info(t.GetName() + " Automatically starting (from the /startin command).")
			commandTableStart(p.Session, nil)
			return
		}
	}

	logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
}
