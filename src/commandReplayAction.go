/*
	Sent when the user performs an action in a shared replay
	"data" example:
	{
		type: 0,
		// 0 is a turn change
		// 1 is a manual card order indication
		// 2 is a leader transfer
		value: 10,
		name: 'Zamiel',
	}
*/

package main

import "strconv"

func commandReplayAction(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Error("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that this is a shared replay
	if !g.SharedReplay {
		s.Error("Game " + strconv.Itoa(gameID) + " is not a shared replay, so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is leading the review
	if s.UserID() != g.Owner {
		s.Error("You cannot send a shared replay action unless you are the leader.")
		return
	}

	// Validate numeric value
	if d.Value < 0 {
		s.Error("That is an invalid value for the shared replay action.")
		return
	}

	/*
		Replay action
	*/

	// Change the current turn
	if d.Type == 0 {
		g.Turn = d.Value
	}

	// Send the message to everyone else
	if d.Type == 0 {
		for _, sp := range g.Spectators {
			type ReplayTurnMessage struct {
				Turn int `json:"turn"`
			}
			sp.Emit("replayTurn", &ReplayTurnMessage{
				Turn: d.Value,
			})
		}
	} else if d.Type == 1 {
		for _, sp := range g.Spectators {
			type ReplayIndicatorMessage struct {
				Order int `json:"order"`
			}
			sp.Emit("replayIndicator", &ReplayIndicatorMessage{
				Order: d.Value,
			})
		}
	} else if d.Type == 2 {
		// Validate that the person that they are passing off the leader to actually exists in the game
		newLeaderID := -1
		for _, sp := range g.Spectators {
			if sp.Username() == d.Name {
				newLeaderID = sp.UserID()
				break
			}
		}
		if newLeaderID == -1 {
			s.Error("That is an invalid username to pass leadership to.")
			return
		}

		// Mark them as the new replay leader
		g.Owner = newLeaderID

		// Tell everyone about the new leader
		// (which will enable the replay controls for the leader)
		for _, sp := range g.Spectators {
			sp.NotifyReplayLeader(g)
		}
	} else {
		s.Error("That is an invalid type of shared replay action.")
		return
	}
}
