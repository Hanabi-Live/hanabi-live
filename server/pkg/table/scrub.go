package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

// checkScrub removes some information from the action to prevent players having more knowledge
// than they should have, if necessary (e.g. when a card is drawn to a player's hand).
func (m *Manager) checkScrub(t *table, action interface{}, userID int) interface{} {
	actionCardIdentity, ok := action.(types.ActionCardIdentity)
	if ok && actionCardIdentity.Type == "cardIdentity" {
		return m.scrubCardIdentity(t, actionCardIdentity, userID)
	}

	actionDiscard, ok := action.(types.ActionDiscard)
	if ok && actionDiscard.Type == "discard" {
		return m.scrubDiscard(t, actionDiscard, userID)
	}

	actionDraw, ok := action.(types.ActionDraw)
	if ok && actionDraw.Type == "draw" {
		return m.scrubDraw(t, actionDraw, userID)
	}

	actionPlay, ok := action.(types.ActionPlay)
	if ok && actionPlay.Type == "play" {
		return m.scrubPlay(t, actionPlay, userID)
	}

	return action
}

// scrubCardIdentity removes some information from a card identity action so that we do not reveal
// the identity of sliding cards to the players who are holding those cards.
// This only applies in special circumstances (e.g. Detrimental Characters).
func (m *Manager) scrubCardIdentity(
	t *table,
	actionCardIdentity types.ActionCardIdentity,
	userID int,
) types.ActionCardIdentity {
	// Local variables
	p := m.getEquivalentPlayer(userID)

	if p == nil {
		// Spectators get to see the identities of all cards
		return actionCardIdentity
	}

	if actionCardIdentity.PlayerIndex == p.Index { // They are holding the card
		scrubbedAction := actionCardIdentity
		scrubbedAction.Rank = -1
		scrubbedAction.SuitIndex = -1

		return scrubbedAction
	}

	return actionCardIdentity
}

// scrubDiscard removes some information from discarded cards so that we do not reveal the identity
// of discarded cards to anybody.
// This only applies in special circumstances (e.g. some specific variants).
func (m *Manager) scrubDiscard(t *table, actionDiscard types.ActionDiscard, userID int) types.ActionDiscard {
	// Local variables
	p := m.getEquivalentPlayer(userID)

	if p == nil {
		// Spectators get to see the identities of discarded cards
		return actionDiscard
	}

	if t.Variant.IsThrowItInAHole() && actionDiscard.Failed {
		// For the purposes of hiding information, failed discards are equivalent to plays
		scrubbedAction := actionDiscard
		scrubbedAction.Rank = -1
		scrubbedAction.SuitIndex = -1

		return scrubbedAction
	}

	return actionDiscard
}

// scrubDraw removes some information from a draw so that we do not reveal the identity of drawn
// cards to the players drawing those cards.
// This applies in all situations.
func (m *Manager) scrubDraw(t *table, actionDraw types.ActionDraw, userID int) types.ActionDraw {
	// Local variables
	p := m.getEquivalentPlayer(userID)

	if p == nil {
		// Spectators get to see the identities of all drawn cards
		return actionDraw
	}

	if actionDraw.PlayerIndex == p.Index || // They are drawing the card
		// They are playing a special character that should not be able to see the card
		m.characterHideDrawnCard(p, actionDraw) {

		scrubbedAction := actionDraw
		scrubbedAction.Rank = -1
		scrubbedAction.SuitIndex = -1

		return scrubbedAction
	}

	return actionDraw
}

// scrubPlay removes some information from played cards so that we do not reveal the identity of
// played cards to anybody.
// This only applies in special circumstances (e.g. some specific variants).
func (m *Manager) scrubPlay(t *table, actionPlay types.ActionPlay, userID int) types.ActionPlay {
	// Local variables
	p := m.getEquivalentPlayer(userID)

	if p == nil {
		// Spectators get to see the identities of played cards
		return actionPlay
	}

	if t.Variant.IsThrowItInAHole() {
		scrubbedAction := actionPlay
		scrubbedAction.Rank = -1
		scrubbedAction.SuitIndex = -1

		return scrubbedAction
	}

	return actionPlay
}

func (m *Manager) getEquivalentPlayer(userID int) *gamePlayer {
	// Local variables
	t := m.table
	g := t.Game
	i := t.getPlayerIndexFromID(userID)
	j := t.getSpectatorIndexFromID(userID)

	if i > -1 {
		// The action is going to be sent to one of the active players
		return g.Players[i]
	} else if j > -1 && t.spectators[j].shadowingPlayerIndex != -1 {
		// The action is going to be sent to a spectator that is shadowing one of the active players
		return g.Players[t.spectators[j].shadowingPlayerIndex]
	}

	// The action is going to be sent to a spectator that can see every hand
	return nil
}
