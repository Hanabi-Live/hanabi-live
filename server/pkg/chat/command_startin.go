package chat

import (
	"fmt"
	"math"
	"strconv"
	"time"
)

// /startin [minutes]
func (m *Manager) chatStartIn() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	// Validate the amount of minutes to wait
	if len(d.Args) != 1 {
		msg := "You must specify the amount of minutes to wait. (e.g. \"/startin 1\")"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}

	var minutesToWait float64
	if v, err := strconv.ParseFloat(d.Args[0], 64); err != nil {
		msg := fmt.Sprintf("\"%v\" is not a valid number.", d.Args[0])
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	} else {
		minutesToWait = v
	}

	if minutesToWait <= 0 {
		msg := "The minutes to wait must be greater than 0."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	if minutesToWait > 10 {
		msg := "The minutes to wait cannot be greater than 10."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	secondsToWait := int(math.Ceil(minutesToWait * 60))
	timeToWait := time.Duration(secondsToWait) * time.Second
	timeToStart := time.Now().Add(timeToWait)
	t.DatetimePlannedStart = timeToStart
	var startTimeString string
	if secondsToWait < 60 {
		startTimeString = fmt.Sprintf("%v seconds", secondsToWait)
	} else if secondsToWait == 60 {
		startTimeString += "1 minute"
	} else {
		startTimeString += fmt.Sprintf("%v minutes", d.Args[0])
	}

	msg := fmt.Sprintf("The game will automatically start in %v.", startTimeString)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)

	go startIn(ctx, t, timeToWait, timeToStart)
}

// startIn is meant to be run in a goroutine.
func startIn(
	t *Table,
	timeToWait time.Duration,
	datetimePlannedStart time.Time,
) {
	// Sleep until it is time to automatically start
	time.Sleep(timeToWait)

	// Check to see if the table still exists
	t2, exists := getTableAndLock(ctx, nil, t.ID, false, false)
	if !exists || t != t2 {
		return
	}
	t.Lock(ctx)
	defer t.Unlock(ctx)

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
		if p.UserID == t.OwnerID {
			if !p.Present {
				msg := "Aborting automatic game start since the table creator is away."
				chatServerSend(ctx, msg, t.GetRoomName(), false)
				return
			}

			hLog.Infof(
				"%v Automatically starting (from the /startin command).",
				t.GetName(),
			)
			commandTableStart(ctx, p.Session, &CommandData{ // nolint: exhaustivestruct
				TableID:     t.ID,
				NoTableLock: true,
			})
			return
		}
	}

	hLog.Errorf(
		"%v Failed to find the owner of the game when attempting to automatically start it.",
		t.GetName(),
	)
}
