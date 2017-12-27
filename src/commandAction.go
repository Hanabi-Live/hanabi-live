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
		// 3 is a deck blind play (added in the emulator)
		// 4 is end game (only used by the server when enforcing a time limit)
	}
*/

package main

func commandAction(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the game exists
	var g *Game
	if v, ok := games[s.CurrentGame()]; !ok {
		return
	} else {
		g = v
	}

	// Validate that the game has started
	if !g.Running {
		return
	}

	// Validate that they are in the game
	i := g.GetIndex(s.Username())
	if i == -1 {
		return
	}

	// Validate that it is this player's turn
	if g.PlayerIndex != i {
		return
	}

	/*
		Action
	*/

	// Local variables
	p := g.Players[i]

	// Remove the "fail" and "blind" states
	g.CurrentSound = ""

	// Handle card-reordering
	if g.Turn >= g.DiscardSignal.TurnExpiration {
		g.DiscardSignal.Outstanding = false
	}
	if g.Options.ReorderCards &&
		g.DiscardSignal.Outstanding &&
		d.Type != 1 && // (it doesn't happen on a play or a deck-play)
		d.Type != 3 {

		// Find the chop card
		chopIndex := g.Players[i].GetChopIndex()

		// We don't need to reorder anything if the chop is slot 1
		// (the left-most card)
		if chopIndex != len(p.Hand)-1 {
			chopCard := p.Hand[chopIndex]

			// Remove the chop card from their hand
			p.Hand = append(p.Hand[:chopIndex], p.Hand[chopIndex+1:]...)

			// Add it to the end (the left-most position)
			p.Hand = append(p.Hand, chopCard)

			// Make an array that represents the order of the player's hand
			handOrder := make([]int, 0)
			for _, card := range p.Hand {
				handOrder = append(handOrder, card.Order)
			}

			// Notify everyone about the reordering
			action := &Action{
				Type:      "reorder",
				Target:    i,
				HandOrder: handOrder,
			}
			g.Actions = append(g.Actions, action)
			g.NotifyAction()
		}
	}

	// Do different tasks depending on the action
	if d.Type == 0 {
		// Clue
		// Validate that the player is not giving a clue to themselves
		if g.PlayerIndex == d.Target {
			return
		}

		// Validate that there are clues available to use
		if g.Clues == 0 {
			return
		}

		p.GiveClue(g, d)
	} else if d.Type == 1 {
		// Play
		p.RemoveCard()
		p.PlayCard()
		p.DrawCard()
	} else if d.Type == 2 {
		// Discard
		// We are not allowed to discard while at 8 clues
		// (the client should enforce this, but do a check just in case)
		if g.Clues == 8 {
			return
		}

		g.Clues++
		p.RemoveCard()
		p.DiscardCard()
		p.DrawCard()
	} else if d.Type == 3 {
		// Deck play
		// We are not allowed to blind play the deck unless there is only 1 card left
		// (the client should enforce this, but do a check just in case)
		if g.DeckIndex != len(g.Deck)-1 {
			return
		}

		p.PlayDeck()
	} else if d.Type == 4 {
		// This is a special action type sent by the server to itself when a player runs out of time
		g.Strikes = 3

		action := &Action{
			Text: p.Name + " ran out of time!",
		}
		g.Actions = append(g.Actions, action)
		g.NotifyAction()
	} else {
		return
	}
}
