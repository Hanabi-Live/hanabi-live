package main

import (
	"strconv"
	"time"
)

var (
	actionFunctions map[int]func(*Session, *CommandData, *Game, *GamePlayer) bool
)

func actionsFunctionsInit() {
	actionFunctions = map[int]func(*Session, *CommandData, *Game, *GamePlayer) bool{
		ActionTypePlay:      commandActionPlay,
		ActionTypeDiscard:   commandActionDiscard,
		ActionTypeColorClue: commandActionClue,
		ActionTypeRankClue:  commandActionClue,
		ActionTypeEndGame:   commandActionEndGame,
	}
}

// commandAction is sent when the user performs an in-game action
//
// Example data:
// {
//   tableID: 5,
//   // Corresponds to "actionType" in "constants.go"
//   type: 0,
//   // If a play or a discard, corresponds to the order of the the card that was played/discarded
//   // If a clue, corresponds to the index of the player that received the clue
//   // If a game over, corresponds to the index of the player that caused the game to end
//   target: 1,
//   // Optional; only present if a clue
//   // If a color clue, then 0 if red, 1 if yellow, etc.
//   // If a rank clue, then 1 if 1, 2 if 2, etc.
//   // If a game over, then the value corresponds to the "endCondition" values in "constants.go"
//   value: 0,
// }
func commandAction(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You cannot perform a game action in a shared replay.")
		g.InvalidActionOccurred = true
		return
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not playing at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot send an action.")
		return
	}
	p := g.Players[playerIndex]

	if d.Type != ActionTypeEndGame {
		// Validate that it is this player's turn
		if g.ActivePlayerIndex != playerIndex {
			s.Warning("It is not your turn, so you cannot perform an action.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that the game is not paused
		if g.Paused {
			s.Warning("You cannot perform a game action when the game is paused.")
			g.InvalidActionOccurred = true
			return
		}

		// Validate that a player is not doing an illegal action for their character
		if characterValidateAction(s, d, g, p) {
			g.InvalidActionOccurred = true
			return
		}
		if characterValidateSecondAction(s, d, g, p) {
			g.InvalidActionOccurred = true
			return
		}
	}

	action(s, d, t, p)
}

func action(s *Session, d *CommandData, t *Table, p *GamePlayer) {
	// Local variables
	g := t.Game

	// Start the idle timeout
	// (but don't update the idle variable if we are ending the game)
	if d.Type != ActionTypeEndGame {
		go t.CheckIdle()
	}

	// Do different tasks depending on the action
	if actionFunction, ok := actionFunctions[d.Type]; ok {
		if !actionFunction(s, d, g, p) {
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
	if g.EndTurn != -1 &&
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
	np := g.Players[g.ActivePlayerIndex] // The next player
	nps := t.Players[np.Index].Session

	// Check for character-related softlocks
	// (we will set the strikes to 3 if there is a softlock)
	characterCheckSoftlock(g, np)

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
		logger.Info(t.GetName() + "It is now " + np.Name + "'s turn.")
	} else {
		g.End()
		return
	}

	// Send everyone new clock values
	t.NotifyTime()

	if t.Options.Timed && !t.ExtraOptions.NoWriteToDatabase {
		// Start the function that will check to see if the current player has run out of time
		// (since it just got to be their turn)
		go g.CheckTimer(g.Turn, g.PauseCount, np)

		// If the next player queued a pause command, then pause the game
		if np.RequestedPause {
			np.RequestedPause = false
			commandPause(nps, &CommandData{ // Manual invocation
				TableID: t.ID,
				Setting: "pause",
				NoLock:  true,
			})
		}
	}
}

func commandActionPlay(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	// Validate "Detrimental Character Assignment" restrictions
	if characterCheckPlay(s, d, g, p) {
		g.InvalidActionOccurred = true
		return false
	}

	// Validate deck plays
	if g.Options.DeckPlays &&
		g.DeckIndex == len(g.Deck)-1 && // There is 1 card left in the deck
		d.Target == g.DeckIndex { // The target is the last card left in the deck

		p.PlayDeck()
		return true
	}

	// Validate that the card is in their hand
	if !p.InHand(d.Target) {
		s.Warning("You cannot play a card that is not in your hand.")
		g.InvalidActionOccurred = true
		return false
	}

	c := p.RemoveCard(d.Target)
	p.PlayCard(c)
	p.DrawCard()

	return true
}

func commandActionDiscard(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	// Local variables
	variant := variants[g.Options.VariantName]

	// Validate that the card is in their hand
	if !p.InHand(d.Target) {
		s.Warning("You cannot play a card that is not in your hand.")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate that the team is not at the maximum amount of clues
	if variant.AtMaxClueTokens(g.ClueTokens) {
		s.Warning("You cannot discard while the team has " + strconv.Itoa(MaxClueNum) + " clues.")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate "Detrimental Character Assignment" restrictions
	if characterCheckDiscard(s, g, p) {
		g.InvalidActionOccurred = true
		return false
	}

	g.ClueTokens++
	c := p.RemoveCard(d.Target)
	p.DiscardCard(c)
	p.DrawCard()

	return true
}

func commandActionClue(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	// Local variables
	variant := variants[g.Options.VariantName]

	// Validate that the target of the clue is sane
	if d.Target < 0 || d.Target > len(g.Players)-1 {
		s.Warning("That is an invalid clue target.")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate that the player is not giving a clue to themselves
	if g.ActivePlayerIndex == d.Target {
		s.Warning("You cannot give a clue to yourself.")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate that there are clues available to use
	if g.ClueTokens < variant.GetAdjustedClueTokens(1) {
		s.Warning("You need at least 1 clue token available in order to give a clue.")
		g.InvalidActionOccurred = true
		return false
	}

	// Convert the incoming data to a clue object
	clue := NewClue(d)

	// Validate the clue value
	if clue.Type == ClueTypeColor {
		if clue.Value < 0 || clue.Value > len(variant.ClueColors)-1 {
			s.Warning("You cannot give a color clue with a value of " +
				"\"" + strconv.Itoa(clue.Value) + "\".")
			g.InvalidActionOccurred = true
			return false
		}
	} else if clue.Type == ClueTypeRank {
		if !intInSlice(clue.Value, variant.ClueRanks) {
			s.Warning("You cannot give a rank clue with a value of " +
				"\"" + strconv.Itoa(clue.Value) + "\".")
			g.InvalidActionOccurred = true
			return false
		}
	} else {
		s.Warning("The clue type of " + strconv.Itoa(clue.Type) + " is invalid..")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate special variant restrictions
	if variant.IsAlternatingClues() && clue.Type == g.LastClueTypeGiven {
		s.Warning("You cannot give two clues of the same time in a row in this variant.")
		g.InvalidActionOccurred = true
		return false
	}

	// Validate "Detrimental Character Assignment" restrictions
	if characterValidateClue(s, d, g, p) {
		g.InvalidActionOccurred = true
		return false
	}

	// Validate that the clue touches at least one card
	p2 := g.Players[d.Target] // The target of the clue
	touchedAtLeastOneCard := false
	for _, c := range p2.Hand {
		// Prevent characters from cluing cards that they are not supposed to see
		if !characterSeesCard(g, p, p2, c.Order) {
			continue
		}

		if variantIsCardTouched(g.Options.VariantName, clue, c) {
			touchedAtLeastOneCard = true
			break
		}
	}
	if !touchedAtLeastOneCard &&
		// Make an exception if they have the optional setting for "Empty Clues" turned on
		!g.Options.EmptyClues &&
		// Make an exception for variants where color clues are always allowed
		(!variant.ColorCluesTouchNothing || clue.Type != ClueTypeColor) &&
		// Make an exception for variants where rank clues are always allowed
		(!variant.RankCluesTouchNothing || clue.Type != ClueTypeRank) {

		s.Warning("You cannot give a clue that touches 0 cards in the hand.")
		g.InvalidActionOccurred = true
		return false
	}

	p.GiveClue(d)

	return true
}

func commandActionEndGame(s *Session, d *CommandData, g *Game, p *GamePlayer) bool {
	// An "endGame" action is a special action type sent by the server to itself
	// The value will correspond to the end condition (see "endCondition" in "constants.go")
	// The target will correspond to the index of the player who ended the game

	// Validate the value
	if d.Value != EndConditionTimeout &&
		d.Value != EndConditionTerminated &&
		d.Value != EndConditionIdleTimeout {

		s.Warning("That is not a valid value for the end game action.")
		g.InvalidActionOccurred = true
		return false
	}

	// Mark that the game should be ended
	g.EndCondition = d.Value
	g.EndPlayer = d.Target

	// Insert an "end game" action
	var endGameAction *GameAction
	if g.EndCondition == EndConditionTimeout {
		endGameAction = &GameAction{
			Type:   ActionTypeEndGame,
			Target: g.EndPlayer,
			Value:  EndConditionTimeout,
		}
	} else if g.EndCondition == EndConditionTerminated {
		endGameAction = &GameAction{
			Type:   ActionTypeEndGame,
			Target: g.EndPlayer,
			Value:  EndConditionTerminated,
		}
	} else if g.EndCondition == EndConditionIdleTimeout {
		endGameAction = &GameAction{
			Type:   ActionTypeEndGame,
			Target: -1,
			Value:  EndConditionIdleTimeout,
		}
	}
	if endGameAction != nil {
		g.Actions2 = append(g.Actions2, endGameAction)
	}

	return true
}
