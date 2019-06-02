/*
	Sent when the user clicks the "X" button in the bottom-left-hand corner
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameAbandon(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not game " + strconv.Itoa(gameID) + ", so you cannot abandon it.")
		return
	}

	// Validate that it is not a replay
	if g.Replay {
		s.Warning("You can not abandon a replay.")
		return
	}

	/*
		Abandon
	*/

	if !g.Running {
		// Just make them leave the game instead
		s.Set("currentGame", g.ID)
		s.Set("status", statusPregame)
		commandGameLeave(s, d)
		return
	}

	// We want to set the end condition before advancing the turn to ensure that
	// no active player will show
	g.EndCondition = endConditionAbandoned

	// Add a text message for the termination
	// and put it on its own turn so that it is separate from the final times
	text := s.Username() + " terminated the game!"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	g.Turn++
	g.NotifyTurn()

	// Play a sound to indicate that the game was terminated
	g.Sound = "finished_fail"
	g.NotifySound()

	// End the game and write it to the database
	g.End()
}
