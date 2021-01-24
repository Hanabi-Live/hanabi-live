package table

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type actionData struct {
	userID     int
	username   string
	actionType constants.ActionType
	target     int
	value      int
}

func (m *Manager) Action(
	userID int,
	username string,
	actionType constants.ActionType,
	target int,
	value int,
) {
	m.newRequest(requestTypeAction, &actionData{ // nolint: errcheck
		userID:     userID,
		username:   username,
		actionType: actionType,
		target:     target,
		value:      value,
	})
}

func (m *Manager) action(data interface{}) {
	var d *actionData
	if v, ok := data.(*actionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table
	g := t.Game

	if !m.actionValidate(d) {
		g.InvalidActionOccurred = true
		return
	}

	// i := t.getPlayerIndexFromID(d.userID)
	// p := g.Players[i]

	// Keep track that an action happened (so that the game is not terminated due to idleness)
	// But don't update it if we are ending the game
	if d.actionType != constants.ActionTypeEndGame {
		t.datetimeLastAction = time.Now()
	}
}

func (m *Manager) actionValidate(d *actionData) bool {
	// Local variables
	t := m.table
	g := t.Game
	i := t.getPlayerIndexFromID(d.userID)

	// Validate that the game has started
	if !t.Running {
		m.Dispatcher.Sessions.NotifyWarning(d.userID, constants.NotStartedFail)
		return false
	}

	// Validate that it is not a replay
	if t.Replay {
		msg := "You cannot perform a game action in a shared replay."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that they are in the game
	if i == -1 {
		msg := fmt.Sprintf("You are not playing at table %v, so you cannot send an action.", t.ID)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	if d.actionType != constants.ActionTypeEndGame {
		// Validate that it is this player's turn
		if g.ActivePlayerIndex != i {
			msg := "It is not your turn, so you cannot perform an action."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		// Validate that the game is not paused
		if g.Paused {
			msg := "You cannot perform a game action when the game is paused."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}

		// Validate that a player is not doing an illegal action for their character
		if t.Options.DetrimentalCharacters {
			p := g.Players[i]

			if !m.characterValidateAction(d, p) {
				return false
			}

			if !m.characterValidateSecondAction(d, p) {
				return false
			}
		}
	}

	return true
}

/*
	// Do different tasks depending on the action
	if actionFunction, ok := actionFunctions[d.Type]; ok {
		if !actionFunction(s, d, g, p) {
			g.InvalidActionOccurred = true
			return
		}
	} else {
		s.Warning("That is not a valid action type.")
		g.InvalidActionOccurred = true
		return
	}

	// Do post-action tasks
	characterPostAction(d, g, p)

	// Send a message about the current status
	t.NotifyStatus()

	// Adjust the timer for the player that just took their turn
	// (if the game is over now due to a player running out of time, we don't need to adjust the
	// timer because we already set it to 0 in the "checkTimer" function)
	if d.Type != ActionTypeEndGame {
		p.Time -= time.Since(g.DatetimeTurnBegin)
		// (in non-timed games,
		// "Time" will decrement into negative numbers to show how much time they are taking)

		// In timed games, a player gains additional time after performing an action
		if t.Options.Timed {
			p.Time += time.Duration(t.Options.TimePerTurn) * time.Second
		}

		g.DatetimeTurnBegin = time.Now()
	}

	// If a player has just taken their final turn,
	// mark all of the cards in their hand as not able to be played
	// (but don't do this if we are in an end game that has a custom amount of turns)
	if g.Options.DetrimentalCharacters {
		if characterHasTakenLastTurn(g) {
			for _, c := range p.Hand {
				c.CannotBePlayed = true
			}
		}
	} else if g.EndTurn != -1 &&
		g.EndTurn != g.Turn+len(g.Players)+1 {

		for _, c := range p.Hand {
			c.CannotBePlayed = true
		}
	}

	// Increment the turn
	// (but don't increment it if we are on a characters that take two turns in a row)
	if !characterNeedsToTakeSecondTurn(d, g, p) {
		g.Turn++
		if g.TurnsInverted {
			// In Golang, "%" will give the remainder and not the modulus,
			// so we need to ensure that the result is not negative or we will get a
			// "index out of range" error
			g.ActivePlayerIndex += len(g.Players)
			g.ActivePlayerIndex = (g.ActivePlayerIndex - 1) % len(g.Players)
		} else {
			g.ActivePlayerIndex = (g.ActivePlayerIndex + 1) % len(g.Players)
		}
	}
	nextPlayer := g.Players[g.ActivePlayerIndex]
	nextPlayerSession := t.Players[nextPlayer.Index].Session

	// Check for character-related softlocks
	// (we will set the strikes to 3 if there is a softlock)
	characterCheckSoftlock(g, nextPlayer)

	// Check for end game states
	if g.CheckEnd() {
		// Append a game over action
		g.Actions = append(g.Actions, ActionGameOver{
			Type:         "gameOver",
			EndCondition: g.EndCondition,
			PlayerIndex:  g.EndPlayer,
		})
		t.NotifyGameAction()
	}

	// Send the new turn
	t.NotifyTurn()

	if g.EndCondition == EndConditionInProgress {
		hLog.Infof("%v It is now %v's turn.", t.GetName(), nextPlayer.Name)
	} else {
		g.End(ctx, d)
		return
	}

	// Send everyone new clock values
	t.NotifyTime()

	if t.Options.Timed && !t.ExtraOptions.NoWriteToDatabase {
		// Start the function that will check to see if the current player has run out of time
		// (since it just got to be their turn)
		go g.CheckTimer(ctx, nextPlayer.Time, g.Turn, g.PauseCount, nextPlayer)

		// If the next player queued a pause command, then pause the game
		if nextPlayer.RequestedPause {
			nextPlayer.RequestedPause = false
			commandPause(ctx, nextPlayerSession, &CommandData{ // nolint: exhaustivestruct
				TableID:     t.ID,
				Setting:     "pause",
				NoTableLock: true,
			})
		}
	}
}

*/
