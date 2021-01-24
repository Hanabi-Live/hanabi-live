package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

func (t *table) getName() string {
	g := t.Game

	var turn string
	if g == nil {
		turn = "not started"
	} else {
		turn = fmt.Sprintf("turn %v", g.Turn)
	}

	return fmt.Sprintf("Table %v (%v)", t.ID, turn)
}

func (t *table) getPlayerIndexFromID(userID int) int {
	for i, p := range t.Players {
		if p.UserID == userID {
			return i
		}
	}

	return -1
}

func (t *table) getRoomName() string {
	return fmt.Sprintf("%v%v", constants.TableRoomPrefix, t.ID)
}

func (t *table) getSpectatorIndexFromID(userID int) int {
	for i, sp := range t.spectators {
		if sp.userID == userID {
			return i
		}
	}

	return -1
}

func (t *table) isOwnerPresent() bool {
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			return p.Present
		}
	}

	return false
}

/*
func getNewTableID() uint64 {
	tableIDs := tables.GetTableIDs()

	for {
		newTableID := atomic.AddUint64(&tableIDCounter, 1)

		// Ensure that the table ID does not conflict with any existing tables
		valid := true
		for _, tableID := range tableIDs {
			if tableID == newTableID {
				valid = false
				break
			}
		}
		if valid {
			return newTableID
		}
	}
}

func (t *Table) GetOwnerSession() *Session {
	if t.Replay {
		hLog.Error("The \"GetOwnerSession\" function was called on a table that is a replay.")
		return nil
	}

	var s *Session
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			s = p.Session
			if s == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s = NewFakeSession(p.UserID, p.Name)
				hLog.Info("Created a new fake session.")
			}
			break
		}
	}

	if s == nil {
		hLog.Errorf("Failed to find the owner for table: %v", t.ID)
		s = NewFakeSession(-1, "Unknown")
		hLog.Info("Created a new fake session.")
	}

	return s
}

func (t *Table) GetSharedReplayLeaderName() string {
	// Get the username of the game owner
	// (the "Owner" field is used to store the leader of the shared replay)
	for _, sp := range t.Spectators {
		if sp.UserID == t.OwnerID {
			return sp.Name
		}
	}

	// The leader is not currently present,
	// so try getting their username from the players object
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			return p.Name
		}
	}

	// The leader is not currently present and was not a member of the original game,
	// so we need to look up their username from the database
	if v, err := models.Users.GetUsername(t.OwnerID); err != nil {
		hLog.Errorf(
			"Failed to get the username for user %v who is the owner of table: %v",
			t.OwnerID,
			t.ID,
		)
		return "(Unknown)"
	} else {
		return v
	}
}

*/
