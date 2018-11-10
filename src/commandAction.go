/*
	Sent when the user performs an in-game action
	"data" example:
	{
		clue: { // Not present if the type is 1 or 2
			type: 0, // 0 is a number clue, 1 is a color clue
			value: 1, // If a number clue, corresponds to the number
			// If a color clue:
			// 0 is blue
			// 1 is green
			// 2 is yellow
			// 3 is red
			// 4 is purple
			// (these mappings change in the mixed variants)
		},
		target: 1,
		// Either the player index of the recipient of the clue, or the card ID
		// (e.g. the first card of the deck drawn is card #1, etc.)
		type: 0,
		// 0 is a clue
		// 1 is a play
		// 2 is a discard
		// 3 is a deck blind play
		// 4 is a timer limit reached (only used by the server)
		// 5 is a idle limit reached (only used by the server)
	}
*/

package main

import (
	"strconv"
	"time"
)

func commandAction(s *Session, d *CommandData) {
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

	// Validate that the game has started
	if !g.Running {
		s.Warning("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not game " + strconv.Itoa(gameID) + ", so you cannot send an action.")
		return
	}

	// Validate that it is this player's turn
	if g.ActivePlayer != i && d.Type != 5 { // Make an exception for idle timeouts
		s.Warning("It is not your turn, so you cannot perform an action.")
		return
	}

	// Validate that it is not a shared replay
	if g.SharedReplay {
		s.Warning("You cannot perform a game action in a shared replay.")
		return
	}

	// Local variables
	p := g.Players[i]

	// Validate that a player is not doing an illegal action for their character
	if characterValidateSecondAction(s, d, g, p) {
		return
	}

	/*
		Action
	*/

	// Remove the "fail" and "blind" states
	g.Sound = ""

	// Start the idle timeout
	// (but don't update the idle variable if we are ending the game due to idleness)
	if d.Type != 5 {
		go g.CheckIdle()
	}

	// Do different tasks depending on the action
	doubleDiscard := false
	if d.Type == 0 { // Clue
		// Validate that the target of the clue is sane
		if d.Target < 0 || d.Target > len(g.Players)-1 {
			s.Warning("That is an invalid clue target.")
			return
		}

		// Validate that the player is not giving a clue to themselves
		if g.ActivePlayer == d.Target {
			s.Warning("You cannot give a clue to yourself.")
			return
		}

		// Validate that there are clues available to use
		if g.Clues == 0 {
			s.Warning("You cannot give a clue when the team has 0 clues left.")
			return
		}

		// Validate that the clue type is sane
		if d.Clue.Type < 0 || d.Clue.Type > 1 {
			s.Warning("That is an invalid clue type.")
			return
		}

		// If it is a number clue, validate that the number clue is valid
		if d.Clue.Type == 0 && (d.Clue.Value < 0 || d.Clue.Value > 5) {
			s.Warning("That is an invalid number clue.")
			return
		}

		// If it is a color clue, validate that the color clue is valid
		if d.Clue.Type == 1 && (d.Clue.Value < 0 || d.Clue.Value > len(variants[g.Options.Variant].Clues)-1) {
			s.Warning("That is an invalid color clue.")
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckClue(s, d, g, p) {
			return
		}

		// The "GiveClue()" method will return false if the clue touches 0 cards in the hand
		if !p.GiveClue(g, d) {
			s.Warning("You cannot give a clue that touches 0 cards in the hand.")
			return
		}

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0
	} else if d.Type == 1 { // Play
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			return
		}

		c := p.RemoveCard(d.Target)
		doubleDiscard = p.PlayCard(g, c)
		p.DrawCard(g)
	} else if d.Type == 2 { // Discard
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			return
		}

		// Validate that the team is not at 8 clues
		// (the client should enforce this, but do a check just in case)
		if g.Clues == 8 {
			s.Warning("You cannot discard while the team has 8 clues.")
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckDiscard(s, g, p) {
			return
		}

		g.Clues++
		c := p.RemoveCard(d.Target)
		doubleDiscard = p.DiscardCard(g, c)
		p.DrawCard(g)

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0
	} else if d.Type == 3 { // Deck play
		// Validate that the game type allows deck plays
		if !g.Options.DeckPlays {
			s.Warning("Deck plays are disabled for this game.")
			return
		}

		// Validate that there is only 1 card left
		// (the client should enforce this, but do a check just in case)
		if g.DeckIndex != len(g.Deck)-1 {
			s.Warning("You cannot blind play the deck until there is only 1 card left.")
			return
		}

		p.PlayDeck(g)
	} else if d.Type == 4 { // Out of time
		// This is a special action type sent by the server to itself when a player runs out of time
		g.Strikes = 3
		g.Actions = append(g.Actions, Action{
			Text: p.Name + " ran out of time!",
		})
		g.NotifyAction()
	} else if d.Type == 5 { // Idle timeout
		// This is a special action type sent by the server to itself when the game has been idle for too long
		g.Strikes = 3
		g.Actions = append(g.Actions, Action{
			Text: "Players were idle for too long.",
		})
		g.NotifyAction()
	} else {
		return
	}

	// Send messages about the current status
	g.Actions = append(g.Actions, Action{
		Type:          "status",
		Clues:         g.Clues,
		Score:         g.Score,
		MaxScore:      g.MaxScore,
		DoubleDiscard: doubleDiscard,
	})
	g.NotifyAction()

	// Adjust the timer for the player that just took their turn
	// (if the game is over now due to a player running out of time, we don't
	// need to adjust the timer because we already set it to 0 in the
	// "checkTimer" function)
	if d.Type != 4 {
		p.Time -= time.Since(g.TurnBeginTime)
		// (in non-timed games, "Time" will decrement into negative numbers to show how much time they are taking)

		// In timed games, a player gains additional time after performing an action
		if g.Options.Timed {
			p.Time += time.Duration(g.Options.TimePerTurn) * time.Second
		}

		g.TurnBeginTime = time.Now()
	}

	// If this is the final go-around, mark that they have performed an action
	if g.EndPlayer != -1 {
		p.PerformedFinalTurn = true
	}

	// Increment the turn
	// (but don't increment it if we are on a characters that takes two turns in a row)
	if !characterTakingSecondTurn(d, g, p) {
		g.Turn++
		g.ActivePlayer = (g.ActivePlayer + 1) % len(g.Players)
	}
	np := g.Players[g.ActivePlayer] // The next player

	// Check for end game states
	if g.CheckEnd() {
		var text string
		if g.EndCondition > 1 {
			text = "Players lose!"
		} else {
			text = "Players score " + strconv.Itoa(g.Score) + " points"
		}
		g.Actions = append(g.Actions, Action{
			Text: text,
		})
		g.NotifyAction()
		log.Info(g.GetName() + " " + text)
	} else {
		// Send messages about the current turn
		g.Actions = append(g.Actions, Action{
			Type: "turn",
			Num:  g.Turn,
			Who:  g.ActivePlayer,
		})
		g.NotifyAction()
		log.Info(g.GetName() + " It is now " + np.Name + "'s turn.")
	}

	// Tell every client to play a sound as a notification for the action taken
	g.NotifySound()

	if g.EndCondition > 0 {
		g.End()
		return
	}

	// Send the "action" message to the next player
	np.Session.NotifyAction(g)

	// Send every user connected an update about this table
	// (this is sort of wasteful but is necessary for users to see if it is
	// their turn from the lobby and also to see the progress of other games)
	notifyAllTable(g)

	// Send everyone new clock values
	g.NotifyTime()

	if g.Options.Timed {
		// Start the function that will check to see if the current player has
		// run out of time (it just got to be their turn)
		go g.CheckTimer(g.Turn, np)
	}
}
