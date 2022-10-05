package main

import (
	"context"
	"strconv"
)

// commandTableVoteForTermination is sent when the user clicks the terminate button in the bottom-left-hand
// corner
//
// Example data:
// {
//   tableID: 5,
//   server: true, // True if a server-initiated termination, otherwise omitted
// }
func commandTableVoteForTermination(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not playing at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot vote to terminate it.")
		return
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning("You can not vote to terminate a game that has not started yet.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not vote to terminate a replay.")
		return
	}

	voteForTermination(ctx, s, d, t, playerIndex)
}

func voteForTermination(ctx context.Context, s *Session, d *CommandData, t *Table, playerIndex int) {
	newVote := t.ChangeVote(playerIndex)
	// Notify the player about his vote
	s.NotifyVote(newVote)
	if t.ShouldTerminateByVotes() {
		actionType := ActionTypeEndGameByVote
		endCondition := EndConditionTerminatedByVote
		index := -1
		// In 2p, there's no vote
		if t.Options.NumPlayers == 2 {
			actionType = ActionTypeEndGame
			endCondition = EndConditionTerminated
			index = playerIndex
		}
		commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:     t.ID,
			Type:        actionType,
			Target:      index,
			Value:       endCondition,
			Votes:       t.GetVotes(),
			NoTableLock: true,
		})
	}
}
