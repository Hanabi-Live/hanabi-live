package main

import (
	"strconv"
	"time"
)

type Table struct {
	ID         int
	Name       string
	// The user ID of the person who started the table
	// or the current leader of the shared replay
	Owner   int
	Visible bool // Whether or not this table is shown to other users
	// This is a salted SHA512 hash sent by the client,
	// but it can technically be any string at all
	Password           string

	Spectators         []*Spectator
	DisconSpectators   map[int]bool
	DatetimeCreated    time.Time
	DatetimeLastAction time.Time

	AutomaticStart     int  // See "chatPregame.go"
	NoDatabase         bool // Set to true for tables created from arbitrary JSON

	Chat        []*TableChatMessage // All of the in-table chat history
	ChatRead    map[int]int        // A map of which users have read which messages

        Game               *Game
        GameSpec           *GameSpec
}

type TableChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}


func (t *Table) GetName() string {
	return "Table #" + strconv.Itoa(t.ID) + " (" + t.Name + ") - Turn " + strconv.Itoa(t.Game.Turn) + " - "
}

func (t *Table) GetSpectatorIndex(id int) int {
	for i, sp := range t.Spectators {
		if sp.ID == id {
			return i
		}
	}
	return -1
}

// CheckTimer is meant to be called in a new goroutine
func (t *Table) CheckTimer(turn int, pauseCount int, p *Player) {
	// Sleep until the active player runs out of time
	time.Sleep(p.Time)
	commandMutex.Lock()
	defer commandMutex.Unlock()

        var g = t.Game

	// Check to see if the table ended already
	if g.EndCondition > endConditionInProgress {
		return
	}

	// Check to see if we have made a move in the meanwhile
	if turn != g.Turn {
		return
	}

	// Check to see if the table is currently paused
	if g.Paused {
		return
	}

	// Check to see if the table was paused while we were sleeping
	if pauseCount != g.PauseCount {
		return
	}

	p.Time = 0
	log.Info(t.GetName() + "Time ran out for \"" + p.Name + "\".")

	// End the table
	p.Session.Set("currentTable", t.ID)
	p.Session.Set("status", statusPlaying)
	commandAction(p.Session, &CommandData{
		Type: actionTypeTimeLimitReached,
	})
}

// CheckIdle is meant to be called in a new goroutine
func (t *Table) CheckIdle() {
	// Set the last action
	commandMutex.Lock()
	t.DatetimeLastAction = time.Now()
	commandMutex.Unlock()

	// We want to clean up idle tables, so sleep for a reasonable amount of time
	if t.GameSpec.Options.Correspondence {
		time.Sleep(idleTableTimeoutCorrespondence)
	} else {
		time.Sleep(idleTableTimeout)
	}
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the table still exists
	if _, ok := tables[t.ID]; !ok {
		return
	}

	// Don't do anything if there has been an action in the meantime
	if time.Since(t.DatetimeLastAction) < idleTableTimeout {
		return
	}

	log.Info(t.GetName() + " Idle timeout has elapsed; ending the table.")

	if t.Game.Replay {
		// If this is a replay,
		// we want to send a message to the client that will take them back to the lobby
		t.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(t.Spectators) > 0 {
		s := t.Spectators[0].Session
		s.Set("currentTable", t.ID)
		s.Set("status", statusSpectating)
		commandGameUnattend(s, nil)
	}

	if t.Game.Replay {
		// If this is a replay, then we are done;
		// it should automatically end now that all of the spectators have left
		return
	}

	// Get the session of the owner
	var s *Session
	for _, p := range t.GameSpec.Players {
		if p.Session.UserID() == t.Owner {
			s = p.Session
			break
		}
	}

        if t.Game.Running {
                // We need to end a table that has started
                // (this will put everyone in a non-shared replay of the idle table)
                s.Set("currentTable", t.ID)
                s.Set("status", statusPlaying)
                commandAction(s, &CommandData{
                        Type: actionTypeIdleLimitReached,
                })
        } else {
		// We need to end a table that hasn't started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		s.Set("currentTable", t.ID)
		s.Set("status", statusPregame)
		commandTableLeave(s, nil)
        }

}
