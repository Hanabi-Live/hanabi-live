/*
	Sent when the user performs an action in a shared replay
	"data" example:
	{
		type: 0,
		// 0 is a turn change
		// 1 is a manual card order indication
		value: 10,
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
		s.NotifyError("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that this is a shared replay
	if !g.SharedReplay {
		s.NotifyError("Game " + strconv.Itoa(gameID) + " is not a shared replay, so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is leading the review
	if s.UserID() != g.Owner {
		s.NotifyError("You cannot send a shared replay action unless you are the leader.")
		return
	}

	// Validate numeric value
	if d.Value < 0 {
		s.NotifyError("That is an invalid value for the shared replay action.")
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
	} else {
		s.NotifyError("That is an invalid type of shared replay action.")
		return
	}
}
