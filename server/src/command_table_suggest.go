package main

import (
	"context"
)

type Suggestion struct {
	Username string
	Segment  int
}

// commandTableSuggest is sent when a user
// types the "/suggest [turn]" command
//
// Example data:
//
//	{
//	  tableID: 123,
//	  turn: 5,
//	}
func commandTableSuggest(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}
	if !t.Replay {
		s.Warning("You can only make suggestions in a shared replay.")
		return
	}

	if !t.Visible {
		s.Warning("You cannot make suggestions in a solo replay.")
		return
	}

	normalizedUsername := normalizeString(s.Username)

	var suggestion *Suggestion

	var spectator *Spectator
	for _, sp := range t.Spectators {
		if normalizeString(sp.Name) == normalizedUsername {
			spectator = sp
			break
		}
	}
	if spectator == nil {
		s.Error("You are not spectating the shared replay.")
		return
	}

	if spectator.UserID == t.OwnerID {
		s.Warning("You can only make suggestions if you are not the leader.")
		return
	}

	suggestion = &Suggestion{
		Username: spectator.Name,
		Segment:  d.Segment,
	}

	tableSuggest(ctx, s, d, t, suggestion)
}

func tableSuggest(
	ctx context.Context,
	s *Session,
	d *CommandData,
	t *Table,
	suggestion *Suggestion,
) {

	if t.Replay {
		t.NotifySuggestion(suggestion.Username, suggestion.Segment)
	}
}
