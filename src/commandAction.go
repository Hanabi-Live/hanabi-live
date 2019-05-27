/*
	Sent when the user performs an in-game action
	"data" example:
	{
		clue: { // Not present if the type is 1 or 2
			type: 0, // 0 is a rank clue, 1 is a color clue
			value: 1, // If a rank clue, corresponds to the number
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
		// 4 is a time limit reached (only used by the server)
		// 5 is a idle limit reached (only used by the server)
	}
*/

package main

import (
	"strconv"
	"strings"
	"time"
)

func commandAction(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the game has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started a game yet.")
		return
	}

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not table " + strconv.Itoa(tableID) + ", so you cannot send an action.")
		return
	}

	// Validate that it is this player's turn
	if t.Game.ActivePlayer != i && d.Type != actionTypeIdleLimitReached {
		s.Warning("It is not your turn, so you cannot perform an action.")
		return
	}

	// Validate that it is not a replay
	if t.Game.Replay {
		s.Warning("You cannot perform a game action in a shared replay.")
		return
	}

	// Validate that the table is not paused
	if t.Game.Paused {
		s.Warning("You cannot perform a game action when the table is paused.")
		return
	}

	// Local variables
	p := t.GameSpec.Players[i]

	// Validate that a player is not doing an illegal action for their character
	if characterValidateAction(s, d, t, p) {
		return
	}
	if characterValidateSecondAction(s, d, t, p) {
		return
	}

	/*
		Action
	*/

	// Remove the "fail#" and "blind#" states
	t.Game.Sound = ""

	// Start the idle timeout
	// (but don't update the idle variable if we are ending the table due to idleness)
	if d.Type != actionTypeIdleLimitReached {
		go t.CheckIdle()
	}

	// Do different tasks depending on the action
	doubleDiscard := false
	if d.Type == actionTypeClue {
		// Validate that the target of the clue is sane
		if d.Target < 0 || d.Target > len(t.GameSpec.Players)-1 {
			s.Warning("That is an invalid clue target.")
			return
		}

		// Validate that the player is not giving a clue to themselves
		if t.Game.ActivePlayer == d.Target {
			s.Warning("You cannot give a clue to yourself.")
			return
		}

		// Validate that there are clues available to use
		if t.Game.Clues == 0 {
			s.Warning("You cannot give a clue when the team has 0 clues left.")
			return
		}
		if strings.HasPrefix(t.GameSpec.Options.Variant, "Clue Starved") && t.Game.Clues == 1 {
			s.Warning("You cannot give a clue when the team only has 0.5 clues.")
			return
		}

		// Validate that the clue type is sane
		if d.Clue.Type < clueTypeRank || d.Clue.Type > clueTypeColor {
			s.Warning("That is an invalid clue type.")
			return
		}

		// Validate that rank clues are valid
		if d.Clue.Type == clueTypeRank {
			valid := false
			for _, rank := range variants[t.GameSpec.Options.Variant].ClueRanks {
				if rank == d.Clue.Value {
					valid = true
					break
				}
			}
			if !valid {
				s.Warning("That is an invalid rank clue.")
				return
			}
		}

		// Validate that the color clues are valid
		if d.Clue.Type == clueTypeColor &&
			(d.Clue.Value < 0 || d.Clue.Value > len(variants[t.GameSpec.Options.Variant].ClueColors)-1) {

			s.Warning("That is an invalid color clue.")
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckClue(s, d, t, p) {
			return
		}

		// Validate that the clue touches at least one card
		p2 := t.GameSpec.Players[d.Target] // The target of the clue
		touchedAtLeastOneCard := false
		for _, c := range p2.Hand {
			if variantIsCardTouched(t.GameSpec.Options.Variant, d.Clue, c) {
				touchedAtLeastOneCard = true
				break
			}
		}
		if !touchedAtLeastOneCard &&
			// Make an exception if they have the optional setting for "Empty Clues" turned on
			!t.GameSpec.Options.EmptyClues &&
			// Make an exception for the "Color Blind" variants (color clues touch no cards),
			// "Number Blind" variants (rank clues touch no cards),
			// and "Totally Blind" variants (all clues touch no cards)
			(!strings.HasPrefix(t.GameSpec.Options.Variant, "Color Blind") || d.Clue.Type != clueTypeColor) &&
			(!strings.HasPrefix(t.GameSpec.Options.Variant, "Number Blind") || d.Clue.Type != clueTypeRank) &&
			!strings.HasPrefix(t.GameSpec.Options.Variant, "Totally Blind") &&
			// Make an exception for certain characters
			!characterEmptyClueAllowed(d, t, p) {

			s.Warning("You cannot give a clue that touches 0 cards in the hand.")
			return
		}

		p.GiveClue(d, t)

		// Mark that the blind-play streak has ended
		t.Game.BlindPlays = 0

		// Mark that the misplay streak has ended
		t.Game.Misplays = 0

	} else if d.Type == actionTypePlay {
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckPlay(s, d, t, p) {
			return
		}

		c := p.RemoveCard(d.Target, t)
		doubleDiscard = p.PlayCard(t, c)
		p.DrawCard(t)

	} else if d.Type == actionTypeDiscard {
		// Validate that the card is in their hand
		if !p.InHand(d.Target) {
			s.Warning("You cannot play a card that is not in your hand.")
			return
		}

		// Validate that the team is not at the maximum amount of clues
		// (the client should enforce this, but do a check just in case)
		clueLimit := maxClues
		if strings.HasPrefix(t.GameSpec.Options.Variant, "Clue Starved") {
			clueLimit *= 2
		}
		if t.Game.Clues == clueLimit {
			s.Warning("You cannot discard while the team has " + strconv.Itoa(maxClues) + " clues.")
			return
		}

		// Validate "Detrimental Character Assignment" restrictions
		if characterCheckDiscard(s, t, p) {
			return
		}

		t.Game.Clues++
		c := p.RemoveCard(d.Target, t)
		doubleDiscard = p.DiscardCard(t, c)
		characterShuffle(t, p)
		p.DrawCard(t)

		// Mark that the blind-play streak has ended
		t.Game.BlindPlays = 0

		// Mark that the misplay streak has ended
		t.Game.Misplays = 0

	} else if d.Type == actionTypeDeckPlay {
		// Validate that deck play is enabled in the game options
		if !t.GameSpec.Options.DeckPlays {
			s.Warning("Deck plays are disabled for this table.")
			return
		}

		// Validate that there is only 1 card left
		// (the client should enforce this, but do a check just in case)
		if t.Game.DeckIndex != len(t.Game.Deck)-1 {
			s.Warning("You cannot blind play the deck until there is only 1 card left.")
			return
		}

		p.PlayDeck(t)

	} else if d.Type == actionTypeTimeLimitReached {
		// This is a special action type sent by the server to itself when a player runs out of time
		t.Game.Strikes = 3
		t.Game.EndCondition = actionTypeTimeLimitReached
		t.Game.Actions = append(t.Game.Actions, ActionText{
			Type: "text",
			Text: p.Name + " ran out of time!",
		})
		t.NotifyAction()

	} else if d.Type == actionTypeIdleLimitReached {
		// This is a special action type sent by the server to itself when the table has been idle for too long
		t.Game.Strikes = 3
		t.Game.EndCondition = actionTypeIdleLimitReached
		t.Game.Actions = append(t.Game.Actions, ActionText{
			Type: "text",
			Text: "Players were idle for too long.",
		})
		t.NotifyAction()

	} else {
		s.Warning("That is not a valid action type.")
		return
	}

	// Do post-action tasks
	characterPostAction(d, t, p)

	// Send a message about the current status
	t.NotifyStatus(doubleDiscard)

	// Adjust the timer for the player that just took their turn
	// (if the game is over now due to a player running out of time, we don't
	// need to adjust the timer because we already set it to 0 in the
	// "checkTimer" function)
	if d.Type != actionTypeTimeLimitReached {
		p.Time -= time.Since(t.Game.TurnBeginTime)
		// (in untimed games, "Time" will decrement into negative numbers to show how much time they are taking)

		// In timed games, a player gains additional time after performing an action
		if t.GameSpec.Options.Timed {
			p.Time += time.Duration(t.GameSpec.Options.TimePerTurn) * time.Second
		}

		t.Game.TurnBeginTime = time.Now()
	}

	// If a player has just taken their final turn,
	// mark all of the cards in their hand as not able to be played
	if t.Game.EndTurn != -1 && t.Game.EndTurn != t.Game.Turn+len(t.GameSpec.Players)+1 {
		log.Info(t.GetName() + "Player \"" + p.Name + "\" just took their final turn; " +
			"marking the rest of the cards in their hand as not playable.")
		for _, c := range p.Hand {
			c.CannotBePlayed = true
		}
	}

	// Increment the turn
	// (but don't increment it if we are on a characters that takes two turns in a row)
	if !characterTakingSecondTurn(d, t, p) {
		t.Game.Turn++
		if t.Game.TurnsInverted {
			// In Golang, "%" will give the remainder and not the modulus,
			// so we need to ensure that the result is not negative or we will get a "index out of range" error below
			t.Game.ActivePlayer += len(t.GameSpec.Players)
			t.Game.ActivePlayer = (t.Game.ActivePlayer - 1) % len(t.GameSpec.Players)
		} else {
			t.Game.ActivePlayer = (t.Game.ActivePlayer + 1) % len(t.GameSpec.Players)
		}
	}
	np := t.GameSpec.Players[t.Game.ActivePlayer] // The next player

	// Check for character-related softlocks
	// (we will set the strikes to 3 if there is a softlock)
	characterCheckSoftlock(t, np)

	// Check for game end states
	if t.Game.CheckEnd() {
		var text string
		if t.Game.EndCondition > endConditionNormal {
			text = "Players lose!"
		} else {
			text = "Players score " + strconv.Itoa(t.Game.Score) + " points."
		}
		t.Game.Actions = append(t.Game.Actions, ActionText{
			Type: "text",
			Text: text,
		})
		t.NotifyAction()
		log.Info(t.GetName() + " " + text)
	}

	// Send the new turn
	// This must be below the end-game text (e.g. "Players lose!"),
	// so that it is combined with the final action
	t.NotifyTurn()

	if t.Game.EndCondition == endConditionInProgress {
		log.Info(t.GetName() + " It is now " + np.Name + "'s turn.")
	} else if t.Game.EndCondition == endConditionNormal {
		if t.Game.Score == t.Game.GetPerfectScore() {
			t.Game.Sound = "finished_perfect"
		} else {
			// The players did got get a perfect score, but they did not strike out either
			t.Game.Sound = "finished_success"
		}
	} else if t.Game.EndCondition > endConditionNormal {
		t.Game.Sound = "finished_fail"
	}

	// Tell every client to play a sound as a notification for the action taken
	t.NotifySound()

	if t.Game.EndCondition > endConditionInProgress {
		t.End()
		return
	}

	// Send the "allowed actions" message to the next player
	np.Session.NotifyAllowedActions(t)

	// Send every user connected an update about this table
	// (this is sort of wasteful but is necessary for users to see if it is
	// their turn from the lobby and also to see the progress of other games)
	if !t.NoDatabase {
		// Don't send table updates if we are in the process of emulating JSON actions
		notifyAllTable(t)
	}

	// Send everyone new clock values
	t.NotifyTime()

	if t.GameSpec.Options.Timed {
		// Start the function that will check to see if the current player has run out of time
		// (since it just got to be their turn)
		go t.CheckTimer(t.Game.Turn, t.Game.PauseCount, np)

		// If the player queued a pause command, then pause the game
		if np.RequestedPause {
			np.RequestedPause = false
			np.Session.Set("currentTable", t.ID)
			np.Session.Set("status", statusPlaying)
			commandPause(np.Session, &CommandData{
				Value: "pause",
			})
		}
	}
}
