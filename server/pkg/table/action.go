package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

const (
	// This is used to indicate that it is the server itself performing an action.
	// It must be a negative value so that it does not overlap with valid player indexes.
	serverPlayerTargetIndex = -1
)

func (m *Manager) actionFuncMapInit() {
	m.actionFuncMap[constants.ActionTypePlay] = m.actionPlay
	m.actionFuncMap[constants.ActionTypeDiscard] = m.actionDiscard
	m.actionFuncMap[constants.ActionTypeColorClue] = m.actionClue
	m.actionFuncMap[constants.ActionTypeRankClue] = m.actionClue
	m.actionFuncMap[constants.ActionTypeEndGame] = m.actionEndGame
}

func (m *Manager) actionPlay(d *actionData) bool {
	// Local variables
	t := m.table
	g := t.Game
	i := t.getPlayerIndexFromID(d.userID)
	p := g.Players[i]

	// Validate "Detrimental Character Assignment" restrictions
	if !m.characterValidatePlay(d, p) {
		return false
	}

	// Validate deck plays
	if t.Options.DeckPlays &&
		g.DeckIndex == len(g.Deck)-1 && // There is 1 card left in the deck
		d.target == g.DeckIndex { // The target is the last card left in the deck

		p.playDeck()
		return true
	}

	// Validate that the card is in their hand
	if !p.inHand(d.target) {
		msg := "You cannot play a card that is not in your hand."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	c := p.removeCard(d.target)
	p.playCard(c)
	p.drawCard()

	return true
}

func (m *Manager) actionDiscard(d *actionData) bool {
	// Local variables
	t := m.table
	g := t.Game
	i := t.getPlayerIndexFromID(d.userID)
	p := g.Players[i]

	// Validate that the card is in their hand
	if !p.inHand(d.target) {
		msg := "You cannot discard a card that is not in your hand."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that the team is not at the maximum amount of clues
	if t.Variant.AtMaxClueTokens(g.ClueTokens) {
		msg := fmt.Sprintf("You cannot discard while the team has %v clues.", constants.MaxClueNum)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate "Detrimental Character Assignment" restrictions
	if !m.characterValidateDiscard(d, p) {
		return false
	}

	g.ClueTokens++
	c := p.removeCard(d.target)
	p.discardCard(c)
	p.drawCard()

	return true
}

func (m *Manager) actionClue(d *actionData) bool {
	// Local variables
	t := m.table
	g := t.Game
	i := t.getPlayerIndexFromID(d.userID)
	p := g.Players[i]

	// Validate that the target of the clue is sane
	if d.target < 0 || d.target > len(g.Players)-1 {
		msg := "That is an invalid clue target."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that the player is not giving a clue to themselves
	if g.ActivePlayerIndex == d.target {
		msg := "You cannot give a clue to yourself."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that there are clues available to use
	if g.ClueTokens < t.Variant.GetAdjustedClueTokens(1) {
		msg := "You need at least 1 clue token available in order to give a clue."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Convert the incoming data to a clue object
	clue := types.NewClue(d.actionType, d.value)

	// Validate the clue value
	if clue.Type == constants.ClueTypeColor {
		if clue.Value < 0 || clue.Value > len(t.Variant.ClueColors)-1 {
			msg := fmt.Sprintf("You cannot give a color clue with a value of: %v", clue.Value)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	} else if clue.Type == constants.ClueTypeRank {
		if !util.IntInSlice(clue.Value, t.Variant.ClueRanks) {
			msg := fmt.Sprintf("You cannot give a rank clue with a value of: %v", clue.Value)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	} else {
		msg := fmt.Sprintf("The clue type of %v is invalid.", clue.Type)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate special variant restrictions
	if t.Variant.IsAlternatingClues() && clue.Type == g.LastClueTypeGiven {
		msg := "You cannot give two clues of the same time in a row in this variant."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate "Detrimental Character Assignment" restrictions
	p2 := g.Players[d.target] // The target of the clue
	if !m.characterValidateClueGiver(d, p, p2) {
		return false
	}
	if !m.characterValidateClueReceiver(d, p2) {
		return false
	}

	// Validate that the clue touches at least one card
	touchedAtLeastOneCard := false
	for _, c := range p2.Hand {
		// Prevent characters from cluing cards that they are not supposed to see
		if !m.characterValidateSeesCard(p, p2, c.Order) {
			continue
		}

		if g.touchesCard(clue, c) {
			touchedAtLeastOneCard = true
			break
		}
	}
	if !touchedAtLeastOneCard &&
		// Make an exception if they have the optional setting for "Empty Clues" turned on
		!t.Options.EmptyClues &&
		// Make an exception for variants where color clues are always allowed
		(!t.Variant.ColorCluesTouchNothing || clue.Type != constants.ClueTypeColor) &&
		// Make an exception for variants where rank clues are always allowed
		(!t.Variant.RankCluesTouchNothing || clue.Type != constants.ClueTypeRank) {

		msg := "You cannot give a clue that touches 0 cards in the hand."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	p.giveClue(d.target, d.actionType, d.value)

	return true
}

func (m *Manager) actionEndGame(d *actionData) bool {
	// An "endGame" action is a special action type sent by the server to itself
	// The value will correspond to the end condition (see "endCondition" in "constants.go")
	// The target will correspond to the index of the player who ended the game

	// Local variables
	t := m.table
	g := t.Game

	// Validate the value
	endCondition := constants.EndCondition(d.value)
	if endCondition != constants.EndConditionTimeout &&
		endCondition != constants.EndConditionTerminated &&
		endCondition != constants.EndConditionIdleTimeout {

		msg := "That is not a valid value for the end game action."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Mark that the game should be ended
	g.EndCondition = endCondition
	g.EndPlayer = d.target

	// Insert an "end game" action
	var endGameAction *options.GameAction
	if g.EndCondition == constants.EndConditionTimeout {
		endGameAction = &options.GameAction{
			Type:   constants.ActionTypeEndGame,
			Target: g.EndPlayer,
			Value:  int(constants.EndConditionTimeout),
		}
	} else if g.EndCondition == constants.EndConditionTerminated {
		endGameAction = &options.GameAction{
			Type:   constants.ActionTypeEndGame,
			Target: g.EndPlayer,
			Value:  int(constants.EndConditionTerminated),
		}
	} else if g.EndCondition == constants.EndConditionIdleTimeout {
		endGameAction = &options.GameAction{
			Type:   constants.ActionTypeEndGame,
			Target: serverPlayerTargetIndex,
			Value:  int(constants.EndConditionIdleTimeout),
		}
	}
	if endGameAction != nil {
		g.DBActions = append(g.DBActions, endGameAction)
	}

	return true
}
